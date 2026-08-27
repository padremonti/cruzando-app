/* ══════════════════════════════════════════════════════════════════════
   Banco de pruebas — el .lrc se explica solo

   Los cuatro data/{nivelId}-cantos.json se jubilan. De todo lo que
   guardaban, la letra ya estaba en el .lrc (medido: 80 de 80 en los
   cuadernos publicados); el ÚNICO dato que vivía solo ahí era el TÍTULO
   del canto — 16, uno por bloque. La migración lo estampó en el [ti:] del
   propio asset, que es donde debe vivir: así un canto nuevo llega con su
   nombre puesto y no hace falta una tabla paralela que se desincronice.

   De paso salió la numeración de estrofa que se había colado en la letra
   por Misterio y que el karaoke estaba PINTANDO EN PANTALLA («1. No fue
   fácil tu comienzo,») en 98 de los 105 archivos. En el canto de BLOQUE
   esa misma marca se conserva: allí no es basura, es la estructura que
   separa los 5 Misterios.

   Este banco existe para que ninguna de las dos cosas se deshaga: los
   títulos están congelados aquí abajo (sobreviven al borrado del JSON) y
   la letra está sellada en lrc-baseline.json verso a verso.

   Correr:  node tools/test-lrc-titulos.js
   Sellar:  node tools/test-lrc-titulos.js --sellar    (tras cambiar contenido a propósito)
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');
const crypto = require('crypto');

const RAIZ      = path.join(__dirname, '..');
const MUSIC_DIR = process.argv.find(a => !a.startsWith('--') && /cruzando-music/i.test(a))
               || 'C:\\R2\\cruzando-music';
const LRC_DIR   = path.join(MUSIC_DIR, 'lrc');
const BLQ_DIR   = path.join(MUSIC_DIR, 'cantos');
const BASELINE  = path.join(__dirname, 'lrc-baseline.json');
const SELLAR    = process.argv.includes('--sellar');

/* Los 16 títulos, congelados aquí. Esta tabla es la razón de ser del banco: cuando
   los -cantos.json desaparezcan, esto será lo único que recuerde qué debe decir el
   [ti:] de cada canto publicado. Uno por bloque, compartido por sus 5 Misterios. */
const TITULOS = {
  '0101': { gozosos:'Buena noticia',        luminosos:'Simplemente es realidad', dolorosos:'Dios no huye',             gloriosos:'Por Él Cruzamos' },
  '0102': { gozosos:'Nace Dios para salvar',luminosos:'Entra su luz',            dolorosos:'Cordero de Dios',          gloriosos:'Vivo en tu luz' },
  '0103': { gozosos:'Busco tu rostro',      luminosos:'Antes de decir que sí',   dolorosos:'No sanaste de inmediato',  gloriosos:'Testigos imperfectos' },
  '0104': { gozosos:'Antes que yo',         luminosos:'Eras gracia, ya lo sé',   dolorosos:'Tu herida en mi herida',   gloriosos:'Eres vida' }
};
const BLOQUES   = ['gozosos', 'luminosos', 'dolorosos', 'gloriosos'];
const PUBLICADOS = Object.keys(TITULOS);

/* El parser REAL de canto.js, no una copia: si el parser cambia, el banco lo nota. */
function cargarParser() {
  const sb = { window: {}, document: {} };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'canto.js'), 'utf8'), sb);
  if (!sb.window.Karaoke || !sb.window.Karaoke.parseLrc)
    throw new Error('canto.js ya no expone Karaoke.parseLrc');
  return sb.window.Karaoke.parseLrc;
}

let fallos = 0, pasos = 0;
function ok(nombre, fn) {
  try { fn(); console.log('  ✓ ' + nombre); pasos++; }
  catch (e) { console.log('  ✗ ' + nombre + '\n      ' + e.message); fallos++; }
}

// ── Inventario ────────────────────────────────────────────────────────────
function listar(dir, re) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => re.test(f)).sort();
}
const RE_MIS = /^M_(\d+)_(\d+)_(\d+)\.lrc$/i;
const RE_BLQ = /^CANTO_(\d+)_(\d+)_(\d+)\.lrc$/i;

const misFiles = listar(LRC_DIR, RE_MIS);
const blqFiles = listar(BLQ_DIR, RE_BLQ);

if (!misFiles.length && !blqFiles.length) {
  console.log('\n  ⚠ No encontré .lrc en ' + MUSIC_DIR);
  console.log('    Este banco audita los assets locales antes del sync. Sin la carpeta');
  console.log('    no comprueba NADA — no se finge que pasó.\n');
  process.exit(1);
}

const parseLrc = cargarParser();

