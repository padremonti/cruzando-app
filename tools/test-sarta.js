/* ══════════════════════════════════════════════════════════════════════
   Banco de pruebas — geometría de la sarta (sarta.js)

   Geometría pura: se corre entera en node sin DOM. Lo que más importa aquí
   son dos cosas que el ojo no comprueba solo:

     · que la Cruz cuelgue del PADRENUESTRO de la primera decena — en el
       boceto original el círculo la colgaba de la Avemaría 6 de la tercera;
     · que ninguna cuenta se solape con la siguiente a tamaño de teléfono.

   Correr:  node tools/test-sarta.js
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const RAIZ = path.join(__dirname, '..');
const ctx = {};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'sarta.js'), 'utf8'), ctx);
const S = ctx.window.Sarta;

/* Tamaño real: la placa mide 342 px de ancho sobre un viewBox de 200. */
const ESCALA = 342 / 200;
const OPTS = { radio: 3, escalaPater: 1.45, escalaCruz: 0.75 };

let fallos = 0, pasos = 0;
function ok(nombre, fn) {
  try { fn(); console.log('  ✓ ' + nombre); pasos++; }
  catch (e) { console.log('  ✗ ' + nombre + '\n      ' + e.message); fallos++; }
}
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error((msg || '') + '\n      esperado: ' + B + '\n      recibido: ' + A);
}
const lazo = g => g.cuentas.filter(c => c.zona === 'lazo');
const cola = g => g.cuentas.filter(c => c.zona === 'cola');

console.log('\n── Las tres formas ──');

ok('están las tres, con nombre en español', () =>
  eq(S.FORMAS.slice().sort(), ['capricho', 'circulo', 'gota']));

ok('una forma inventada no pasa en silencio', () => {
  let cayo = false;
  try { S.geometria('rombo'); } catch (e) { cayo = /forma desconocida/.test(e.message); }
  if (!cayo) throw new Error('debería lanzar');
});

console.log('\n── Sesenta cuentas ──');

S.FORMAS.forEach(f => {
  ok(f.padEnd(9) + ' · 60 cuentas: 55 en el lazo + 5 en la cola', () => {
    const g = S.geometria(f, OPTS);
    eq(g.cuentas.length, 60);
    eq(lazo(g).length, 55);
    eq(cola(g).length, 5);
  });
});

ok('el lazo son 5 Padrenuestros y 50 Avemarías', () => {
  const g = S.geometria('circulo', OPTS);
  eq(lazo(g).filter(c => c.tipo === 'pater').length, 5);
  eq(lazo(g).filter(c => c.tipo === 'ave').length, 50);
});

ok('cada decena lleva su Padrenuestro y sus diez Avemarías', () => {
  const g = S.geometria('circulo', OPTS);
  for (let d = 1; d <= 5; d++) {
    const dec = lazo(g).filter(c => c.decena === d);
    eq(dec.length, 11, 'decena ' + d);
    eq(dec.filter(c => c.tipo === 'pater').length, 1, 'decena ' + d + ' · Padrenuestros');
    eq(dec[0].tipo, 'pater', 'decena ' + d + ' · empieza por el Padrenuestro');
  }
});

ok('la cola es Padrenuestro, tres Avemarías y Padrenuestro', () => {
  /* El segundo Padrenuestro —el que toca la Cruz— faltaba en el boceto. */
  const g = S.geometria('circulo', OPTS);
  eq(cola(g).map(c => c.tipo), ['pater', 'ave', 'ave', 'ave', 'pater']);
});

ok('la cola baja en línea recta desde la unión', () => {
  const g = S.geometria('gota', OPTS);
  cola(g).forEach((c, i) => {
    if (Math.abs(c.cx - g.union[0]) > 0.01) throw new Error('la cuenta ' + i + ' se desvía en x');
    if (c.cy <= g.union[1]) throw new Error('la cuenta ' + i + ' no baja de la unión');
  });
});

console.log('\n── La Cruz cuelga de donde debe ──');

S.FORMAS.forEach(f => {
  ok(f.padEnd(9) + ' · la unión coincide con el Padrenuestro de la 1ª decena', () => {
    /* El fallo del boceto: en `circulo` el muestreo arrancaba arriba mientras la
       unión estaba abajo, así que la Cruz salía por la Avemaría 6 de la 3ª. */
    const g = S.geometria(f, OPTS);
    const primera = lazo(g)[0];
    eq(primera.tipo, 'pater');
    eq(primera.decena, 1);
    const d = Math.hypot(primera.cx - g.union[0], primera.cy - g.union[1]);
    if (d > 0.5) throw new Error('la unión está a ' + d.toFixed(1) + ' u del Padrenuestro 1');
  });
});

