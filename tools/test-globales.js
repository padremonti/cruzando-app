/* ══════════════════════════════════════════════════════════════════════
   Banco de pruebas — ningún identificador se usa sin que alguien lo dé

   Nació de un bug de producción. Al extraer `NIVELES_ORDER` a niveles.js
   (c316f82) se borró el array y el salto de línea que cerraba su comentario,
   y la declaración de abajo quedó pegada dentro del comentario:

       // Orden de todos los niveles del itinerariovar BLOCKS = ['gozosos',…];

   `BLOCKS` dejó de existir. Su único uso vivía dentro de un try/catch de
   degradación, así que el ReferenceError no se vio: la frontera de progreso
   caía a '0101' en silencio, se persistía, y el selector de niveles se
   quedaba anclado en 1-1 para cualquiera que perdiera su localStorage.

   Nadie lo habría cazado leyendo: la línea se ve como un comentario normal.
   Lo caza esto — comparar, por página, lo que se USA contra lo que alguien
   DECLARA o expone en `window`.

   Correr:  node tools/test-globales.js
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs   = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

/* acorn vive en functions/node_modules (dependencia de las Cloud Functions).
   El banco no lo exige: si no está, avisa y no finge haber comprobado nada. */
let acorn = null;
try { acorn = require(require.resolve('acorn', { paths: [path.join(RAIZ, 'functions')] })); }
catch (e) { /* sin parser */ }

const PAGINAS = [
  'index.html', 'crecer.html', 'audio.html', 'orar.html', 'rezar.html',
  'diario.html', 'cantos.html', 'extras.html', 'sanar.html', 'mini.html',
  'world.html', 'retiros.html', 'soporte.html', 'terminos.html', 'privacidad.html',
];

/* Lo que da el navegador. No es exhaustivo a propósito: si aparece un
   builtin que falta, se añade aquí y ya. Un falso positivo cuesta una línea;
   un falso negativo costó el bug de arriba. */
const NAVEGADOR = new Set([
  // valores y objetos del lenguaje
  'globalThis','undefined','NaN','Infinity','JSON','Math','Object','Array','String',
  'Number','Boolean','Date','RegExp','Function','Symbol','BigInt','Promise','Proxy',
  'Reflect','Map','Set','WeakMap','WeakSet','ArrayBuffer','Uint8Array','Int8Array',
  'Uint8ClampedArray','Int16Array','Uint16Array','Int32Array','Uint32Array',
  'Float32Array','Float64Array','DataView','Intl','escape','unescape',
  'Error','TypeError','RangeError','ReferenceError','SyntaxError','EvalError','URIError',
  'parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent',
  'encodeURI','decodeURI','structuredClone','queueMicrotask',
  // DOM y BOM
  'window','document','navigator','location','history','screen','frames','parent','top',
  'self','console','localStorage','sessionStorage','indexedDB','caches','crypto',
  'performance','alert','confirm','prompt','fetch','XMLHttpRequest','FormData','Headers',
  'Request','Response','Blob','File','FileReader','URL','URLSearchParams','WebSocket',
  'Worker','SharedWorker','MessageChannel','BroadcastChannel','AbortController','AbortSignal',
  'setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame',
  'cancelAnimationFrame','requestIdleCallback','getComputedStyle','matchMedia','scrollTo',
  'open','close','postMessage','addEventListener','removeEventListener','dispatchEvent',
  'Image','Audio','Option','AudioContext','webkitAudioContext','speechSynthesis',
  'SpeechSynthesisUtterance','Notification','MutationObserver','IntersectionObserver',
  'ResizeObserver','PerformanceObserver','CustomEvent','Event','KeyboardEvent','MouseEvent',
  'TouchEvent','PointerEvent','DOMParser','XMLSerializer','TextEncoder','TextDecoder',
  'Node','Element','HTMLElement','HTMLCanvasElement','SVGElement','CSS','DOMMatrix','Path2D',
  'visualViewport','devicePixelRatio','innerWidth','innerHeight','screenX','screenY',
  'scrollX','scrollY','pageXOffset','pageYOffset','isSecureContext','origin','name','status',
  'arguments','MediaMetadata','MediaSession','ontouchstart','onerror',
  'firebase',           // SDK compat, cargado por <script src> de gstatic
  'grecaptcha',         // reCAPTCHA v3, cargado por el propio App Check
]);

/* ── Recorrido del AST ──────────────────────────────────────────────────
   Dos pasadas sobre el mismo árbol. Se prefiere pecar de generoso al
   declarar (menos falsos positivos) y de estricto al usar.            */

