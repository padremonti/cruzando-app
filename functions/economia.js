/* CruzAndo — economia.js
 * Núcleo del sistema económico. Pieza 1: el cimiento server-only.
 *
 * Este módulo NO importa firebase-admin ni stripe: recibe `db` y `stripe` como
 * parámetros. Es a propósito — así la lógica de dinero se puede ejercitar con
 * dobles de prueba, sin emulador ni credenciales (no hay Java en el entorno de
 * desarrollo, así que el emulador de Firestore no es una opción).
 *
 * Toda marca de tiempo se recibe como `ahora` (un Date) desde el llamador, en
 * lugar de usar serverTimestamp(): los cálculos (expiresAt, vigencia) necesitan
 * el valor, no un centinela, y el Admin SDK convierte Date → Timestamp al
 * escribir. Una sola fuente de "ahora" por operación también hace las
 * transacciones deterministas.
 */
'use strict';

// ── Parámetros del modelo económico ──────────────────────────────────────────
const CREDITOS_REGALO = 5;    // regalo de bienvenida (1 crédito = 1 pain)
const VENTANA_DIAS    = 7;    // duración de la renta de un pain
const GRACIA_DIAS     = 3;    // colchón sobre currentPeriodEnd (retrasos de webhook)
const BETA_DIAS       = 90;   // duración del acceso por código beta
const SCHEMA_VERSION  = 1;

const DIA_MS = 24 * 60 * 60 * 1000;

// Planes que Stripe gobierna. 'developer' y 'beta' se administran a mano y el
// webhook NUNCA debe pisarlos (si no, la primera cancelación degrada a un
// developer que probó el checkout).
const PLANES_STRIPE = ['free', 'premium', 'pro'];

// ── msDe ─────────────────────────────────────────────────────────────────────
// Normaliza a milisegundos lo que Firestore/Stripe/JS pueden devolver como
// fecha. Mismo patrón que resolvePlan() en plan-utils.js.
function msDe(v) {
  if (v === null || v === undefined) return null;
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (typeof v.seconds === 'number')  return v.seconds * 1000;
  if (v instanceof Date)              return v.getTime();
  if (typeof v === 'number')          return v;
  const t = new Date(v).getTime();
  return isNaN(t) ? null : t;
}

// ── leerPeriodEnd ────────────────────────────────────────────────────────────
// Lectura defensiva del fin de periodo. En la API 2023-10-16 (la que fijamos)
// vive en la suscripción; a partir de 2025-03-31 Stripe lo movió al item. Si un
// `npm update` mueve la versión bajo nuestros pies, el fallback evita escribir
// `null` silenciosamente en la vigencia.
function leerPeriodEnd(s) {
  if (!s) return null;
  let secs = s.current_period_end;
  if (typeof secs !== 'number') {
    const item = s.items && s.items.data && s.items.data[0];
    secs = item && item.current_period_end;
  }
  return (typeof secs === 'number') ? new Date(secs * 1000) : null;
}

// ── planDesdePrice ───────────────────────────────────────────────────────────
function planDesdePrice(priceId, PRICE_IDS) {
  if (!priceId) return null;
  const claves = Object.keys(PRICE_IDS || {});
  for (let i = 0; i < claves.length; i++) {
    if (PRICE_IDS[claves[i]] === priceId) return claves[i];
  }
  return null;
}

// ── subDesdeStripe ───────────────────────────────────────────────────────────
// Traduce un objeto `subscription` de Stripe al shape de billing/state.sub.
function subDesdeStripe(s, PRICE_IDS, ahora) {
  const item    = s && s.items && s.items.data && s.items.data[0];
  const priceId = item && item.price && item.price.id;
  return {
    status:               (s && s.status) || 'none',
    plan:                 planDesdePrice(priceId, PRICE_IDS),
    currentPeriodEnd:     leerPeriodEnd(s),
    cancelAtPeriodEnd:    !!(s && s.cancel_at_period_end),
    stripeSubscriptionId: (s && s.id) || null,
    updatedAt:            ahora
  };
}

