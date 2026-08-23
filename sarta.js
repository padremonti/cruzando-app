// ═══════════════════════════════════════════════════════════════════
// CruzAndo — geometría de la sarta (decenario y camándula)
// ═══════════════════════════════════════════════════════════════════
//
// UNA SARTA, DOS ESCALAS. El mismo objeto parametrizado por el número
// de decenas: `decenas:1` da el decenario que cierra un Misterio,
// `decenas:5` da la camándula del Rosario completo. No hay dos
// geometrías que mantener.
//
//   decenas:1 →  1 Padrenuestro + 10 Avemarías + Cruz         = 11
//   decenas:5 →  5 Padrenuestros + 50 Avemarías + cola + Cruz  = 60
//
// ── La cola es de la camándula ─────────────────────────────────────
// Bajando desde la unión: Padrenuestro, 3 Avemarías, Padrenuestro y la
// Cruz. Los dos Padrenuestros son los de la camándula tradicional; el
// segundo (el que toca la Cruz) faltaba en el boceto original.
//
// El DECENARIO no lleva cola: es el aro de diez Avemarías con su
// Padrenuestro, y de ese Padrenuestro cuelga la Cruz.
//
// ── Espaciado ──────────────────────────────────────────────────────
// Una regla para todo: espacio DOBLE junto a un Padrenuestro, espacio
// SENCILLO entre Avemarías. De ahí salen tanto el lazo como la cola.
//
// ── Solo geometría ─────────────────────────────────────────────────
// No toca el DOM ni pinta nada: devuelve coordenadas. Así se prueba
// entera en node, y la animación puede interpolar posiciones sin
// depender de cómo se dibujen. Mismo criterio que racha.js.
//
//   Sarta.geometria('circulo', { decenas: 5 })  → { cuentas, barras, … }
//   Sarta.svg('gota', { color: '#E8A0A0' })     → string SVG
//   Sarta.puntoEn('circulo', 0.5)               → punto a media vuelta
(function () {
  'use strict';

  var VIEWBOX = [200, 300];

  var TRAZOS = {
    /* Lazo circular. Arranca ABAJO, en la unión de la que cuelga la cola, y
       gira en sentido horario. El boceto original arrancaba arriba mientras la
       unión estaba abajo: la Cruz salía a 180 grados del primer Padrenuestro,
       por mitad de la tercera decena. */
    circulo:  { circulo: [100, 92, 76], union: [100, 168] },

    // Lazo en gota — el más holgado de los tres; se lee como camándula colgada.
    gota: {
      segs: [
        [[100,170],[34,150],[10,80],[26,42]],
        [[26,42],[42,6],[158,6],[174,42]],
        [[174,42],[190,80],[166,150],[100,170]]
      ],
      union: [100, 170]
    },

    // Lazo caprichoso — irregular a propósito, como dejado sobre una mesa.
    capricho: {
      segs: [
        [[100,158],[42,150],[12,112],[30,80]],
        [[30,80],[46,50],[32,30],[72,24]],
        [[72,24],[112,18],[118,52],[150,42]],
        [[150,42],[184,32],[190,92],[160,108]],
        [[160,108],[136,122],[156,144],[100,158]]
      ],
      union: [100, 158]
    }
  };

  var FORMAS = Object.keys(TRAZOS);

  /* La cola es de la CAMÁNDULA, no de la sarta en general: Padrenuestro, tres
     Avemarías y Padrenuestro, bajando desde la unión. El DECENARIO no la lleva
     —es aro y Cruz, nada más— así que la Cruz le cuelga directamente del
     Padrenuestro de la unión.

     Offsets en unidades de espacio: doble junto a un Padrenuestro, sencillo
     entre Avemarías. La misma regla que el lazo. */
  var COLA = {
    cuentas: [
      { o: 2, tipo: 'pater' },
      { o: 4, tipo: 'ave'   },
      { o: 5, tipo: 'ave'   },
      { o: 6, tipo: 'ave'   },
      { o: 8, tipo: 'pater' }
    ],
    cruz: 10,      // con cola: dos unidades tras el último Padrenuestro

    /* Sin cola, el cordón NO se mide en unidades de espacio. La unidad del
       decenario es cinco veces mayor, así que dos unidades dejaban medio aro
       de hilo desnudo colgando. Se mide contra el aro: la misma proporción
       que la camándula tiene entre su último Padrenuestro y su Cruz. */
    cordon: 0.065,

    /* La Cruz del decenario va al doble que la de la camándula. No es una
       inconsistencia: en la camándula la Cruz es un elemento entre sesenta
       cuentas y una cola, mientras que en el decenario es el ÚNICO ornamento
       de un objeto simple, y a la proporción de la camándula se leía tímida. */
    cruzDecenario: 2
  };

  function bezier(s, t) {
    var u = 1 - t;
    return [
      u*u*u*s[0][0] + 3*u*u*t*s[1][0] + 3*u*t*t*s[2][0] + t*t*t*s[3][0],
      u*u*u*s[0][1] + 3*u*u*t*s[1][1] + 3*u*t*t*s[2][1] + t*t*t*s[3][1]
    ];
  }

  function muestrear(def) {
    var pts = [], i, k;
    if (def.circulo) {
      var cx = def.circulo[0], cy = def.circulo[1], r = def.circulo[2];
      for (i = 0; i <= 360; i++) {
        var t = i * Math.PI / 180;
        pts.push([cx - r * Math.sin(t), cy + r * Math.cos(t)]);
      }
      return pts;
    }
    for (i = 0; i < def.segs.length; i++) {
      for (k = (i === 0 ? 0 : 1); k <= 90; k++) pts.push(bezier(def.segs[i], k / 90));
    }
    return pts;
  }

  // Longitudes acumuladas: sin esto el reparto saldría por parámetro y no por
  // distancia, y las cuentas se apelotonarían en las curvas cerradas.
  function acumular(pts) {
    var cum = [0];
    for (var i = 1; i < pts.length; i++) {
      cum.push(cum[i-1] + Math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]));
    }
    return cum;
  }

  function enDistancia(pts, cum, d) {
    var total = cum[cum.length - 1];
    d = Math.max(0, Math.min(total, d));
    var i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    var seg = cum[i] - cum[i-1] || 1;
    var f = (d - cum[i-1]) / seg;
    return [pts[i-1][0] + (pts[i][0] - pts[i-1][0]) * f,
            pts[i-1][1] + (pts[i][1] - pts[i-1][1]) * f];
  }

  /* Offsets del lazo. Cada decena: Padrenuestro, doble espacio, 10 Avemarías a
     espacio sencillo, doble espacio de cierre. */
  function offsetsLazo(decenas) {
    var offsets = [], p = 0, d, i;
    for (d = 0; d < decenas; d++) {
      offsets.push({ o: p, tipo: 'pater', decena: d + 1 });
      p += 2;
      for (i = 0; i < 10; i++) {
        offsets.push({ o: p, tipo: 'ave', decena: d + 1, ave: i + 1 });
        if (i < 9) p += 1;
      }
      p += 2;
    }
    return { offsets: offsets, span: p };
  }

  function barrasCruz(x, arriba, s) {
    var w = 9 * s, h = 48 * s, brazoW = 32 * s, brazoH = 9 * s;
    return [
      { x: x - w / 2,      y: arriba,          w: w,      h: h },
      { x: x - brazoW / 2, y: arriba + 13 * s, w: brazoW, h: brazoH }
    ];
  }

  /* Recorrido de referencia: el de 5 decenas. Todo lo demás se mide contra él. */
  var SPAN_REF = offsetsLazo(5).span;   // 65

  // Ancho que ocupa el lazo: sirve de vara para medir lo que no es cuenta.
  function anchoLazo(cuentas) {
    var x0 = Infinity, x1 = -Infinity;
    cuentas.forEach(function (c) {
      if (c.zona !== 'lazo') return;
      x0 = Math.min(x0, c.cx - c.r); x1 = Math.max(x1, c.cx + c.r);
    });
    return x1 - x0;
  }

  function crudo(def, decenas, r, rPater, cs, conCola) {
    var pts = muestrear(def);
    var cum = acumular(pts);
    var lazo = offsetsLazo(decenas);
    var unidad = cum[cum.length - 1] / lazo.span;

    var cuentas = lazo.offsets.map(function (c, i) {
      var p = enDistancia(pts, cum, c.o * unidad);
      return {
        idx: i, cx: p[0], cy: p[1],
        r: c.tipo === 'pater' ? rPater : r,
        tipo: c.tipo, zona: 'lazo', decena: c.decena, ave: c.ave || null
      };
    });

    var ux = def.union[0], uy = def.union[1];
    if (conCola) {
      COLA.cuentas.forEach(function (c) {
        cuentas.push({
          idx: cuentas.length, cx: ux, cy: uy + c.o * unidad,
          r: c.tipo === 'pater' ? rPater : r,
          tipo: c.tipo, zona: 'cola', decena: null, ave: null
        });
      });
    }

    /* Con cola, la Cruz va dos unidades tras el último Padrenuestro. Sin ella,
       cuelga del Padrenuestro de la unión a una fracción del aro. */
    var arribaCruz = conCola
      ? uy + COLA.cruz * unidad
      : uy + rPater + COLA.cordon * anchoLazo(cuentas);

    return {
      cuentas: cuentas,
      barras:  barrasCruz(ux, arribaCruz, cs),
      unidad:  unidad,
      largo:   cum[cum.length - 1],
      span:    lazo.span,
      union:   [ux, uy]
    };
  }

  // Caja que ocupa el dibujo entero: cuentas con su radio, y las barras de la Cruz.
  function caja(g) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    g.cuentas.forEach(function (c) {
      x0 = Math.min(x0, c.cx - c.r); x1 = Math.max(x1, c.cx + c.r);
      y0 = Math.min(y0, c.cy - c.r); y1 = Math.max(y1, c.cy + c.r);
    });
    g.barras.forEach(function (k) {
      x0 = Math.min(x0, k.x); x1 = Math.max(x1, k.x + k.w);
      y0 = Math.min(y0, k.y); y1 = Math.max(y1, k.y + k.h);
    });
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0,
             cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  function escalar(g, k, cx, cy, ncx, ncy) {
    g.cuentas.forEach(function (c) {
      c.cx = ncx + (c.cx - cx) * k;
      c.cy = ncy + (c.cy - cy) * k;
      c.r *= k;
    });
    g.barras.forEach(function (b) {
      b.x = ncx + (b.x - cx) * k;
      b.y = ncy + (b.y - cy) * k;
      b.w *= k; b.h *= k;
    });
    g.union = [ncx + (g.union[0] - cx) * k, ncy + (g.union[1] - cy) * k];
    g.unidad *= k;
    return g;
  }

  function geometria(forma, opts) {
    opts = opts || {};
    var def = TRAZOS[forma];
    if (!def) throw new Error('forma desconocida: ' + forma);

    var r       = opts.radio       != null ? opts.radio       : 3;
    var ep      = opts.escalaPater != null ? opts.escalaPater : 1.45;
    var cs      = opts.escalaCruz  != null ? opts.escalaCruz  : 0.75;
    var decenas = opts.decenas     != null ? opts.decenas     : 5;
    /* La cola solo tiene sentido en la camándula. Un decenario es aro y Cruz. */
    var conCola = opts.cola != null ? opts.cola : decenas > 1;

    var lazo = offsetsLazo(decenas);

    /* ── Por qué la cuenta crece con las decenas ────────────────────────────
       El trazado mide lo mismo siempre, pero el recorrido baja de 65 unidades
       a 13 al pasar de la camándula al decenario: la unidad de espacio crece
       ×5. Con la cuenta fija en radio 3, el decenario salía con 5 diámetros de
       aire entre cuenta y cuenta —23 veces más que la camándula— y perdía la
       forma; y la cola, estirada por esa misma unidad, dejaba la Cruz muy por
       debajo del lienzo.

       El decenario no es otro dibujo: es el MISMO a otro zoom. Por eso la
       cuenta y la Cruz se escalan con la unidad. El factor es exacto y no
       depende de la forma: 65 / recorrido. */
    var zoom = SPAN_REF / lazo.span;

    /* La cuenta escala con la unidad; la CRUZ NO. No es una cuenta: es el
       emblema que remata el objeto, así que su tamaño va con el aro. Escalándola
       con la unidad, la Cruz del decenario salía tan alta como ancho es el aro
       (Cruz/aro 1,00 contra 0,23 en la camándula). Con el aro por vara queda en
       0,20 —igual que la camándula— y en 1,2 diámetros de cuenta, que es la
       misma proporción que la Lux ya tiene en la columna del rezo. */
    var g = crudo(def, decenas, r * zoom, r * ep * zoom,
                  cs * (conCola ? 1 : COLA.cruzDecenario), conCola);

    /* Ya con las proporciones bien, el dibujo se reencuadra para ocupar la
       misma huella que la camándula. A 5 decenas el factor es 1: la camándula
       no se mueve ni un punto. */
    if (opts.ajustar !== false && decenas !== 5) {
      var ref = caja(crudo(def, 5, r, r * ep, cs, true));
      var act = caja(g);
      var k = Math.min(ref.w / act.w, ref.h / act.h);
      escalar(g, k, act.cx, act.cy, ref.cx, ref.cy);
    }

    g.viewBox = VIEWBOX.slice();
    g.zoom = zoom;
    /* Caja que ocupa el dibujo de verdad. El decenario es estrecho y alto —un
       aro pequeño con la cola larga— así que ocupa un tercio del ancho del
       lienzo: quien lo pinte solo puede recortar con esto. */
    g.caja = caja(g);
    return g;
  }

  /* Para la animación: un punto del lazo por fracción de recorrido (0-1). Es lo
     que permite interpolar una cuenta desde la columna recta hasta su sitio en
     el lazo sin recalcular la geometría en cada frame. */
  function puntoEn(forma, fraccion) {
    var def = TRAZOS[forma];
    if (!def) throw new Error('forma desconocida: ' + forma);
    var pts = muestrear(def);
    var cum = acumular(pts);
    return enDistancia(pts, cum, Math.max(0, Math.min(1, fraccion)) * cum[cum.length - 1]);
  }

  function svg(forma, opts) {
    opts = opts || {};
    var g = geometria(forma, opts);
    var color = opts.color || 'currentColor';
    var n = function (v) { return +v.toFixed(2); };
    var partes = g.cuentas.map(function (b) {
      return '<circle cx="' + n(b.cx) + '" cy="' + n(b.cy) + '" r="' + n(b.r) + '"/>';
    }).concat(g.barras.map(function (k) {
      return '<rect x="' + n(k.x) + '" y="' + n(k.y) + '" width="' + n(k.w) + '" height="' + n(k.h) + '"/>';
    }));
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
           VIEWBOX[0] + ' ' + VIEWBOX[1] + '" fill="' + color + '">' +
           partes.join('') + '</svg>';
  }

  window.Sarta = {
    FORMAS:    FORMAS,
    TRAZOS:    TRAZOS,
    geometria: geometria,
    puntoEn:   puntoEn,
    svg:       svg,
    VIEWBOX:   VIEWBOX
  };
}());
