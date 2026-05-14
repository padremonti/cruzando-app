const functions = require('firebase-functions');
const OpenAI    = require('openai');

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
