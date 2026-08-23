/* ══════════════════════════════════════════════════════════════════════
   Banco de pruebas — racha de días consecutivos (racha.js)

   La lógica es pura, así que se corre entera en node sin Firebase ni DOM.
   Lo que más importa aquí es la IDEMPOTENCIA: de ella depende que el splash
   salga una sola vez al día por mucho que se encadenen Misterios.

   Correr:  node tools/test-racha.js
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const RAIZ = path.join(__dirname, '..');

const ctx = { localStorage: (function () {
  const m = {};
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); },
           removeItem: k => { delete m[k]; } };
}()) };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'racha.js'), 'utf8'), ctx);
const R = ctx.window.Racha;

let fallos = 0, pasos = 0;
function bien(n) { console.log('  ✓ ' + n); pasos++; }
function mal(n, e) { console.log('  ✗ ' + n + '\n      ' + (e && e.message || e)); fallos++; }

/* Consciente de promesas: las pruebas del splash son asíncronas (monta, anima y
   se retira con temporizadores reales) y un try/catch normal no vería su fallo. */
function ok(nombre, fn) {
  try {
    var r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(function () { bien(nombre); }, function (e) { mal(nombre, e); });
    }
    bien(nombre);
  } catch (e) { mal(nombre, e); }
}
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error((msg || '') + '\n      esperado: ' + B + '\n      recibido: ' + A);
}

console.log('\n── El día anterior ──');

ok('día normal', () => eq(R.ayerDe('2026-08-22'), '2026-08-21'));
ok('cambio de mes', () => eq(R.ayerDe('2026-08-01'), '2026-07-31'));
ok('cambio de año', () => eq(R.ayerDe('2026-01-01'), '2025-12-31'));
ok('29 de febrero bisiesto', () => eq(R.ayerDe('2028-03-01'), '2028-02-29'));
ok('marzo tras febrero no bisiesto', () => eq(R.ayerDe('2026-03-01'), '2026-02-28'));
ok('basura devuelve null', () => { eq(R.ayerDe('hola'), null); eq(R.ayerDe(null), null); });

console.log('\n── Ganar el día ──');

ok('primer Misterio de la vida → racha 1', () => {
  const r = R.calcular(null, '2026-08-22');
  eq(r.cambio, true);
  eq(r.racha, { ultimoDia: '2026-08-22', actual: 1, mejor: 1 });
});

ok('rezó ayer → la racha sube', () => {
  const r = R.calcular({ ultimoDia: '2026-08-21', actual: 6, mejor: 9 }, '2026-08-22');
  eq(r.cambio, true);
  eq(r.racha, { ultimoDia: '2026-08-22', actual: 7, mejor: 9 });
});

ok('supera su mejor marca → se actualiza', () => {
  const r = R.calcular({ ultimoDia: '2026-08-21', actual: 9, mejor: 9 }, '2026-08-22');
  eq(r.racha.mejor, 10);
});

ok('faltó un día → vuelve a 1, sin castigo', () => {
  const r = R.calcular({ ultimoDia: '2026-08-19', actual: 30, mejor: 30 }, '2026-08-22');
  eq(r.cambio, true);
  eq(r.racha, { ultimoDia: '2026-08-22', actual: 1, mejor: 30 });
});

ok('la mejor marca sobrevive a la rotura', () => {
  const r = R.calcular({ ultimoDia: '2020-01-01', actual: 88, mejor: 88 }, '2026-08-22');
  eq(r.racha.actual, 1);
  eq(r.racha.mejor, 88);
});

console.log('\n── Idempotencia (de esto depende el splash) ──');

ok('segundo Misterio del mismo día → sin cambio', () => {
  const r1 = R.calcular({ ultimoDia: '2026-08-21', actual: 3, mejor: 3 }, '2026-08-22');
  eq(r1.cambio, true);
  const r2 = R.calcular(r1.racha, '2026-08-22');
  eq(r2.cambio, false);
  eq(r2.racha, r1.racha);
});

