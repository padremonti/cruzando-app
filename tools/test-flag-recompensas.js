/* ══════════════════════════════════════════════════════════════════════
   Banco de pruebas — flag MOSTRAR_RECOMPENSAS (kit de recompensas en standby)

   Extrae los bloques REALES de crecer.html / world.js / utils.js y los corre
   en un vm con un DOM de mentira, con el flag apagado y encendido. Verifica
   que apagar oculta todo el kit y que encender lo devuelve intacto.

   Correr:  node tools/test-flag-recompensas.js
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const RAIZ    = path.join(__dirname, '..');
const leer    = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const CRECER  = leer('crecer.html');
const WORLDJS = leer('world.js');
const UTILS   = leer('utils.js');
const FLAGS   = leer('flags.js');

let fallos = 0, pasos = 0;
function ok(nombre, fn) {
  try { fn(); console.log('  ✓ ' + nombre); pasos++; }
  catch (e) { console.log('  ✗ ' + nombre + '\n      ' + e.message); fallos++; }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + '\n      esperado: ' + JSON.stringify(b) + '\n      recibido: ' + JSON.stringify(a));
}

/* ── DOM de mentira: lo mínimo que tocan los bloques extraídos ── */
function hacerDOM() {
  const creados = [];
  function nuevoEl(tag) {
    const el = {
      tagName: tag, className: '', innerHTML: '', style: { cssText: '', display: '' },
      onclick: null, hijos: [],
      appendChild(c) { this.hijos.push(c); return c; },
      setAttribute() {}, classList: { toggle() {}, add() {}, remove() {} }
    };
    creados.push(el);
    return el;
  }
  return {
    creados,
    document: {
      createElement: nuevoEl,
      createElementNS: (_ns, tag) => nuevoEl(tag),
      getElementById: () => null,
      querySelector: () => null,
      documentElement: { style: { propiedades: {}, setProperty(k, v) { this.propiedades[k] = v; } } }
    }
  };
}

/* ── Extraer el forEach del nodo de fin de bloque, tal cual vive en crecer.html ── */
function extraerRenderNodo() {
  const marca = "  pts.filter(function(p){ return p.type==='treasure'; }).forEach(function(p) {";
  const ini = CRECER.indexOf(marca);
  if (ini === -1) throw new Error('No encontré el forEach del nodo de fin de bloque en crecer.html');
  const cierre = '\n  });';
  const fin = CRECER.indexOf(cierre, ini);
  if (fin === -1) throw new Error('No encontré el cierre del forEach');
  return CRECER.slice(ini, fin + cierre.length);
}

/* ── Correr ese bloque con el flag en un estado dado ── */
function renderizarNodos(flagON) {
  const dom = hacerDOM();
  const canvas = { hijos: [], appendChild(c) { this.hijos.push(c); } };
  const ctx = vm.createContext({ window: {}, document: dom.document, console });
  vm.runInContext(FLAGS, ctx);
  ctx.window.MOSTRAR_RECOMPENSAS = flagON;
  Object.assign(ctx, {
    canvas,
    pts: [
      { type: 'misterio', x: 100, y: 10, bi: 0, mi: 0, globalIdx: 0 },
      { type: 'treasure', x: 187, y: 700,  bi: 0 },
      { type: 'treasure', x: 190, y: 1400, bi: 1 },
      { type: 'treasure', x: 185, y: 2100, bi: 2 }
    ],
    BLOQUES_MAP: [{}, {}, {}, {}],
    openTreasure: () => {}
  });
  ctx.window.chestState = ['closed', 'locked', 'locked', 'locked'];
  vm.runInContext('(function(){' + extraerRenderNodo() + '})()', ctx);
  return canvas.hijos;
}

console.log('\n── Nodo cada-5 Misterios (crecer.html) ──');

