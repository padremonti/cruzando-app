// El namespace v1 va EXPLÍCITO: desde firebase-functions 6.x el import raíz
// devuelve la API de 2ª generación. Estas 10 funciones son gen 1 a propósito
// (ver crearCuentaEconomica: en gen 2 no existe un trigger de fondo de Auth).
const functions             = require('firebase-functions/v1');
const { defineSecret }      = require('firebase-functions/params');
const OpenAI                = require('openai');

const STRIPE_SECRET_KEY     = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

// Universo de TEST. Vive junto al de Live, en la misma función desplegada: el
// webhook verifica la firma contra los dos secretos y el que valide decide con
// qué cliente se procesa el evento. Así se puede recorrer el ciclo de compra
// completo dentro de la app real —sin cobrar dinero— también DESPUÉS de salir a
// producción, que es cuando hace más falta.
const STRIPE_SECRET_KEY_TEST     = defineSecret('STRIPE_SECRET_KEY_TEST');
const STRIPE_WEBHOOK_SECRET_TEST = defineSecret('STRIPE_WEBHOOK_SECRET_TEST');

// La API key se configura manualmente con:
// firebase functions:config:set openai.key="..."
// luego: firebase deploy --only functions
const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY || ''
});

const SYSTEM_PROMPT = `Eres un acompañante espiritual cálido y discreto del programa CruzAndo, un itinerario de crecimiento espiritual basado en el Santo Rosario. El usuario acaba de completar un retiro de sanación. Recibirás sus respuestas y reflexiones escritas durante el retiro.

Tu tarea:
1. Ofrecer un párrafo breve de reconocimiento personal y cálido (no genérico, basado en lo que escribió).
2. Señalar uno o dos patrones que observas en sus respuestas (sin diagnosticar, sin etiquetar, sin términos clínicos).
3. Una pregunta final para llevar en el corazón esta semana.

Tono: pastoral, íntimo, esperanzador.
Nunca terapéutico ni académico.
Nunca uses su nombre.
Máximo 150 palabras.
Responde siempre en español.
No uses markdown, asteriscos ni listas.
Solo párrafos de texto continuo.`;

exports.evaluarRetiro = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'El usuario debe estar autenticado.'
      );
    }

    const { tallerNombre, respuestas, reflexiones } = data;

    if (!tallerNombre) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Faltan datos del retiro.'
      );
    }

    // Construir mensaje sin PII
    let mensajeUsuario = 'Retiro completado: ' + tallerNombre + '\n\n';

    if (respuestas && Object.keys(respuestas).length > 0) {
      mensajeUsuario += 'Respuestas a actividades:\n';
      Object.entries(respuestas).forEach(([clave, valor]) => {
        if (valor && typeof valor !== 'object') {
          mensajeUsuario += '- ' + String(valor) + '\n';
        } else if (Array.isArray(valor)) {
          mensajeUsuario += '- ' + valor.join(', ') + '\n';
        }
      });
      mensajeUsuario += '\n';
    }

    if (reflexiones && Object.keys(reflexiones).length > 0) {
      mensajeUsuario += 'Reflexiones escritas:\n';
      Object.entries(reflexiones).forEach(([clave, texto]) => {
        if (texto && texto.trim().length > 0) {
          mensajeUsuario += '- "' + texto.trim() + '"\n';
        }
      });
    }

    // Fallback si no hay contenido suficiente
    if (mensajeUsuario.split(' ').length < 10) {
      return {
        feedback: 'Has completado este retiro. Que lo que has contemplado hoy siga madurando en tu corazón.'
      };
    }

    try {
      const completion = await openai.chat.completions.create({
        model:       'gpt-4o-mini',
        max_tokens:  300,
        temperature: 0.7,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: mensajeUsuario }
        ]
      });

      const feedback = completion.choices[0].message.content.trim();
      return { feedback };

    } catch (error) {
      console.error('Error OpenAI:', error);
      return {
        feedback: 'Has completado este retiro con honestidad y valentía. Lo que has contemplado hoy es semilla — dale tiempo para crecer en tu corazón esta semana.'
      };
    }
  });

// ══════════════════════════════════════════════════════
// STRIPE — Checkout + Webhook
// ══════════════════════════════════════════════════════

const admin = require('firebase-admin');
const ECO   = require('./economia');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ── Precios ───────────────────────────────────────────────────────────────
// Todo en MXN con IVA INCLUIDO (tax_behavior:'inclusive' en Stripe): el usuario
// paga exactamente la cifra anunciada y el 16% va dentro.
//
// EXPANSIÓN INTERNACIONAL: para añadir USD NO hay que tocar nada de esto. Se le
// añade una currency_option al MISMO price en Stripe y Checkout elige la moneda
// según el comprador. Un price por paquete y universo, para siempre.

