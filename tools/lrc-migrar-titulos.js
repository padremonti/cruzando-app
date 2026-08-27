/* CruzAndo — lrc-migrar-titulos.js
 *
 * ⚠ GASTADO — YA CORRIÓ, Y SU FUENTE YA NO EXISTE.
 *   Los cuatro data/{nivelId}-cantos.json se borraron después de esta migración,
 *   así que volver a lanzarlo no hará nada: sin JSON no hay título ni estructura
 *   que copiar. Se conserva como acta de qué se hizo a los .lrc y por qué, y como
 *   plantilla si algún día hay que mudar otro dato al asset. Quien quiera
 *   comprobar el resultado usa tools/test-lrc-titulos.js, que NO depende del JSON:
 *   lleva los 16 títulos congelados y la letra sellada en lrc-baseline.json.
 *
 * Migración de UNA sola vez, en dos pasadas: pasa al .lrc lo que solo vivía en los
 * data/{nivelId}-cantos.json —el TÍTULO y los CORTES DE ESTROFA— y de paso limpia la
 * numeración que se había colado en la letra por Misterio.
 *
 * POR QUÉ. La letra ya estaba en el .lrc (medido: 80/80 de los cuadernos publicados).
 * Lo único que no estaba era el título y el modo en que el autor parte el texto en
 * estrofas. Mudados al asset, el .lrc se explica solo, el JSON se jubila entero, y un
 * canto nuevo llega con su nombre puesto en vez de exigir una tabla paralela.
 *
 * LAS DOS PASADAS:
 *   1. [ti:] + limpieza del «N. »  → 96 títulos, 99 líneas despiojadas
 *   2. cortes de estrofa           → 134 renglones vacíos en 62 archivos
 *
 * QUÉ TOCA — dos carpetas, con reglas DISTINTAS a propósito:
 *
 *   lrc/M_{n}_{c}_{m}.lrc        (105, uno por Misterio)
 *     · estampa  [ti: Título]  — el del bloque al que pertenece el Misterio
 *     · BORRA el «N. » inicial de la letra: ahí es basura, y hoy se está pintando
 *       en la pantalla de canto de audio y rezar («1. No fue fácil tu comienzo,»).
 *
 *   cantos/CANTO_{n}_{c}_{b}.lrc (16, uno por bloque, para la galería)
 *     · estampa  [ti: Título]
 *     · CONSERVA el «N. »: aquí NO es basura, es estructura — marca dónde empieza
 *       cada uno de los 5 Misterios dentro del canto de bloque.
 *
 * El número solo va de 1 a 5 (el índice del Misterio dentro del bloque), verificado
 * sobre los 121 archivos; por eso el patrón se acota a [1-5] y no puede comerse un
 * verso que empiece por una cifra.
 *
 * IDEMPOTENTE. Un .lrc que ya tenga [ti:] no se vuelve a estampar (si el título
 * difiere, se avisa y no se toca: decide una persona). Un archivo ya limpio no cambia.
 *
 * RESPALDO fuera del árbol que se sincroniza. rclone corre en modo `sync`: una carpeta
 * de respaldo dentro de cruzando-music acabaría subida al bucket. Va a
 * C:\R2\_respaldo-lrc\{AAAAMMDD-HHmmss}\.
 *
 * Cuadernos sin JSON (2-1, 2-2 y los Mundos 2-7) se quedan SIN [ti:] y se listan:
 * no hay título que estampar, y la degradación ya está prevista en canto.js.
 *
 * Uso:
 *   node lrc-migrar-titulos.js                 → ensayo: dice qué haría, no escribe
 *   node lrc-migrar-titulos.js --aplicar       → escribe (con respaldo previo)
 *   node lrc-migrar-titulos.js --aplicar C:\otra\ruta\cruzando-music
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const APLICAR   = process.argv.includes('--aplicar');
const MUSIC_DIR = process.argv.find(a => !a.startsWith('--') && /cruzando-music/i.test(a))
               || 'C:\\R2\\cruzando-music';
const LRC_DIR    = path.join(MUSIC_DIR, 'lrc');
const CANTOS_DIR = path.join(MUSIC_DIR, 'cantos');
const DATA_DIR   = path.join(__dirname, '..', 'data');

const BLOQUES  = ['gozosos', 'luminosos', 'dolorosos', 'gloriosos'];
const CUADERNOS = ['0101', '0102', '0103', '0104'];   // los que tienen -cantos.json

/* La marca de estrofa: un dígito 1-5, punto o paréntesis, y espacio. Se aplica al
   TEXTO de la línea, nunca a la marca de tiempo ni a las directivas [cut:]/[kb:]. */
