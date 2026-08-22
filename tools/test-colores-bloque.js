/* ══════════════════════════════════════════════════════════════════════
   Banco de pruebas — colores canónicos de bloque (bloques.js)

   El color de cada bloque vivía copiado a mano en seis páginas y se había
   desviado: dos versiones daban Gozosos en oro y Gloriosos en morado, una
   tercera pintaba la cruz del micro en verde y amarillo, y los 28 JSON de
   data/ llevaban todavía la vieja. bloques.js es ahora el único origen.

   Este banco existe para que la deriva NO vuelva: corre bloques.js de
   verdad, y luego audita cada página y cada archivo de datos buscando
   declaraciones o hexadecimales que se hayan vuelto a escribir a mano.

   Correr:  node tools/test-colores-bloque.js
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

/* La definición. Si esto cambia, es una decisión de producto, no un ajuste. */
const CANON = {
  gozosos:   '#E8A0A0',   // rosa
  luminosos: '#01BBE1',   // cian
  dolorosos: '#C0392B',   // rojo
  gloriosos: '#D4A017'    // oro
};

/* Páginas vivas que usan color de bloque. indexv2.html y reskin*.html son
   prototipos huérfanos (ninguna página los enlaza) y quedan fuera a propósito. */
const PAGINAS = ['index.html','crecer.html','audio.html','orar.html',
                 'rezar.html','cantos.html','diario.html'];

let fallos = 0, pasos = 0;
function ok(nombre, fn) {
  try { fn(); console.log('  ✓ ' + nombre); pasos++; }
  catch (e) { console.log('  ✗ ' + nombre + '\n      ' + e.message); fallos++; }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') +
    '\n      esperado: ' + JSON.stringify(b) + '\n      recibido: ' + JSON.stringify(a));
}

