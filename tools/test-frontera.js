/* ══════════════════════════════════════════════════════════════════════
   Banco de pruebas — la frontera de progreso

   La frontera es el último cuaderno que el usuario alcanzó. De ella cuelgan
   el candado de los orbes del selector de niveles (`buildLevelPicker`), el
   nodo "Siguiente" del mapa y el acceso a Extras. NO es lo mismo que el
   bookmark (`cruzando_current_nivel`), que dice dónde está parado: la
   frontera dice hasta dónde ha llegado.

   Se calcula leyendo `users/{uid}/progress/{nivelId}` en Firestore, no de
   localStorage. Que eso siguiera siendo cierto es lo que falló:

     · c316f82 dejó `var BLOCKS` tragado dentro del comentario de arriba;
     · `BLOCKS.every(...)` lanzaba ReferenceError en la primera vuelta;
     · el try/catch de degradación lo tomaba por una caída de red y bajaba
       la frontera a '0101' sin decir nada;
     · la cola de onAuthStateChanged persistía ese '0101', y la FASE 1 lo
       prefería sobre el bookmark en la carga siguiente. Se reescribía a sí
       mismo para siempre.

   Nadie lo notó porque los aparatos ya traían un valor bueno de antes del
   commit. Un iPhone que limpió los datos de Safari lo destapó: el selector
   se quedó anclado en 1-1 con los cuatro cuadernos del Mundo 1 rezados.

   Correr:  node tools/test-frontera.js
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

const GEMELOS = ['crecer.html', 'index.html'];
const MAPA    = 'crecer.html';        // el único con selector de niveles
/* La regla de la frontera se mudó a niveles.js —estaba escrita CUATRO veces—,
   así que aquí se carga el módulo REAL y se prueba con el itinerario real: una
   lista de mentira dejaría fuera justo el recorrido que se quiere probar. */
function cargarNiveles() {
  const c = { localStorage: { getItem: () => null, setItem() {} }, console };
  c.window = c; vm.createContext(c);
  vm.runInContext(leer('niveles.js'), c);
  return c.window.Niveles;
}
const ORDEN   = cargarNiveles().ORDEN;
const BLOQUES = ['gozosos','luminosos','dolorosos','gloriosos'];

let fallos = 0, pasos = 0;
function ok(nombre, fn) {
  try { fn(); console.log('  ✓ ' + nombre); pasos++; }
  catch (e) { console.log('  ✗ ' + nombre + '\n      ' + e.message); fallos++; }
}
function igual(real, esperado, que) {
  if (real !== esperado) throw new Error(que + ': se esperaba ' + JSON.stringify(esperado) +
                                         ' y llegó ' + JSON.stringify(real));
}

/* ── Ejecutar el código real de la página ───────────────────────────────
   Se recorta del HTML y se corre en un vm. No es una copia del algoritmo:
   si la página cambia, cambia lo que se prueba.                        */

function recortar(pagina) {
  const s   = leer(pagina);
  const iB  = s.indexOf('var BLOCKS =');
  const iF  = s.indexOf('/* La frontera —hasta dónde ha llegado— vive en niveles.js');
  const jF  = s.indexOf('// ── Mostrar pantalla', iF);
  if (iB < 0) throw new Error(pagina + ': no se encuentra la declaración de BLOCKS');
  if (iF < 0 || jF < 0) throw new Error(pagina + ': no se encuentra el bloque de la frontera');
  /* La línea ENTERA de BLOCKS, desde su principio: si volviera a quedar pegada
     detrás de un `//`, aquí llega comentada y el vm revienta igual que Safari.
     Recortar desde `var` la desenterraría del comentario y taparía el bug. */
  const iLinea = s.lastIndexOf('\n', iB) + 1;
  return s.slice(iLinea, s.indexOf('\n', iB) + 1) + '\n' + s.slice(iF, jF);
}

