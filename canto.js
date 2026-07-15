/* CruzAndo — canto.js
 * Motor de karaoke: letra .lrc sincronizada, fondo Ken Burns y controles.
 * Único y compartido. Lo usan el canto de cada Misterio (audio.html, rezar.html),
 * las Letanías (letanias.js) y la galería de cantos (cantos.html). Cualquier pantalla
 * futura solo necesita cargarlo y crear su instancia.
 *
 * El motor NO sabe qué es una sesión, un Misterio, un epílogo ni un metro: recibe
 * getters y callbacks, y devuelve el control a la página en los puntos de decisión.
 * Tampoco sabe de dónde salen los assets: la configuración se los da resueltos.
 *
 * Uso:
 *   <link rel="stylesheet" href="canto.css">
 *   <script src="canto.js"></script>
 *
 *   const K = Karaoke.create({
 *     id:        'canto',            // prefijo de los ids del DOM (único por instancia)
 *     kicker:    'Canto',            // rótulo pequeño de la cabecera
 *     getAudio:  () => audioEl,      // GETTER, no referencia: puede cambiar por track
 *     isPlaying: () => isPlaying,    // para el icono play/pausa
 *     getTitulo: () => 'La Anunciación',
 *
 *     getLrcUrl:        () => 'https://…/M_1_1_1.lrc',
 *     getImgCandidates: () => ['https://…/a.webp', …],   // el carrusel
 *     getStillUrl:      () => 'https://…/P_1_1_1.webp',  // fondo si no hay carrusel
 *     imgTolerateGaps:  false,       // true: prueba todas y se queda con las que existan
 *     imgTrust:         false,       // true: confía en la lista (manifiesto) y no la prueba
 *     loadFallbackLetra: async () => ({ letra, titulo }),  // opcional (degradación)
 *
 *     isOpenNow:   () => true,       // ¿debería estar abierta AHORA? (precarga tardía)
 *     onSkip:      () => {},         // opcional: si falta, no hay botón "Saltar"
 *     confirmSkip: () => true,       // opcional: pide confirmación antes de saltar
 *     onPlayPause: () => {},
 *     onBack10:    () => {},         // opcional; si falta, el motor hace el seek −10s
 *     onFwd10:     () => {},         // opcional; si falta, el motor hace el seek +10s
 *     onPrev:      () => {},         // galería: pista anterior (habilita swipe →)
 *     onNext:      () => {},         // galería: pista siguiente (habilita swipe ←)
 *     controls:    ['back10','playpause'],   // orden de la barra; galería: prev/-10/play/+10/next
 *     onOpen:      () => {},         // opcional (p. ej. pausar la música de fondo)
 *     onClose:     () => {},         // opcional (p. ej. restaurarla)
 *   });
 *
 *   await K.preload();
 *   K.open();                                          // en la sesión
 *   K.open({ instantSkip: true, allowNoLyrics: true }); // contenido opcional (epílogo)
 *   K.reload({ dir: 'next' });                          // galería: cambia de canto sin cerrar
 *   K.close();
 */