// ── suscripcionVigente ───────────────────────────────────────────────────────
// La pregunta que el sistema no podía responder antes: ¿está vigente AHORA?
//
// Nota sobre el caso `active` sin currentPeriodEnd: se considera vigente. Ese
// caso solo aparece si la forma de la API cambió y `leerPeriodEnd` no encontró
// el campo; en esa situación `status` sigue viniendo de Stripe y es fiable.
// Negarle el acceso a alguien que está pagando es peor error que el contrario.
// La caducidad de respaldo sigue operando siempre que el campo esté presente,
// que es el caso normal.
function suscripcionVigente(sub, ahoraMs) {
  if (!sub) return false;
  if (sub.status !== 'active' && sub.status !== 'trialing') return false;
  const fin = msDe(sub.currentPeriodEnd);
  if (fin === null) return true;
  return ahoraMs <= fin + GRACIA_DIAS * DIA_MS;
}

// ── planEspejo ───────────────────────────────────────────────────────────────
// Qué escribir en users/{uid}.plan (el espejo de compatibilidad que leen las 8
// páginas). Devuelve null = NO TOCAR: el plan actual no lo gobierna Stripe.
function planEspejo(planActual, vigente) {
  const p = String(planActual || 'free').toLowerCase().trim();
  if (PLANES_STRIPE.indexOf(p) === -1) return null;   // developer / beta → intocables
  return vigente ? 'premium' : 'free';
}

// ── resolverTipo ─────────────────────────────────────────────────────────────
// Bifurcación ANTES del switch: ¿este evento habla de suscripción o de créditos?
// Sin esto, un checkout de créditos (Pieza 5) emitiría checkout.session.completed
// y el webhook lo leería como suscripción → premium regalado.
function resolverTipo(event) {
  const obj  = (event && event.data && event.data.object) || {};
  const meta = obj.metadata || {};
  if (meta.tipo === 'creditos')    return 'creditos';
  if (meta.tipo === 'suscripcion') return 'suscripcion';
  if (obj.object === 'checkout.session') {
    if (obj.mode === 'subscription') return 'suscripcion';
    // Un pago único solo puede ser un paquete de créditos. Clasificarlo así es
    // la dirección segura: en la Pieza 1 'creditos' significa "reconocer y salir
    // sin tocar el plan".
    if (obj.mode === 'payment')      return 'creditos';
    return 'desconocido';
  }
  return 'suscripcion';   // customer.subscription.* e invoice.*
}

// ── resolverUid ──────────────────────────────────────────────────────────────
// Cascada de tres vías. Se ejecuta FUERA de la transacción (hace lecturas y
// posiblemente una llamada a la API de Stripe).
async function resolverUid(event, deps) {
  const obj    = (event && event.data && event.data.object) || {};
  const db     = deps && deps.db;
  const stripe = deps && deps.stripe;

  // 1 · metadata directo — checkout.session y customer.subscription.*
  if (obj.metadata && obj.metadata.uid) {
    return { uid: obj.metadata.uid, via: 'metadata' };
  }

  // 2 · invoice → recuperar la suscripción, que sí lleva el uid en metadata
  if (obj.object === 'invoice' && obj.subscription && stripe) {
    try {
      const subId = (typeof obj.subscription === 'string')
        ? obj.subscription : obj.subscription.id;
      const s = await stripe.subscriptions.retrieve(subId);
      if (s && s.metadata && s.metadata.uid) {
        return { uid: s.metadata.uid, via: 'subscription' };
      }
    } catch (e) {
      console.warn('[economia] retrieve subscription falló:', e && e.message);
    }
  }

  // 3 · mapa stripeCustomers/{customerId} — red de respaldo duradera para
  //     suscripciones creadas fuera de createCheckoutSession (Billing Portal,
  //     alta manual en el dashboard), que no llevan metadata.
  const customerId = (typeof obj.customer === 'string')
    ? obj.customer : (obj.customer && obj.customer.id);
  if (customerId && db) {
    try {
      const snap = await db.collection('stripeCustomers').doc(customerId).get();
      if (snap.exists && snap.data() && snap.data().uid) {
        return { uid: snap.data().uid, via: 'mapa' };
      }
    } catch (e) {
      console.warn('[economia] lectura de stripeCustomers falló:', e && e.message);
    }
  }

  return { uid: null, via: null };
}

