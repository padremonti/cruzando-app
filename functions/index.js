const functions             = require('firebase-functions');
const { defineSecret }      = require('firebase-functions/params');
const OpenAI                = require('openai');

const STRIPE_SECRET_KEY     = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

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

const PRICE_IDS = {
  mensual: 'price_1TbO3hCDSMAtjE9eb0Y8Je4X',
  anual:   'price_1TbO2rCDSMAtjE9ewW8WOqtN',
};

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

function stripeClient() {
  return require('stripe')(STRIPE_SECRET_KEY.value(), { apiVersion: STRIPE_API_VERSION });
}

// Retención de los recibos de idempotencia (stripeEvents). Configurar una
// política de TTL de Firestore sobre el campo `expiresAt` de esa colección.
const EVENTOS_TTL_DIAS = 30;

// ── 1. Crear sesión de Checkout ───────────────────────
exports.createCheckoutSession = functions
  .region('us-central1')
  .runWith({ secrets: ['STRIPE_SECRET_KEY'] })
  .https.onCall(async (data, context) => {

    const stripe = stripeClient();

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const { plan } = data;
    const priceId  = PRICE_IDS[plan];
    if (!priceId) {
      throw new functions.https.HttpsError('invalid-argument', 'Plan no válido.');
    }

    const uid   = context.auth.uid;
    const email = context.auth.token.email || '';

    // `tipo` explícito: el webhook bifurca por él antes de decidir nada. No
    // depender solo de `mode` deja el camino listo para los paquetes de
    // créditos (Pieza 5), que llegan como mode:'payment'.
    const meta = { uid, tipo: 'suscripcion' };

    const session = await stripe.checkout.sessions.create({
      mode:                 'subscription',
      payment_method_types: ['card'],
      customer_email:       email,
      line_items:           [{ price: priceId, quantity: 1 }],
      success_url:          'https://cruzando.app/?checkout=success',
      cancel_url:           'https://cruzando.app/?checkout=cancel',
      metadata:             meta,
      subscription_data:    { metadata: meta },
    });

    return { url: session.url };
  });

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
  .runWith({ secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] })
  .https.onRequest(async (req, res) => {

    const stripe = stripeClient();
    const sig    = req.headers['stripe-signature'];
    const secret = STRIPE_WEBHOOK_SECRET.value();
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, secret);
    } catch (err) {
      console.error('[webhook] firma inválida:', err.message);
      return res.status(400).send('Webhook error: ' + err.message);
    }

    try {
      await ECO.procesarEvento(event, {
        db:        db,
        stripe:    stripe,
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

    const stripe = stripeClient();
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
