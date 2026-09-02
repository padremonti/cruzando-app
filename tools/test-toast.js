/* ══════════════════════════════════════════════════════════════════════
   Banco de pruebas — el aviso breve (toast.js)

   index y crecer llamaban a `showToast` en tres sitios —los dos avisos de
   bienvenida tras el checkout y el de tutoriales reactivados— pero la
   función solo existía dentro de audio.html. Las tres llamadas van tras
   `if (window.showToast)`, así que no reventaban: el aviso simplemente
   NUNCA salía. Lo cazó tools/test-globales.js.

   Aquí se corre el módulo de verdad contra un DOM de mentira: que monte
   una sola vez, que dos avisos seguidos no se apilen, y que se cargue en
   las dos páginas que lo necesitan.

   Correr:  node tools/test-toast.js
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let fallos = 0, pasos = 0;
function ok(nombre, fn) {
  try { fn(); console.log('  ✓ ' + nombre); pasos++; }
  catch (e) { console.log('  ✗ ' + nombre + '\n      ' + e.message); fallos++; }
}
function igual(real, esperado, que) {
  if (real !== esperado) throw new Error(que + ': se esperaba ' + JSON.stringify(esperado) +
                                         ' y llegó ' + JSON.stringify(real));
}

/* ── Un DOM de mentira, lo justo para este módulo ───────────────────── */

function elemento(tag) {
  const el = {
    tagName: tag.toUpperCase(), id: '', textContent: '', isConnected: false,
    _clases: new Set(), _attrs: {}, hijos: [],
    classList: {
      add:      c => el._clases.add(c),
      remove:   c => el._clases.delete(c),
      contains: c => el._clases.has(c),
    },
    setAttribute: (k, v) => { el._attrs[k] = v; },
    getAttribute: k => (k in el._attrs ? el._attrs[k] : null),
    appendChild: h => { el.hijos.push(h); h.isConnected = true; return h; },
  };
  return el;
}

function documento(op) {
  op = op || {};
  const head = elemento('head'), body = elemento('body');
  head.isConnected = body.isConnected = true;
  const porId = () => head.hijos.concat(body.hijos);
  return {
    head, body,
    createElement: elemento,
    getElementById: id => porId().find(e => e.id === id) || null,
    // Solo se consulta '.app-nav': la barra de navegación de la página.
    querySelector: sel => (sel === '.app-nav' && op.conNav ? elemento('nav') : null),
    addEventListener: () => {},
  };
}

function cargar(op) {
  const doc    = documento(op);
  const timers = [];
  const caja = {
    document: doc,
    window: {},
    requestAnimationFrame: fn => { fn(); },          // sin esperar frames
    setTimeout: (fn, ms) => { timers.push({ fn, ms, vivo: true }); return timers.length - 1; },
    clearTimeout: id => { if (timers[id]) timers[id].vivo = false; },
    String, Number, Object, Array, JSON, Math,
  };
  vm.createContext(caja);
  vm.runInContext(leer('toast.js'), caja);
  return { caja, doc, timers, nodo: () => doc.getElementById('cruzando-toast') };
}

/* ── Las pruebas ────────────────────────────────────────────────────── */

console.log('\n── El módulo se basta solo ──');

ok('expone window.showToast (es como lo llaman las páginas)', () => {
  const t = cargar();
  igual(typeof t.caja.window.showToast, 'function', 'window.showToast');
  igual(typeof t.caja.window.Toast.mostrar, 'function', 'Toast.mostrar');
});

ok('no toca el DOM hasta que se le llama', () => {
  const t = cargar();
  igual(t.doc.head.hijos.length, 0, 'nodos en <head> al cargar');
  igual(t.doc.body.hijos.length, 0, 'nodos en <body> al cargar');
});

ok('inyecta su CSS y monta su nodo al primer aviso', () => {
  const t = cargar();
  t.caja.window.showToast('hola');
  igual(t.doc.head.hijos.length, 1, 'hojas de estilo');
  igual(t.doc.head.hijos[0].id, 'cruzando-toast-estilos', 'id de la hoja');
  const n = t.nodo();
  if (!n) throw new Error('no montó el nodo del aviso');
  igual(n.textContent, 'hola', 'texto');
  if (!n.classList.contains('mostrar')) throw new Error('no llegó a mostrarse');
});