ok('diez Misterios seguidos → un solo incremento', () => {
  let r = { cambio: false, racha: null }, cambios = 0;
  for (let i = 0; i < 10; i++) {
    r = R.calcular(r.racha, '2026-08-22');
    if (r.cambio) cambios++;
  }
  eq(cambios, 1);
  eq(r.racha.actual, 1);
});

ok('tres modos el mismo día → un solo incremento', () => {
  const base = { ultimoDia: '2026-08-21', actual: 4, mejor: 4 };
  const audio = R.calcular(base, '2026-08-22');           // audio: 1 Misterio
  const orar  = R.calcular(audio.racha, '2026-08-22');    // orar:  1 Misterio
  const rezar = R.calcular(orar.racha, '2026-08-22');     // rezar: 1 Misterio
  eq([audio.cambio, orar.cambio, rezar.cambio], [true, false, false]);
  eq(rezar.racha.actual, 5);
});

console.log('\n── Lo que enseña el marcador ──');

ok('rezó hoy → su racha', () =>
  eq(R.paraMostrar({ ultimoDia: '2026-08-22', actual: 7, mejor: 7 }, '2026-08-22'), 7));

ok('rezó ayer → sigue viva, el número está', () =>
  eq(R.paraMostrar({ ultimoDia: '2026-08-21', actual: 7, mejor: 7 }, '2026-08-22'), 7));

ok('rezó anteayer → rota, muestra 0', () =>
  eq(R.paraMostrar({ ultimoDia: '2026-08-20', actual: 7, mejor: 7 }, '2026-08-22'), 0));

ok('nunca ha rezado → 0', () => {
  eq(R.paraMostrar(null, '2026-08-22'), 0);
  eq(R.paraMostrar(R.vacia(), '2026-08-22'), 0);
});

ok('NO muestra el actual guardado a ciegas', () => {
  /* La trampa: el 'actual' del documento se queda viejo en cuanto pasa un día.
     Mostrarlo tal cual enseñaría una racha de 30 a quien lleva un mes sin rezar. */
  const viejo = { ultimoDia: '2026-07-01', actual: 30, mejor: 30 };
  eq(R.paraMostrar(viejo, '2026-08-22'), 0);
});

ok('pendienteHoy distingue viva-sin-rezar de ya-rezada', () => {
  eq(R.pendienteHoy({ ultimoDia: '2026-08-21', actual: 3, mejor: 3 }, '2026-08-22'), true);
  eq(R.pendienteHoy({ ultimoDia: '2026-08-22', actual: 3, mejor: 3 }, '2026-08-22'), false);
  eq(R.pendienteHoy({ ultimoDia: '2026-08-10', actual: 3, mejor: 3 }, '2026-08-22'), false);
});

console.log('\n── Dos copias: sin red y en dos aparatos ──');

ok('gana la del día más reciente', () => {
  const local  = { ultimoDia: '2026-08-22', actual: 5, mejor: 5 };
  const remoto = { ultimoDia: '2026-08-21', actual: 4, mejor: 9 };
  eq(R.fusionar(local, remoto), { ultimoDia: '2026-08-22', actual: 5, mejor: 9 });
});

ok('mismo día → gana la cuenta más alta', () =>
  eq(R.fusionar({ ultimoDia: '2026-08-22', actual: 3, mejor: 3 },
                { ultimoDia: '2026-08-22', actual: 8, mejor: 8 }).actual, 8));

ok('la mejor marca nunca se pierde en la fusión', () =>
  eq(R.fusionar({ ultimoDia: '2026-08-22', actual: 2, mejor: 2 },
                { ultimoDia: '2026-08-01', actual: 1, mejor: 40 }).mejor, 40));

ok('fusionar con vacío devuelve la que existe', () => {
  const r = { ultimoDia: '2026-08-22', actual: 5, mejor: 5 };
  eq(R.fusionar(null, r), r);
  eq(R.fusionar(r, null), r);
});

console.log('\n── Datos corruptos no revientan el marcador ──');

