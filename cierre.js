// ═══════════════════════════════════════════════════════════════════
// CruzAndo — el cierre de una sesión de rezo
// ═══════════════════════════════════════════════════════════════════
//
//   Cierre.decenario({ desde, color, titulo, metros })  → Promise
//   Cierre.rosario  ({ color, titulo, metros })         → Promise
//
// ── El decenario ───────────────────────────────────────────────────
// La columna del rezo se cierra en decenario: el mismo objeto que el
// usuario tuvo a la derecha toda la sesión, enrollado.
//   desde  →  Cuentas.instantanea(): 11 cuentas con su posición REAL en
//             pantalla, así el primer frame es idéntico al último de la
//             sesión y nadie ve un corte.
//   hasta  →  Sarta.geometria('circulo', {decenas:1}).
//
// ── El Rosario ─────────────────────────────────────────────────────
// Los cinco decenarios se desenrollan y se enlazan en la camándula. La
// correspondencia no hay que inventarla: el lazo son 55 = 5 x 11, y la
// cuenta i del decenario k es la cuenta k*11+i del lazo.
//
// ── Por qué CSS y no requestAnimationFrame ─────────────────────────
// Las trayectorias hay que generarlas —dependen de dónde está cada
// cuenta— pero se generan como @keyframes de `transform`, no como un
// bucle que escriba cx/cy. Así las mueve el compositor y no compiten con
// las escrituras a Firestore que ocurren en ese mismo momento.
//
// ── Encadena, no se apila ──────────────────────────────────────────
// Devuelven promesa, igual que RachaSplash.mostrarSiHay(). El epílogo
// sube DESPUÉS: `Cierre.decenario(...).then(abrirEpilogo)`.
(function () {
  'use strict';

  var HOJA_ID   = 'cierre-trayectorias';
  var T_NUCLEO  = 2500;   // decenario: hasta el reposo
  var T_ROSARIO = 3000;   // el Rosario tiene dos beats más: la cola y la Cruz
  var T_ROSETON = 3500;   // el cuaderno: el más raro de los tres, uno cada 20 Misterios
  var T_SALIDA  = 350;
  var REPOSO    = 1100;   // cuánto se sostiene el objeto antes de disolverse

  var enCurso = false;

  /* La sarta se dibuja en una caja centrada, dejando aire abajo para la
     palabra y los metros. */
  function encuadre(vw, vh, caja) {
    var k = Math.min((vw * 0.70) / caja.w, (vh * 0.52) / caja.h);
    return {
      k: k,
      x: vw / 2 - (caja.x0 + caja.w / 2) * k,
      y: vh * 0.44 - (caja.y0 + caja.h / 2) * k
    };
  }

  function estilos(css) {
    var st = document.getElementById(HOJA_ID);
    if (!st) {
      st = document.createElement('style');
      st.id = HOJA_ID;
      document.head.appendChild(st);
    }
    st.textContent = css;
  }

  var NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    var el = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) el.setAttribute(k, attrs[k]);
    return el;
  }

  function centro(rect) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, r: rect.width / 2 };
  }

  function lienzoDe(vw, vh) {
    return svgEl('svg', {
      'class': 'cierre-lienzo',
      viewBox: '0 0 ' + vw + ' ' + vh,
      preserveAspectRatio: 'none'
    });
  }

  function pieDe(titulo, metros, tarde, extra) {
    var suf = (tarde ? ' tarde' : '') + (extra ? ' ' + extra : '');
    var pie = document.createElement('div');
    pie.className = 'cierre-pie';
    var h = document.createElement('div');
    h.className = 'cierre-titulo' + suf;
    h.textContent = titulo;
    pie.appendChild(h);
    if (metros > 0) {
      var m = document.createElement('div');
      m.className = 'cierre-metros' + suf;
      m.textContent = '+' + Number(metros).toLocaleString('es-MX') + ' m';
      pie.appendChild(m);
    }
    return pie;
  }

  function haloDe(cx, cy, radio, clase) {
    var perim = 2 * Math.PI * radio;
    var halo = svgEl('circle', {
      'class': 'cierre-halo' + (clase ? ' ' + clase : ''),
      cx: cx.toFixed(2), cy: cy.toFixed(2), r: radio.toFixed(2),
      stroke: '#F3EAD8', 'stroke-width': 2.5
    });
    halo.style.strokeDasharray = perim.toFixed(1);
    halo.style.setProperty('--halo-largo', perim.toFixed(1));
    return halo;
  }

  /* El ejecutor. Lo comparten las dos animaciones para que las dos garanticen
     lo mismo: que un toque salte al final, que se limpien solas y que NUNCA
     dejen colgada a la navegación que espera detrás. */
  function correr(velo, nucleo) {
    document.body.appendChild(velo);
    return new Promise(function (resolver) {
      var timers = [], cerrado = false;

      function cerrar() {
        if (cerrado) return;
        cerrado = true;
        timers.forEach(clearTimeout);
        velo.classList.remove('dentro');
        velo.classList.add('fuera');
        setTimeout(function () {
          if (velo.parentNode) velo.parentNode.removeChild(velo);
          var st = document.getElementById(HOJA_ID);
          if (st && st.parentNode) st.parentNode.removeChild(st);
          enCurso = false;
          resolver(true);
        }, T_SALIDA);
      }

      // Un toque salta al objeto ya formado y sale. Nunca atrapa.
      velo.addEventListener('click', function () {
        if (cerrado) return;
        velo.classList.remove('anima');
        velo.classList.add('quieto');
        timers.forEach(clearTimeout);
        timers = [setTimeout(cerrar, 300)];
      });

      // Dos frames antes de animar: si no, las animaciones arrancan a medias.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          velo.classList.add('dentro', 'anima');
        });
      });

      timers.push(setTimeout(cerrar, nucleo + REPOSO));
      // Red de seguridad: la navegación que espera detrás nunca se cuelga.
      timers.push(setTimeout(cerrar, nucleo + REPOSO + T_SALIDA + 2000));
    });
  }

  /* ═══════════ El decenario ═══════════ */
  function decenario(opts) {
    opts = opts || {};
    if (enCurso || !window.Sarta) return Promise.resolve(false);
    enCurso = true;

    var vw = window.innerWidth, vh = window.innerHeight;
    var color = opts.color || '#E8A0A0';
    var g, enc;
    try {
      g = Sarta.geometria('circulo', { decenas: 1 });
      enc = encuadre(vw, vh, g.caja);
    } catch (e) { enCurso = false; return Promise.resolve(false); }

    var destino = g.cuentas.map(function (c) {
      return { x: enc.x + c.cx * enc.k, y: enc.y + c.cy * enc.k, r: c.r * enc.k };
    });
    var barras = g.barras.map(function (b) {
      return { x: enc.x + b.x * enc.k, y: enc.y + b.y * enc.k, w: b.w * enc.k, h: b.h * enc.k };
    });

    /* El origen: las cuentas reales de la sesión. Si no las hay —columna
       oculta, rect corrupto— el decenario aparece ya formado en vez de venir
       de ninguna parte. Degradar, no fingir. */
    var foto = opts.desde || null;
    var origen = null;
    if (foto && foto.cuentas && foto.cuentas.length === destino.length) {
      origen = foto.cuentas.map(function (c) { return c.rect ? centro(c.rect) : null; });
      if (origen.some(function (o) { return !o || !isFinite(o.x) || !isFinite(o.y); })) origen = null;
    }

    var velo = document.createElement('div');
    velo.className = 'cierre-velo';
    velo.setAttribute('role', 'status');
    var lienzo = lienzoDe(vw, vh);

    var cxA = destino.reduce(function (s, c) { return s + c.x; }, 0) / destino.length;
    var cyA = destino.reduce(function (s, c) { return s + c.y; }, 0) / destino.length;
    var reglas = [];

    destino.forEach(function (d, i) {
      var c = svgEl('circle', { cx: d.x.toFixed(2), cy: d.y.toFixed(2), r: d.r.toFixed(2), fill: color });
      if (origen) {
        var o = origen[i];
        var dx = o.x - d.x, dy = o.y - d.y;
        var esc = Math.max(0.05, o.r / d.r);

        /* Punto intermedio: la cuerda se comba hacia afuera al cerrarse. Sin
           esto cada cuenta viajaría recta y el gesto se leería mecánico en vez
           de como una sarta que se recoge. */
        var mx = (o.x + d.x) / 2, my = (o.y + d.y) / 2;
        var vx = mx - cxA, vy = my - cyA;
        var norma = Math.hypot(vx, vy) || 1;
        var comba = 0.12 * Math.hypot(dx, dy);
        var bx = mx + (vx / norma) * comba - d.x;
        var by = my + (vy / norma) * comba - d.y;

        reglas.push('@keyframes ci-c' + i + '{' +
          '0%{transform:translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(' + esc.toFixed(3) + ')}' +
          '55%{transform:translate(' + bx.toFixed(1) + 'px,' + by.toFixed(1) + 'px) scale(' + ((esc + 1) / 2).toFixed(3) + ')}' +
          '100%{transform:none}}');
        // 30 ms entre cuentas: la sarta se recoge, no se teletransporta.
        c.style.animation = 'ci-c' + i + ' .9s var(--ease-velo) ' + (0.55 + i * 0.03).toFixed(2) + 's both';
      }
      lienzo.appendChild(c);
    });

    /* La Cruz baja por el cordón con rebote. El péndulo es UNA oscilación: a
       2,5 segundos, dos se leen como temblor. */
    var luxOrigen = (foto && foto.lux && foto.lux.rect) ? centro(foto.lux.rect) : null;
    barras.forEach(function (b, i) {
      var r = svgEl('rect', {
        x: b.x.toFixed(2), y: b.y.toFixed(2),
        width: b.w.toFixed(2), height: b.h.toFixed(2), fill: '#F3EAD8'
      });
      if (origen) {
        var ox = luxOrigen ? luxOrigen.x - (b.x + b.w / 2) : 0;
        var oy = luxOrigen ? luxOrigen.y - (b.y + b.h / 2) : -40;
        reglas.push('@keyframes ci-x' + i + '{' +
          '0%{transform:translate(' + ox.toFixed(1) + 'px,' + oy.toFixed(1) + 'px) scale(.3);opacity:0}' +
          '45%{opacity:1}' +
          '70%{transform:translate(0,0) rotate(3.5deg);opacity:1}' +
          '100%{transform:none;opacity:1}}');
        r.style.animation = 'ci-x' + i + ' .55s var(--ease-rito) 1.45s both';
      }
      lienzo.appendChild(r);
    });

    if (origen) {
      var radio = destino.slice(0, 11).reduce(function (s, c) {
        return s + Math.hypot(c.x - cxA, c.y - cyA);
      }, 0) / 11;
      lienzo.appendChild(haloDe(cxA, cyA, radio));
      estilos(reglas.join('\n'));
    }

    velo.appendChild(lienzo);
    velo.appendChild(pieDe(opts.titulo || 'Misterio recorrido', opts.metros, false));
    return correr(velo, T_NUCLEO);
  }

  /* ═══════════ El Rosario ═══════════
     Cada decenario arranca ENROLLADO sobre el punto medio de su futuro arco,
     con el radio que le toca a 13 unidades de recorrido. Así las cinco sartas
     se leen como cinco decenarios de verdad, no como cinco manchas. */
  function rosario(opts) {
    opts = opts || {};
    if (enCurso || !window.Sarta) return Promise.resolve(false);
    enCurso = true;

    var vw = window.innerWidth, vh = window.innerHeight;
    var color = opts.color || '#E8A0A0';
    var g, enc;
    try {
      g = Sarta.geometria('circulo', { decenas: 5 });
      enc = encuadre(vw, vh, g.caja);
    } catch (e) { enCurso = false; return Promise.resolve(false); }

    var destino = g.cuentas.map(function (c) {
      return { x: enc.x + c.cx * enc.k, y: enc.y + c.cy * enc.k, r: c.r * enc.k,
               tipo: c.tipo, zona: c.zona, decena: c.decena };
    });
    var barras = g.barras.map(function (b) {
      return { x: enc.x + b.x * enc.k, y: enc.y + b.y * enc.k, w: b.w * enc.k, h: b.h * enc.k };
    });
    var lazo = destino.filter(function (c) { return c.zona === 'lazo'; });
    var cola = destino.filter(function (c) { return c.zona === 'cola'; });

    // Radio del aro de un decenario, a la escala de la camándula
    var rDec = 13 * (g.unidad * enc.k) / (2 * Math.PI);

    var centros = {};
    [1, 2, 3, 4, 5].forEach(function (d) {
      var gr = lazo.filter(function (c) { return c.decena === d; });
      if (!gr.length) return;
      centros[d] = {
        x: gr.reduce(function (s, c) { return s + c.x; }, 0) / gr.length,
        y: gr.reduce(function (s, c) { return s + c.y; }, 0) / gr.length
      };
    });

    var velo = document.createElement('div');
    velo.className = 'cierre-velo es-rosario';
    velo.setAttribute('role', 'status');
    var lienzo = lienzoDe(vw, vh);
    var reglas = [];
    var circulosLazo = [];

    lazo.forEach(function (d, i) {
      var k = (d.decena || 1) - 1;
      var pos = i % 11;
      var ctr = centros[d.decena] || { x: d.x, y: d.y };
      var ang = (pos / 11) * 2 * Math.PI - Math.PI / 2;
      var ox = ctr.x + rDec * Math.cos(ang);
      var oy = ctr.y + rDec * Math.sin(ang);

      var c = svgEl('circle', { cx: d.x.toFixed(2), cy: d.y.toFixed(2), r: d.r.toFixed(2), fill: color });
      reglas.push('@keyframes ci-r' + i + '{' +
        '0%{transform:translate(' + (ox - d.x).toFixed(1) + 'px,' + (oy - d.y).toFixed(1) + 'px) scale(.55);opacity:0}' +
        '18%{transform:translate(' + (ox - d.x).toFixed(1) + 'px,' + (oy - d.y).toFixed(1) + 'px) scale(1);opacity:1}' +
        '100%{transform:none;opacity:1}}');
      /* Escalonado en dos niveles: 90 ms entre decenas —entran de una en una,
         como se rezaron— y 12 ms dentro de cada una, para que el aro se abra
         en vez de estirarse de golpe. */
      c.style.animation = 'ci-r' + i + ' 1.1s var(--ease-velo) ' +
                          (0.05 + k * 0.09 + pos * 0.012).toFixed(3) + 's both';
      circulosLazo.push(c);
      lienzo.appendChild(c);
    });

    /* Los cinco Padrenuestros destellan al quedar en su juntura. Marcarlas es
       lo que hace legible que el lazo son cinco tramos y no un anillo suelto. */
    reglas.push('@keyframes ci-rp{0%,100%{transform:none}45%{transform:scale(1.55)}}');
    lazo.forEach(function (d, i) {
      if (d.tipo !== 'pater' || !circulosLazo[i]) return;
      circulosLazo[i].style.animation +=
        ', ci-rp .42s var(--ease-rito) ' + (1.20 + ((d.decena || 1) - 1) * 0.08).toFixed(2) + 's both';
    });

    // La cola desciende desde la unión
    reglas.push('@keyframes ci-rc{0%{transform:translateY(-14px) scale(.5);opacity:0}100%{transform:none;opacity:1}}');
    cola.forEach(function (d, i) {
      var c = svgEl('circle', { cx: d.x.toFixed(2), cy: d.y.toFixed(2), r: d.r.toFixed(2), fill: color });
      c.style.animation = 'ci-rc .4s var(--ease-rito) ' + (1.45 + i * 0.07).toFixed(2) + 's both';
      lienzo.appendChild(c);
    });

    /* La Cruz sube desde debajo del encuadre y toma su sitio al final de la
       cola. Es la última en llegar, y su llegada dispara el resplandor: de ahí
       su carácter de sello. */
    var subida = Math.max(60, vh - barras[0].y + 40);
    reglas.push('@keyframes ci-rx{0%{transform:translateY(' + subida.toFixed(0) + 'px) scale(.6);opacity:0}' +
                '35%{opacity:1}100%{transform:none;opacity:1}}');
    barras.forEach(function (b) {
      var r = svgEl('rect', {
        x: b.x.toFixed(2), y: b.y.toFixed(2),
        width: b.w.toFixed(2), height: b.h.toFixed(2), fill: '#F3EAD8'
      });
      r.style.animation = 'ci-rx .6s var(--ease-velo) 1.95s both';
      lienzo.appendChild(r);
    });

    var cxA = lazo.reduce(function (s, c) { return s + c.x; }, 0) / lazo.length;
    var cyA = lazo.reduce(function (s, c) { return s + c.y; }, 0) / lazo.length;
    var radio = lazo.reduce(function (s, c) { return s + Math.hypot(c.x - cxA, c.y - cyA); }, 0) / lazo.length;
    lienzo.appendChild(haloDe(cxA, cyA, radio, 'halo-rosario'));

    estilos(reglas.join('\n'));
    velo.appendChild(lienzo);
    velo.appendChild(pieDe(opts.titulo || 'Rosario recorrido', opts.metros, true));
    return correr(velo, T_ROSARIO);
  }

  /* ═══════════ El Rosetón ═══════════
     El cierre del cuaderno NO es una sarta. Se cambia de material: de objetos
     en una cuerda a LUZ ATRAVESANDO COLOR. Y el nombre lo da el propio Rosario
     — un rosetón es la rosa de piedra y vidrio de las catedrales, la misma raíz.

     Dos materiales, y los dos salen de datos que ya existen:
       · el VIDRIO  = los cuatro colores de bloque. Los cuatro Rosarios rezados
                      son los cuatro paños del vitral.
       · la PIEDRA  = tema.paleta del cuaderno. Como cada Mundo tiene la suya,
                      el rosetón sale distinto en los siete con un componente.

     Veinte pétalos = veinte Misterios. Se dibujan los veinte desde el principio
     pero entran agrupados de cinco en cinco, así que se leen como cuatro cuñas;
     lo que los separa en veinte es la tracería que llega después. Así no hay que
     transformar trazados: solo aparecen los nervios. */
  function roseton(opts) {
    opts = opts || {};
    if (enCurso || typeof document === 'undefined') return Promise.resolve(false);
    enCurso = true;

    var vw = window.innerWidth, vh = window.innerHeight;
    var pal = opts.paleta || {};
    var piedra = pal.soft || pal.base || '#F3EAD8';
    var luz    = pal.light || pal.mist || '#F3EAD8';
    var vidrio = opts.colores && opts.colores.length === 4
                 ? opts.colores
                 : ['#E8A0A0', '#01BBE1', '#C0392B', '#D4A017'];

    var cx = vw / 2, cy = vh * 0.42;
    var R  = Math.min(vw * 0.40, vh * 0.30);

    var velo = document.createElement('div');
    velo.className = 'cierre-velo es-roseton';
    velo.setAttribute('role', 'status');
    if (pal.ultra) velo.style.setProperty('--ci-noche-cuaderno', pal.ultra);

    var lienzo = lienzoDe(vw, vh);
    var reglas = [];

    /* ── La luz atraviesa ──
       El vitral se enciende por detrás y proyecta hacia afuera del encuadre:
       el color cayendo sobre el suelo de la nave. Va lo PRIMERO al lienzo para
       quedar detrás del vidrio: así no hace falta insertBefore. */
    reglas.push('@keyframes ci-ro-luz{' +
      '0%{transform:scale(.75);opacity:0}' +
      '55%{opacity:.5}' +
      '100%{transform:scale(1.9);opacity:0}}');
    var resplandor = svgEl('circle', {
      cx: (vw / 2).toFixed(2), cy: (vh * 0.42).toFixed(2),
      r: Math.min(vw * 0.40, vh * 0.30).toFixed(2), fill: luz, opacity: '0'
    });
    resplandor.style.transformOrigin = (vw / 2).toFixed(1) + 'px ' + (vh * 0.42).toFixed(1) + 'px';
    resplandor.style.transformBox = 'view-box';
    resplandor.style.animation = 'ci-ro-luz .8s var(--ease-velo) 2.20s both';
    lienzo.appendChild(resplandor);

    function punto(ang, r) {
      return [(cx + r * Math.cos(ang)).toFixed(2), (cy + r * Math.sin(ang)).toFixed(2)];
    }

    /* ── Los veinte pétalos ──
       Entran de cinco en cinco: mientras no hay tracería se leen como las
       cuatro cuñas de los cuatro bloques. */
    reglas.push('@keyframes ci-ro-cuna{' +
      '0%{transform:rotate(-14deg) scale(.72);opacity:0}' +
      '100%{transform:none;opacity:1}}');

    for (var i = 0; i < 20; i++) {
      var a0 = (i / 20) * 2 * Math.PI - Math.PI / 2;
      var a1 = ((i + 1) / 20) * 2 * Math.PI - Math.PI / 2;
      var p0 = punto(a0, R), p1 = punto(a1, R);
      var d = 'M' + cx.toFixed(2) + ' ' + cy.toFixed(2) +
              'L' + p0[0] + ' ' + p0[1] +
              'A' + R.toFixed(2) + ' ' + R.toFixed(2) + ' 0 0 1 ' + p1[0] + ' ' + p1[1] + 'Z';
      var petalo = svgEl('path', { d: d, fill: vidrio[Math.floor(i / 5)], opacity: '.88' });
      petalo.style.transformOrigin = cx.toFixed(1) + 'px ' + cy.toFixed(1) + 'px';
      petalo.style.transformBox = 'view-box';
      // 140 ms entre bloques: los cuatro Rosarios entran de uno en uno.
      petalo.style.animation = 'ci-ro-cuna .7s var(--ease-velo) ' +
                               (0.25 + Math.floor(i / 5) * 0.14).toFixed(2) + 's both';
      lienzo.appendChild(petalo);
    }

    /* ── La tracería ──
       La piedra llega DESPUÉS del vidrio: primero la luz, luego la forma. Se
       dibuja del centro hacia afuera con stroke-dasharray.
         · los cuatro nervios mayores y el aro exterior, primero
         · los dieciséis menores después: eso es la rosa abriéndose de cuatro
           cuñas a veinte pétalos. */
    reglas.push('@keyframes ci-ro-traza{from{stroke-dashoffset:var(--traza)}to{stroke-dashoffset:0}}');

    for (var j = 0; j < 20; j++) {
      var ang = (j / 20) * 2 * Math.PI - Math.PI / 2;
      var pe = punto(ang, R);
      var mayor = (j % 5 === 0);
      var nervio = svgEl('line', {
        x1: cx.toFixed(2), y1: cy.toFixed(2), x2: pe[0], y2: pe[1],
        stroke: piedra, 'stroke-width': mayor ? 2.4 : 1.3, 'stroke-linecap': 'round'
      });
      nervio.style.strokeDasharray = R.toFixed(1);
      nervio.style.setProperty('--traza', R.toFixed(1));
      nervio.style.animation = 'ci-ro-traza .5s var(--ease-velo) ' +
        (mayor ? (1.10 + (j / 5) * 0.07) : (1.70 + (j % 5) * 0.04)).toFixed(2) + 's both';
      lienzo.appendChild(nervio);
    }

    var aro = svgEl('circle', {
      cx: cx.toFixed(2), cy: cy.toFixed(2), r: R.toFixed(2),
      fill: 'none', stroke: piedra, 'stroke-width': 2.8
    });
    var perim = 2 * Math.PI * R;
    aro.style.strokeDasharray = perim.toFixed(1);
    aro.style.setProperty('--traza', perim.toFixed(1));
    aro.style.animation = 'ci-ro-traza .8s var(--ease-velo) 1.15s both';
    lienzo.appendChild(aro);

    /* ── El óculo ──
       La Lux ocupa el centro de la rosa hasta ser lo único plenamente luminoso. */
    reglas.push('@keyframes ci-ro-oculo{' +
      '0%{transform:scale(.2);opacity:0}' +
      '60%{transform:scale(1.12);opacity:1}' +
      '100%{transform:none;opacity:1}}');
    var lado = R * 0.34, grosor = lado * 0.19;
    [[cx - grosor / 2, cy - lado / 2, grosor, lado],
     [cx - lado / 2, cy - grosor / 2 - lado * 0.08, lado, grosor]].forEach(function (b) {
      var r = svgEl('rect', {
        x: b[0].toFixed(2), y: b[1].toFixed(2),
        width: b[2].toFixed(2), height: b[3].toFixed(2), fill: '#F3EAD8'
      });
      r.style.transformOrigin = cx.toFixed(1) + 'px ' + cy.toFixed(1) + 'px';
      r.style.transformBox = 'view-box';
      r.style.animation = 'ci-ro-oculo .6s var(--ease-rito) 2.80s both';
      lienzo.appendChild(r);
    });

    estilos(reglas.join('\n'));
    velo.appendChild(lienzo);
    velo.appendChild(pieDe(opts.titulo || 'Cuaderno recorrido', opts.metros, true, 'muy-tarde'));
    return correr(velo, T_ROSETON);
  }

  /* ¿Se rezó la decena entera? El decenario es la imagen de una decena rezada,
     no de una columna a medias. Se miran dos cosas:

     1. La Cruz encendida — Cuentas la enciende justo al pasar la última
        ventana del rezo, así que es la firma de la decena cerrada.
     2. Que la columna TENGA SITIO en pantalla. Una columna escondida devuelve
        rects en cero, y de ahí salió el artefacto de las cuentas volando desde
        la esquina (0,0): la Cruz heredada del Misterio anterior dejaba pasar
        la guarda mientras la geometría ya no existía. La regla del cierre es
        que ante la duda NO se anima; animar mal es peor que no animar.

     Cada página decide con esto si el cierre está justificado. */
  function decenaCompleta(foto) {
    if (!(foto && foto.cuentas && foto.cuentas.length === 11 &&
          foto.lux && foto.lux.visible === true)) return false;

    var caja = foto.rect;
    if (!caja || !(caja.width > 0) || !(caja.height > 0)) return false;

    // Once cuentas apiladas una sobre otra no son una columna.
    var a = foto.cuentas[0].rect, z = foto.cuentas[10].rect;
    if (!a || !z) return false;
    if (!(Math.abs(a.left - z.left) > 0 || Math.abs(a.top - z.top) > 0)) return false;

    return true;
  }

  window.Cierre = {
    decenario:      decenario,
    rosario:        rosario,
    roseton:        roseton,
    decenaCompleta: decenaCompleta,
    enCurso:        function () { return enCurso; },
    _T:             { nucleo: T_NUCLEO, rosario: T_ROSARIO, roseton: T_ROSETON,
                      salida: T_SALIDA, reposo: REPOSO }
  };
}());