/* ── Correr bloques.js con un DOM de mentira ───────────────────────── */
function correrBloquesJS() {
  const vars = {};
  const ctx = {
    document: { documentElement: { style: { setProperty: (k, v) => { vars[k] = v; } } } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(leer('bloques.js'), ctx);
  return { win: ctx, vars };
}

console.log('\n── bloques.js: el origen ──');

const { win, vars } = correrBloquesJS();

ok('define los cuatro colores canónicos', () => {
  eq(JSON.stringify(win.COLORES_BLOQUE), JSON.stringify(CANON));
});

ok('Gozosos es rosa y Gloriosos es oro (no al revés)', () => {
  eq(win.COLORES_BLOQUE.gozosos,   '#E8A0A0', 'gozosos');
  eq(win.COLORES_BLOQUE.gloriosos, '#D4A017', 'gloriosos');
});

ok('no queda rastro del morado de la versión anterior', () => {
  const usados = Object.values(win.COLORES_BLOQUE).map(h => h.toUpperCase());
  if (usados.indexOf('#8E44AD') !== -1) throw new Error('morado #8E44AD sigue asignado a un bloque');
});

ok('rgbaBloque acepta el nombre largo', () => {
  eq(win.rgbaBloque('gozosos', 0.15), 'rgba(232,160,160,0.15)');
});

ok('rgbaBloque acepta el alias corto', () => {
  eq(win.rgbaBloque('glo', 0.35), 'rgba(212,160,23,0.35)');
});

ok('rgbaBloque con bloque desconocido no revienta', () => {
  eq(win.rgbaBloque('nada', 0.5), 'rgba(0,0,0,0.5)');
});

ok('estampa las 12 variables CSS (--x, --x-color, --x-rgb)', () => {
  eq(Object.keys(vars).length, 12);
  ['goz','lum','dol','glo'].forEach(k => {
    ['', '-color', '-rgb'].forEach(suf => {
      if (!(('--' + k + suf) in vars)) throw new Error('falta --' + k + suf);
    });
  });
});

ok('las variables estampadas llevan el valor canónico', () => {
  eq(vars['--goz'],       CANON.gozosos);
  eq(vars['--goz-color'], CANON.gozosos);
  eq(vars['--goz-rgb'],   '232,160,160');
  eq(vars['--glo'],       CANON.gloriosos);
  eq(vars['--glo-rgb'],   '212,160,23');
});

/* ── Ninguna página vuelve a declarar los colores por su cuenta ────── */
console.log('\n── Nadie redeclara: el origen es único ──');

const RE_DECL = /^\s*--(goz|lum|dol|glo)(-color)?\s*:\s*(#|rgb)/m;

PAGINAS.forEach(p => {
  ok(p.padEnd(12) + ' · no redeclara --goz/--lum/--dol/--glo en CSS', () => {
    const m = leer(p).match(RE_DECL);
    if (m) throw new Error('vuelve a declararlo a mano: ' + m[0].trim());
  });
});

/* ── Ningún hexadecimal de bloque escrito a mano en el JS ──────────── */
console.log('\n── Nadie horneó el hexadecimal en su propio JS ──');

/* La regresión concreta que ocurrió: el nombre del bloque y un hex literal
   en la misma línea. Basta con eso para cazarla si alguien la reintroduce. */
const RE_HORNEADO = new RegExp(
  "(gozosos|luminosos|dolorosos|gloriosos|key:\\s*'(goz|lum|dol|glo)')" +
  "[^\\n]{0,40}'#[0-9A-Fa-f]{6}'", 'i');

PAGINAS.forEach(p => {
  ok(p.padEnd(12) + ' · lee el color del origen, no de un literal', () => {
    const m = leer(p).match(RE_HORNEADO);
    if (m) throw new Error('hex horneado junto al nombre del bloque: ' + m[0].trim());
  });
});

/* ── Quien lo usa, lo carga — y lo carga antes ─────────────────────── */
console.log('\n── bloques.js cargado, y cargado a tiempo ──');

PAGINAS.forEach(p => {
  ok(p.padEnd(12) + ' · carga bloques.js antes del primer uso', () => {
    const s = leer(p);
    const carga = s.indexOf('src="bloques.js"');
    if (carga === -1) throw new Error('no carga bloques.js');

    const usos = [s.indexOf('COLORES_BLOQUE'), s.indexOf('rgbaBloque')]
                   .filter(i => i !== -1);
    usos.forEach(u => {
      if (u < carga) throw new Error('lo usa en la posición ' + u + ', antes de cargarlo en ' + carga);
    });

    /* Debe ir en el <head>: estampa variables CSS y tiene que correr antes
       del primer pintado, o las franjas parpadean con el color equivocado. */
    const finHead = s.indexOf('</head>');
    if (finHead !== -1 && carga > finHead) throw new Error('lo carga fuera del <head>');
  });
});

ok('cantos.html  · --block-color arranca derivado, no horneado', () => {
  const s = leer('cantos.html');
  const m = s.match(/--block-color\s*:\s*([^;]+);/);
  if (!m) throw new Error('ya no existe --block-color');
  if (/#[0-9A-Fa-f]{6}/.test(m[1])) throw new Error('vuelve a arrancar con un hex: ' + m[1].trim());
});

ok('cantos.html  · sin alias muertos de color de bloque (--rosa/--rojo/--dorado)', () => {
  const s = leer('cantos.html');
  ['--rosa','--rojo','--dorado'].forEach(v => {
    if (new RegExp('^\\s*' + v + '\\s*:', 'm').test(s)) throw new Error(v + ' vuelve a estar declarado');
  });
});

/* ── Los datos dicen lo mismo que el código ────────────────────────── */
console.log('\n── data/*.json: tema.bloques cuadra con el canon ──');

const dir    = path.join(RAIZ, 'data');
const jsons  = fs.readdirSync(dir).filter(f => /^\d{4}\.json$/.test(f)).sort();

ok('hay archivos de nivel que auditar', () => {
  if (jsons.length === 0) throw new Error('no encontré ningún data/NNNN.json');
});

ok('los ' + jsons.length + ' niveles llevan los cuatro colores canónicos', () => {
  const malos = [];
  jsons.forEach(f => {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const b = (d.tema || {}).bloques;
    if (!b) return;
    const got = {};
    Object.keys(b).forEach(k => { got[k] = b[k].color; });
    if (JSON.stringify(got) !== JSON.stringify(CANON)) malos.push(f + ' → ' + JSON.stringify(got));
  });
  if (malos.length) throw new Error(malos.length + ' desviado(s):\n      ' + malos.join('\n      '));
});

ok('cada nivel conserva su paleta de Mundo propia', () => {
  /* La paleta del cuaderno (naranja, salmón, violeta…) es lo que distingue a
     cada Mundo; el pase de colores de bloque no debió tocarla. */
  const paletas = new Set();
  jsons.forEach(f => {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const p = (d.tema || {}).paleta;
    if (p && p.bold) paletas.add(p.bold);
  });
  if (paletas.size < 2) throw new Error('todas las paletas quedaron iguales: ' + [...paletas].join(', '));
});

/* ── Resultado ─────────────────────────────────────────────────────── */
console.log('\n' + '─'.repeat(64));
if (fallos) {
  console.log('  ✗ ' + fallos + ' fallo(s), ' + pasos + ' pasada(s)');
  console.log('─'.repeat(64) + '\n');
  process.exit(1);
}
console.log('  TODO VERDE — ' + pasos + ' pruebas');
console.log('─'.repeat(64) + '\n');
