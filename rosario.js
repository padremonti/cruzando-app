// ═══════════════════════════════════════════════════════════════════
// CruzAndo — la vuelta del Rosario
// ═══════════════════════════════════════════════════════════════════
//
// Rezar cinco Misterios de un bloque es un Rosario, y rezar el Rosario es una
// COSTUMBRE: se repite. El avance temático (`progress`) solo ocurre una vez —
// cruzar un Misterio por primera vez— pero el acto piadoso vuelve cada semana.
// Hasta ahora la animación del Rosario colgaba del avance, así que solo se veía
// la primerísima vez. Esto separa las dos cosas.
//
//   progress   → avance temático. Una vez. Manda en los metros de "primera vez".
//   vuelta     → decenas REZADAS de la vuelta en curso de cada bloque.
//   rosarios   → cuántos Rosarios se han cerrado de cada bloque. Histórico.
//
// ⚠️ Solo cuenta lo REZADO, no lo marcado. Quien pasa páginas en el Libro sin
// escuchar el rezo avanza en `progress` pero no llena la vuelta: la prueba es
// la guarda del decenario (once cuentas y la Cruz encendida), que es lo que las
// páginas comprueban antes de llamar a marcar().
//
// La vuelta del NIVEL sale sola: es min(rosarios). Cuando ese mínimo sube, se
// recorrieron otra vez los veinte. No hay que limpiar nada y el número de vuelta
// viene dado, que es lo que necesita la pantalla de reconocimiento.
//
// Lógica pura: sin red, sin SDK, sin DOM. Cada página hace su propia E/S.
(function () {
  'use strict';

  var BLOQUES = ['gozosos', 'luminosos', 'dolorosos', 'gloriosos'];
  var VACIO   = [null, null, null, null, null];

  function copiaVuelta(v) {
    var out = {};
    BLOQUES.forEach(function (b) {
      var a = (v && v[b]);
      out[b] = (Array.isArray(a) && a.length === 5) ? a.slice() : VACIO.slice();
    });
    return out;
  }

  function copiaRosarios(r) {
    var out = {};
    BLOQUES.forEach(function (b) {
      var n = (r && r[b]);
      out[b] = (typeof n === 'number' && n >= 0 && isFinite(n)) ? Math.floor(n) : 0;
    });
    return out;
  }

  /* Tolera un documento a medias, ausente o con basura: un contador devocional
     no puede reventar porque falte un campo. */
  function normalizar(doc) {
    doc = doc || {};
    return { vuelta: copiaVuelta(doc.vuelta), rosarios: copiaRosarios(doc.rosarios) };
  }

  // Vueltas COMPLETAS del Nivel: los veinte, y por tanto el mínimo de los cuatro.
  function vueltas(estado) {
    var e = normalizar(estado);
    return BLOQUES.reduce(function (m, b) { return Math.min(m, e.rosarios[b]); }, Infinity);
  }

  /* Marca una decena REZADA. Devuelve el estado nuevo y qué ritos ha disparado.
     Idempotente por hueco: rezar dos veces el tercer Misterio llena un hueco,
     no dos — un Rosario son cinco decenas DISTINTAS. */
  function marcar(estado, bloque, idx, cuando) {
    var e = normalizar(estado);
    var res = { estado: e, rosario: false, vuelta: false, numero: 0, bloque: bloque };

    if (BLOQUES.indexOf(bloque) === -1) return res;
    idx = Math.floor(idx);
    if (!(idx >= 0 && idx <= 4)) return res;

    var antes = vueltas(e);
    if (!e.vuelta[bloque][idx]) e.vuelta[bloque][idx] = cuando || Date.now();

    // ¿Se cerró la vuelta de este bloque? Cinco decenas distintas rezadas.
    if (e.vuelta[bloque].every(Boolean)) {
      e.vuelta[bloque] = VACIO.slice();     // empieza otra vuelta
      e.rosarios[bloque] += 1;
      res.rosario = true;
      var ahora = vueltas(e);
      if (ahora > antes) { res.vuelta = true; res.numero = ahora; }
    }
    return res;
  }

  /* Gana la más avanzada de las dos. Cubre el segundo dispositivo y el rezo sin
     red, sin necesidad de una cola de reintentos: la próxima escritura reconcilia.
     En la vuelta en curso gana quien tenga el hueco puesto; en los Rosarios
     cerrados, el número mayor. */
  function fusionar(a, b) {
    var A = normalizar(a), B = normalizar(b), out = { vuelta: {}, rosarios: {} };
    BLOQUES.forEach(function (bl) {
      out.rosarios[bl] = Math.max(A.rosarios[bl], B.rosarios[bl]);
      /* Si uno de los dos ya cerró más Rosarios, su vuelta en curso es la buena:
         la del otro pertenece a una vuelta anterior y fusionarlas adelantaría
         huecos que no se rezaron en esta. */
      if      (A.rosarios[bl] > B.rosarios[bl]) out.vuelta[bl] = A.vuelta[bl].slice();
      else if (B.rosarios[bl] > A.rosarios[bl]) out.vuelta[bl] = B.vuelta[bl].slice();
      else out.vuelta[bl] = A.vuelta[bl].map(function (x, i) { return x || B.vuelta[bl][i] || null; });
    });
    return out;
  }

  // ── Espejo local: una oración no se pierde por red ──────────────────
  function clave(nivelId) { return 'cruzando_vuelta_' + nivelId; }

  function leerLocal(nivelId) {
    try { return normalizar(JSON.parse(localStorage.getItem(clave(nivelId)) || '{}')); }
    catch (e) { return normalizar(null); }
  }

  function guardarLocal(nivelId, estado) {
    try { localStorage.setItem(clave(nivelId), JSON.stringify(normalizar(estado))); }
    catch (e) {}
  }

  window.Rosario = {
    BLOQUES:     BLOQUES,
    normalizar:  normalizar,
    marcar:      marcar,
    vueltas:     vueltas,
    fusionar:    fusionar,
    leerLocal:   leerLocal,
    guardarLocal: guardarLocal
  };
}());