// Suscripción, por universo.
const PRICE_SUB = {
  live: {
    mensual: 'price_1TbO3hCDSMAtjE9eb0Y8Je4X',
    anual:   'price_1TbO2rCDSMAtjE9ewW8WOqtN'
  },
  test: {
    mensual: 'price_1TIcVOCRd4PM0jIp9oEF54j4',
    anual:   'price_1TIca0CRd4PM0jIparwSPFfT'
  }
};

// Mapa PLANO price → plan, el que usa el webhook. Lleva los DOS universos por
// clave: un evento de test trae el price de test y debe resolver a 'mensual'
// igual que el de Live (planDesdePrice acepta lista, ver economia.js).
const PRICE_IDS = {
  mensual: [PRICE_SUB.live.mensual, PRICE_SUB.test.mensual],
  anual:   [PRICE_SUB.live.anual,   PRICE_SUB.test.anual]
};

// Paquetes de créditos (Pieza 5). Las cantidades NO están aquí: viven en
// ECO.PAQUETES, que es la fuente de verdad del acreditado. Esto es solo el
// enlace con el catálogo de Stripe.
const PRICE_PAQUETES = {
  live: {
    p5:  'price_1U6yayCDSMAtjE9eyMLK2K1I',
    p15: 'price_1U6yb1CDSMAtjE9eCCkjL1kL',
    p25: 'price_1U6yb4CDSMAtjE9eZYtVv7CV'
  },
  test: {
    p5:  'price_1U6xoCCRd4PM0jIpLYjOKilX',
    p15: 'price_1U6xojCRd4PM0jIp2kaatykF',
    p25: 'price_1U6xp4CRd4PM0jIphVH3TiRb'
  }
};

// Un price sin rellenar daría un error críptico de Stripe a mitad del checkout.
// Mejor un error claro antes de salir de casa.
function exigirPrecio(priceId, modo, que) {
  if (!priceId || priceId.indexOf('price_PENDIENTE') === 0) {
    console.error('[precio] falta el price_id de', que, 'en modo', modo);
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Este paquete todavía no está disponible. Inténtalo más tarde.');
  }
  return priceId;
}

// Código beta. Vive AQUÍ, no en el cliente: la constante de index.html/crecer.html
// queda solo como pre-chequeo cosmético (habilita el botón); la validación real
// es esta. Antes el código estaba únicamente en el cliente, a la vista de
// cualquiera en devtools.
const BETA_CODE = 'BETA2026';

// Versión de la API de Stripe FIJADA a propósito. En 2025-03-31 Stripe movió
// current_period_end de la suscripción al item; sin fijarla, un `npm update`
// cambiaría la forma de la respuesta en silencio. (economia.leerPeriodEnd tiene
// además un fallback al item, por si algún día se sube la versión a conciencia.)
const STRIPE_API_VERSION = '2023-10-16';

// Un secreto no configurado no debe tumbar la función: se degrada al universo
// que sí exista (en la práctica, Live).
function valorSecreto(s) {
  try { return s.value() || ''; } catch (e) { return ''; }
}

// Cliente del universo pedido. null si ese universo no está configurado.
function stripeClient(modo) {
  const clave = (modo === 'test')
    ? valorSecreto(STRIPE_SECRET_KEY_TEST)
    : valorSecreto(STRIPE_SECRET_KEY);
  if (!clave) return null;
  return require('stripe')(clave, { apiVersion: STRIPE_API_VERSION });
}

function exigirStripe(modo) {
  const s = stripeClient(modo);
  if (!s) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      modo === 'test' ? 'El modo de prueba no está configurado.'
                      : 'El sistema de pagos no está disponible.');
  }
  return s;
}

// ── modoPedido ─────────────────────────────────────────────────────────────
// EL MODO TEST SOLO LO PUEDE PEDIR UNA CUENTA developer. Para cualquier otro
// usuario el universo es SIEMPRE Live, diga lo que diga el cliente. Se
// comprueba contra el doc de Firestore (server-only desde la Pieza 1), no
// contra nada que venga del navegador.
async function modoPedido(uid, data) {
  if (!data || data.modo !== 'test') return 'live';
  const snap = await db.collection('users').doc(uid).get();
  const plan = String((snap.exists && snap.data().plan) || 'free').toLowerCase().trim();
  if (plan !== 'developer') {
    console.warn('[modo] se pidió test sin ser developer, se fuerza live:', uid);
    return 'live';
  }
  return 'test';
}

