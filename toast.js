// ═══════════════════════════════════════════════════════════════════
// CruzAndo — el aviso breve (toast)
// ═══════════════════════════════════════════════════════════════════
//
//   showToast('¡Bienvenido a CruzAndo Premium! 🎉')
//
// Existe porque no existía. index y crecer llamaban a `showToast` en tres
// sitios —los dos avisos de bienvenida tras el checkout y el de tutoriales
// reactivados— pero la función solo vivía dentro de audio.html. Las tres
// llamadas van tras `if (window.showToast)`, así que no reventaban: el
// aviso simplemente NUNCA salía. Lo cazó tools/test-globales.js.
//
// ── Por qué un módulo y no una cuarta copia ────────────────────────
// El aviso de audio está pegado a su pantalla: un <div> estático en el
// HTML y CSS que depende de --lvl-soft, el color del bloque que se está
// rezando. Copiarlo a index y crecer habría dejado tres implementaciones
// del mismo objeto, que es justo la deriva que este repo ya pagó con el
// color de bloque y con las tablas del itinerario.
//
// Este es autosuficiente, como racha-splash.js: inyecta su CSS una vez y
// monta el elemento bajo demanda. Una página que lo quiera solo carga el
// <script>; no hay que tocarle el HTML ni el CSS.
//
// ── Sobre el material ──────────────────────────────────────────────
// Va CENTRADO sobre la barra de navegación, no en la esquina. El de audio
// es una notificación de metros —discreta, abajo a la derecha, mientras se
// reza—; estos son anuncios que el usuario tiene que leer ("bienvenido a
// Premium"), y son largos: en la esquina de un teléfono de 390 px el texto
// se parte feo o se sale.
//
// Los colores salen de los tokens de la página (--card, --border, --text,
// --brand-soft) con respaldo horneado, así que sigue al tema claro/oscuro
// sin saber nada de él, y no se rompe en una página que no los defina.
//
// ⚠️ audio.html conserva SU aviso a propósito, igual que mini conserva su
// karaoke: el suyo se tiñe con el color del bloque y vive en su barra de
// herramientas. Adoptar este allí es una decisión visual, no de código.
(function () {
  'use strict';

  var Z          = 300;    // sobre la barra de navegación (100) y las tarjetas;
                           // muy por debajo del splash de racha (950)
  var T_VISIBLE  = 2600;   // un poco más que los 2200 de audio: estos textos
                           // son frases, no un "+150 m"
  var T_SALIDA   = 260;
  var ID_ESTILOS = 'cruzando-toast-estilos';
  var ID_NODO    = 'cruzando-toast';

  var CSS = [
    '#' + ID_NODO + '{',
    '  position:fixed;z-index:' + Z + ';',
    '  left:50%;bottom:calc(78px + env(safe-area-inset-bottom, 0px));',
    '  transform:translate(-50%,10px);',
    '  max-width:min(88vw,420px);box-sizing:border-box;',
    '  padding:10px 18px;border-radius:22px;',
    '  background:var(--card,#004C5B);',
    '  border:1.5px solid var(--border,rgba(255,255,255,.18));',
    '  color:var(--text,#F0E6DA);',
    '  font-family:inherit;font-size:0.85rem;font-weight:700;line-height:1.35;',
    '  text-align:center;text-wrap:balance;',
    '  box-shadow:0 6px 22px var(--shadow,rgba(0,0,0,.45));',
    '  opacity:0;pointer-events:none;',
    '  transition:opacity .25s ease, transform .25s ease}',
    '#' + ID_NODO + '.mostrar{opacity:1;transform:translate(-50%,0)}',
    /* Sin barra de navegación (páginas a pantalla completa) baja al pie. */
    '#' + ID_NODO + '.sin-nav{bottom:calc(24px + env(safe-area-inset-bottom, 0px))}',
    '@media (prefers-reduced-motion: reduce){',
    '  #' + ID_NODO + '{transition:opacity .12s linear;transform:translate(-50%,0)}',
    '  #' + ID_NODO + '.mostrar{transform:translate(-50%,0)}}'
  ].join('');

  var nodo   = null;
  var timers = [];

  function limpiarTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function montar() {
    if (!document.getElementById(ID_ESTILOS)) {
      var st = document.createElement('style');
      st.id = ID_ESTILOS;
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    if (nodo && nodo.isConnected) return nodo;
    nodo = document.getElementById(ID_NODO);
    if (!nodo) {
      nodo = document.createElement('div');
      nodo.id = ID_NODO;
      nodo.setAttribute('role', 'status');        // el lector de pantalla lo anuncia
      nodo.setAttribute('aria-live', 'polite');   // sin interrumpir lo que esté leyendo
      document.body.appendChild(nodo);
    }
    // Si la página no tiene barra de navegación, el aviso no debe flotar en el aire.
    if (!document.querySelector('.app-nav')) nodo.classList.add('sin-nav');
    return nodo;
  }

  function showToast(texto) {
    if (texto === null || texto === undefined) return;
    if (!document.body) {   // llamado antes de que exista el body: esperar y reintentar
      document.addEventListener('DOMContentLoaded', function () { showToast(texto); }, { once: true });
      return;
    }
    var el = montar();

    // Dos avisos seguidos no se apilan: el segundo releva al primero y
    // reinicia la cuenta, para que no desaparezca a medio leer.
    limpiarTimers();
    el.textContent = String(texto);

    // Un frame de margen: si el nodo acaba de nacer, sin esto el navegador
    // no ve el cambio de opacidad y el aviso aparece de golpe.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { el.classList.add('mostrar'); });
    });

    timers.push(setTimeout(function () { el.classList.remove('mostrar'); }, T_VISIBLE));
  }

  window.showToast = showToast;
  window.Toast = { mostrar: showToast, _z: Z, _visible: T_VISIBLE, _salida: T_SALIDA };
}());