const RE_NUM   = /^[1-5][.)]\s+/;
const NORM     = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
                       .toLowerCase().replace(/[^a-z0-9]+/g, '');
const RE_TIME  = /^\s*\[\d+:\d+(?:\.\d+)?\]/;
const RE_DIRS  = /^(?:\s*\[[a-z]+:[^\]]*\])*/i;
const RE_TI    = /^\s*\[ti:/i;
/* Los cinco textos del bloque se unen con un renglón en blanco entre Misterio y
   Misterio: así el corte entre ellos también cuenta como abre-estrofa al alinear. */
const SEP_MIS  = '\n\n';

function fin(txt) { return txt.includes('\r\n') ? '\r\n' : '\n'; }

/* ── Los cortes de estrofa ──────────────────────────────────────────────
   El .lrc guarda los renglones vacíos que separan estrofas, pero trae MENOS de los
   que el JSON tenía: en 0101 el JSON parte en cuatro estrofas legibles lo que el
   .lrc deja en dos bloques de ocho versos. Eso da igual en el karaoke (una línea
   cada vez) pero no en el popup de canto de orar.html, que es texto para LEER —y
   orar es, a propósito, el «libro digital» de la app.

   Así que la estructura del autor también se muda al asset. Se alinean las dos
   secuencias por subsecuencia común más larga (LCS) en vez de por índice: 76 de 80
   coinciden verso a verso, pero dos cantos de 1-4 tienen las estrofas en otro orden,
   y alinear a ciegas les metería cortes en mitad de un verso. Lo que LCS no empareja
   se queda como está: ante la duda, no se toca. */
function lcsMap(A, B) {
  const n = A.length, m = B.length;
  const d = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      d[i][j] = A[i] === B[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
  const out = new Map();
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.set(i, j); i++; j++; }
    else if (d[i + 1][j] >= d[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/* Del texto del JSON: sus versos normalizados y cuál abre estrofa. */
function estructuraJson(letra) {
  const lin = [], abre = [];
  let pendiente = true;
  for (const r of String(letra || '').split(/\r?\n/)) {
    if (!r.trim()) { pendiente = true; continue; }
    lin.push(NORM(r)); abre.push(pendiente); pendiente = false;
  }
  return { lin, abre };
}

/* Título de cada bloque, leído de los -cantos.json. Los cinco Misterios de un bloque
   comparten título (verificado en los cuatro cuadernos), así que se toma el primero
   que lo tenga en vez de asumir que el índice 0 existe. */
function leerCantos() {
  const T = {}, L = {};   // T: '0101' -> {gozosos:'Buena noticia',…}   L: '0101' -> {gozosos:[5 letras],…}
  for (const nid of CUADERNOS) {
    const f = path.join(DATA_DIR, nid + '-cantos.json');
    if (!fs.existsSync(f)) { console.warn('[lrc] falta ' + path.basename(f) + ' — se omite ' + nid); continue; }
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    T[nid] = {}; L[nid] = {};
    for (const b of BLOQUES) {
      const arr = (j.cantos && j.cantos[b]) || [];
      const con = arr.find(c => c && c.titulo);
      if (con) T[nid][b] = String(con.titulo).trim();
      L[nid][b] = arr.map(c => (c && c.letra) || '');
    }
  }
  return { T, L };
}

/* Una pasada por el contenido. Devuelve el texto nuevo y qué cambió. */
function transformar(txt, titulo, quitarNumeracion, letraJson) {
  const nl    = fin(txt);
  let lines   = txt.split(/\r?\n/);
  let quitadas = 0, cortes = 0;

  if (quitarNumeracion) {
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].match(RE_TIME);
      if (!t) continue;
      const resto = lines[i].slice(t[0].length);
      const d     = resto.match(RE_DIRS)[0];          // [cut:1][kb:slow]… se conservan
      const texto = resto.slice(d.length);
      /* El espacio que separa la marca de tiempo del verso se conserva tal cual:
         la marca a quitar empieza DESPUÉS de él, no en la columna 0. */
      const ws     = texto.match(/^[ \t]*/)[0];
      const cuerpo = texto.slice(ws.length);
      const lim    = cuerpo.replace(RE_NUM, '');
      if (lim !== cuerpo) { lines[i] = t[0] + d + ws + lim; quitadas++; }
    }
  }

  /* Cortes de estrofa según el JSON. Se hace ANTES de la cabecera para que los
     índices de línea no bailen, y solo añade renglones vacíos: ni un verso se mueve. */
  if (letraJson) {
    const { lin: JL, abre: JA } = estructuraJson(letraJson);
    const idx = [], txtLrc = [];
    lines.forEach((l, k) => {
      const t = l.match(RE_TIME);
      if (!t) return;
      const r = l.slice(t[0].length).replace(/\[[a-z]+:[^\]]*\]/ig, '').trim();
      if (r) { idx.push(k); txtLrc.push(NORM(r)); }
    });
    const map = lcsMap(txtLrc, JL);
    const insertarEn = [];
    for (let k = 1; k < txtLrc.length; k++) {
      const j = map.get(k);
      if (j === undefined || !JA[j]) continue;
      // ¿ya hay un renglón vacío entre este verso y el anterior?
      let hueco = false;
      for (let p = idx[k] - 1; p > idx[k - 1]; p--) if (!lines[p].trim()) { hueco = true; break; }
      if (!hueco) insertarEn.push(idx[k]);
    }
    // De atrás hacia adelante: insertar no desplaza lo que aún falta por insertar.
    for (let z = insertarEn.length - 1; z >= 0; z--) lines.splice(insertarEn[z], 0, '');
    cortes = insertarEn.length;
  }

  // La cabecera va arriba del todo, con la misma forma que ya usa el autor en
  // M_2_1_1.lrc: «[ti: Título]» y una línea en blanco debajo.
  let estampado = false;
  const yaTiene = lines.some(l => RE_TI.test(l));
  if (titulo && !yaTiene) { lines.unshift('[ti: ' + titulo + ']', ''); estampado = true; }

  return { texto: lines.join(nl), estampado, quitadas, cortes, yaTiene };
}

function tituloExistente(txt) {
  const m = txt.match(/^\s*\[ti:([^\]]*)\]/im);
  return m ? m[1].trim() : null;
}