(function () {
  'use strict';

  var SKIP_AT      = 20;   // segundos de currentTime (no de reloj) antes de ofrecer "Saltar"
  var FALLBACK_SEC = 6;    // sin duración de audio: cambia de imagen cada X s
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var $ = function (id) { return document.getElementById(id); };

  // Iconos de los controles opcionales (el −10s y el play/pausa se arman aparte,
  // idénticos a como estaban, para no cambiar nada en las pantallas existentes).
  var SVG = {
    prev:  '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="18 20 8 12 18 4"/><rect x="5" y="4" width="2.4" height="16" rx="1"/></svg>',
    next:  '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 4 16 12 6 20"/><rect x="16.6" y="4" width="2.4" height="16" rx="1"/></svg>',
    back10:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M3 4v4.5h4.5"/><text x="12.5" y="16" font-size="8" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle">10</text></svg>',
    fwd10: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M21 4v4.5h-4.5"/><text x="11.5" y="16" font-size="8" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle">10</text></svg>'
  };

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

  /* ═══════════ Cantos del cuaderno ({nivelId}-cantos.json) ═══════════
     Vive aquí porque es la letra de respaldo del canto, y una sola caché para toda
     la app. El nivelId guarda contra servir la letra de otro cuaderno cuando la
     página cambia de nivel sin recargar (audio.html: advanceAndRestart). */
  var CANTOS_DATA = null, cantosNivelId = null;

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

  /* ═══════════ Una instancia de karaoke ═══════════ */
  function create(cfg) {
    cfg = cfg || {};
    var P = cfg.id || 'canto';                 // prefijo de ids: cada instancia, el suyo
    var hasSkip  = !!cfg.onSkip;               // sin onSkip no hay botón "Saltar" (galería)
    var controls = cfg.controls || ['back10', 'playpause'];

    // Letra en memoria
    var lrcText = null, letraTxt = null, titulo = '', events = [];
    // Pantalla
    var open = false, isStatic = false, instantSkip = false;
    var raf = 0, curLine = -1;
    var imgUrls = [], imgIdx = -1, frontA = true;

    var id = {
      root:  'scr-' + P,             title: P + '-title',      lyrics: P + '-lyrics',
      track: P + '-lyric-track',     skip:  P + '-skip',       stills: P + '-stills',
      pp:    P + '-play-pause',      ipl:   P + '-ico-play',   ips:    P + '-ico-pause',
      back10: P + '-back10',         fwd10: P + '-fwd10',      prev:   P + '-prev',  next: P + '-next',
      layA:  P + '-layA',            layB:  P + '-layB',       kbA:    P + '-kbA',   kbB:  P + '-kbB'
    };

    // Un botón de la barra por token. play/pausa lleva sus dos iconos (estado real).
    function ctrlButton(tok) {
      if (tok === 'playpause') {
        return '<button class="canto-cbtn primary" id="' + id.pp + '" aria-label="Pausar">' +
          '<svg id="' + id.ipl + '" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" style="display:none"><polygon points="5 3 19 12 5 21 5 3"/></svg>' +
          '<svg id="' + id.ips + '" width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' +
          '</button>';
      }
      var bid = { prev: id.prev, back10: id.back10, fwd10: id.fwd10, next: id.next }[tok];
      var lbl = { prev: 'Pista anterior', back10: 'Retroceder 10 segundos', fwd10: 'Adelantar 10 segundos', next: 'Pista siguiente' }[tok];
      if (!bid) return '';
      return '<button class="canto-cbtn" id="' + bid + '" aria-label="' + lbl + '">' + SVG[tok] + '</button>';
    }

    /* ─── Marcado (inyectado una vez) ─── */
    function mount() {
      if ($(id.root)) return;
      var el = document.createElement('div');
      el.id = id.root;
      el.className = 'karaoke';
      el.innerHTML =
        '<div class="canto-stills" id="' + id.stills + '">' +
          '<div class="canto-lay front" id="' + id.layA + '"><div class="canto-kb" id="' + id.kbA + '"></div></div>' +
          '<div class="canto-lay"       id="' + id.layB + '"><div class="canto-kb" id="' + id.kbB + '"></div></div>' +
        '</div>' +
        '<div class="canto-scrim"></div>' +
        '<div class="canto-head">' +
          '<div class="canto-kicker">' + (cfg.kicker || 'Canto') + '</div>' +
          '<div class="canto-title" id="' + id.title + '"></div>' +
        '</div>' +
        '<div class="canto-lyrics" id="' + id.lyrics + '"><div class="canto-track" id="' + id.track + '"></div></div>' +
        (hasSkip
          ? '<button class="canto-skip" id="' + id.skip + '"><span>Saltar</span>' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4l10 8-10 8zM17 4h2v16h-2z"/></svg></button>'
          : '') +
        '<div class="canto-ctrls">' + controls.map(ctrlButton).join('') + '</div>';
      document.body.appendChild(el);

      if (hasSkip && $(id.skip)) $(id.skip).onclick = skipPressed;
      if ($(id.pp))     $(id.pp).onclick     = function () { if (cfg.onPlayPause) cfg.onPlayPause(); };
      if ($(id.back10)) $(id.back10).onclick = back10;
      if ($(id.fwd10))  $(id.fwd10).onclick  = fwd10;
      if ($(id.prev))   $(id.prev).onclick   = function () { if (cfg.onPrev) cfg.onPrev(); };
      if ($(id.next))   $(id.next).onclick   = function () { if (cfg.onNext) cfg.onNext(); };

      // Swipe horizontal — solo en la galería (prev/next). SIN stop: el evento sigue
      // burbujeando, así el edgeGuard de gestures.js conserva el swipe-atrás nativo y
      // el swipe vertical llega al handler de la página (que lo ignora con el karaoke abierto).
      // Convención igual que el hero de cantos.html: izquierda = siguiente, derecha = anterior.
      if ((cfg.onPrev || cfg.onNext) && window.CZGestures) {
        window.CZGestures.swipe(el, {
          onLeft:  function () { if (cfg.onNext) cfg.onNext(); },
          onRight: function () { if (cfg.onPrev) cfg.onPrev(); }
        });
      }
    }

    /* ─── Precarga: la letra del contenido en curso ─── */
    function preload() {
      lrcText = null; letraTxt = null; titulo = '';
      return fetch(cfg.getLrcUrl())
        .then(function (r) { return r.ok ? r.text() : null; })
        .then(function (t) {
          // Sin marcas de tiempo no sirve para karaoke: se tratará como letra estática
          if (t && /\[\d+:\d/.test(t)) lrcText = t;
        })
        .catch(function () { /* sin .lrc: se intenta la letra de respaldo */ })
        .then(function () { return cfg.loadFallbackLetra ? cfg.loadFallbackLetra() : null; })
        .then(function (f) {
          if (f) { letraTxt = f.letra || null; titulo = f.titulo || ''; }
        })
        .catch(function () { /* sin respaldo: si tampoco hay .lrc, no se abre la pantalla */ })
        .then(function () {
          // Si la precarga llegó tarde (red lenta, o salto directo), abre ahora
          if (!open && cfg.isOpenNow && cfg.isOpenNow()) openK();
        });
    }

    /* ─── Construir el contenido (título, letra, fondo) — reutilizado por open y reload ─── */
    function buildContent() {
      isStatic = !lrcText;
      curLine = -1; imgIdx = -1; imgUrls = []; frontA = true;

      $(id.title).textContent = titulo || (cfg.getTitulo ? cfg.getTitulo() : '') || '';

      var lyrics = $(id.lyrics), track = $(id.track);
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
      // que sincronizar, y con instantSkip el contenido es opcional: desde el inicio.
      if (hasSkip) $(id.skip).classList.toggle('show', isStatic || instantSkip);
    }

    /* ─── Abrir / cerrar ─── */
    function openK(opts) {
      opts = opts || {};
      if (open) return;
      var hasStatic = !!(letraTxt && letraTxt.trim());
      // Sin .lrc y sin letra no abrimos nada: suena el audio y se ve lo que hubiera
      // debajo. allowNoLyrics lo fuerza (el usuario ha pedido esta pantalla a propósito).
      if (!lrcText && !hasStatic && !opts.allowNoLyrics) return;

      instantSkip = !!opts.instantSkip;
      open        = true;
      buildContent();

      if (cfg.onOpen) cfg.onOpen();
      detectImages();
      $(id.root).classList.add('open');
      syncIcon();
      raf = requestAnimationFrame(tick);
    }

    function closeK() {
      if (!open) return;
      open = false;
      cancelAnimationFrame(raf); raf = 0;
      $(id.root).classList.remove('open');
      if (hasSkip) $(id.skip).classList.remove('show');
      if (cfg.onClose) cfg.onClose();
    }

    /* ─── Cambiar de contenido SIN cerrar (galería: prev/next) ───
       La página ya cambió su audio antes de llamar; aquí se recarga la letra/fondo del
       nuevo canto y se anima. dir 'next' desliza el fondo hacia la izquierda (avanza);
       'prev' hacia la derecha. La letra hace cross-fade (deslizarla se lee mal). */
    function reload(opts) {
      opts = opts || {};
      var dir = opts.dir === 'prev' ? 'prev' : 'next';
      if (!open) return preload().then(function () { openK(opts); });
      return preload().then(function () {
        if (reduceMotion) { buildContent(); detectImages(); syncIcon(); return; }
        slideSwap(dir);
      });
    }

    function slideSwap(dir) {
      var stills = $(id.stills), lyrics = $(id.lyrics);
      var exitTo    = dir === 'prev' ? '100%'  : '-100%';
      var enterFrom = dir === 'prev' ? '-100%' : '100%';

      stills.style.transition = 'transform .22s ease';
      stills.style.transform  = 'translateX(' + exitTo + ')';
      lyrics.style.transition = 'opacity .16s ease';
      lyrics.style.opacity    = '0';

      setTimeout(function () {
        buildContent();
        detectImages();
        // Entra desde el lado opuesto y se desliza a su sitio
        stills.style.transition = 'none';
        stills.style.transform  = 'translateX(' + enterFrom + ')';
        void stills.offsetWidth;
        stills.style.transition = 'transform .26s ease';
        stills.style.transform  = 'translateX(0)';
        lyrics.style.opacity    = '1';
        syncIcon();   // el nuevo canto ya suena: refleja play/pausa real
      }, 230);
    }

    /* ─── Bucle ───
       Lee el audio VIGENTE en cada frame (audio.html reasigna su elemento por track),
       así que nunca se queda con una referencia muerta: si desaparece, se apaga solo. */
    function tick() {
      var a = cfg.getAudio();
      if (!open || !a) { closeK(); return; }
      render(a.currentTime);
      raf = requestAnimationFrame(tick);
    }

    function render(cur) {
      var a = cfg.getAudio();

      // Fondo: las imágenes del carrusel se reparten uniformemente por la duración
      var n = imgUrls.length;
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

      if (hasSkip && cur >= SKIP_AT) $(id.skip).classList.add('show');
    }

    function setActiveLine(idx) {
      var track = $(id.track), kids = track.children;
      for (var i = 0; i < kids.length; i++) {
        kids[i].classList.toggle('active', i === idx);
        kids[i].classList.toggle('near', Math.abs(i - idx) === 1);
      }
      if (idx >= 0 && kids[idx]) {
        var el = kids[idx];
        var anchor = $(id.lyrics).clientHeight * 0.42;
        var y = el.offsetTop + el.offsetHeight / 2;
        track.style.transform = 'translateY(' + (anchor - y) + 'px)';
      }
    }

    /* ─── Fondo: carrusel, con degradación a la imagen única ─── */
    // Por defecto prueba los candidatos y para en el primer hueco (los cantos numeran
    // a,b,c… sin saltos). imgTolerateGaps: prueba todas y se queda con las que existan
    // (letanías). imgTrust: confía en la lista (manifiesto ya resuelto) y no prueba nada.
    function detectImages() {
      imgUrls = []; imgIdx = -1;
      var cands = (cfg.getImgCandidates ? cfg.getImgCandidates() : []) || [];

      if (cfg.imgTrust) {
        imgUrls = cands.slice();
        if (imgUrls.length) { imgIdx = 0; showImg(0, FALLBACK_SEC); }
        else finishDetect();
        return;
      }

      var i = 0;
      (function probe() {
        if (!open) return;
        if (i >= cands.length) { finishDetect(); return; }
        var url = cands[i];
        var im = new Image();
        im.onload = function () {
          imgUrls.push(url);
          if (imgUrls.length === 1 && imgIdx < 0) { imgIdx = 0; showImg(0, FALLBACK_SEC); }
          i++; probe();
        };
        im.onerror = function () {
          if (!cfg.imgTolerateGaps) { finishDetect(); return; }   // primer hueco => fin
          i++; probe();                                            // hueco tolerado => sigue
        };
        im.src = url;
      })();
    }

    // Sin carrusel: la imagen única (la misma que ya se ve debajo, así que está cacheada)
    function finishDetect() {
      if (imgUrls.length > 0) return;
      var still = cfg.getStillUrl ? cfg.getStillUrl() : null;
      if (still) showStill(still);
    }

    function layers() {
      return frontA
        ? { inLay: $(id.layB), inKb: $(id.kbB), outLay: $(id.layA) }
        : { inLay: $(id.layA), inKb: $(id.kbA), outLay: $(id.layB) };
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
      var url = imgUrls[idx];
      if (!url) return;
      var L = layers();
      var dirs = [['-3%','-2%'], ['3%','-3%'], ['-2%','3%'], ['2%','2%']];
      var pan = dirs[idx % dirs.length], zoom = (idx % 2 === 0) ? 1.09 : 1.06;
      if (reduceMotion) { zoom = 1; pan = ['0%','0%']; }
      paint(L.inKb, url, zoom, pan[0], pan[1], Math.max(8, segDur || FALLBACK_SEC));
      L.inLay.classList.add('front'); L.outLay.classList.remove('front');
      frontA = !frontA;
    }

    function showStill(url) {
      var L = layers();
      paint(L.inKb, url, reduceMotion ? 1 : 1.06, '0%', '0%', 30);
      L.inLay.classList.add('front'); L.outLay.classList.remove('front');
      frontA = !frontA;
    }

    /* ─── Controles ─── */
    // El icono refleja el estado real de reproducción de la página.
    function syncIcon() {
      var play = $(id.ipl), pause = $(id.ips);
      if (!play || !pause) return;
      var playing = !!(cfg.isPlaying && cfg.isPlaying());
      play.style.display  = playing ? 'none' : 'block';
      pause.style.display = playing ? 'block' : 'none';
    }

    // Si la página trae su propio −10s (que además refresca su barra), se usa el suyo.
    function back10() {
      if (cfg.onBack10) { cfg.onBack10(); return; }
      var a = cfg.getAudio();
      if (!a) return;
      a.currentTime = Math.max(0, a.currentTime - 10);
      render(a.currentTime);
    }

    function fwd10() {
      if (cfg.onFwd10) { cfg.onFwd10(); return; }
      var a = cfg.getAudio();
      if (!a) return;
      var top = (a.duration && isFinite(a.duration)) ? a.duration : Infinity;
      a.currentTime = Math.min(top, a.currentTime + 10);
      render(a.currentTime);
    }

    /* Saltar. El motor cierra la pantalla ANTES de delegar, así ningún consumidor
       puede olvidarse y dejar el karaoke colgado sobre la pantalla siguiente.
       Si la configuración pide confirmación, la pantalla sigue en pie mientras el
       usuario decide: si dice que no, no ha pasado nada. */
    function skipPressed() {
      if (!cfg.onSkip) return;
      if (!cfg.confirmSkip) { closeK(); cfg.onSkip(); return; }
      Promise.resolve(cfg.confirmSkip()).then(function (si) {
        if (!si) return;
        closeK();
        cfg.onSkip();
      });
    }

    mount();

    return {
      preload:  preload,
      open:     openK,
      reload:   reload,
      close:    closeK,
      isOpen:   function () { return open; },
      syncIcon: syncIcon
    };
  }

  window.Karaoke = {
    create:     create,
    // Utilidades que las páginas necesitan fuera del karaoke
    // (audio.html: desbloqueo de unlockedCantos al cerrar un bloque).
    parseLrc:   parseLrc,
    loadCantos: loadCantos,
    getCanto:   getCanto
  };
})();