// Retención de los recibos de idempotencia (stripeEvents). Configurar una
// política de TTL de Firestore sobre el campo `expiresAt` de esa colección.
const EVENTOS_TTL_DIAS = 30;

// ── 1. Crear sesión de Checkout ───────────────────────
exports.createCheckoutSession = functions
  .region('us-central1')
  .runWith({ secrets: ['STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY_TEST'] })
  .https.onCall(async (data, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const uid   = context.auth.uid;
    const email = context.auth.token.email || '';
    const plan  = data && data.plan;

    const modo    = await modoPedido(uid, data);
    const priceId = (PRICE_SUB[modo] || {})[plan];
    if (!priceId) {
      throw new functions.https.HttpsError('invalid-argument', 'Plan no válido.');
    }
    exigirPrecio(priceId, modo, 'suscripción ' + plan);

    const stripe = exigirStripe(modo);

    // `tipo` explícito: el webhook bifurca por él antes de decidir nada. No
    // depender solo de `mode` es lo que mantiene separados los dos caminos
    // ahora que los paquetes de créditos llegan como mode:'payment'.
    const meta = { uid, tipo: 'suscripcion', modo };

    // Retorno por LISTA BLANCA (economia.urlRetorno): el cliente manda la clave
    // 'sanar' o 'index', jamás una URL. Suscribirse desde el muro de Sanar debe
    // devolver a Sanar, con el dolor que se estaba orando.
    const crudo   = String((data && data.painId) || '').trim().toLowerCase();
    const painId  = ECO.PAIN_RE.test(crudo) ? crudo : null;
    if (painId) meta.painId = painId;
    const destino = ECO.urlRetorno(data && data.retorno);
    const cola    = painId ? '&pain=' + encodeURIComponent(painId) : '';

    const session = await stripe.checkout.sessions.create({
      mode:                 'subscription',
      payment_method_types: ['card'],
      locale:               'es-419',
      customer_email:       email,
      client_reference_id:  uid,
      line_items:           [{ price: priceId, quantity: 1 }],
      success_url:          destino + '?checkout=success&sid={CHECKOUT_SESSION_ID}' + cola,
      cancel_url:           destino + '?checkout=cancel' + cola,
      metadata:             meta,
      subscription_data:    { metadata: meta },
    });

    try {
      await ECO.registrarCheckout(db, uid, session,
        { tipo: 'suscripcion', plan: plan, painId: painId, modo: modo }, new Date());
    } catch (e) {
      console.warn('[suscripción] no se pudo registrar el checkout:', e && e.message);
    }

    return { url: session.url, sessionId: session.id, modo };
  });

// ── 1b. Comprar un paquete de créditos ────────────────
// El flujo nuevo de la Pieza 5: pago ÚNICO (mode:'payment'), no suscripción.
//
// El cliente manda una CLAVE de paquete ('p15') y nada más. No manda importe,
// ni cantidad de créditos, ni price_id. El servidor mapea clave → price_id y
// Stripe pone el monto. Manipular el precio desde el navegador no es difícil:
// es imposible, porque el precio nunca pasa por ahí.
exports.comprarCreditos = functions
  .region('us-central1')
  .runWith({ secrets: ['STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY_TEST'] })
  .https.onCall(async (data, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const uid     = context.auth.uid;
    const email   = context.auth.token.email || '';
    const paquete = String((data && data.paquete) || '').trim();

    if (!ECO.PAQUETES[paquete]) {
      throw new functions.https.HttpsError('invalid-argument', 'Paquete no válido.');
    }

    const modo    = await modoPedido(uid, data);
    const priceId = exigirPrecio((PRICE_PAQUETES[modo] || {})[paquete], modo, 'paquete ' + paquete);
    const stripe  = exigirStripe(modo);

    // Reutilizar el cliente de Stripe si ya existe, para que las compras y la
    // suscripción vivan bajo el mismo cliente en el dashboard. Solo en Live: un
    // customer de Live no existe en el universo de test.
    let customerId = null;
    if (modo === 'live') {
      try {
        const snap = await db.collection('users').doc(uid).get();
        customerId = (snap.exists && snap.data().stripeCustomerId) || null;
      } catch (e) {
        console.warn('[compra] no se pudo leer stripeCustomerId:', e && e.message);
      }
    }

    let params;
    try {
      params = ECO.paramsCheckoutCreditos({
        uid:        uid,
        email:      email,
        paquete:    paquete,
        priceId:    priceId,
        painId:     data && data.painId,
        retorno:    data && data.retorno,
        customerId: customerId,
        modo:       modo
      });
    } catch (e) {
      console.error('[compra] params inválidos:', e && e.message);
      throw new functions.https.HttpsError('invalid-argument', 'Paquete no válido.');
    }

    const session = await stripe.checkout.sessions.create(params);

    // Rastro de la intención: es lo que permite a reclamarCompra encontrar un
    // pago sin que el cliente recuerde el id de la sesión.
    try {
      await ECO.registrarCheckout(db, uid, session, {
        tipo:     'creditos',
        paquete:  paquete,
        creditos: ECO.PAQUETES[paquete].creditos,
        painId:   params.metadata.painId || null,
        modo:     modo
      }, new Date());
    } catch (e) {
      console.warn('[compra] no se pudo registrar el checkout:', e && e.message);
    }

    console.log('[compra] sesión creada:', session.id, '·', paquete, '·', modo, '·', uid);
    return { url: session.url, sessionId: session.id, modo };
  });