ok('ninguna cuenta del lazo cae más cerca de la unión que el Padrenuestro 1', () => {
  S.FORMAS.forEach(f => {
    const g = S.geometria(f, OPTS);
    let mejor = -1, md = Infinity;
    lazo(g).forEach((c, i) => {
      const d = Math.hypot(c.cx - g.union[0], c.cy - g.union[1]);
      if (d < md) { md = d; mejor = i; }
    });
    if (mejor !== 0) throw new Error(f + ': la más cercana es la ' + mejor + ', no el Padrenuestro 1');
  });
});

ok('la Cruz queda por debajo de la última cuenta de la cola', () => {
  S.FORMAS.forEach(f => {
    const g = S.geometria(f, OPTS);
    const ultima = cola(g)[cola(g).length - 1];
    if (g.barras[0].y <= ultima.cy + ultima.r)
      throw new Error(f + ': la Cruz se monta sobre la última cuenta');
  });
});

console.log('\n── Cabe en un teléfono ──');

S.FORMAS.forEach(f => {
  ok(f.padEnd(9) + ' · sin solapes y con holgura visible', () => {
    const g = S.geometria(f, OPTS);
    const L = lazo(g);
    let min = Infinity, solapes = 0;
    for (let i = 0; i < L.length; i++) {
      const a = L[i], b = L[(i + 1) % L.length];
      const d = Math.hypot(a.cx - b.cx, a.cy - b.cy) - (a.r + b.r);
      if (d < min) min = d;
      if (d < 0) solapes++;
    }
    if (solapes) throw new Error(solapes + ' solape(s)');
    if (min * ESCALA < 1.2)
      throw new Error('holgura de ' + (min * ESCALA).toFixed(1) + ' px: se leería como una línea');
  });
});

S.FORMAS.forEach(f => {
  ok(f.padEnd(9) + ' · todo el dibujo cae dentro del viewBox', () => {
    const g = S.geometria(f, OPTS);
    const [W, H] = g.viewBox;
    g.cuentas.forEach(c => {
      if (c.cx - c.r < 0 || c.cx + c.r > W) throw new Error('cuenta ' + c.idx + ' se sale en x');
      if (c.cy - c.r < 0 || c.cy + c.r > H) throw new Error('cuenta ' + c.idx + ' se sale en y');
    });
    g.barras.forEach((k, i) => {
      if (k.x < 0 || k.x + k.w > W) throw new Error('barra ' + i + ' se sale en x');
      if (k.y < 0 || k.y + k.h > H) throw new Error('barra ' + i + ' se sale en y');
    });
  });
});

console.log('\n── Una sarta, dos escalas ──');

ok('decenas:1 da el decenario — aro de 11 y Cruz, sin cola', () => {
  /* El decenario es 10 Avemarías con su Padrenuestro y la Cruz colgando de él.
     La cola —Padrenuestro, 3 Avemarías, Padrenuestro— es de la camándula. */
  const g = S.geometria('circulo', Object.assign({}, OPTS, { decenas: 1 }));
  eq(lazo(g).length, 11);
  eq(cola(g).length, 0);
  eq(g.cuentas.length, 11);
  eq(lazo(g).filter(c => c.tipo === 'pater').length, 1);
});

ok('decenas:5 da la camándula — 55 en el lazo, 60 en total', () => {
  const g = S.geometria('circulo', Object.assign({}, OPTS, { decenas: 5 }));
  eq(lazo(g).length, 55);
  eq(g.cuentas.length, 60);
});

ok('la cola aparece a partir de dos decenas, y siempre igual', () => {
  const forma = d => cola(S.geometria('circulo', Object.assign({}, OPTS, { decenas: d }))).map(c => c.tipo);
  eq(forma(1), [], 'el decenario no lleva cola');
  const esperada = ['pater', 'ave', 'ave', 'ave', 'pater'];
  [2, 3, 4, 5].forEach(d => eq(forma(d), esperada, 'decenas ' + d));
});

