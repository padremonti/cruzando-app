/* CruzAndo — rosario-final.js
 * El bloque final del Rosario, autónomo y reutilizable:
 *   Letanías (karaoke sincronizado) → Salve → Oración conclusiva
 *
 * Vivía dentro de rezar.html (tres pistas de su playlist + #scr-letanias). Ahora es
 * un módulo con su propio audio y sus propias pantallas, así que cualquier página
 * puede abrirlo: rezar al terminar los 5 Misterios, y orar/audio con un botón en
 * los Misterios 5, 10, 15 y 20.
 *
 * Requiere, en este orden:
 *   <link rel="stylesheet" href="canto.css">
 *   <link rel="stylesheet" href="rosario-final.css">
 *   <script src="plan-utils.js"></script>   (aporta esLatin())
 *   <script src="canto.js"></script>
 *   <script src="letanias.js"></script>
 *   <script src="rosario-final.js"></script>
 *
 * Uso:
 *   RosarioFinal.abrir({ onCerrar: () => {...} });   // al terminar o al salir
 *   RosarioFinal.cerrar();
 *
 * El idioma sale de esLatin() (preferencia del usuario). No otorga metros.
 */
(function () {
  'use strict';

  var AUDIO_BASE = 'https://pub-cd28789360f74fc0a623bb76605f42c3.r2.dev/global/';

  /* Textos de las oraciones — tal cual venían de rezar.html */
  var TXT = {
    letanias: `<b>Señor, ten piedad.</b> Señor, ten piedad.<br>
<b>Cristo, ten piedad.</b> Cristo, ten piedad.<br>
<b>Señor, ten piedad.</b> Señor, ten piedad.<br>
<b>Cristo, óyenos.</b> Cristo, óyenos.<br>
<b>Cristo, escúchanos.</b> Cristo, escúchanos.<br><br>
<b>Dios, Padre celestial,</b> ten misericordia de nosotros.<br>
<b>Dios, Hijo Redentor del mundo,</b> ten misericordia de nosotros.<br>
<b>Dios, Espíritu Santo,</b> ten misericordia de nosotros.<br>
<b>Santísima Trinidad, un solo Dios,</b> ten misericordia de nosotros.<br><br>
<b>Santa María,</b> ruega por nosotros.<br>
<b>Santa Madre de Dios,</b> ruega por nosotros.<br>
<b>Santa Virgen de las vírgenes,</b> ruega por nosotros.<br>
<b>Madre de Cristo,</b> ruega por nosotros.<br>
<b>Madre de la Iglesia,</b> ruega por nosotros.<br>
<b>Madre de la misericordia,</b> ruega por nosotros.<br>
<b>Madre de la divina gracia,</b> ruega por nosotros.<br>
<b>Madre de la esperanza,</b> ruega por nosotros.<br>
<b>Madre purísima,</b> ruega por nosotros.<br>
<b>Madre castísima,</b> ruega por nosotros.<br>
<b>Madre inviolada,</b> ruega por nosotros.<br>
<b>Madre inmaculada,</b> ruega por nosotros.<br>
<b>Madre amable,</b> ruega por nosotros.<br>
<b>Madre admirable,</b> ruega por nosotros.<br>
<b>Madre del buen consejo,</b> ruega por nosotros.<br>
<b>Madre del Creador,</b> ruega por nosotros.<br>
<b>Madre del Salvador,</b> ruega por nosotros.<br>
<b>Virgen prudentísima,</b> ruega por nosotros.<br>
<b>Virgen digna de veneración,</b> ruega por nosotros.<br>
<b>Virgen digna de alabanza,</b> ruega por nosotros.<br>
<b>Virgen poderosa,</b> ruega por nosotros.<br>
<b>Virgen clemente,</b> ruega por nosotros.<br>
<b>Virgen fiel,</b> ruega por nosotros.<br>
<b>Espejo de justicia,</b> ruega por nosotros.<br>
<b>Trono de la Sabiduría,</b> ruega por nosotros.<br>
<b>Causa de nuestra alegría,</b> ruega por nosotros.<br>
<b>Vas espiritual,</b> ruega por nosotros.<br>
<b>Vas honorable,</b> ruega por nosotros.<br>
<b>Vas insigne de devoción,</b> ruega por nosotros.<br>
<b>Rosa mística,</b> ruega por nosotros.<br>
<b>Torre de David,</b> ruega por nosotros.<br>
<b>Torre de marfil,</b> ruega por nosotros.<br>
<b>Casa de oro,</b> ruega por nosotros.<br>
<b>Arca de la Alianza,</b> ruega por nosotros.<br>
<b>Puerta del cielo,</b> ruega por nosotros.<br>
<b>Estrella de la mañana,</b> ruega por nosotros.<br>
<b>Salud de los enfermos,</b> ruega por nosotros.<br>
<b>Refugio de los pecadores,</b> ruega por nosotros.<br>
<b>Consoladora de los afligidos,</b> ruega por nosotros.<br>
<b>Auxilio de los cristianos,</b> ruega por nosotros.<br>
<b>Reina de los Ángeles,</b> ruega por nosotros.<br>
<b>Reina de los Patriarcas,</b> ruega por nosotros.<br>
<b>Reina de los Profetas,</b> ruega por nosotros.<br>
<b>Reina de los Apóstoles,</b> ruega por nosotros.<br>
<b>Reina de los Mártires,</b> ruega por nosotros.<br>
<b>Reina de los Confesores,</b> ruega por nosotros.<br>
<b>Reina de las Vírgenes,</b> ruega por nosotros.<br>
<b>Reina de todos los Santos,</b> ruega por nosotros.<br>
<b>Reina concebida sin pecado original,</b> ruega por nosotros.<br>
<b>Reina asunta al cielo,</b> ruega por nosotros.<br>
<b>Reina del Santísimo Rosario,</b> ruega por nosotros.<br>
<b>Reina de la familia,</b> ruega por nosotros.<br>
<b>Reina de la paz,</b> ruega por nosotros.<br><br>
<b>Cordero de Dios, que quitas el pecado del mundo,</b> perdónanos, Señor.<br>
<b>Cordero de Dios, que quitas el pecado del mundo,</b> escúchanos, Señor.<br>
<b>Cordero de Dios, que quitas el pecado del mundo,</b> ten misericordia de nosotros.<br><br>
<i>Ruega por nosotros, Santa Madre de Dios,</i><br>
<i>para que seamos dignos de alcanzar las promesas de Jesucristo. Amén.</i>`,

    salve: `Dios te salve, Reina y Madre de misericordia,
vida, dulzura y esperanza nuestra; Dios te salve.
A ti llamamos los desterrados hijos de Eva;
a ti suspiramos, gimiendo y llorando
en este valle de lágrimas.
Ea, pues, Señora, abogada nuestra,
vuelve a nosotros esos tus ojos misericordiosos;
y después de este destierro muéstranos a Jesús,
fruto bendito de tu vientre.
¡Oh clementísima, oh piadosa,
oh dulce siempre Virgen María! Amén.`,

    final: `Oh Dios, cuyo Hijo unigénito, con su vida,
muerte y resurrección, nos obtuvo el premio
de la salvación eterna, te rogamos que,
meditando estos misterios del Santísimo Rosario
de la Virgen María, imitemos lo que contienen
y obtengamos lo que prometen.
Por Jesucristo, nuestro Señor. Amén.`
  };

  var PASOS = [
    { id: 'letanias', titulo: 'Letanías Lauretanas', archivo: 'LETANIAS',      karaoke: true  },
    { id: 'salve',    titulo: 'Salve Regina',        archivo: 'SALVE',         karaoke: false },
    { id: 'final',    titulo: 'Oración conclusiva',  archivo: 'ORACION_FINAL', karaoke: false }
  ];

  var audio = null, letanias = null;
  var paso = -1, abierto = false, cbCerrar = null, resolverSalto = null;

  var $ = function (id) { return document.getElementById(id); };
  var esLatin = function () { return !!(window.esLatin && window.esLatin()); };

  var ICO_PLAY  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  var ICO_PAUSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

  /* ═══════════ Marcado (una vez) ═══════════ */
  function montar() {
    if ($('scr-rf')) return;

    var el = document.createElement('div');
    el.id = 'scr-rf';
    el.className = 'rf-screen';
    el.innerHTML =
      '<div class="rf-header">' +
        '<button class="rf-icon-btn" id="rf-close" title="Salir" aria-label="Salir de las oraciones finales">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button>' +
        '<div class="rf-title" id="rf-title"></div>' +
        '<button class="rf-icon-btn primary" id="rf-pp" aria-label="Pausar">' + ICO_PAUSE + '</button>' +
      '</div>' +
      '<div class="rf-text" id="rf-text"></div>' +
      '<button class="rf-next" id="rf-next">Continuar →</button>';
    document.body.appendChild(el);

    var conf = document.createElement('div');
    conf.id = 'rf-confirm';
    conf.setAttribute('role', 'dialog');
    conf.setAttribute('aria-modal', 'true');
    conf.innerHTML =
      '<div class="rf-confirm-box">' +
        '<div class="rf-confirm-title">¿Saltar las Letanías?</div>' +
        '<div class="rf-confirm-sub">Son la oración con que se cierra el Rosario.</div>' +
        '<div class="rf-confirm-btns">' +
          '<button class="rf-btn-stay" id="rf-stay">Seguir rezando</button>' +
          '<button class="rf-btn-go"   id="rf-go">Saltar a la Salve</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(conf);

    $('rf-close').onclick = cerrar;
    $('rf-next').onclick  = siguiente;
    $('rf-pp').onclick    = alternarPlay;
    $('rf-stay').onclick  = function () { responder(false); };
    $('rf-go').onclick    = function () { responder(true); };
  }

  /* ═══════════ Audio propio ═══════════ */
  function initAudio() {
    if (audio) return;
    audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('ended', siguiente);
    audio.addEventListener('play',  sincronizarIcono);
    audio.addEventListener('pause', sincronizarIcono);
    // Si una pista no existe todavía, no dejamos el bloque colgado: se pasa a la siguiente
    audio.addEventListener('error', function () { if (abierto) siguiente(); });
  }

  function sincronizarIcono() {
    var b = $('rf-pp');
    if (b) b.innerHTML = (audio && !audio.paused) ? ICO_PAUSE : ICO_PLAY;
    if (letanias) letanias.syncIcon();
  }

  function alternarPlay() {
    if (!audio) return;
    if (audio.paused) audio.play().catch(function () {});
    else audio.pause();
    sincronizarIcono();
  }

  /* ═══════════ Las Letanías (karaoke) ═══════════ */
  function initKaraoke() {
    if (letanias) return;
    letanias = window.Letanias.create({
      getAudio:    function () { return audio; },
      isPlaying:   function () { return !!audio && !audio.paused; },
      esLatin:     esLatin,
      isOpenNow:   function () { return abierto && paso === 0; },
      onPlayPause: alternarPlay,
      onSkip:      siguiente,
      confirmSkip: confirmarSalto
    });
  }

  // La pantalla sigue en pie mientras el usuario decide: si dice que no, no ha pasado nada.
  function confirmarSalto() {
    $('rf-confirm').classList.add('open');
    return new Promise(function (res) { resolverSalto = res; });
  }
  function responder(si) {
    $('rf-confirm').classList.remove('open');
    if (resolverSalto) { resolverSalto(si); resolverSalto = null; }
  }

  /* ═══════════ Flujo ═══════════ */
  function abrir(opts) {
    opts = opts || {};
    if (abierto) return;
    montar();
    initAudio();
    initKaraoke();
    abierto = true;
    cbCerrar = opts.onCerrar || null;
    paso = -1;
    siguiente();
  }

  function siguiente() {
    if (!abierto) return;
    paso++;
    if (paso >= PASOS.length) { cerrar(); return; }

    var p = PASOS[paso];
    audio.src = AUDIO_BASE + (esLatin() ? 'L_' : '') + p.archivo + '.m4a';
    audio.load();
    audio.play().catch(function () { sincronizarIcono(); });

    if (p.karaoke) {
      // Letanías: la pantalla de texto se aparta y manda el karaoke
      $('scr-rf').classList.remove('open');
      letanias.preload().then(function () {
        if (abierto && paso === 0) letanias.open();
      });
    } else {
      // Salve y conclusiva: no tienen letra sincronizada — pantalla de texto
      if (letanias) letanias.close();
      $('rf-title').textContent = p.titulo;
      $('rf-text').innerHTML    = TXT[p.id] || '';
      $('rf-text').scrollTop    = 0;
      $('rf-next').textContent  = (paso === PASOS.length - 1) ? 'Terminar' : 'Continuar →';
      $('scr-rf').classList.add('open');
    }
    sincronizarIcono();
  }

  function cerrar() {
    if (!abierto) return;
    abierto = false;
    paso = -1;
    if (letanias) letanias.close();
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    var rf = $('scr-rf');   if (rf) rf.classList.remove('open');
    var cf = $('rf-confirm'); if (cf) cf.classList.remove('open');
    var cb = cbCerrar; cbCerrar = null;
    if (cb) cb();
  }

  window.RosarioFinal = {
    abrir:    abrir,
    cerrar:   cerrar,
    estaAbierto: function () { return abierto; },
    textos:   TXT            // rezar los usaba; quedan disponibles por si hacen falta
  };
})();