// ── verificarEvento ───────────────────────────────────
// Verifica la firma contra los DOS universos y devuelve cuál validó.
// constructEvent es criptografía local (HMAC del cuerpo crudo): no llama a la
// API, así que da igual con qué cliente se invoque — el que decide es el
// secreto. Sin el whsec_ correspondiente no hay evento válido, y por eso un
// webhook falsificado no existe.
function verificarEvento(rawBody, sig) {
  const verificador = require('stripe')(valorSecreto(STRIPE_SECRET_KEY) || 'sk_placeholder',
                                        { apiVersion: STRIPE_API_VERSION });
  const universos = [
    { modo: 'test', secreto: valorSecreto(STRIPE_WEBHOOK_SECRET_TEST) },
    { modo: 'live', secreto: valorSecreto(STRIPE_WEBHOOK_SECRET) }
  ];
  for (let i = 0; i < universos.length; i++) {
    const u = universos[i];
    if (!u.secreto) continue;
    try {
      return { event: verificador.webhooks.constructEvent(rawBody, sig, u.secreto), modo: u.modo };
    } catch (e) { /* prueba el siguiente universo */ }
  }
  return null;
}

// ── 2. Webhook ────────────────────────────────────────
// Fuente de verdad de la suscripción: customer.subscription.*
//
// Las invoices NO deciden acceso. Llevan su propio metadata (vacío) y obligarían
// a un retrieve extra por evento; en cambio customer.subscription.created/updated
// traen de forma nativa el uid (vía subscription_data.metadata), el status, el
// current_period_end y el price. Stripe emite subscription.updated en cada
// renovación, así que la vigencia se mantiene sola.
//
// El árbol de decisión completo vive en economia.procesarEvento(), que recibe db
// y stripe inyectados: así se puede verificar con dobles, sin emulador. Esta
// función es solo el envoltorio HTTP (firma + códigos de estado).
exports.stripeWebhook = functions
  .region('us-central1')
  .runWith({ secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
                       'STRIPE_SECRET_KEY_TEST', 'STRIPE_WEBHOOK_SECRET_TEST'] })
  .https.onRequest(async (req, res) => {

    const sig = req.headers['stripe-signature'];

    // Dos universos, un endpoint. La firma es específica de cada endpoint de
    // Stripe, así que un evento solo puede validar contra UNO de los dos
    // secretos: el que valide dice de qué universo viene. Sin ambigüedad y sin
    // duplicar la función.
    const verificado = verificarEvento(req.rawBody, sig);
    if (!verificado) {
      console.error('[webhook] firma inválida (no valida ni con test ni con live)');
      return res.status(400).send('Webhook error: firma inválida');
    }
    const event = verificado.event;
    const modo  = verificado.modo;

    try {
      await ECO.procesarEvento(event, {
        db:        db,
        stripe:    stripeClient(modo),   // el cliente del universo del evento
        PRICE_IDS: PRICE_IDS,
        ahora:     new Date(),
        ttlDias:   EVENTOS_TTL_DIAS
      });
    } catch (e) {
      // 500 → Stripe reintenta. Es lo que queremos ante un fallo real: el
      // recibo de idempotencia solo se escribe si la transacción completó.
      console.error('[webhook] fallo procesando', event.id, event.type, e);
      return res.status(500).send('Error procesando el evento.');
    }

    return res.json({ received: true });
  });

