// ═══════════════════════════════════════════════════════════════════
// CruzAndo — colores canónicos de los cuatro bloques de Misterios
// ═══════════════════════════════════════════════════════════════════
//
// UN SOLO LUGAR para el color de cada bloque. Antes vivía copiado a mano
// en audio, orar, rezar, crecer, cantos y diario, y se había desviado:
// dos versiones daban Gozosos en oro y Gloriosos en morado (valores de
// una etapa anterior), una tercera pintaba la cruz del micro en verde y
// amarillo, y los 28 data/{nivelId}.json llevaban todavía la vieja.
//
//   gozosos    rosa
//   luminosos  cian
//   dolorosos  rojo
//   gloriosos  oro
//
// Sirve a las dos caras a la vez:
//   · JS  → window.COLORES_BLOQUE / window.rgbaBloque(bloque, alfa)
//   · CSS → --goz / --goz-color / --goz-rgb  (y lum, dol, glo)
//
// Se carga en el <head>, como script síncrono, para que las variables
// estén puestas antes del primer pintado y ninguna franja parpadee.
(function () {
  'use strict';

  var COLORES = {
    gozosos:   '#E8A0A0',
    luminosos: '#01BBE1',
    dolorosos: '#C0392B',
    gloriosos: '#D4A017'
  };

  // Las hojas de estilo usan el alias corto (--goz, --goz-color).
  var ALIAS = { goz: 'gozosos', lum: 'luminosos', dol: 'dolorosos', glo: 'gloriosos' };

  function _rgb(hex) {
    var h = hex.replace('#', '');
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16)
    ].join(',');
  }

  window.COLORES_BLOQUE = COLORES;

  // Acepta el nombre largo ('gozosos') o el alias corto ('goz').
  window.rgbaBloque = function (bloque, alfa) {
    var hex = COLORES[bloque] || COLORES[ALIAS[bloque]];
    var a   = (alfa == null) ? 1 : alfa;
    return hex ? 'rgba(' + _rgb(hex) + ',' + a + ')' : 'rgba(0,0,0,' + a + ')';
  };

  /* El trío suelto, para cuando hace falta componer un rgba() en CSS con una
     opacidad propia: rgb(var(--x-rgb), .17). Mismo alias que rgbaBloque. */
  window.rgbBloque = function (bloque) {
    var hex = COLORES[bloque] || COLORES[ALIAS[bloque]];
    return hex ? _rgb(hex) : '';
  };

  // Estampa las variables en <html>. Estilo en línea: gana sobre :root, que
  // es justo lo que se quiere — ninguna página vuelve a declararlas.
  // Mismo recurso que ya usa applyBlockColor() de audio.html con --lvl-bold.
  var raiz = document.documentElement;
  Object.keys(ALIAS).forEach(function (k) {
    var hex = COLORES[ALIAS[k]];
    raiz.style.setProperty('--' + k, hex);
    raiz.style.setProperty('--' + k + '-color', hex);
    raiz.style.setProperty('--' + k + '-rgb', _rgb(hex));
  });
}());
