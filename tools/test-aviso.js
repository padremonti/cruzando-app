/* ══════════════════════════════════════════════════════════════════════
   Banco de pruebas — el aviso (aviso.js / aviso.css)

   Cinco pantallas de cierre venían de otra época y compartían el mismo molde:
   un emoji de 3rem, texto plano y botones con estilos escritos EN LÍNEA,
   repetidos a mano en tres archivos. Ninguna hablaba el idioma que ya tienen
   el decenario, el Rosario, el rosetón y la vuelta.

   El aviso NO es un velo: se pinta dentro del contenedor que la página ya
   controla, así que cada modo conserva su show() y su navegación.

   Correr:  node tools/test-aviso.js
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let fallos = 0, pasos = 0;
function ok(nombre, fn) {
  try { fn(); console.log('  ✓ ' + nombre); pasos++; }
  catch (e) { console.log('  ✗ ' + nombre + '\n      ' + e.message); fallos++; }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error((msg || '') + '\n      esperado: ' + JSON.stringify(b) +
                    '\n      recibido: ' + JSON.stringify(a));
}

/* ── DOM de mentira: lo justo que toca el módulo ─────────────────────── */
function nodo(tag) {
  const n = {
    tagName: (tag || 'div').toUpperCase(), hijos: [], _clase: '', _texto: '',
    style: { _p: {}, setProperty(k, v) { this._p[k] = v; } },
    setAttribute() {}, isConnected: true,
    appendChild(h) { this.hijos.push(h); h.padre = this; return h; },
    get className() { return this._clase; },
    set className(v) { this._clase = v; },
    get textContent() { return this._texto; },
    set textContent(v) { this._texto = String(v); },
    set innerHTML(v) { this._html = v; if (v === '') this.hijos = []; },
    get innerHTML() { return this._html || ''; },
  };
  return n;
}
function montar() {
  const porId = {};
  const doc = {
    getElementById: id => porId[id] || null,
    createElement: t => nodo(t),
    head: nodo('head'),
    styleSheets: [],
  };
  const ctx = {
    document: doc,
    setInterval: () => 1, clearInterval: () => {},
    Date: Date, String: String, Math: Math, JSON: JSON, Array: Array,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(leer('aviso.js'), ctx);
  return { ctx, doc, porId, A: ctx.window.Aviso };
}
const todos = raiz => {
  const out = [];
  (function rec(n) { (n.hijos || []).forEach(h => { out.push(h); rec(h); }); }(raiz));
  return out;
};
const conClase = (raiz, c) => todos(raiz).filter(n => (n.className || '').split(' ').includes(c));

console.log('\n── La pieza pinta lo que se le da ──');

ok('monta la Cruz, el título y las acciones', () => {
  const { porId, A } = montar();
  const dest = nodo('div'); dest.id = 'destino'; porId.destino = dest;
  const caja = A.pintar('destino', {
    titulo: 'Misterios Gozosos',
    kicker: 'Rosario recorrido',
    cuerpo: 'Recorriste cinco Misterios.',
    acciones: [{ texto: 'Seguir', tipo: 'primario' }, { texto: 'Salir', tipo: 'discreto' }]
  });
  if (!caja) throw new Error('no devolvió la caja');
  if (conClase(caja, 'aviso-lux').length !== 1) throw new Error('falta la Cruz de Lux');
  eq(conClase(caja, 'aviso-titulo')[0].textContent, 'Misterios Gozosos');
  eq(conClase(caja, 'aviso-kicker')[0].textContent, 'Rosario recorrido');
  eq(conClase(caja, 'aviso-btn').length, 2);
});

ok('lo opcional no deja huecos', () => {
  /* Sin kicker, sin cuerpo, sin dato y sin nota no se montan nodos vacíos:
     el aviso más simple es la Cruz, un título y un botón. */
  const { porId, A } = montar();
  const dest = nodo('div'); dest.id = 'd'; porId.d = dest;
  const caja = A.pintar('d', { titulo: 'Solo esto', acciones: [{ texto: 'Vale' }] });
  ['aviso-kicker', 'aviso-cuerpo', 'aviso-dato', 'aviso-nota'].forEach(c => {
    if (conClase(caja, c).length) throw new Error('montó un ' + c + ' vacío');
  });
});

ok('las acciones nulas se descartan', () => {
  /* Las páginas pasan `sigNivel && {...}` y `accionLetanias()`, que devuelve
     null si rosario-final.js no cargó: no se promete lo que no se cumple. */
  const { porId, A } = montar();
  const dest = nodo('div'); dest.id = 'd'; porId.d = dest;
  const caja = A.pintar('d', { titulo: 'X', acciones: [null, { texto: 'Uno' }, undefined, false] });
  eq(conClase(caja, 'aviso-btn').length, 1);
});

ok('un destino que no existe no revienta', () => {
  const { A } = montar();
  eq(A.pintar('no-existe', { titulo: 'X' }), null);
});

ok('pintar dos veces sustituye, no acumula', () => {
  const { porId, A } = montar();
  const dest = nodo('div'); dest.id = 'd'; porId.d = dest;
  A.pintar('d', { titulo: 'Uno' });
  A.pintar('d', { titulo: 'Dos' });
  eq(dest.hijos.length, 1, 'el aviso anterior sigue montado debajo');
  eq(conClase(dest.hijos[0], 'aviso-titulo')[0].textContent, 'Dos');
});

console.log('\n── El reloj del candado diario ──');

ok('cuenta hasta el SEGUNDO, no solo las horas', () => {
  /* "en 7h" a las 23:05 era falso: faltaba menos de una hora. */
  const { A } = montar();
  const t = A._falta();
  if (!/^Nueva sesión en \d+ h \d{2} m \d{2} s$/.test(t))
    throw new Error('formato inesperado: ' + t);
});

ok('el reloj solo se monta si se pide', () => {
  const { porId, A } = montar();
  const dest = nodo('div'); dest.id = 'd'; porId.d = dest;
  eq(conClase(A.pintar('d', { titulo: 'X' }), 'aviso-dato').length, 0);
  eq(conClase(A.pintar('d', { titulo: 'X', cuenta: 'medianoche' }), 'aviso-dato').length, 1);
});

console.log('\n── Las cinco pantallas usan la pieza ──');

[['audio.html', ['daily-limit-body', 'coming-soon-body']],
 ['orar.html',  ['celeb-aviso', 'error-aviso']],
 ['rezar.html', ['celeb-aviso', 'error-aviso']]].forEach(([f, destinos]) => {
  ok(f.padEnd(13) + '· carga el módulo y pinta en sus contenedores', () => {
    const s = leer(f);
    if (!/aviso\.js/.test(s) || !/aviso\.css/.test(s))
      throw new Error('no carga el módulo');
    destinos.forEach(d => {
      if (!s.includes("Aviso.pintar('" + d + "'"))
        throw new Error('no pinta en ' + d);
      if (!s.includes('id="' + d + '"'))
        throw new Error('falta el contenedor ' + d);
    });
  });

  ok(f.padEnd(13) + '· no vuelven los estilos en línea del molde viejo', () => {
    const s = leer(f);
    if (/font-size:2\.8rem;margin-bottom:20px/.test(s))
      throw new Error('vuelve el emoji gigante con estilo en línea');
    if (/maria-placeholder">/.test(s))
      throw new Error('vuelve el círculo con el 🙏');
  });
});

console.log('\n── Cerrar el NIVEL no es "tocar Gloriosos" ──');

['orar.html', 'rezar.html'].forEach(f => {
  ok(f.padEnd(13) + '· la celebración de Nivel no mira el bloque', () => {
    /* Los bloques se rezan en cualquier orden: alguien puede empezar por
       Gloriosos y alguien puede cerrar los veinte con los Gozosos. Lo que
       manda es si con este bloque se completaron los veinte. */
    const s = leer(f);
    const i = s.indexOf("kicker: 'Nivel recorrido'");
    if (i === -1) throw new Error('no existe la celebración de Nivel');
    const antes = s.slice(Math.max(0, i - 900), i);
    if (/blk\s*===\s*'gloriosos'/.test(antes))
      throw new Error('la decide el bloque, no los veinte Misterios');
  });
});

ok('rezar        · la decide cuadernoCompleto()', () => {
  const s = leer('rezar.html');
  const c = (s.match(/function celebrar\(\)[\s\S]*?\n\}/) || [''])[0];
  if (!/cuadernoCompleto\(\)/.test(c))
    throw new Error('celebrar() no consulta si el Nivel quedó cerrado');
});

console.log('\n── Mariano vuelve al final del Misterio (audio) ──');

ok('audio        · el aviso de metros sale SOBRE el epílogo', () => {
  /* A z-index 300 quedaba debajo del epílogo (500) y no se veía: por eso se
     había retirado del cierre de bloque. */
  const s = leer('audio.html').replace(/\s/g, '');
  const m = s.match(/\.mariano-overlay\{[^}]*z-index:(\d+)/);
  if (!m) throw new Error('no encontré .mariano-overlay');
  if (+m[1] <= 500) throw new Error('z-index ' + m[1] + ' queda bajo el epílogo (500)');
  if (+m[1] >= 940) throw new Error('z-index ' + m[1] + ' taparía los cierres (940)');
  if (!/pointer-events:none/.test(m[0]))
    throw new Error('taparía los botones del epílogo');
});

ok('audio        · un aviso por Misterio, no uno por sección', () => {
  const s = leer('audio.html');
  if (!/if \(sessionMeters > 0\) setTimeout\(\(\) => showSlide\(sessionMeters\), 700\);/.test(s))
    throw new Error('el aviso no sale al abrirse el epílogo');
  const aw = (s.match(/async function awardSectionMeters[\s\S]*?\n\}/) || [''])[0];
  if (/showSlide/.test(aw))
    throw new Error('los metros de sección volverían a lanzar a Mariano: 5-6 por sesión');
});

['orar.html', 'rezar.html'].forEach(f => {
  ok(f.padEnd(13) + '· conserva su Mariano en la sesión (z 300)', () => {
    const s = leer(f).replace(/\s/g, '');
    const m = s.match(/\.mariano-overlay\{[^}]*z-index:(\d+)/);
    if (!m || +m[1] !== 300)
      throw new Error('cambió su capa: allí el aviso sale durante la sesión, no sobre un epílogo');
  });
});

console.log('\n' + '─'.repeat(64));
if (fallos) {
  console.log('  ✗ ' + fallos + ' fallo(s), ' + pasos + ' pasada(s)');
  console.log('─'.repeat(64) + '\n');
  process.exit(1);
}
console.log('  TODO VERDE — ' + pasos + ' pruebas');
console.log('─'.repeat(64) + '\n');
