/* Banco de pruebas de la Pieza 5 — compra de paquetes de créditos.
 *
 * Sin emulador (no hay Java en el entorno): se inyecta un Firestore de mentira
 * que además LANZA si una lectura ocurre después de una escritura dentro de una
 * transacción — así se verifica esa regla de Firestore sin emulador.
 *
 * Ejecutar:  node test-pieza5.js
 */
'use strict';

const ECO = require('./economia.js');

// ── mini framework ───────────────────────────────────────────────────────────
let ok = 0, fail = 0;
const fallos = [];
async function ta(nombre, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + nombre); }
  catch (e) { fail++; fallos.push(nombre + ' → ' + e.message);
              console.log('  ✗ ' + nombre + '\n      ' + e.message); }
}
function eq(a, b, msg) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg || '') + ' esperado ' + sb + ', obtenido ' + sa);
}
function assert(c, msg) { if (!c) throw new Error(msg || 'assert falló'); }

// ── Firestore de mentira ─────────────────────────────────────────────────────
function makeDb(seed) {
  const store = new Map(Object.entries(seed || {}));

  function snapDe(path) {
    const has = store.has(path);
    return { exists: has, id: path.split('/').pop(), data: function () { return store.get(path); } };
  }
  function aplicar(w) {
    const prev = store.get(w.path);
    store.set(w.path, (w.merge && prev) ? Object.assign({}, prev, w.data) : w.data);
  }
  function refDe(path) {
    return {
      path: path,
      collection: function (n) { return collDe(path + '/' + n); },
      get: async function () { return snapDe(path); },
      // set fuera de transacción (stripeOrphans, registrarCheckout)
      set: async function (data, opts) {
        aplicar({ path: path, data: data, merge: !!(opts && opts.merge) });
      }
    };
  }
  function hijosDe(base) {
    const docs = [];
    store.forEach(function (v, k) {
      const resto = k.startsWith(base + '/') ? k.slice(base.length + 1) : null;
      if (resto && resto.indexOf('/') === -1) {
        docs.push({ id: resto, data: function () { return v; } });
      }
    });
    return docs;
  }
  function consulta(base, orden, tope) {
    return {
      orderBy: function (campo, dir) { return consulta(base, { campo, dir }, tope); },
      limit:   function (n) { return consulta(base, orden, n); },
      get: async function () {
        let docs = hijosDe(base);
        if (orden) {
          const s = (orden.dir === 'desc') ? -1 : 1;
          docs.sort(function (a, b) {
            const va = ECO.msDe(a.data()[orden.campo]) || 0;
            const vb = ECO.msDe(b.data()[orden.campo]) || 0;
            return (va - vb) * s;
          });
        }
        if (tope) docs = docs.slice(0, tope);
        return { docs: docs };
      }
    };
  }
  function collDe(base) {
    const c = consulta(base, null, 0);
    c.doc = function (id) { return refDe(base + '/' + id); };
    return c;
  }

  const version = new Map();
  function verDe(p) { return version.get(p) || 0; }
  function bump(p) { version.set(p, verDe(p) + 1); }

  const db = {
    collection: function (n) { return collDe(n); },
    _store: store,
    _get: function (p) { return store.get(p); },
    _pausa: null,
    _reintentos: 0,

    runTransaction: async function (fn) {
      for (let intento = 0; intento < 6; intento++) {
        let yaEscribio = false;
        const pend = [];
        const leidos = new Map();
        const tx = {
          get: async function (r) {
            if (yaEscribio) {
              throw new Error('VIOLACIÓN: lectura después de escritura en la transacción (' + r.path + ')');
            }
            leidos.set(r.path, verDe(r.path));
            return snapDe(r.path);
          },
          set: function (r, data, opts) {
            yaEscribio = true;
            pend.push({ path: r.path, data: data, merge: !!(opts && opts.merge) });
          }
        };
        await fn(tx);

        if (db._pausa) { const p = db._pausa; db._pausa = null; await p(); }

        let chocó = false;
        leidos.forEach(function (v, p) { if (verDe(p) !== v) chocó = true; });
        if (chocó) { db._reintentos++; continue; }

        pend.forEach(function (w) { aplicar(w); bump(w.path); });
        return;
      }
      throw new Error('transacción abortada tras 6 intentos');
    }
  };
  return db;
}