ok('normalizar aguanta basura', () => {
  eq(R.normalizar(undefined),            R.vacia());
  eq(R.normalizar('siete'),              R.vacia());
  eq(R.normalizar({ actual: -3 }),       { ultimoDia: null, actual: 0, mejor: 0 });
  eq(R.normalizar({ ultimoDia: '22/08/2026', actual: 5 }), { ultimoDia: null, actual: 0, mejor: 0 });
});

ok('mejor nunca queda por debajo de actual', () =>
  eq(R.normalizar({ ultimoDia: '2026-08-22', actual: 9, mejor: 2 }).mejor, 9));

ok('paraMostrar con datos corruptos → 0, no NaN', () => {
  eq(R.paraMostrar({ ultimoDia: 'ayer', actual: 'muchos' }, '2026-08-22'), 0);
  eq(R.paraMostrar({}, '2026-08-22'), 0);
});

console.log('\n── Espejo local ──');

ok('guardar y leer conserva el valor', () => {
  R.guardarLocal({ ultimoDia: '2026-08-22', actual: 4, mejor: 6 });
  eq(R.leerLocal(), { ultimoDia: '2026-08-22', actual: 4, mejor: 6 });
});

ok('sin nada guardado devuelve vacía', () => {
  ctx.localStorage.removeItem(R.LS_KEY);
  eq(R.leerLocal(), R.vacia());
});

console.log('\n── Una racha larga, día a día ──');

ok('30 días seguidos llegan a 30', () => {
  let r = null;
  for (let d = 1; d <= 30; d++) {
    r = R.calcular(r, '2026-09-' + String(d).padStart(2, '0')).racha;
  }
  eq(r.actual, 30);
  eq(r.mejor, 30);
});

ok('un hueco a mitad reinicia pero guarda la marca', () => {
  let r = null;
  for (let d = 1; d <= 10; d++) r = R.calcular(r, '2026-09-' + String(d).padStart(2, '0')).racha;
  r = R.calcular(r, '2026-09-15').racha;   // se saltó del 11 al 14
  eq(r.actual, 1);
  eq(r.mejor, 10);
});

/* ── Cableado: lo que la lógica pura no puede ver ───────────────────── */
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const MODOS   = ['audio.html', 'orar.html', 'rezar.html'];
const HUBS    = ['index.html', 'crecer.html'];

console.log('\n── Los tres modos registran el día ──');

MODOS.concat(HUBS).forEach(f => {
  ok(f.padEnd(12) + ' · carga racha.js', () => {
    if (!leer(f).includes('src="racha.js"')) throw new Error('no carga racha.js');
  });
});

MODOS.forEach(f => {
  ok(f.padEnd(12) + ' · define y llama a registrarRachaHoy', () => {
    const s = leer(f);
    if (!/async function registrarRachaHoy/.test(s)) throw new Error('no la define');
    const llamadas = (s.match(/^\s*registrarRachaHoy\(\);/gm) || []).length;
    if (llamadas !== 1) throw new Error('esperaba 1 llamada, encontré ' + llamadas);
  });
});

MODOS.forEach(f => {
  ok(f.padEnd(12) + ' · guarda en local ANTES que en Firestore', () => {
    const s = leer(f);
    const local  = s.indexOf('Racha.guardarLocal');
    const remoto = s.search(/racha:\s*r\.racha/);
    if (local === -1)  throw new Error('no guarda el espejo local');
    if (remoto === -1) throw new Error('no escribe en Firestore');
    if (local > remoto) throw new Error('escribe en red antes que en local: un rezo sin red se perdería');
  });
});

ok('orar/rezar  · registran antes del corte por Misterio ya hecho', () => {
  /* completeMystery corta con `if(dots[bIdx])return` cuando el Misterio ya
     estaba rezado. La racha pregunta si hoy rezaste, no si avanzaste. */
  ['orar.html', 'rezar.html'].forEach(f => {
    const s = leer(f);
    const call  = s.indexOf('registrarRachaHoy();');
    const corte = s.indexOf('if(dots[bIdx])return;');
    if (call === -1 || corte === -1) throw new Error(f + ': no encontré los dos puntos');
    if (call > corte) throw new Error(f + ': registra después del corte, y un Misterio repetido no contaría');
  });
});