// ── 3. Portal de gestión de suscripción ──────────────────
exports.createPortalSession = functions
  .region('us-central1')
  .runWith({ secrets: ['STRIPE_SECRET_KEY'] })
  .https.onCall(async (data, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const stripe = exigirStripe('live');
    const uid    = context.auth.uid;

    const userDoc    = await db.collection('users').doc(uid).get();
    const customerId = userDoc.data()?.stripeCustomerId;

    if (!customerId) {
      throw new functions.https.HttpsError('not-found', 'No se encontró una suscripción activa.');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: 'https://cruzando.app/',
    });

    return { url: session.url };
  });

// ══════════════════════════════════════════════════════
// CIMIENTO ECONÓMICO — alta, canje de códigos, estado de cuenta
// ══════════════════════════════════════════════════════

// ── 4. crearCuentaEconomica ──────────────────────────────
// Siembra billing/state + los 5 créditos de regalo al registrarse.
//
// Cubre a los usuarios NUEVOS. Los que ya existían (la comunidad beta actual)
// no reciben nada por aquí — a ellos los cubre la vía perezosa de ensureBilling,
// que se dispara en su primer gasto. Entre los dos mecanismos la cobertura es
// completa y NO hace falta ningún script de backfill.
//
// Las dos vías pasan por el mismo ensureBilling, que es idempotente por la
// existencia de billing/state: quien reciba el regalo aquí no lo vuelve a
// recibir después, y viceversa.
//
// No depende de que exista users/{uid}: en Firestore un documento de
// subcolección puede existir sin su documento padre, así que da igual si este
// trigger corre antes o después del ensureUserDoc del cliente.
exports.crearCuentaEconomica = functions
  .region('us-central1')
  .auth.user()
  .onCreate(async (user) => {
    const ahora = new Date();
    try {
      await db.runTransaction(async (tx) => {
        await ECO.ensureBilling(db, user.uid, tx, ahora);
      });
      console.log('[alta] billing sembrado con', ECO.CREDITOS_REGALO,
                  'créditos de regalo:', user.uid);
    } catch (e) {
      // No se relanza a propósito: si esto falla, la vía perezosa lo cubre en el
      // primer gasto. Un fallo aquí no debe dejar al usuario sin cuenta.
      console.error('[alta] fallo sembrando billing (la vía perezosa lo cubrirá):',
                    user.uid, e);
    }
  });

// ── 5. canjearCodigo ─────────────────────────────────────
// Sustituye al setDoc del cliente que las reglas nuevas bloquean.
// El cliente ya no puede escribir plan/betaExpiresAt: este es el único camino.
exports.canjearCodigo = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const uid  = context.auth.uid;
    const code = String((data && data.code) || '').trim().toUpperCase();

    if (!code) {
      throw new functions.https.HttpsError('invalid-argument', 'Escribe un código.');
    }
    if (code !== BETA_CODE) {
      throw new functions.https.HttpsError('not-found', 'Código no válido.');
    }

    const ahora   = new Date();
    const expira  = new Date(ahora.getTime() + ECO.BETA_DIAS * ECO.DIA_MS);
    const userRef = db.collection('users').doc(uid);
    // El registro de canjes vive bajo billing/ → server-only, el cliente lo lee
    // pero no lo puede falsificar para volver a canjear.
    const canjesRef = userRef.collection('billing').doc('canjes');

    await db.runTransaction(async (tx) => {
      // ── lecturas ──
      const canjesSnap = await tx.get(canjesRef);
      const canjes     = (canjesSnap.exists && canjesSnap.data().codigos) || {};
      const userSnap   = await tx.get(userRef);
      const planActual = String((userSnap.exists && userSnap.data().plan) || 'free')
                           .toLowerCase().trim();

      if (canjes[code]) {
        throw new functions.https.HttpsError(
          'already-exists', 'Ya usaste ese código.');
      }
      if (planActual === 'developer') {
        throw new functions.https.HttpsError(
          'failed-precondition', 'Tu cuenta ya tiene acceso completo.');
      }
      // Un suscriptor que canjea beta se quedaría atrapado: 'beta' no lo gobierna
      // Stripe, así que planEspejo() no volvería a restaurarlo nunca a premium.
      if (planActual === 'premium' || planActual === 'pro') {
        throw new functions.https.HttpsError(
          'failed-precondition', 'Ya tienes una suscripción activa.');
      }

      // ── escrituras ──
      const codigos = Object.assign({}, canjes);
      codigos[code] = { at: ahora, dias: ECO.BETA_DIAS };

      tx.set(userRef, { plan: 'beta', betaExpiresAt: expira }, { merge: true });
      tx.set(canjesRef, { codigos: codigos, updatedAt: ahora }, { merge: true });
    });

    console.log('[canje] beta activado:', uid, '·', ECO.BETA_DIAS, 'días');
    return { ok: true, plan: 'beta', dias: ECO.BETA_DIAS, expiresAt: expira.toISOString() };
  });