// ── billingInicial ───────────────────────────────────────────────────────────
function billingInicial(ahora) {
  return {
    schemaVersion: SCHEMA_VERSION,
    credits:       CREDITOS_REGALO,
    activeRentals: {},
    sub: {
      status:               'none',
      plan:                 null,
      currentPeriodEnd:     null,
      cancelAtPeriodEnd:    false,
      stripeSubscriptionId: null,
      updatedAt:            ahora
    },
    grants:   { welcome: true },
    lifetime: { granted: CREDITOS_REGALO, purchased: 0, spent: 0 },
    createdAt: ahora,
    updatedAt: ahora
  };
}

// ── ensureBilling ────────────────────────────────────────────────────────────
// Crea billing/state la primera vez que el usuario toca el sistema económico y
// siembra el regalo de bienvenida. Perezoso a propósito: los usuarios que ya
// existen reciben su regalo al entrar, sin script de backfill.
//
// Idempotente por dos vías independientes: la existencia de billing/state y el
// id fijo del asiento ledger/welcome.
//
// Recibe `tx` para componerse dentro de la transacción de cobro de la Pieza 2.
// OJO al orden: hace una lectura y luego escribe, así que el llamador debe
// completar TODAS sus lecturas antes de invocarla (regla de Firestore: todas
// las lecturas preceden a todas las escrituras dentro de una transacción).
async function ensureBilling(db, uid, tx, ahora) {
  const userRef    = db.collection('users').doc(uid);
  const billingRef = userRef.collection('billing').doc('state');
  const snap       = await tx.get(billingRef);

  if (snap.exists) {
    return { ref: billingRef, data: snap.data(), creado: false };
  }

  const data = billingInicial(ahora);
  tx.set(billingRef, data);
  tx.set(userRef.collection('ledger').doc('welcome'), {
    type:         'grant',
    delta:        CREDITOS_REGALO,
    balanceAfter: CREDITOS_REGALO,
    ref:          'welcome',
    at:           ahora,
    meta:         null
  });
  return { ref: billingRef, data: data, creado: true };
}

// ── podarRentas ──────────────────────────────────────────────────────────────
// Descarta las rentas ya expiradas. Se aplica en CADA escritura del servidor
// para que activeRentals no crezca sin límite (cota natural: las rentas de los
// últimos 7 días). Lo usa el cobro de la Pieza 2.
function podarRentas(activeRentals, ahoraMs) {
  const out = {};
  const src = activeRentals || {};
  Object.keys(src).forEach(function (painId) {
    const ms = msDe(src[painId]);
    if (ms !== null && ms > ahoraMs) out[painId] = src[painId];
  });
  return out;
}

// ── rentaVigente ─────────────────────────────────────────────────────────────
function rentaVigente(activeRentals, painId, ahoraMs) {
  const ms = msDe((activeRentals || {})[painId]);
  return ms !== null && ms > ahoraMs;
}

// ── finDeRenta ───────────────────────────────────────────────────────────────
function finDeRenta(ahora) {
  return new Date(msDe(ahora) + VENTANA_DIAS * DIA_MS);
}