ok('el guardián lleva el día, no un booleano', () => {
  /* Con un booleano, una pestaña abierta que cruza la medianoche no podría
     ganar el día siguiente. */
  MODOS.forEach(f => {
    const s = leer(f);
    if (!/_rachaDiaRegistrado\s*===\s*hoy/.test(s))
      throw new Error(f + ': el guardián no compara contra el día');
  });
});

console.log('\n── El marcador ya no es un cero fijo ──');

HUBS.forEach(f => {
  ok(f.padEnd(12) + ' · pinta la racha en las dos fases', () => {
    const s = leer(f);
    if (!/function pintarRacha/.test(s)) throw new Error('no define pintarRacha');
    if (!/pintarRacha\(Racha\.leerLocal\(\)\)/.test(s))
      throw new Error('no pinta desde localStorage en la fase sin red');
    if (!/Racha\.fusionar\(Racha\.leerLocal\(\),\s*gd\.racha\)/.test(s))
      throw new Error('no fusiona la copia local con la del servidor');
  });
});

HUBS.forEach(f => {
  ok(f.padEnd(12) + ' · usa paraMostrar, no el actual guardado', () => {
    const s = leer(f);
    const cuerpo = (s.match(/function pintarRacha[\s\S]{0,400}?\n\}/) || [''])[0];
    if (!/Racha\.paraMostrar\(/.test(cuerpo))
      throw new Error('no aplica la regla de vigencia: mostraría rachas caducadas');
    if (/\.actual/.test(cuerpo))
      throw new Error('lee .actual directamente en vez de pasar por paraMostrar');
  });
});

ok('index/crecer  · el 0 del HTML ya no es el valor final', () => {
  HUBS.forEach(f => {
    const s = leer(f);
    if (!/id="streak-display"/.test(s)) throw new Error(f + ': desapareció el marcador');
    /* el 0 del HTML puede quedarse como valor inicial, pero alguien debe pisarlo */
    if (!/getElementById\('streak-display'\)/.test(s))
      throw new Error(f + ': nadie escribe el marcador');
  });
});

/* ── El splash ──────────────────────────────────────────────────────── */
/* De aquí al final va dentro de una IIFE asíncrona: hay que ESPERAR a cada
   prueba del splash (monta, anima y se retira con temporizadores reales), o el
   recuento se imprimiría antes de que terminen y correrían todas a la vez. */
(async function () {


/* DOM de mentira: lo mínimo que toca racha-splash.js. Los timers son reales
   pero cortos, así que el banco sigue corriendo en menos de un segundo. */
function domFalso() {
  const creados = [];
  function nuevoEl(tag) {
    const el = {
      tagName: tag, id: '', className: '', textContent: '', innerHTML: '',
      padre: null, hijos: [], oyentes: {},
      classList: {
        _s: new Set(),
        add() { [].forEach.call(arguments, c => this._s.add(c)); },
        remove() { [].forEach.call(arguments, c => this._s.delete(c)); },
        contains(c) { return this._s.has(c); }
      },
      setAttribute() {},
      addEventListener(ev, fn) { (this.oyentes[ev] = this.oyentes[ev] || []).push(fn); },
      appendChild(c) { c.padre = this; this.hijos.push(c); return c; },
      removeChild(c) { this.hijos = this.hijos.filter(h => h !== c); c.padre = null; },
      get parentNode() { return this.padre; }
    };
    creados.push(el);
    return el;
  }
  const head = nuevoEl('head'), body = nuevoEl('body');
  return {
    creados, head, body,
    document: {
      head, body,
      createElement: nuevoEl,
      getElementById: id => creados.find(e => e.id === id) || null
    }
  };
}

function cargarSplash() {
  const d = domFalso();
  const c = {
    document: d.document,
    Promise, setTimeout, clearTimeout, console,
    requestAnimationFrame: fn => setTimeout(fn, 0)
  };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'racha-splash.js'), 'utf8'), c);
  return { S: c.window.RachaSplash, dom: d, ctx: c };
}