ok('la opción cola se puede forzar en los dos sentidos', () => {
  eq(cola(S.geometria('circulo', Object.assign({}, OPTS, { decenas: 1, cola: true }))).length, 5);
  eq(cola(S.geometria('circulo', Object.assign({}, OPTS, { decenas: 5, cola: false }))).length, 0);
});

ok('el reparto va por distancia, no por parámetro', () => {
  /* En la gota hay curvas muy cerradas: si el reparto fuese por t del bezier,
     las cuentas se apelotonarían ahí y se abrirían en los tramos rectos. */
  const g = S.geometria('gota', OPTS);
  const L = lazo(g);
  const seps = [];
  for (let i = 1; i < L.length; i++) {
    if (L[i].tipo === 'ave' && L[i-1].tipo === 'ave')
      seps.push(Math.hypot(L[i].cx - L[i-1].cx, L[i].cy - L[i-1].cy));
  }
  const min = Math.min(...seps), max = Math.max(...seps);
  if (max / min > 1.15)
    throw new Error('separación entre Avemarías desigual: ' + min.toFixed(1) + '–' + max.toFixed(1) + ' u');
});

console.log('\n── El decenario tiene forma ──');

ok('la cuenta crece con las decenas: el mismo dibujo a otro zoom', () => {
  /* El trazado mide lo mismo siempre, pero el recorrido baja de 65 unidades a
     13. Sin escalar la cuenta, el decenario salía con 5 diámetros de aire
     —23 veces más que la camándula— y perdía la forma. */
  const c5 = S.geometria('circulo', Object.assign({}, OPTS, { decenas: 5 }));
  const c1 = S.geometria('circulo', Object.assign({}, OPTS, { decenas: 1 }));
  const r5 = lazo(c5)[1].r, r1 = lazo(c1)[1].r;
  if (!(r1 > r5 * 1.5))
    throw new Error('la cuenta del decenario no creció: ' + r1.toFixed(1) + ' vs ' + r5.toFixed(1));
});

function aire(g) {
  const L = lazo(g);
  let min = Infinity;
  for (let i = 0; i < L.length; i++) {
    const a = L[i], b = L[(i + 1) % L.length];
    min = Math.min(min, Math.hypot(a.cx - b.cx, a.cy - b.cy) - (a.r + b.r));
  }
  return min / (2 * L[1].r);            // holgura medida en diámetros de cuenta
}

ok('decenario y camándula tienen el mismo aire relativo', () => {
  const c5 = aire(S.geometria('circulo', Object.assign({}, OPTS, { decenas: 5 })));
  const c1 = aire(S.geometria('circulo', Object.assign({}, OPTS, { decenas: 1 })));
  if (Math.abs(c1 - c5) > 0.06)
    throw new Error('aire distinto: camándula ' + c5.toFixed(2) + ' vs decenario ' + c1.toFixed(2) + ' diámetros');
});

[1, 2, 3, 4, 5].forEach(d => {
  ok('decenas:' + d + ' · cabe entero, la Cruz incluida', () => {
    /* La Cruz del decenario acababa en y=571 sobre un lienzo de 300: ni la cola
       ni la Cruz se veían, y por eso parecían once puntos sueltos. */
    S.FORMAS.forEach(f => {
      const g = S.geometria(f, Object.assign({}, OPTS, { decenas: d }));
      const W = g.viewBox[0], H = g.viewBox[1];
      if (g.caja.x0 < -0.01 || g.caja.x1 > W + 0.01) throw new Error(f + ': se sale en x');
      if (g.caja.y0 < -0.01 || g.caja.y1 > H + 0.01)
        throw new Error(f + ': la Cruz llega a y=' + g.caja.y1.toFixed(0) + ' de ' + H);
    });
  });
});

ok('el decenario remata en Cruz, colgada del Padrenuestro', () => {
  S.FORMAS.forEach(f => {
    const g = S.geometria(f, Object.assign({}, OPTS, { decenas: 1 }));
    const pater = lazo(g)[0];
    if (g.barras[0].y <= pater.cy + pater.r)
      throw new Error(f + ': la Cruz se monta sobre el Padrenuestro de la unión');
    if (g.barras[0].h < 8) throw new Error(f + ': la Cruz quedó demasiado pequeña para verse');
    if (Math.abs(g.barras[0].x + g.barras[0].w / 2 - pater.cx) > 0.5)
      throw new Error(f + ': la Cruz no cuelga a plomo del Padrenuestro');
  });
});

