/* ══════════════════════════════════════════════════════════════════════
   Banco de pruebas — el cierre de una sesión (cierre.js)

   Una animación no se prueba mirándola, pero casi todo lo que puede salir mal
   en ella sí se prueba: que las once cuentas de la columna encuentren sus once
   destinos, que degrade sin bloquear cuando falta algo, que se limpie sola, y
   —lo más importante— que NUNCA impida al usuario terminar la sesión.

   Correr:  node tools/test-cierre.js
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let fallos = 0, pasos = 0;
function bien(n) { console.log('  ✓ ' + n); pasos++; }
function mal(n, e) { console.log('  ✗ ' + n + '\n      ' + (e && e.message || e)); fallos++; }
function ok(nombre, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function')
      return r.then(() => bien(nombre), e => mal(nombre, e));
    bien(nombre);
  } catch (e) { mal(nombre, e); }
}
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error((msg || '') + '\n      esperado: ' + B + '\n      recibido: ' + A);
}

/* ── DOM de mentira ──────────────────────────────────────────────────── */
function hacerDOM() {
  const porId = {};
  function nuevoEl(tag) {
    const el = {
      tagName: tag, id: '', textContent: '', hijos: [], padre: null, attrs: {}, oyentes: {},
      style: {
        _p: {}, animation: '', strokeDasharray: '',
        setProperty(k, v) { this._p[k] = v; }, getPropertyValue(k) { return this._p[k]; }
      },
      classList: {
        _s: new Set(),
        add()    { [].forEach.call(arguments, c => this._s.add(c)); },
        remove() { [].forEach.call(arguments, c => this._s.delete(c)); },
        contains(c) { return this._s.has(c); }
      },
      setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.classList.add(...String(v).split(' ')); },
      /* cierre.js asigna .className directamente; sin este puente, classList se
         quedaba vacía y el banco no encontraba el velo. */
      set className(v) { String(v).split(' ').filter(Boolean).forEach(c => this.classList.add(c)); },
      get className() { return [...this.classList._s].join(' '); },
      getAttribute(k) { return this.attrs[k]; },
      addEventListener(ev, fn) { (this.oyentes[ev] = this.oyentes[ev] || []).push(fn); },
      appendChild(c) { c.padre = this; this.hijos.push(c); if (c.id) porId[c.id] = c; return c; },
      removeChild(c) { this.hijos = this.hijos.filter(h => h !== c); c.padre = null; if (c.id) delete porId[c.id]; },
      get parentNode() { return this.padre; },
      // todos los descendientes, en profundidad
      get todos() {
        return this.hijos.reduce((a, h) => a.concat([h], h.todos), []);
      }
    };
    return el;
  }
  const head = nuevoEl('head'), body = nuevoEl('body');
  return {
    head, body, porId,
    document: {
      head, body,
      createElement: nuevoEl,
      createElementNS: (_ns, tag) => nuevoEl(tag),
      getElementById: id => porId[id] || null
    }
  };
}