console.log('\n── El splash: montaje ──');

await ok('expone la API que esperan los cuatro modos', () => {
  const { S } = cargarSplash();
  ['marcar', 'hayPendiente', 'mostrarSiHay', 'mostrar'].forEach(k => {
    if (typeof S[k] !== 'function') throw new Error('falta ' + k);
  });
});

await ok('sin nada pendiente resuelve al instante y no monta nada', async () => {
  const { S, dom } = cargarSplash();
  eq(S.hayPendiente(), false);
  const r = await S.mostrarSiHay();
  eq(r, false);
  eq(dom.body.hijos.length, 0);
});

await ok('marcar deja el splash pendiente', () => {
  const { S } = cargarSplash();
  S.marcar(6, 7);
  eq(S.hayPendiente(), true);
});

await ok('marcar con racha 0 no deja nada (no hay nada que celebrar)', () => {
  const { S } = cargarSplash();
  S.marcar(0, 0);
  eq(S.hayPendiente(), false);
});

await ok('se monta, se anima y se limpia solo', async () => {
  const { S, dom } = cargarSplash();
  S.marcar(6, 7);
  const p = S.mostrarSiHay();
  await new Promise(r => setTimeout(r, 30));
  eq(dom.body.hijos.length, 1, 'debería haber un velo montado');
  const velo = dom.body.hijos[0];
  if (!velo.classList.contains('rs-anim')) throw new Error('no arrancó la coreografía');
  eq(await p, true);
  eq(dom.body.hijos.length, 0, 'el velo debería haberse retirado');
});

await ok('consumir el pendiente lo vacía: no sale dos veces', async () => {
  const { S } = cargarSplash();
  S.marcar(1, 2);
  const p = S.mostrarSiHay();
  eq(S.hayPendiente(), false);
  await p;
  eq(await S.mostrarSiHay(), false);
});

await ok('los estilos se inyectan una sola vez', async () => {
  const { S, dom } = cargarSplash();
  S.marcar(1, 2); await S.mostrarSiHay();
  S.marcar(2, 3); await S.mostrarSiHay();
  const hojas = dom.head.hijos.filter(h => h.id === 'racha-splash-estilos');
  eq(hojas.length, 1);
});

console.log('\n── El splash: lo que dice ──');

function contenido(de, a) {
  const { S, dom } = cargarSplash();
  S.mostrar(de, a);
  return dom.body.hijos[0].innerHTML;
}

await ok('muestra el número nuevo', () => {
  if (!contenido(6, 7).includes('>7</div>')) throw new Error('no aparece el 7');
});

