/* CruzAndo — canto.js
 * Pantalla de canto karaoke: letra .lrc sincronizada, fondo Ken Burns y botón "Saltar".
 * Motor único, compartido. Hoy lo usan audio.html y rezar.html; cualquier pantalla
 * futura (retiro, cantos…) solo necesita cargarlo y llamar a Canto.init({...}).
 *
 * El módulo NO sabe qué es una sesión, un epílogo, un track ni un metro: recibe
 * getters y callbacks, y devuelve el control a la página en los puntos de decisión.
 *
 * Uso:
 *   <link rel="stylesheet" href="canto.css">
 *   <script src="canto.js"></script>
 *
 *   Canto.init({
 *     getAudio:    () => audioEl,      // GETTER, no referencia: puede cambiar por track
 *     isPlaying:   () => isPlaying,    // para el icono play/pausa de la pantalla
 *     getMid:      () => '1_1_1',      // identidad del Misterio: .lrc, carrusel y still
 *     getTitulo:   () => 'La Anunciación',
 *     isCantoNow:  () => true,         // ¿suena el canto AHORA? (reabre si la precarga tardó)
 *     onSkip:      () => {},           // qué hacer al pulsar "Saltar"
 *     onPlayPause: () => {},           // el botón central de la pantalla
 *     onBack10:    () => {},           // opcional; si falta, el módulo hace el seek
 *     onOpen:      () => {},           // opcional (p. ej. pausar la música de fondo)
 *     onClose:     () => {},           // opcional (p. ej. restaurarla)
 *     imgBase:     'https://…/',       // → cantos/{mid}/P_{mid}{a..i}.webp y P_{mid}.webp
 *     lrcBase:     'https://…/lrc/'    // → M_{mid}.lrc
 *   });
 *
 *   await Canto.preload({ nivelId, block, blockIdx });
 *   Canto.open();                                          // en la sesión
 *   Canto.open({ instantSkip: true, allowNoLyrics: true }); // canto opcional (epílogo)
 *   Canto.close();
 */