function leer(dir, f) { return fs.readFileSync(path.join(dir, f), 'utf8'); }
function tituloDe(txt) { const m = txt.match(/^\s*\[ti:([^\]]*)\]/im); return m ? m[1].trim() : null; }
function letraDe(txt)  { return parseLrc(txt).map(e => e.text); }
function shaDe(lineas) { return crypto.createHash('sha1').update(lineas.join('\n'), 'utf8').digest('hex'); }
function marcasDe(lineas) { return lineas.filter(l => /^[1-5][.)]\s/.test(l)).length; }

// Qué cuaderno y bloque le toca a cada archivo
function claveMis(f) {
  const m = f.match(RE_MIS);
  const nid = String(m[1]).padStart(2,'0') + String(m[2]).padStart(2,'0');
  return { nid, blq: BLOQUES[Math.floor((parseInt(m[3],10) - 1) / 5)] };
}
function claveBlq(f) {
  const m = f.match(RE_BLQ);
  const nid = String(m[1]).padStart(2,'0') + String(m[2]).padStart(2,'0');
  return { nid, blq: BLOQUES[parseInt(m[3],10) - 1] };
}

// ── Sellado ───────────────────────────────────────────────────────────────
if (SELLAR) {
  const base = {};
  for (const f of misFiles) { const L = letraDe(leer(LRC_DIR, f)); base[f] = { n: L.length, sha: shaDe(L), marcas: marcasDe(L) }; }
  for (const f of blqFiles) { const L = letraDe(leer(BLQ_DIR, f)); base[f] = { n: L.length, sha: shaDe(L), marcas: marcasDe(L) }; }
  fs.writeFileSync(BASELINE, JSON.stringify(base, null, 1) + '\n', 'utf8');
  console.log('\n  Sellados ' + Object.keys(base).length + ' archivos en ' + path.basename(BASELINE) + '\n');
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;

// ══ Pruebas ═══════════════════════════════════════════════════════════════
console.log('\n── El título vive en el asset ──');

ok('los 20 .lrc de cada cuaderno publicado llevan [ti:] y es el que toca', () => {
  const mal = [];
  for (const f of misFiles) {
    const { nid, blq } = claveMis(f);
    if (!TITULOS[nid]) continue;                  // cuaderno sin publicar: no se le exige
    const ti = tituloDe(leer(LRC_DIR, f));
    if (ti !== TITULOS[nid][blq]) mal.push(f + ' → ' + JSON.stringify(ti) + ' (esperaba ' + JSON.stringify(TITULOS[nid][blq]) + ')');
  }
  if (mal.length) throw new Error(mal.length + ' sin título correcto:\n      ' + mal.slice(0,6).join('\n      '));
});

ok('los 16 cantos de bloque llevan [ti:] y es el mismo del bloque', () => {
  const mal = [];
  for (const f of blqFiles) {
    const { nid, blq } = claveBlq(f);
    if (!TITULOS[nid]) continue;
    const ti = tituloDe(leer(BLQ_DIR, f));
    if (ti !== TITULOS[nid][blq]) mal.push(f + ' → ' + JSON.stringify(ti));
  }
  if (mal.length) throw new Error(mal.join(', '));
});

ok('el Misterio y su canto de bloque nunca se contradicen', () => {
  // El mismo canto por dos caminos: si divergen, la galería y la sesión dirían
  // nombres distintos del mismo canto.
  const mal = [];
  for (const f of blqFiles) {
    const { nid, blq } = claveBlq(f);
    const tiB = tituloDe(leer(BLQ_DIR, f));
    for (const g of misFiles) {
      const k = claveMis(g);
      if (k.nid !== nid || k.blq !== blq) continue;
      const tiM = tituloDe(leer(LRC_DIR, g));
      if (tiM !== tiB) mal.push(g + '=' + JSON.stringify(tiM) + ' vs ' + f + '=' + JSON.stringify(tiB));
    }
  }
  if (mal.length) throw new Error(mal.slice(0,5).join('\n      '));
});

ok('parseLrc NO devuelve el [ti:] como si fuera letra', () => {
  // Es la condición que permite estampar el título sin ensuciar la pantalla.
  for (const f of misFiles.slice(0, 20)) {
    const L = letraDe(leer(LRC_DIR, f));
    if (L.some(l => /^\[?ti:/i.test(l) || /\[ti:/i.test(l)))
      throw new Error(f + ': la cabecera se está colando en los versos');
  }
});

console.log('\n── La numeración salió de donde estorbaba, sigue donde sirve ──');

ok('ningún canto por Misterio arrastra ya el «N. »', () => {
  const mal = [];
  for (const f of misFiles) {
    const L = letraDe(leer(LRC_DIR, f));
    const m = L.filter(l => /^[1-5][.)]\s/.test(l));
    if (m.length) mal.push(f + ' → ' + JSON.stringify(m[0]));
  }
  if (mal.length) throw new Error(mal.length + ' con numeración visible:\n      ' + mal.slice(0,6).join('\n      '));
});

ok('los cantos de bloque SÍ conservan sus marcas (son la estructura de los 5)', () => {
  const sin = blqFiles.filter(f => marcasDe(letraDe(leer(BLQ_DIR, f))) === 0);
  if (sin.length) throw new Error('perdieron la separación de Misterios: ' + sin.join(', '));
});

console.log('\n── La migración no tocó un solo verso ──');

ok('la letra sellada coincide archivo por archivo', () => {
  if (!baseline) throw new Error('falta ' + path.basename(BASELINE) + ' — sella con --sellar');
  const mal = [], nuevos = [];
  const ver = (dir, f) => {
    const L = letraDe(leer(dir, f));
    const b = baseline[f];
    if (!b) { nuevos.push(f); return; }
    if (shaDe(L) !== b.sha) mal.push(f + ': ' + b.n + ' → ' + L.length + ' líneas');
  };
  misFiles.forEach(f => ver(LRC_DIR, f));
  blqFiles.forEach(f => ver(BLQ_DIR, f));
  const faltan = Object.keys(baseline).filter(f => !misFiles.includes(f) && !blqFiles.includes(f));
  if (faltan.length) mal.push('DESAPARECIERON: ' + faltan.join(', '));
  if (nuevos.length) console.log('      · ' + nuevos.length + ' .lrc nuevos sin sellar: ' + nuevos.slice(0,8).join(' ') + (nuevos.length>8?' …':''));
  if (mal.length) throw new Error(mal.slice(0,8).join('\n      '));
});

console.log('\n── La letra se puede LEER, no solo cantar ──');

/* orar.html es el «libro digital»: su popup de canto es texto plano, y ahí los
   renglones vacíos son la separación de estrofas. parseLrc los tira (al karaoke le
   sobran); letraPlana los conserva. Que esa segunda lectura siga existiendo y siga
   dando estrofas es lo que sostiene esa pantalla. */
const Karaoke = (function () {
  const sb = { window: {}, document: {} };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'canto.js'), 'utf8'), sb);
  return sb.window.Karaoke;
})();