// ── motivoBypass ─────────────────────────────────────────────────────────────
// ¿Este usuario entra sin gastar crédito? Devuelve el motivo o null.
// Se evalúa en memoria, con los dos documentos ya leídos.
//
// Nota sobre 'premium'/'pro' del espejo: la fuente de verdad de una suscripción
// de Stripe es billing/state.sub, pero el campo plan es desde la Pieza 1
// server-only, así que un 'premium' ahí solo puede haberlo puesto el webhook o
// un administrador a mano. Se honra por lo mismo que se honran developer y
// beta: son concesiones administradas. Si no se honrara, un premium concedido a
// mano (sin pasar por Stripe) chocaría contra el muro de pago.
function motivoBypass(userData, billing, ahoraMs) {
  const plan = String((userData && userData.plan) || 'free').toLowerCase().trim();
  if (plan === 'developer') return 'developer';
  if (plan === 'beta') {
    const exp = msDe(userData && userData.betaExpiresAt);
    if (exp !== null && ahoraMs <= exp) return 'beta';
    // beta vencida → no hay bypass, sigue la cascada
  }
  if (plan === 'premium' || plan === 'pro') return 'plan-premium';
  if (suscripcionVigente(billing && billing.sub, ahoraMs)) return 'suscripcion';
  return null;
}

// ── entrarPain ───────────────────────────────────────────────────────────────
// El cobro. UNA transacción, todas las lecturas primero, atómica por definición.
//
// Cascada:
//   1 developer  2 beta vigente  3 premium/sub vigente (+3d gracia)  → via 'sub'
//   4 renta vigente de ESTE pain                                     → via 'renta'
//   5 saldo < 1                                    → {ok:false, sin-saldo}
//   6 falta confirmado:true                        → {ok:false, requiere-confirmacion}
//   7 cobrar: -1 crédito, renta +7d, asiento en el ledger            → via 'credito'
//
// Los caminos 1-6 NO escriben nada. Solo el 7 toca dinero.
//
// El paso 6 es el que hace imposible el cobro mudo: por muy rancio que esté el
// caché del cliente, el servidor no descuenta un crédito si nadie confirmó.
//
// Doble tap: dos llamadas concurrentes leen la misma versión de billing/state;
// Firestore deja commitear a una y aborta la otra por contención. Al reintentar,
// la segunda relee, ve la renta recién escrita, cae en el paso 4 y devuelve
// via:'renta' sin cobrar. Un solo cargo — la garantía viene de que la
// comprobación de renta vive DENTRO de la transacción, no del botón del cliente.
const PAIN_RE  = /^\d{6}[a-z]$/;
const ORIGENES = ['sanar', 'deeplink'];