(function () {
  'use strict';

  var SKIP_AT      = 20;   // segundos de currentTime (no de reloj) antes de ofrecer "Saltar"
  var LETTERS      = 'abcdefghi'.split('');   // máx. 9 imágenes de carrusel por Misterio
  var FALLBACK_SEC = 6;    // sin duración de audio: cambia de imagen cada X s
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var cfg = null;

  // Estado de la letra en memoria (del Misterio en curso)
  var lrcText  = null;   // .lrc con marcas de tiempo (null si no hay o no las trae)
  var letraTxt = null;   // letra estática de {nivelId}-cantos.json (degradación)
  var titulo   = '';
  var events   = [];     // [{ t, text }]

  // Estado de la pantalla
  var open       = false;
  var isStatic   = false;  // letra sin tiempos: se muestra, no se sincroniza
  var instantSkip = false; // "Saltar" desde el segundo 0 (canto opcional)
  var raf        = 0;
  var curLine    = -1;
  var imgLetters = [];
  var imgIdx     = -1;
  var frontA     = true;

  // Caché de {nivelId}-cantos.json — una sola para toda la app
  var CANTOS_DATA = null;
  var cantosNivelId = null;

  var $ = function (id) { return document.getElementById(id); };

  /* ═══════════ Marcado (inyectado una vez en init) ═══════════ */
  var MARKUP =
    '<div class="canto-stills">' +
      '<div class="canto-lay front" id="canto-layA"><div class="canto-kb" id="canto-kbA"></div></div>' +
      '<div class="canto-lay"       id="canto-layB"><div class="canto-kb" id="canto-kbB"></div></div>' +
    '</div>' +
    '<div class="canto-scrim"></div>' +
    '<div class="canto-head">' +
      '<div class="canto-kicker">Canto</div>' +
      '<div class="canto-title" id="canto-title"></div>' +
    '</div>' +
    '<div class="canto-lyrics" id="canto-lyrics"><div class="canto-track" id="canto-lyric-track"></div></div>' +
    '<button class="canto-skip" id="canto-skip">' +
      '<span>Saltar</span>' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4l10 8-10 8zM17 4h2v16h-2z"/></svg>' +
    '</button>' +
    '<div class="canto-ctrls">' +
      '<button class="canto-cbtn" id="canto-back10" title="Retroceder 10 segundos" aria-label="Retroceder 10 segundos">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M3 4v4.5h4.5"/><text x="12.5" y="16" font-size="8" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle">10</text></svg>' +
      '</button>' +
      '<button class="canto-cbtn primary" id="canto-play-pause" aria-label="Pausar canto">' +
        '<svg id="canto-ico-play"  width="26" height="26" viewBox="0 0 24 24" fill="currentColor" style="display:none"><polygon points="5 3 19 12 5 21 5 3"/></svg>' +
        '<svg id="canto-ico-pause" width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' +
      '</button>' +
    '</div>';

  function mount() {
    if ($('scr-canto')) return;
    var el = document.createElement('div');
    el.id = 'scr-canto';
    el.innerHTML = MARKUP;
    document.body.appendChild(el);

    // El módulo cierra la pantalla ANTES de delegar: así ningún consumidor puede
    // olvidarse de hacerlo y dejar el karaoke colgado sobre la pantalla siguiente.
    $('canto-skip').onclick       = function () { closeCanto(); if (cfg && cfg.onSkip) cfg.onSkip(); };
    $('canto-play-pause').onclick = function () { if (cfg && cfg.onPlayPause) cfg.onPlayPause(); };
    $('canto-back10').onclick     = back10;
  }

  /* ═══════════ Parser .lrc ═══════════
     Convierte [mm:ss.xx] a segundos; ignora metadatos ([ti:], [ar:]…) y directivas
     ([cut:], [fx:]) que aquí no se usan. */
  function parseLrc(text) {
    var lines = text.split(/\r?\n/), out = [];
    var mode = null;
    var reTime = /^\s*\[(\d+):(\d+(?:\.\d+)?)\]/;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\s+$/, '');
      if (!line.trim()) continue;
      var low = line.trim().toLowerCase();
      if (low === '[stills]') { mode = 'stills'; continue; }
      if (low === '[lyrics]') { mode = 'lyrics'; continue; }
      if (/^\[(ti|ar|al|by|offset):/i.test(line.trim())) continue;
      if (mode === 'stills' && !reTime.test(line)) continue;
      var tm = line.match(reTime);
      if (!tm) continue;
      var t = parseInt(tm[1], 10) * 60 + parseFloat(tm[2]);
      var rest = line.slice(tm[0].length).replace(/\[[a-z]+:[^\]]*\]/ig, '').trim();
      if (rest) out.push({ t: t, text: rest });
    }
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  /* ═══════════ Datos del canto ═══════════ */
  // Una sola caché. El nivelId guarda contra servir la letra de otro cuaderno cuando
  // la página cambia de nivel sin recargar (audio.html: advanceAndRestart).
  function loadCantos(nivelId) {
    if (nivelId !== cantosNivelId) { CANTOS_DATA = null; cantosNivelId = nivelId; }
    if (CANTOS_DATA) return Promise.resolve(CANTOS_DATA);
    var base = location.origin + location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1);
    return fetch(base + 'data/' + nivelId + '-cantos.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { CANTOS_DATA = j; return j; })
      .catch(function () { return null; });
  }

  function getCanto(cantosData, block, blockIdx) {
    if (!cantosData || !cantosData.cantos || !cantosData.cantos[block]) return null;
    return cantosData.cantos[block][blockIdx] || null;
  }

  /* Precarga la letra del Misterio en curso: .lrc y respaldo estático.
     No bloquea: la página la lanza con tiempo, y al llegar al canto abrir es síncrono. */
  function preload(opts) {
    opts = opts || {};
    lrcText = null; letraTxt = null; titulo = '';
    var mid = cfg.getMid();

    return fetch(cfg.lrcBase + 'M_' + mid + '.lrc')
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (t) {
        // Sin marcas de tiempo no sirve para karaoke: se tratará como letra estática
        if (t && /\[\d+:\d/.test(t)) lrcText = t;
      })
      .catch(function () { /* sin .lrc: degrada a la letra de -cantos.json */ })
      .then(function () { return loadCantos(opts.nivelId); })
      .then(function (data) {
        var canto = getCanto(data, opts.block, opts.blockIdx);
        if (canto) { letraTxt = canto.letra || null; titulo = canto.titulo || ''; }
      })
      .catch(function () { /* sin letra: si tampoco hay .lrc, no se abre la pantalla */ })
      .then(function () {
        // Si la precarga llegó tarde (red lenta, o salto directo al canto), abre ahora
        if (!open && cfg.isCantoNow && cfg.isCantoNow()) openCanto();
      });
  }

  /* ═══════════ Abrir / cerrar ═══════════ */
  function openCanto(opts) {
    opts = opts || {};
    if (open) return;
    var hasStatic = !!(letraTxt && letraTxt.trim());
    // Sin .lrc y sin letra no abrimos nada: el canto suena con el hero, como siempre.
    // allowNoLyrics lo fuerza (el usuario ha pedido el canto a propósito).
    if (!lrcText && !hasStatic && !opts.allowNoLyrics) return;

    isStatic    = !lrcText;
    instantSkip = !!opts.instantSkip;
    open        = true;
    curLine = -1; imgIdx = -1; imgLetters = []; frontA = true;

    $('canto-title').textContent = titulo || (cfg.getTitulo ? cfg.getTitulo() : '') || '';

    var lyrics = $('canto-lyrics'), track = $('canto-lyric-track');
    lyrics.classList.toggle('static', isStatic);
    lyrics.scrollTop = 0;
    track.style.transform = 'translateY(0)';
    track.innerHTML = '';

    var lines;
    if (isStatic) {
      events = [];
      lines = letraTxt ? letraTxt.split(/\r?\n/) : [];   // con allowNoLyrics puede no haber letra
    } else {
      events = parseLrc(lrcText);
      lines = events.map(function (e) { return e.text; });
    }
    lines.forEach(function (txt) {
      var d = document.createElement('div');
      d.className = 'canto-ly';
      if (txt.trim()) d.textContent = txt; else d.innerHTML = '&nbsp;';
      track.appendChild(d);
    });

    // "Saltar" aparece tras SKIP_AT segundos escuchados. Con letra estática no hay nada
    // que sincronizar, y con instantSkip el canto es opcional: disponible desde el inicio.
    $('canto-skip').classList.toggle('show', isStatic || instantSkip);

    if (cfg.onOpen) cfg.onOpen();
    detectImages();
    $('scr-canto').classList.add('open');
    syncIcon();
    raf = requestAnimationFrame(tick);
  }

  function closeCanto() {
    if (!open) return;
    open = false;
    cancelAnimationFrame(raf); raf = 0;
    $('scr-canto').classList.remove('open');
    $('canto-skip').classList.remove('show');
    if (cfg.onClose) cfg.onClose();
  }

  /* ═══════════ Bucle ═══════════
     Lee el audio VIGENTE en cada frame (audio.html reasigna su elemento por track),
     así que nunca se queda con una referencia muerta: si desaparece, se apaga solo. */
  function tick() {
    var a = cfg.getAudio();
    if (!open || !a) { closeCanto(); return; }
    render(a.currentTime);
    raf = requestAnimationFrame(tick);
  }

  function render(cur) {
    var a = cfg.getAudio();

    // Fondo: las imágenes del carrusel se reparten uniformemente por la duración
    var n = imgLetters.length;
    if (n > 0) {
      var dur = a && a.duration;
      var seg = (dur > 0 && isFinite(dur)) ? dur / n : FALLBACK_SEC;
      var idx = Math.min(n - 1, Math.max(0, Math.floor(cur / seg)));
      if (idx !== imgIdx) { imgIdx = idx; showImg(idx, seg); }
    }
    if (isStatic) return;

    var line = -1;
    for (var i = 0; i < events.length; i++) {
      if (events[i].t <= cur) line = i; else break;
    }
    if (line !== curLine) { curLine = line; setActiveLine(line); }

    if (cur >= SKIP_AT) $('canto-skip').classList.add('show');
  }

  function setActiveLine(idx) {
    var track = $('canto-lyric-track'), kids = track.children;
    for (var i = 0; i < kids.length; i++) {
      kids[i].classList.toggle('active', i === idx);
      kids[i].classList.toggle('near', Math.abs(i - idx) === 1);
    }
    if (idx >= 0 && kids[idx]) {
      var el = kids[idx];
      var anchor = $('canto-lyrics').clientHeight * 0.42;
      var y = el.offsetTop + el.offsetHeight / 2;
      track.style.transform = 'translateY(' + (anchor - y) + 'px)';
    }
  }

  /* ═══════════ Fondo: carrusel del canto, con degradación a la still del Misterio ═══════════ */
  function imgUrl(letra) {
    var mid = cfg.getMid();
    return cfg.imgBase + 'cantos/' + mid + '/P_' + mid + letra + '.webp';
  }

  // Detección invisible: precarga a, b, c… hasta el primer 404 (máx. 9). Nada roto se pinta.
  function detectImages() {
    imgLetters = []; imgIdx = -1;
    var i = 0;
    (function probe() {
      if (!open) return;
      if (i >= LETTERS.length) { finishDetect(); return; }
      var letra = LETTERS[i];
      var im = new Image();
      im.onload = function () {
        imgLetters.push(letra);
        if (imgLetters.length === 1 && imgIdx < 0) { imgIdx = 0; showImg(0, FALLBACK_SEC); }
        i++; probe();
      };
      im.onerror = function () { finishDetect(); };   // primer 404 => fin del carrusel
      im.src = imgUrl(letra);
    })();
  }

  // Sin carrusel: la still del Misterio (la misma del hero, ya cacheada)
  function finishDetect() {
    if (imgLetters.length > 0) return;
    showStill(cfg.imgBase + 'P_' + cfg.getMid() + '.webp');
  }

  function layers() {
    return frontA
      ? { inLay: $('canto-layB'), inKb: $('canto-kbB'), outLay: $('canto-layA') }
      : { inLay: $('canto-layA'), inKb: $('canto-kbA'), outLay: $('canto-layB') };
  }

  function paint(inKb, url, zoom, panX, panY, durS) {
    inKb.style.background         = "url('" + url + "')";
    inKb.style.backgroundSize     = 'cover';
    inKb.style.backgroundPosition = 'center';
    inKb.style.setProperty('--ckbz', zoom);
    inKb.style.setProperty('--ckbx', panX);
    inKb.style.setProperty('--ckby', panY);
    inKb.style.animationDuration  = durS + 's';
    inKb.classList.remove('run');
    void inKb.offsetWidth;                          // reinicia la animación
    if (!reduceMotion) inKb.classList.add('run');
  }

  function showImg(idx, segDur) {
    var letra = imgLetters[idx];
    if (!letra) return;
    var L = layers();
    var dirs = [['-3%','-2%'], ['3%','-3%'], ['-2%','3%'], ['2%','2%']];
    var pan = dirs[idx % dirs.length], zoom = (idx % 2 === 0) ? 1.09 : 1.06;
    if (reduceMotion) { zoom = 1; pan = ['0%','0%']; }
    paint(L.inKb, imgUrl(letra), zoom, pan[0], pan[1], Math.max(8, segDur || FALLBACK_SEC));
    L.inLay.classList.add('front'); L.outLay.classList.remove('front');
    frontA = !frontA;
  }

  function showStill(url) {
    var L = layers();
    paint(L.inKb, url, reduceMotion ? 1 : 1.06, '0%', '0%', 30);
    L.inLay.classList.add('front'); L.outLay.classList.remove('front');
    frontA = !frontA;
  }

  /* ═══════════ Controles ═══════════ */
  // El icono refleja el estado real de reproducción de la página.
  function syncIcon() {
    var play = $('canto-ico-play'), pause = $('canto-ico-pause');
    if (!play || !pause) return;
    var playing = !!(cfg && cfg.isPlaying && cfg.isPlaying());
    play.style.display  = playing ? 'none' : 'block';
    pause.style.display = playing ? 'block' : 'none';
  }

  // Si la página trae su propio −10s (que además refresca su barra), se usa el suyo.
  function back10() {
    if (cfg && cfg.onBack10) { cfg.onBack10(); return; }
    var a = cfg && cfg.getAudio();
    if (!a) return;
    a.currentTime = Math.max(0, a.currentTime - 10);
    render(a.currentTime);
  }

  /* ═══════════ API ═══════════ */
  window.Canto = {
    init: function (config) { cfg = config || {}; mount(); },
    preload:  preload,
    open:     openCanto,
    close:    closeCanto,
    isOpen:   function () { return open; },
    syncIcon: syncIcon,
    // Expuestos porque las páginas los necesitan fuera del karaoke
    // (audio.html: desbloqueo de unlockedCantos al cerrar un bloque).
    loadCantos: loadCantos,
    getCanto:   getCanto,
    parseLrc:   parseLrc
  };
})();
