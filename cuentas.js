// ═══════════════════════════════════════════════════════════════════
// CruzAndo — columna de cuentas del rezo (motor pasivo compartido)
// ═══════════════════════════════════════════════════════════════════
//
// La columna que acompaña al rezo —1 Padrenuestro + 10 Ave Marías + la
// Cruz Lux— estaba copiada en los cuatro reproductores. audio y orar la
// tenían IDÉNTICA: 37 líneas con 4 de diferencia, y las 4 eran el nombre
// del elemento de audio (audioEl vs rezoEl). Este módulo es esa copia,
// una sola vez, con el elemento inyectado.
//
// ── Quién lo usa y quién no ────────────────────────────────────────
//   audio, orar  → lo usan (eran la misma copia)
//   mini         → misma lógica con otros nombres (#beadsCol, .bead-lux
//                  en oro). Puede adoptarlo cambiando la config; no se
//                  tocó por ser el ancestro divergente, igual que con
//                  canto.js.
//   rezar        → NO es el mismo motor: sus cuentas son INTERACTIVAS
//                  (el usuario las toca al rezar, con detección de
//                  toques, saltos y spam — lit-correct/lit-spam/
//                  beadCount). Es un superconjunto; forzarlo aquí sería
//                  arriesgar esa función sin necesidad.
//
// Los cuatro sí comparten `instantanea()`, que solo LEE el DOM: así la
// animación del decenario puede clonar la columna de cualquiera de ellos
// sin que ninguno tenga que adoptar el motor.
//
// ── Uso ────────────────────────────────────────────────────────────
//   const cuentas = Cuentas.crear({ audio: () => audioEl });
//   await cuentas.cargarSync();
//   cuentas.pista(track.url);     // en cada cambio de pista
//   cuentas.tick();               // en timeupdate
(function () {
  'use strict';

  var SYNC_URL = './data/bead_sync.json';
  var _cache   = {};                      // una sola descarga por página

  var LUX_HTML =
    '<div class="lux-glow"><svg width="22" height="22" viewBox="0 0 100 100">' +
    '<rect x="46.2" y="0" width="7.6" height="100" fill="white" opacity="0.95"/>' +
    '<rect x="0" y="36" width="100" height="7.6" fill="white" opacity="0.95"/>' +
    '</svg></div>';

  function crear(opts) {
    opts = opts || {};

    var idCol   = opts.col      || 'beads-col';
    var idWrap  = opts.wrap     || 'beads-col-wrap';
    var idLux   = opts.luxId    || 'bead-lux-cross';
    var clsLux  = opts.luxClase || 'bead-lux-cross';
    var luxHTML = opts.luxHTML  || LUX_HTML;
    var url     = opts.syncUrl  || SYNC_URL;
    /* Getter, no referencia: audio.html REASIGNA audioEl al abrir el canto del
       epílogo (audioEl = new Audio(...)). Guardar el elemento dejaría el tick
       mirando a un audio muerto. */
    var dameAudio = opts.audio  || function () { return null; };

    /* Al completar la decena, ¿la columna se queda? En audio sí: lo que el
       usuario acaba de rezar tiene que seguir en pantalla durante las preguntas
       y la oración final —hoy se le borraba en cuanto cambiaba la pista— y es
       además el "frame 1" del que parte la animación del decenario. */
    var congelarAlCompletar = opts.congelarAlCompletar === true;

    var sync = null, clave = null, congelada = false;

    function $(id) { return document.getElementById(id); }
    function col()  { return $(idCol); }
    function wrap() { return $(idWrap); }

    function cargarSync() {
      if (sync) return Promise.resolve(sync);
      if (_cache[url]) { sync = _cache[url]; return Promise.resolve(sync); }
      return fetch(url)
        .then(function (r) { return r.ok ? r.json() : {}; })
        .catch(function () { return {}; })
        .then(function (d) { sync = _cache[url] = d; return sync; });
    }

    function render() {
      var c = col(); if (!c) return;
      c.innerHTML = '';

      var pater = document.createElement('div');
      pater.className = 'bead-pater'; pater.id = 'bead-pater';
      c.appendChild(pater);

      var sep = document.createElement('div');
      sep.className = 'bead-sep';
      c.appendChild(sep);

      for (var i = 0; i < 10; i++) {
        var d = document.createElement('div');
        d.className = 'bead';
        c.appendChild(d);
      }

      var lux = document.createElement('div');
      lux.className = clsLux; lux.id = idLux;
      lux.innerHTML = luxHTML;
      c.appendChild(lux);
    }

    // idx 0 = Padrenuestro, 1-10 = Ave Marías
    function elemento(idx) {
      if (idx === 0) return $('bead-pater');
      return document.querySelectorAll('#' + idCol + ' .bead')[idx - 1] || null;
    }

    function mostrar() { var w = wrap(); if (w) w.style.display = 'flex'; }
    function ocultar() { var w = wrap(); if (w) w.style.display = 'none'; }

    /* La pista manda: si su nombre está en bead_sync la columna aparece (y se
       repinta si cambió de pista); si no, se esconde. */
    function pista(trackUrl) {
      /* La clave se calcula ANTES de mirar la congelación: hace falta para
         distinguir "esta pista no reza" (Q1, Q2, la oración final: ahí la
         columna congelada se queda tal cual) de "esta pista reza otra decena"
         (volver al rezo con los saltos de sección, o el Misterio siguiente:
         ahí hay que descongelar y empezar de nuevo). Antes se retornaba antes
         de calcularla, y una vez congelada la columna ya no volvía a arrancar
         en toda la sesión. */
      var hallada = null;
      if (sync && trackUrl) {
        var nombre = trackUrl.split('/').pop()
                       .replace(/\?.*$/, '')
                       .replace(/\.(m4a|mp3)$/i, '')
                       .toUpperCase();
        hallada = Object.keys(sync).filter(function (k) {
          return k.toUpperCase() === nombre;
        })[0] || null;
      }

      // Congelada: la decena ya se rezó y su columna se queda hasta el final
      // de la sesión. Ningún cambio de pista la borra... salvo otra decena.
      if (congelada) {
        if (!hallada || hallada === clave) return true;
        congelada = false;
      }

      if (!sync || !trackUrl) { clave = null; ocultar(); return false; }
      var cambio = (hallada !== clave);
      clave = hallada;
      if (hallada) { if (cambio) render(); mostrar(); return true; }
      ocultar();
      return false;
    }

    /* Misterio nuevo = cuentas desde cero, y eso incluye BORRARLAS.

       ⚠️ Aquí había un parámetro `repintar` opcional, y sin él "reiniciar" no
       reiniciaba nada visible: olvidaba la clave y escondía la columna, pero
       las once cuentas conservaban su `lit-normal` y la Cruz su `show`. audio
       pasaba `true`; orar no, y por eso al pasar al Misterio siguiente sin
       rezar el decenario del anterior seguía dando por buena la guarda —y como
       la columna estaba escondida, sus rects eran ceros y las cuentas salían
       volando desde la esquina (0,0). El parámetro era una trampa tendida: se
       repinta siempre. */
    function reiniciar() {
      clave = null;
      congelada = false;
      render();
      ocultar();
    }

    function congelar()     { congelada = true; }
    function descongelar()  { congelada = false; }
    function estaCongelada(){ return congelada; }

    function ventanas() { return (sync && clave) ? sync[clave] : null; }

    function tick() {
      /* Congelada = intocable. tick() no acumula estado: REPINTA las once
         cuentas desde cero a partir de currentTime en cada timeupdate. Al
         terminar el rezo y arrancar la pista siguiente, currentTime vuelve a
         ~0 mientras `clave` sigue apuntando a las ventanas del rezo (pista()
         retornó temprano por estar congelada), así que ninguna ventana había
         pasado y borraba las once tintas y apagaba la Cruz. La columna
         sobrevivía, pero vacía —y el decenario del final moría en la guarda,
         que exige justo esa Cruz—. El frame pintado un instante antes de
         congelar ya es el completo: conservarlo es todo lo que hay que hacer. */
      if (congelada) return;
      var el = dameAudio();
      if (!el || !clave || !sync) return;
      var vs = ventanas(); if (!vs) return;
      var t = el.currentTime;

      var activa = -1;
      for (var i = 0; i < vs.length; i++) {
        if (t >= vs[i].start && t <= vs[i].end) { activa = i; break; }
      }
      for (var j = 0; j < vs.length; j++) {
        var b = elemento(j); if (!b) continue;
        b.classList.remove('active', 'lit-normal');
        if (j === activa) b.classList.add('active');
        else if (t > vs[j].end) b.classList.add('lit-normal');
      }
      var lux = $(idLux);
      if (lux) {
        var ultima = vs[vs.length - 1];
        if (t > ultima.end) {
          lux.classList.add('show');
          // La Cruz aparece = la decena está entera. A partir de aquí la
          // columna es un decenario terminado, no un indicador de progreso.
          if (congelarAlCompletar) congelada = true;
        } else lux.classList.remove('show');
      }
    }

    /* ── Solo lectura: la foto de la columna tal como está ─────────────────
       El "frame 1" de la animación del decenario tiene que ser idéntico al
       último frame de la sesión, así que el clon se siembra con estas
       posiciones reales. No toca nada: sirve igual a mini y a rezar, que no
       usan este motor. */
    function instantanea() {
      var c = col();
      if (!c) return { cuentas: [], lux: null, rect: null };

      var out = [];
      for (var i = 0; i <= 10; i++) {
        var el = elemento(i);
        if (!el) continue;
        var cl = el.classList;
        out.push({
          idx:    i,
          tipo:   i === 0 ? 'pater' : 'ave',
          estado: cl.contains('active') ? 'activa'
                : (cl.contains('lit-normal') || cl.contains('lit-white') ||
                   cl.contains('lit-correct') || cl.contains('lit-spam')) ? 'rezada'
                : 'apagada',
          rect:   el.getBoundingClientRect ? el.getBoundingClientRect() : null
        });
      }

      var lx = $(idLux) || $('bead-lux');   // mini llama a la suya 'bead-lux'
      return {
        cuentas: out,
        lux: lx ? { visible: lx.classList.contains('show'),
                    rect: lx.getBoundingClientRect ? lx.getBoundingClientRect() : null }
                : null,
        rect: c.getBoundingClientRect ? c.getBoundingClientRect() : null
      };
    }

    return {
      cargarSync:  cargarSync,
      render:      render,
      elemento:    elemento,
      mostrar:     mostrar,
      ocultar:     ocultar,
      pista:       pista,
      reiniciar:   reiniciar,
      congelar:    congelar,
      descongelar: descongelar,
      estaCongelada: estaCongelada,
      tick:        tick,
      instantanea: instantanea,
      // para pruebas y depuración
      _clave:      function () { return clave; },
      _ventanas:   ventanas
    };
  }

  window.Cuentas = { crear: crear, LUX_HTML: LUX_HTML };
}());
