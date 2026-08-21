/* Banco de pruebas del núcleo económico — Pieza 1.
 * Sin emulador (no hay Java): se inyecta un Firestore de mentira.
 * Ejecutar:  node test-economia.js
 */
'use strict';

const ECO = require('./economia.js');

// ── mini framework ───────────────────────────────────────────────────────────
let ok = 0, fail = 0;
const fallos = [];
function t(nombre, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nombre); }
  catch (e) { fail++; fallos.push(nombre + ' → ' + e.message); console.log('  ✗ ' + nombre + '\n      ' + e.message); }
}
async function ta(nombre, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + nombre); }
  catch (e) { fail++; fallos.push(nombre + ' → ' + e.message); console.log('  ✗ ' + nombre + '\n      ' + e.message); }
}
function eq(a, b, msg) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg || '') + ' esperado ' + sb + ', obtenido ' + sa);
}
function assert(c, msg) { if (!c) throw new Error(msg || 'assert falló'); }

// ── Firestore de mentira ─────────────────────────────────────────────────────
// Regla clave que replica: dentro de runTransaction, TODAS las lecturas deben
// preceder a TODAS las escrituras. El doble lanza si se viola — es la única
// forma de verificar eso sin emulador.
function makeDb(seed) {
  const store  = new Map(Object.entries(seed || {}));
  const writes = [];

  function snapDe(path) {
    const has = store.has(path);
    return { exists: has, data: function () { return store.get(path); } };
  }
  function refDe(path) {
    return {
      path: path,
      collection: function (n) { return collDe(path + '/' + n); },
      get: async function () { return snapDe(path); }
    };
  }
  function collDe(base) {
    return {
      doc: function (id) { return refDe(base + '/' + id); },
      get: async function () {
        const docs = [];
        store.forEach(function (v, k) {
          const resto = k.startsWith(base + '/') ? k.slice(base.length + 1) : null;
          if (resto && resto.indexOf('/') === -1) docs.push({ id: resto, data: function () { return v; } });
        });
        return { docs: docs };
      }
    };
  }
  function aplicar(w) {
    const prev = store.get(w.path);
    store.set(w.path, (w.merge && prev) ? Object.assign({}, prev, w.data) : w.data);
    writes.push(w.path);
  }

  // Versión por documento: sirve para detectar contención real (si un doc leído
  // por la transacción cambió antes de que ésta commitee, se aborta y reintenta,
  // igual que hace Firestore).
  const version = new Map();
  function verDe(p) { return version.get(p) || 0; }
  function bump(p) { version.set(p, verDe(p) + 1); }

  const db = {
    collection: function (n) { return collDe(n); },
    _store: store,
    _writes: writes,
    _get: function (p) { return store.get(p); },
    _pausa: null,          // gancho para intercalar otra transacción a mitad
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

        // Punto de intercalado: deja correr a la transacción rival ANTES del
        // commit, que es exactamente cuando ocurre una carrera de doble tap.
        if (db._pausa) { const p = db._pausa; db._pausa = null; await p(); }

        // ¿Cambió algo de lo leído? → ABORTED, se reintenta el callback entero.
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

const PRICE_IDS = { mensual: 'price_MENSUAL', anual: 'price_ANUAL' };
const AHORA     = new Date('2026-07-31T12:00:00Z');
const AHORA_MS  = AHORA.getTime();
const DIA       = 24 * 60 * 60 * 1000;

function subStripe(over) {
  return Object.assign({
    id: 'sub_1', object: 'subscription', status: 'active',
    customer: 'cus_1', cancel_at_period_end: false,
    current_period_end: Math.floor((AHORA_MS + 20 * DIA) / 1000),
    metadata: { uid: 'u1', tipo: 'suscripcion' },
    items: { data: [{ price: { id: 'price_MENSUAL' } }] }
  }, over || {});
}
function evento(type, obj, id) {
  return { id: id || 'evt_1', type: type, data: { object: obj } };
}

// ═════════════════════════════════════════════════════════════════════════════
(async function () {

console.log('\n── A · resolverTipo (bifurcación antes del switch) ──');
t('checkout mode:subscription → suscripcion', function () {
  eq(ECO.resolverTipo(evento('checkout.session.completed',
     { object: 'checkout.session', mode: 'subscription', metadata: { uid: 'u1' } })), 'suscripcion');
});
t('checkout mode:payment SIN metadata → creditos (no toca el plan)', function () {
  eq(ECO.resolverTipo(evento('checkout.session.completed',
     { object: 'checkout.session', mode: 'payment', metadata: { uid: 'u1' } })), 'creditos');
});
t('checkout mode:payment CON metadata.tipo:creditos → creditos', function () {
  eq(ECO.resolverTipo(evento('checkout.session.completed',
     { object: 'checkout.session', mode: 'payment', metadata: { uid: 'u1', tipo: 'creditos' } })), 'creditos');
});
t('customer.subscription.updated → suscripcion', function () {
  eq(ECO.resolverTipo(evento('customer.subscription.updated', subStripe())), 'suscripcion');
});

console.log('\n── B · resolverUid (las 3 vías) ──');
await ta('vía 1 · metadata directo', async function () {
  const r = await ECO.resolverUid(evento('customer.subscription.updated', subStripe()), { db: makeDb({}) });
  eq(r, { uid: 'u1', via: 'metadata' });
});
await ta('vía 2 · invoice → retrieve de la suscripción', async function () {
  const stripe = { subscriptions: { retrieve: async function (id) {
    eq(id, 'sub_9'); return { metadata: { uid: 'u-invoice' } };
  } } };
  const inv = { object: 'invoice', subscription: 'sub_9', customer: 'cus_9', metadata: {} };
  const r = await ECO.resolverUid(evento('invoice.paid', inv), { db: makeDb({}), stripe: stripe });
  eq(r, { uid: 'u-invoice', via: 'subscription' });
});
await ta('vía 3 · mapa stripeCustomers/{customerId}', async function () {
  const db = makeDb({ 'stripeCustomers/cus_7': { uid: 'u-mapa' } });
  const s  = subStripe({ metadata: {}, customer: 'cus_7' });
  const r  = await ECO.resolverUid(evento('customer.subscription.updated', s), { db: db });
  eq(r, { uid: 'u-mapa', via: 'mapa' });
});
await ta('ninguna vía → uid null (evento se ignora, no explota)', async function () {
  const s = subStripe({ metadata: {}, customer: 'cus_desconocido' });
  const r = await ECO.resolverUid(evento('customer.subscription.updated', s), { db: makeDb({}) });
  eq(r.uid, null);
});

console.log('\n── C · planEspejo (NO degradar developer/beta) ──');
t('free + vigente → premium',        function () { eq(ECO.planEspejo('free', true), 'premium'); });
t('premium + no vigente → free',     function () { eq(ECO.planEspejo('premium', false), 'free'); });
t('pro + vigente → premium',         function () { eq(ECO.planEspejo('pro', true), 'premium'); });
t('sin plan + vigente → premium',    function () { eq(ECO.planEspejo(undefined, true), 'premium'); });
t('developer + no vigente → null (INTOCABLE)', function () { eq(ECO.planEspejo('developer', false), null); });
t('developer + vigente → null (INTOCABLE)',    function () { eq(ECO.planEspejo('developer', true), null); });
t('beta + no vigente → null (INTOCABLE)',      function () { eq(ECO.planEspejo('beta', false), null); });
t('DEVELOPER en mayúsculas → null',            function () { eq(ECO.planEspejo('DEVELOPER', false), null); });

console.log('\n── D · leerPeriodEnd (lectura defensiva) ──');
t('API 2023-10-16 · en la suscripción', function () {
  eq(ECO.leerPeriodEnd({ current_period_end: 1800000000 }).getTime(), 1800000000000);
});
t('API 2025+ · fallback al item', function () {
  eq(ECO.leerPeriodEnd({ items: { data: [{ current_period_end: 1800000000 }] } }).getTime(), 1800000000000);
});
t('sin ninguno → null', function () { eq(ECO.leerPeriodEnd({ items: { data: [{}] } }), null); });

console.log('\n── E · suscripcionVigente (gracia de 3 días) ──');
t('active, vence en 20 días → vigente', function () {
  assert(ECO.suscripcionVigente({ status: 'active', currentPeriodEnd: new Date(AHORA_MS + 20 * DIA) }, AHORA_MS));
});
t('active, venció ayer → vigente (dentro de gracia)', function () {
  assert(ECO.suscripcionVigente({ status: 'active', currentPeriodEnd: new Date(AHORA_MS - 1 * DIA) }, AHORA_MS));
});
t('active, venció hace 2.9 días → vigente (borde de gracia)', function () {
  assert(ECO.suscripcionVigente({ status: 'active', currentPeriodEnd: new Date(AHORA_MS - 2.9 * DIA) }, AHORA_MS));
});
t('active, venció hace 4 días → NO vigente (caducidad de respaldo)', function () {
  assert(!ECO.suscripcionVigente({ status: 'active', currentPeriodEnd: new Date(AHORA_MS - 4 * DIA) }, AHORA_MS));
});
t('canceled aunque no haya vencido → NO vigente', function () {
  assert(!ECO.suscripcionVigente({ status: 'canceled', currentPeriodEnd: new Date(AHORA_MS + 20 * DIA) }, AHORA_MS));
});
t('trialing → vigente', function () {
  assert(ECO.suscripcionVigente({ status: 'trialing', currentPeriodEnd: new Date(AHORA_MS + 5 * DIA) }, AHORA_MS));
});
t('status none → NO vigente', function () {
  assert(!ECO.suscripcionVigente({ status: 'none', currentPeriodEnd: null }, AHORA_MS));
});
t('active con Timestamp de Firestore (.toDate) → vigente', function () {
  const ts = { toDate: function () { return new Date(AHORA_MS + 10 * DIA); } };
  assert(ECO.suscripcionVigente({ status: 'active', currentPeriodEnd: ts }, AHORA_MS));
});

console.log('\n── F · ensureBilling (regalo idempotente) ──');
await ta('1ª llamada: crea billing/state con 5 créditos + ledger/welcome', async function () {
  const db = makeDb({});
  await db.runTransaction(async function (tx) { await ECO.ensureBilling(db, 'u1', tx, AHORA); });
  const b = db._get('users/u1/billing/state');
  eq(b.credits, 5, 'créditos:');
  eq(b.schemaVersion, 1, 'schemaVersion:');
  eq(b.activeRentals, {}, 'activeRentals:');
  eq(b.grants, { welcome: true }, 'grants:');
  eq(b.lifetime, { granted: 5, purchased: 0, spent: 0 }, 'lifetime:');
  eq(b.sub.status, 'none', 'sub.status:');
  const w = db._get('users/u1/ledger/welcome');
  eq(w.delta, 5); eq(w.balanceAfter, 5); eq(w.type, 'grant');
});
await ta('2ª llamada: NO vuelve a regalar (5, no 10)', async function () {
  const db = makeDb({});
  await db.runTransaction(async function (tx) { await ECO.ensureBilling(db, 'u1', tx, AHORA); });
  await db.runTransaction(async function (tx) { await ECO.ensureBilling(db, 'u1', tx, AHORA); });
  eq(db._get('users/u1/billing/state').credits, 5, 'créditos tras 2 llamadas:');
  const welcomes = db._writes.filter(function (p) { return p === 'users/u1/ledger/welcome'; });
  eq(welcomes.length, 1, 'asientos welcome escritos:');
});
await ta('diez llamadas seguidas = un solo regalo', async function () {
  const db = makeDb({});
  for (let i = 0; i < 10; i++) {
    await db.runTransaction(async function (tx) { await ECO.ensureBilling(db, 'u1', tx, AHORA); });
  }
  eq(db._get('users/u1/billing/state').credits, 5);
  eq(db._writes.filter(function (p) { return p === 'users/u1/ledger/welcome'; }).length, 1);
});
await ta('usuario con saldo gastado NO recibe otro regalo', async function () {
  const db = makeDb({ 'users/u1/billing/state': { credits: 2, schemaVersion: 1, activeRentals: {} } });
  await db.runTransaction(async function (tx) { await ECO.ensureBilling(db, 'u1', tx, AHORA); });
  eq(db._get('users/u1/billing/state').credits, 2, 'saldo intacto:');
  assert(!db._get('users/u1/ledger/welcome'), 'no debió crear welcome');
});

console.log('\n── G · procesarEvento · idempotencia ──');
await ta('mismo event.id dos veces = un solo efecto', async function () {
  const db = makeDb({ 'users/u1': { plan: 'free' } });
  const ev = evento('customer.subscription.updated', subStripe(), 'evt_repetido');
  const r1 = await ECO.procesarEvento(ev, { db: db, PRICE_IDS: PRICE_IDS, ahora: AHORA });
  const n1 = db._writes.length;
  const r2 = await ECO.procesarEvento(ev, { db: db, PRICE_IDS: PRICE_IDS, ahora: AHORA });
  eq(r1.accion, 'procesado', '1ª pasada:');
  eq(r2.accion, 'duplicado', '2ª pasada:');
  eq(db._writes.length, n1, 'escrituras tras el reintento:');
});
await ta('el reintento NO vuelve a regalar créditos', async function () {
  const db = makeDb({ 'users/u1': { plan: 'free' } });
  const ev = evento('customer.subscription.updated', subStripe(), 'evt_r2');
  await ECO.procesarEvento(ev, { db: db, PRICE_IDS: PRICE_IDS, ahora: AHORA });
  await ECO.procesarEvento(ev, { db: db, PRICE_IDS: PRICE_IDS, ahora: AHORA });
  await ECO.procesarEvento(ev, { db: db, PRICE_IDS: PRICE_IDS, ahora: AHORA });
  eq(db._get('users/u1/billing/state').credits, 5, 'créditos tras 3 entregas:');
});

console.log('\n── H · procesarEvento · suscripción y espejo ──');
await ta('subscription.updated escribe currentPeriodEnd y espeja premium', async function () {
  const db = makeDb({ 'users/u1': { plan: 'free' } });
  const r  = await ECO.procesarEvento(
    evento('customer.subscription.updated', subStripe(), 'evt_A'),
    { db: db, PRICE_IDS: PRICE_IDS, ahora: AHORA });
  const b = db._get('users/u1/billing/state');
  eq(r.vigente, true, 'vigente:');
  eq(b.sub.status, 'active', 'status:');
  eq(b.sub.plan, 'mensual', 'plan del price:');
  eq(b.sub.cancelAtPeriodEnd, false, 'cancelAtPeriodEnd:');
  eq(b.sub.stripeSubscriptionId, 'sub_1');
  assert(b.sub.currentPeriodEnd instanceof Date, 'currentPeriodEnd debe ser fecha');
  eq(b.sub.currentPeriodEnd.getTime(), AHORA_MS + 20 * DIA, 'currentPeriodEnd:');
  eq(db._get('users/u1').plan, 'premium', 'espejo:');
  eq(db._get('users/u1').stripeCustomerId, 'cus_1', 'customerId guardado:');
  eq(db._get('stripeCustomers/cus_1').uid, 'u1', 'mapa customer→uid:');
});
await ta('price anual → sub.plan = anual', async function () {
  const db = makeDb({ 'users/u1': { plan: 'free' } });
  const s  = subStripe({ items: { data: [{ price: { id: 'price_ANUAL' } }] } });
  await ECO.procesarEvento(evento('customer.subscription.updated', s, 'evt_An'),
    { db: db, PRICE_IDS: PRICE_IDS, ahora: AHORA });
  eq(db._get('users/u1/billing/state').sub.plan, 'anual');
});
await ta('subscription.deleted → espejo free', async function () {
  const db = makeDb({ 'users/u1': { plan: 'premium' } });
  const s  = subStripe({ status: 'canceled' });
  const r  = await ECO.procesarEvento(evento('customer.subscription.deleted', s, 'evt_B'),
    { db: db, PRICE_IDS: PRICE_IDS, ahora: AHORA });
  eq(r.vigente, false);
  eq(db._get('users/u1').plan, 'free', 'espejo:');
  eq(db._get('users/u1/billing/state').sub.status, 'canceled');
});
await ta('DEVELOPER que cancela NO es degradado', async function () {
  const db = makeDb({ 'users/u1': { plan: 'developer' } });
  const s  = subStripe({ status: 'canceled' });
  const r  = await ECO.procesarEvento(evento('customer.subscription.deleted', s, 'evt_C'),
    { db: db, PRICE_IDS: PRICE_IDS, ahora: AHORA });
  eq(r.espejo, null, 'espejo:');
  eq(db._get('users/u1').plan, 'developer', 'plan tras cancelar:');
  eq(db._get('users/u1/billing/state').sub.status, 'canceled', 'la verdad SÍ se registra:');
});
await ta('BETA que cancela NO es degradado', async function () {
  const db = makeDb({ 'users/u1': { plan: 'beta' } });
  const s  = subStripe({ status: 'canceled' });
  await ECO.procesarEvento(evento('customer.subscription.deleted', s, 'evt_D'),
    { db: db, PRICE_IDS: PRICE_IDS, ahora: AHORA });
  eq(db._get('users/u1').plan, 'beta');
});
await ta('suscripción vencida hace 10 días → espejo free', async function () {
  const db = makeDb({ 'users/u1': { plan: 'premium' } });
  const s  = subStripe({ current_period_end: Math.floor((AHORA_MS - 10 * DIA) / 1000) });
  await ECO.procesarEvento(evento('customer.subscription.updated', s, 'evt_E'),
    { db: db, PRICE_IDS: PRICE_IDS, ahora: AHORA });
  eq(db._get('users/u1').plan, 'free', 'caducidad de respaldo:');
});
await ta('usuario nuevo por webhook recibe su regalo de bienvenida', async function () {
  const db = makeDb({});
  await ECO.procesarEvento(evento('customer.subscription.updated', subStripe(), 'evt_F'),
    { db: db, PRICE_IDS: PRICE_IDS, ahora: AHORA });
  eq(db._get('users/u1/billing/state').credits, 5);
});

console.log('\n── I · procesarEvento · créditos y ruido ──');
await ta('checkout mode:payment (créditos) NO toca el plan', async function () {
  const db = makeDb({ 'users/u1': { plan: 'free' } });
  const r  = await ECO.procesarEvento(evento('checkout.session.completed',
    { object: 'checkout.session', mode: 'payment', customer: 'cus_1',
      metadata: { uid: 'u1', tipo: 'creditos' } }, 'evt_G'),
    { db: db, PRICE_IDS: PRICE_IDS, ahora: AHORA });
  // Desde la Pieza 5 este evento YA NO se aparca: entra en la rama de créditos.
  // Esta sesión no trae payment_status:'paid', así que la rama se detiene sola
  // ('pago-pendiente'). Lo que se verifica aquí sigue siendo lo esencial y no ha
  // cambiado: un pago único NO toca el plan y no escribe nada por su cuenta.
  // El acreditado completo se ejercita en test-pieza5.js.
  eq(r.accion, 'pago-pendiente');
  eq(db._get('users/u1').plan, 'free', 'plan intacto:');
  eq(db._writes.length, 0, 'escrituras:');
});
await ta('checkout mode:subscription solo enlaza, no marca premium', async function () {
  const db = makeDb({ 'users/u1': { plan: 'free' } });
  const r  = await ECO.procesarEvento(evento('checkout.session.completed',
    { object: 'checkout.session', mode: 'subscription', customer: 'cus_5',
      metadata: { uid: 'u1', tipo: 'suscripcion' } }, 'evt_H'),
    { db: db, PRICE_IDS: PRICE_IDS, ahora: AHORA });
  eq(r.efecto, 'enlace');
  eq(db._get('users/u1').plan, 'free', 'plan aún free (lo pone subscription.created):');
  eq(db._get('users/u1').stripeCustomerId, 'cus_5');
  eq(db._get('stripeCustomers/cus_5').uid, 'u1');
});
await ta('invoice.paid ya no decide nada (se ignora)', async function () {
  const db = makeDb({ 'users/u1': { plan: 'free' } });
  const r  = await ECO.procesarEvento(evento('invoice.paid',
    { object: 'invoice', customer: 'cus_1', metadata: { uid: 'u1' } }, 'evt_I'),
    { db: db, PRICE_IDS: PRICE_IDS, ahora: AHORA });
  eq(r.accion, 'ignorado');
  eq(db._writes.length, 0);
});
await ta('evento sin uid resoluble no explota', async function () {
  const db = makeDb({});
  const r  = await ECO.procesarEvento(evento('customer.subscription.updated',
    subStripe({ metadata: {}, customer: 'cus_fantasma' }), 'evt_J'),
    { db: db, PRICE_IDS: PRICE_IDS, ahora: AHORA });
  eq(r.accion, 'sin-uid');
});

console.log('\n── J · podarRentas / rentaVigente (shape de la Pieza 2) ──');
t('poda las expiradas, conserva las vigentes', function () {
  const rentas = {
    '010101a': new Date(AHORA_MS + 3 * DIA),
    '010107c': new Date(AHORA_MS - 1 * DIA),
    '010119a': new Date(AHORA_MS + 6 * DIA)
  };
  eq(Object.keys(ECO.podarRentas(rentas, AHORA_MS)).sort(), ['010101a', '010119a']);
});
t('rentaVigente respeta el vencimiento', function () {
  const r = { '010101a': new Date(AHORA_MS + DIA), '010102b': new Date(AHORA_MS - DIA) };
  assert(ECO.rentaVigente(r, '010101a', AHORA_MS),  'la vigente debe pasar');
  assert(!ECO.rentaVigente(r, '010102b', AHORA_MS), 'la expirada no debe pasar');
  assert(!ECO.rentaVigente(r, '999999z', AHORA_MS), 'la inexistente no debe pasar');
});
t('finDeRenta = +7 días exactos', function () {
  eq(ECO.finDeRenta(AHORA).getTime(), AHORA_MS + 7 * DIA);
});

console.log('\n── K · cobertura: trigger onCreate + vía perezosa, sin backfill ──');
// Las dos vías son la misma llamada (ensureBilling); lo que se verifica aquí es
// que su COMBINACIÓN cubre a todos sin regalar dos veces.
const altaTrigger = async function (db, uid) {      // crearCuentaEconomica
  await db.runTransaction(async function (tx) { await ECO.ensureBilling(db, uid, tx, AHORA); });
};
const viaPerezosa = async function (db, uid) {      // estadoCuenta / entrarPain
  await db.runTransaction(async function (tx) { await ECO.ensureBilling(db, uid, tx, AHORA); });
};

await ta('usuario NUEVO: trigger siembra, la vía perezosa no duplica', async function () {
  const db = makeDb({});
  await altaTrigger(db, 'nuevo');                   // se registra
  await viaPerezosa(db, 'nuevo');                   // más tarde, primer gasto
  await viaPerezosa(db, 'nuevo');                   // y otro
  eq(db._get('users/nuevo/billing/state').credits, 5, 'créditos:');
  eq(db._writes.filter(function (p) { return p === 'users/nuevo/ledger/welcome'; }).length, 1,
     'asientos welcome:');
});
await ta('beta tester PREEXISTENTE (nunca pasó por el trigger) recibe sus 5', async function () {
  // Su doc de usuario ya existe desde hace meses; billing no.
  const db = makeDb({ 'users/beta1': { plan: 'beta', totalMeters: 48200 } });
  assert(!db._get('users/beta1/billing/state'), 'no debía tener billing todavía');
  await viaPerezosa(db, 'beta1');
  eq(db._get('users/beta1/billing/state').credits, 5, 'créditos del preexistente:');
  eq(db._get('users/beta1/ledger/welcome').delta, 5);
  eq(db._get('users/beta1').plan, 'beta', 'su plan no se toca:');
});
await ta('si el trigger FALLA, la vía perezosa lo cubre igual', async function () {
  const db = makeDb({});
  // (el trigger no corre: se simula omitiéndolo)
  await viaPerezosa(db, 'huerfano');
  eq(db._get('users/huerfano/billing/state').credits, 5);
});
await ta('el trigger no depende de que exista users/{uid}', async function () {
  const db = makeDb({});
  await altaTrigger(db, 'sinpadre');
  assert(!db._get('users/sinpadre'), 'el doc padre no existe…');
  eq(db._get('users/sinpadre/billing/state').credits, 5, '…y aun así hay billing:');
});
await ta('preexistente que YA gastó no recibe un segundo regalo', async function () {
  const db = makeDb({
    'users/beta2/billing/state': { credits: 1, schemaVersion: 1, activeRentals: {},
                                   lifetime: { granted: 5, purchased: 0, spent: 4 } }
  });
  await viaPerezosa(db, 'beta2');
  eq(db._get('users/beta2/billing/state').credits, 1, 'saldo intacto:');
  assert(!db._get('users/beta2/ledger/welcome'), 'no debió crear welcome');
});

console.log('\n── L · entrarPain · cascada de bypass (no gasta) ──');
const PAIN = '010101a';
function dbCon(over) {
  const seed = {};
  seed['users/u1'] = Object.assign({ plan: 'free' }, (over && over.user) || {});
  if (!over || over.billing !== false) {
    seed['users/u1/billing/state'] = Object.assign({
      schemaVersion: 1, credits: 5, activeRentals: {},
      sub: { status: 'none', currentPeriodEnd: null },
      lifetime: { granted: 5, purchased: 0, spent: 0 }
    }, (over && over.billing) || {});
  }
  return makeDb(seed);
}
async function entrar(db, args) {
  return ECO.entrarPain('u1', Object.assign({ painId: PAIN }, args || {}),
                        { db: db, ahora: AHORA });
}

await ta('developer → via sub, sin gastar, 0 escrituras', async function () {
  const db = dbCon({ user: { plan: 'developer' } });
  const r = await entrar(db, { confirmado: true });
  eq(r.via, 'sub'); eq(r.cobrado, false); eq(r.motivo, 'developer');
  eq(db._get('users/u1/billing/state').credits, 5, 'saldo:');
  eq(db._writes.length, 0, 'escrituras:');
});
await ta('beta VIGENTE → via sub, sin gastar', async function () {
  const db = dbCon({ user: { plan: 'beta', betaExpiresAt: new Date(AHORA_MS + 30 * DIA) } });
  const r = await entrar(db, { confirmado: true });
  eq(r.via, 'sub'); eq(r.motivo, 'beta');
  eq(db._get('users/u1/billing/state').credits, 5);
});
await ta('beta VENCIDA → NO hay bypass, cobra', async function () {
  const db = dbCon({ user: { plan: 'beta', betaExpiresAt: new Date(AHORA_MS - 1 * DIA) } });
  const r = await entrar(db, { confirmado: true });
  eq(r.via, 'credito'); eq(r.cobrado, true); eq(r.saldo, 4);
});
await ta('suscripción VIGENTE → via sub, sin gastar', async function () {
  const db = dbCon({ billing: { sub: { status: 'active', currentPeriodEnd: new Date(AHORA_MS + 10 * DIA) } } });
  const r = await entrar(db, { confirmado: true });
  eq(r.via, 'sub'); eq(r.motivo, 'suscripcion');
  eq(db._get('users/u1/billing/state').credits, 5);
});
await ta('suscripción EN GRACIA (venció ayer) → via sub', async function () {
  const db = dbCon({ billing: { sub: { status: 'active', currentPeriodEnd: new Date(AHORA_MS - 1 * DIA) } } });
  const r = await entrar(db, { confirmado: true });
  eq(r.via, 'sub');
});
await ta('suscripción VENCIDA (hace 5 días) → cobra', async function () {
  const db = dbCon({ billing: { sub: { status: 'active', currentPeriodEnd: new Date(AHORA_MS - 5 * DIA) } } });
  const r = await entrar(db, { confirmado: true });
  eq(r.via, 'credito'); eq(r.saldo, 4);
});
await ta('espejo plan:premium → via sub (concesión administrada)', async function () {
  const db = dbCon({ user: { plan: 'premium' } });
  const r = await entrar(db, { confirmado: true });
  eq(r.via, 'sub'); eq(r.motivo, 'plan-premium');
  eq(db._get('users/u1/billing/state').credits, 5);
});

console.log('\n── M · entrarPain · rentas ──');
await ta('renta ACTIVA → via renta, sin gastar, 0 escrituras', async function () {
  const rentas = {}; rentas[PAIN] = new Date(AHORA_MS + 3 * DIA);
  const db = dbCon({ billing: { activeRentals: rentas } });
  const r = await entrar(db, { confirmado: true });
  eq(r.via, 'renta'); eq(r.cobrado, false);
  eq(r.expiresAt, AHORA_MS + 3 * DIA, 'expiresAt:');
  eq(db._get('users/u1/billing/state').credits, 5, 'saldo:');
  eq(db._writes.length, 0, 'escrituras:');
});
await ta('renta EXPIRADA → vuelve a cobrar', async function () {
  const rentas = {}; rentas[PAIN] = new Date(AHORA_MS - 1 * DIA);
  const db = dbCon({ billing: { activeRentals: rentas } });
  const r = await entrar(db, { confirmado: true });
  eq(r.via, 'credito'); eq(r.saldo, 4);
});
await ta('renta de OTRO pain no da acceso a éste', async function () {
  const db = dbCon({ billing: { activeRentals: { '010107c': new Date(AHORA_MS + 3 * DIA) } } });
  const r = await entrar(db, { confirmado: true });
  eq(r.via, 'credito');
});

console.log('\n── N · entrarPain · el cobro ──');
await ta('descuenta exactamente 1, renta +7d, asiento, lifetime.spent +1', async function () {
  const db = dbCon();
  const r = await entrar(db, { confirmado: true, origen: 'sanar' });
  eq(r.ok, true); eq(r.via, 'credito'); eq(r.cobrado, true); eq(r.saldo, 4);
  const b = db._get('users/u1/billing/state');
  eq(b.credits, 4, 'saldo:');
  eq(ECO.msDe(b.activeRentals[PAIN]), AHORA_MS + 7 * DIA, 'renta +7d:');
  eq(b.lifetime.spent, 1, 'lifetime.spent:');
  const rent = db._get('users/u1/rentals/' + PAIN);
  eq(rent.painId, PAIN); eq(rent.mid, '010101'); eq(rent.via, 'credito'); eq(rent.origen, 'sanar');
  assert(!('renewals' in rent), 'renewals NO debe existir (lo cuenta el ledger)');
  const led = db._get('users/u1/ledger/spend_' + PAIN + '_' + AHORA_MS);
  eq(led.type, 'spend'); eq(led.delta, -1); eq(led.balanceAfter, 4); eq(led.ref, PAIN);
});
await ta('al cobrar PODA las rentas vencidas', async function () {
  const db = dbCon({ billing: { activeRentals: {
    '010107c': new Date(AHORA_MS - 2 * DIA),      // vencida → fuera
    '010119a': new Date(AHORA_MS + 4 * DIA)       // vigente → se queda
  } } });
  await entrar(db, { confirmado: true });
  const rr = db._get('users/u1/billing/state').activeRentals;
  eq(Object.keys(rr).sort(), ['010101a', '010119a']);
});
await ta('sin saldo → sin-saldo, 0 escrituras', async function () {
  const db = dbCon({ billing: { credits: 0 } });
  const r = await entrar(db, { confirmado: true });
  eq(r, { ok: false, motivo: 'sin-saldo', saldo: 0 });
  eq(db._writes.length, 0, 'escrituras:');
});
await ta('preexistente SIN billing que paga: recibe 5, gasta 1, queda 4', async function () {
  const db = makeDb({ 'users/beta9': { plan: 'free', totalMeters: 30000 } });
  const r = await ECO.entrarPain('beta9', { painId: PAIN, confirmado: true },
                                 { db: db, ahora: AHORA });
  eq(r.via, 'credito'); eq(r.saldo, 4, 'saldo final:');
  const b = db._get('users/beta9/billing/state');
  eq(b.credits, 4, 'créditos:');
  eq(b.lifetime.granted, 5, 'regalo registrado:');
  eq(b.lifetime.spent, 1, 'gasto registrado:');
  eq(db._get('users/beta9/ledger/welcome').delta, 5, 'asiento de regalo:');
});

console.log('\n── O · el paso 6: sin confirmado NUNCA se escribe ──');
await ta('con saldo y sin confirmado → requiere-confirmacion, 0 escrituras', async function () {
  const db = dbCon();
  const r = await entrar(db, {});
  eq(r, { ok: false, motivo: 'requiere-confirmacion', saldo: 5 });
  eq(db._writes.length, 0, 'escrituras:');
  eq(db._get('users/u1/billing/state').credits, 5, 'saldo intacto:');
});
await ta('confirmado:false explícito tampoco cobra', async function () {
  const db = dbCon();
  await entrar(db, { confirmado: false });
  eq(db._get('users/u1/billing/state').credits, 5);
});
await ta('confirmado:"true" (string) NO cuela — solo el booleano', async function () {
  const db = dbCon();
  const r = await entrar(db, { confirmado: 'true' });
  eq(r.motivo, 'requiere-confirmacion');
  eq(db._writes.length, 0);
});
await ta('renta expirada + caché rancio: pregunta antes de cobrar', async function () {
  // El caso que motivó el paso 6: el cliente creía tener renta, ya venció.
  const rentas = {}; rentas[PAIN] = new Date(AHORA_MS - 60 * 1000);
  const db = dbCon({ billing: { activeRentals: rentas } });
  const r = await entrar(db, {});                 // el cliente no confirmó nada
  eq(r.motivo, 'requiere-confirmacion', 'debe PREGUNTAR, no cobrar:');
  eq(db._writes.length, 0);
});

console.log('\n── P · doble tap concurrente (contención real) ──');
await ta('dos llamadas simultáneas → UN solo cobro; la 2ª ve la renta', async function () {
  const db = dbCon();
  let r2 = null;
  // La 1ª transacción se pausa justo antes de commitear y deja correr entera a
  // la 2ª. Cuando la 1ª despierta, su lectura de billing/state ya está sucia →
  // aborta y reintenta. (Aquí la "2ª" es la que gana la carrera.)
  db._pausa = async function () {
    r2 = await ECO.entrarPain('u1', { painId: PAIN, confirmado: true },
                              { db: db, ahora: AHORA });
  };
  const r1 = await entrar(db, { confirmado: true });

  assert(db._reintentos > 0, 'debió haber al menos un reintento por contención');
  eq(r2.via, 'credito', 'la que ganó la carrera cobra:');
  eq(r2.saldo, 4);
  eq(r1.via, 'renta', 'la que reintentó ve la renta y NO cobra:');
  eq(r1.cobrado, false);
  eq(db._get('users/u1/billing/state').credits, 4, 'saldo final (un solo cargo):');
  eq(db._get('users/u1/billing/state').lifetime.spent, 1, 'lifetime.spent:');
});
await ta('tres taps seguidos → un cobro, dos rentas', async function () {
  const db = dbCon();
  const a = await entrar(db, { confirmado: true });
  const b = await entrar(db, { confirmado: true });
  const c = await entrar(db, { confirmado: true });
  eq([a.via, b.via, c.via], ['credito', 'renta', 'renta']);
  eq(db._get('users/u1/billing/state').credits, 4);
});

console.log('\n── Q · simular:"free" ──');
await ta('developer + simular:free → COBRA de verdad', async function () {
  const db = dbCon({ user: { plan: 'developer' } });
  const r = await entrar(db, { confirmado: true, simular: 'free' });
  eq(r.via, 'credito'); eq(r.saldo, 4); eq(r.simulando, true);
  eq(db._get('users/u1/ledger/spend_' + PAIN + '_' + AHORA_MS).meta.simulado, true);
});
await ta('developer + simular:free SIN confirmar → pregunta', async function () {
  const db = dbCon({ user: { plan: 'developer' } });
  const r = await entrar(db, { simular: 'free' });
  eq(r.motivo, 'requiere-confirmacion');
});
await ta('NO developer + simular:free → se IGNORA (premium sigue entrando gratis)', async function () {
  const db = dbCon({ user: { plan: 'premium' } });
  const r = await entrar(db, { confirmado: true, simular: 'free' });
  eq(r.via, 'sub', 'la simulación no debe aplicarse:');
  eq(db._get('users/u1/billing/state').credits, 5);
});
await ta('free + simular:free → sin efecto, cobra normal', async function () {
  const db = dbCon();
  const r = await entrar(db, { confirmado: true, simular: 'free' });
  eq(r.via, 'credito'); eq(r.simulando, false);
});

console.log('\n── R · validación del painId ──');
await ta('painId inválido → error pain-invalido, 0 escrituras', async function () {
  const casos = ['', '01010', '010101', 'abcdefg', '010101ab', '../../x', '010101A9', null];
  for (const mal of casos) {
    const db = dbCon();
    let lanzó = false;
    try { await ECO.entrarPain('u1', { painId: mal, confirmado: true }, { db: db, ahora: AHORA }); }
    catch (e) { lanzó = (e.code === 'pain-invalido'); }
    assert(lanzó, 'debió rechazar: ' + JSON.stringify(mal));
    eq(db._writes.length, 0, 'escrituras para ' + JSON.stringify(mal) + ':');
  }
});
await ta('painId en MAYÚSCULAS se normaliza', async function () {
  const db = dbCon();
  const r = await ECO.entrarPain('u1', { painId: '010101A', confirmado: true },
                                 { db: db, ahora: AHORA });
  eq(r.via, 'credito');
  eq(db._get('users/u1/rentals/010101a').painId, '010101a');
});
await ta('el mid se DERIVA: un mid del cliente se ignora', async function () {
  const db = dbCon();
  await ECO.entrarPain('u1', { painId: PAIN, mid: '079904', confirmado: true },
                       { db: db, ahora: AHORA });
  eq(db._get('users/u1/rentals/' + PAIN).mid, '010101', 'mid derivado del painId:');
});
await ta('origen fuera de la lista blanca → cae a "sanar"', async function () {
  const db = dbCon();
  await entrar(db, { confirmado: true, origen: '<script>' });
  eq(db._get('users/u1/rentals/' + PAIN).origen, 'sanar');
});
await ta('origen deeplink se conserva', async function () {
  const db = dbCon();
  await entrar(db, { confirmado: true, origen: 'deeplink' });
  eq(db._get('users/u1/rentals/' + PAIN).origen, 'deeplink');
});

console.log('\n═══════════════════════════════════════════');
console.log('  ' + ok + ' pasan · ' + fail + ' fallan');
if (fail) { console.log('\nFALLOS:'); fallos.forEach(function (f) { console.log('  · ' + f); }); }
console.log('═══════════════════════════════════════════\n');
process.exit(fail ? 1 : 0);

})();
