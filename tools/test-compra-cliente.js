/* Banco de pruebas del regreso de Stripe en sanar.html (Pieza 5, lado cliente).
 *
 * No copia el código: lo EXTRAE del propio sanar.html y lo ejecuta en un vm con
 * los globales necesarios simulados. Así lo que se prueba es exactamente lo que
 * se despliega — si alguien edita esas funciones, esto lo acusa.
 *
 * Ejecutar:  node tools/test-compra-cliente.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'sanar.html'), 'utf8');

// ── extracción por llaves equilibradas ───────────────────────────────────────
function extraer(decl) {
  const i = HTML.indexOf(decl);
  if (i === -1) throw new Error('no se encontró en sanar.html: ' + decl);
  let j = HTML.indexOf('{', i), prof = 0;
  for (let k = j; k < HTML.length; k++) {
    if (HTML[k] === '{') prof++;
    else if (HTML[k] === '}') { prof--; if (prof === 0) return HTML.slice(i, k + 1); }
  }
  throw new Error('llaves sin cerrar en ' + decl);
}
function extraerConst(nombre) {
  const re = new RegExp('var ' + nombre + '\\s*=\\s*\\{[\\s\\S]*?\\n  \\};');
  const m = HTML.match(re);
  if (!m) throw new Error('no se encontró la constante ' + nombre);
  return m[0];
}

// ── mini framework ───────────────────────────────────────────────────────────
let ok = 0, fail = 0; const fallos = [];
function t(nombre, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nombre); }
  catch (e) { fail++; fallos.push(nombre + ' → ' + e.message);
              console.log('  ✗ ' + nombre + '\n      ' + e.message); }
}
function eq(a, b, msg) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg || '') + ' esperado ' + sb + ', obtenido ' + sa);
}
function assert(c, msg) { if (!c) throw new Error(msg || 'assert falló'); }

// ── almacenamiento de mentira ────────────────────────────────────────────────
function makeStorage(rompe) {
  const m = new Map();
  return {
    getItem: k => { if (rompe) throw new Error('bloqueado'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (rompe) throw new Error('bloqueado'); m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    _m: m
  };
}

// ── sandbox ──────────────────────────────────────────────────────────────────
function crearEntorno(opts) {
  opts = opts || {};
  const sandbox = {
    URLSearchParams, JSON, Date, Array, Math, console,
    sessionStorage: opts.session || makeStorage(false),
    localStorage:   opts.local   || makeStorage(false),
    location: { search: opts.search || '', pathname: '/sanar.html' },
    history:  { replaceState: function () { sandbox._replaced = true; } },
    // estado y catálogos, con la misma forma que en sanar.html
    estado: {
      fase: 'elenco', painSel: null, misterioSel: null,
      senales: [], pasoAcogida: 0, elencoRecentrar: null, _hoInstant: false
    },
    painById: opts.painById || {},
    misterioByMid: opts.misterioByMid || {},
    _replaced: false
  };
  vm.createContext(sandbox);

  const fuente = [
    extraerConst('_MAPA_COMPRA'),
    "var COMPRA_KEY = 'cruzando_compra';",
    extraer('function _guardarCompraPendiente()'),
    extraer('function _leerCompraPendiente()'),
    extraer('function _limpiarCompraPendiente()'),
    extraer('function _paramsCompra()'),
    extraer('function _limpiarUrlCompra()'),
    extraer('function _restaurarTrasCompra(')
  ].join('\n');

  vm.runInContext(fuente, sandbox);
  return sandbox;
}

// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── 1 · Lectura de los parámetros del regreso');

t('compra=ok con sid y pain', () => {
  const s = crearEntorno({ search: '?compra=ok&sid=cs_test_9&pain=010101a' });
  eq(s._paramsCompra(), { tipo: 'creditos', exito: true, sid: 'cs_test_9', painId: '010101a' });
});

t('compra=cancel → mismo dolor, sin éxito', () => {
  const s = crearEntorno({ search: '?compra=cancel&pain=010101a' });
  const r = s._paramsCompra();
  eq(r.exito, false); eq(r.painId, '010101a'); eq(r.tipo, 'creditos');
});

t('checkout=success (suscripción) se reconoce como tipo sub', () => {
  const s = crearEntorno({ search: '?checkout=success&sid=cs_test_1&pain=010101a' });
  const r = s._paramsCompra();
  eq(r.tipo, 'sub'); eq(r.exito, true);
});

t('checkout=cancel → sub sin éxito', () => {
  const s = crearEntorno({ search: '?checkout=cancel' });
  eq(s._paramsCompra().exito, false);
});

t('sin parámetros → null (arranque normal, no se toca nada)', () => {
  const s = crearEntorno({ search: '' });
  eq(s._paramsCompra(), null);
});

t('?rehacer=1 no se confunde con un regreso de compra', () => {
  const s = crearEntorno({ search: '?rehacer=1' });
  eq(s._paramsCompra(), null);
});

t('limpiarUrlCompra borra la query (un refresh no re-dispara)', () => {
  const s = crearEntorno({ search: '?compra=ok&sid=cs_1' });
  s._limpiarUrlCompra();
  assert(s._replaced, 'debía llamar a history.replaceState');
});

console.log('\n── 2 · El estado sobrevive al viaje a Stripe');

function entornoConDatos(opts) {
  const mist = { mid: '010101', titulo: 'La Anunciación', acogida: [{}, {}] };
  const pain = { id: '010101a', texto: 'me siento solo', mid: '010101', misterio: mist };
  return crearEntorno(Object.assign({
    painById: { '010101a': pain },
    misterioByMid: { '010101': mist }
  }, opts || {}));
}

t('guarda pain, misterio, ecos y paso antes de saltar', () => {
  const s = entornoConDatos();
  s.estado.painSel     = s.painById['010101a'];
  s.estado.misterioSel = s.misterioByMid['010101'];
  s.estado.senales     = [{ tipo: 'corazones', valor: 3, eco: 'Dios ve tu soledad' }];
  s.estado.pasoAcogida = 2;
  s._guardarCompraPendiente();

  const d = s._leerCompraPendiente();
  eq(d.painId, '010101a');
  eq(d.mid, '010101');
  eq(d.senales.length, 1);
  eq(d.pasoAcogida, 2);
  assert(s.sessionStorage._m.has('cruzando_compra'), 'debe estar en sessionStorage');
  assert(s.localStorage._m.has('cruzando_compra'),   'y el espejo en localStorage');
});

t('restaura el handoff completo, sin coreografía', () => {
  const s = entornoConDatos();
  const pend = { painId: '010101a', mid: '010101', pasoAcogida: 1,
                 senales: [{ eco: 'un eco' }], ts: Date.now() };
  eq(s._restaurarTrasCompra(pend, null), true);
  eq(s.estado.fase, 'handoff');
  eq(s.estado.painSel.id, '010101a');
  eq(s.estado.misterioSel.mid, '010101');
  eq(s.estado.senales.length, 1, 'los ecos vuelven:');
  eq(s.estado._hoInstant, true, 'sin repetir los 8s de animación:');
});

t('sin rastro guardado pero con pain en la URL → handoff igualmente', () => {
  const s = entornoConDatos();
  eq(s._restaurarTrasCompra(null, '010101a'), true);
  eq(s.estado.fase, 'handoff');
  eq(s.estado.misterioSel.mid, '010101', 'el misterio se deriva del pain:');
  eq(s.estado.senales, [], 'sin ecos, pero con el botón de entrar:');
});

t('pain desconocido → no restaura (el llamador manda al elenco)', () => {
  const s = entornoConDatos();
  eq(s._restaurarTrasCompra(null, '999999z'), false);
  eq(s.estado.fase, 'elenco', 'la fase no se toca:');
});

t('sin pain por ningún lado → no restaura', () => {
  const s = entornoConDatos();
  eq(s._restaurarTrasCompra(null, null), false);
});

t('el rastro caduca a los 30 min (no revive un handoff de ayer)', () => {
  const s = entornoConDatos();
  const viejo = JSON.stringify({ painId: '010101a', mid: '010101', senales: [],
                                 pasoAcogida: 0, ts: Date.now() - 31 * 60 * 1000 });
  s.sessionStorage.setItem('cruzando_compra', viejo);
  eq(s._leerCompraPendiente(), null);
});

t('cae al espejo de localStorage si sessionStorage está vacío (otra pestaña)', () => {
  const s = entornoConDatos();
  s.estado.painSel = s.painById['010101a'];
  s.estado.misterioSel = s.misterioByMid['010101'];
  s._guardarCompraPendiente();
  s.sessionStorage._m.clear();                  // como si Stripe abriera en otra pestaña
  const d = s._leerCompraPendiente();
  assert(d && d.painId === '010101a', 'el espejo debe salvar el caso');
});

t('con el almacenamiento bloqueado (Safari privado) no revienta', () => {
  const s = crearEntorno({ session: makeStorage(true), local: makeStorage(true),
                           painById: {}, misterioByMid: {} });
  s.estado.painSel = { id: '010101a', misterio: { mid: '010101' } };
  s._guardarCompraPendiente();                  // no debe lanzar
  eq(s._leerCompraPendiente(), null);           // simplemente no hay rastro
});

t('limpiar borra los dos almacenamientos', () => {
  const s = entornoConDatos();
  s.estado.painSel = s.painById['010101a'];
  s.estado.misterioSel = s.misterioByMid['010101'];
  s._guardarCompraPendiente();
  s._limpiarCompraPendiente();
  eq(s._leerCompraPendiente(), null);
  assert(!s.localStorage._m.has('cruzando_compra'), 'el espejo también');
});

t('datos corruptos en el almacenamiento → null, sin excepción', () => {
  const s = entornoConDatos();
  s.sessionStorage.setItem('cruzando_compra', '{esto no es json');
  eq(s._leerCompraPendiente(), null);
});

console.log('\n── 3 · El mapa de botones');

t('los 5 botones de la pantalla sin-créditos están mapeados', () => {
  const s = crearEntorno({});
  eq(s._MAPA_COMPRA['paquete-5'],   { tipo: 'creditos', clave: 'p5' });
  eq(s._MAPA_COMPRA['paquete-15'],  { tipo: 'creditos', clave: 'p15' });
  eq(s._MAPA_COMPRA['paquete-25'],  { tipo: 'creditos', clave: 'p25' });
  eq(s._MAPA_COMPRA['sub-mensual'], { tipo: 'sub', clave: 'mensual' });
  eq(s._MAPA_COMPRA['sub-anual'],   { tipo: 'sub', clave: 'anual' });
});

t('las claves del cliente coinciden con las del servidor', () => {
  const ECO = require('../functions/economia.js');
  const s = crearEntorno({});
  Object.keys(s._MAPA_COMPRA).forEach(function (k) {
    const m = s._MAPA_COMPRA[k];
    if (m.tipo !== 'creditos') return;
    assert(ECO.PAQUETES[m.clave],
           'el cliente ofrece "' + m.clave + '" y el servidor no lo conoce');
  });
});

t('los importes anunciados en la UI cuadran con la tabla del servidor', () => {
  const ECO = require('../functions/economia.js');
  // PAQUETES de sanar.html: [{n:5,precio:'$50 MXN'}, ...]
  const m = HTML.match(/var PAQUETES = \[([\s\S]*?)\];/);
  assert(m, 'no se encontró la tabla PAQUETES de sanar.html');
  const filas = [...m[1].matchAll(/n:\s*(\d+),\s*precio:'\$([\d,]+)/g)];
  eq(filas.length, 3, 'debe haber 3 paquetes en la UI:');
  filas.forEach(function (f) {
    const n      = Number(f[1]);
    const pesos  = Number(f[2].replace(/,/g, ''));
    const clave  = 'p' + n;
    assert(ECO.PAQUETES[clave], 'la UI ofrece ' + n + ' créditos y el servidor no tiene ' + clave);
    eq(ECO.PAQUETES[clave].creditos, n, 'créditos de ' + clave + ':');
    eq(ECO.PAQUETES[clave].montoEsperado, pesos * 100,
       'la UI anuncia $' + pesos + ' para ' + clave + ' y el servidor espera otra cosa:');
  });
});

// ── resultado ────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(64));
console.log(fail === 0 ? '  TODO VERDE — ' + ok + ' pruebas' : '  ' + ok + ' ok · ' + fail + ' FALLOS');
if (fail) { fallos.forEach(f => console.log('   · ' + f)); process.exitCode = 1; }
console.log('─'.repeat(64) + '\n');