await ok('muestra el viejo para despedirlo', () => {
  const h = contenido(6, 7);
  if (!/rs-viejo">6</.test(h)) throw new Error('no aparece el 6 saliente');
});

await ok('primer día de la vida: sin número viejo que despedir', () => {
  const h = contenido(0, 1);
  if (/rs-viejo/.test(h)) throw new Error('monta un número viejo que no existe');
  if (!/rs-nuevo">1</.test(h)) throw new Error('no aparece el 1');
});

await ok('singular en el primer día, plural después', () => {
  if (!contenido(0, 1).includes('Día consecutivo</div>'))   throw new Error('debería ir en singular');
  if (!contenido(1, 2).includes('Días consecutivos</div>')) throw new Error('debería ir en plural');
});

await ok('la llama 🔥 sigue ahí', () => {
  if (!contenido(6, 7).includes('🔥')) throw new Error('se perdió la llama');
});

console.log('\n── El splash: no atrapa a nadie ──');

await ok('un toque salta al final y cierra', async () => {
  const { S, dom } = cargarSplash();
  S.marcar(3, 4);
  const p = S.mostrarSiHay();
  await new Promise(r => setTimeout(r, 30));
  const velo = dom.body.hijos[0];
  velo.oyentes.click.forEach(fn => fn());          // el usuario toca
  if (!velo.classList.contains('rs-quieto')) throw new Error('no saltó al estado final');
  const t0 = Date.now();
  await p;
  if (Date.now() - t0 > 1200) throw new Error('tardó demasiado en cerrar tras el toque');
  eq(dom.body.hijos.length, 0);
});

await ok('sin toque cierra solo antes de 3 s', async () => {
  const { S } = cargarSplash();
  S.marcar(3, 4);
  const t0 = Date.now();
  await S.mostrarSiHay();
  const ms = Date.now() - t0;
  if (ms > 3000) throw new Error('el cierre tardó ' + ms + ' ms: retrasa la navegación');
});

await ok('dos llamadas a la vez no montan dos velos', async () => {
  const { S, dom } = cargarSplash();
  const p1 = S.mostrar(1, 2);
  const p2 = S.mostrar(5, 6);
  eq(await p2, false, 'la segunda debería rebotar');
  await new Promise(r => setTimeout(r, 20));
  eq(dom.body.hijos.length, 1);
  await p1;
});

console.log('\n── El splash: cableado en los cuatro modos ──');

const CON_SPLASH = ['audio.html', 'orar.html', 'rezar.html', 'mini.html'];

CON_SPLASH.forEach(f => {
  ok(f.padEnd(12) + ' · carga racha-splash.js', () => {
    if (!leer(f).includes('src="racha-splash.js"')) throw new Error('no lo carga');
  });
});

CON_SPLASH.forEach(f => {
  ok(f.padEnd(12) + ' · marca el splash solo cuando la racha sube', () => {
    const s = leer(f);
    if (!/RachaSplash\.marcar\(r\.previa,\s*r\.racha\.actual\)/.test(s))
      throw new Error('no marca el incremento');
    /* la marca tiene que estar dentro del if(r.cambio): fuera, saldría a diario */
    const trozo = s.slice(s.search(/if\s*\(?r\.cambio\)?\s*\{/), s.search(/if\s*\(?r\.cambio\)?\s*\{/) + 320);
    if (!/RachaSplash\.marcar/.test(trozo))
      throw new Error('la marca está fuera del if(r.cambio): saldría todos los días');
  });
});

CON_SPLASH.forEach(f => {
  ok(f.padEnd(12) + ' · lo pide antes de salir, no lo bloquea', () => {
    const s = leer(f);
    if (!/RachaSplash\.mostrarSiHay\(\)/.test(s)) throw new Error('nunca lo muestra');
    /* siempre con una salida alternativa: si el módulo no cargó, se navega igual */
    if (!/else\s+ir\(\)|:\s*ir\(\)|else\s+atras\(\)/.test(s))
      throw new Error('sin RachaSplash la navegación se quedaría colgada');
  });
});

await ok('orar        · la rama de history.back() también lo pide', () => {
  const s = leer('orar.html');
  if (!/RachaSplash\.mostrarSiHay\(\)\.then\(atras,\s*atras\)/.test(s))
    throw new Error('salir por el historial se saltaría el splash');
});

await ok('audio       · _goHome pasa por el embudo con splash', () => {
  const s = leer('audio.html');
  if (!/window\._goHome\s*=\s*\(\)\s*=>\s*\{\s*goTo\('crecer\.html'\);\s*\}/.test(s))
    throw new Error('_goHome vuelve a navegar a pelo y se salta el splash');
});

await ok('el splash queda por encima del epílogo y las celebraciones', () => {
  const { S } = cargarSplash();
  if (!(S._z > 900)) throw new Error('z-index ' + S._z + ' quedaría por debajo de las celebraciones (900)');
  if (!(S._z < 9999)) throw new Error('taparía el overlay del DEMO completado (9999)');
});

console.log('\n' + '─'.repeat(64));
if (fallos) {
  console.log('  ✗ ' + fallos + ' fallo(s), ' + pasos + ' pasada(s)');
  console.log('─'.repeat(64) + '\n');
  process.exit(1);
}
console.log('  TODO VERDE — ' + pasos + ' pruebas');
console.log('─'.repeat(64) + '\n');

}());