function montar(vw, vh) {
  const d = hacerDOM();
  const ctx = {
    document: d.document,
    innerWidth: vw || 390, innerHeight: vh || 844,
    Promise, setTimeout, clearTimeout, console, Math, Number, isFinite,
    requestAnimationFrame: fn => setTimeout(fn, 0)
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(leer('sarta.js'), ctx);
  vm.runInContext(leer('cierre.js'), ctx);
  return { ctx, dom: d, C: ctx.window.Cierre, S: ctx.window.Sarta };
}

/* Una foto creíble de la columna: 11 cuentas en vertical a la derecha, más la
   Lux debajo — que es exactamente lo que devuelve Cuentas.instantanea(). */
function fotoColumna(vw, vh) {
  vw = vw || 390; vh = vh || 844;
  const x = vw - 32, y0 = vh * 0.30, paso = 23;
  const cuentas = [];
  for (let i = 0; i <= 10; i++) {
    const r = i === 0 ? 6 : 8;
    cuentas.push({
      idx: i, tipo: i === 0 ? 'pater' : 'ave', estado: 'rezada',
      rect: { left: x - r, top: y0 + i * paso - r, width: r * 2, height: r * 2 }
    });
  }
  return {
    cuentas,
    lux: { visible: true, rect: { left: x - 11, top: y0 + 11 * paso, width: 22, height: 22 } },
    rect: { left: x - 12, top: y0, width: 24, height: 11 * paso }
  };
}

const velo = dom => dom.body.hijos.find(h => h.classList.contains('cierre-velo'));
/* Cerrar por la vía REAL del usuario —el toque— en vez de esperar los ~4 s de
   reposo. Con veinte pruebas montando animaciones, esperarlas enteras llevaba
   el banco a más de dos minutos. */
async function saltar(dom, p) {
  const v = velo(dom);
  if (v && v.oyentes.click) v.oyentes.click.forEach(fn => fn());
  return p;
}
const circulos = v => v.todos.filter(e => e.tagName === 'circle');
const rects    = v => v.todos.filter(e => e.tagName === 'rect');

/* De aquí al final, dentro de una IIFE asíncrona: las pruebas que montan el
   velo usan temporizadores reales y hay que ESPERARLAS, o el recuento saldría
   antes de que terminen y correrían todas encimadas. */
(async function () {

console.log('\n── La API ──');

await ok('expone lo que audio.html necesita', () => {
  const { C } = montar();
  ['decenario', 'enCurso'].forEach(k => {
    if (typeof C[k] !== 'function') throw new Error('falta ' + k);
  });
});

await ok('los tiempos suman lo previsto: 2,5 s de núcleo', () => {
  const { C } = montar();
  eq(C._T.nucleo, 2500);
  if (C._T.nucleo + C._T.reposo + C._T.salida > 4500)
    throw new Error('el cierre completo tardaría demasiado en soltar la navegación');
});

console.log('\n── Once cuentas contra once ──');

await ok('monta las 11 cuentas del decenario y las 2 barras de la Cruz', async () => {
  const { C, dom } = montar();
  const p = C.decenario({ desde: fotoColumna(), color: '#E8A0A0', metros: 1350 });
  await new Promise(r => setTimeout(r, 30));
  const v = velo(dom);
  if (!v) throw new Error('no montó el velo');
  /* 11 del decenario + el halo que recorre el anillo */
  eq(circulos(v).length, 12);
  eq(rects(v).length, 2);
  await saltar(dom, p);
});

await ok('cada cuenta recibe su propia trayectoria', async () => {
  const { C, dom } = montar();
  const p = C.decenario({ desde: fotoColumna() });
  await new Promise(r => setTimeout(r, 30));
  const v = velo(dom);
  const conAnim = circulos(v).filter(c => /^ci-c\d+ /.test(c.style.animation));
  eq(conAnim.length, 11, 'las 11 cuentas deberían llevar animación propia');
  const hoja = dom.porId['cierre-trayectorias'];
  if (!hoja) throw new Error('no inyectó las trayectorias');
  const kf = (hoja.textContent.match(/@keyframes ci-c\d+/g) || []).length;
  eq(kf, 11, '@keyframes generados');
  await saltar(dom, p);
});

await ok('el escalonado va de 30 ms y arranca tras el velo', async () => {
  const { C, dom } = montar();
  const p = C.decenario({ desde: fotoColumna() });
  await new Promise(r => setTimeout(r, 30));
  const v = velo(dom);
  const retardos = circulos(v)
    .map(c => (c.style.animation.match(/([\d.]+)s both$/) || [])[1])
    .filter(Boolean).map(Number);
  eq(retardos.length, 11);
  eq(+(retardos[0]).toFixed(2), 0.55, 'la primera cuenta');
  const paso = +(retardos[1] - retardos[0]).toFixed(3);
  if (Math.abs(paso - 0.03) > 0.001) throw new Error('escalonado de ' + paso + 's, se esperaba 0,03');
  /* La última no puede arrancar tan tarde que no termine dentro del núcleo. */
  if ((retardos[10] + 0.9) * 1000 > C._T.nucleo)
    throw new Error('la última cuenta no llega a su sitio antes del reposo');
  await saltar(dom, p);
});

await ok('la trayectoria arranca donde estaba la cuenta de verdad', async () => {
  /* De aquí sale que el primer frame sea idéntico al último de la sesión. */
  const { C, dom } = montar(390, 844);
  const foto = fotoColumna(390, 844);
  const p = C.decenario({ desde: foto });
  await new Promise(r => setTimeout(r, 30));
  const hoja = dom.porId['cierre-trayectorias'];
  const v = velo(dom);
  const c0 = circulos(v)[0];
  const m = hoja.textContent.match(/@keyframes ci-c0\{0%\{transform:translate\((-?[\d.]+)px,(-?[\d.]+)px\)/);
  if (!m) throw new Error('no encontré el 0% de la primera cuenta');
  const destX = parseFloat(c0.getAttribute('cx')), destY = parseFloat(c0.getAttribute('cy'));
  const r0 = foto.cuentas[0].rect;
  const origX = r0.left + r0.width / 2, origY = r0.top + r0.height / 2;
  if (Math.abs(destX + parseFloat(m[1]) - origX) > 0.6) throw new Error('el origen en x no coincide con la columna');
  if (Math.abs(destY + parseFloat(m[2]) - origY) > 0.6) throw new Error('el origen en y no coincide con la columna');
  await saltar(dom, p);
});

await ok('el decenario cabe en la pantalla, con sitio para la palabra', async () => {
  const { C, dom } = montar(390, 844);
  const p = C.decenario({ desde: fotoColumna(390, 844) });
  await new Promise(r => setTimeout(r, 30));
  const v = velo(dom);
  const cs = circulos(v).slice(0, 11);
  const xs = cs.map(c => parseFloat(c.getAttribute('cx'))), ys = cs.map(c => parseFloat(c.getAttribute('cy')));
  if (Math.min(...xs) < 0 || Math.max(...xs) > 390) throw new Error('el aro se sale de ancho');
  const abajo = rects(v).reduce((m, r) => Math.max(m, parseFloat(r.getAttribute('y')) + parseFloat(r.getAttribute('height'))), 0);
  if (abajo > 844 * 0.80)
    throw new Error('la Cruz baja hasta ' + abajo.toFixed(0) + ': pisaría la palabra');
  await saltar(dom, p);
});

console.log('\n── Lo que dice ──');

await ok('muestra la palabra y los metros', async () => {
  const { C, dom } = montar();
  const p = C.decenario({ desde: fotoColumna(), titulo: 'Misterio recorrido', metros: 1350 });
  await new Promise(r => setTimeout(r, 30));
  const v = velo(dom);
  const textos = v.todos.filter(e => e.classList.contains('cierre-titulo') || e.classList.contains('cierre-metros'));
  eq(textos.length, 2);
  eq(textos[0].textContent, 'Misterio recorrido');
  if (!/1[.,]350/.test(textos[1].textContent)) throw new Error('los metros no salen formateados: ' + textos[1].textContent);
  await saltar(dom, p);
});

await ok('sin metros no monta la línea', async () => {
  const { C, dom } = montar();
  const p = C.decenario({ desde: fotoColumna(), metros: 0 });
  await new Promise(r => setTimeout(r, 30));
  const v = velo(dom);
  eq(v.todos.filter(e => e.classList.contains('cierre-metros')).length, 0);
  await saltar(dom, p);
});

console.log('\n── Nunca impide terminar la sesión ──');

await ok('sin Sarta resuelve al instante y no monta nada', async () => {
  const { C, dom, ctx } = montar();
  ctx.Sarta = undefined; ctx.window.Sarta = undefined;
  eq(await C.decenario({ desde: fotoColumna() }), false);
  eq(dom.body.hijos.length, 0);
});

await ok('sin foto de la columna, no finge: no anima', async () => {
  const { C, dom } = montar();
  const p = C.decenario({});
  await new Promise(r => setTimeout(r, 30));
  const v = velo(dom);
  if (circulos(v).some(c => c.style.animation))
    throw new Error('debería aparecer ya formado, no venir de ninguna parte');
  await saltar(dom, p);
});

await ok('con una columna incompleta tampoco anima', async () => {
  const { C, dom } = montar();
  const foto = fotoColumna();
  foto.cuentas = foto.cuentas.slice(0, 7);     // decena a medias
  const p = C.decenario({ desde: foto });
  await new Promise(r => setTimeout(r, 30));
  if (circulos(velo(dom)).some(c => c.style.animation))
    throw new Error('con 7 cuentas no puede haber correspondencia con 11');
  await saltar(dom, p);
});

await ok('con rectángulos corruptos degrada en vez de romperse', async () => {
  const { C, dom } = montar();
  const foto = fotoColumna();
  foto.cuentas[4].rect = { left: NaN, top: NaN, width: 0, height: 0 };
  const p = C.decenario({ desde: foto });
  await new Promise(r => setTimeout(r, 30));
  if (circulos(velo(dom)).some(c => /NaN/.test(c.style.animation)))
    throw new Error('se coló un NaN en la animación');
  await saltar(dom, p);
});

await ok('siempre se retira sola y deja el DOM limpio', async () => {
  const { C, dom } = montar();
  await C.decenario({ desde: fotoColumna(), metros: 200 });
  eq(dom.body.hijos.length, 0, 'quedó el velo colgando');
  if (dom.porId['cierre-trayectorias']) throw new Error('quedó la hoja de trayectorias');
  eq(C.enCurso(), false);
});

await ok('un toque salta al decenario formado y cierra pronto', async () => {
  const { C, dom } = montar();
  const p = C.decenario({ desde: fotoColumna() });
  await new Promise(r => setTimeout(r, 30));
  const v = velo(dom);
  v.oyentes.click.forEach(fn => fn());
  if (!v.classList.contains('quieto')) throw new Error('no saltó al estado final');
  if (v.classList.contains('anima')) throw new Error('siguió animando tras el toque');
  const t0 = Date.now();
  await p;
  if (Date.now() - t0 > 1500) throw new Error('tardó demasiado en soltar tras el toque');
});

await ok('dos llamadas a la vez no montan dos velos', async () => {
  const { C, dom } = montar();
  const p1 = C.decenario({ desde: fotoColumna() });
  eq(await C.decenario({ desde: fotoColumna() }), false, 'la segunda debería rebotar');
  await new Promise(r => setTimeout(r, 20));
  eq(dom.body.hijos.length, 1);
  await saltar(dom, p1);
});

console.log('\n── Los cuatro modos lo cierran ──');

const MODOS = ['audio.html', 'mini.html', 'rezar.html', 'orar.html'];

for (const f of MODOS) {
  await ok(f.padEnd(11) + ' · carga los módulos y define mostrarDecenario', () => {
    const s = leer(f);
    ['cierre.css', 'sarta.js', 'cuentas.js', 'cierre.js'].forEach(m => {
      if (!s.includes('"' + m + '"')) throw new Error('no carga ' + m);
    });
    if (!/function mostrarDecenario/.test(s)) throw new Error('no define mostrarDecenario');
  });
}

for (const f of MODOS) {
  await ok(f.padEnd(11) + ' · exige que la decena se rezara entera', () => {
    const s = leer(f);
    const cuerpo = (s.match(/function mostrarDecenario[\s\S]*?\n\}/) || [''])[0];
    if (!/Cierre\.decenaCompleta\(foto\)/.test(cuerpo))
      throw new Error('sin la guarda, cerraría una columna a medias');
    if (!/return Promise\.resolve\(false\)/.test(cuerpo))
      throw new Error('sin salida temprana podría bloquear');
    if (!/catch/.test(cuerpo)) throw new Error('sin catch, un fallo del módulo lo colgaría');
  });
}

await ok('mini y rezar leen la columna sin gobernarla', () => {
  /* Los dos conservan su motor: mini el suyo (aro pequeño, oro) y rezar el
     interactivo. La instancia de Cuentas existe solo para instantanea(). */
  const mini = leer('mini.html');
  if (!/Cuentas\.crear\({col:'beadsCol', luxId:'bead-lux'}\)/.test(mini))
    throw new Error('mini no apunta a su propia columna');
  if (!/function renderBeadsCol/.test(mini)) throw new Error('mini perdió su motor');
  if (!/function renderBeadsCol/.test(leer('rezar.html'))) throw new Error('rezar perdió su motor interactivo');
});

await ok('mini y rezar no esperan: la siguiente pista ya suena', () => {
  /* Decisión de producto: sin tiempo muerto entre lo que se rezó y lo que
     sigue. En mini arranca al acabar el Gloria, con la Oración final debajo. */
  const mini = leer('mini.html');
  if (!/\n  if\(stepIdx>=0 && STEPS\[stepIdx\] && STEPS\[stepIdx\]\.beads && !STEPS\[i\]\.beads\) mostrarDecenario\(\);/.test(mini))
    throw new Error('mini no lo dispara al salir del rezo');
  if (/await mostrarDecenario/.test(mini)) throw new Error('mini no debería esperarlo');
  if (/await mostrarDecenario/.test(leer('rezar.html'))) throw new Error('rezar no debería esperarlo');
});

await ok('orar SÍ espera: nada suena y el usuario pulsó para avanzar', () => {
  const s = leer('orar.html');
  if (!/await mostrarDecenario\(\);/.test(s))
    throw new Error('orar debería cerrar antes de cargar el siguiente Misterio');
  if (!/await markMysteryComplete\(blk,bIdx\);\s*\/\*/.test(s.replace(/\r/g,'')))
    throw new Error('debería ir tras marcar el Misterio completado');
});

await ok('la guarda de decena completa mira la Cruz', () => {
  const { C } = montar();
  const foto = fotoColumna();
  eq(C.decenaCompleta(foto), true);
  eq(C.decenaCompleta(Object.assign({}, foto, { lux: { visible: false } })), false, 'decena a medias');
  eq(C.decenaCompleta(Object.assign({}, foto, { cuentas: foto.cuentas.slice(0, 8) })), false, 'columna corta');
  eq(C.decenaCompleta(null), false);
  eq(C.decenaCompleta({}), false);
});

await ok('una columna escondida no anima: ahí salían las cuentas de (0,0)', () => {
  /* Una columna con display:none devuelve rects en cero. La Cruz heredada del
     Misterio anterior dejaba pasar la guarda mientras la geometría ya no
     existía, y las once cuentas partían de la esquina superior izquierda.
     Ante la duda NO se anima: animar mal es peor que no animar. */
  const { C } = montar();
  const foto = fotoColumna();
  foto.rect = { left: 0, top: 0, width: 0, height: 0 };
  foto.cuentas.forEach(c => { c.rect = { left: 0, top: 0, width: 0, height: 0 }; });
  if (C.decenaCompleta(foto))
    throw new Error('da por buena una columna sin sitio en pantalla');
});

await ok('once cuentas en el mismo punto tampoco son una columna', () => {
  const { C } = montar();
  const foto = fotoColumna();
  const p = { left: 100, top: 200, width: 16, height: 16 };
  foto.cuentas.forEach(c => { c.rect = { left: p.left, top: p.top, width: 16, height: 16 }; });
  if (C.decenaCompleta(foto))
    throw new Error('once cuentas apiladas no describen un decenario');
});

await ok('la columna de verdad sigue pasando la guarda', () => {
  /* La red de seguridad no puede morder al caso legítimo. */
  const { C } = montar();
  if (!C.decenaCompleta(fotoColumna()))
    throw new Error('la guarda se comió el caso bueno');
});


console.log('\n── El Rosario ──');

const CON_ROSARIO = ['audio.html', 'orar.html', 'rezar.html'];

await ok('monta las 60 cuentas y las 2 barras', async () => {
  const { C, dom } = montar();
  const p = C.rosario({ color: '#C0392B', metros: 1000 });
  await new Promise(r => setTimeout(r, 30));
  const v = velo(dom);
  if (!v) throw new Error('no montó el velo');
  eq(circulos(v).length, 61, '60 cuentas + el halo');
  eq(rects(v).length, 2);
  await saltar(dom, p);
});

await ok('cada cuenta del lazo trae su trayectoria; la cola y la Cruz comparten', async () => {
  const { C, dom } = montar();
  const p = C.rosario({});
  await new Promise(r => setTimeout(r, 30));
  const hoja = dom.porId['cierre-trayectorias'];
  eq((hoja.textContent.match(/@keyframes ci-r\d+\{/g) || []).length, 55, 'una por cuenta del lazo');
  ['ci-rp', 'ci-rc', 'ci-rx'].forEach(k => {
    if (!hoja.textContent.includes('@keyframes ' + k + '{'))
      throw new Error('falta ' + k);
  });
  await saltar(dom, p);
});

await ok('las cinco decenas entran de una en una', async () => {
  /* 90 ms entre decenas —como se rezaron— y 12 ms dentro de cada una. */
  const { C, dom } = montar();
  const p = C.rosario({});
  await new Promise(r => setTimeout(r, 30));
  const v = velo(dom);
  const ret = circulos(v).slice(0, 55)
    .map(c => Number((c.style.animation.match(/([\d.]+)s both/) || [])[1]));
  eq(+(ret[0]).toFixed(3), 0.05, 'la primera');
  const dentro = +(ret[1] - ret[0]).toFixed(3);
  if (Math.abs(dentro - 0.012) > 0.001) throw new Error('dentro de la decena: ' + dentro + 's');
  const entre = +(ret[11] - ret[0]).toFixed(3);
  if (Math.abs(entre - 0.09) > 0.001) throw new Error('entre decenas: ' + entre + 's');
  await saltar(dom, p);
});

await ok('los cinco Padrenuestros destellan, y solo ellos', async () => {
  const { C, dom } = montar();
  const p = C.rosario({});
  await new Promise(r => setTimeout(r, 30));
  const v = velo(dom);
  const conDestello = circulos(v).filter(c => /ci-rp /.test(c.style.animation));
  eq(conDestello.length, 5, 'uno por juntura de decena');
  await saltar(dom, p);
});

await ok('la Cruz llega la última: dispara el resplandor', async () => {
  const { C, dom } = montar();
  const p = C.rosario({});
  await new Promise(r => setTimeout(r, 30));
  const v = velo(dom);
  const cruz = rects(v)[0];
  const tCruz = Number((cruz.style.animation.match(/([\d.]+)s both/) || [])[1]);
  const cola = circulos(v).slice(55, 60)
    .map(c => Number((c.style.animation.match(/([\d.]+)s both/) || [])[1]));
  if (!(tCruz > Math.max(...cola))) throw new Error('la Cruz no llega después de la cola');
  if ((tCruz + 0.6) * 1000 > C._T.rosario) throw new Error('la Cruz no encaja antes del reposo');
  await saltar(dom, p);
});

await ok('la Cruz sube desde debajo del encuadre', async () => {
  const { C, dom } = montar(390, 844);
  const p = C.rosario({});
  await new Promise(r => setTimeout(r, 30));
  const hoja = dom.porId['cierre-trayectorias'];
  const m = hoja.textContent.match(/@keyframes ci-rx\{0%\{transform:translateY\((\d+)px\)/);
  if (!m) throw new Error('no encontré el 0% de la Cruz');
  const cruz = rects(velo(dom))[0];
  const yFinal = parseFloat(cruz.getAttribute('y'));
  if (yFinal + Number(m[1]) < 844) throw new Error('no arranca fuera del encuadre');
  await saltar(dom, p);
});

await ok('el Rosario dura 3 s: un beat más que el decenario', () => {
  const { C } = montar();
  eq(C._T.rosario, 3000);
  if (!(C._T.rosario > C._T.nucleo)) throw new Error('debería durar más que el decenario');
});

await ok('la palabra del Rosario espera a la Cruz', () => {
  const css = leer('cierre.css');
  if (!/\.cierre-titulo\.tarde\{ animation-delay: 2\.55s }/.test(css))
    throw new Error('la palabra no espera al último beat');
  if (!/\.halo-rosario\{[\s\S]*?animation-delay: 2\.45s/.test(css))
    throw new Error('el resplandor del Rosario no espera a la Cruz');
});

await ok('el Rosario también se limpia solo', async () => {
  const { C, dom } = montar();
  await C.rosario({ metros: 1000 });
  eq(dom.body.hijos.length, 0);
  if (dom.porId['cierre-trayectorias']) throw new Error('quedó la hoja');
  eq(C.enCurso(), false);
});

await ok('decenario y Rosario no se pisan', async () => {
  const { C, dom } = montar();
  const p = C.decenario({ desde: fotoColumna() });
  eq(await C.rosario({}), false, 'el segundo debería rebotar');
  await new Promise(r => setTimeout(r, 20));
  eq(dom.body.hijos.length, 1);
  await saltar(dom, p);
});

for (const f of CON_ROSARIO) {
  await ok(f.padEnd(11) + ' · lo cierra al completar el bloque', () => {
    const s = leer(f);
    if (!/function mostrarRosario/.test(s)) throw new Error('no define mostrarRosario');
    if (!/Cierre\.rosario\(/.test(s)) throw new Error('no llama a Cierre.rosario');
    const cuerpo = (s.match(/function mostrarRosario[\s\S]*?\n\}/) || [''])[0];
    if (!/return Promise\.resolve\(false\)/.test(cuerpo)) throw new Error('sin salida temprana');
    if (!/catch/.test(cuerpo)) throw new Error('sin catch');
  });
}

await ok('audio  · el Rosario va entre el decenario y el epílogo', () => {
  const s = leer('audio.html');
  if (!/mostrarDecenario\(\)\s*\.then\(mostrarRosario\)/.test(s))
    throw new Error('no encadena decenario → Rosario');
  /* Antes lo marcaba el BONUS de bloque, que se cobra una sola vez y para
     siempre: quien ya lo tenía no volvía a ver la animación. Ahora lo marca la
     vuelta —cinco decenas REZADAS—, que se repite. El bonus solo aporta la
     cifra de metros, si la hubo. */
  if (/_rosarioPendiente = METERS_BLOCK_BONUS/.test(s))
    throw new Error('el rito vuelve a colgar del premio');
  if (!/_rosarioMetros = METERS_BLOCK_BONUS/.test(s))
    throw new Error('el bonus dejó de aportar su cifra al pie del Rosario');
});

await ok('audio  · el Mariano y el toast del bloque ya no compiten', () => {
  /* Antes se disparaban aquí y el epílogo los tapaba a los pocos cientos de
     milisegundos. Ahora los metros van dentro del Rosario. */
  const s = leer('audio.html');
  const bloque = (s.match(/if \(doneInBlock\.size >= 5[\s\S]{0,700}?\n  \}/) || [''])[0];
  if (/showSlide\(METERS_BLOCK_BONUS/.test(bloque))
    throw new Error('sigue lanzando el Mariano, que el epílogo tapaba');
  if (/showToast/.test(bloque))
    throw new Error('sigue lanzando el toast del bloque');
});

await ok('orar y rezar lo cierran donde toca', () => {
  /* No es el mismo sitio en los dos, y no debe serlo: orar cierra el bloque y
     pasa a su celebración; rezar cierra la sesión entera y de ahí entra a las
     Letanías, así que el Rosario tiene que verse antes que ellas. */
  /* En orar el Rosario salió de `dots.every(Boolean)` —que solo corre una vez
     en la vida— y pasó al Amén, detrás del decenario: ahí es donde la vuelta
     acaba de cerrarse y donde el usuario ya pulsó para avanzar. */
  const orar = leer('orar.html').replace(/\s/g, '');
  const iD = orar.indexOf('awaitmostrarDecenario();');
  if (iD === -1) throw new Error('orar dejó de cerrar el decenario en el Amén');
  if (orar.indexOf('awaitmostrarRosario();', iD) !== iD + 'awaitmostrarDecenario();'.length)
    throw new Error('el Rosario no va inmediatamente detrás del decenario');
  /* En rezar se comprueba por ORDEN, no por cercanía: entre el Rosario y las
     Letanías se coló el rosetón (el cuaderno, cuando se cierran los cuatro
     bloques) y una ventana de caracteres fija se rompía con solo añadir un paso. */
  const rezar = leer('rezar.html');
  const cuerpo = (rezar.match(/async function onSessionComplete\(\)[\s\S]*?\n\}/) || [''])[0];
  const iRos = cuerpo.indexOf('await mostrarRosario()');
  const iLet = cuerpo.indexOf('RosarioFinal.abrir');
  if (iRos === -1) throw new Error('rezar dejó de cerrar el Rosario');
  if (iLet === -1) throw new Error('rezar dejó de ofrecer las Letanías');
  if (!(iRos < iLet)) throw new Error('rezar no lo cierra antes de las Letanías');
});

console.log('\n── Desemboca en las Letanías ──');

await ok('rezar · el Rosario se ve ANTES de las Letanías', () => {
  /* Estaba al revés: la animación caía dentro de celebrar(), que corre como
     onCerrar de RosarioFinal. Se coronaba el Rosario antes de mostrarlo. */
  const s = leer('rezar.html');
  const i = s.indexOf('await mostrarRosario();');
  const j = s.indexOf('RosarioFinal.abrir({ onCerrar: celebrar })');
  if (i === -1) throw new Error('rezar ya no espera al Rosario antes de seguir');
  if (j === -1) throw new Error('rezar dejó de ofrecer las Letanías');
  if (!(i < j)) throw new Error('el Rosario sigue cayendo después de las Letanías');
  const cel = (s.match(/function celebrar\(\)[\s\S]*?\n\}/) || [''])[0];
  if (/mostrarRosario/.test(cel)) throw new Error('quedó una llamada dentro de celebrar()');
});

await ok('rezar · onSessionComplete puede esperar', () => {
  if (!/async function onSessionComplete/.test(leer('rezar.html')))
    throw new Error('sin async, el await del Rosario no compilaría');
});

await ok('orar · la celebración ofrece las Letanías', () => {
  const s = leer('orar.html');
  if (!/id="btn-celeb-letanias"/.test(s)) throw new Error('falta el botón');
  if (!/function ofrecerLetanias/.test(s)) throw new Error('falta el cableado');
  /* En los DOS finales: el bloque de cinco y el cuaderno de veinte. */
  eq((s.match(/\n\s*ofrecerLetanias\(\);/g) || []).length, 2);
});

await ok('orar · se ofrecen, no se imponen', () => {
  const s = leer('orar.html');
  const boton = (s.match(/<button[^>]*id="btn-celeb-letanias"[^>]*>/) || [''])[0];
  if (/btn-primary/.test(boton))
    throw new Error('las Letanías no deben ser el botón primario: se ofrecen');
  const cuerpo = (s.match(/function ofrecerLetanias[\s\S]*?\n\}/) || [''])[0];
  if (!/window\.RosarioFinal/.test(cuerpo))
    throw new Error('sin el módulo, el botón prometería algo que no puede cumplir');
  if (!/onCerrar/.test(cuerpo))
    throw new Error('al salir de las Letanías hay que volver a la celebración');
});

await ok('audio · el epílogo ya las ofrece al cerrar el set', () => {
  const s = leer('audio.html');
  if (!/\[5, 10, 15, 20\]\.includes\(misterio\)/.test(s))
    throw new Error('audio dejó de ofrecerlas en 5/10/15/20');
  if (!/epiBtn\('Letanías', false/.test(s))
    throw new Error('en audio tampoco deben ser el botón primario');
});

console.log('\n── El rosetón ──');

const paths  = v => v.todos.filter(e => e.tagName === 'path');
const lineas = v => v.todos.filter(e => e.tagName === 'line');
const retardo = e => Number((e.style.animation.match(/([\d.]+)s both/) || [])[1]);
const PALETA = { bold:'#FF7A00', base:'#FF7F09', soft:'#F69C49', mist:'#FFA34E',
                 light:'#FFCFA2', ultra:'rgba(255,122,0,0.07)' };
const VIDRIO = ['#E8A0A0', '#01BBE1', '#C0392B', '#D4A017'];

await ok('veinte pétalos: uno por Misterio del cuaderno', async () => {
  const { C, dom } = montar();
  const p = C.roseton({ paleta: PALETA, colores: VIDRIO, metros: 4000 });
  await new Promise(r => setTimeout(r, 30));
  const v = velo(dom);
  if (!v) throw new Error('no montó el velo');
  eq(paths(v).length, 20);
  await saltar(dom, p);
});

await ok('cinco pétalos por bloque, en su color', async () => {
  const { C, dom } = montar();
  const p = C.roseton({ paleta: PALETA, colores: VIDRIO });
  await new Promise(r => setTimeout(r, 30));
  const cuenta = {};
  paths(velo(dom)).forEach(e => { const f = e.getAttribute('fill'); cuenta[f] = (cuenta[f] || 0) + 1; });
  eq(Object.keys(cuenta).sort(), VIDRIO.slice().sort(), 'los cuatro colores de bloque');
  VIDRIO.forEach(c => eq(cuenta[c], 5, 'pétalos de ' + c));
  await saltar(dom, p);
});

await ok('las cuatro cuñas entran de una en una', async () => {
  /* Mientras no hay tracería se leen como cuatro cuñas: los cuatro Rosarios. */
  const { C, dom } = montar();
  const p = C.roseton({ paleta: PALETA, colores: VIDRIO });
  await new Promise(r => setTimeout(r, 30));
  const ret = paths(velo(dom)).map(retardo);
  eq(ret.slice(0, 5).filter(x => x === ret[0]).length, 5, 'los cinco del primer bloque, a la vez');
  const entre = +(ret[5] - ret[0]).toFixed(3);
  if (Math.abs(entre - 0.14) > 0.001) throw new Error('entre bloques: ' + entre + 's');
  await saltar(dom, p);
});

await ok('la piedra llega después del vidrio', async () => {
  /* Primero la luz, luego la forma: la tracería se dibuja sobre los pétalos. */
  const { C, dom } = montar();
  const p = C.roseton({ paleta: PALETA, colores: VIDRIO });
  await new Promise(r => setTimeout(r, 30));
  const v = velo(dom);
  if (!(Math.min(...lineas(v).map(retardo)) > Math.max(...paths(v).map(retardo))))
    throw new Error('la tracería empieza antes que el vidrio');
  await saltar(dom, p);
});

await ok('cuatro nervios mayores, dieciséis menores', async () => {
  /* Los mayores separan los cuatro bloques; los menores abren la rosa a veinte
     pétalos, y por eso llegan después. */
  const { C, dom } = montar();
  const p = C.roseton({ paleta: PALETA, colores: VIDRIO });
  await new Promise(r => setTimeout(r, 30));
  const ls = lineas(velo(dom));
  eq(ls.length, 20);
  const mayores = ls.filter(e => e.getAttribute('stroke-width') === '2.4');
  const menores = ls.filter(e => e.getAttribute('stroke-width') === '1.3');
  eq(mayores.length, 4);
  eq(menores.length, 16);
  if (!(Math.min(...menores.map(retardo)) > Math.max(...mayores.map(retardo))))
    throw new Error('los menores no abren la rosa después');
  await saltar(dom, p);
});

await ok('la piedra sale de la paleta del cuaderno', async () => {
  /* Cada Mundo tiene la suya: siete rosetones con un solo componente. */
  const { C, dom } = montar();
  const p = C.roseton({ paleta: PALETA, colores: VIDRIO });
  await new Promise(r => setTimeout(r, 30));
  const v = velo(dom);
  if (lineas(v).some(e => e.getAttribute('stroke') !== PALETA.soft))
    throw new Error('la tracería no usa paleta.soft');
  if (v.style._p['--ci-noche-cuaderno'] !== PALETA.ultra)
    throw new Error('la noche no toma paleta.ultra del cuaderno');
  await saltar(dom, p);
});

await ok('sin paleta no se rompe: cae a la tinta de la casa', async () => {
  const { C, dom } = montar();
  const p = C.roseton({});
  await new Promise(r => setTimeout(r, 30));
  const v = velo(dom);
  eq(paths(v).length, 20);
  if (lineas(v).some(e => /undefined|NaN/.test(e.getAttribute('stroke') || '')))
    throw new Error('se coló un undefined en la piedra');
  await saltar(dom, p);
});

await ok('el óculo lo ocupa la Lux, y llega la última', async () => {
  const { C, dom } = montar();
  const p = C.roseton({ paleta: PALETA, colores: VIDRIO });
  await new Promise(r => setTimeout(r, 30));
  const v = velo(dom);
  eq(rects(v).length, 2, 'los dos brazos de la Cruz');
  if (!(retardo(rects(v)[0]) > Math.max(...lineas(v).map(retardo))))
    throw new Error('la Lux no llega después de la tracería');
  await saltar(dom, p);
});

await ok('dura 3,5 s: es el más raro de los tres', () => {
  const { C } = montar();
  eq(C._T.roseton, 3500);
  if (!(C._T.roseton > C._T.rosario)) throw new Error('debería durar más que el Rosario');
  const css = leer('cierre.css');
  if (!/\.cierre-titulo\.muy-tarde\{ animation-delay: 3\.05s \}/.test(css))
    throw new Error('la palabra del rosetón no espera al óculo');
});

await ok('el rosetón también se limpia solo', async () => {
  const { C, dom } = montar();
  await C.roseton({ paleta: PALETA, colores: VIDRIO });
  eq(dom.body.hijos.length, 0);
  if (dom.porId['cierre-trayectorias']) throw new Error('quedó la hoja');
  eq(C.enCurso(), false);
});


await ok('el rosetón dice QUÉ Nivel se cerró', () => {
  /* Cerrar los veinte Misterios de un Nivel merece que se diga cuál: la palabra
     pasa a antetítulo y el nombre —el canónico de niveles.js— toma el cuerpo. */
  const { C, dom } = montar();
  const p = C.roseton({ paleta: {}, colores: ['#E8A0A0','#01BBE1','#C0392B','#D4A017'],
                        titulo: 'Nivel recorrido', nombre: 'Cruz 1-3: Conversión' });
  const v = velo(dom);
  const t = v.todos.find(e => (e.className || '').indexOf('cierre-titulo') === 0);
  const n = v.todos.find(e => (e.className || '').indexOf('cierre-nombre') === 0);
  if (!t) throw new Error('no hay palabra');
  if (t.textContent !== 'Nivel recorrido')
    throw new Error('la palabra dice: ' + t.textContent);
  if (!n) throw new Error('no pinta el nombre del Nivel');
  if (n.textContent !== 'Cruz 1-3: Conversión')
    throw new Error('el nombre dice: ' + n.textContent);
  if (!/con-nombre/.test(t.className))
    throw new Error('la palabra no se retira a antetítulo: competiría con el nombre');
  return saltar(dom, p);
});

await ok('sin nombre, el rosetón sigue siendo el de antes', () => {
  /* Una página que no cargue niveles.js pasa cadena vacía: nada que pintar, y
     la palabra conserva su cuerpo grande. */
  const { C, dom } = montar();
  const p = C.roseton({ paleta: {}, colores: ['#E8A0A0','#01BBE1','#C0392B','#D4A017'] });
  const v = velo(dom);
  const t = v.todos.find(e => (e.className || '').indexOf('cierre-titulo') === 0);
  if (v.todos.some(e => (e.className || '').indexOf('cierre-nombre') === 0))
    throw new Error('pinta un nombre vacío');
  if (/con-nombre/.test(t.className))
    throw new Error('sin nombre la palabra no debe encogerse');
  if (t.textContent !== 'Nivel recorrido')
    throw new Error('el texto por defecto dice: ' + t.textContent);
  return saltar(dom, p);
});


console.log('\n── El cuaderno son los veinte ──');

await ok('audio · cuadernoCompleto cuenta los 20, no el cuarto bloque', () => {
  /* Los bloques se pueden rezar en cualquier orden: cerrar gloriosos no
     significa haber cerrado el cuaderno. */
  const f = (leer('audio.html').match(/function cuadernoCompleto[\s\S]*?\n\}/) || [''])[0];
  if (!/history/.test(f)) throw new Error('no mira el historial');
  if (!/vistos\.size >= 20/.test(f)) throw new Error('no exige los veinte');
  if (!/x\.n === nivel && x\.c === cuaderno/.test(f))
    throw new Error('no acota a este nivel y cuaderno');
});

await ok('audio · el rosetón va al final de la cadena', () => {
  const s = leer('audio.html');
  if (!/\.then\(mostrarRosario\)[\s\S]{0,90}?\.then\(mostrarRoseton\)/.test(s))
    throw new Error('el rosetón no va tras el Rosario');
  if (!/_rosetonPendiente = true/.test(s)) throw new Error('nadie lo marca');
});

await ok('orar · lo cierra donde están los veinte', () => {
  const s = leer('orar.html');
  const cuerpo = (s.match(/async function showAdvanceLevelPrompt\(\)[\s\S]*?\n\}/) || [''])[0];
  if (!/mostrarRoseton\(\)/.test(cuerpo))
    throw new Error('showAdvanceLevelPrompt no lo cierra');
  /* Y el rosetón manda sobre el reconocimiento de la vuelta: el hito no se
     comparte con el aviso de haber repetido el recorrido. */
  const c2 = cuerpo.replace(/\s/g, '');
  const g = c2.indexOf('_vueltaPendiente=false;');
  if (g === -1 || c2.indexOf('mostrarVuelta()', g) === -1)
    throw new Error('la vuelta podría salir encima del rosetón');
});

for (const f of ['audio.html', 'orar.html']) {
  await ok(f.padEnd(11) + ' · el rosetón tampoco bloquea', () => {
    const cuerpo = (leer(f).match(/function mostrarRoseton[\s\S]*?\n\}/) || [''])[0];
    if (!/return Promise\.resolve\(false\)/.test(cuerpo)) throw new Error('sin salida temprana');
    if (!/catch/.test(cuerpo)) throw new Error('sin catch');
    if (!/tema[\s\S]{0,20}paleta/.test(cuerpo)) throw new Error('no toma la paleta del cuaderno');
  });
}

console.log('\n── Los emojis se retiran ──');

await ok('el confetti es ahora lluvia de Lux', () => {
  /* Conserva el nombre y la firma: los llamadores no cambian. */
  const f = (leer('plan-utils.js').match(/function _obConfetti[\s\S]*?\n  \}/) || [''])[0];
  if (/#FF7A00|#FFD700|#8E44AD|#E91E8C|#27AE60/.test(f))
    throw new Error('siguen los siete colores que no existen en ninguna otra parte');
  if (!/#E8B94A/.test(f)) throw new Error('no usa el oro de la casa');
  if (/i < 48/.test(f)) throw new Error('siguen siendo 48 piezas');
});

await ok('el 🎉 del DEMO y el 🙏 de la celebración de orar salieron', () => {
  /* Sustituidos, no borrados a secas: el rosetón corre antes del overlay del
     DEMO, y el Rosario antes de la celebración de orar. */
  if (leer('audio.html').indexOf('\u{1F389}') !== -1) throw new Error('sigue el 🎉 en audio');
  if (/maria-placeholder/.test(leer('orar.html'))) throw new Error('sigue el círculo con el 🙏');
});


console.log('\n── El mapa pinta el progreso REAL, no un conteo ──');

await ok('crecer   · el nodo mira su bloque y su Misterio', () => {
  /* Miraba `gi < DONE_COUNT`, y DONE_COUNT es un CONTEO: quien rezaba los
     gloriosos (16-20) tenía 5 y el mapa le encendía los gozosos 1-5. */
  const s = leer('crecer.html');
  if (/isDone\s*=\s*gi\s*<\s*doneCount/.test(s))
    throw new Error('vuelve el prefijo lineal: el progreso se pintará en otro bloque');
  if (!/isDone\s*=\s*misterioHecho\(bi,\s*mi\)/.test(s))
    throw new Error('el nodo no lee el progreso real');
  const fn = (s.match(/function misterioHecho[\s\S]*?\n  \}/) || [''])[0];
  if (!/p\[BLOQUES\[bi\]\]/.test(fn.replace(/\s/g, '')))
    throw new Error('misterioHecho no indexa por bloque');
  if (!/arr\[mi\]/.test(fn))
    throw new Error('misterioHecho no indexa por Misterio: perdería la granularidad');
});

await ok('crecer   · el sendero pinta los tramos rezados', () => {
  const s = leer('crecer.html');
  if (/done\s*=\s*Math\.max\(0,\s*Math\.min\(window\.DONE_COUNT\s*-\s*start/.test(s))
    throw new Error('el sendero vuelve a derivarse del conteo');
  if (!/for \(var _k = 0; _k < 5; _k\+\+\) if \(_arr\[_k\]\) done = _k \+ 1;/.test(s))
    throw new Error('el tramo no se mide sobre el progreso del bloque');
});

await ok('crecer   · la rama free conserva su camino forzado', () => {
  /* El free avanza en línea recta por diseño (_freeActiveGi): esa rama no se
     toca, y el arreglo es solo de la de premium/beta/developer. */
  const s = leer('crecer.html');
  if (!/isDone\s*=\s*\(gi < _freeActiveGi\)/.test(s))
    throw new Error('se alteró el camino del plan free');
});

console.log('\n── El mapa no espera a la red para pintar bien ──');

[['audio.html', 'cruzando_progress_'], ['orar.html', 'refrescarCacheMapa'],
 ['rezar.html', 'refrescarCacheMapa']].forEach(([f, marca]) => {
  ok(f.padEnd(13) + '· deja el caché del mapa al día', () => {
    const s = leer(f);
    if (!s.includes('cruzando_progress_cache_dirty'))
      throw new Error('ya no marca el caché como sucio');
    if (!s.includes(marca))
      throw new Error('marca el caché sucio pero no lo refresca: el mapa pintará lo viejo');
    if (!/localStorage\.setItem\(\s*['"]cruzando_progress_['"]\s*\+|localStorage\.setItem\(_k,/.test(s))
      throw new Error('no escribe cruzando_progress_{nivelId}, que es lo que lee la FASE 1');
  });
});

console.log('\n── rezar también corona el cuaderno ──');

await ok('rezar    · el rosetón sale al cerrarse los cuatro bloques', () => {
  const s = leer('rezar.html');
  if (!/function cuadernoCompleto\(\)/.test(s))
    throw new Error('no sabe cuándo está cerrado el cuaderno');
  const c = (s.match(/function cuadernoCompleto\(\)[\s\S]*?\n\}/) || [''])[0];
  if (!/BLOCKS\.every/.test(c))
    throw new Error('el cuaderno son los CUATRO bloques, no el último');
  const o = (s.match(/async function onSessionComplete\(\)[\s\S]*?\n\}/) || [''])[0];
  const iR = o.indexOf('mostrarRosario()'), iX = o.indexOf('mostrarRoseton()');
  const iL = o.indexOf('RosarioFinal');
  if (iX === -1) throw new Error('rezar sigue sin rosetón');
  if (!(iR < iX)) throw new Error('el rosetón tiene que ir después del Rosario');
  if (iL !== -1 && !(iX < iL))
    throw new Error('los cierres van seguidos: el rosetón antes de las Letanías');
});

await ok('rezar    · el rosetón no bloquea el final', () => {
  const c = (leer('rezar.html').match(/function mostrarRoseton\(\)[\s\S]*?\n\}/) || [''])[0];
  if (!/return Promise\.resolve\(false\)/.test(c))
    throw new Error('sin salida temprana dejaría al usuario encerrado');
  if (!/catch/.test(c)) throw new Error('sin catch');
});


console.log('\n── Cableado y capas ──');

await ok('audio.html carga los tres módulos y la hoja', () => {
  const s = leer('audio.html');
  ['cierre.css', 'sarta.js', 'cierre.js', 'cuentas.js'].forEach(m => {
    if (!s.includes(m)) throw new Error('no carga ' + m);
  });
});

await ok('el epílogo sube DESPUÉS de todo el cierre, no encima', () => {
  /* Comprobado por ORDEN, no por la forma exacta de la cadena: así añadir un
     paso —como pasó con el Rosario y luego con el rosetón— no rompe la prueba,
     pero moverla o quitarla sí. */
  const s = leer('audio.html');
  const pasos = ['mostrarDecenario()', '.then(mostrarRosario)', '.then(mostrarRoseton)',
                 "$('scr-complete').classList.add('open')"];
  let cursor = -1;
  pasos.forEach(p => {
    const i = s.indexOf(p, cursor + 1);
    if (i === -1) throw new Error('falta o está fuera de orden: ' + p);
    cursor = i;
  });
});

await ok('mostrarDecenario nunca bloquea el cierre', () => {
  const s = leer('audio.html');
  const cuerpo = (s.match(/function mostrarDecenario\(\)[\s\S]*?\n\}/) || [''])[0];
  if (!/return Promise\.resolve\(false\)/.test(cuerpo))
    throw new Error('sin salida temprana, una animación rota dejaría al usuario encerrado');
  if (!/catch/.test(cuerpo))
    throw new Error('sin catch, un fallo del módulo colgaría el epílogo');
  if (!/Cierre\.decenaCompleta\(foto\)/.test(cuerpo))
    throw new Error('no comprueba que la decena se rezara entera');
});

await ok('el velo se queda bajo el splash de racha', () => {
  /* El decenario cierra el Misterio; el splash de racha viene después, al
     salir al mapa. Si el decenario quedara por encima, taparía al segundo. */
  const css = leer('cierre.css');
  const z = +(css.match(/z-index:\s*(\d+)/) || [])[1];
  const zr = +(leer('racha-splash.js').match(/var Z\s*=\s*(\d+)/) || [])[1];
  if (!(z > 900)) throw new Error('z-index ' + z + ': quedaría bajo las celebraciones');
  if (!(z < zr)) throw new Error('z-index ' + z + ' taparía el splash de racha (' + zr + ')');
});

await ok('los tokens de movimiento viven en un solo sitio', () => {
  const css = leer('cierre.css');
  ['--ease-rito', '--ease-velo', '--t-breve', '--t-gesto', '--t-rito'].forEach(t => {
    if (!css.includes(t + ':')) throw new Error('falta el token ' + t);
  });
  if (!/--ease-rito:\s*cubic-bezier\(\.34,\s*1\.56/.test(css))
    throw new Error('--ease-rito debería ser el rebote que ya usaba luxAppear');
});

await ok('respeta prefers-reduced-motion', () => {
  const css = leer('cierre.css');
  if (!/@media \(prefers-reduced-motion: reduce\)/.test(css))
    throw new Error('sin bloque de movimiento reducido');
});

await ok('cierre.js y cierre.css están en UTF-8 limpio', () => {
  ['cierre.js', 'cierre.css'].forEach(f => {
    const sospechas = leer(f).match(/Ã.|Â.|ð./g);
    if (sospechas) throw new Error(f + ' · mojibake: ' + [...new Set(sospechas)].join(' '));
  });
});



console.log('\n── La columna no salta al encenderse la Cruz ──');

for (const f of ['audio.html', 'orar.html', 'rezar.html']) {
  await ok(f.padEnd(13) + '· la Cruz reserva su sitio desde el principio', () => {
    /* Con display:none la Cruz no ocupaba nada y al encenderse la columna crecía
       ~49 px de golpe; anclada al centro (top:50% + translateY(-50%)), las once
       cuentas saltaban hacia arriba justo antes de que arrancara el decenario,
       que parte de esas mismas posiciones. */
    const s = leer(f).replace(/\s+/g, '');
    const base = s.match(/\.bead-lux-cross\{([^}]*)\}/);
    if (!base) throw new Error('no encontré la regla base de la Cruz');
    if (/display:none/.test(base[1]))
      throw new Error('vuelve display:none: la columna saltará al encender la Cruz');
    if (!/display:flex/.test(base[1]) || !/visibility:hidden/.test(base[1]))
      throw new Error('la Cruz apagada tiene que ocupar su caja y no verse');
    const show = s.match(/\.bead-lux-cross\.show\{([^}]*)\}/);
    if (!show) throw new Error('no encontré la regla .show');
    if (/display:/.test(show[1]))
      throw new Error('encender la Cruz no puede cambiar el display: eso es el salto');
    if (!/visibility:visible/.test(show[1]))
      throw new Error('la Cruz encendida no se vuelve visible');
  });
}

console.log('\n── rezar: el final del Rosario ocurre una sola vez ──');

await ok('rezar    · la pantalla de canto no sobrevive al final', () => {
  /* El return temprano de playNext() se saltaba el Canto.close() de abajo: la
     pantalla quedaba abierta DEBAJO del velo del Rosario (940 sobre 400) y
     reaparecía al retirarse el velo. */
  const s = leer('rezar.html');
  const c = (s.match(/function playNext\(\)[\s\S]*?\n\}/) || [''])[0];
  if (!c) throw new Error('no encontré playNext');
  const i = c.indexOf('plIdx>=playlist.length');
  const j = c.indexOf('onSessionComplete()');
  const k = c.indexOf('Canto.close()');
  if (i === -1 || j === -1) throw new Error('cambió la salida del final');
  if (!(k > i && k < j))
    throw new Error('el karaoke no se cierra antes de rematar la sesión');
});

await ok('rezar    · Saltar al final no repite el Rosario', () => {
  /* "Saltar" es onSkip → playNext(), así que el usuario podía volver a entrar y
     el Rosario se pintaba por segunda vez antes de la celebración. */
  const s = leer('rezar.html');
  const c = (s.match(/async function onSessionComplete\(\)[\s\S]*?\n\}/) || [''])[0];
  if (!/if\(_sesionCerrada\)return;/.test(c.replace(/ /g, '')))
    throw new Error('onSessionComplete no es idempotente');
  if (!/_sesionCerrada=true;/.test(c.replace(/ /g, '')))
    throw new Error('no deja marcada la sesión como cerrada');
  const p = (s.match(/function playNext\(\)[\s\S]*?\n\}/) || [''])[0].replace(/\s/g, '');
  if (!/^functionplayNext\(\)\{if\(_sesionCerrada\)return;/.test(p))
    throw new Error('playNext sigue avanzando después del final');
  if (!/plIdx=playlist\.length;/.test(p))
    throw new Error('plIdx sigue creciendo sin tope tras el final');
});


console.log('\n── rezar: la Cruz se enciende se toque o no ──');

const _cuerpo = (src, fn) =>
  (src.match(new RegExp('function ' + fn + '\\(\\)[\\s\\S]*?\\n\\}')) || [''])[0];

await ok('rezar    · la Lux ya no depende del tap 11', () => {
  /* En rezar las cuentas son interactivas, y encender la Lux vivía SOLO dentro
     de countBead() —el onclick del botón Contar—. Quien rezaba sin contar
     terminaba la decena con la columna entera en blanco y la Cruz apagada, así
     que Cierre.decenaCompleta() daba false y el decenario moría en silencio. */
  const s = leer('rezar.html');
  if (!/function _encenderLux/.test(s))
    throw new Error('no existe la vía de encendido separada del tap');
  const tick = _cuerpo(s, '_tickBeads');
  if (!/_encenderLux/.test(tick))
    throw new Error('el tick pasivo no enciende la Cruz al cerrar la decena');
  if (!/beadCount>=11\)_encenderLux/.test(tick.replace(/ /g, '')))
    throw new Error('la enciende sin comprobar que la decena esté cerrada');
});

await ok('rezar    · la vía pasiva NO reparte metros', () => {
  /* Los 25 m por cuenta son el premio de tocar a tiempo: el incentivo para
     rezar atento. Encender la Cruz es una luz, no un cobro. */
  const s = leer('rezar.html');
  ['_encenderLux', '_cerrarColumnaDecena'].forEach(fn => {
    const c = _cuerpo(s, fn);
    if (!c) throw new Error('no encontré ' + fn);
    if (/addMeters|_showBeadBonus/.test(c))
      throw new Error(fn + ' reparte metros que el usuario no ganó');
    if (/add\(\s*'lit-correct/.test(c))
      throw new Error(fn + ' pinta la tinta de oro, que es la del tap a tiempo');
  });
});

await ok('rezar    · el acorde y la vibración siguen siendo del tap', () => {
  /* La Cruz es la imagen de la decena cerrada (siempre); el acorde de tres
     notas y la vibración son la recompensa de haber contado las once. */
  const s   = leer('rezar.html');
  const lux = _cuerpo(s, '_encenderLux');
  if (/playBeadComplete|navigator\.vibrate/.test(lux))
    throw new Error('la vía pasiva se lleva la recompensa del tap');
  const comp = _cuerpo(s, '_onBeadComplete');
  if (!/playBeadComplete/.test(comp) || !/navigator\.vibrate/.test(comp))
    throw new Error('el tap perdió su recompensa');
  if (!/_encenderLux/.test(comp))
    throw new Error('el tap dejó de encender la Cruz');
});

await ok('rezar    · la columna se consolida antes de la instantánea', () => {
  /* El tick corre cada 80 ms y se detiene al pausar el audio: si la última
     ventana termina con la pista, la cuenta 10 se queda 'active' y sin tinta,
     y el decenario la dibujaría distinta a sus diez hermanas. */
  const s = leer('rezar.html').replace(/[ \t]/g, '');
  const i = s.indexOf('_cerrarColumnaDecena();');
  if (i === -1) throw new Error('no se consolida la columna al cerrar el Misterio');
  const j = s.indexOf('mostrarDecenario();', i);
  if (j === -1) throw new Error('la consolidación quedó suelta, sin decenario detrás');
  if (s.slice(i + '_cerrarColumnaDecena();'.length, j).trim() !== '')
    throw new Error('algo se metió entre la consolidación y la instantánea');
});

await ok('rezar    · el velo del cierre va por encima del karaoke', () => {
  /* No era el bug —el decenario nunca llegaba a crearse— pero es la condición
     que hace posible verlo sobre las imágenes del canto: los dos cuelgan de
     document.body, así que solo los separa el z-index. */
  const mv = leer('cierre.css').match(/\.cierre-velo[\s\S]{0,400}?z-index:\s*(\d+)/);
  const mk = leer('canto.css').match(/\.karaoke\{[^}]*z-index:(\d+)/);
  if (!mv || !mk) throw new Error('no pude leer alguno de los dos z-index');
  if (!(+mv[1] > +mk[1]))
    throw new Error('el velo (' + mv[1] + ') no está sobre el karaoke (' + mk[1] + ')');
});

  console.log('' + '─'.repeat(0));  console.log('\n' + '─'.repeat(64));
  if (fallos) {
    console.log('  ✗ ' + fallos + ' fallo(s), ' + pasos + ' pasada(s)');
    console.log('─'.repeat(64) + '\n');
    process.exit(1);
  }
  console.log('  TODO VERDE — ' + pasos + ' pruebas');
  console.log('─'.repeat(64) + '\n');
}());
