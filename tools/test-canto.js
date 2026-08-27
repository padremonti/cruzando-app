/* ══════════════════════════════════════════════════════════════════════
   Banco de pruebas — la pantalla de canto sin arte

   El karaoke tiene tres peldaños de degradación para la LETRA (.lrc →
   letra estática → no abre), pero no tenía ninguno para la IMAGEN. Si el
   Misterio no tenía carrusel, finishDetect() pintaba la imagen única SIN
   COMPROBARLA: si tampoco existía, la capa se quedaba transparente con su
   Ken Burns corriendo sobre nada. El usuario veía una pantalla negra con
   una animación invisible.

   Era un camino que solo recorre audio: en rezar todos los cantos tienen
   carrusel, así que showStill() no se usa nunca y el fallo estaba tapado.

   Estas pruebas son de FUENTE, no de ejecución: mount() del motor usa
   innerHTML y hacen falta un parser de HTML de verdad para correrlo. Lo
   que se vigila aquí es el cableado, que es donde estuvo el error.

   Correr:  node tools/test-canto.js
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs   = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let fallos = 0, pasos = 0;
function ok(nombre, fn) {
  try { fn(); console.log('  ✓ ' + nombre); pasos++; }
  catch (e) { console.log('  ✗ ' + nombre + '\n      ' + e.message); fallos++; }
}
const cuerpo = (src, fn) =>
  (src.match(new RegExp('function ' + fn + '\\([^)]*\\)[\\s\\S]*?\\n    \\}')) || [''])[0];

console.log('\n── El respaldo se comprueba antes de pintarse ──');

ok('finishDetect  · sondea la imagen única en vez de confiar', () => {
  const c = cuerpo(leer('canto.js'), 'finishDetect');
  if (!c) throw new Error('no encontré finishDetect');
  if (!/new Image\(\)/.test(c))
    throw new Error('vuelve a pintar a ciegas: una imagen que no existe deja la pantalla negra');
  if (!/onerror[\s\S]{0,80}sinArte\(\)/.test(c))
    throw new Error('si la imagen única falla, nadie levanta el fondo de respaldo');
  if (!/onload[\s\S]{0,80}showStill\(/.test(c))
    throw new Error('si la imagen única carga, no se pinta');
});

ok('finishDetect  · sin imagen única siquiera, tampoco se queda en negro', () => {
  const c = cuerpo(leer('canto.js'), 'finishDetect');
  if (!/if \(!still\) \{ sinArte\(\); return; \}/.test(c))
    throw new Error('una página sin getStillUrl se quedaría con la pantalla vacía');
});

ok('sinArte       · apaga las dos capas, no solo una', () => {
  /* Si quedara una capa con .front y su background viejo, el fondo de
     respaldo se vería tapado por el canto ANTERIOR. */
  const c = cuerpo(leer('canto.js'), 'sinArte');
  if (!c) throw new Error('no existe sinArte');
  if (!/classList\.add\('sin-arte'\)/.test(c))
    throw new Error('no marca el contenedor');
  const quita = (c.match(/classList\.remove\('front'\)/g) || []).length;
  if (quita !== 2) throw new Error('apaga ' + quita + ' capa(s) de 2');
});

ok('paint         · en cuanto entra una imagen, deja de estar sin arte', () => {
  const c = cuerpo(leer('canto.js'), 'paint');
  if (!/conArte\(\)/.test(c))
    throw new Error('el fondo de respaldo sobreviviría debajo de una imagen real');
});

ok('buildContent  · el canto anterior no decide el fondo de este', () => {
  const c = cuerpo(leer('canto.js'), 'buildContent');
  if (!/conArte\(\)/.test(c))
    throw new Error('un canto sin arte dejaría marcado al siguiente');
});

console.log('\n── El fondo de respaldo existe y es sobrio ──');

ok('canto.css     · define .canto-stills.sin-arte', () => {
  const s = leer('canto.css');
  const m = s.match(/\.canto-stills\.sin-arte\s*\{[^}]*\}/);
  if (!m) throw new Error('no hay regla para el fondo de respaldo');
  if (!/--canto-tinte-rgb/.test(m[0]))
    throw new Error('el tinte no es parametrizable por la página');
  if (/animation/.test(m[0]))
    throw new Error('sin imagen no hay nada que recorrer: el fondo va quieto');
});