// ── Stripe de mentira ────────────────────────────────────────────────────────
function makeStripe(sesiones) {
  const llamadas = [];
  return {
    _llamadas: llamadas,
    checkout: {
      sessions: {
        retrieve: async function (id) {
          llamadas.push(id);
          if (!sesiones[id]) { const e = new Error('No such checkout.session: ' + id); throw e; }
          return sesiones[id];
        }
      }
    }
  };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
const UID     = 'u_ana';
const AHORA   = new Date('2026-08-21T12:00:00Z');
const TTL     = 30;
const PRICE_IDS = { mensual: ['price_L_M', 'price_T_M'], anual: ['price_L_A', 'price_T_A'] };

function sesion(over) {
  return Object.assign({
    id:             'cs_test_ABC',
    object:         'checkout.session',
    mode:           'payment',
    payment_status: 'paid',
    amount_total:   10000,
    currency:       'mxn',
    payment_intent: 'pi_123',
    client_reference_id: UID,
    metadata: { uid: UID, tipo: 'creditos', paquete: 'p15', creditos: '15', modo: 'test' }
  }, over || {});
}
function evento(ses, over) {
  return Object.assign({
    id:   'evt_1',
    type: 'checkout.session.completed',
    data: { object: ses }
  }, over || {});
}
function deps(db, extra) {
  return Object.assign({ db: db, ahora: AHORA, ttlDias: TTL, PRICE_IDS: PRICE_IDS }, extra || {});
}

const P = {
  billing:  'users/' + UID + '/billing/state',
  user:     'users/' + UID,
  asiento:  function (sid) { return 'users/' + UID + '/ledger/purchase_' + sid; },
  checkout: function (sid) { return 'users/' + UID + '/checkouts/' + sid; },
  evt:      function (id)  { return 'stripeEvents/' + id; },
  orphan:   function (sid) { return 'stripeOrphans/' + sid; }
};

// Usuario que ya tiene cuenta económica, con 0 créditos (el caso del muro).
function seedConCuenta() {
  return {
    'users/u_ana': { plan: 'free' },
    'users/u_ana/billing/state': {
      schemaVersion: 1, credits: 0, activeRentals: {},
      sub: { status: 'none', plan: null, currentPeriodEnd: null,
             cancelAtPeriodEnd: false, stripeSubscriptionId: null, updatedAt: AHORA },
      grants: { welcome: true },
      lifetime: { granted: 5, purchased: 0, spent: 5 },
      createdAt: AHORA, updatedAt: AHORA
    }
  };
}

// ═════════════════════════════════════════════════════════════════════════════
(async function main() {

console.log('\n── 1 · paramsCheckoutCreditos (el precio nunca pasa por el cliente)');

await ta('no lleva NINGÚN importe: solo el price_id', async () => {
  const p = ECO.paramsCheckoutCreditos({
    uid: UID, email: 'a@b.c', paquete: 'p15', priceId: 'price_X',
    painId: '010101a', retorno: 'sanar', modo: 'test'
  });
  const txt = JSON.stringify(p);
  assert(txt.indexOf('10000') === -1, 'el importe NO debe viajar en los params');
  assert(txt.indexOf('amount') === -1, 'no debe haber ningún campo de monto');
  eq(p.line_items, [{ price: 'price_X', quantity: 1 }]);
  eq(p.mode, 'payment', 'pago único, no suscripción:');
});

await ta('metadata lleva uid, tipo creditos y la CLAVE del paquete', async () => {
  const p = ECO.paramsCheckoutCreditos({ uid: UID, paquete: 'p25', priceId: 'price_X', modo: 'live' });
  eq(p.metadata.uid, UID);
  eq(p.metadata.tipo, 'creditos');
  eq(p.metadata.paquete, 'p25');
  eq(p.client_reference_id, UID, 'redundancia del uid:');
  eq(p.payment_intent_data.metadata.uid, UID, 'el cargo también lleva el uid:');
});

await ta('success_url lleva la plantilla del session id y el pain', async () => {
  const p = ECO.paramsCheckoutCreditos({
    uid: UID, paquete: 'p5', priceId: 'price_X', painId: '010203b', retorno: 'sanar' });
  assert(p.success_url.indexOf('sanar.html?compra=ok&sid={CHECKOUT_SESSION_ID}') > 0, p.success_url);
  assert(p.success_url.indexOf('&pain=010203b') > 0, p.success_url);
  assert(p.cancel_url.indexOf('compra=cancel') > 0, p.cancel_url);
});

await ta('retorno fuera de la lista blanca → index (no hay redirect abierto)', async () => {
  const p = ECO.paramsCheckoutCreditos({
    uid: UID, paquete: 'p5', priceId: 'price_X', retorno: 'https://malo.example/rob' });
  assert(p.success_url.indexOf('https://cruzando.app/') === 0, p.success_url);
  assert(p.success_url.indexOf('malo.example') === -1, 'jamás debe aparecer el dominio del cliente');
});

await ta('painId con formato inválido se descarta (no entra en la URL)', async () => {
  const p = ECO.paramsCheckoutCreditos({
    uid: UID, paquete: 'p5', priceId: 'price_X', painId: '"><script>x', retorno: 'sanar' });
  assert(p.success_url.indexOf('script') === -1, p.success_url);
  assert(!p.metadata.painId, 'no debe guardarse un painId inválido');
});

await ta('paquete inventado → lanza antes de crear nada', async () => {
  let lanzo = false;
  try { ECO.paramsCheckoutCreditos({ uid: UID, paquete: 'p9999', priceId: 'price_X' }); }
  catch (e) { lanzo = (e.code === 'paquete-invalido'); }
  assert(lanzo, 'debía lanzar paquete-invalido');
});

await ta('reutiliza el customer si existe; si no, el email', async () => {
  const a = ECO.paramsCheckoutCreditos({ uid: UID, paquete: 'p5', priceId: 'px',
                                         customerId: 'cus_1', email: 'a@b.c' });
  eq(a.customer, 'cus_1');
  assert(!a.customer_email, 'con customer no debe ir customer_email');
  const b = ECO.paramsCheckoutCreditos({ uid: UID, paquete: 'p5', priceId: 'px', email: 'a@b.c' });
  eq(b.customer_email, 'a@b.c');
});

console.log('\n── 2 · acreditarCompra (el núcleo)');

await ta('acredita 15 créditos, lifetime.purchased y el asiento del ledger', async () => {
  const db = makeDb(seedConCuenta());
  const r  = await ECO.acreditarCompra(sesion(), deps(db, { eventId: 'evt_1' }));
  eq(r.accion, 'acreditado');
  eq(r.creditos, 15);
  eq(r.saldo, 15);
  const b = db._get(P.billing);
  eq(b.credits, 15, 'saldo:');
  eq(b.lifetime.purchased, 15, 'lifetime.purchased:');
  eq(b.lifetime.spent, 5, 'lo gastado no se toca:');
  const a = db._get(P.asiento('cs_test_ABC'));
  eq(a.type, 'purchase'); eq(a.delta, 15); eq(a.balanceAfter, 15);
  eq(a.meta.paquete, 'p15'); eq(a.meta.via, 'webhook');
  assert(db._get(P.evt('evt_1')), 'debe quedar el recibo de idempotencia');
  assert(db._get(P.evt('evt_1')).expiresAt instanceof Date, 'el recibo necesita expiresAt para el TTL');
});

await ta('usuario sin cuenta: ensureBilling siembra el regalo Y suma lo comprado', async () => {
  const db = makeDb({ 'users/u_ana': { plan: 'free' } });
  const r  = await ECO.acreditarCompra(sesion(), deps(db, { eventId: 'evt_n' }));
  eq(r.saldo, 20, '5 de regalo + 15 comprados:');
  eq(db._get(P.billing).lifetime.granted, 5);
  eq(db._get(P.billing).lifetime.purchased, 15);
});

await ta('la cantidad sale de la TABLA, no de metadata.creditos', async () => {
  const db = makeDb(seedConCuenta());
  const s  = sesion({ metadata: { uid: UID, tipo: 'creditos', paquete: 'p15',
                                  creditos: '9999', modo: 'test' } });
  const r = await ECO.acreditarCompra(s, deps(db, { eventId: 'evt_x' }));
  eq(r.creditos, 15, 'un metadata mentiroso no acredita de más:');
  eq(db._get(P.billing).credits, 15);
});

await ta('sesión no pagada → no acredita nada', async () => {
  const db = makeDb(seedConCuenta());
  const r  = await ECO.acreditarCompra(sesion({ payment_status: 'unpaid' }), deps(db, { eventId: 'e' }));
  eq(r.accion, 'no-pagada');
  eq(db._get(P.billing).credits, 0);
  assert(!db._get(P.asiento('cs_test_ABC')), 'no debe haber asiento');
});

await ta('cierra el rastro del checkout (estado: acreditada)', async () => {
  const seed = seedConCuenta();
  seed[P.checkout('cs_test_ABC')] = { sid: 'cs_test_ABC', tipo: 'creditos', estado: 'creada', at: AHORA };
  const db = makeDb(seed);
  await ECO.acreditarCompra(sesion(), deps(db, { eventId: 'evt_1' }));
  eq(db._get(P.checkout('cs_test_ABC')).estado, 'acreditada');
});

console.log('\n── 3 · Idempotencia — un pago, un acreditado');

await ta('el MISMO evento reintentado por Stripe no acredita dos veces', async () => {
  const db = makeDb(seedConCuenta());
  await ECO.acreditarCompra(sesion(), deps(db, { eventId: 'evt_1' }));
  const r2 = await ECO.acreditarCompra(sesion(), deps(db, { eventId: 'evt_1' }));
  eq(r2.accion, 'duplicado');
  eq(db._get(P.billing).credits, 15, 'el saldo NO se mueve:');
  eq(db._get(P.billing).lifetime.purchased, 15);
});

await ta('DOS eventos distintos del MISMO pago (completed + async) → un acreditado', async () => {
  const db = makeDb(seedConCuenta());
  await ECO.acreditarEvento(evento(sesion(), { id: 'evt_A' }), deps(db));
  const r2 = await ECO.acreditarEvento(
    evento(sesion(), { id: 'evt_B', type: 'checkout.session.async_payment_succeeded' }), deps(db));
  eq(r2.accion, 'ya-acreditado', 'la llave del ledger lo detiene:');
  eq(db._get(P.billing).credits, 15);
  assert(db._get(P.evt('evt_B')), 'el segundo evento igual queda registrado como procesado');
});

await ta('★ reclamo PRIMERO y webhook DESPUÉS → un solo acreditado', async () => {
  const db = makeDb(seedConCuenta());
  const st = makeStripe({ 'cs_test_ABC': sesion() });

  const rec = await ECO.reclamarCompra(UID, { sessionId: 'cs_test_ABC' }, deps(db, { stripe: st }));
  eq(rec.ok, true);
  eq(rec.acreditados.length, 1);
  eq(db._get(P.billing).credits, 15);
  eq(db._get(P.asiento('cs_test_ABC')).meta.via, 'reclamo');

  const wh = await ECO.acreditarEvento(evento(sesion(), { id: 'evt_tarde' }), deps(db));
  eq(wh.accion, 'ya-acreditado');
  eq(db._get(P.billing).credits, 15, 'el webhook tardío NO duplica:');
  eq(db._get(P.billing).lifetime.purchased, 15);
});

await ta('★ webhook PRIMERO y reclamo DESPUÉS → un solo acreditado', async () => {
  const db = makeDb(seedConCuenta());
  const st = makeStripe({ 'cs_test_ABC': sesion() });

  await ECO.acreditarEvento(evento(sesion(), { id: 'evt_1' }), deps(db));
  eq(db._get(P.billing).credits, 15);

  const rec = await ECO.reclamarCompra(UID, { sessionId: 'cs_test_ABC' }, deps(db, { stripe: st }));
  eq(rec.ok, false, 'no acredita nada nuevo:');
  eq(rec.motivo, 'ya-acreditado');
  eq(db._get(P.billing).credits, 15, 'el saldo NO se mueve:');
  eq(db._get(P.billing).lifetime.purchased, 15);
});

await ta('★ tres intentos mezclados (webhook, reclamo, reintento) → 15 créditos, no 45', async () => {
  const db = makeDb(seedConCuenta());
  const st = makeStripe({ 'cs_test_ABC': sesion() });
  await ECO.acreditarEvento(evento(sesion(), { id: 'evt_1' }), deps(db));
  await ECO.reclamarCompra(UID, { sessionId: 'cs_test_ABC' }, deps(db, { stripe: st }));
  await ECO.acreditarEvento(evento(sesion(), { id: 'evt_1' }), deps(db));
  await ECO.reclamarCompra(UID, { sessionId: 'cs_test_ABC' }, deps(db, { stripe: st }));
  eq(db._get(P.billing).credits, 15);
  eq(db._get(P.billing).lifetime.purchased, 15);
});

await ta('dos compras DISTINTAS sí acreditan las dos', async () => {
  const db = makeDb(seedConCuenta());
  await ECO.acreditarEvento(evento(sesion({ id: 'cs_test_1' }), { id: 'e1' }), deps(db));
  await ECO.acreditarEvento(evento(sesion({ id: 'cs_test_2' }), { id: 'e2' }), deps(db));
  eq(db._get(P.billing).credits, 30, 'pagó dos veces, recibe dos veces:');
});

console.log('\n── 4 · Bordes: un pago nunca se queda sin rastro');

await ta('paquete desconocido pero importe reconocible → acredita + alerta', async () => {
  const db = makeDb(seedConCuenta());
  const s  = sesion({ metadata: { uid: UID, tipo: 'creditos', paquete: 'pXX' }, amount_total: 15000 });
  const r  = await ECO.acreditarCompra(s, deps(db, { eventId: 'e' }));
  eq(r.accion, 'acreditado');
  eq(r.creditos, 25, 'rescatado por el importe de $150:');
  eq(db._get(P.asiento('cs_test_ABC')).meta.alerta, 'paquete-desconocido-rescatado-por-monto');
});

await ta('importe que no cuadra con el paquete → SE ACREDITA IGUAL y alerta', async () => {
  const db = makeDb(seedConCuenta());
  const r  = await ECO.acreditarCompra(sesion({ amount_total: 9500 }), deps(db, { eventId: 'e' }));
  eq(r.accion, 'acreditado');
  eq(r.creditos, 15, 'el usuario pagó: no se le niegan los créditos');
  eq(db._get(P.asiento('cs_test_ABC')).meta.alerta, 'monto-inesperado');
});

await ta('ni paquete ni importe reconocibles → huérfana registrada, sin acreditar', async () => {
  const db = makeDb(seedConCuenta());
  const s  = sesion({ metadata: { uid: UID, tipo: 'creditos' }, amount_total: 777 });
  const r  = await ECO.acreditarCompra(s, deps(db, { eventId: 'e' }));
  eq(r.accion, 'huerfana');
  eq(db._get(P.billing).credits, 0);
  const o = db._get(P.orphan('cs_test_ABC'));
  assert(o, 'debe quedar el registro para revisión a mano');
  eq(o.motivo, 'paquete-irreconocible');
  eq(o.amountTotal, 777, 'con el importe, para poder resolverlo a mano:');
});

await ta('sin uid → huérfana, no lanza (reintentar no arreglaría nada)', async () => {
  const db = makeDb(seedConCuenta());
  const s  = sesion({ metadata: { tipo: 'creditos', paquete: 'p15' }, client_reference_id: null });
  const r  = await ECO.acreditarCompra(s, deps(db, { eventId: 'e' }));
  eq(r.accion, 'huerfana');
  eq(db._get(P.orphan('cs_test_ABC')).motivo, 'sin-uid');
});

await ta('client_reference_id rescata el uid si falta en metadata', async () => {
  const db = makeDb(seedConCuenta());
  const s  = sesion({ metadata: { tipo: 'creditos', paquete: 'p15' } });   // sin uid
  const r  = await ECO.acreditarCompra(s, deps(db, { eventId: 'e' }));
  eq(r.accion, 'acreditado');
  eq(db._get(P.billing).credits, 15);
});

await ta('checkout expirado o pago fallido → ignorado, sin efecto', async () => {
  const db = makeDb(seedConCuenta());
  for (const t of ['checkout.session.expired', 'checkout.session.async_payment_failed']) {
    const r = await ECO.acreditarEvento(evento(sesion(), { id: 'e_' + t, type: t }), deps(db));
    eq(r.accion, 'ignorado', t + ':');
  }
  eq(db._get(P.billing).credits, 0);
});

await ta('checkout completado pero sin pagar (OXXO) → espera, no acredita', async () => {
  const db = makeDb(seedConCuenta());
  const r  = await ECO.acreditarEvento(
    evento(sesion({ payment_status: 'unpaid' }), { id: 'e' }), deps(db));
  eq(r.accion, 'pago-pendiente');
  eq(db._get(P.billing).credits, 0);
});

console.log('\n── 5 · reclamarCompra (la red)');

await ta('rechaza la sesión de OTRO usuario aunque se conozca el id', async () => {
  const db = makeDb(seedConCuenta());
  const st = makeStripe({ 'cs_test_ajena': sesion({ id: 'cs_test_ajena',
                            metadata: { uid: 'u_otro', tipo: 'creditos', paquete: 'p25' },
                            client_reference_id: 'u_otro' }) });
  const r = await ECO.reclamarCompra(UID, { sessionId: 'cs_test_ajena' }, deps(db, { stripe: st }));
  eq(r.ok, false);
  eq(r.motivo, 'ajena');
  eq(db._get(P.billing).credits, 0, 'no se acredita nada a quien no pagó');
});

await ta('sesión no pagada → motivo no-pagada, sin tocar el saldo', async () => {
  const db = makeDb(seedConCuenta());
  const st = makeStripe({ 'cs_test_ABC': sesion({ payment_status: 'unpaid' }) });
  const r  = await ECO.reclamarCompra(UID, { sessionId: 'cs_test_ABC' }, deps(db, { stripe: st }));
  eq(r.ok, false); eq(r.motivo, 'no-pagada');
  eq(db._get(P.billing).credits, 0);
});

await ta('sesión inexistente en Stripe → no-encontrada, sin romperse', async () => {
  const db = makeDb(seedConCuenta());
  const st = makeStripe({});
  const r  = await ECO.reclamarCompra(UID, { sessionId: 'cs_test_nope' }, deps(db, { stripe: st }));
  eq(r.ok, false); eq(r.motivo, 'no-encontrada');
});

await ta('una sesión de SUSCRIPCIÓN no se acredita como créditos', async () => {
  const db = makeDb(seedConCuenta());
  const st = makeStripe({ 'cs_test_sub': sesion({ id: 'cs_test_sub', mode: 'subscription',
                            metadata: { uid: UID, tipo: 'suscripcion' } }) });
  const r = await ECO.reclamarCompra(UID, { sessionId: 'cs_test_sub' }, deps(db, { stripe: st }));
  eq(r.ok, false); eq(r.motivo, 'no-es-creditos');
  eq(db._get(P.billing).credits, 0);
});

await ta('sin sessionId: busca en los checkouts del usuario y acredita el pendiente', async () => {
  const seed = seedConCuenta();
  seed[P.checkout('cs_test_vieja')] = { sid: 'cs_test_vieja', tipo: 'creditos',
                                        estado: 'acreditada', at: new Date(AHORA - 60000) };
  seed[P.checkout('cs_test_ABC')]   = { sid: 'cs_test_ABC', tipo: 'creditos',
                                        estado: 'creada', at: AHORA };
  const db = makeDb(seed);
  const st = makeStripe({ 'cs_test_ABC': sesion() });
  const r  = await ECO.reclamarCompra(UID, {}, deps(db, { stripe: st }));
  eq(r.ok, true);
  eq(r.acreditados.length, 1);
  eq(db._get(P.billing).credits, 15);
  assert(st._llamadas.indexOf('cs_test_vieja') === -1,
         'no debe consultar a Stripe una compra ya acreditada');
});

await ta('sin sessionId y sin checkouts → sin-compras, sin llamar a Stripe', async () => {
  const db = makeDb(seedConCuenta());
  const st = makeStripe({});
  const r  = await ECO.reclamarCompra(UID, {}, deps(db, { stripe: st }));
  eq(r.ok, false); eq(r.motivo, 'sin-compras');
  eq(st._llamadas.length, 0);
});

await ta('descarta las intenciones de compra de hace más de 7 días', async () => {
  const seed = seedConCuenta();
  seed[P.checkout('cs_test_ABC')] = { sid: 'cs_test_ABC', tipo: 'creditos', estado: 'creada',
                                      at: new Date(AHORA.getTime() - 9 * 24 * 3600 * 1000) };
  const db = makeDb(seed);
  const st = makeStripe({ 'cs_test_ABC': sesion() });
  const r  = await ECO.reclamarCompra(UID, {}, deps(db, { stripe: st }));
  eq(r.motivo, 'sin-compras');
  eq(st._llamadas.length, 0);
});

console.log('\n── 6 · El webhook no confunde los dos caminos');

await ta('evento de créditos → acredita saldo y NO toca el plan', async () => {
  const db = makeDb(seedConCuenta());
  await ECO.procesarEvento(evento(sesion(), { id: 'evt_c' }), deps(db, { stripe: null }));
  eq(db._get(P.billing).credits, 15);
  eq(db._get(P.user).plan, 'free', 'un pago único JAMÁS regala premium:');
  assert(!db._get(P.billing).sub || db._get(P.billing).sub.status === 'none',
         'no debe tocarse la suscripción');
});

await ta('evento de suscripción → espejo premium y NO acredita créditos', async () => {
  const db  = makeDb(seedConCuenta());
  const sub = {
    id: 'sub_1', object: 'subscription', status: 'active',
    current_period_end: Math.floor(AHORA.getTime() / 1000) + 30 * 86400,
    cancel_at_period_end: false, customer: 'cus_1',
    items: { data: [{ price: { id: 'price_T_M' } }] },
    metadata: { uid: UID, tipo: 'suscripcion' }
  };
  await ECO.procesarEvento({ id: 'evt_s', type: 'customer.subscription.created',
                             data: { object: sub } }, deps(db, { stripe: null }));
  eq(db._get(P.user).plan, 'premium');
  eq(db._get(P.billing).sub.plan, 'mensual', 'el price de TEST resuelve al mismo plan:');
  eq(db._get(P.billing).credits, 0, 'una suscripción no regala créditos:');
});

await ta('resolverTipo clasifica bien las dos sesiones', async () => {
  eq(ECO.resolverTipo(evento(sesion())), 'creditos');
  eq(ECO.resolverTipo(evento(sesion({ mode: 'subscription',
                                      metadata: { uid: UID, tipo: 'suscripcion' } }))), 'suscripcion');
});

console.log('\n── 7 · Integración con la Pieza 2 (comprar y gastar)');

await ta('compra 15, entra a un pain: queda en 14 y la renta se escribe', async () => {
  const db = makeDb(seedConCuenta());
  await ECO.acreditarEvento(evento(sesion(), { id: 'evt_1' }), deps(db));
  eq(db._get(P.billing).credits, 15);

  const r = await ECO.entrarPain(UID, { painId: '010101a', confirmado: true },
                                 { db: db, ahora: AHORA });
  eq(r.ok, true); eq(r.via, 'credito'); eq(r.cobrado, true); eq(r.saldo, 14);
  const b = db._get(P.billing);
  eq(b.credits, 14);
  eq(b.lifetime.purchased, 15, 'lo comprado no se altera al gastar:');
  eq(b.lifetime.spent, 6);
});

await ta('sin saldo, compra, y entonces sí entra', async () => {
  const db = makeDb(seedConCuenta());
  const antes = await ECO.entrarPain(UID, { painId: '010101a', confirmado: true },
                                     { db: db, ahora: AHORA });
  eq(antes.ok, false); eq(antes.motivo, 'sin-saldo');
  await ECO.acreditarEvento(evento(sesion(), { id: 'evt_1' }), deps(db));
  const luego = await ECO.entrarPain(UID, { painId: '010101a', confirmado: true },
                                     { db: db, ahora: AHORA });
  eq(luego.ok, true); eq(luego.saldo, 14);
});

console.log('\n── 8 · Concurrencia y reglas de Firestore');

await ta('dos acreditados simultáneos del mismo pago → uno solo (contención)', async () => {
  const db = makeDb(seedConCuenta());
  db._pausa = async function () {
    await ECO.acreditarCompra(sesion(), deps(db, { eventId: 'evt_rival' }));
  };
  await ECO.acreditarCompra(sesion(), deps(db, { eventId: 'evt_1' }));
  eq(db._get(P.billing).credits, 15, 'una sola acreditación sobrevive:');
  assert(db._reintentos > 0, 'la transacción perdedora debió reintentar');
});

await ta('ninguna lectura ocurre después de una escritura (el doble lanzaría)', async () => {
  const db = makeDb({ 'users/u_ana': { plan: 'free' } });
  await ECO.acreditarCompra(sesion(), deps(db, { eventId: 'evt_1' }));   // con ensureBilling dentro
  eq(db._get(P.billing).credits, 20);
});

// ── resultado ────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(64));
console.log(fail === 0 ? '  TODO VERDE — ' + ok + ' pruebas' : '  ' + ok + ' ok · ' + fail + ' FALLOS');
if (fail) { fallos.forEach(f => console.log('   · ' + f)); process.exitCode = 1; }
console.log('─'.repeat(64) + '\n');

})();