ok('canto.js sigue ofreciendo las dos lecturas del mismo archivo', () => {
  for (const f of ['parseLrc', 'letraPlana', 'parseLrcMeta', 'fetchLrc', 'letraDeBloque'])
    if (typeof Karaoke[f] !== 'function') throw new Error('falta Karaoke.' + f);
});

ok('letraPlana conserva los cortes de estrofa de lo publicado', () => {
  const planos = [];
  for (const f of misFiles) {
    const { nid } = claveMis(f);
    if (!TITULOS[nid]) continue;                    // solo se exige de lo publicado
    const p = Karaoke.letraPlana(leer(LRC_DIR, f));
    if (p.split(/\n\s*\n/).length < 2) planos.push(f);
  }
  if (planos.length)
    throw new Error(planos.length + ' quedaron sin una sola estrofa — el popup de orar sería un muro de texto:\n      ' + planos.slice(0,8).join(' '));
});

ok('letraPlana no deja marcas de tiempo, cabecera ni directivas', () => {
  const mal = [];
  const rev = (dir, f) => {
    const p = Karaoke.letraPlana(leer(dir, f));
    if (/\[\d+:\d/.test(p))      mal.push(f + ' (marca de tiempo)');
    if (/\[(ti|ar|al|by):/i.test(p)) mal.push(f + ' (cabecera)');
    if (/\[[a-z]+:/i.test(p))    mal.push(f + ' (directiva)');
  };
  misFiles.forEach(f => rev(LRC_DIR, f));
  blqFiles.forEach(f => rev(BLQ_DIR, f));
  if (mal.length) throw new Error(mal.slice(0,8).join(', '));
});

ok('letraDeBloque da un tramo por estrofa numerada, ni uno más', () => {
  /* No se exigen 5: el arreglo de bloque no siempre tiene una estrofa por Misterio
     (CANTO_1_2_4 solo trae dos, y es así en el disco). Lo que sí se exige es que el
     partido siga a las marcas del archivo y no invente un tramo de más con el
     estribillo de entrada. */
  const mal = [];
  for (const f of blqFiles) {
    const plana  = Karaoke.letraPlana(leer(BLQ_DIR, f));
    const marcas = plana.split('\n').filter(l => /^[1-5][.)]\s/.test(l)).length;
    const partes = Karaoke.letraDeBloque(plana).split('\n\n───\n\n');
    if (partes.length !== marcas) mal.push(f + ' → ' + partes.length + ' tramos para ' + marcas + ' marcas');
    if (partes.some(p => !p.trim()))  mal.push(f + ' → tramo vacío');
  }
  if (mal.length) throw new Error('la galería guardaría un canto mal partido: ' + mal.join(', '));
});

ok('el estribillo de entrada va con el primer Misterio, no aparte', () => {
  // Es lo que antes ocurría solo: cada letra del JSON traía su estribillo dentro.
  const conPreludio = blqFiles.filter(f => {
    const L = Karaoke.letraPlana(leer(BLQ_DIR, f)).split('\n');
    const i = L.findIndex(l => /^[1-5][.)]\s/.test(l));
    return i > 0 && L.slice(0, i).some(l => l.trim());
  });
  if (!conPreludio.length) throw new Error('ningún canto abre por el estribillo: la prueba ya no comprueba nada');
  for (const f of conPreludio) {
    const partes = Karaoke.letraDeBloque(Karaoke.letraPlana(leer(BLQ_DIR, f))).split('\n\n───\n\n');
    const L = Karaoke.letraPlana(leer(BLQ_DIR, f)).split('\n');
    const primera = L.find(l => l.trim());
    if (!partes[0].startsWith(primera))
      throw new Error(f + ': el arranque se quedó suelto en vez de ir con el Misterio 1');
  }
});

ok('y esos cinco tramos conservan sus propias estrofas', () => {
  // Si el partido se comiera los renglones vacíos, la hoja de letra de la galería
  // volvería a ser un bloque corrido.
  const mal = [];
  for (const f of blqFiles) {
    const partes = Karaoke.letraDeBloque(Karaoke.letraPlana(leer(BLQ_DIR, f))).split('\n\n───\n\n');
    if (!partes.some(p => /\n\s*\n/.test(p))) mal.push(f);
  }
  if (mal.length) throw new Error(mal.join(', '));
});

console.log('\n── Los assets siguen sanos ──');

ok('UTF-8 sin BOM y sin mojibake', () => {
  const mal = [];
  const rev = (dir, f) => {
    const raw = fs.readFileSync(path.join(dir, f));
    if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) mal.push(f + ' (BOM)');
    const t = raw.toString('utf8');
    if (/Ã[\x80-\xBF]|â€/.test(t)) mal.push(f + ' (mojibake)');
  };
  misFiles.forEach(f => rev(LRC_DIR, f));
  blqFiles.forEach(f => rev(BLQ_DIR, f));
  if (mal.length) throw new Error(mal.slice(0,8).join(', '));
});