ok('flag OFF → los 3 nodos son separadores mudos, ningún cofre', () => {
  const n = renderizarNodos(false);
  eq(n.length, 3, 'deben pintarse los 3 nodos de fin de bloque');
  n.forEach((el, i) => {
    eq(el.className, 'tramo-node', 'nodo ' + i + ' debe ser separador');
    eq(el.innerHTML, '<div class="tramo-dot"></div>', 'nodo ' + i + ' sin cofre ni etiqueta');
    eq(el.onclick, null, 'nodo ' + i + ' no debe tener onclick');
  });
});

ok('flag OFF → ningún nodo menciona cofre, candado ni etiqueta', () => {
  const html = renderizarNodos(false).map(e => e.innerHTML).join('');
  ['🎁', '📦', '🔒', 'Abrir', 'Bloqueado', 'Abierto', 'treasure'].forEach(t => {
    if (html.includes(t)) throw new Error('se coló "' + t + '" con el flag apagado');
  });
});

ok('flag OFF → el render respeta la posición recibida (solo cambia la cara del nodo)', () => {
  const off = renderizarNodos(false), on = renderizarNodos(true);
  off.forEach((el, i) => eq(el.style.cssText, on[i].style.cssText, 'nodo ' + i + ' cambió de posición'));
});

ok('flag ON → vuelve el cofre con su estado correcto (reversibilidad)', () => {
  const n = renderizarNodos(true);
  eq(n.length, 3, 'mismos 3 nodos');
  eq(n[0].className, 'treasure-node', 'bloque completo → cofre clicable');
  if (!n[0].innerHTML.includes('🎁') || !n[0].innerHTML.includes('¡Abrir!')) {
    throw new Error('el cofre "closed" no volvió como 🎁 ¡Abrir!');
  }
  if (typeof n[0].onclick !== 'function') throw new Error('el cofre debe recuperar su onclick');
  eq(n[1].className, 'treasure-node locked', 'bloque incompleto → cofre bloqueado');
  eq(n[1].onclick, null, 'un cofre locked no se toca');
});

console.log('\n── Reparto del tramo entre bloques (opción A) ──');

/* Corre computeAllPositions de verdad, con el flag en un estado dado. */
function posiciones(flagON) {
  const ini = CRECER.indexOf('function computeAllPositions(cuaderno) {');
  if (ini === -1) throw new Error('no encontré computeAllPositions en crecer.html');
  const fuente = CRECER.slice(ini, CRECER.indexOf('\n}', ini) + 2);

  const consts = ['MAP_W', 'MAP_CX', 'MAP_AMP', 'MAP_NODE_H', 'MAP_BLOCK_GAP', 'MAP_TOP',
                  'MAP_STEP', 'MAP_TRAMO_F', 'MAP_PATER_F'];
  const decls = consts.map(n => {
    const m = CRECER.match(new RegExp('^var ' + n + '\\s*=.*$', 'm'));
    if (!m) throw new Error('no encontré la constante ' + n + ' en crecer.html');
    return m[0];
  }).join('\n');

  const ctx = vm.createContext({ window: {}, console, Math });
  vm.runInContext(FLAGS, ctx);
  ctx.window.MOSTRAR_RECOMPENSAS = flagON;
  ctx.BLOQUES_MAP = [0, 1, 2, 3].map(() => ({ misterios: [0, 0, 0, 0, 0], color: '#000' }));
  vm.runInContext(decls + '\n' + fuente + '\nvar RES = computeAllPositions(1);', ctx);
  return ctx.RES;
}

/* Altos visuales reales de cada pieza (CSS de crecer.html), para medir los vacíos. */
const ALTO = { misterio: 124, pater: 18, cofre: 120, separador: 32 };

function vacios(res, altoNodo) {
  const p   = res.pts;
  const q5  = p.find(x => x.type === 'misterio' && x.bi === 0 && x.mi === 4);
  const tra = p.find(x => x.type === 'treasure' && x.bi === 0);
  const pat = p.filter(x => x.type === 'pater')[0];
  const sig = p.find(x => x.type === 'misterio' && x.bi === 1 && x.mi === 0);
  return [
    Math.round((tra.y - altoNodo / 2)      - (q5.y  + ALTO.misterio / 2)),
    Math.round((pat.y - ALTO.pater / 2)    - (tra.y + altoNodo / 2)),
    Math.round((sig.y - ALTO.misterio / 2) - (pat.y + ALTO.pater / 2))
  ];
}

