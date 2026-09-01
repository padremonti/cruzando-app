// ═══════════════════════════════════════════════════════════════════
// CruzAndo — la pantalla de la vuelta completa del Nivel
// ═══════════════════════════════════════════════════════════════════
//
// Cuando alguien recorre OTRA VEZ los veinte Misterios de un Nivel no está
// avanzando: está volviendo. El rosetón es el hito y no se repite; esto es el
// reconocimiento de la repetición, que es donde vive la costumbre.
//
// No celebra: reconoce, y ofrece tomar conciencia por escrito. El "Ahora no"
// está siempre y no cuesta nada — la misma regla que las Letanías.
//
// ── Uso ────────────────────────────────────────────────────────────
//   Vuelta.mostrar({
//     nivelNombre: 'Cruz 1-3: Conversión',
//     pregunta:    '¿Qué has descubierto en esta ocasión?',
//     onGuardar:   texto => escribirEnFirestore(texto)   // la página hace su E/S
//   }).then(() => seguirConLoQueVenga);
//
// Autosuficiente como toast.js y racha-splash.js: inyecta su CSS una vez y monta
// el velo bajo demanda. Una página que la quiera solo añade el <script>.
(function () {
  'use strict';

  var CSS_ID = 'vuelta-css';
  var PREGUNTA = '¿Qué has descubierto en esta ocasión?';

  var LUX =
    '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<rect x="46.2" y="0" width="7.6" height="100" fill="#F3EAD8"/>' +
    '<rect x="0" y="36" width="100" height="7.6" fill="#F3EAD8"/></svg>';

  function hoja() {
    if (document.getElementById(CSS_ID)) return;
    /* Por <link>, no en línea: la hoja es larga y así se cachea igual que
       canto.css o cierre.css. Si la página ya la trae, esto no hace nada. */
    var yaEsta = Array.prototype.some.call(document.styleSheets, function (s) {
      return (s.href || '').indexOf('vuelta.css') !== -1;
    });
    if (yaEsta) return;
    var l = document.createElement('link');
    l.id = CSS_ID; l.rel = 'stylesheet'; l.href = 'vuelta.css';
    document.head.appendChild(l);
  }

  function el(tag, clase, texto) {
    var e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  var abierta = false;

  function mostrar(opts) {
    opts = opts || {};
    if (abierta || typeof document === 'undefined') return Promise.resolve(false);
    abierta = true;
    hoja();

    var velo = el('div', 'vuelta-velo');
    velo.setAttribute('role', 'dialog');
    velo.setAttribute('aria-label', 'Has recorrido de nuevo este Nivel');

    var lux = el('div', 'vuelta-lux'); lux.innerHTML = LUX;
    velo.appendChild(lux);
    velo.appendChild(el('div', 'vuelta-kicker', 'Vuelta completa'));
    if (opts.nivelNombre) velo.appendChild(el('div', 'vuelta-nombre', opts.nivelNombre));
    /* "de nuevo", no "por segunda vez": el número exacto es rígido y a la
       tercera o la décima vuelta suena a contabilidad, no a reconocimiento. */
    velo.appendChild(el('div', 'vuelta-linea', 'Has recorrido de nuevo este Nivel.'));
    velo.appendChild(el('div', 'vuelta-pregunta', opts.pregunta || PREGUNTA));

    var acciones = el('div', 'vuelta-acciones');
    var bEscribir = el('button', 'vuelta-btn primario', 'Escribir en mi diario');
    var bLuego    = el('button', 'vuelta-btn discreto', 'Ahora no');
    acciones.appendChild(bEscribir);
    acciones.appendChild(bLuego);
    velo.appendChild(acciones);

    var caja = el('div', 'vuelta-escribir');
    var area = el('textarea', 'vuelta-area');
    area.setAttribute('placeholder', 'Escribe lo que has descubierto…');
    area.setAttribute('aria-label', opts.pregunta || PREGUNTA);
    var fila = el('div', 'vuelta-fila');
    var bGuardar  = el('button', 'vuelta-btn primario', 'Guardar');
    var bCancelar = el('button', 'vuelta-btn', 'Cancelar');
    var aviso = el('div', 'vuelta-aviso', '');
    fila.appendChild(bCancelar); fila.appendChild(bGuardar);
    caja.appendChild(area); caja.appendChild(fila); caja.appendChild(aviso);
    velo.appendChild(caja);

    document.body.appendChild(velo);
    requestAnimationFrame(function () { velo.classList.add('dentro'); });

    return new Promise(function (resolver) {
      var cerrado = false;
      function cerrar(guardado) {
        if (cerrado) return;
        cerrado = true;
        velo.classList.remove('dentro');
        velo.classList.add('fuera');
        setTimeout(function () {
          if (velo.parentNode) velo.parentNode.removeChild(velo);
          abierta = false;
          resolver(!!guardado);
        }, 320);
      }

      bLuego.onclick = function () { cerrar(false); };

      bEscribir.onclick = function () {
        velo.classList.add('escribiendo');
        setTimeout(function () { try { area.focus(); } catch (e) {} }, 60);
      };

      bCancelar.onclick = function () {
        /* Cancelar vuelve a la oferta, no cierra: quien se arrepiente de
           escribir puede seguir queriendo el reconocimiento en pantalla. */
        velo.classList.remove('escribiendo');
        aviso.textContent = '';
      };

      bGuardar.onclick = function () {
        var texto = (area.value || '').trim();
        if (!texto) { aviso.textContent = 'Escribe algo, o cierra con "Cancelar".'; return; }
        bGuardar.disabled = true;
        aviso.textContent = 'Guardando…';
        /* Si la red falla NO se pierde el escrito ni se cierra la pantalla:
           se avisa y el texto sigue ahí para reintentar. */
        Promise.resolve()
          .then(function () { return opts.onGuardar ? opts.onGuardar(texto) : true; })
          .then(function () { cerrar(true); })
          .catch(function () {
            bGuardar.disabled = false;
            aviso.textContent = 'No se pudo guardar. Inténtalo de nuevo.';
          });
      };

      // Red de seguridad: si algo saliera mal montando la pantalla, no encerrar.
      if (!velo.parentNode) cerrar(false);
    });
  }

  window.Vuelta = { mostrar: mostrar, PREGUNTA: PREGUNTA, abierta: function () { return abierta; } };
}());
