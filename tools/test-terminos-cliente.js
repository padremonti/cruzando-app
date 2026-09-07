/* Banco de pruebas de la aceptación de términos en el cliente (index/crecer).
 *
 * No copia el código: lo EXTRAE de index.html y lo ejecuta en un vm con el DOM
 * y el almacenamiento simulados — igual que tools/test-compra-cliente.js. Lo
 * que se prueba es exactamente lo que se despliega.
 *
 * Cubre lo que sostiene la mejora: que la casilla NUNCA nazca marcada, que sin
 * ella no pase el alta por ninguno de los dos métodos, que "Entrar" no la pida,
 * y que la cola de reintento no le regale el consentimiento a otra persona.
 *
 * Ejecutar:  node tools/test-terminos-cliente.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const RAIZ  = path.join(__dirname, '..');
const INDEX = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const CRECER = fs.readFileSync(path.join(RAIZ, 'crecer.html'), 'utf8');

const INI = '// ── Consentimiento de términos';
const FIN = '// ── Login Google';

function extraer(html, archivo) {
  const i = html.indexOf(INI), j = html.indexOf(FIN);
  if (i === -1 || j === -1 || j <= i) throw new Error('no se localizó el bloque en ' + archivo);
  return html.slice(i, j);
}

const CODIGO = extraer(INDEX, 'index.html');

// ── mini framework ───────────────────────────────────────────────────────────
let ok = 0, fail = 0; const fallos = [];
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

// ── DOM de mentira ───────────────────────────────────────────────────────────
const IDS = ['login-terms', 'terms-error', 'chk-terminos', 'login-paths',
             'login-providers', 'login-sub', 'btn-path-entrar', 'btn-path-crear',
             'btn-login-back'];

function elemento(id) {
  const clases = new Set();
  const el = {
    id: id, checked: false, textContent: '',
    style: { display: '' },
    _ev: {},
    classList: {
      add:      function (c) { clases.add(c); },
      remove:   function (c) { clases.delete(c); },
      contains: function (c) { return clases.has(c); }
    }
  };
  el.addEventListener = function (ev, fn) { (el._ev[ev] = el._ev[ev] || []).push(fn); };
  el.disparar = function (ev) { (el._ev[ev] || []).forEach(function (f) { f.call(el); }); };
  return el;
}

function makeStorage() {
  const m = new Map();
  return {
    getItem:    function (k) { return m.has(k) ? m.get(k) : null; },
    setItem:    function (k, v) { m.set(k, String(v)); },
    removeItem: function (k) { m.delete(k); },
    _m: m
  };
}

// ── sandbox ──────────────────────────────────────────────────────────────────
function crearEntorno(opts) {
  opts = opts || {};
  const els = {};
  IDS.forEach(function (id) { els[id] = elemento(id); });

  const llamadas = [];
  const s = {
    console: { warn: function () {}, log: function () {} },
    document: { getElementById: function (id) { return els[id] || null; } },
    localStorage: makeStorage(),
    auth: { currentUser: opts.user || null },
    fbApp: {},
    ensureUserDoc: function (u) {
      llamadas.push({ tipo: 'ensureUserDoc', uid: u && u.uid });
      return Promise.resolve({});
    },
    __fbFunctionsMod: function () {
      return Promise.resolve({
        getFunctions: function () { return {}; },
        httpsCallable: function (svc, nombre) {
          return function (payload) {
            llamadas.push({ tipo: 'callable', nombre: nombre, payload: payload });
            if (opts.fallaRed) return Promise.reject(new Error('sin red'));
            return Promise.resolve({ data: { ok: true } });
          };
        }
      });
    },
    Date: Date, JSON: JSON, Promise: Promise
  };

  // El import dinámico de gstatic no existe en node: se inyecta el módulo.
  const codigo = CODIGO.replace(
    /await import\('https:\/\/www\.gstatic\.com[^']*'\)/,
    'await __fbFunctionsMod()');
  assert(codigo.indexOf('__fbFunctionsMod()') !== -1, 'no se pudo inyectar el módulo de functions');

  vm.runInNewContext(codigo, s);
  s._els = els;
  s._llamadas = llamadas;
  return s;
}

// ── Pruebas ──────────────────────────────────────────────────────────────────
(async function () {
  console.log('\n── La casilla: nunca premarcada ──');

  await ta('el camino del alta abre con la casilla SIN marcar', () => {
    const s = crearEntorno();
    s._els['chk-terminos'].checked = true;      // sucia de antes
    s.abrirCamino('register');
    eq(s._els['chk-terminos'].checked, false);
  });

  await ta('volver a entrar al alta la vuelve a desmarcar', () => {
    const s = crearEntorno();
    s.abrirCamino('register');
    s._els['chk-terminos'].checked = true;
    s.mostrarCaminos();
    s.abrirCamino('register');
    eq(s._els['chk-terminos'].checked, false);
  });

  console.log('\n── La puerta del alta ──');

  await ta('alta sin casilla → BLOQUEADA y con aviso visible', () => {
    const s = crearEntorno();
    s.abrirCamino('register');
    eq(s.terminosAceptados(), false);
    assert(s._els['login-terms'].classList.contains('warn'), 'la casilla debe marcarse en rojo');
    assert(s._els['terms-error'].classList.contains('on'), 'el aviso debe verse');
    assert(/Términos/.test(s._els['terms-error'].textContent), 'y decir qué falta');
  });

  await ta('alta con casilla → pasa', () => {
    const s = crearEntorno();
    s.abrirCamino('register');
    s._els['chk-terminos'].checked = true;
    eq(s.terminosAceptados(), true);
  });

  await ta('marcar la casilla borra el aviso', () => {
    const s = crearEntorno();
    s.abrirCamino('register');
    s.terminosAceptados();                       // deja el aviso puesto
    s._els['chk-terminos'].checked = true;
    s._els['chk-terminos'].disparar('change');
    assert(!s._els['login-terms'].classList.contains('warn'), 'sin rojo');
    assert(!s._els['terms-error'].classList.contains('on'), 'sin aviso');
  });

  await ta('ENTRAR no pide casilla: cero fricción para quien vuelve', () => {
    const s = crearEntorno();
    s.abrirCamino('login');
    eq(s.terminosAceptados(), true);
    eq(s._els['login-terms'].style.display, 'none', 'la casilla ni se muestra:');
  });

  await ta('la pantalla arranca en los dos caminos, en modo login', () => {
    const s = crearEntorno();
    s.mostrarCaminos();
    eq(s._els['login-paths'].style.display, '');
    eq(s._els['login-providers'].style.display, 'none');
    eq(s.terminosAceptados(), true);
  });

  await ta('el aviso del alta accidental se sostiene hasta la siguiente decisión', () => {
    const s = crearEntorno();
    s._avisoAlta = true;                          // como tras _deshacerAltaAccidental
    s._els['btn-path-crear'].disparar('click');   // la persona decide
    eq(s._avisoAlta, false, 'el aviso se baja al elegir camino:');
  });

  console.log('\n── La cola de consentimiento ──');

  await ta('sin nada pendiente no llama a nadie', async () => {
    const s = crearEntorno({ user: { uid: 'u1' } });
    await s.flushConsentimiento();
    eq(s._llamadas.length, 0);
  });

  await ta('alta → anota la cola con uid, método y versión', () => {
    const s = crearEntorno();
    s.marcarConsentimientoPendiente('google', 'u1');
    const p = JSON.parse(s.localStorage.getItem('cruzando_consent_pending'));
    eq(p.uid, 'u1'); eq(p.metodo, 'google'); eq(p.version, '2026-09');
  });

  await ta('flush: doc de usuario ANTES que la callable', async () => {
    const s = crearEntorno({ user: { uid: 'u1' } });
    s.marcarConsentimientoPendiente('email', 'u1');
    await s.flushConsentimiento();
    eq(s._llamadas.map(l => l.tipo), ['ensureUserDoc', 'callable']);
    eq(s._llamadas[1].nombre, 'aceptarTerminos');
    eq(s._llamadas[1].payload, { version: '2026-09', metodo: 'email' });
  });

  await ta('flush exitoso vacía la cola', async () => {
    const s = crearEntorno({ user: { uid: 'u1' } });
    s.marcarConsentimientoPendiente('email', 'u1');
    await s.flushConsentimiento();
    eq(s.localStorage.getItem('cruzando_consent_pending'), null);
  });

  await ta('si falla la red la cola SOBREVIVE para el próximo arranque', async () => {
    const s = crearEntorno({ user: { uid: 'u1' }, fallaRed: true });
    s.marcarConsentimientoPendiente('email', 'u1');
    await s.flushConsentimiento();
    assert(s.localStorage.getItem('cruzando_consent_pending') !== null,
           'el pendiente debe seguir ahí');
  });

  await ta('otro uid en el mismo dispositivo NO hereda el consentimiento', async () => {
    const s = crearEntorno({ user: { uid: 'OTRO' } });
    s.marcarConsentimientoPendiente('email', 'u1');
    await s.flushConsentimiento();
    eq(s._llamadas.length, 0, 'no debe llamar a la callable:');
    assert(s.localStorage.getItem('cruzando_consent_pending') !== null,
           'y el pendiente sigue esperando a su dueño');
  });

  await ta('sin sesión resuelta todavía, no hace nada (espera al reintento)', async () => {
    const s = crearEntorno({ user: null });
    s.marcarConsentimientoPendiente('email', 'u1');
    await s.flushConsentimiento();
    eq(s._llamadas.length, 0);
  });

  await ta('dos flush a la vez → una sola llamada (guardia en vuelo)', async () => {
    const s = crearEntorno({ user: { uid: 'u1' } });
    s.marcarConsentimientoPendiente('email', 'u1');
    await Promise.all([s.flushConsentimiento(), s.flushConsentimiento()]);
    eq(s._llamadas.filter(l => l.tipo === 'callable').length, 1);
  });

  console.log('\n── Los gemelos ──');

  await ta('crecer.html lleva el MISMO bloque que index.html', () => {
    eq(extraer(CRECER, 'crecer.html'), CODIGO,
       'index y crecer deben quedar idénticos en esto:');
  });

  console.log('\n' + (fail ? '✗' : '✓') + ' ' + ok + ' pasaron, ' + fail + ' fallaron');
  if (fail) { fallos.forEach(f => console.log('   · ' + f)); process.exit(1); }
})();
