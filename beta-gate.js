// ═══════════════════════════════════════════════════════════════════
// CruzAndo — la puerta del grupo piloto
// ═══════════════════════════════════════════════════════════════════
//
// Antes de ver contenido, quien entra al piloto firma el Acuerdo de
// Confidencialidad y Uso Beta. Esto es esa puerta.
//
// ── NO es una página, y esa es la primera decisión ─────────────────
// Una `aceptacion-beta.html` habría obligado a un location.replace con
// parámetro de retorno desde DOCE páginas distintas, con su entrada en el
// historial y su vuelta que adivinar. Este repo ya pagó exactamente eso con
// el atajo de history.back() de salirDeOrar, que se retiró. Aquí el velo se
// monta ENCIMA de la página que ya está, y al firmar se retira: no hay
// navegación, no hay retorno que decidir, no hay historial que ensuciar.
//
// ⚠️ Y NO CORTA EL ARRANQUE. El velo se pone por encima y el
// onAuthStateChanged de la página sigue corriendo por debajo. Es deliberado:
// un `return` temprano en esa función se salta las FASES 2 y 3 de index y
// crecer —el plan real, la frontera, freeProgress, los siete localStorage
// del final— y ese es exactamente el mecanismo que envenenó la frontera
// (ver CLAUDE.md § La frontera se rompió en silencio). Al firmar, la app ya
// está lista debajo: no hace falta recargar.
//
// ── Uso ────────────────────────────────────────────────────────────
//   BetaGate.puerta({
//     uid:    user.uid,
//     nombre: userData.displayName,     // precarga el campo; puede faltar
//     leer:   uid  => leerDocDeFirestore(uid),   // opcional en compat
//     firmar: data => llamarCallable(data),      // opcional en compat
//     onSalir: () => signOut(auth)
//   });
//
// En las páginas compat (hoy, orar, rezar, sanar, mini, diario, extras,
// retiros) basta el <script>: el módulo encuentra `firebase` él solo. Las
// modulares (index, crecer, audio, cantos) le pasan su E/S, como hace
// `racha.js` con los cuatro reproductores.
//
// Autosuficiente como toast.js, vuelta.js y racha-splash.js: se trae su CSS
// y monta el velo bajo demanda.
(function () {
  'use strict';

  // ── La versión vigente ───────────────────────────────────────────
  // Es un dato del CÓDIGO, no de la red. Parsearla de acuerdo-beta.html en
  // el arranque metería un fetch que puede fallar sin conexión, y entonces
  // no se sabría qué versión exigir: la puerta caería del lado inseguro
  // (dejar pasar) o del inútil (bloquear a todos).
  //
  // ⚠️ La sincronía NO se confía a la disciplina: tools/test-beta-gate.js
  // abre acuerdo-beta.html, extrae el número que ahí se muestra —en sus DOS
  // sitios, la píldora y el pie— y falla si no coincide con esta constante.
  // Es lo mismo que hace test-lrc-titulos.js con los 16 títulos.
  var VERSION_ACUERDO = '1.0';
  var FECHA_ACUERDO   = '3 de septiembre de 2026';
  var DOC_ACUERDO     = 'acuerdo-beta.html';
  var CONTACTO        = 'contacto@cruzando.app';

  var CSS_ID = 'beta-gate-css';
  var CLAVE  = 'cruzando_acuerdo_beta';

  // Cuánto se espera a Firestore antes de dejar pasar. Ver _degradar().
  var ESPERA_MAX_MS = 8000;
  // Mínimo de permanencia en el documento antes de darlo por leído cuando
  // no hay scroll que observar. No es un cronómetro del texto: es la guarda
  // contra abrir y cerrar en el mismo gesto.
  var LECTURA_MIN_MS = 4000;

  var RESUMEN =
    'Recibes acceso anticipado a CruzAndo, antes de su lanzamiento público. ' +
    'El contenido, la metodología, los personajes y los planes que veas aquí ' +
    'son material no publicado: te pedimos no compartirlos ni difundirlos. ' +
    'La aplicación está en pruebas y puede fallar.';

  var LUX =
    '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<rect x="46.2" y="0" width="7.6" height="100" fill="#F3EAD8"/>' +
    '<rect x="0" y="36" width="100" height="7.6" fill="#F3EAD8"/></svg>';

  // ── Utilidades ───────────────────────────────────────────────────

  function hoja() {
    if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return;
    var yaEsta = Array.prototype.some.call(document.styleSheets || [], function (s) {
      try { return (s.href || '').indexOf('beta-gate.css') !== -1; } catch (e) { return false; }
    });
    if (yaEsta) return;
    var l = document.createElement('link');
    l.id = CSS_ID; l.rel = 'stylesheet'; l.href = 'beta-gate.css';
    document.head.appendChild(l);
  }

  function el(tag, clase, texto) {
    var e = document.createElement(tag);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  // La convención del repo: nunca rutas absolutas.
  function base() {
    return location.origin +
           location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1);
  }

  // ── El developer no firma ────────────────────────────────────────
  // Misma forma que retirosON(): sin depender de plan-utils (world.js no lo
  // carga) y honrando el "ver como" — un developer mirando como free SÍ ve
  // la puerta, que es justo como se prueba esta pantalla sin una cuenta
  // aparte.
  function esDeveloper() {
    var verComo = null;
    try { verComo = sessionStorage.getItem('cruzando_view_as'); } catch (e) {}
    if (verComo) return verComo === 'developer';
    var plan = window.currentPlan;
    if (!plan) { try { plan = localStorage.getItem('cruzando_plan_cache'); } catch (e) {} }
    return plan === 'developer';
  }

  // ── El espejo local ──────────────────────────────────────────────
  // Solo evita el DESTELLO: index y crecer pintan el hub desde caché en su
  // FASE 1, sin red, antes de que Firestore conteste. Sin espejo, el hub se
  // vería un instante antes del velo.
  //
  // ⚠️ No es la autoridad. Firestore se consulta SIEMPRE, y si dice que no
  // hay firma el velo aparece igual un momento después. Un espejo falsificado
  // a mano se corrige solo en la misma carga. La firma de verdad la guarda el
  // servidor y el cliente no la puede escribir (ver firestore.rules).
  //
  // ⚠️ Va atado al uid, como cruzando_consent_pending: si en este aparato
  // entra otra persona, no hereda la firma de la anterior.
  function leerEspejo(uid) {
    try {
      var d = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      if (!d || d.uid !== uid) return null;
      return d;
    } catch (e) { return null; }
  }

  function guardarEspejo(uid) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify({
        uid: uid, version: VERSION_ACUERDO, at: Date.now()
      }));
    } catch (e) {}
  }

  function vigente(d) {
    return !!d && d.aceptado !== false && String(d.version || '') === VERSION_ACUERDO;
  }

  // ── E/S por defecto: el mundo compat ─────────────────────────────
  // Ocho de las doce páginas usan el SDK compat, que es global. Ahí el
  // módulo se basta solo y el cableado es una línea de <script>.

  function hayCompat() {
    return typeof window.firebase !== 'undefined' &&
           window.firebase.apps && window.firebase.apps.length > 0 &&
           typeof window.firebase.firestore === 'function';
  }

  function leerCompat(uid) {
    return window.firebase.firestore()
      .collection('aceptaciones_beta').doc(uid).get()
      .then(function (s) { return s.exists ? s.data() : null; });
  }

  // ⚠️ Solo sanar y retiros cargan firebase-functions-compat. Cargarlo aquí
  // bajo demanda —y solo al firmar, que ocurre UNA vez en la vida de la
  // cuenta— mantiene el cableado de las otras seis en una sola línea.
  function cargarFunctionsCompat() {
    if (window.firebase && typeof window.firebase.functions === 'function') {
      return Promise.resolve();
    }
    return new Promise(function (resolver, rechazar) {
      var s = document.createElement('script');
      s.src = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions-compat.js';
      s.onload  = function () { resolver(); };
      s.onerror = function () { rechazar(new Error('functions-compat')); };
      document.head.appendChild(s);
    });
  }

  function firmarCompat(datos) {
    return cargarFunctionsCompat().then(function () {
      var fns = window.firebase.app().functions('us-central1');
      return fns.httpsCallable('aceptarAcuerdoBeta')(datos);
    });
  }

  // ── El velo ──────────────────────────────────────────────────────

  var _velo    = null;    // el nodo montado, o null
  var _enVuelo = null;    // la promesa de la puerta en curso
  var _overflowPrevio = null;

  function bloquearFondo() {
    try {
      _overflowPrevio = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    } catch (e) {}
  }

  function soltarFondo() {
    try {
      document.body.style.overflow = _overflowPrevio || '';
      _overflowPrevio = null;
    } catch (e) {}
  }

  function retirar() {
    if (!_velo) return;
    var v = _velo;
    _velo = null;
    soltarFondo();
    v.classList.remove('dentro');
    v.classList.add('fuera');
    setTimeout(function () {
      if (v.parentNode) v.parentNode.removeChild(v);
    }, 320);
  }

  // Monta el velo en su estado más callado: sabemos que hay sesión pero
  // todavía no si esta persona firmó. Se expande o se retira, nunca se queda.
  function montarComprobando() {
    if (_velo) return _velo;
    hoja();
    var v = el('div', 'bg-velo comprobando');
    v.setAttribute('role', 'dialog');
    v.setAttribute('aria-modal', 'true');
    v.setAttribute('aria-label', 'Acuerdo del grupo piloto');

    var lux = el('div', 'bg-lux'); lux.innerHTML = LUX;
    v.appendChild(lux);
    v.appendChild(el('div', 'bg-esperando', 'Comprobando tu acceso…'));

    document.body.appendChild(v);
    bloquearFondo();
    requestAnimationFrame(function () { v.classList.add('dentro'); });
    _velo = v;
    return v;
  }

  // ── La pantalla del acuerdo ──────────────────────────────────────
  //
  // Un solo primario: es bloqueante, así que no hay "Ahora no". Pero SÍ hay
  // salida —"No puedo aceptar"—: sin ella, quien no firma queda encerrado sin
  // poder ni escribir para preguntar.
  //
  // El enlace al documento va ENTRE el resumen y el botón, nunca debajo: hay
  // que poder leer antes de decidir, y un enlace bajo el botón de aceptar es
  // un enlace que nadie pulsa.
  function pintarAcuerdo(v, opts, resolver) {
    var uid = opts.uid;
    v.classList.remove('comprobando');
    v.innerHTML = '';

    var caja = el('div', 'bg-caja');

    var lux = el('div', 'bg-lux'); lux.innerHTML = LUX;
    caja.appendChild(lux);
    caja.appendChild(el('div', 'bg-kicker', 'Grupo piloto'));
    caja.appendChild(el('h1', 'bg-titulo', 'Acuerdo de Confidencialidad'));
    caja.appendChild(el('p', 'bg-resumen', RESUMEN));
    caja.appendChild(el('div', 'bg-version',
      'Versión ' + VERSION_ACUERDO + ' · ' + FECHA_ACUERDO));

    // El enlace, y su acuse de lectura en el mismo sitio.
    var abrir = el('button', 'bg-enlace', 'Ver el documento completo →');
    abrir.type = 'button';
    caja.appendChild(abrir);

    var leido = el('div', 'bg-leido', '✓ Documento leído');
    caja.appendChild(leido);

    // El nombre es obligatorio: el acuerdo identifica al Participante, y una
    // firma sin nombre no identifica a nadie. Se PRECARGA con el que ya
    // tenemos —el alta por correo lo pide y Google lo trae— para no hacer
    // teclear lo que ya sabemos.
    var campo = el('div', 'bg-campo');
    var lbl = el('label', 'bg-label', 'Tu nombre completo');
    lbl.setAttribute('for', 'bg-nombre');
    var inp = el('input', 'bg-input');
    inp.type = 'text';
    inp.id = 'bg-nombre';
    inp.setAttribute('autocomplete', 'name');
    inp.setAttribute('placeholder', 'Nombre y apellidos');
    inp.value = (opts.nombre || '').trim();
    campo.appendChild(lbl);
    campo.appendChild(inp);
    caja.appendChild(campo);

    var aceptar = el('button', 'bg-btn primario', 'Acepto los términos');
    aceptar.type = 'button';
    caja.appendChild(aceptar);

    var pista = el('div', 'bg-pista', '');
    caja.appendChild(pista);

    var noPuedo = el('button', 'bg-btn discreto', 'No puedo aceptar');
    noPuedo.type = 'button';
    caja.appendChild(noPuedo);

    v.appendChild(caja);

    // ── Estado de la pantalla ──────────────────────────────────────
    var _leido = false;
    var _firmando = false;

    function repintarPuerta() {
      var nombre = (inp.value || '').trim();
      var listo = _leido && nombre.length >= 3 && !_firmando;
      aceptar.disabled = !listo;
      if (_firmando) { pista.textContent = ''; return; }
      if (!_leido)                 pista.textContent = 'Abre el documento y léelo para poder aceptar.';
      else if (nombre.length < 3)  pista.textContent = 'Escribe tu nombre para firmar el acuerdo.';
      else                         pista.textContent = '';
    }

    function marcarLeido() {
      if (_leido) return;
      _leido = true;
      caja.classList.add('ya-leido');
      repintarPuerta();
    }

    inp.addEventListener('input', repintarPuerta);
    abrir.onclick = function () { abrirDocumento(v, marcarLeido); };

    noPuedo.onclick = function () { pintarSalida(v, opts, function () {
      pintarAcuerdo(v, Object.assign({}, opts, { nombre: inp.value }), resolver);
    }); };

    aceptar.onclick = function () {
      var nombre = (inp.value || '').trim();
      if (!_leido || nombre.length < 3) { repintarPuerta(); return; }
      _firmando = true;
      repintarPuerta();
      aceptar.textContent = 'Registrando…';

      var firmar = opts.firmar || (hayCompat() ? firmarCompat : null);
      if (!firmar) {
        // Sin forma de firmar no se promete lo que no se puede cumplir.
        _firmando = false;
        aceptar.textContent = 'Acepto los términos';
        pista.textContent = 'No se pudo conectar. Inténtalo de nuevo.';
        repintarPuerta();
        return;
      }

      Promise.resolve()
        .then(function () {
          return firmar({ nombre: nombre, version: VERSION_ACUERDO });
        })
        .then(function () {
          guardarEspejo(uid);
          retirar();
          resolver(true);
        })
        .catch(function (e) {
          // ⚠️ Si la red falla NO se pierde lo escrito ni se cierra la
          // pantalla: se avisa y se deja reintentar. Igual que vuelta.js.
          console.warn('[beta-gate] no se pudo registrar la firma:', e && e.message);
          _firmando = false;
          aceptar.textContent = 'Acepto los términos';
          repintarPuerta();
          pista.textContent = 'No se pudo registrar. Revisa tu conexión e inténtalo de nuevo.';
        });
    };

    repintarPuerta();
    return caja;
  }

  // ── El documento, dentro del velo ────────────────────────────────
  //
  // En iframe y no en pestaña nueva: en la PWA instalada, un target="_blank"
  // saca a la persona del contenedor de la app y volver es torpe. Aquí el
  // documento se lee sin salir, y el velo sigue montado detrás.
  function abrirDocumento(v, alLeer) {
    var capa = el('div', 'bg-doc');

    var barra = el('div', 'bg-doc-barra');
    var progreso = el('div', 'bg-doc-progreso');
    barra.appendChild(progreso);
    capa.appendChild(barra);

    var cab = el('div', 'bg-doc-cab');
    cab.appendChild(el('div', 'bg-doc-titulo', 'Acuerdo de Confidencialidad y Uso Beta'));
    capa.appendChild(cab);

    var marco = el('iframe', 'bg-doc-marco');
    marco.setAttribute('title', 'Acuerdo de Confidencialidad y Uso Beta');
    marco.src = base() + DOC_ACUERDO;
    capa.appendChild(marco);

    var pie = el('div', 'bg-doc-pie');
    var cerrar = el('button', 'bg-btn primario', 'Volver al acuerdo');
    cerrar.type = 'button';
    pie.appendChild(cerrar);
    var nota = el('div', 'bg-doc-nota', 'Desplázate hasta el final para poder aceptar.');
    pie.appendChild(nota);
    capa.appendChild(pie);

    v.appendChild(capa);
    requestAnimationFrame(function () { capa.classList.add('dentro'); });

    var abiertoEn = Date.now();
    var _ok = false;
    var _mirando = null;

    function completar(motivo) {
      if (_ok) return;
      _ok = true;
      progreso.style.width = '100%';
      nota.textContent = 'Documento leído. Ya puedes aceptar.';
      nota.classList.add('ok');
      if (motivo) console.info('[beta-gate] documento dado por leído:', motivo);
      alLeer();
    }

    function cerrarCapa() {
      if (_mirando) { clearInterval(_mirando); _mirando = null; }
      capa.classList.remove('dentro');
      setTimeout(function () {
        if (capa.parentNode) capa.parentNode.removeChild(capa);
      }, 260);
    }

    cerrar.onclick = cerrarCapa;

    // ⚠️ La lectura se OBSERVA, pero no se puede convertir en una trampa.
    // Si el iframe no carga, si el documento no es accesible, o si cabe sin
    // scroll, seguir exigiendo "llega al final" dejaría a la persona
    // encerrada sin salida posible. Es la misma regla que ya gobierna a
    // Cierre: ante la duda, degradar — nunca encerrar.
    function vigilar() {
      var doc, sc;
      try {
        doc = marco.contentDocument;
        sc  = doc && (doc.scrollingElement || doc.documentElement);
      } catch (e) { sc = null; }

      if (!sc) {
        // No hay nada que observar. Se cae al tiempo de permanencia.
        if (Date.now() - abiertoEn >= LECTURA_MIN_MS) completar('sin acceso al documento');
        return;
      }

      var alto = sc.scrollHeight;
      var vista = sc.clientHeight;

      // Cabe entero sin scroll: ya está a la vista, no hay final al que
      // llegar. Se pide solo la permanencia mínima.
      if (alto - vista <= 8) {
        if (Date.now() - abiertoEn >= LECTURA_MIN_MS) completar('cabe sin scroll');
        return;
      }

      var visto = sc.scrollTop + vista;
      var pct = Math.max(0, Math.min(100, (visto / alto) * 100));
      if (!_ok) progreso.style.width = pct.toFixed(1) + '%';
      if (visto >= alto - 48) completar('final alcanzado');
    }

    // Un intervalo y no un listener de scroll: el scroll ocurre DENTRO del
    // iframe y el listener habría que engancharlo a su contentWindow, que no
    // existe hasta que carga y se pierde si el documento se recarga.
    _mirando = setInterval(vigilar, 250);

    // Red de seguridad: si el iframe ni siquiera carga en 10 s, no se deja a
    // nadie atrapado — se ofrece el documento aparte y se da por leído al
    // abrirlo. Es una garantía más débil, y es lo correcto frente a encerrar.
    setTimeout(function () {
      if (_ok) return;
      var doc = null;
      try { doc = marco.contentDocument; } catch (e) {}
      if (doc && doc.body && doc.body.children.length) return;
      capa.classList.add('sin-marco');
      nota.textContent = 'El documento no se pudo mostrar aquí.';
      var aparte = el('a', 'bg-enlace', 'Abrir el documento en otra pestaña →');
      aparte.href = base() + DOC_ACUERDO;
      aparte.target = '_blank';
      aparte.rel = 'noopener';
      aparte.onclick = function () { completar('marco no disponible'); };
      pie.insertBefore(aparte, cerrar);
    }, 10000);
  }

  // ── Quien no puede aceptar ───────────────────────────────────────
  // No se le deja en un callejón: se le da a quién escribir, y la salida de
  // cerrar sesión. Sin esto, no aceptar sería quedarse encerrado en la app.
  function pintarSalida(v, opts, volver) {
    var previo = v.querySelector('.bg-caja');
    if (previo) previo.style.display = 'none';

    var caja = el('div', 'bg-caja bg-salida');
    var lux = el('div', 'bg-lux'); lux.innerHTML = LUX;
    caja.appendChild(lux);
    caja.appendChild(el('h1', 'bg-titulo', 'Hablemos'));
    caja.appendChild(el('p', 'bg-resumen',
      'Sin aceptar el acuerdo no podemos darte acceso al material del piloto — ' +
      'pero sí queremos saber por qué. Escríbenos y lo vemos.'));

    var correo = el('a', 'bg-enlace', CONTACTO);
    correo.href = 'mailto:' + CONTACTO +
      '?subject=' + encodeURIComponent('Acuerdo del grupo piloto de CruzAndo');
    caja.appendChild(correo);

    var atras = el('button', 'bg-btn primario', 'Volver al acuerdo');
    atras.type = 'button';
    atras.onclick = function () {
      if (caja.parentNode) caja.parentNode.removeChild(caja);
      if (previo) previo.style.display = '';
      if (volver && !previo) volver();
    };
    caja.appendChild(atras);

    var salir = el('button', 'bg-btn discreto', 'Cerrar sesión');
    salir.type = 'button';
    salir.onclick = function () {
      salir.disabled = true;
      salir.textContent = 'Saliendo…';
      Promise.resolve()
        .then(function () { return opts.onSalir ? opts.onSalir() : null; })
        .catch(function () {})
        .then(function () { location.replace(base() + 'index.html'); });
    };
    caja.appendChild(salir);

    v.appendChild(caja);
  }

  // ── La puerta ────────────────────────────────────────────────────

  function puerta(opts) {
    opts = opts || {};
    if (typeof document === 'undefined') return Promise.resolve(true);
    if (_enVuelo) return _enVuelo;

    var uid = opts.uid;
    if (!uid) return Promise.resolve(true);

    // El developer no firma: es quien lo está construyendo.
    if (opts.esDeveloper != null ? opts.esDeveloper : esDeveloper()) {
      return Promise.resolve(true);
    }

    hoja();

    // Espejo VIGENTE → ni un destello. Firestore confirma igual, más abajo.
    // Uno de una versión anterior no vale: sabemos ya que hay que firmar, así
    // que el velo se monta sin esperar a la red.
    var espejo = leerEspejo(uid);

    _enVuelo = new Promise(function (resolver) {
      var v = vigente(espejo) ? null : montarComprobando();
      var _resuelto = false;

      function abrirPaso(ok) {
        if (_resuelto) return;
        _resuelto = true;
        _enVuelo = null;
        retirar();
        resolver(ok);
      }

      // ⚠️ Sin respuesta del servidor no se puede cerrar la puerta con
      // honestidad: quien ya firmó quedaría encerrado por estar sin red, y
      // quien no ha firmado tampoco PODRÍA firmar (la callable necesita
      // conexión). Así que se deja pasar y se vuelve a preguntar en la
      // siguiente carga. Es un límite conocido y del mismo orden que la
      // guarda del free: integridad de producto, no seguridad.
      var reloj = setTimeout(function () {
        if (_resuelto) return;
        console.warn('[beta-gate] sin respuesta del servidor: se deja pasar y se reintenta en la próxima carga.');
        abrirPaso(true);
      }, ESPERA_MAX_MS);

      var leer = opts.leer || (hayCompat() ? leerCompat : null);
      if (!leer) {
        clearTimeout(reloj);
        console.warn('[beta-gate] sin forma de leer la firma en esta página.');
        abrirPaso(true);
        return;
      }

      Promise.resolve()
        .then(function () { return leer(uid); })
        .then(function (doc) {
          clearTimeout(reloj);
          if (_resuelto) return;

          if (vigente(doc)) {
            guardarEspejo(uid);
            abrirPaso(true);
            return;
          }

          // No hay firma, o es de una versión anterior. Aquí sí se cierra.
          // ⚠️ Si el espejo decía que sí, estaba equivocado (o falsificado):
          // se borra y se pide la firma.
          try { localStorage.removeItem(CLAVE); } catch (e) {}
          // ⚠️ `_resuelto` calla al reloj, pero `_enVuelo` NO se limpia aquí:
          // la puerta sigue abierta mientras la pantalla espera la firma. Si
          // se limpiara, una segunda llamada a puerta() —index y crecer la
          // hacen en sus DOS fases— repintaría la caja encima y le borraría a
          // la persona el nombre que estuviera escribiendo.
          _resuelto = true;
          if (!v) v = montarComprobando();
          pintarAcuerdo(v, opts, function (ok) { _enVuelo = null; resolver(ok); });
        })
        .catch(function (e) {
          clearTimeout(reloj);
          if (_resuelto) return;
          console.warn('[beta-gate] no se pudo comprobar la firma:', e && e.message);
          abrirPaso(true);
        });
    });

    return _enVuelo;
  }

  // Al cerrar sesión el velo no puede quedarse flotando sobre la pantalla de
  // acceso: index y crecer pasan por user=null antes de pintarla.
  function cerrar() {
    _enVuelo = null;
    retirar();
  }

  window.BetaGate = {
    puerta: puerta,
    cerrar: cerrar,
    VERSION: VERSION_ACUERDO,
    DOC: DOC_ACUERDO,
    montado: function () { return !!_velo; }
  };
}());