// Hijos que NO son referencias a un valor: nombres que se están creando,
// o claves de propiedad que no son identificadores libres.
function omitir(nodo, clave) {
  const t = nodo.type;
  if (t === 'VariableDeclarator'   && clave === 'id')     return true;
  if (t === 'ClassDeclaration'     && clave === 'id')     return true;
  if (t === 'ClassExpression'      && clave === 'id')     return true;
  if (t === 'CatchClause'          && clave === 'param')  return true;
  if (t === 'LabeledStatement'     && clave === 'label')  return true;
  if (t === 'BreakStatement'       && clave === 'label')  return true;
  if (t === 'ContinueStatement'    && clave === 'label')  return true;
  if (/^(Function|Arrow)/.test(t) && (clave === 'id' || clave === 'params')) return true;
  if (t === 'FunctionDeclaration' && (clave === 'id' || clave === 'params')) return true;
  if ((t === 'MemberExpression' || t === 'OptionalMemberExpression') &&
      clave === 'property' && !nodo.computed) return true;
  if ((t === 'Property' || t === 'MethodDefinition' || t === 'PropertyDefinition') &&
      clave === 'key' && !nodo.computed) return true;
  if (/^(Import|Export)/.test(t)) return true;
  return false;
}

function recorrer(nodo, visitar, saltar) {
  if (!nodo || typeof nodo !== 'object') return;
  if (Array.isArray(nodo)) { nodo.forEach(n => recorrer(n, visitar, saltar)); return; }
  if (typeof nodo.type !== 'string') return;
  visitar(nodo);
  for (const clave of Object.keys(nodo)) {
    if (clave === 'type' || clave === 'start' || clave === 'end' || clave === 'loc') continue;
    if (saltar && saltar(nodo, clave)) continue;
    recorrer(nodo[clave], visitar, saltar);
  }
}

// Nombres que un patrón de destructuring/parámetro crea.
function nombresDe(patron, dentro) {
  if (!patron || typeof patron !== 'object') return;
  switch (patron.type) {
    case 'Identifier':        dentro.add(patron.name); break;
    case 'ObjectPattern':     patron.properties.forEach(p =>
                                nombresDe(p.value || p.argument, dentro)); break;
    case 'ArrayPattern':      patron.elements.forEach(e => nombresDe(e, dentro)); break;
    case 'AssignmentPattern': nombresDe(patron.left, dentro); break;
    case 'RestElement':       nombresDe(patron.argument, dentro); break;
  }
}

function declarados(ast) {
  const s = new Set();
  recorrer(ast, n => {
    if (n.type === 'VariableDeclarator') nombresDe(n.id, s);
    else if (/^(Function|Arrow|Class)/.test(n.type)) {
      /* Un solo brazo para las tres formas de función: si FunctionDeclaration
         se atiende aparte, sus parámetros se quedan sin recoger y cada uso en
         el cuerpo se denuncia como huérfano. */
      if (n.id) s.add(n.id.name);
      (n.params || []).forEach(p => nombresDe(p, s));
    }
    else if (n.type === 'CatchClause' && n.param) nombresDe(n.param, s);
    else if (/^Import(Default|Namespace)?Specifier$/.test(n.type)) s.add(n.local.name);
  });
  return s;
}

// Declaraciones que un script CLÁSICO deja como globales de verdad (nivel 0).
function globalesDeNivelCero(ast) {
  const s = new Set();
  (ast.body || []).forEach(n => {
    if (n.type === 'VariableDeclaration') n.declarations.forEach(d => nombresDe(d.id, s));
    else if (/^(Function|Class)Declaration$/.test(n.type) && n.id) s.add(n.id.name);
  });
  return s;
}

// `window.LO_QUE_SEA = …` en cualquier profundidad: la vía de exposición de la app.
function expuestosEnWindow(ast) {
  const s = new Set();
  recorrer(ast, n => {
    if (n.type !== 'AssignmentExpression') return;
    const iz = n.left;
    if (iz && iz.type === 'MemberExpression' && !iz.computed &&
        iz.object && iz.object.type === 'Identifier' && iz.object.name === 'window' &&
        iz.property && iz.property.type === 'Identifier') s.add(iz.property.name);
  });
  return s;
}

function referenciados(ast) {
  const m = new Map();   // nombre → primera línea
  recorrer(ast, n => {
    if (n.type === 'Identifier' && !m.has(n.name)) m.set(n.name, n.loc ? n.loc.start.line : 0);
  }, omitir);
  return m;
}

/* ── Trocear la página ─────────────────────────────────────────────── */

function bloquesInline(html) {
  const out = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    if (/\bsrc\s*=/.test(m[1])) continue;
    if (!m[2].trim()) continue;
    const antes = html.slice(0, m.index);
    out.push({
      modulo: /type\s*=\s*["']module["']/.test(m[1]),
      codigo: m[2],
      linea:  antes.split('\n').length,   // línea del <script> dentro del HTML
    });
  }
  return out;
}

