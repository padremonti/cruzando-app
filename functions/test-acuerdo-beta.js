/* Banco de pruebas de aceptarAcuerdoBeta — la firma del grupo piloto.
 *
 * Sin emulador: se cargan los módulos de Firebase de mentira (Module._load) y
 * se prueba el handler REAL exportado por index.js, no una copia. Hermano de
 * test-terminos.js, y con el mismo criterio: lo que se verifica es justo lo
 * que hace de este registro una prueba —fecha del servidor, versión del
 * servidor, correo de la sesión verificada— más lo que lo distingue de aquel:
 * write-once POR VERSIÓN, y el historial que conserva las firmas anteriores.
 *
 * Ejecutar:  node test-acuerdo-beta.js
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

const firmar  = API.aceptarAcuerdoBeta;
const VERSION = '1.0';

function ctx(uid, email) {
  return { auth: { uid: uid || 'u1', token: email === null ? {} : { email: email || 'ana@correo.com' } } };
}
function firmaDe(uid) { return store.get('aceptaciones_beta/' + (uid || 'u1')); }
function userDe(uid)  { return store.get('users/' + (uid || 'u1')) || {}; }

async function codigoDe(fn) {
  try { await fn(); return null; } catch (e) { return e.code; }
}

// ── Pruebas ──────────────────────────────────────────────────────────────────
(async function () {
  console.log('\n── aceptarAcuerdoBeta ──');

  await ta('sin sesión → unauthenticated (nadie firma por otro)', async () => {
    eq(await codigoDe(() => firmar({ nombre: 'Ana Ruiz' }, {})), 'unauthenticated');
  });

  await ta('el nombre es OBLIGATORIO: vacío, en blanco o de dos letras se rechaza', async () => {
    store = new Map();
    eq(await codigoDe(() => firmar({}, ctx())),                'invalid-argument', 'sin nombre:');
    eq(await codigoDe(() => firmar({ nombre: '   ' }, ctx())), 'invalid-argument', 'en blanco:');
    eq(await codigoDe(() => firmar({ nombre: 'Ab' }, ctx())),  'invalid-argument', 'dos letras:');
    assert(!firmaDe(), 'y no debe quedar nada escrito');
  });

  await ta('firma completa, con la forma del modelo de datos', async () => {
    store = new Map();
    const r = await firmar({ nombre: 'Ana Ruiz', version: VERSION }, ctx());
    eq(r, { ok: true, version: VERSION, yaEstaba: false });
    eq(firmaDe(), {
      uid: 'u1', nombre: 'Ana Ruiz', correo: 'ana@correo.com',
      version_acuerdo: VERSION, fecha_aceptacion: TS, aceptado: true
    });
  });

  await ta('la fecha la pone el SERVIDOR, no el reloj del móvil', async () => {
    store = new Map();
    await firmar({ nombre: 'Ana Ruiz', fecha_aceptacion: 'ayer' }, ctx());
    eq(firmaDe().fecha_aceptacion, TS, 'debe ser el serverTimestamp:');
  });

  await ta('la versión la fija el SERVIDOR aunque el cliente mienta', async () => {
    store = new Map();
    const r = await firmar({ nombre: 'Ana Ruiz', version: '99.9' }, ctx());
    eq(firmaDe().version_acuerdo, VERSION);
    eq(r.version, VERSION);
  });

  await ta('el CORREO sale de la sesión verificada, nunca del cuerpo de la llamada', async () => {
    store = new Map();
    await firmar({ nombre: 'Ana Ruiz', correo: 'otra@persona.com', uid: 'u9' }, ctx('u1', 'real@correo.com'));
    eq(firmaDe().correo, 'real@correo.com', 'no puede firmarse a nombre de otra dirección:');
    eq(firmaDe().uid,    'u1',              'ni con otro uid:');
  });

  await ta('sin email en el token, cae al doc de usuario', async () => {
    store = new Map();
    store.set('users/u1', { email: 'delDoc@correo.com', displayName: 'Ana' });
    await firmar({ nombre: 'Ana Ruiz' }, ctx('u1', null));
    eq(firmaDe().correo, 'delDoc@correo.com');
  });

  await ta('el nombre se sanea: espacios, saltos y largo', async () => {
    store = new Map();
    await firmar({ nombre: '  Ana\n\n  María   Ruiz  ' }, ctx());
    eq(firmaDe().nombre, 'Ana María Ruiz');

    store = new Map();
    await firmar({ nombre: 'B'.repeat(300) }, ctx());
    eq(firmaDe().nombre.length, 120, 'se recorta a 120:');
  });

  await ta('WRITE-ONCE POR VERSIÓN: repetir conserva la primera firma', async () => {
    store = new Map();
    await firmar({ nombre: 'Ana Ruiz' }, ctx());
    store.set('aceptaciones_beta/u1', Object.assign({}, firmaDe(), {
      fecha_aceptacion: 'FECHA-ORIGINAL'
    }));

    const r = await firmar({ nombre: 'Otro Nombre' }, ctx());
    eq(r.yaEstaba, true);
    eq(firmaDe().fecha_aceptacion, 'FECHA-ORIGINAL', 'no debe moverse la fecha:');
    eq(firmaDe().nombre,           'Ana Ruiz',       'ni cambiar el nombre:');
  });

  await ta('reintento de la cola: llamar de nuevo es inofensivo', async () => {
    store = new Map();
    await firmar({ nombre: 'Ana Ruiz' }, ctx());
    const antes = JSON.stringify(firmaDe());
    await firmar({ nombre: 'Ana Ruiz' }, ctx());
    await firmar({ nombre: 'Ana Ruiz' }, ctx());
    eq(JSON.stringify(firmaDe()), antes);
  });

  await ta('una versión ANTERIOR sí se vuelve a firmar', async () => {
    store = new Map();
    store.set('aceptaciones_beta/u1', {
      uid: 'u1', nombre: 'Ana Ruiz', correo: 'ana@correo.com',
      version_acuerdo: '0.9', fecha_aceptacion: 'FECHA-VIEJA', aceptado: true
    });
    const r = await firmar({ nombre: 'Ana Ruiz' }, ctx());
    eq(r.yaEstaba, false, 'no puede darse por firmada:');
    eq(firmaDe().version_acuerdo,  VERSION);
    eq(firmaDe().fecha_aceptacion, TS, 'fecha nueva:');
  });

  await ta('la firma anterior NO se pierde: pasa al historial', async () => {
    store = new Map();
    store.set('aceptaciones_beta/u1', {
      uid: 'u1', nombre: 'Ana R.', correo: 'ana@correo.com',
      version_acuerdo: '0.9', fecha_aceptacion: 'FECHA-VIEJA', aceptado: true
    });
    await firmar({ nombre: 'Ana Ruiz' }, ctx());
    eq(firmaDe().historial, [
      { version_acuerdo: '0.9', nombre: 'Ana R.', fecha_aceptacion: 'FECHA-VIEJA' }
    ]);
  });

  await ta('el historial tiene tope: no crece sin límite', async () => {
    store = new Map();
    const viejo = [];
    for (let i = 0; i < 40; i++) viejo.push({ version_acuerdo: 'v' + i, nombre: 'x', fecha_aceptacion: 'f' });
    store.set('aceptaciones_beta/u1', {
      uid: 'u1', nombre: 'Ana', version_acuerdo: '0.9',
      fecha_aceptacion: 'F', aceptado: true, historial: viejo
    });
    await firmar({ nombre: 'Ana Ruiz' }, ctx());
    eq(firmaDe().historial.length, 20, 'se recorta a 20:');
    eq(firmaDe().historial[0].version_acuerdo, '0.9', 'y la más reciente va primero:');
  });

  await ta('una firma con aceptado:false no cuenta como firmada', async () => {
    store = new Map();
    store.set('aceptaciones_beta/u1', {
      uid: 'u1', version_acuerdo: VERSION, aceptado: false, fecha_aceptacion: 'X'
    });
    const r = await firmar({ nombre: 'Ana Ruiz' }, ctx());
    eq(r.yaEstaba, false);
    eq(firmaDe().aceptado, true);
  });

  await ta('displayName vacío se rellena con el nombre firmado', async () => {
    store = new Map();
    store.set('users/u1', { plan: 'beta', email: 'ana@correo.com', displayName: '' });
    await firmar({ nombre: 'Ana Ruiz' }, ctx());
    eq(userDe().displayName, 'Ana Ruiz');
    eq(userDe().plan, 'beta', 'y el merge no toca el plan:');
  });

  await ta('displayName existente NO se cambia nunca', async () => {
    store = new Map();
    store.set('users/u1', { plan: 'beta', displayName: 'Anita' });
    await firmar({ nombre: 'Ana Ruiz' }, ctx());
    eq(userDe().displayName, 'Anita');
  });

  await ta('la firma NO toca el plan ni degrada la cuenta', async () => {
    store = new Map();
    store.set('users/u1', { plan: 'premium', displayName: 'Ana', email: 'a@b.c' });
    await firmar({ nombre: 'Ana Ruiz' }, ctx());
    eq(userDe().plan,  'premium');
    eq(userDe().email, 'a@b.c');
  });

  await ta('cada uid firma lo suyo', async () => {
    store = new Map();
    await firmar({ nombre: 'Ana Ruiz' },  ctx('u1', 'ana@correo.com'));
    await firmar({ nombre: 'Luis Paz' },  ctx('u2', 'luis@correo.com'));
    eq(firmaDe('u1').nombre, 'Ana Ruiz');
    eq(firmaDe('u2').nombre, 'Luis Paz');
    eq(firmaDe('u2').correo, 'luis@correo.com');
  });

  await ta('el doc vive en aceptaciones_beta/{uid}, no en users', async () => {
    store = new Map();
    await firmar({ nombre: 'Ana Ruiz' }, ctx());
    assert(store.has('aceptaciones_beta/u1'), 'la colección de primer nivel es la que se lista');
    assert(!userDe().terminos, 'y no se mezcla con el consentimiento del alta');
  });

  console.log('\n' + (fail ? '✗' : '✓') + ' ' + ok + ' pasaron, ' + fail + ' fallaron');
  if (fail) { fallos.forEach(f => console.log('   · ' + f)); process.exit(1); }
})();