ok('flag OFF → el tramo se reparte en tres vacíos parejos', () => {
  const v = vacios(posiciones(false), ALTO.separador);
  const dif = Math.max.apply(null, v) - Math.min.apply(null, v);
  if (dif > 2) throw new Error('vacíos desparejos: ' + v.join(' / ') + ' px (diferencia ' + dif + ')');
  if (v[0] > 90) throw new Error('sigue habiendo demasiado aire tras la última esfera: ' + v[0] + ' px');
  v.forEach(x => { if (x < 20) throw new Error('un vacío quedó demasiado apretado: ' + v.join(' / ')); });
});

ok('flag OFF → el vacío grande se redujo respecto al reparto del cofre', () => {
  const antes = 145;   // 0.35 con un nodo de 32px: lo que se vio en dispositivo
  const ahora = vacios(posiciones(false), ALTO.separador)[0];
  if (ahora >= antes) throw new Error('no mejoró: ' + ahora + ' px (antes ' + antes + ')');
});

ok('flag ON → vuelve el reparto de siempre (0.35 / 0.65)', () => {
  const p   = posiciones(true).pts;
  const tra = p.find(x => x.type === 'treasure' && x.bi === 0);
  const pat = p.filter(x => x.type === 'pater')[0];
  const q5  = p.find(x => x.type === 'misterio' && x.bi === 0 && x.mi === 4);
  const base = q5.y + 132;
  eq(Math.round(tra.y - base), Math.round(260 * 0.35), 'el cofre debe volver a 0.35 del tramo');
  eq(Math.round(pat.y - base), Math.round(260 * 0.65), 'el pater debe volver a 0.65 del tramo');
});

ok('flag ON → el cofre sigue sin encimarse con la esfera ni con el pater', () => {
  const v = vacios(posiciones(true), ALTO.cofre);
  v.forEach((x, i) => { if (x < 0) throw new Error('choque en el hueco ' + (i + 1) + ': ' + v.join(' / ')); });
});

ok('el reparto NO mueve ningún Misterio ni cambia el alto del mapa', () => {
  const off = posiciones(false), on = posiciones(true);
  eq(off.totalH, on.totalH, 'totalH cambió → se movería el bioma y el canvas');
  const m = r => r.pts.filter(p => p.type === 'misterio').map(p => p.x + ',' + p.y).join(' ');
  eq(m(off), m(on), 'se movió alguna esfera de Misterio');
});

ok('el separador y el pater conservan su x (el sendero no se tuerce)', () => {
  const off = posiciones(false), on = posiciones(true);
  const xs = r => r.pts.filter(p => p.type !== 'misterio').map(p => p.x.toFixed(4)).join(' ');
  eq(xs(off), xs(on), 'cambió alguna x: la opción A solo reparte en vertical');
});

console.log('\n── Puerta única (flags.js) ──');

ok('página que NO carga flags.js → oculto por defecto (falla del lado seguro)', () => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext('var r = (window.recompensasON && window.recompensasON());', ctx);
  eq(!!ctx.r, false, 'sin flags.js el kit debe quedar oculto, no visible');
});

ok('valores raros no encienden el kit (solo true exacto)', () => {
  [1, 'true', 'si', {}, [], 'false', null, undefined, 0].forEach(v => {
    const ctx = vm.createContext({ window: {}, console });
    vm.runInContext(FLAGS, ctx);
    ctx.window.MOSTRAR_RECOMPENSAS = v;
    eq(ctx.window.recompensasON(), false, 'MOSTRAR_RECOMPENSAS=' + JSON.stringify(v) + ' no debe encender');
  });
  const ctx = vm.createContext({ window: {}, console });
  vm.runInContext(FLAGS, ctx);
  ctx.window.MOSTRAR_RECOMPENSAS = true;
  eq(ctx.window.recompensasON(), true, 'true sí debe encender');
});

