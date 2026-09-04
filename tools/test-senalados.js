/* Banco de pruebas de las SEÑALES del elenco (el listón) — sanar.html.
 *
 * No copia el código: lo EXTRAE de sanar.html y lo ejecuta en un vm con el
 * almacenamiento, el DOM y Firestore simulados — el patrón de
 * tools/test-terminos-cliente.js. Lo que se prueba es lo que se despliega.
 *
 * Cubre lo que sostiene la función:
 *   · que una señal puesta SIN RED sobreviva a reabrir la app (y una quitada
 *     no reviva) — de ahí que la fusión dé prioridad a la cola local;
 *   · que la escritura sea POR CLAVE con merge, porque mini.html escribe
 *     `pains` en ese mismo documento y mandar el mapa entero podría pisarle
 *     una marca de rezado hecha en el mismo instante;
 *   · que quitar BORRE la clave en vez de dejar una lápida;
 *   · que señalar NO re-renderice el elenco (el wheel volvería al principio);
 *   · que el modo NO esté cerrado por plan: señalar es de todos.
 *
 * Ejecutar:  node tools/test-senalados.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const RAIZ  = path.join(__dirname, '..');
const SANAR = fs.readFileSync(path.join(RAIZ, 'sanar.html'), 'utf8');

// ── mini framework ───────────────────────────────────────────────────────────
let ok = 0, fail = 0; const fallos = [];
async function t(nombre, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + nombre); }
  catch (e) { fail++; fallos.push(nombre + ' → ' + e.message);
              console.log('  ✗ ' + nombre + '\n      ' + e.message); }
}
function eq(a, b, msg) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg || '') + ' esperado ' + sb + ', obtenido ' + sa);
}
function assert(c, msg) { if (!c) throw new Error(msg || 'assert fallo'); }

// ── extracción ───────────────────────────────────────────────────────────────
function entre(ini, fin, que) {
  const i = SANAR.indexOf(ini), j = SANAR.indexOf(fin);
  if (i === -1 || j === -1 || j <= i) throw new Error('no se localizo ' + que);
  return SANAR.slice(i, j);
}
// Cuerpo completo de una función, balanceando llaves desde su primera '{'.
function cuerpo(firma) {
  const i = SANAR.indexOf(firma);
  if (i === -1) throw new Error('no existe ' + firma);
  let n = 0, j = SANAR.indexOf('{', i);
  const desde = j;
  for (; j < SANAR.length; j++) {
    if (SANAR[j] === '{') n++;
    else if (SANAR[j] === '}') { n--; if (!n) return SANAR.slice(desde, j + 1); }
  }
  throw new Error('sin cierre: ' + firma);
}

const BLOQUE = entre('  // ── Señales · el listón',
                     '  // Escritura: localStorage primero', 'el bloque de senales')
  + '\nfunction _ordenPorSenal(list)' + cuerpo('function _ordenPorSenal(list)') + '\n';

// ── entorno de mentira ───────────────────────────────────────────────────────
function montar(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.local || {});
  const escrituras = [];
  const resolverSet = opts.setDocFalla
    ? () => Promise.reject(new Error('sin red'))
    : () => Promise.resolve();

  const badge = { textContent: '', hidden: false };
  const sandbox = {
    Date, JSON, Object, Promise, Set, console,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); }
    },
    document: {
      getElementById: (id) =>
        (opts.sinBadge ? null : (id === 'mode-badge-senalados' ? badge : null))
    },
    window: {
      _obUID: opts.sinUid ? null : 'u1',
      _fbFirestore: opts.sinShim ? null : {
        doc: function (db) {
          return { path: Array.prototype.slice.call(arguments, 1).join('/') };
        },
        getDoc: () => Promise.resolve(
          opts.remoto === undefined
            ? { exists: false }
            : { exists: true, data: () => opts.remoto }),
        setDoc: (ref, data, o) => {
          escrituras.push({ path: ref.path, data: data, opts: o });
          return resolverSet();
        },
        deleteField: () => '<<DELETE>>',
        serverTimestamp: () => '<<TS>>'
      }
    },
    _db: {},
    __out: {}
  };
  vm.createContext(sandbox);
  vm.runInContext(BLOQUE + [
    '__out = {',
    '  fusionar:_fusionarSenales, senalar:_senalar, esta:_estaSenalado,',
    '  num:_numSenales, escribir:_escribirSenal, retry:_retrySenales,',
    '  contador:_pintarContadorSenal, cargar:_cargarSanar, orden:_ordenPorSenal,',
    '  lee:function(){ return _senales; }, pon:function(v){ _senales = v; }',
    '};'
  ].join('\n'), sandbox);

  return {
    api: sandbox.__out, store, escrituras, badge,
    local: () => JSON.parse(store['cruzando_senalados'] || '{}')
  };
}

async function main() {

console.log('\n── Fusion (Firestore manda, salvo la cola local) ──');

await t('remoto vacio y sin cola → nada', () => {
  const { api } = montar();
  eq(api.fusionar({}, { items: {}, pend: {} }), {});
});

await t('remoto manda cuando no hay cola', () => {
  const { api } = montar();
  const out = api.fusionar({ a: { at: 1 }, b: { at: 2 } }, { items: {}, pend: {} });
  eq(Object.keys(out).sort(), ['a', 'b']);
});

await t('senal puesta SIN RED sobrevive a reabrir la app', () => {
  const { api } = montar();
  const out = api.fusionar({}, { items: { a: { at: 9 } }, pend: { a: 1 } });
  eq(out.a, { at: 9 }, 'la cola local debe imponerse sobre el remoto');
});

await t('senal quitada SIN RED no revive', () => {
  const { api } = montar();
  const out = api.fusionar({ a: { at: 1 } }, { items: {}, pend: { a: 0 } });
  assert(!out.a, 'una baja no subida no puede volver del remoto');
});

await t('una lapida antigua (null) se descarta al leer', () => {
  const { api } = montar();
  eq(api.fusionar({ a: null, b: { at: 2 } }, { items: {}, pend: {} }), { b: { at: 2 } });
});

console.log('\n── Orden: recencia de la senal ──');

await t('lo ultimo senalado va primero', () => {
  const { api } = montar();
  api.pon({ a: { at: 10 }, b: { at: 30 }, c: { at: 20 } });
  eq(api.orden([{ id: 'a' }, { id: 'b' }, { id: 'c' }]).map((p) => p.id), ['b', 'c', 'a']);
});

await t('no muta la lista que recibe', () => {
  const { api } = montar();
  api.pon({ a: { at: 1 }, b: { at: 2 } });
  const orig = [{ id: 'a' }, { id: 'b' }];
  api.orden(orig);
  eq(orig.map((p) => p.id), ['a', 'b']);
});

await t('un pain sin senal cae al final', () => {
  const { api } = montar();
  api.pon({ a: { at: 5 } });
  eq(api.orden([{ id: 'z' }, { id: 'a' }]).map((p) => p.id), ['a', 'z']);
});

console.log('\n── Alternar ──');

await t('senalar y quitar cambian el estado y la cuenta', () => {
  const { api } = montar();
  api.senalar('p1', true);
  assert(api.esta('p1'), 'deberia quedar senalado');
  eq(api.num(), 1);
  api.senalar('p1', false);
  assert(!api.esta('p1'), 'deberia quedar sin senal');
  eq(api.num(), 0);
});

await t('el espejo local guarda item y cola', () => {
  const m = montar();
  m.api.senalar('p1', true);
  const l = m.local();
  assert(l.items.p1, 'falta el item local');
  eq(l.pend.p1, 1, 'la cola debe marcar la puesta');
});

await t('quitar deja la cola en 0 (si no, la baja nunca subiria)', () => {
  const m = montar();
  m.api.senalar('p1', true);
  m.api.senalar('p1', false);
  eq(m.local().pend.p1, 0);
  assert(!m.local().items.p1, 'el item local debe irse');
});

console.log('\n── Escritura a Firestore ──');

await t('escribe POR CLAVE, nunca el mapa entero (mini comparte el doc)', () => {
  const m = montar();
  m.api.pon({ viejo: { at: 1 } });
  m.api.senalar('p1', true);
  eq(Object.keys(m.escrituras[0].data), ['senalados']);
  eq(Object.keys(m.escrituras[0].data.senalados), ['p1'],
     'solo la clave tocada puede viajar');
});

await t('va con merge:true', () => {
  const m = montar();
  m.api.senalar('p1', true);
  eq(m.escrituras[0].opts, { merge: true });
});

await t('al documento progress/sanar del usuario', () => {
  const m = montar();
  m.api.senalar('p1', true);
  eq(m.escrituras[0].path, 'users/u1/progress/sanar');
});

await t('quitar usa deleteField, no una lapida null', () => {
  const m = montar();
  m.api.senalar('p1', false);
  eq(m.escrituras[0].data.senalados.p1, '<<DELETE>>');
});

await t('at es del cliente, no serverTimestamp', () => {
  const m = montar();
  m.api.senalar('p1', true);
  assert(typeof m.escrituras[0].data.senalados.p1.at === 'number',
         'un serverTimestamp no se puede leer de vuelta para ordenar');
});

await t('confirmada la escritura, se limpia la cola', async () => {
  const m = montar();
  m.api.senalar('p1', true);
  await Promise.resolve(); await Promise.resolve();
  assert(!('p1' in m.local().pend), 'la cola deberia vaciarse al confirmar');
});

await t('si Firestore falla, la cola SIGUE', async () => {
  const m = montar({ setDocFalla: true });
  m.api.senalar('p1', true);
  await Promise.resolve(); await Promise.resolve();
  eq(m.local().pend.p1, 1, 'una senal no puede perderse por red');
});

await t('sin uid no revienta y la cola queda pendiente', () => {
  const m = montar({ sinUid: true });
  m.api.senalar('p1', true);
  eq(m.escrituras.length, 0);
  eq(m.local().pend.p1, 1);
});

await t('_retrySenales reintenta lo pendiente en los dos sentidos', () => {
  const m = montar({ local: { cruzando_senalados:
    JSON.stringify({ items: { a: { at: 1 } }, pend: { a: 1, b: 0 } }) } });
  m.api.retry();
  eq(m.escrituras.length, 2);
  const porId = {};
  m.escrituras.forEach((e) => Object.assign(porId, e.data.senalados));
  assert(porId.a && porId.a.at, 'a deberia reintentar la puesta');
  eq(porId.b, '<<DELETE>>', 'b deberia reintentar la baja');
});

console.log('\n── Lectura: UNA sola, dos conjuntos ──');

await t('_cargarSanar devuelve completados y senales del mismo snapshot', async () => {
  const m = montar({ remoto: { pains: { x: {} }, senalados: { y: { at: 3 } } } });
  const r = await m.api.cargar({ uid: 'u1' });
  eq(Array.from(r.completados), ['x']);
  eq(Object.keys(r.senalados), ['y']);
});

await t('sin documento no rompe: conjuntos vacios', async () => {
  const m = montar();
  const r = await m.api.cargar({ uid: 'u1' });
  eq(Array.from(r.completados), []);
  eq(r.senalados, {});
});

await t('sin shim de Firestore, las senales locales siguen valiendo', async () => {
  const m = montar({ sinShim: true, local: { cruzando_senalados:
    JSON.stringify({ items: { a: { at: 1 } }, pend: { a: 1 } }) } });
  const r = await m.api.cargar({ uid: 'u1' });
  eq(Object.keys(r.senalados), ['a']);
});

console.log('\n── El contador es quirurgico ──');

await t('pinta la cifra y la oculta en 0', () => {
  const m = montar();
  m.api.senalar('p1', true);
  eq(m.badge.textContent, 1);
  eq(m.badge.hidden, false);
  m.api.senalar('p1', false);
  eq(m.badge.hidden, true, 'un 0 no se ensena');
});

await t('sin el nodo en pantalla no lanza', () => {
  const m = montar({ sinBadge: true });
  m.api.senalar('p1', true);
  eq(m.api.num(), 1);
});

console.log('\n── Guardas sobre sanar.html ──');

await t('senalar NO llama a render(): el wheel perderia el scroll', () => {
  const c = cuerpo('function _senalar(id, on)');
  assert(!/[^a-zA-Z_.]render\s*\(/.test(c),
         'render() dentro de _senalar remontaria el elenco desde el principio');
  assert(/_pintarContadorSenal\s*\(/.test(c), 'debe actualizar la cifra a mano');
});

await t('el boton del velo no cierra el velo', () => {
  const c = cuerpo('function abrirFoco(painId)');
  const i = c.indexOf('sen.addEventListener');
  assert(i !== -1, 'no se encontro el cableado del liston');
  // Acotado al cuerpo del listener: pasarse una linea recogeria el cerrarFoco
  // de _focoEsc, que va justo despues y es legitimo.
  const j = c.indexOf('});', i);
  assert(j !== -1, 'listener sin cierre');
  const trozo = c.slice(i, j);
  assert(!/cerrarFoco/.test(trozo), 'senalar no puede cerrar el velo');
  assert(/pintarSen\s*\(\)/.test(trozo), 'debe repintar su propio estado');
});

await t('la tarjeta del elenco NO se marca (el estado se lee en el velo)', () => {
  const c = cuerpo('function painCard(p)');
  assert(!/_estaSenalado|senalad/i.test(c), 'painCard debe quedar intacta');
});

await t('el modo NO esta cerrado por plan', () => {
  const i = SANAR.indexOf("modeBtn('senalados'");
  assert(i !== -1, 'falta el boton del modo');
  const linea = SANAR.slice(SANAR.lastIndexOf('\n', i), SANAR.indexOf('\n', i));
  assert(!/isPrem|canAccessModo|DEV\s*\?/.test(linea),
         'senalar es de todos los planes: el velo de foco ya es gratis');
});

await t('el shim expone deleteField', () => {
  assert(/deleteField:\s*function/.test(SANAR), 'sin el, quitar dejaria lapidas');
});

await t('los cuatro modos conservan su palabra, en su propio span', () => {
  ['Navegar', 'Escríbelo', 'Ejes', 'Señalados'].forEach((w) => {
    assert(SANAR.indexOf("','" + w + "'") !== -1, 'falta la etiqueta ' + w);
  });
  assert(/class="mode-lbl"/.test(SANAR),
         'la etiqueta va en su propio span (icono arriba, palabra abajo)');
  const css = SANAR.slice(SANAR.indexOf('.mode-btn {'), SANAR.indexOf('.mode-btn svg'));
  assert(/flex-direction:column/.test(css), '.mode-btn debe ir en columna');
});

await t('una sola lectura de progress/sanar', () => {
  const n = (SANAR.match(/'progress',\s*'sanar'/g) || []).length;
  eq(n, 2, 'solo _cargarSanar (lectura) y _escribirSenal (escritura)');
});

await t('ordenarPorAfinidad no sabe de senales', () => {
  const c = cuerpo('function ordenarPorAfinidad(list, perfil, completados)');
  assert(!/senal/i.test(c),
         'un senalado no sube en Navegar: no caduca y ya tiene modo propio');
});

console.log('\n' + '─'.repeat(60));
console.log('  ' + ok + ' pasadas · ' + fail + ' fallidas');
if (fail) { fallos.forEach((f) => console.log('   ✗ ' + f)); process.exit(1); }

}

main();