// ── 6. entrarPain ────────────────────────────────────────
// El cobro. Toda la lógica vive en economia.entrarPain(); aquí solo va la
// autenticación y la traducción de errores. El cliente NUNCA descuenta un
// crédito: las reglas hacen billing/state write:false, así que este es el
// único camino posible.
exports.entrarPain = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    try {
      return await ECO.entrarPain(context.auth.uid, data || {}, {
        db:    db,
        ahora: new Date()
      });
    } catch (e) {
      if (e && e.code === 'pain-invalido') {
        throw new functions.https.HttpsError('invalid-argument', 'Oración no válida.');
      }
      console.error('[entrarPain] fallo:', context.auth.uid, data && data.painId, e);
      throw new functions.https.HttpsError('internal', 'No se pudo abrir la oración.');
    }
  });

// ── 7. estadoCuenta ──────────────────────────────────────
// Ventana de inspección del cimiento. Ninguna UI la llama todavía: existe para
// poder verificar la Pieza 1 desde la consola antes de construir encima.
//
// Dispara ensureBilling — es decir, es una de las puertas de la VÍA PEREZOSA:
// un beta tester que ya existía recibe aquí sus 5 créditos la primera vez que
// se le consulta el estado. La otra puerta será entrarPain() en la Pieza 2.
exports.estadoCuenta = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const uid   = context.auth.uid;
    const ahora = new Date();

    let billing = null;
    await db.runTransaction(async (tx) => {
      const r = await ECO.ensureBilling(db, uid, tx, ahora);
      billing = r.data;
    });

    const userSnap = await db.collection('users').doc(uid).get();
    const rentSnap = await db.collection('users').doc(uid).collection('rentals').get();

    const rentals = rentSnap.docs.map(function (d) {
      const r = d.data();
      return {
        painId:    r.painId,
        mid:       r.mid,
        expiresAt: r.expiresAt ? ECO.msDe(r.expiresAt) : null,
        via:       r.via,
        origen:    r.origen
      };
    });

    return {
      plan:    (userSnap.exists && userSnap.data().plan) || 'free',
      credits: billing.credits,
      sub: {
        status:            billing.sub.status,
        plan:              billing.sub.plan,
        currentPeriodEnd:  billing.sub.currentPeriodEnd
                             ? ECO.msDe(billing.sub.currentPeriodEnd) : null,
        cancelAtPeriodEnd: billing.sub.cancelAtPeriodEnd,
        vigente:           ECO.suscripcionVigente(billing.sub, ahora.getTime())
      },
      activeRentals: Object.keys(ECO.podarRentas(billing.activeRentals, ahora.getTime())),
      rentals:       rentals,
      lifetime:      billing.lifetime
    };
  });

// ── 8. reclamarCompra ────────────────────────────────────
// LA RED. La que convierte "pagué y no me llegó nada" en algo que no se puede
// sostener: si el webhook nunca llegó —endpoint caído, evento perdido, los 3
// días de reintentos agotados—, el propio usuario dispara la comprobación desde
// la pantalla de "estamos activando tus créditos".
//
// No acredita por su cuenta: le pregunta a Stripe y delega en el MISMO
// acreditarCompra que usa el webhook, con la misma llave de idempotencia
// (ledger/purchase_{sid}). Por eso llamar aquí y que el webhook llegue tarde NO
// duplica: el segundo en llegar encuentra el asiento escrito y se retira.
//
// Toda la lógica vive en economia.js con `db` y `stripe` inyectados; aquí solo
// van la autenticación y la elección del universo.
exports.reclamarCompra = functions
  .region('us-central1')
  .runWith({ secrets: ['STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY_TEST'] })
  .https.onCall(async (data, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const uid = context.auth.uid;
    const sid = String((data && data.sessionId) || '').trim();

    // El universo se deduce del propio id de la sesión (cs_test_… es de test),
    // no de lo que diga el cliente: con la clave equivocada el retrieve fallaría
    // y un pago real quedaría sin reclamar.
    const stripeDe = function (id) {
      return stripeClient(String(id || '').indexOf('cs_test_') === 0 ? 'test' : 'live');
    };

    try {
      const r = await ECO.reclamarCompra(uid, { sessionId: sid }, {
        db:       db,
        stripeDe: stripeDe,
        ahora:    new Date(),
        ttlDias:  EVENTOS_TTL_DIAS
      });
      console.log('[reclamo]', uid, '·', sid || '(sin id)', '→',
                  r.ok ? ('acreditados ' + r.acreditados.length) : r.motivo);
      return r;
    } catch (e) {
      console.error('[reclamo] fallo:', uid, sid, e);
      throw new functions.https.HttpsError('internal', 'No se pudo verificar la compra.');
    }
  });