ok('la camándula no se movió ni un punto', () => {
  /* El reencuadre solo actúa cuando decenas !== 5, y ahí el zoom vale 1. Estas
     coordenadas quedan fijadas para que un cambio futuro no la desplace. */
  const g = S.geometria('circulo', OPTS);
  eq(g.zoom, 1);
  eq(lazo(g)[1].r, 3);
  eq(+g.unidad.toFixed(3), 7.346);
  eq(lazo(g)[0].cx.toFixed(1) + ',' + lazo(g)[0].cy.toFixed(1), '100.0,168.0');
});

ok('caja describe lo que de verdad ocupa el dibujo', () => {
  const g  = S.geometria('circulo', Object.assign({}, OPTS, { decenas: 1 }));
  const c5 = S.geometria('circulo', OPTS);
  if (!(g.caja.h > g.caja.w))
    throw new Error('el decenario debería ser más alto que ancho: aro con la Cruz colgando');
  /* Ninguno de los dos se sale de la huella de la camándula. Con la Cruz ya
     pequeña, el decenario llena el mismo ancho —su aro es el que crece— y queda
     más bajo, porque no arrastra la cola. */
  if (g.caja.w > c5.caja.w + 0.01) throw new Error('el decenario se pasa de ancho');
  if (g.caja.h > c5.caja.h + 0.01) throw new Error('el decenario se pasa de alto');
  if (!(g.caja.h < c5.caja.h))
    throw new Error('sin cola, el decenario debería quedar más bajo que la camándula');
});

function anchoAro(g) {
  const L = lazo(g);
  return Math.max(...L.map(c => c.cx + c.r)) - Math.min(...L.map(c => c.cx - c.r));
}
function anclaCruz(g) {
  const C = cola(g);
  return C.length ? C[C.length - 1] : lazo(g)[0];
}

ok('la Cruz NO escala con el espaciado: escala con el aro', () => {
  /* La Cruz no es una cuenta, es el emblema que remata el objeto. Escalándola
     con la unidad, la del decenario salía tan alta como ancho es el aro
     —Cruz/aro 1,00 contra 0,23 en la camándula— y se leía como una Cruz con un
     aro colgando. Con el aro por vara queda acotada en las dos escalas. */
  S.FORMAS.forEach(f => {
    [1, 5].forEach(d => {
      const g = S.geometria(f, Object.assign({}, OPTS, { decenas: d }));
      const p = g.barras[0].h / anchoAro(g);
      if (p > 0.5)
        throw new Error(f + ' decenas:' + d + ' · Cruz/aro ' + p.toFixed(2) + ': la Cruz domina el objeto');
    });
  });
});

ok('la Cruz del decenario va al doble que la de la camándula', () => {
  /* Decisión de diseño, no inconsistencia: en la camándula la Cruz es un
     elemento entre sesenta cuentas y una cola; en el decenario es el único
     ornamento de un objeto simple, y a la proporción de la camándula se leía
     tímida. */
  S.FORMAS.forEach(f => {
    const g5 = S.geometria(f, Object.assign({}, OPTS, { decenas: 5 }));
    const g1 = S.geometria(f, Object.assign({}, OPTS, { decenas: 1 }));
    const razon = (g1.barras[0].h / anchoAro(g1)) / (g5.barras[0].h / anchoAro(g5));
    if (razon < 1.6 || razon > 2.1)
      throw new Error(f + ': el decenario lleva la Cruz ×' + razon.toFixed(2) + ', se esperaba ×2');
  });
});

ok('la Cruz del decenario se lee junto a la cuenta, sin aplastarla', () => {
  /* De referencia, en la columna del rezo la Lux mide 22 px junto a cuentas de
     16: razón 1,4. El decenario va algo por encima porque su Cruz va al doble. */
  const g = S.geometria('circulo', Object.assign({}, OPTS, { decenas: 1 }));
  const p = g.barras[0].h / (2 * lazo(g)[1].r);
  if (p < 1.2 || p > 3.5)
    throw new Error('Cruz/cuenta ' + p.toFixed(1) + ': fuera del registro de la app');
});