async function entrarPain(uid, args, deps) {
  const db      = deps.db;
  const ahora   = deps.ahora || new Date();
  const ahoraMs = ahora.getTime();

  // El painId se valida por formato en el servidor; el mid se DERIVA de él.
  // No se acepta un mid del cliente: sería una vía para pagar por un pain y
  // abrir otro Misterio.
  const painId = String((args && args.painId) || '').trim().toLowerCase();
  if (!PAIN_RE.test(painId)) {
    const err = new Error('painId con formato inválido: ' + painId);
    err.code = 'pain-invalido';
    throw err;
  }
  const mid        = painId.slice(0, 6);
  const confirmado = (args && args.confirmado) === true;
  const origen     = (args && ORIGENES.indexOf(args.origen) >= 0) ? args.origen : 'sanar';
  const pideSimular = (args && args.simular === 'free');

  let out = null;

  await db.runTransaction(async function (tx) {
    // ═══ LECTURAS ═══
    const userRef  = db.collection('users').doc(uid);
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : {};
    const billing  = await ensureBilling(db, uid, tx, ahora);
    const b        = billing.data;

    const saldo  = b.credits || 0;
    const rentas = b.activeRentals || {};

    // 'ver como free': solo se honra si el plan REAL es developer. Sirve para
    // recorrer el flujo de cobro completo con una cuenta de desarrollo.
    const planReal  = String(userData.plan || 'free').toLowerCase().trim();
    const simulando = pideSimular && planReal === 'developer';

    // ── 1-3 · bypass sin gastar ──
    const bypass = simulando ? null : motivoBypass(userData, b, ahoraMs);
    if (bypass) {
      out = { ok: true, via: 'sub', cobrado: false, saldo: saldo, motivo: bypass };
      return;
    }

    // ── 4 · renta vigente de este pain ──
    if (rentaVigente(rentas, painId, ahoraMs)) {
      out = { ok: true, via: 'renta', cobrado: false, saldo: saldo,
              expiresAt: msDe(rentas[painId]) };
      return;
    }

    // ── 5 · sin saldo ──
    if (saldo < 1) {
      out = { ok: false, motivo: 'sin-saldo', saldo: 0 };
      return;
    }

    // ── 6 · nadie ha confirmado → NO se cobra ──
    if (!confirmado) {
      out = { ok: false, motivo: 'requiere-confirmacion', saldo: saldo };
      return;
    }

    // ═══ 7 · COBRAR (las únicas escrituras de dinero) ═══
    const expira   = finDeRenta(ahora);
    const podadas  = podarRentas(rentas, ahoraMs);   // se limpian las vencidas
    podadas[painId] = expira;
    const nuevo    = saldo - 1;

    const lifetime = Object.assign({ granted: 0, purchased: 0, spent: 0 }, b.lifetime || {});
    lifetime.spent = (lifetime.spent || 0) + 1;

    tx.set(billing.ref, {
      credits:       nuevo,
      activeRentals: podadas,
      lifetime:      lifetime,
      updatedAt:     ahora
    }, { merge: true });

    tx.set(userRef.collection('rentals').doc(painId), {
      painId:    painId,
      mid:       mid,
      rentedAt:  ahora,
      expiresAt: expira,
      via:       'credito',
      origen:    origen
    });

    // Id determinista en vez de autoId: el ledger es la cuenta de re-rentas
    // (un asiento 'spend' por cobro, con ref = painId) y así dos cargos
    // imposibles del mismo pain en el mismo milisegundo colisionarían en vez
    // de duplicarse.
    tx.set(userRef.collection('ledger').doc('spend_' + painId + '_' + ahoraMs), {
      type:         'spend',
      delta:        -1,
      balanceAfter: nuevo,
      ref:          painId,
      at:           ahora,
      meta:         { mid: mid, origen: origen, simulado: simulando }
    });

    out = { ok: true, via: 'credito', cobrado: true, saldo: nuevo,
            expiresAt: expira.getTime(), simulando: simulando };
  });

  return out;
}

// ── procesarEvento ───────────────────────────────────────────────────────────
// Todo el árbol de decisión del webhook. Vive aquí, y no en index.js, para que
// se pueda ejercitar con un `db` de mentira: sin emulador de Firestore no habría
// otra forma de verificar la idempotencia, las tres vías del uid y el espejo.
//
// deps: { db, stripe, PRICE_IDS, ahora: Date, ttlDias }
const EVENTOS_RELEVANTES = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted'
];