ok('flags.js se entrega APAGADO', () => {
  const ctx = vm.createContext({ window: {}, console });
  vm.runInContext(FLAGS, ctx);
  eq(ctx.window.MOSTRAR_RECOMPENSAS, false, 'el MVP sale con el kit en standby');
});

console.log('\n── Skins (utils.js) ──');

function correrSkin(flagON) {
  const dom = hacerDOM();
  const ctx = vm.createContext({
    window: {}, console, document: dom.document,
    localStorage: { getItem: k => (k === 'activeSkin' ? 'skin_noche_oscura' : null), setItem() {} }
  });
  vm.runInContext(FLAGS, ctx);
  ctx.window.MOSTRAR_RECOMPENSAS = flagON;
  ctx.window.resolvePlan = () => 'free';
  vm.runInContext(UTILS, ctx);
  return dom.document.documentElement.style.propiedades;
}

ok('flag OFF → una skin guardada NO se aplica (sin tema fantasma)', () => {
  eq(Object.keys(correrSkin(false)).length, 0, 'no debe tocar ninguna variable CSS');
});

ok('flag ON → la skin guardada vuelve a aplicarse (nada se perdió)', () => {
  const p = correrSkin(true);
  eq(p['--bg'], '#0A0610', 'la skin debe volver tal cual');
  eq(p['--orange'], '#9B59B6');
});

console.log('\n── Mapa de mundos (world.js) ──');

ok('flag OFF → no se pinta el cofre por cuaderno completado', () => {
  const linea = WORLDJS.split('\n').find(l => l.includes('const cofreHtml'));
  if (!linea) throw new Error('no encontré cofreHtml en world.js');
  if (!linea.includes('window.recompensasON()')) {
    throw new Error('el cofre por cuaderno no está bajo el flag: ' + linea.trim());
  }
});

ok('trampa cerrada: un cuaderno completado se puede reabrir sin cofre', () => {
  const ini = WORLDJS.indexOf('window.tapNodo = function');
  const cuerpo = WORLDJS.slice(ini, WORLDJS.indexOf('\n  };', ini));
  if (!cuerpo.includes("estado === 'completado'")) {
    throw new Error('tapNodo sigue sin manejar el estado completado → nodo muerto');
  }
  if (cuerpo.includes('el cofre maneja el tap')) {
    throw new Error('quedó el comentario viejo que delegaba el tap al cofre');
  }
  const ctx = vm.createContext({ window: {}, location: { href: '' }, console });
  ctx.getEstadoNodo = id => id;
  ctx.sacudirNodo   = () => { ctx.sacudido = true; };
  vm.runInContext(cuerpo + '\n  };', ctx);
  const ir = estado => { ctx.location.href = ''; ctx.window.tapNodo(estado, 1); return ctx.location.href; };
  eq(ir('completado'),  'orar.html?c=completado',  'completado debe reabrir el cuaderno');
  eq(ir('disponible'),  'orar.html?c=disponible',  'disponible sigue entrando');
  eq(ir('en_progreso'), 'orar.html?c=en_progreso', 'en_progreso sigue entrando');
  eq(ir('bloqueado'),   '',                        'bloqueado NO debe navegar');
  eq(ctx.sacudido, true, 'bloqueado debe sacudir el nodo');
});

console.log('\n── Guardas cableadas en cada página ──');

