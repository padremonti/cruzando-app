/* ══════════════════════════════════════════════════════════════════════
   Banco de pruebas — destino unificado de las salidas de sesión

   Los tres modos de rezo terminaban en tres sitios distintos: audio y rezar
   en index.html (el hub), orar en sí mismo (su botón decía "Regresar a
   inicio" y recargaba orar), y sanar en crecer.html (el mapa). Ahora los
   cuatro vuelven al mismo lugar: crecer.html.

   Importa que no se desvíe: el splash de racha se engancha exactamente en
   estos puntos de salida, y una sola ruta que se escape a index.html sería
   un día de racha que no se celebra.

   Correr:  node tools/test-navegacion.js
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs   = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

const MAPA = 'crecer.html';

/* Las ÚNICAS idas a index.html que deben quedar en un modo de sesión: cerrar
   sesión y crear cuenta van a la pantalla de acceso, que es index. Cualquier
   otra es una salida de sesión que se quedó sin migrar.

   Se comparan como LÍNEA COMPLETA (ya sin sangría), no como subcadena: con
   subcadena, la excepción "goTo('index.html');" de rezar tapaba cualquier
   otra llamada igual y el guardián no mordía. */
const EXCEPCIONES = {
  'audio.html': [
    // cerrar sesión → pantalla de acceso
    "signOut(auth).then(() => { location.href = 'index.html'; }).catch(() => { location.href = 'index.html'; });",
    // enlace de alta dentro de un mensaje
    '\'<a href="index.html" style="color:inherit;text-decoration:underline">Créala desde el inicio</a>.\';'
  ],
  'orar.html':  ["else goTo('index.html');"],   // onAuthStateChanged sin usuario
  'rezar.html': ["goTo('index.html');"],        // onAuthStateChanged sin usuario
};

const MODOS = ['audio.html', 'orar.html', 'rezar.html'];

let fallos = 0, pasos = 0;
function ok(nombre, fn) {
  try { fn(); console.log('  ✓ ' + nombre); pasos++; }
  catch (e) { console.log('  ✗ ' + nombre + '\n      ' + e.message); fallos++; }
}

console.log('\n── Ninguna salida de sesión apunta al hub ──');

MODOS.forEach(f => {
  ok(f.padEnd(11) + ' · solo auth/alta siguen yendo a index.html', () => {
    const sueltas = leer(f).split('\n')
      .map((l, i) => ({ n: i + 1, t: l }))
      .filter(l => l.t.includes('index.html'))
      .filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l.t))          // comentarios fuera
      .filter(l => EXCEPCIONES[f].indexOf(l.t.trim()) === -1);
    if (sueltas.length) {
      throw new Error(sueltas.length + ' salida(s) sin migrar:\n      ' +
        sueltas.map(l => l.n + '| ' + l.t.trim().slice(0, 90)).join('\n      '));
    }
  });
});

console.log('\n── Los cuatro modos vuelven al mismo sitio ──');

MODOS.forEach(f => {
  ok(f.padEnd(11) + ' · su barra de navegación lleva al mapa', () => {
    const s = leer(f);
    const nav = s.split('\n').filter(l => l.includes('app-nav-item') || l.includes('app-nav-label'));
    const bloque = nav.join('\n');
    if (!/crecer\.html/.test(s)) throw new Error('no menciona ' + MAPA + ' en ninguna parte');
    if (!/app-nav-label">Crecer</.test(bloque))
      throw new Error('la barra no tiene el destino etiquetado "Crecer"');
  });
});

ok('sanar.html  · ya volvía al mapa (no debió cambiar)', () => {
  if (!leer('sanar.html').includes("navTo('crecer.html')"))
    throw new Error('sanar dejó de apuntar al mapa');
});

ok('mini.html   · sigue devolviendo a sanar, no al mapa', () => {
  if (!leer('mini.html').includes("'sanar.html'"))
    throw new Error('mini dejó de volver a sanar');
});

console.log('\n── orar tiene por fin una salida de verdad ──');

ok('orar        · la celebración ofrece dos botones', () => {
  const s = leer('orar.html');
  if (!/id="btn-celeb-home"/.test(s))  throw new Error('falta btn-celeb-home');
  if (!/id="btn-celeb-mapa"/.test(s))  throw new Error('falta btn-celeb-mapa');
});

ok('orar        · el botón de salir está cableado en los dos finales', () => {
  const s = leer('orar.html');
  /* uno en showCelebration (bloque completo) y otro en showAdvanceLevelPrompt (20) */
  const n = (s.match(/btn-celeb-mapa'\)\.onclick/g) || []).length;
  if (n !== 2) throw new Error('esperaba 2 cableados, encontré ' + n);
});

ok('orar        · sale en directo, sin el atajo de history.back()', () => {
  const s = leer('orar.html');
  /* "Seguir rezando" recarga orar y mete su propia entrada en el historial:
     retroceder devolvería al orar anterior en vez de al mapa. */
  if (!/salirConAviso\('crecer\.html', true\)/.test(s))
    throw new Error('la salida de la celebración no pide salida directa');
  if (!/if\(!directo && dest==='crecer\.html'/.test(s))
    throw new Error('salirDeOrar ya no honra la salida directa');
});

ok('orar        · la etiqueta del botón principal ya no miente', () => {
  const s = leer('orar.html');
  if (/id="btn-celeb-home"[^>]*>Regresar a inicio</.test(s))
    throw new Error('vuelve a prometer "Regresar a inicio" sin ir al inicio');
  /* ambos finales fijan su propio texto */
  if (!/btn-celeb-home'\)\.textContent='Seguir rezando'/.test(s))
    throw new Error('el fin de bloque no fija su etiqueta');
  if (!/btn-celeb-home'\)\.textContent='Siguiente cuaderno'/.test(s))
    throw new Error('el fin de los 20 no fija su etiqueta');
});

ok('orar        · cancelar el aviso limpia también la bandera directa', () => {
  if (!/_exitCancel=function\(\)\{[^}]*_exitDirecto=false/.test(leer('orar.html')))
    throw new Error('_exitDirecto se filtraría al siguiente intento de salida');
});

console.log('\n' + '─'.repeat(64));
if (fallos) {
  console.log('  ✗ ' + fallos + ' fallo(s), ' + pasos + ' pasada(s)');
  console.log('─'.repeat(64) + '\n');
  process.exit(1);
}
console.log('  TODO VERDE — ' + pasos + ' pruebas');
console.log('─'.repeat(64) + '\n');
