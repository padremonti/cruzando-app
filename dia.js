// ═══════════════════════════════════════════════════════════════════
// CruzAndo — el día manda: los Misterios que la Iglesia reza hoy
// ═══════════════════════════════════════════════════════════════════
//
// El Nivel en curso se cruza al ritmo de la devoción, no al del usuario:
//
//   lunes y sábado   gozosos      martes y viernes  dolorosos
//   miércoles y dom. gloriosos    jueves            luminosos
//
// De ahí salen solas dos cosas que no hay que programar:
//
//   · LA SEMANA. Los Luminosos caen SOLO en jueves, así que una vuelta del
//     Nivel solo puede cerrarse un jueves. En régimen, cada Nivel dura de
//     viernes a jueves: siete días exactos. No hace falta un temporizador —
//     basta con no auto-avanzar.
//   · EL DESCANSO. Tres días de cada siete el bloque del día ya está rezado.
//     No son días perdidos: son la vuelta, que es donde vive la costumbre.
//
// Y dos reglas que sí son decisión de producto:
//
//   · EL DÍA ABRE, NUNCA CIERRA. El bloque cuyo día pasó y quedó pendiente
//     sigue disponible. Sin esto, quien solo reza en fin de semana nunca
//     alcanzaría los Luminosos y no cerraría un Nivel jamás.
//   · UN ROSARIO AL DÍA. Elegido un bloque, ese es el de hoy. Los demás
//     esperan a mañana. Un Rosario son cinco Misterios, no veinte.
//
// El mapeo llevaba escrito desde hace meses en audio.html como DAY_BLOCKS,
// dentro de renderAudioHome(), que no la llama nadie: era correcto y estaba
// muerto. Aquí es el origen único, como bloques.js lo es del color.
//
// Lógica pura: sin red, sin SDK, sin DOM, y con la fecha INYECTABLE para que
// los siete días se puedan probar sin tocar el reloj. Cada página hace su E/S.
(function () {
  'use strict';

  var BLOQUES = ['gozosos', 'luminosos', 'dolorosos', 'gloriosos'];

  // domingo = 0, como Date.getDay()
  var POR_DIA = {
    0: 'gloriosos', 1: 'gozosos',  2: 'dolorosos', 3: 'gloriosos',
    4: 'luminosos', 5: 'dolorosos', 6: 'gozosos'
  };

  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  function _p2(n) { return (n < 10 ? '0' : '') + n; }

  /* La clave del día es la fecha LOCAL, no un sello de 24 horas: el día
     litúrgico cambia a medianoche. Misma forma que getTodayKey() de
     plan-utils, para que las dos hablen el mismo idioma. */
  function clave(f) {
    f = f || new Date();
    return f.getFullYear() + '-' + _p2(f.getMonth() + 1) + '-' + _p2(f.getDate());
  }

  function bloqueDeHoy(f) {
    return POR_DIA[(f || new Date()).getDay()];
  }

  function nombreDelDia(f) {
    return DIAS[(f || new Date()).getDay()];
  }

  /* El próximo día en que ese bloque vuelve a ser el del día. Se dice el día
     concreto —"disponible jueves"— y no la lista de sus días, que en los
     bloques de dos días se lee como una tabla y no como una respuesta. */
  function proximoDia(bloque, f) {
    var d0 = (f || new Date()).getDay();
    for (var k = 1; k <= 7; k++) {
      var d = (d0 + k) % 7;
      if (POR_DIA[d] === bloque) return DIAS[d];
    }
    return '';
  }

  function _fecha(s) {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var p = s.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  /* Qué bloques han tenido ya su día DENTRO de la vuelta en curso. Se deduce
     de una sola fecha —cuándo empezó la vuelta— en vez de llevar una lista
     que habría que mantener a mano y que se desincronizaría a la primera. */
  function diasPasados(desde, f) {
    var hoy  = f || new Date();
    var ini  = _fecha(desde);
    var out  = {};
    if (!ini || ini > hoy) { out[bloqueDeHoy(hoy)] = true; return _claves(out); }

    var dias = Math.floor((hoy - ini) / 86400000);
    if (dias >= 6) return BLOQUES.slice();          // una semana entera: todos

    var d = new Date(ini.getTime());
    for (var i = 0; i <= dias; i++) {
      out[POR_DIA[d.getDay()]] = true;
      d.setDate(d.getDate() + 1);
    }
    return _claves(out);
  }

  function _claves(o) {
    return BLOQUES.filter(function (b) { return !!o[b]; });
  }

  /* Las decenas REZADAS de este bloque en la vuelta en curso. Se lee `vuelta`
     y NO `progress`: en la segunda vuelta progress ya está lleno —los veinte
     se cruzaron hace semanas— y daría siempre "nada pendiente". Es también
     de aquí de donde sale el punto de retoma del mismo día. */
  function _vueltaDe(doc, bloque) {
    var v = doc && doc.vuelta && doc.vuelta[bloque];
    return (Array.isArray(v) && v.length === 5) ? v : [null, null, null, null, null];
  }

  function hechos(doc, bloque) {
    return _vueltaDe(doc, bloque).filter(Boolean).length;
  }

  /* El primer hueco del bloque: dónde retoma quien dejó la sesión a medias.
     No hace falta guardar un marcador — cada Misterio se anota al cerrarse. */
  function primerPendiente(doc, bloque) {
    var v = _vueltaDe(doc, bloque);
    for (var i = 0; i < 5; i++) if (!v[i]) return i;
    return 0;
  }

  function nivelCompleto(doc) {
    return BLOQUES.every(function (b) { return hechos(doc, b) === 5; });
  }

  /* El bloque comprometido para HOY, si lo hay. Una vez elegido, es el
     Rosario del día: los demás esperan a mañana. Caduca a medianoche por
     comparación de fechas, no por temporizador. */
  function elegidoHoy(doc, f) {
    var d = doc && doc.diaBloque;
    if (!d || d.fecha !== clave(f)) return null;
    return BLOQUES.indexOf(d.bloque) >= 0 ? d.bloque : null;
  }

  /* Los bloques que HOY se pueden rezar: el del día, más los que ya tuvieron
     su día en esta vuelta y quedaron pendientes. Si ya se eligió el de hoy,
     es ese y solo ese. */
  function disponibles(doc, f) {
    var eleg = elegidoHoy(doc, f);
    if (eleg) return [eleg];

    var hoyB = bloqueDeHoy(f);
    if (nivelCompleto(doc)) return [hoyB];        // día de vuelta: el del día

    var pasados = diasPasados(doc && doc.vueltaDesde, f);
    return BLOQUES.filter(function (b) {
      if (hechos(doc, b) === 5) return false;
      return b === hoyB || pasados.indexOf(b) >= 0;
    });
  }

  /* La PUERTA. La misma respuesta que pinta la tira decide quién entra, así
     que el dibujo no puede prometer lo que la sesión niega. El mapa cometió
     justo ese error: pinta quince nodos con candado que se abren igual. */
  function permitido(bloque, doc, f) {
    return disponibles(doc, f).indexOf(bloque) >= 0;
  }

  /* Los veinte estados, para la tira. Uno por Misterio, en orden de bloque:
       rezado · vueltahoy · hoy · abierto · espera                          */
  function estadoDelNivel(doc, f) {
    var hoyB     = bloqueDeHoy(f);
    var completo = nivelCompleto(doc);
    var pasados  = diasPasados(doc && doc.vueltaDesde, f);
    var eleg     = elegidoHoy(doc, f);
    var out      = {};

    BLOQUES.forEach(function (b) {
      var v = _vueltaDe(doc, b);
      out[b] = v.map(function (x) {
        if (x) return (completo && b === hoyB) ? 'vueltahoy' : 'rezado';
        if (b === hoyB) return 'hoy';
        return pasados.indexOf(b) >= 0 ? 'abierto' : 'espera';
      });
    });

    return {
      bloques:     out,
      hoyBloque:   hoyB,
      completo:    completo,
      elegido:     eleg,
      diaGastado:  !!eleg,
      disponibles: disponibles(doc, f)
    };
  }

  /* Qué Nivel se reza hoy.
       premium · beta · developer → el que está cruzando (marcador, o frontera)
       free                       → el último ENTERO; sin ninguno, todavía nada
     El free no progresa aquí: reza un Nivel ya cerrado, así que completeMystery
     corta sola y no escribe. La regla se cumple por construcción, no por una
     condición que alguien pueda olvidar. */
  function nivelDiario(plan, opts) {
    opts = opts || {};
    var orden = opts.orden || (window.Niveles && window.Niveles.ORDEN) || [];
    var prem  = (plan === 'premium' || plan === 'beta' || plan === 'developer');

    if (prem) return opts.bookmark || opts.frontera || orden[0] || null;

    var i = orden.indexOf(opts.frontera);
    return (i > 0) ? orden[i - 1] : null;   // null = aún no ha cerrado ninguno
  }

  window.Dia = {
    BLOQUES:        BLOQUES,
    POR_DIA:        POR_DIA,
    clave:          clave,
    bloqueDeHoy:    bloqueDeHoy,
    nombreDelDia:   nombreDelDia,
    proximoDia:     proximoDia,
    diasPasados:    diasPasados,
    hechos:         hechos,
    primerPendiente: primerPendiente,
    nivelCompleto:  nivelCompleto,
    elegidoHoy:     elegidoHoy,
    disponibles:    disponibles,
    permitido:      permitido,
    estadoDelNivel: estadoDelNivel,
    nivelDiario:    nivelDiario
  };
}());