ok('ningún .lrc parsea vacío', () => {
  const mal = [];
  misFiles.forEach(f => { if (!letraDe(leer(LRC_DIR, f)).length) mal.push(f); });
  blqFiles.forEach(f => { if (!letraDe(leer(BLQ_DIR, f)).length) mal.push(f); });
  if (mal.length) throw new Error('sin una sola línea de letra: ' + mal.join(', '));
});

ok('ninguna directiva [cut:]/[kb:] se cuela en el texto', () => {
  const mal = [];
  const rev = (dir, f) => { if (letraDe(leer(dir, f)).some(l => /\[[a-z]+:/i.test(l))) mal.push(f); };
  misFiles.forEach(f => rev(LRC_DIR, f));
  blqFiles.forEach(f => rev(BLQ_DIR, f));
  if (mal.length) throw new Error(mal.join(', '));
});

console.log('\n── Cobertura de lo publicado ──');

ok('los cuatro cuadernos publicados tienen sus 20 Misterios con letra', () => {
  const mal = [];
  for (const nid of PUBLICADOS) {
    const n = parseInt(nid.slice(0,2),10), c = parseInt(nid.slice(2),10);
    for (let m = 1; m <= 20; m++) {
      if (!misFiles.includes('M_' + n + '_' + c + '_' + m + '.lrc')) mal.push(nid + ' M' + m);
    }
  }
  if (mal.length) throw new Error('faltan ' + mal.length + ': ' + mal.slice(0,10).join(', '));
});

ok('los cuatro cuadernos publicados tienen sus 4 cantos de bloque', () => {
  const mal = [];
  for (const nid of PUBLICADOS) {
    const n = parseInt(nid.slice(0,2),10), c = parseInt(nid.slice(2),10);
    for (let b = 1; b <= 4; b++) {
      if (!blqFiles.includes('CANTO_' + n + '_' + c + '_' + b + '.lrc')) mal.push(nid + ' b' + b);
    }
  }
  if (mal.length) throw new Error('faltan: ' + mal.join(', '));
});

// ── Resumen ───────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(62));
console.log('  ' + pasos + ' pruebas pasadas, ' + fallos + ' fallidas   ' +
            '(' + misFiles.length + ' por Misterio + ' + blqFiles.length + ' de bloque)');
console.log('─'.repeat(62) + '\n');
process.exit(fallos ? 1 : 0);
