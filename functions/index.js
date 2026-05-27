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

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const PRICE_IDS = {
  mensual: 'price_1TbO3hCDSMAtjE9eb0Y8Je4X',
  anual:   'price_1TbO2rCDSMAtjE9ewW8WOqtN',
};

// ── 1. Crear sesión de Checkout ───────────────────────
exports.createCheckoutSession = functions
  .region('us-central1')
  .runWith({ secrets: ['STRIPE_SECRET_KEY'] })
  .https.onCall(async (data, context) => {

    const stripe = require('stripe')(STRIPE_SECRET_KEY.value());

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const stripeKey = STRIPE_SECRET_KEY.value();
    console.log('Stripe key presente:', !!stripeKey, '| longitud:', stripeKey?.length, '| prefijo:', stripeKey?.substring(0, 7));
    console.log('Plan recibido:', data.plan);

    const { plan } = data;
    const priceId  = PRICE_IDS[plan];
    if (!priceId) {
      throw new functions.https.HttpsError('invalid-argument', 'Plan no válido.');
    }

    const uid   = context.auth.uid;
    const email = context.auth.token.email || '';

    const session = await stripe.checkout.sessions.create({
      mode:                 'subscription',
      payment_method_types: ['card'],
      customer_email:       email,
      line_items:           [{ price: priceId, quantity: 1 }],
      success_url:          'https://cruzando.app/?checkout=success',
      cancel_url:           'https://cruzando.app/?checkout=cancel',
      metadata:             { uid },
      subscription_data:    { metadata: { uid } },
    });

    return { url: session.url };
  });

// ── 2. Webhook — actualizar plan en Firestore ─────────
exports.stripeWebhook = functions
  .region('us-central1')
  .runWith({ secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] })
  .https.onRequest(async (req, res) => {

    const stripe = require('stripe')(STRIPE_SECRET_KEY.value());
    const sig    = req.headers['stripe-signature'];
    const secret = STRIPE_WEBHOOK_SECRET.value();
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, secret);
    } catch (err) {
      console.error('Webhook signature error:', err.message);
      return res.status(400).send('Webhook error: ' + err.message);
    }

    const uid = event?.data?.object?.metadata?.uid
             || event?.data?.object?.subscription_data?.metadata?.uid;

    if (!uid) {
      console.warn('No uid en metadata, evento ignorado:', event.type);
      return res.json({ received: true });
    }

    const userRef = db.collection('users').doc(uid);

    switch (event.type) {

      case 'checkout.session.completed':
      case 'invoice.paid': {
        var updateData = { plan: 'premium', stripeUpdatedAt: new Date().toISOString() };
        if (event.data.object.customer) {
          updateData.stripeCustomerId = event.data.object.customer;
        }
        await userRef.set(updateData, { merge: true });
        console.log('Plan → premium:', uid);
        break;
      }

      case 'customer.subscription.deleted':
      case 'invoice.payment_failed':
        await userRef.set({ plan: 'free', stripeUpdatedAt: new Date().toISOString() }, { merge: true });
        console.log('Plan → free:', uid);
        break;

      default:
        console.log('Evento ignorado:', event.type);
    }

    res.json({ received: true });
  });

// ── 3. Portal de gestión de suscripción ──────────────────
exports.createPortalSession = functions
  .region('us-central1')
  .runWith({ secrets: ['STRIPE_SECRET_KEY'] })
  .https.onCall(async (data, context) => {

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Debes iniciar sesión.');
    }

    const stripe = require('stripe')(STRIPE_SECRET_KEY.value());
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
