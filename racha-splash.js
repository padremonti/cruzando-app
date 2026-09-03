// ═══════════════════════════════════════════════════════════════════
// CruzAndo — splash de incremento de racha
// ═══════════════════════════════════════════════════════════════════
//
// Se muestra AL FINAL DE TODO, justo antes de volver al mapa, y solo el
// día en que la racha subió de verdad. La garantía de "una sola vez al
// día" no vive aquí: viene de que Racha.calcular es idempotente por día,
// así que el segundo modo que se rece hoy nunca marca nada.
//
//   registrarRachaHoy()  →  RachaSplash.marcar(de, a)   (si hubo cambio)
//   goTo('crecer.html')  →  await RachaSplash.mostrarSiHay()
//
// ── Sobre el material ──────────────────────────────────────────────
// La coreografía viene del demo y se conserva entera: el número viejo
// sube y se va, el nuevo entra desde abajo con rebote, la llama se
// enciende. Lo que cambia es de qué está hecho: NO una tarjeta con
// sombra sobre un velo gris —que es el registro de las apps de rachas—
// sino a sangre sobre el mismo velo hondo que usan la pantalla de canto
// y el diálogo de salida de mini. Así encadena con el cierre del
// Misterio en vez de apilarse encima como una segunda pantalla.
//
// Paleta propia y cerrada: --orange solo existe en index/crecer, y mini
// ni siquiera tiene --text. Sobre un velo oscuro el splash se ve igual
// en las cinco páginas y en los dos temas sin depender de nadie.
(function () {
  'use strict';

  var Z          = 950;    // sobre el epílogo (500), las celebraciones (900) y
                           // los cierres (940); bajo el aviso de salida (9999)
  var T_NUCLEO   = 2000;   // hasta el reposo
  var T_SALIDA   = 350;    // fundido final
  var ID_ESTILOS = 'racha-splash-estilos';

  var pendiente = null;    // { de, a }
  var enCurso   = false;

  var CSS = [
    /* Tokens del overlay: un solo sitio, como manda la casa. */
    '.rs-velo{--rs-tinta:#F3EAD8;--rs-llama:#FF7A00;--rs-velo-bg:rgba(5,7,14,.88);',
    '  position:fixed;inset:0;z-index:' + Z + ';display:flex;flex-direction:column;',
    '  align-items:center;justify-content:center;gap:14px;padding:32px;',
    '  background:var(--rs-velo-bg);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);',
    '  opacity:0;transition:opacity .30s ease;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.rs-velo.rs-dentro{opacity:1}',
    '.rs-velo.rs-fuera{opacity:0;transition:opacity ' + T_SALIDA + 'ms ease}',

    '.rs-frase{font-family:"Crimson Pro",Georgia,serif;font-size:1.1rem;font-style:italic;',
    '  color:var(--rs-tinta);opacity:0;text-align:center;line-height:1.5}',

    '.rs-fila{display:flex;align-items:center;justify-content:center;gap:18px}',

    '.rs-llama{font-size:44px;line-height:1;opacity:.3;',
    '  filter:drop-shadow(0 0 0 rgba(255,122,0,0))}',

    /* Ventana del contador: el número viejo se va POR ARRIBA y el nuevo entra
       POR ABAJO, así que la ventana recorta los dos recorridos. */
    '.rs-nums{position:relative;width:132px;height:96px;overflow:hidden}',
    '.rs-num{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);',
    /* Crimson Pro, no Cormorant Garamond: el "1" de Cormorant es un asta con
       serifas mínimas y se lee como el numeral romano I, no como el dígito. Y
       de paso, el peso 700 no lo carga ninguna página (llegan hasta 600), así
       que el navegador lo engordaba a mano y el asta salía aún más ambigua.
       Crimson Pro está cargada en las cinco páginas del splash, es serif —el
       registro no cambia— y su uno lleva bandera arriba y base abajo.
       lining/tabular por si alguna cara cayera en cifras de texto. */
    '  font-family:"Crimson Pro",Georgia,serif;font-size:76px;font-weight:600;',
    '  font-variant-numeric:lining-nums tabular-nums;',
    '  font-feature-settings:"lnum" 1,"tnum" 1;',
    '  line-height:1;color:var(--rs-tinta);white-space:nowrap}',
    '.rs-num.rs-nuevo{opacity:0}',

    '.rs-dias{font-family:"Inter",sans-serif;font-size:.66rem;font-weight:700;',
    '  letter-spacing:.16em;text-transform:uppercase;color:var(--rs-tinta);opacity:0}',

    /* ── Coreografía ── */
    '.rs-anim .rs-num.rs-viejo{animation:rsSube .70s cubic-bezier(.25,.46,.45,.94) .15s forwards}',
    '.rs-anim .rs-num.rs-nuevo{animation:rsEntra .70s cubic-bezier(.34,1.56,.64,1) .45s forwards}',
    '.rs-anim .rs-llama{animation:rsEnciende .70s cubic-bezier(.34,1.56,.64,1) .60s forwards}',
    '.rs-anim .rs-frase{animation:rsAparece .50s ease .75s forwards}',
    '.rs-anim .rs-dias{animation:rsAparece .50s ease .90s forwards}',

    '@keyframes rsSube{from{transform:translate(-50%,-50%);opacity:1}',
    '  to{transform:translate(-50%,-165%);opacity:0}}',
    '@keyframes rsEntra{0%{transform:translate(-50%,55%);opacity:0}',
    '  55%{transform:translate(-50%,-50%) scale(1.14);opacity:1}',
    '  100%{transform:translate(-50%,-50%) scale(1);opacity:1}}',
    '@keyframes rsEnciende{0%{opacity:.3;transform:scale(1);filter:drop-shadow(0 0 0 rgba(255,122,0,0))}',
    '  45%{opacity:1;transform:scale(1.26);filter:drop-shadow(0 0 20px rgba(255,122,0,.9))}',
    '  100%{opacity:1;transform:scale(1);filter:drop-shadow(0 0 15px rgba(255,122,0,.75))}}',
    '@keyframes rsAparece{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',

    /* ── Estado final, sin recorrido ──
       Lo usa el salto por toque y también prefers-reduced-motion. */
    '.rs-quieto .rs-num.rs-viejo{opacity:0}',
    '.rs-quieto .rs-num.rs-nuevo{opacity:1;transform:translate(-50%,-50%)}',
    '.rs-quieto .rs-llama{opacity:1;filter:drop-shadow(0 0 15px rgba(255,122,0,.75))}',
    '.rs-quieto .rs-frase,.rs-quieto .rs-dias{opacity:1;transform:none}',

    '@media (prefers-reduced-motion:reduce){',
    '  .rs-anim .rs-num.rs-viejo,.rs-anim .rs-num.rs-nuevo,',
    '  .rs-anim .rs-llama,.rs-anim .rs-frase,.rs-anim .rs-dias{animation:none}',
    '  .rs-velo .rs-num.rs-viejo{opacity:0}',
    '  .rs-velo .rs-num.rs-nuevo{opacity:1;transform:translate(-50%,-50%)}',
    '  .rs-velo .rs-llama{opacity:1;filter:drop-shadow(0 0 15px rgba(255,122,0,.75))}',
    '  .rs-velo .rs-frase,.rs-velo .rs-dias{opacity:1;transform:none}}'
  ].join('');

  function inyectarEstilos() {
    if (document.getElementById(ID_ESTILOS)) return;
    var st = document.createElement('style');
    st.id = ID_ESTILOS;
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* La marca la pone registrarRachaHoy cuando la racha subió de verdad. */
  function marcar(de, a) {
    if (!(a > 0)) return;
    pendiente = { de: de > 0 ? de : 0, a: a };
  }

  function hayPendiente() { return !!pendiente; }

  /* Siempre devuelve una promesa: el llamador puede encadenar sin preguntar. */
  function mostrarSiHay() {
    if (!pendiente || enCurso) return Promise.resolve(false);
    var p = pendiente;
    pendiente = null;
    return mostrar(p.de, p.a);
  }

  function mostrar(de, a) {
    if (enCurso) return Promise.resolve(false);
    enCurso = true;

    try { inyectarEstilos(); } catch (e) { enCurso = false; return Promise.resolve(false); }

    var velo = document.createElement('div');
    velo.className = 'rs-velo';
    velo.setAttribute('role', 'status');

    // Sin número anterior (primer día de la vida) no hay nada que despedir.
    var viejo = de > 0
      ? '<div class="rs-num rs-viejo">' + de + '</div>'
      : '';

    velo.innerHTML =
      '<div class="rs-frase">Otro día en el camino</div>' +
      '<div class="rs-fila">' +
        '<span class="rs-llama">🔥</span>' +
        '<div class="rs-nums">' + viejo +
          '<div class="rs-num rs-nuevo">' + a + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="rs-dias">' + (a === 1 ? 'Día consecutivo' : 'Días consecutivos') + '</div>';

    document.body.appendChild(velo);

    return new Promise(function (resolver) {
      var timers = [];
      var cerrado = false;

      function cerrar() {
        if (cerrado) return;
        cerrado = true;
        timers.forEach(clearTimeout);
        velo.classList.remove('rs-dentro');
        velo.classList.add('rs-fuera');
        setTimeout(function () {
          if (velo.parentNode) velo.parentNode.removeChild(velo);
          enCurso = false;
          resolver(true);
        }, T_SALIDA);
      }

      // Un toque en cualquier parte salta al estado final y sale. Nunca atrapa.
      function saltar() {
        if (cerrado) return;
        velo.classList.remove('rs-anim');
        velo.classList.add('rs-quieto');
        timers.forEach(clearTimeout);
        timers = [setTimeout(cerrar, 260)];   // se ve el final, no un corte a negro
      }
      velo.addEventListener('click', saltar);

      // Dos frames antes de animar: el navegador tiene que haber pintado el
      // estado inicial o las animaciones arrancan a mitad de camino.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          velo.classList.add('rs-dentro', 'rs-anim');
        });
      });

      timers.push(setTimeout(cerrar, T_NUCLEO));

      // Red de seguridad: si algo dejara la promesa colgada, la navegación
      // que espera detrás no se queda bloqueada para siempre.
      timers.push(setTimeout(cerrar, T_NUCLEO + T_SALIDA + 1500));
    });
  }

  window.RachaSplash = {
    marcar:       marcar,
    hayPendiente: hayPendiente,
    mostrarSiHay: mostrarSiHay,
    mostrar:      mostrar,
    _z:           Z
  };
}());