ok('el cordón mide lo mismo en las dos escalas', () => {
  /* Medido en unidades de espacio, el cordón del decenario dejaba medio aro de
     hilo desnudo: su unidad es cinco veces mayor. Se mide contra el aro. */
  S.FORMAS.forEach(f => {
    [1, 5].forEach(d => {
      const g = S.geometria(f, Object.assign({}, OPTS, { decenas: d }));
      const a = anclaCruz(g);
      const cordon = (g.barras[0].y - (a.cy + a.r)) / anchoAro(g);
      if (cordon < 0.03 || cordon > 0.11)
        throw new Error(f + ' decenas:' + d + ' · cordón ' + cordon.toFixed(3) + ' del aro');
    });
  });
});

ok('la Cruz de la camándula no se movió', () => {
  const g = S.geometria('circulo', OPTS);
  eq(+g.barras[0].h.toFixed(2), 36);
  eq(+g.barras[0].y.toFixed(1), 241.5);
});

console.log('\n── Para la animación ──');

ok('puntoEn(0) es la unión', () => {
  S.FORMAS.forEach(f => {
    const p = S.puntoEn(f, 0);
    const g = S.geometria(f, OPTS);
    const d = Math.hypot(p[0] - g.union[0], p[1] - g.union[1]);
    if (d > 0.5) throw new Error(f + ': arranca a ' + d.toFixed(1) + ' u de la unión');
  });
});

ok('puntoEn recorre el lazo sin saltos', () => {
  let prev = S.puntoEn('circulo', 0), maxSalto = 0;
  for (let i = 1; i <= 100; i++) {
    const p = S.puntoEn('circulo', i / 100);
    maxSalto = Math.max(maxSalto, Math.hypot(p[0] - prev[0], p[1] - prev[1]));
    prev = p;
  }
  /* Paso de 1/100 del perímetro (~478 u) → unos 4,8 u. Un salto mucho mayor
     delataría un tramo mal muestreado. */
  if (maxSalto > 7) throw new Error('salto de ' + maxSalto.toFixed(1) + ' u');
});

ok('puntoEn recorta fuera de rango en vez de romperse', () => {
  const a = S.puntoEn('circulo', -5), b = S.puntoEn('circulo', 0);
  eq(a.map(v => +v.toFixed(2)), b.map(v => +v.toFixed(2)));
  const c = S.puntoEn('circulo', 99);
  if (!isFinite(c[0]) || !isFinite(c[1])) throw new Error('devolvió NaN');
});

ok('cada cuenta sabe su decena: la animación puede escalonar por grupos', () => {
  const g = S.geometria('circulo', OPTS);
  eq(lazo(g)[0].decena, 1);
  eq(lazo(g)[11].decena, 2);
  eq(lazo(g)[54].decena, 5);
  eq(cola(g)[0].decena, null, 'la cola no pertenece a ninguna decena');
});

console.log('\n── El SVG ──');

ok('sale con 60 círculos y 2 barras', () => {
  const s = S.svg('circulo', OPTS);
  eq((s.match(/<circle/g) || []).length, 60);
  eq((s.match(/<rect/g) || []).length, 2);
});

ok('acepta color y por defecto hereda', () => {
  if (!/fill="#E8A0A0"/.test(S.svg('gota', { color: '#E8A0A0' })))
    throw new Error('no aplica el color pedido');
  if (!/fill="currentColor"/.test(S.svg('gota')))
    throw new Error('por defecto debería heredar del contexto');
});

console.log('\n── Codificación ──');

ok('sarta.js está en UTF-8 limpio', () => {
  /* rosaries.js y el demo del splash llegaron con UTF-8 leído como Latin-1
     ("CamÃ¡ndulas", "AvemarÃ­as", "ð¥"). Que no se cuele de nuevo. */
  const src = fs.readFileSync(path.join(RAIZ, 'sarta.js'), 'utf8');
  const sospechas = src.match(/Ã.|Â.|ð./g);
  if (sospechas) throw new Error('mojibake: ' + [...new Set(sospechas)].join(' '));
  if (!/geometría/.test(src)) throw new Error('los acentos no sobrevivieron');
});

console.log('\n' + '─'.repeat(64));
if (fallos) {
  console.log('  ✗ ' + fallos + ' fallo(s), ' + pasos + ' pasada(s)');
  console.log('─'.repeat(64) + '\n');
  process.exit(1);
}
console.log('  TODO VERDE — ' + pasos + ' pruebas');
console.log('─'.repeat(64) + '\n');
