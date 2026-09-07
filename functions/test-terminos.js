/* Banco de pruebas de aceptarTerminos — la constancia de consentimiento.
 *
 * Sin emulador: se cargan los módulos de Firebase de mentira (Module._load) y
 * se prueba el handler REAL exportado por index.js, no una copia. Lo que
 * interesa verificar es exactamente lo que hace de este registro una prueba
 * legal: fecha del servidor, versión del servidor, y write-once.
 *
 * Ejecutar:  node test-terminos.js
 */
'use strict';

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
const TS = '__SERVER_TS__';   // sentinela: lo que ponga el servidor, no el cliente
let store = new Map();

function snapDe(path) {
  const has = store.has(path);
  return { exists: has, data: function () { return store.get(path); } };
}
function refDe(path) {
  return {
    path: path,
    collection: function (c) { return colDe(path + '/' + c); },
    get: function () { return Promise.resolve(snapDe(path)); }
  };
}
function colDe(path) {
  return { doc: function (id) { return refDe(path + '/' + id); } };
}

const db = {
  collection: function (c) { return colDe(c); },
  runTransaction: async function (fn) {
    const escrituras = [];
    const tx = {
      get: function (ref) {
        if (escrituras.length) throw new Error('lectura después de escritura en la transacción');
        return Promise.resolve(snapDe(ref.path));
      },
      set: function (ref, data, opts) {
        escrituras.push({ path: ref.path, data: data, merge: !!(opts && opts.merge) });
      }
    };
    const r = await fn(tx);
    escrituras.forEach(function (w) {
      const prev = store.get(w.path);
      store.set(w.path, (w.merge && prev) ? Object.assign({}, prev, w.data) : w.data);
    });
    return r;
  }
};

// ── Módulos de mentira ───────────────────────────────────────────────────────
class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fakeFunctions = {
  region:  function () { return fakeFunctions; },
  runWith: function () { return fakeFunctions; },
  https: {
    HttpsError: HttpsError,
    onCall:    function (h) { return h; },   // el export ES el handler
    onRequest: function (h) { return h; }
  },
  auth: { user: function () { return { onCreate: function (h) { return h; } }; } }
};

const fakeAdmin = {
  apps: [],
  initializeApp: function () {},
  firestore: Object.assign(function () { return db; },
                           { FieldValue: { serverTimestamp: function () { return TS; } } })
};

const Module = require('module');
const cargarOriginal = Module._load;
Module._load = function (req) {
  if (req === 'firebase-functions/v1')     return fakeFunctions;
  if (req === 'firebase-functions/params') return { defineSecret: function () { return { value: function () { return ''; } }; } };
  if (req === 'firebase-admin')            return fakeAdmin;
  if (req === 'openai')                    return function OpenAI() {};
  if (req === 'stripe')                    return function () { return {}; };
  return cargarOriginal.apply(this, arguments);
};

const API = require('./index.js');
Module._load = cargarOriginal;

const aceptar = API.aceptarTerminos;
const AUTH    = { auth: { uid: 'u1' } };

function terminosDe(uid) { return (store.get('users/' + (uid || 'u1')) || {}).terminos; }

// ── Pruebas ──────────────────────────────────────────────────────────────────
(async function () {
  console.log('\n── aceptarTerminos ──');

  await ta('sin sesión → unauthenticated (nadie firma por otro)', async () => {
    let code = null;
    try { await aceptar({ metodo: 'email' }, {}); } catch (e) { code = e.code; }
    eq(code, 'unauthenticated');
  });

  await ta('alta por email: deja constancia completa', async () => {
    store = new Map();
    const r = await aceptar({ version: '2026-09', metodo: 'email' }, AUTH);
    eq(r.ok, true);
    eq(r.yaEstaba, false);
    eq(terminosDe(), { aceptado: true, fecha: TS, version: '2026-09', metodo: 'email' });
  });

  await ta('la fecha la pone el SERVIDOR, no el cliente', async () => {
    store = new Map();
    await aceptar({ version: '2026-09', metodo: 'email', fecha: 'ayer' }, AUTH);
    eq(terminosDe().fecha, TS, 'la fecha debe ser el serverTimestamp:');
  });

  await ta('la versión la fija el servidor aunque el cliente mienta', async () => {
    store = new Map();
    const r = await aceptar({ version: '1999-01', metodo: 'email' }, AUTH);
    eq(terminosDe().version, '2026-09');
    eq(r.version, '2026-09');
  });

  await ta('el método se sanea: cualquier cosa que no sea google es email', async () => {
    store = new Map();
    await aceptar({ metodo: 'google' }, AUTH);
    eq(terminosDe().metodo, 'google');

    store = new Map();
    await aceptar({ metodo: 'lo-que-sea' }, AUTH);
    eq(terminosDe().metodo, 'email');
  });

  await ta('WRITE-ONCE: la segunda llamada conserva la primera aceptación', async () => {
    store = new Map();
    await aceptar({ metodo: 'email' }, AUTH);
    store.set('users/u1', Object.assign({}, store.get('users/u1'), {
      terminos: { aceptado: true, fecha: 'FECHA-ORIGINAL', version: '2026-09', metodo: 'email' }
    }));

    const r = await aceptar({ metodo: 'google' }, AUTH);
    eq(r.yaEstaba, true);
    eq(terminosDe().fecha,  'FECHA-ORIGINAL', 'no debe moverse la fecha:');
    eq(terminosDe().metodo, 'email',          'no debe cambiar el método:');
  });

  await ta('reintento de la cola: llamar de nuevo es inofensivo', async () => {
    store = new Map();
    await aceptar({ metodo: 'email' }, AUTH);
    const antes = JSON.stringify(terminosDe());
    await aceptar({ metodo: 'email' }, AUTH);
    await aceptar({ metodo: 'email' }, AUTH);
    eq(JSON.stringify(terminosDe()), antes);
  });

  await ta('doc inexistente: nace con plan free, nunca sin plan', async () => {
    store = new Map();
    await aceptar({ metodo: 'google' }, AUTH);
    eq(store.get('users/u1').plan, 'free');
  });

  await ta('doc existente: NO toca el plan de pago', async () => {
    store = new Map();
    store.set('users/u1', { plan: 'premium', email: 'a@b.c' });
    await aceptar({ metodo: 'email' }, AUTH);
    eq(store.get('users/u1').plan, 'premium', 'el plan no se degrada:');
    eq(store.get('users/u1').email, 'a@b.c',  'el merge conserva lo demás:');
    assert(!!terminosDe(), 'y sí escribe el consentimiento');
  });

  await ta('cada uid firma lo suyo', async () => {
    store = new Map();
    await aceptar({ metodo: 'email' },  { auth: { uid: 'u1' } });
    await aceptar({ metodo: 'google' }, { auth: { uid: 'u2' } });
    eq(terminosDe('u1').metodo, 'email');
    eq(terminosDe('u2').metodo, 'google');
  });

  console.log('\n' + (fail ? '✗' : '✓') + ' ' + ok + ' pasaron, ' + fail + ' fallaron');
  if (fail) { fallos.forEach(f => console.log('   · ' + f)); process.exit(1); }
})();
