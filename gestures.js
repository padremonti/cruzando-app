/* gestures.js — Gestos de navegación unificados de CruzAndo.
   Cargar como utils.js (script plano, antes de los módulos) en toda página con gestos.

   El problema que resuelve: iOS/WebKit navega atrás y adelante con el swipe desde los
   bordes de la pantalla. Ese gesto se llevaba al usuario fuera de la sesión (cortando el
   audio y recargando Firebase) o a una entrada muerta del historial. Aquí lo cancelamos
   y damos a cada página un "atrás" propio, que ella define.

   Uso típico:
     CZGestures.init({ onBack: function(){
       if (popupAbierto()) { cerrarPopup(); return true; }   // true = la página se queda
       goTo('index.html');                                   // sin true = la página se va
     }});
     CZGestures.swipe(el, { onLeft: fn, onUp: fn, ignore: fn });
*/
(function () {
  var EDGE  = 28;    // franja de borde que WebKit reserva para su gesto de atrás/adelante
  var MAXMS = 500;   // más lento que esto no es un swipe, es un arrastre
  var MINDX = 70;
  var MINDY = 50;
  var DOM   = 1.5;   // dominancia: cuánto debe superar un eje al otro

  function esControl(t) {
    return !!(t && t.closest && t.closest('button,a,input,textarea,select,label'));
  }

  /* Cancela el gesto nativo de atrás/adelante. Solo un touchstart NO pasivo puede hacerlo.
     Los controles pegados al borde (flechas del hero, ítems del drawer) siguen respondiendo. */
  function edgeGuard() {
    document.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      var x = e.touches[0].clientX;
      if (x > EDGE && x < window.innerWidth - EDGE) return;
      if (esControl(e.target)) return;
      e.preventDefault();
    }, { passive: false });
  }

  /* Red de seguridad: si un gesto se cuela, o el usuario pulsa el atrás de Android o del
     navegador, no dejamos que la página se abandone a ciegas — la decisión es de onBack().
     onBack() devuelve true si la página gestionó el atrás y se queda (cerró un popup, abrió
     un diálogo); si navega o no hace nada, no devuelve nada. */
  function historyTrap(onBack) {
    var armar = function () { history.pushState({ cz: 1 }, '', location.href); };
    armar();
    window.addEventListener('popstate', function () {
      var seQueda = false;
      try { seQueda = onBack ? onBack() === true : false; } catch (err) { }
      if (seQueda) armar();
    });
  }

  /* Swipe con umbral, dominancia de eje y límite de tiempo — los tres filtros que evitan
     que un scroll con deriva lateral dispare una navegación.
     opts: { onLeft, onRight, onUp, onDown, minDx, minDy, maxMs, ignore, stop } */
  function swipe(el, opts) {
    if (!el || !opts) return;
    var sx = 0, sy = 0, st = 0, ok = false;
    var minDx = opts.minDx || MINDX;
    var minDy = opts.minDy || MINDY;
    var maxMs = opts.maxMs || MAXMS;

    el.addEventListener('touchstart', function (e) {
      if (opts.stop) e.stopPropagation();
      ok = e.touches.length === 1 && !(opts.ignore && opts.ignore(e));
      if (!ok) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      st = e.timeStamp;
    }, { passive: true });

    el.addEventListener('touchend', function (e) {
      if (opts.stop) e.stopPropagation();
      if (!ok) return;
      ok = false;
      if (e.timeStamp - st > maxMs) return;
      var dx = e.changedTouches[0].clientX - sx;
      var dy = e.changedTouches[0].clientY - sy;
      var ax = Math.abs(dx), ay = Math.abs(dy);
      if (ax > minDx && ax > ay * DOM) {
        var hz = dx < 0 ? opts.onLeft : opts.onRight;
        if (hz) hz(e);
      } else if (ay > minDy && ay > ax * DOM) {
        var vt = dy < 0 ? opts.onUp : opts.onDown;
        if (vt) vt(e);
      }
    }, { passive: true });
  }

  /* overscroll-behavior mata el swipe-atrás de Chrome/Android; en iOS lo hace edgeGuard(). */
  function estilos() {
    var s = document.createElement('style');
    s.textContent = 'html,body{overscroll-behavior:none}';
    document.head.appendChild(s);
  }

  function init(opts) {
    opts = opts || {};
    estilos();
    edgeGuard();
    if (opts.onBack) historyTrap(opts.onBack);
  }

  window.CZGestures = {
    EDGE: EDGE, MAXMS: MAXMS, MINDX: MINDX, MINDY: MINDY,
    init: init, edgeGuard: edgeGuard, historyTrap: historyTrap, swipe: swipe
  };
}());