// ── 9. aceptarTerminos ───────────────────────────────────
// Deja constancia SERVER-SIDE de que el usuario aceptó los Términos y la
// Política de Privacidad al crear su cuenta. Esto es la PRUEBA de
// consentimiento, y por eso no la escribe el cliente:
//
//   · la fecha la pone el servidor (serverTimestamp), no el reloj del móvil;
//   · la versión la fija ESTA constante, no lo que mande el cliente — el
//     cliente solo informa qué versión vio, y si no coinciden se registra en
//     el log (suele ser una página vieja cacheada, no un ataque);
//   · las reglas blindan el campo 'terminos': el cliente no lo puede fabricar,
//     alterar ni borrar. Un consentimiento editable por quien lo otorga no
//     probaría nada.
//
// WRITE-ONCE: si ya hay fecha, se conserva la PRIMERA. Volver a llamar es
// inofensivo — es lo que permite reintentar desde la cola de pendientes del
// cliente sin miedo a mover la fecha original.
//
// No toca crearCuentaEconomica: aquel siembra billing/state, este escribe un
// campo de users/{uid}. Distinto documento, sin carrera.
const TERMINOS_VERSION = '2026-09';

exports.aceptarTerminos = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const uid    = context.auth.uid;
    const metodo = (data && data.metodo) === 'google' ? 'google' : 'email';
    const vista  = String((data && data.version) || '').trim();

    if (vista && vista !== TERMINOS_VERSION) {
      console.warn('[terminos] el cliente vio', vista, 'y el servidor registra',
                   TERMINOS_VERSION, '·', uid);
    }

    const userRef = db.collection('users').doc(uid);
    let yaEstaba  = false;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const prev = (snap.exists && snap.data().terminos) || null;

      if (prev && prev.fecha) { yaEstaba = true; return; }

      const escritura = {
        terminos: {
          aceptado: true,
          fecha:    admin.firestore.FieldValue.serverTimestamp(),
          version:  TERMINOS_VERSION,
          metodo:   metodo
        }
      };

      // Si el doc todavía no existe (la llamada se adelantó al alta del
      // cliente), que no nazca sin plan: 'free' es el único que las reglas
      // admiten en un alta y el único que resolvePlan() da por defecto.
      if (!snap.exists) escritura.plan = 'free';

      tx.set(userRef, escritura, { merge: true });
    });

    console.log('[terminos]', yaEstaba ? 'ya constaba' : 'registrado',
                '·', uid, '·', metodo, '·', TERMINOS_VERSION);

    return { ok: true, version: TERMINOS_VERSION, yaEstaba: yaEstaba };
  });

// ── 10. aceptarAcuerdoBeta ───────────────────────────────
// La firma del Acuerdo de Confidencialidad y Uso Beta del grupo piloto.
//
// ⚠️ NO es aceptarTerminos, y no se mezclan. Aquel registra el consentimiento
// de los Términos y la Política de Privacidad EN EL ALTA, es write-once para
// siempre y vive en un campo de users/{uid}. Este es un acuerdo de
// confidencialidad que:
//
//   · se pide a cuentas YA EXISTENTES, no solo a las nuevas;
//   · se vuelve a pedir cuando el documento cambia de versión;
//   · tiene que poder LISTARSE —quién firmó y cuándo— sin recorrer cuenta por
//     cuenta, que es para lo que existe una colección de primer nivel.
//
// Por eso es un documento propio en `aceptaciones_beta/{uid}` y no un campo.
//
// La escribe el servidor y no el cliente por lo mismo que aceptarTerminos: un
// acuerdo de confidencialidad que el firmante puede borrar o editar no prueba
// nada. `firestore.rules` le da `write: false` — el cliente LEE lo suyo (es lo
// que consulta beta-gate.js) y no lo puede fabricar, alterar ni borrar.
//
//   · la fecha la pone el servidor (serverTimestamp), no el reloj del móvil;
//   · la versión la fija ESTA constante, no lo que mande el cliente;
//   · el CORREO sale de la sesión verificada (context.auth.token), nunca del
//     cuerpo de la llamada: si lo eligiera el cliente, se podría firmar a
//     nombre de otra dirección;
//   · el NOMBRE sí lo escribe la persona —es lo único que no sabemos con
//     certeza— y por eso se exige, se sanea y se guarda tal cual lo dio.
//
// WRITE-ONCE POR VERSIÓN, no para siempre: repetir la llamada con la MISMA
// versión conserva la primera fecha (es lo que permite reintentar sin miedo),
// pero una versión nueva del documento SÍ se vuelve a firmar. La firma
// anterior no se pierde: pasa a `historial`, porque haber firmado la 1.0 es un
// hecho que ocurrió y no deja de ser cierto cuando llega la 1.1.
//
// ⚠️ Esta constante tiene que coincidir con la de beta-gate.js y con la que
// muestra acuerdo-beta.html. Si divergieran, la puerta entraría en bucle: la
// persona firmaría y en la siguiente carga se le volvería a pedir. No se
// confía a la disciplina — tools/test-beta-gate.js compara las tres y falla.
const VERSION_ACUERDO_BETA = '1.0';