ok('canto.js      · aplica el tinte que le dé la página', () => {
  const s = leer('canto.js');
  if (!/cfg\.getTinteRgb/.test(s))
    throw new Error('el motor no acepta tinte de la página');
  if (!/setProperty\('--canto-tinte-rgb'/.test(s))
    throw new Error('lo acepta pero no lo aplica');
});

['audio.html', 'rezar.html'].forEach(f => {
  ok(f.padEnd(13) + '· tiñe el respaldo con el color del bloque', () => {
    const s = leer(f);
    if (!/getTinteRgb:\s*\(\)\s*=>/.test(s))
      throw new Error('no le pasa tinte: el respaldo saldría en pergamino neutro');
    if (!/rgbBloque\(/.test(s))
      throw new Error('el tinte no sale del origen único de color de bloque');
  });
});

ok('bloques.js    · rgbBloque acompaña a rgbaBloque', () => {
  const s = leer('bloques.js');
  if (!/window\.rgbBloque\s*=/.test(s)) throw new Error('no existe rgbBloque');
  const vm = require('vm');
  const ctx = { document: { documentElement: { style: { setProperty() {} } } } };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(s, ctx);
  if (ctx.window.rgbBloque('gozosos') !== '232,160,160')
    throw new Error('gozosos debería dar 232,160,160 y dio ' + ctx.window.rgbBloque('gozosos'));
  if (ctx.window.rgbBloque('glo') !== ctx.window.rgbBloque('gloriosos'))
    throw new Error('el alias corto no coincide con el largo');
  if (ctx.window.rgbBloque('inventado') !== '')
    throw new Error('un bloque que no existe debe dar cadena vacía, no basura');
});

console.log('\n── Los cantos del cuaderno se jubilaron ──');

/* data/{nivelId}-cantos.json guardaba la letra de cada canto y su título. La letra
   ya estaba en el .lrc (medido: 80 de 80 en lo publicado) y el título vive ahora en
   el [ti:] del propio asset, así que los cuatro archivos se borraron. Estas pruebas
   existen para que no vuelvan por la puerta de atrás: un fetch olvidado devolvería
   404 y la letra desaparecería sin que nadie lo notara. */

ok('los cuatro data/*-cantos.json siguen borrados', () => {
  const vivos = ['0101','0102','0103','0104']
    .filter(n => fs.existsSync(path.join(RAIZ, 'data', n + '-cantos.json')));
  if (vivos.length)
    throw new Error('reaparecieron: ' + vivos.join(', ') + ' — el origen es el .lrc, no data/');
});

ok('ninguna página los pide ya', () => {
  const mal = [];
  for (const f of fs.readdirSync(RAIZ)) {
    if (!/\.(html|js)$/.test(f)) continue;
    for (const l of leer(f).split('\n')) {
      // Solo el fetch cuenta: los comentarios que explican la migración pueden nombrarlo.
      if (/fetch\([^)]*-cantos\.json/.test(l)) mal.push(f + ': ' + l.trim().slice(0, 70));
    }
  }
  if (mal.length) throw new Error(mal.join('\n      '));
});

ok('canto.js da las dos lecturas del .lrc y ya no la del JSON', () => {
  const s = leer('canto.js');
  for (const f of ['parseLrcMeta', 'letraPlana', 'fetchLrc', 'letraDeBloque'])
    if (!new RegExp('function\\s+' + f + '\\s*\\(').test(s)) throw new Error('falta ' + f);
  if (/function\s+loadCantos\s*\(/.test(s))
    throw new Error('loadCantos sigue ahí: era el lector del JSON jubilado');
  // parseLrc para cantar, letraPlana para leer: si se fusionaran, orar perdería las estrofas
  if (!/if \(!line\.trim\(\)\) continue;/.test(s))
    throw new Error('parseLrc dejó de descartar los renglones vacíos');
});

ok('audio y la galería sacan el canto desbloqueado del .lrc de bloque', () => {
  for (const f of ['audio.html', 'cantos.html']) {
    const s = leer(f);
    if (!/Karaoke\.fetchLrc\(/.test(s))    throw new Error(f + ' ya no lee el .lrc de bloque');
    if (!/letraDeBloque\(/.test(s))        throw new Error(f + ' ya no parte la letra en sus Misterios');
    if (/letraDeBloque\(\s*\w+\.lineas/.test(s))
      throw new Error(f + ': pasa las líneas del karaoke en vez de la letra plana — se perderían las estrofas');
  }
});

ok('orar conserva su popup de texto plano (es el libro digital)', () => {
  const s = leer('orar.html');
  if (!/popup-lyrics/.test(s))            throw new Error('desapareció el popup de letra');
  if (!/precargarLetraCanto\s*\(/.test(s)) throw new Error('nadie precarga la letra del Misterio');
  if (/Karaoke\.create\(/.test(s))
    throw new Error('orar montó un karaoke: aquí el canto se LEE, a ritmo del usuario');
});

console.log('\n' + '─'.repeat(64));
if (fallos) {
  console.log('  ✗ ' + fallos + ' fallo(s), ' + pasos + ' pasada(s)');
  console.log('─'.repeat(64) + '\n');
  process.exit(1);
}
console.log('  TODO VERDE — ' + pasos + ' pruebas');
console.log('─'.repeat(64) + '\n');
