/* CruzAndo — letanias.js
 * Las Letanías Lauretanas en karaoke: NO es un motor, es una configuración.
 * El motor es canto.js (Karaoke.create); aquí solo vive lo que las Letanías
 * tienen de propio: dónde están sus assets en R2 y su rótulo.
 *
 * Requiere: <script src="canto.js"></script> antes que este archivo.
 *
 * Uso:
 *   const L = Letanias.create({
 *     getAudio:    () => rezarAudio,   // el audio que ya está sonando la pista
 *     isPlaying:   () => !rezarAudio.paused,
 *     esLatin:     () => prefs().idioma === 'latin',
 *     isOpenNow:   () => trackActual.type === 'letanias',
 *     onSkip:      () => playNext(),
 *     confirmSkip: () => preguntarAlUsuario(),   // devuelve bool o Promise<bool>
 *     onPlayPause: () => togglePlay(),
 *     onOpen / onClose: opcionales
 *   });
 *   await L.preload();   // el .lrc del idioma elegido
 *   L.open();            // al entrar a la pista de Letanías
 *   L.close();
 */
(function () {
  'use strict';

  var AUDIO_BASE = 'https://pub-cd28789360f74fc0a623bb76605f42c3.r2.dev/global/';
  var IMG_BASE   = 'https://pub-96c43f31e0da42dd950d4ac90328256e.r2.dev/letanias/';

  // El carrusel se numera 1.webp, 2.webp… El motor prueba estos candidatos y se queda
  // con los que existan (imgTolerateGaps), así que subir o quitar una ilustración no
  // exige tocar código: basta con que esté dentro del rango.
  var MAX_IMGS = 24;

  function imgCandidates() {
    var out = [];
    for (var i = 1; i <= MAX_IMGS; i++) out.push(IMG_BASE + i + '.webp');
    return out;
  }

  function create(opts) {
    opts = opts || {};
    var esLatin = opts.esLatin || function () { return false; };

    return window.Karaoke.create({
      id:     'letanias-k',          // ≠ #scr-letanias (la pantalla de texto de rezar.html)
      kicker: 'Letanías',

      getAudio:  opts.getAudio,
      isPlaying: opts.isPlaying,
      getTitulo: function () { return 'Letanías Lauretanas'; },

      // El idioma se resuelve en cada precarga: LETANIAS.lrc / L_LETANIAS.lrc
      getLrcUrl: function () {
        return AUDIO_BASE + (esLatin() ? 'L_' : '') + 'LETANIAS.lrc';
      },
      getImgCandidates: imgCandidates,
      imgTolerateGaps:  true,        // el conjunto de ilustraciones crece y cambia
      getStillUrl:      function () { return IMG_BASE + '1.webp'; },
      // Sin letra de respaldo: si no hay .lrc, el karaoke no abre y queda a la vista
      // la pantalla de texto de siempre (#scr-letanias). Esa es la degradación.

      isOpenNow:   opts.isOpenNow,
      onSkip:      opts.onSkip,
      confirmSkip: opts.confirmSkip,
      onPlayPause: opts.onPlayPause,
      onBack10:    opts.onBack10,
      onOpen:      opts.onOpen,
      onClose:     opts.onClose
    });
  }

  window.Letanias = { create: create, imgCandidates: imgCandidates };
})();