exports.aceptarAcuerdoBeta = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const uid = context.auth.uid;

    // El nombre es obligatorio: el acuerdo identifica al Participante, y una
    // firma sin nombre no identifica a nadie. Se sanea aquí y no solo en el
    // cliente — el cliente es una comodidad, la puerta es esta.
    const nombre = String((data && data.nombre) || '')
      .replace(/[\u0000-\u001F\u007F]/g, '')   // caracteres de control
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);

    if (nombre.length < 3) {
      throw new functions.https.HttpsError(
        'invalid-argument', 'Escribe tu nombre completo para firmar el acuerdo.');
    }

    const vista = String((data && data.version) || '').trim();
    if (vista && vista !== VERSION_ACUERDO_BETA) {
      console.warn('[acuerdo-beta] el cliente vio', vista, 'y el servidor registra',
                   VERSION_ACUERDO_BETA, '·', uid);
    }

    const firmaRef = db.collection('aceptaciones_beta').doc(uid);
    const userRef  = db.collection('users').doc(uid);

    let yaEstaba = false;

    await db.runTransaction(async (tx) => {
      // Las DOS lecturas antes de cualquier escritura: una transacción de
      // Firestore no admite leer después de escribir.
      const firmaSnap = await tx.get(firmaRef);
      const userSnap  = await tx.get(userRef);

      const prev = (firmaSnap.exists && firmaSnap.data()) || null;
      const userData = (userSnap.exists && userSnap.data()) || {};

      // Misma versión ya firmada → no se toca. Reintentar es inofensivo, que
      // es lo que permite volver a llamar sin mover la fecha original.
      if (prev && prev.aceptado === true &&
          String(prev.version_acuerdo || '') === VERSION_ACUERDO_BETA) {
        yaEstaba = true;
        return;
      }

      // El correo sale de la sesión verificada. El doc de usuario es el
      // respaldo para los proveedores que no traen email en el token.
      const correo = (context.auth.token && context.auth.token.email) ||
                     userData.email || '';

      const firma = {
        uid:              uid,
        nombre:           nombre,
        correo:           correo,
        version_acuerdo:  VERSION_ACUERDO_BETA,
        fecha_aceptacion: admin.firestore.FieldValue.serverTimestamp(),
        aceptado:         true
      };

      // ⚠️ La firma anterior se conserva, no se pisa. `fecha_aceptacion` de la
      // vieja ya es un Timestamp real —no el sentinela— así que sí se puede
      // meter en un array; un serverTimestamp() no se podría.
      if (prev && prev.version_acuerdo) {
        // 19 + la que entra = 20. Un historial sin tope crecería con cada
        // versión nueva hasta topar con el límite de tamaño del documento.
        const historial = Array.isArray(prev.historial) ? prev.historial.slice(0, 19) : [];
        historial.unshift({
          version_acuerdo:  prev.version_acuerdo,
          nombre:           prev.nombre || '',
          fecha_aceptacion: prev.fecha_aceptacion || null
        });
        firma.historial = historial;
      }

      tx.set(firmaRef, firma);

      // De paso, si la cuenta no tenía nombre, se le pone el que acaba de
      // escribir: el alta por correo lo pide, pero las cuentas beta antiguas
      // pueden tener displayName vacío y el hub las saluda como "Peregrino".
      // ⚠️ Solo si estaba vacío — nunca se le cambia el nombre a nadie.
      if (!String(userData.displayName || '').trim()) {
        tx.set(userRef, { displayName: nombre }, { merge: true });
      }
    });

    console.log('[acuerdo-beta]', yaEstaba ? 'ya constaba' : 'firmado',
                '·', uid, '·', VERSION_ACUERDO_BETA);

    return { ok: true, version: VERSION_ACUERDO_BETA, yaEstaba: yaEstaba };
  });