const GUARDAS = [
  ['crecer.html', 'openTreasure sale temprano',        /function openTreasure\([^)]*\) \{\s*\n\s*if \(!window\.recompensasON\(\)\) return;/],
  ['crecer.html', 'no se piden esferas de recompensa', /user\.uid && window\.recompensasON\(\)\)\s*\{\s*\n\s*verificarRecompensas/],
  ['crecer.html', 'boton Extras del drawer oculto',    /drawer-extras-btn'\); if \(b\) b\.style\.display = 'none'/],
  ['index.html',  'boton Extras del drawer oculto',    /drawer-extras-btn'\); if \(b\) b\.style\.display = 'none'/],
  ['crecer.html', 'goToExtras bloqueado',              /function goToExtras\(\) \{\s*\n\s*if \(!window\.recompensasON\(\)\) return;/],
  ['index.html',  'goToExtras bloqueado',              /function goToExtras\(\) \{\s*\n\s*if \(!window\.recompensasON\(\)\) return;/],
  ['extras.html', 'velo contra la URL directa',        /if \(window\.recompensasON\(\)\) return;[\s\S]{0,400}location\.replace/],
  ['cantos.html', 'filtro Extras oculto',              /filter-extras'\); if \(f\) f\.style\.display = 'none'/],
  ['audio.html',  'toast de medalla callado',          /if \(window\.recompensasON\(\)\) setTimeout\(\(\) => showToast\('🏅/],
  ['orar.html',   'toast de medalla callado',          /if\(window\.recompensasON\(\)\)setTimeout\(\(\)=>showSlide\(0,'🏅/],
  ['utils.js',    'skin fantasma evitada',             /if \(!\(window\.recompensasON && window\.recompensasON\(\)\)\) return;/],
  ['world.js',    'cofre por cuaderno bajo el flag',   /esCompletado && window\.recompensasON\(\)/]
];
GUARDAS.forEach(([archivo, nombre, re]) => {
  ok(archivo.padEnd(12) + ' · ' + nombre, () => {
    if (!re.test(leer(archivo))) throw new Error('guarda ausente o alterada');
  });
});

console.log('\n── flags.js cargado donde hace falta ──');

['index.html', 'crecer.html', 'extras.html', 'cantos.html', 'world.html',
 'audio.html', 'orar.html', 'rezar.html', 'diario.html'].forEach(f => {
  ok(f.padEnd(12) + ' · carga flags.js antes de usarlo', () => {
    const s = leer(f);
    const iFlag = s.indexOf('<script src="flags.js"></script>');
    if (iFlag === -1) throw new Error('no carga flags.js');
    const iUso = s.indexOf('recompensasON');
    if (iUso !== -1 && iUso < iFlag) throw new Error('usa recompensasON ANTES de cargar flags.js');
    const iUtils = s.indexOf('<script src="utils.js"></script>');
    if (iUtils !== -1 && iUtils < iFlag) throw new Error('carga utils.js antes que flags.js (skin fantasma)');
  });
});

console.log('\n── Lo que NO se debe haber tocado ──');

ok('la unica resta de metros sigue viviendo solo en la tienda', () => {
  const paginas = fs.readdirSync(RAIZ)
    .filter(f => /\.(html|js)$/.test(f))
    .filter(f => !/^(indexv2|cruzando-demo)/.test(f) && !/_backup|\.bak$/.test(f));
  const restas = [];
  paginas.forEach(f => {
    leer(f).split('\n').forEach((l, i) => {
      if (/totalMeters\s*:\s*[^,}]*-\s/.test(l)) restas.push(f + ':' + (i + 1));
    });
  });
  if (restas.length !== 1 || !restas[0].startsWith('extras.html:')) {
    throw new Error('la resta de metros ya no es unica ni exclusiva de la tienda: ' + restas.join(', '));
  }
});

ok('computeAllPositions / DONE_COUNT / drawMapPath intactos', () => {
  [/var MAP_BLOCK_GAP = 260;/, /pts\.push\(\{ type:'treasure'/, /window\.DONE_COUNT = totalDone;/,
   /drawMapPath\(svg, mPts\);/, /return done === 5 \? 'closed' : 'locked';/].forEach(re => {
    if (!re.test(CRECER)) throw new Error('cambio algo de layout/progreso: ' + re);
  });
});

ok('canjearCodigo (codigos beta) no fue tocado', () => {
  const f = leer('functions/index.js');
  if (f.includes('recompensasON') || f.includes('MOSTRAR_RECOMPENSAS')) {
    throw new Error('el flag se metio en las functions; canjearCodigo es beta, no la tienda');
  }
});

console.log('\n' + (fallos ? '✗ ' + fallos + ' fallo(s), ' : '✓ ') + pasos + ' prueba(s) pasadas\n');
process.exit(fallos ? 1 : 0);