function fuentesLocales(html) {
  const out = [];
  const re = /<script[^>]*\bsrc\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) {
    const src = m[1];
    if (/^(https?:)?\/\//.test(src)) continue;
    out.push(src.replace(/^\.\//, '').split('?')[0]);
  }
  return out;
}

/* Huérfanos CONOCIDOS y guardados. No son el bug de BLOCKS — ninguno revienta,
   porque cada llamada va detrás de una guarda o vive en código que nadie invoca.
   Se listan para que no crezcan en silencio: uno nuevo hace fallar el banco, y
   uno que ya no haga falta también (la lista no se pudre). */
const GUARDADOS = {
  'audio.html':  { closeAudioHome: 'solo la llama renderAudioHome(), a la que no llama nadie: código muerto.',
                   openAudioHome:  'ídem.',
                   updatePlayUI:   "las 2 llamadas usan `typeof x === 'function'`, la única " +
                                   'forma que no lanza con un nombre sin declarar.' },
};

function parsear(codigo, esModulo) {
  return acorn.parse(codigo, {
    ecmaVersion: 'latest',
    sourceType: esModulo ? 'module' : 'script',
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    allowHashBang: true,
    locations: true,
  });
}

/* ── El banco ──────────────────────────────────────────────────────── */

let fallos = 0, pasos = 0;
function ok(nombre, fn) {
  try { fn(); console.log('  ✓ ' + nombre); pasos++; }
  catch (e) { console.log('  ✗ ' + nombre + '\n      ' + e.message); fallos++; }
}

console.log('\n── Nadie usa lo que nadie declara ──');

if (!acorn) {
  console.log('\n  ⚠ acorn no está instalado (functions/node_modules).');
  console.log('    Correr `npm install` dentro de functions/ para habilitar esta auditoría.');
  console.log('    El banco NO da por buena la comprobación: sale sin verde.\n');
  process.exit(2);
}

// Caché de proveedores externos: cada .js suelto se parsea una sola vez.
const cacheFuente = new Map();
function proveedoresDe(archivo) {
  if (cacheFuente.has(archivo)) return cacheFuente.get(archivo);
  let s = new Set();
  try {
    const ast = parsear(leer(archivo), false);
    s = new Set([...globalesDeNivelCero(ast), ...expuestosEnWindow(ast)]);
  } catch (e) { /* si no se puede leer o parsear, no aporta nada */ }
  cacheFuente.set(archivo, s);
  return s;
}

PAGINAS.forEach(pagina => {
  let html;
  try { html = leer(pagina); } catch (e) { return; }   // página que ya no existe

  ok(pagina.padEnd(16) + ' · todo identificador tiene quien lo declare', () => {
    const bloques = bloquesInline(html);
    const arboles = bloques.map(b => {
      try { return { b, ast: parsear(b.codigo, b.modulo) }; }
      catch (e) { throw new Error('no parsea el <script> de la línea ' + b.linea + ': ' + e.message); }
    });

    // Lo que la página deja en el ámbito global: los <script> clásicos (nivel 0)
    // y todo `window.X = …` de cualquiera de sus bloques.
    const global = new Set();
    arboles.forEach(({ b, ast }) => {
      if (!b.modulo) globalesDeNivelCero(ast).forEach(n => global.add(n));
      expuestosEnWindow(ast).forEach(n => global.add(n));
    });
    fuentesLocales(html).forEach(f => proveedoresDe(f).forEach(n => global.add(n)));

    const guardados = GUARDADOS[pagina] || {};
    const usados    = new Set();
    const huerfanos = [];
    arboles.forEach(({ b, ast }) => {
      const propios = declarados(ast);
      referenciados(ast).forEach((linea, nombre) => {
        if (propios.has(nombre) || global.has(nombre) || NAVEGADOR.has(nombre)) return;
        if (nombre in guardados) { usados.add(nombre); return; }
        huerfanos.push(nombre + ' (script de la línea ' + b.linea + ', +' + linea + ')');
      });
    });

    if (huerfanos.length) {
      throw new Error(huerfanos.length + ' sin declarar:\n      ' + huerfanos.join('\n      '));
    }
    // La lista de conocidos tampoco se pudre: sobrar es tan malo como faltar.
    const sobran = Object.keys(guardados).filter(n => !usados.has(n));
    if (sobran.length) {
      throw new Error('ya no hace falta la excepción de: ' + sobran.join(', ') +
                      ' — borrarla de GUARDADOS');
    }
  });
});

/* El caso concreto que originó el banco: que la declaración no vuelva a
   quedarse dentro del comentario de arriba. Es barato y se lee solo. */
console.log('\n── La declaración de BLOCKS vive en su propia línea ──');

['crecer.html', 'index.html'].forEach(p => {
  ok(p.padEnd(16) + ' · BLOCKS no está tragado por un comentario', () => {
    const s = leer(p);
    if (/\/\/[^\n]*\bvar\s+BLOCKS\s*=/.test(s))
      throw new Error('la declaración volvió a quedar dentro de un comentario');
    if (!/^var BLOCKS = \['gozosos','luminosos','dolorosos','gloriosos'\];$/m.test(s))
      throw new Error('no se encuentra la declaración en su propia línea');
  });
});

console.log('\n' + '─'.repeat(64));
if (fallos) {
  console.log('  ✗ ' + fallos + ' fallo(s), ' + pasos + ' pasada(s)');
  console.log('─'.repeat(64) + '\n');
  process.exit(1);
}
console.log('  TODO VERDE — ' + pasos + ' pruebas');
console.log('─'.repeat(64) + '\n');