ok('el CSS se inyecta UNA vez, y el nodo se reutiliza', () => {
  const t = cargar();
  t.caja.window.showToast('uno');
  const primero = t.nodo();
  t.caja.window.showToast('dos');
  igual(t.doc.head.hijos.length, 1, 'hojas de estilo tras dos avisos');
  igual(t.doc.body.hijos.length, 1, 'nodos de aviso tras dos avisos');
  if (t.nodo() !== primero) throw new Error('montó un nodo nuevo en vez de reutilizar');
  igual(t.nodo().textContent, 'dos', 'texto del segundo aviso');
});

console.log('\n── Dos avisos seguidos no se pisan ──');

ok('el segundo releva al primero y reinicia la cuenta', () => {
  /* Sin esto, el temporizador del primero cerraría el segundo a mitad de
     leerlo: el usuario vería el texto nuevo desaparecer antes de tiempo. */
  const t = cargar();
  t.caja.window.showToast('uno');
  t.caja.window.showToast('dos');
  const vivos = t.timers.filter(x => x.vivo);
  igual(vivos.length, 1, 'temporizadores de cierre vivos');
  if (!t.nodo().classList.contains('mostrar'))
    throw new Error('el segundo aviso no quedó visible');
  vivos[0].fn();   // vencer el único que queda
  if (t.nodo().classList.contains('mostrar'))
    throw new Error('no se cierra al vencer el temporizador');
});

console.log('\n── Se coloca según la página ──');

ok('con barra de navegación flota por encima de ella', () => {
  const t = cargar({ conNav: true });
  t.caja.window.showToast('x');
  if (t.nodo().classList.contains('sin-nav'))
    throw new Error('se bajó al pie habiendo barra: quedaría tapado');
});

ok('sin barra de navegación baja al pie', () => {
  const t = cargar({ conNav: false });
  t.caja.window.showToast('x');
  if (!t.nodo().classList.contains('sin-nav'))
    throw new Error('se quedó flotando en el aire sin barra debajo');
});

ok('lo anuncia el lector de pantalla sin interrumpir', () => {
  const t = cargar();
  t.caja.window.showToast('x');
  igual(t.nodo().getAttribute('role'), 'status', 'role');
  igual(t.nodo().getAttribute('aria-live'), 'polite', 'aria-live');
});

console.log('\n── Cableado en las páginas ──');

['index.html', 'crecer.html'].forEach(p => {
  ok(p.padEnd(12) + '· carga toast.js y sus tres avisos siguen ahí', () => {
    const s = leer(p);
    if (!/<script src="toast\.js"><\/script>/.test(s))
      throw new Error('no carga toast.js: los avisos volverían a no salir');
    /* index lleva 3 (2 de checkout + tutoriales). crecer suma un cuarto: el
       aviso de que un Misterio pendiente se reza en Hoy, porque el mapa dejo
       de ser la puerta. El numero sigue siendo exacto a proposito, para que
       un aviso colado siga saltando aqui. */
    const esperadas = (p === 'crecer.html') ? 4 : 3;
    const llamadas = (s.match(/showToast\(/g) || []).length;
    if (llamadas !== esperadas)
      throw new Error('se esperaban ' + esperadas + ' llamadas, hay ' + llamadas);
  });
});

ok('audio.html    · conserva el suyo a propósito', () => {
  /* El de audio se tiñe con el color del bloque (--lvl-soft) y vive en su
     barra de herramientas. Adoptar el compartido allí es decisión visual. */
  const s = leer('audio.html');
  if (!/function showToast\(text\) \{/.test(s))
    throw new Error('audio perdió su aviso propio sin decidirlo');
  if (/<script src="toast\.js">/.test(s))
    throw new Error('audio cargó el compartido y ahora hay dos showToast peleando');
});

console.log('\n' + '─'.repeat(64));
if (fallos) {
  console.log('  ✗ ' + fallos + ' fallo(s), ' + pasos + ' pasada(s)');
  console.log('─'.repeat(64) + '\n');
  process.exit(1);
}
console.log('  TODO VERDE — ' + pasos + ' pruebas');
console.log('─'.repeat(64) + '\n');
