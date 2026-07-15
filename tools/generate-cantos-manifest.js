/* CruzAndo — generate-cantos-manifest.js
 *
 * Genera el manifiesto del carrusel de los cantos de bloque para cantos.html.
 * Un canto de bloque reutiliza (Ruta B) las imágenes de sus 5 Misterios, que ya
 * viven en cruzando-ilustraciones/cantos/{nivel}_{cuaderno}_{misterio}/. En vez de
 * que el navegador sondee 40-45 imágenes una a una, lee este manifiesto de un tirón.
 *
 * Salida: cruzando-ilustraciones/cantos/manifest.json
 *   {
 *     "1_1_1": ["cantos/1_1_1/P_1_1_1a.webp", …, "cantos/1_1_5/P_1_1_5i.webp"],
 *     "1_1_2": [ …imágenes de los Misterios 6-10… ],
 *     …
 *   }
 *   La clave es {nivel}_{cuaderno}_{bloqueIdx} (bloqueIdx 1-4), que es como
 *   cantos.html identifica un canto. Las rutas son relativas a la raíz del bucket
 *   de ilustraciones (cantos.html les antepone su base).
 *
 * Mapa bloque → Misterios (numeración global 1-20):
 *   bloqueIdx 1 (gozosos)   → Misterios  1- 5
 *   bloqueIdx 2 (luminosos) → Misterios  6-10
 *   bloqueIdx 3 (dolorosos) → Misterios 11-15
 *   bloqueIdx 4 (gloriosos) → Misterios 16-20
 *
 * Se ejecuta ANTES del sync (lo llama cruzando-sync-real.bat), leyendo la carpeta
 * local, para que el manifiesto suba junto a las imágenes que describe.
 *
 * La salida es DETERMINISTA (claves y listas ordenadas, sin marca de tiempo): si el
 * conjunto de imágenes no cambió, el archivo es idéntico y rclone no lo resube.
 *
 * Uso:  node generate-cantos-manifest.js  [rutaCantos]
 *   rutaCantos por defecto: C:\R2\cruzando-ilustraciones\cantos
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const CANTOS_DIR = process.argv[2] || 'C:\\R2\\cruzando-ilustraciones\\cantos';
const OUT_FILE   = path.join(CANTOS_DIR, 'manifest.json');

// Orden natural para que P_..a, P_..b … P_..i queden en secuencia (no alfabético crudo)
function natCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function main() {
  if (!fs.existsSync(CANTOS_DIR)) {
    console.error('[manifest] No existe la carpeta: ' + CANTOS_DIR);
    process.exit(1);
  }

  // 1) Recoger las imágenes .webp de cada carpeta de Misterio {n}_{c}_{m}
  //    (solo la raíz de la carpeta; se ignora la subcarpeta png/ de fuentes).
  const porMisterio = {};   // 'n_c_m' -> [rutas relativas ordenadas]
  for (const entry of fs.readdirSync(CANTOS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const m = entry.name.match(/^(\d+)_(\d+)_(\d+)$/);
    if (!m) continue;
    const dir = path.join(CANTOS_DIR, entry.name);
    const webp = fs.readdirSync(dir)
      .filter(f => f.toLowerCase().endsWith('.webp'))
      .sort(natCompare)
      .map(f => 'cantos/' + entry.name + '/' + f);
    if (webp.length) porMisterio[entry.name] = { key: entry.name, n: +m[1], c: +m[2], mis: +m[3], webp };
  }

  // 2) Agrupar por bloque: bloqueIdx b → Misterios (b-1)*5+1 .. b*5
  const manifest = {};
  for (const info of Object.values(porMisterio)) {
    const bloqueIdx = Math.floor((info.mis - 1) / 5) + 1;   // 1..4
    if (bloqueIdx < 1 || bloqueIdx > 4) continue;           // fuera de rango => ignorar
    const key = info.n + '_' + info.c + '_' + bloqueIdx;
    (manifest[key] = manifest[key] || []).push(info);
  }

  // 3) Dentro de cada bloque: ordenar por Misterio y concatenar sus imágenes
  const out = {};
  for (const key of Object.keys(manifest).sort(natCompare)) {
    const bloque = manifest[key].sort((a, b) => a.mis - b.mis);
    out[key] = bloque.flatMap(info => info.webp);
  }

  // 4) Escribir (2 espacios, salto final: diff limpio en git y estable para rclone)
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');

  const bloques = Object.keys(out).length;
  const imgs = Object.values(out).reduce((s, a) => s + a.length, 0);
  console.log('[manifest] ' + bloques + ' bloques, ' + imgs + ' imágenes → ' + OUT_FILE);
}

main();