function main() {
  for (const d of [LRC_DIR, CANTOS_DIR]) {
    if (!fs.existsSync(d)) { console.error('[lrc] No existe la carpeta: ' + d); process.exit(1); }
  }
  const { T, L } = leerCantos();

  // Cada archivo con el título que le toca (null = no hay JSON para ese cuaderno)
  const trabajos = [];

  for (const f of fs.readdirSync(LRC_DIR).sort()) {
    const m = f.match(/^M_(\d+)_(\d+)_(\d+)\.lrc$/i);
    if (!m) continue;
    const nid = String(m[1]).padStart(2, '0') + String(m[2]).padStart(2, '0');
    const mis = parseInt(m[3], 10);                       // 1-20 global
    const blq = BLOQUES[Math.floor((mis - 1) / 5)];
    trabajos.push({ file: path.join(LRC_DIR, f), nombre: f, nid, blq,
                    titulo: (T[nid] && T[nid][blq]) || null, quitarNumeracion: true,
                    letraJson: (L[nid] && L[nid][blq] && L[nid][blq][(mis - 1) % 5]) || null });
  }

  for (const f of fs.readdirSync(CANTOS_DIR).sort()) {
    const m = f.match(/^CANTO_(\d+)_(\d+)_(\d+)\.lrc$/i);
    if (!m) continue;
    const nid = String(m[1]).padStart(2, '0') + String(m[2]).padStart(2, '0');
    const blq = BLOQUES[parseInt(m[3], 10) - 1];
    /* El canto de bloque es la concatenación de los cinco: se alinea contra los cinco
       textos unidos, así hereda los mismos cortes de estrofa que sus Misterios. */
    trabajos.push({ file: path.join(CANTOS_DIR, f), nombre: f, nid, blq,
                    titulo: (T[nid] && T[nid][blq]) || null, quitarNumeracion: false,
                    letraJson: (L[nid] && L[nid][blq]) ? L[nid][blq].join(SEP_MIS) : null });
  }

  // Respaldo antes de la primera escritura, no antes de saber si hay alguna
  let backupDir = null;
  const respaldar = (job) => {
    if (!APLICAR) return;
    if (!backupDir) {
      const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
      const sello = '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) +
                    '-' + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
      backupDir = path.join(path.dirname(MUSIC_DIR), '_respaldo-lrc', sello);
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const sub = path.join(backupDir, path.basename(path.dirname(job.file)));
    fs.mkdirSync(sub, { recursive: true });
    fs.copyFileSync(job.file, path.join(sub, job.nombre));
  };

  const R = { estampados: 0, limpiados: 0, lineas: 0, intactos: 0, estrofados: 0, cortes: 0,
              sinTitulo: [], conflicto: [], yaEstampados: 0 };

  for (const job of trabajos) {
    const orig = fs.readFileSync(job.file, 'utf8');
    const ti   = tituloExistente(orig);

    // Ya tenía [ti:] y NO coincide: no se pisa un dato escrito a mano. Decide una persona.
    if (ti !== null && job.titulo && ti !== job.titulo) {
      R.conflicto.push({ nombre: job.nombre, enArchivo: ti, enJson: job.titulo });
    }
    if (ti !== null) R.yaEstampados++;
    if (!job.titulo && ti === null) R.sinTitulo.push(job.nombre);

    const out = transformar(orig, job.titulo, job.quitarNumeracion, job.letraJson);
    if (out.texto === orig) { R.intactos++; continue; }

    if (out.estampado) R.estampados++;
    if (out.quitadas)  { R.limpiados++;  R.lineas += out.quitadas; }
    if (out.cortes)    { R.estrofados++; R.cortes += out.cortes; }

    if (APLICAR) { respaldar(job); fs.writeFileSync(job.file, out.texto, 'utf8'); }
  }

  const modo = APLICAR ? 'APLICADO' : 'ENSAYO (nada escrito — usa --aplicar)';
  console.log('');
  console.log('══ lrc-migrar-titulos · ' + modo + ' ══');
  console.log('  archivos examinados    : ' + trabajos.length +
              '  (' + LRC_DIR + ' + ' + CANTOS_DIR + ')');
  console.log('  [ti:] estampados       : ' + R.estampados);
  console.log('  ya traían [ti:]        : ' + R.yaEstampados);
  console.log('  archivos despiojados   : ' + R.limpiados + '  (' + R.lineas + ' líneas con «N. »)');
  console.log('  cortes de estrofa       : ' + R.cortes + '  en ' + R.estrofados + ' archivos');
  console.log('  sin cambios            : ' + R.intactos);
  if (backupDir) console.log('  respaldo               : ' + backupDir);

  if (R.sinTitulo.length) {
    console.log('');
    console.log('  ── sin título (no hay -cantos.json para su cuaderno) ── ' + R.sinTitulo.length);
    console.log('     ' + R.sinTitulo.join(' '));
    console.log('     Se quedan sin [ti:]: canto.js cae en el título que le dé la página.');
  }
  if (R.conflicto.length) {
    console.log('');
    console.log('  ⚠ CONFLICTO — el archivo ya tenía otro título; NO se tocó:');
    for (const c of R.conflicto) {
      console.log('     ' + c.nombre + '  archivo=' + JSON.stringify(c.enArchivo) +
                  '  json=' + JSON.stringify(c.enJson));
    }
  }
  console.log('');
  if (!APLICAR) console.log('  Repite con --aplicar para escribir. Después: tools\\cruzando-sync-real.bat');
  else          console.log('  Ahora corre  tools\\cruzando-sync-real.bat  para subirlo a R2.');
  console.log('');
}

main();