function almacen(semilla) {
  const m = new Map(Object.entries(semilla || {}));
  return {
    getItem:    k => (m.has(k) ? m.get(k) : null),
    setItem:    (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    _volcado:   () => Object.fromEntries(m),
  };
}

const lleno = () => Object.fromEntries(BLOQUES.map(b => [b, [1,1,1,1,1]]));
const medio = () => Object.fromEntries(BLOQUES.map(b => [b, [1,1,null,null,null]]));

// Por defecto: 0101 y 0102 enteros, 0103 a medias, del 0104 en adelante sin doc.
const DOCS = { '0101': { progress: lleno() },
               '0102': { progress: lleno() },
               '0103': { progress: medio() } };

function correr(pagina, op) {
  op = op || {};
  const docs   = op.docs || DOCS;
  const store  = almacen(op.guardado);
  const dichos = [];
  const caja = {
    NIVELES_ORDER: ORDEN,
    localStorage: store,
    console: { warn:  (...a) => dichos.push(['warn',  String(a[0])]),
               error: (...a) => dichos.push(['error', String(a[0])]) },
    ReferenceError, TypeError,
    getCurrentNivel: () => '0101',       // el último recurso de la página
    db: {},
    doc: (_db, _users, _uid, _prog, id) => id,
    getDoc: async id => {
      if (op.romperRed)    throw new Error('network request failed');
      if (op.romperCodigo) throw new TypeError('undefined is not an object');
      const d = docs[id];
      return { exists: () => !!d, data: () => d };
    },
  };
  /* window ES el contexto: en el navegador `window.Niveles = X` deja `Niveles`
     como global suelta, y la página la usa así. Con un window aparte llegaría
     undefined y la prueba fallaría por el andamio, no por el código. */
  caja.window = caja;
  vm.createContext(caja);
  vm.runInContext(leer('niveles.js'), caja);
  vm.runInContext(recortar(pagina) + '\nglobalThis.__f = getCurrentNivelFromFirestore;', caja);
  return caja.__f({ uid: 'u1' }).then(nivel => ({
    nivel,
    frontera:  caja.window.frontierNivelId,
    degradado: caja.window._frontierDegradado,
    guardado:  store._volcado(),
    dichos,
  }));
}

/* ── Las pruebas ────────────────────────────────────────────────────── */

(async () => {

console.log('\n── La frontera sale de Firestore, no del caché ──');

for (const p of GEMELOS) {
  const n = p.padEnd(12);

  let r = await correr(p);
  ok(n + '· se detiene en el primer cuaderno incompleto', () => {
    igual(r.frontera, '0103', 'frontera');
    igual(r.nivel,    '0103', 'nivel activo (sin bookmark)');
    igual(r.degradado, null,  'marca de degradación');
    if (r.dichos.length) throw new Error('no debería decir nada: ' + JSON.stringify(r.dichos));
  });

  ok(n + '· la persiste en la clave versionada, no en la vieja', () => {
    igual(r.guardado['cruzando_frontier_v2'], '0103', 'cruzando_frontier_v2');
    if ('cruzando_frontier_nivel' in r.guardado)
      throw new Error('volvió a escribir la clave v1, que quedó envenenada');
  });

  /* EL CASO DEL IPHONE: el aparato trae la v1 con '0101' de cuando BLOCKS
     no existía. Si esa clave volviera a mandar, el bug seguiría vivo. */
  r = await correr(p, { guardado: { 'cruzando_frontier_nivel': '0101' } });
  ok(n + '· la v1 envenenada con 0101 ya no manda', () => igual(r.frontera, '0103', 'frontera'));

  r = await correr(p, { guardado: { 'cruzando_current_nivel': '0102' } });
  ok(n + '· el bookmark dice dónde estoy, no hasta dónde llegué', () => {
    igual(r.nivel,    '0102', 'nivel activo');
    igual(r.frontera, '0103', 'frontera');
  });

  r = await correr(p, { docs: { '0101': lleno(), '0102': lleno() } });
  ok(n + '· un progress sin campo .progress corta ahí', () => igual(r.frontera, '0101', 'frontera'));

  r = await correr(p, { docs: Object.fromEntries(ORDEN.map(id => [id, { progress: lleno() }])) });
  ok(n + '· con todo rezado la frontera es el último cuaderno', () =>
    igual(r.frontera, ORDEN[ORDEN.length - 1], 'frontera'));
}

console.log('\n── Un fallo de código no se disfraza de caída de red ──');

for (const p of GEMELOS) {
  const n = p.padEnd(12);

  let r = await correr(p, { romperRed: true, guardado: { 'cruzando_frontier_v2': '0102' } });
  ok(n + '· sin red: usa lo último conocido y avisa con warn', () => {
    igual(r.frontera,  '0102', 'frontera');
    igual(r.degradado, 'red',  'marca de degradación');
    if (r.dichos.length !== 1 || r.dichos[0][0] !== 'warn')
      throw new Error('debía avisar una vez con console.warn: ' + JSON.stringify(r.dichos));
  });

  r = await correr(p, { romperCodigo: true });
  ok(n + '· error de código: grita con console.error', () => {
    igual(r.degradado, 'bug', 'marca de degradación');
    if (r.dichos.length !== 1 || r.dichos[0][0] !== 'error')
      throw new Error('debía gritar una vez con console.error: ' + JSON.stringify(r.dichos));
  });

  /* Lo que cerró el ciclo del bug: una frontera degradada NO se escribe.
     Mientras se persistiera, se prefería a sí misma en la carga siguiente. */
  ok(n + '· una frontera degradada nunca se persiste', async () => {
    if ('cruzando_frontier_v2' in r.guardado)
      throw new Error('persistió una frontera que no llegó a calcularse');
  });
}

console.log('\n── El cableado de la página ──');

GEMELOS.forEach(p => {
  const n = p.padEnd(12);
  const s = leer(p);

  ok(n + '· la cola de onAuthStateChanged ya no persiste la frontera', () => {
    /* Era el eslabón que reescribía el valor degradado en cada carga. Ahora
       la única que escribe la clave es getCurrentNivelFromFirestore. */
    if (/setItem\(['"]cruzando_frontier_nivel['"]/.test(s))
      throw new Error('volvió a escribir la clave v1');
    /* La escritura vive ahora en niveles.js, y en un solo sitio. La página no
       debe volver a escribirla por su cuenta: ese era el eslabón del ciclo. */
    const escrituras = (s.match(/localStorage\.setItem\(FRONTIER_KEY/g) || []).length;
    if (escrituras !== 0)
      throw new Error('la página volvió a escribir la frontera por su cuenta (' + escrituras + ')');
    const enModulo = (leer('niveles.js').match(/localStorage\.setItem\(CLAVE_FRONTERA/g) || []).length;
    if (enModulo !== 1)
      throw new Error('niveles.js debe escribirla exactamente una vez, hay ' + enModulo);
  });

  ok(n + '· sin frontera guardada se recalcula aunque el caché esté fresco', () => {
    if (!/var _hasFrontier = !!localStorage\.getItem\(FRONTIER_KEY\);/.test(s))
      throw new Error('falta la lectura de _hasFrontier en la FASE 1');
    if (!/if \(dirty \|\| !_hasCache \|\| !_hasFrontier\) \{/.test(s))
      throw new Error('la puerta de la FASE 2 no mira _hasFrontier');
  });

  ok(n + '· la v1 solo aparece para jubilarla', () => {
    const usos = s.split('\n')
      .map((t, i) => ({ n: i + 1, t: t.trim() }))
      .filter(l => l.t.includes('cruzando_frontier_nivel'))
      .filter(l => !/^localStorage\.removeItem\('cruzando_frontier_nivel'\);/.test(l.t))
      .filter(l => !l.t.startsWith('//') && !l.t.startsWith('*'));
    if (usos.length)
      throw new Error('la clave v1 sigue viva en: ' + usos.map(l => l.n).join(', '));
  });
});

ok('gemelos      · crecer e index comparten el bloque de la frontera', () => {
  const a = recortar('crecer.html'), b = recortar('index.html');
  if (a !== b) throw new Error('los gemelos se separaron: un arreglo en uno no llega al otro');
});

console.log('\n── El selector de niveles ──');

ok(MAPA.padEnd(12) + '· el candado del orbe mira la frontera', () => {
  const s = leer(MAPA);
  if (!/var frontierIdForPicker = window\.frontierNivelId \|\| cId;/.test(s))
    throw new Error('buildLevelPicker dejó de leer la frontera');
  if (!/var isUnlocked = idx <= cIdx;/.test(s))
    throw new Error('el candado ya no se decide por posición en el itinerario');
});

ok(MAPA.padEnd(12) + '· el selector abierto se repinta al llegar la frontera', () => {
  /* La FASE 2 puede resolver con el selector ya abierto, y él solo se
     construye al abrirse: sin esto se queda enseñando la frontera vieja. */
  const s = leer(MAPA);
  if (!/function repintarSelectorSiAbierto\(\)/.test(s))
    throw new Error('no existe repintarSelectorSiAbierto');
  if (!/window\.repintarSelectorSiAbierto = repintarSelectorSiAbierto;/.test(s))
    throw new Error('no se expone: el arranque vive en otro <script>');
  if (!/if \(window\.repintarSelectorSiAbierto\) window\.repintarSelectorSiAbierto\(\);/.test(s))
    throw new Error('nadie lo llama en la FASE 3');
  if (!/p\.classList\.contains\('open'\)\) buildLevelPicker\(\)/.test(s))
    throw new Error('debe repintar solo si está abierto: cerrado ya se construye al abrirse');
});

ok(MAPA.padEnd(12) + '· el nodo "Siguiente" conserva su salida de emergencia', () => {
  /* `DONE_COUNT >= 20` fue lo único que dejó avanzar al usuario mientras la
     frontera estaba rota. Vale la pena que siga ahí. */
  if (!/var _accessible {4}= _nextIdx2 <= _frontierIdx \|\| window\.DONE_COUNT >= 20;/.test(leer(MAPA)))
    throw new Error('el nodo Siguiente perdió su alternativa a la frontera');
});

console.log('');
console.log('== Una sola frontera para toda la app ==');

ok('niveles.js   . es la unica que sabe calcularla', () => {
  const m = leer('niveles.js');
  ['calcularFrontera', 'nivelCompleto', 'fronteraCacheada', 'CLAVE_FRONTERA']
    .forEach(k => { if (!m.includes(k)) throw new Error('niveles.js no expone ' + k); });
});

ok('hoy.html     . usa la compartida, no una copia', () => {
  /* Mi primera version se hizo su propio bucle, sin la clave versionada ni el
     catch que distingue un fallo de codigo de una caida de red. Si el free deja
     de entrar a crecer, esa seria la unica frontera que veria en su vida. */
  const h = leer('hoy.html');
  if (!h.includes('Niveles.calcularFrontera('))
    throw new Error('no usa la frontera de niveles.js');
  if (h.includes('var entero = '))
    throw new Error('volvio a escribirse su propio calculo de Nivel completo');
});

ok('plan-utils   . demoCompleto no crece hacia la frontera', () => {
  /* Es la tercera copia del predicado. Se conserva porque rezar.html la usa
     para saber si un Nivel esta cruzado, pero no debe pasar a calcular nada. */
  const u = leer('plan-utils.js');
  ['calcularFrontera', 'cruzando_frontier', 'NIVELES_ORDER']
    .forEach(k => { if (u.includes(k))
      throw new Error('plan-utils empezo a calcular la frontera: ' + k); });
});

console.log('\n' + '─'.repeat(64));
if (fallos) {
  console.log('  ✗ ' + fallos + ' fallo(s), ' + pasos + ' pasada(s)');
  console.log('─'.repeat(64) + '\n');
  process.exit(1);
}
console.log('  TODO VERDE — ' + pasos + ' pruebas');
console.log('─'.repeat(64) + '\n');

})();