async function procesarEvento(event, deps) {
  const db        = deps.db;
  const stripe    = deps.stripe;
  const PRICE_IDS = deps.PRICE_IDS || {};
  const ahora     = deps.ahora || new Date();
  const ttlDias   = deps.ttlDias || 30;
  const ahoraMs   = ahora.getTime();
  const obj       = (event.data && event.data.object) || {};

  // ── Bifurcación por tipo, ANTES de mirar event.type ──
  const tipo = resolverTipo(event);
  if (tipo === 'creditos') {
    // Paquete de créditos → Pieza 5. Se reconoce y se sale SIN tocar el plan.
    // Esta rama es justamente lo que impide que un pago único se malinterprete
    // como suscripción y regale premium.
    console.log('[webhook] evento de créditos reconocido, sin efecto en Pieza 1:',
                event.id, event.type);
    return { accion: 'creditos-diferido' };
  }
  if (tipo === 'desconocido') {
    console.log('[webhook] tipo no reconocido, ignorado:', event.id, event.type);
    return { accion: 'ignorado' };
  }
  if (EVENTOS_RELEVANTES.indexOf(event.type) === -1) {
    console.log('[webhook] evento no relevante, ignorado:', event.type);
    return { accion: 'ignorado' };
  }

  // ── Resolución del uid (3 vías) — fuera de la transacción ──
  const resuelto = await resolverUid(event, { db: db, stripe: stripe });
  if (!resuelto.uid) {
    console.warn('[webhook] uid no resuelto por ninguna vía:', event.id, event.type);
    return { accion: 'sin-uid' };
  }
  const uid = resuelto.uid;

  const evtRef     = db.collection('stripeEvents').doc(event.id);
  const userRef    = db.collection('users').doc(uid);
  const customerId = (typeof obj.customer === 'string')
    ? obj.customer : ((obj.customer && obj.customer.id) || null);

  let resultado = { accion: 'procesado', uid: uid, viaUid: resuelto.via };

  await db.runTransaction(async function (tx) {
    // ═══ TODAS LAS LECTURAS PRIMERO (regla de Firestore) ═══

    // Idempotencia: Stripe reintenta los webhooks por diseño.
    const evtSnap = await tx.get(evtRef);
    if (evtSnap.exists) {
      console.log('[webhook] evento ya procesado, sin efecto:', event.id);
      resultado = { accion: 'duplicado', uid: uid };
      return;
    }

    const userSnap   = await tx.get(userRef);
    const planActual = (userSnap.exists && userSnap.data().plan) || 'free';

    // ensureBilling lee y luego escribe → después del resto de lecturas.
    const billing = await ensureBilling(db, uid, tx, ahora);

    // ═══ ESCRITURAS ═══
    const userPatch = { stripeUpdatedAt: ahora };
    if (customerId) userPatch.stripeCustomerId = customerId;

    if (customerId) {
      tx.set(db.collection('stripeCustomers').doc(customerId),
             { uid: uid, at: ahora }, { merge: true });
    }

    if (event.type === 'checkout.session.completed') {
      // Solo enlaza cliente↔uid. La vigencia la escribe subscription.created,
      // que llega enseguida y sí trae current_period_end fiable.
      tx.set(userRef, userPatch, { merge: true });
      resultado.efecto = 'enlace';
      console.log('[webhook] checkout enlazado:', uid, customerId || '(sin customer)');

    } else {
      // customer.subscription.created / updated / deleted
      const sub     = subDesdeStripe(obj, PRICE_IDS, ahora);
      const vigente = (event.type === 'customer.subscription.deleted')
        ? false
        : suscripcionVigente(sub, ahoraMs);

      tx.set(billing.ref, { sub: sub, updatedAt: ahora }, { merge: true });

      // Espejo de compatibilidad. planEspejo devuelve null cuando el plan actual
      // NO lo gobierna Stripe (developer/beta) → no se toca.
      const espejo = planEspejo(planActual, vigente);
      if (espejo !== null) {
        userPatch.plan = espejo;
        console.log('[webhook] plan →', espejo, uid, '| status:', sub.status);
      } else {
        console.log('[webhook] plan intocado (' + planActual + ') para', uid);
      }
      tx.set(userRef, userPatch, { merge: true });

      resultado.efecto  = 'suscripcion';
      resultado.vigente = vigente;
      resultado.espejo  = espejo;
    }

    // Recibo de idempotencia.
    tx.set(evtRef, {
      type:      event.type,
      uid:       uid,
      viaUid:    resuelto.via,
      at:        ahora,
      expiresAt: new Date(ahoraMs + ttlDias * DIA_MS)
    });
  });

  return resultado;
}

module.exports = {
  // parámetros
  CREDITOS_REGALO, VENTANA_DIAS, GRACIA_DIAS, BETA_DIAS,
  SCHEMA_VERSION, DIA_MS, PLANES_STRIPE, EVENTOS_RELEVANTES,
  // helpers
  msDe, leerPeriodEnd, planDesdePrice,
  // suscripción
  subDesdeStripe, suscripcionVigente, planEspejo,
  // webhook
  resolverTipo, resolverUid, procesarEvento,
  // billing
  billingInicial, ensureBilling,
  // rentas y cobro (Pieza 2)
  podarRentas, rentaVigente, finDeRenta, motivoBypass, entrarPain, PAIN_RE
};
