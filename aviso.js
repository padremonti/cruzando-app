// ═══════════════════════════════════════════════════════════════════
// CruzAndo — el aviso: la pantalla que dice algo y ofrece qué hacer
// ═══════════════════════════════════════════════════════════════════
//
// Sustituye a cinco pantallas que venían de otra época —la celebración del
// Rezo, la del Libro, el candado diario del free, "contenido en camino" y el
// error de Nivel— y que compartían el mismo molde: un emoji de 3rem, texto
// plano y botones con estilos escritos EN LÍNEA, repetidos a mano en tres
// archivos. Ninguna hablaba el idioma que ya tienen el decenario, el Rosario,
// el rosetón y la vuelta.
//
// ⚠️ NO es un velo. Se pinta DENTRO del contenedor que la página ya controla
// (#scr-celebration, #scr-daily-limit, #scr-coming-soon, #scr-error), así que
// cada modo conserva su navegación, su show() y su z-index. Cambia la fachada,
// no la máquina.
//
// ── Uso ────────────────────────────────────────────────────────────
//   Aviso.pintar('celeb-aviso', {
//     acento:  COLORES_BLOQUE.gozosos,
//     kicker:  'Rosario recorrido',
//     titulo:  'Misterios Gozosos',
//     cuerpo:  'Recorriste cinco Misterios. Tu peregrinación sigue en los Luminosos.',
//     dato:    '+1.000 m',                    // opcional
//     cuenta:  'medianoche',                  // opcional: reloj vivo hasta las 00:00
//     nota:    'Con Premium avanzas sin límite diario.',   // opcional
//     acciones: [
//       { texto:'Rezar Luminosos',  tipo:'primario', onClick: () => goTo(url) },
//       { texto:'Volver al camino', tipo:'discreto', onClick: () => goTo('crecer.html') }
//     ]
//   });
//
// Autosuficiente como toast.js y vuelta.js: se trae su CSS si la página no lo
// declaró. Una página que lo quiera solo añade el <script>.
(function () {
  'use strict';

  var CSS_ID = 'aviso-css';

  var LUX =
    '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    '<rect x="46.2" y="0" width="7.6" height="100" fill="currentColor"/>' +
    '<rect x="0" y="36" width="100" height="7.6" fill="currentColor"/></svg>';

  function hoja() {
    if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return;
    var yaEsta = Array.prototype.some.call(document.styleSheets || [], function (s) {
      try { return (s.href || '').indexOf('aviso.css') !== -1; } catch (e) { return false; }
    });
    if (yaEsta) return;
    var l = document.createElement('link');
    l.id = CSS_ID; l.rel = 'stylesheet'; l.href = 'aviso.css';
    document.head.appendChild(l);
  }

  function el(tag, clase, texto) {
    var e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  /* Un reloj por contenedor: montar otro aviso encima cancela el anterior, así
     que un intervalo huérfano no puede quedar latiendo contra un nodo muerto. */
  var relojes = {};

  function pararReloj(id) {
    if (relojes[id]) { clearInterval(relojes[id]); delete relojes[id]; }
  }

  /* Cuánto falta para mañana, hasta el SEGUNDO. Antes se decía "en 7h" a secas,
     y a las 23:05 eso era falso: faltaba menos de una hora. */
  function faltaParaManana() {
    var m = new Date();
    m.setDate(m.getDate() + 1);
    m.setHours(0, 0, 0, 0);
    var s = Math.max(0, Math.floor((m - Date.now()) / 1000));
    var h = Math.floor(s / 3600); s -= h * 3600;
    var mi = Math.floor(s / 60);  s -= mi * 60;
    return 'Nueva sesión en ' + h + ' h ' +
           String(mi).padStart(2, '0') + ' m ' + String(s).padStart(2, '0') + ' s';
  }

  function pintar(destino, opts) {
    if (typeof document === 'undefined') return null;
    opts = opts || {};
    var cont = (typeof destino === 'string') ? document.getElementById(destino) : destino;
    if (!cont) return null;
    hoja();

    var id = cont.id || '_aviso';
    pararReloj(id);

    var caja = el('div', 'aviso' + (opts.enFlujo ? ' en-flujo' : ''));
    caja.setAttribute('role', 'status');
    if (opts.acento) caja.style.setProperty('--av-color', opts.acento);

    var lux = el('div', 'aviso-lux'); lux.innerHTML = LUX;
    caja.appendChild(lux);

    if (opts.kicker) caja.appendChild(el('div', 'aviso-kicker', opts.kicker));
    caja.appendChild(el('div', 'aviso-titulo', opts.titulo || ''));
    if (opts.cuerpo) caja.appendChild(el('p', 'aviso-cuerpo', opts.cuerpo));

    if (opts.dato) caja.appendChild(el('div', 'aviso-dato', opts.dato));

    var reloj = null;
    if (opts.cuenta === 'medianoche') {
      reloj = el('div', 'aviso-dato', faltaParaManana());
      caja.appendChild(reloj);
    }

    if (opts.nota) caja.appendChild(el('p', 'aviso-nota', opts.nota));

    var acciones = (opts.acciones || []).filter(Boolean);
    if (acciones.length) {
      var fila = el('div', 'aviso-acciones');
      acciones.forEach(function (a) {
        var b = el('button', 'aviso-btn ' + (a.tipo || 'secundario'), a.texto);
        b.type = 'button';
        if (a.onClick) b.onclick = a.onClick;
        fila.appendChild(b);
      });
      caja.appendChild(fila);
    }

    cont.innerHTML = '';
    cont.appendChild(caja);

    /* El reloj arranca DESPUÉS de montar: si el nodo se va, el intervalo se
       para solo en el siguiente tic en vez de escribir contra la nada. */
    if (reloj) {
      relojes[id] = setInterval(function () {
        if (!reloj.isConnected) { pararReloj(id); return; }
        reloj.textContent = faltaParaManana();
      }, 1000);
    }
    return caja;
  }

  window.Aviso = { pintar: pintar, parar: pararReloj, _falta: faltaParaManana };
}());
