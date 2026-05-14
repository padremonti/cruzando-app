// sanar.js — El Santuario · CruzAndo
(function () {
  'use strict';

  /* ── Firebase ── */

  var _db, _auth;

  function _initFirebase() {
    var cfg = {
      apiKey:            'AIzaSyCYCZi1LmFuqIis9yx3QF3McvGHlAGKRKY',
      authDomain:        'cruzando-app.firebaseapp.com',
      projectId:         'cruzando-app',
      storageBucket:     'cruzando-app.firebasestorage.app',
      messagingSenderId: '408196948528',
      appId:             '1:408196948528:web:de291e8afc969252e943f5'
    };
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    _db   = firebase.firestore();
    _auth = firebase.auth();
  }

  /* ── Utilidades ── */

  function _base() {
    var p = location.pathname;
    return location.origin + p.substring(0, p.lastIndexOf('/') + 1);
  }

  function _hex2rgba(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ── Tema ── */

  var _isLight = localStorage.getItem('cruzando_theme') === 'light';

  function _applyTheme(light) {
    document.body.classList.toggle('light', light);
    var sun  = document.getElementById('ico-sun');
    var moon = document.getElementById('ico-moon');
    if (sun)  sun.style.display  = light ? 'none'  : 'block';
    if (moon) moon.style.display = light ? 'block' : 'none';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = light ? '#F5F0E8' : '#1A0E04';
    localStorage.setItem('cruzando_theme', light ? 'light' : 'dark');
  }

  window.toggleDarkMode = function () {
    _isLight = !_isLight;
    _applyTheme(_isLight);
  };

  /* ── Navegación ── */

  window.goTo = function (page) {
    location.href = _base() + page;
  };

  window.navTap = function (el) {
    if (window.CZSound) CZSound('navTap');
    el.classList.remove('tapped');
    void el.offsetWidth;
    el.classList.add('tapped');
    setTimeout(function () { el.classList.remove('tapped'); }, 400);
  };

  window.entrarRetiro = function (slug, resume) {
    var url = 'sanar.html?retiro=' + slug;
    if (resume) url += '&resume=true';
    window.goTo(url);
  };

  /* ── Skeleton ── */

  function _showSkeleton() {
    var html = '';
    for (var i = 0; i < 3; i++) {
      html += '<div class="sk-card">' +
                '<div class="sk-top"></div>' +
                '<div class="sk-name"></div>' +
                '<div class="sk-btn"></div>' +
              '</div>';
    }
    document.getElementById('hospederia').innerHTML = html;
  }

  /* ── Lógica de desbloqueo ── */

  var DOLOROSOS = [11, 12, 13, 14, 15];

  function _calcEstado(retiro, progSnap, tallerSnap) {
    // Contenido pendiente → siempre bloqueado sin importar el progreso
    if (retiro.estado === 'pendiente') return 'bloqueado';

    // Taller iniciado o completado tiene prioridad
    if (tallerSnap.exists) {
      return tallerSnap.data().completed ? 'completado' : 'en_progreso';
    }

    // Verificar si los 5 Misterios Dolorosos del nivel de desbloqueo están completados.
    // audio.html escribe: progress.dolorosos = [ts, ts, ts, ts, ts] (null = incompleto)
    if (progSnap.exists) {
      var dolorosos = (progSnap.data().progress || {}).dolorosos;
      if (Array.isArray(dolorosos) && dolorosos.length === 5 &&
          dolorosos.every(function (x) { return x !== null && x !== undefined; })) {
        return 'disponible';
      }
    }

    return 'bloqueado';
  }

  /* ── Render de cards ── */

  var SVG_LOCK = '<svg class="card-lock-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="3" y="11" width="18" height="11" rx="2"/>' +
    '<path d="M7 11V7a5 5 0 0110 0v4"/></svg>';

  function _cardFooter(r) {
    var c  = r.mundoColor;
    var sl = r.slug;

    switch (r._estado) {
      case 'disponible':
        return '<button class="card-btn" style="background:' + c + '" ' +
               'onclick="window.entrarRetiro(\'' + sl + '\')">Entrar al retiro →</button>';

      case 'en_progreso':
        return '<button class="card-btn" style="background:' + c + '" ' +
               'onclick="window.entrarRetiro(\'' + sl + '\',true)">Sigues en retiro →</button>';

      case 'completado':
        return '<div class="card-msg-done"><span>✓</span> Has cruzado esto</div>';

      default: // bloqueado
        return SVG_LOCK +
               '<p class="card-msg-lock">Lo encontrarás más adelante en tu camino.</p>';
    }
  }

  function _renderCard(r) {
    var c      = r.mundoColor;
    var estado = r._estado;
    var active = estado === 'disponible' || estado === 'en_progreso' || estado === 'completado';

    var cardStyle = active
      ? 'style="background:' + _hex2rgba(c, 0.07) + ';border-color:' + _hex2rgba(c, 0.38) + '"'
      : '';

    var pct     = r._pct || 0;
    var progBar = estado === 'en_progreso'
      ? '<div class="card-progreso-barra"><div class="card-progreso-fill" style="width:' + pct + '%;background:' + c + '"></div></div>' +
        '<p class="card-progreso-texto">' + pct + '% completado</p>'
      : '';

    return [
      '<div class="retiro-card ' + estado + '" ' + cardStyle + '>',
        '<div class="card-top">',
          '<span class="card-icono" style="color:' + c + '">' + r.icono + '</span>',
          '<span class="card-chip" style="color:' + c + ';border-color:' + _hex2rgba(c, 0.45) + '">' + r.mundoNombre + '</span>',
        '</div>',
        '<div class="card-nombre">' + r.nombre + '</div>',
        progBar,
        '<div class="card-footer">' + _cardFooter(r) + '</div>',
      '</div>'
    ].join('');
  }

  function _renderCatalogo(retiros) {
    var order = [], groups = {};
    retiros.forEach(function (r) {
      var k = r.mundo;
      if (!groups[k]) {
        groups[k] = { mundo: k, nombre: r.mundoNombre, color: r.mundoColor, items: [] };
        order.push(k);
      }
      groups[k].items.push(r);
    });

    var html = '';
    order.forEach(function (k) {
      var g = groups[k];
      var lineColor = _hex2rgba(g.color, 0.35);
      html += '<div class="mundo-group">';
      html +=   '<div class="mundo-sep">';
      html +=     '<div class="mundo-sep-line" style="background:' + lineColor + '"></div>';
      html +=     '<span class="mundo-sep-label" style="color:' + g.color + '">Mundo ' + g.mundo + ' · ' + g.nombre + '</span>';
      html +=     '<div class="mundo-sep-line" style="background:' + lineColor + '"></div>';
      html +=   '</div>';
      g.items.forEach(function (r) { html += _renderCard(r); });
      html += '</div>';
    });

    document.getElementById('hospederia').innerHTML = html;
  }

  /* ── Arranque ── */

  _applyTheme(_isLight);
  _initFirebase();
  _showSkeleton();

  // Esperar sesión
  new Promise(function (resolve) {
    _auth.onAuthStateChanged(resolve);
  })
  .then(function (user) {
    if (!user) {
      window.goTo('index.html');
      return Promise.reject('no-user');
    }
    var uid  = user.uid;
    var uRef = _db.collection('users').doc(uid);

    // Fetch del índice de retiros
    return fetch(_base() + 'data/santuario_index.json')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var retiros = data.retiros;

        // Lecturas paralelas: progreso del itinerario + talleres en curso
        var progPromises = retiros.map(function (r) {
          return uRef.collection('progress').doc(r.nivelDesbloqueo).get()
            .catch(function () { return { exists: false }; });
        });
        var tallerPromises = retiros.map(function (r) {
          return uRef.collection('talleres').doc(r.slug).get()
            .catch(function () { return { exists: false }; });
        });

        return Promise.all([
          Promise.resolve(retiros),
          Promise.all(progPromises),
          Promise.all(tallerPromises)
        ]);
      })
      .then(function (results) {
        var retiros   = results[0];
        var progresos = results[1];
        var talleres  = results[2];

        retiros.forEach(function (r, i) {
          r._estado = _calcEstado(r, progresos[i], talleres[i]);
          if (r._estado === 'en_progreso' && talleres[i].exists) {
            var lastCard = (talleres[i].data().lastCardIndex) || 0;
            r._pct = Math.min(100, Math.round((lastCard / 48) * 100));
          } else {
            r._pct = 0;
          }
        });

        _renderCatalogo(retiros);
      });
  })
  .catch(function (err) {
    if (err === 'no-user') return;
    // Error silencioso: el usuario ve el skeleton hasta que recarga
    console.error('[Santuario]', err);
  });

  /* ── 5A: Enrutamiento de vistas ── */

  var params = new URLSearchParams(location.search);
  var slug   = params.get('retiro');
  var resume = params.get('resume') === 'true';

  if (slug) {
    document.getElementById('vista-hospederia').style.display = 'none';
    document.getElementById('vista-retiro').style.display     = 'block';
    window._retiroSlug   = slug;
    window._retiroResume = resume;
  }

  window.volverHospederia = function () {
    var url = new URL(location.href);
    url.searchParams.delete('retiro');
    url.searchParams.delete('resume');
    history.pushState({}, '', url);
    document.getElementById('vista-retiro').style.display     = 'none';
    document.getElementById('vista-hospederia').style.display = 'block';
  };

  /* ── 5B: Barra superior + progreso ── */

  function generarSegmentos(total) {
    var contenedor = document.getElementById('retiro-progreso');
    contenedor.innerHTML = '';
    for (var i = 0; i < total; i++) {
      var seg = document.createElement('div');
      seg.className = 'progreso-segmento';
      seg.id = 'seg-' + i;
      contenedor.appendChild(seg);
    }
  }

  function actualizarProgreso(indexActual, total) {
    for (var i = 0; i < total; i++) {
      var seg = document.getElementById('seg-' + i);
      if (!seg) continue;
      seg.className = 'progreso-segmento';
      if (i < indexActual)      seg.classList.add('completado');
      else if (i === indexActual) seg.classList.add('activo');
    }
  }

  function actualizarTitulo(texto) {
    var tarjeta = _tarjetas[_indexActual];
    var titulo  = texto;

    if (tarjeta) {
      var tipoLabels = {
        portada_misterio: 'Misterio',
        evangelio:        'Evangelio',
        contemplacion:    'Contemplación',
        actividad:        'Actividad',
        oracion:          'Oración',
        canto:            'Canto',
        preguntas:        'Reflexión'
      };
      switch (tarjeta.tipo) {
        case 'umbral':
          titulo = (tarjeta.datos && tarjeta.datos.nombre) ? tarjeta.datos.nombre : texto;
          break;
        case 'portada_misterio':
        case 'evangelio':
        case 'contemplacion':
        case 'actividad':
        case 'oracion':
        case 'canto':
        case 'preguntas':
          var mNum = (tarjeta.indice || 0) + 1;
          var tipo = tipoLabels[tarjeta.tipo] || tarjeta.tipo;
          titulo = 'Misterio ' + mNum + ' · ' + tipo;
          break;
        case 'cierre':
          titulo = 'Cierre del retiro';
          break;
      }
    }

    var el = document.getElementById('retiro-titulo');
    if (el) el.textContent = titulo;
  }

  window.cerrarRetiro = function () {
    if (confirm('¿Salir del retiro? Tu progreso está guardado.')) {
      window.volverHospederia();
    }
  };

  /* ── 5E: Audio sincronizado ── */

  var _audio       = null;
  var _audioActivo = false;

  function cargarAudio(url) {
    if (_audio) { _audio.pause(); _audio.src = ''; _audio = null; }
    _audioActivo = false;
    actualizarBotonPlay(false);
    if (!url) return;

    _audio = new Audio(url);

    _audio.addEventListener('ended', function () {
      _audioActivo = false;
      actualizarBotonPlay(false);
      var tipo = _tarjetas[_indexActual] ? _tarjetas[_indexActual].tipo : null;
      if (tipo === 'contemplacion' || tipo === 'introduccion') {
        _tarjetaCompletada = true;
        window.avanzarTarjeta();
      } else if (tipo === 'oracion' || tipo === 'canto') {
        _tarjetaCompletada = true;
      }
    });

    _audio.addEventListener('timeupdate', function () {
      if (!_audio || !_audio.duration) return;
      var pct  = _audio.currentTime / _audio.duration;
      var tipo = _tarjetas[_indexActual] ? _tarjetas[_indexActual].tipo : null;
      if (pct >= 0.8 && (tipo === 'contemplacion' || tipo === 'introduccion')) {
        _tarjetaCompletada = true;
      }
      if (pct >= 0.6 && tipo === 'canto') {
        _tarjetaCompletada = true;
      }
    });
  }

  function actualizarBotonPlay(reproduciendo) {
    var btn = document.getElementById('btn-play');
    if (btn) btn.textContent = reproduciendo ? '⏸' : '▶';
  }

  window.toggleAudioRetiro = function () {
    if (!_audio) return;
    if (_audioActivo) {
      _audio.pause();
      _audioActivo = false;
      actualizarBotonPlay(false);
    } else {
      _audio.play()
        .then(function () { _audioActivo = true; actualizarBotonPlay(true); })
        .catch(function (err) { console.warn('Audio no disponible:', err); });
    }
  };

  function cargarAudioDeTarjeta(tarjeta) {
    var url = null;
    var tipos = ['introduccion', 'contemplacion', 'oracion', 'canto'];
    if (tipos.indexOf(tarjeta.tipo) !== -1 && tarjeta.datos) {
      url = tarjeta.datos.audio || null;
    }
    cargarAudio(url);
  }

  /* ── 5C: Motor de tarjetas ── */

  var _tarjetas          = [];
  var _indexActual       = 0;
  var _tarjetaCompletada = false;

  window._respuestas  = {};
  window._feedbackIA  = null;

  window.registrarRespuesta = function (clave, valor) {
    window._respuestas[clave] = valor;
    var fb = document.getElementById('actividad-feedback');
    if (fb) { fb.style.opacity = '1'; setTimeout(function () { fb.style.opacity = '0'; }, 1400); }

    var update = {};
    update['respuestas.' + clave] = valor;
    update['lastSeenAt'] = 'SERVER_TIMESTAMP';
    guardarEnFirestore(update);

    marcarCompletada();
  };

  window.verificarFrase = function (clave) {
    var ta  = document.getElementById('input-frase-' + clave);
    var btn = document.getElementById('btn-frase-' + clave);
    if (!ta || !btn) return;
    var ok = ta.value.trim().length >= 5;
    btn.style.opacity      = ok ? '1'    : '.4';
    btn.style.pointerEvents = ok ? 'auto' : 'none';
  };

  window.guardarFrase = function (clave) {
    var ta  = document.getElementById('input-frase-' + clave);
    var val = ta ? ta.value.trim() : '';
    window.registrarRespuesta(clave, val);
  };

  window.iniciarSilencio = function (seg, clave) {
    var display  = document.getElementById('silencio-display');
    var startBtn = document.getElementById('btn-iniciar-silencio');
    if (startBtn) startBtn.style.display = 'none';

    var tarjeta = _tarjetas[_indexActual];
    if (tarjeta && tarjeta.datos && tarjeta.datos.audioFondo) {
      cargarAudio(tarjeta.datos.audioFondo);
      if (_audio) {
        _audio.play().catch(function () {});
        _audioActivo = true;
        actualizarBotonPlay(true);
      }
    }

    function fmt(s) { var m = Math.floor(s / 60); var ss = s % 60; return m + ':' + (ss < 10 ? '0' : '') + ss; }
    var restante = seg;
    if (display) display.textContent = fmt(restante);

    var iv = setInterval(function () {
      restante--;
      if (display) display.textContent = fmt(restante);
      if (restante <= 0) { clearInterval(iv); window.registrarRespuesta(clave, 'completado'); }
    }, 1000);
  };

  window.tocarCuerpo = function (event, clave) {
    var zona = event.target.dataset.zona;
    if (!zona) return;
    var svg  = event.currentTarget;
    var rect = svg.getBoundingClientRect();
    var vb   = svg.viewBox.baseVal;
    var x    = (event.clientX - rect.left) / rect.width  * vb.width;
    var y    = (event.clientY - rect.top)  / rect.height * vb.height;
    var punto = document.getElementById('punto-cuerpo');
    if (punto) { punto.setAttribute('cx', x); punto.setAttribute('cy', y); }
    var label = document.getElementById('zona-seleccionada');
    if (label) label.textContent = zona;
    window.registrarRespuesta(clave, zona);
  };

  window.verificarAntesDespues = function (clave) {
    var taA = document.getElementById('ad-antes');
    var taD = document.getElementById('ad-despues');
    var btn = document.getElementById('btn-ad');
    var a   = taA ? taA.value.trim() : '';
    var d   = taD ? taD.value.trim() : '';
    var ok  = a.length >= 10 && d.length >= 10;
    if (btn) {
      btn.style.opacity       = ok ? '1'    : '.4';
      btn.style.pointerEvents = ok ? 'auto' : 'none';
    }
  };

  window.guardarAntesDespues = function (clave) {
    var taA = document.getElementById('ad-antes');
    var taD = document.getElementById('ad-despues');
    window.registrarRespuesta(clave, {
      antes:   taA ? taA.value.trim() : '',
      despues: taD ? taD.value.trim() : ''
    });
  };

  window.actualizarEmociones = function () {
    var activas = document.querySelectorAll('.emocion-activa');
    var btn = document.getElementById('btn-emociones');
    if (btn) {
      var ok = activas.length > 0;
      btn.style.opacity       = ok ? '1'    : '.4';
      btn.style.pointerEvents = ok ? 'auto' : 'none';
    }
  };

  window.confirmarEmociones = function (clave) {
    var labels  = document.querySelectorAll('.emocion-activa .emocion-label');
    var activas = Array.prototype.map.call(labels, function (el) { return el.textContent.trim(); });
    window.registrarRespuesta(clave, activas);
  };

  window.verificarCarta = function (clave) {
    var ta  = document.getElementById('carta-texto-' + clave);
    var btn = document.getElementById('btn-carta-' + clave);
    if (!ta || !btn) return;
    var ok = ta.value.trim().length >= 20;
    btn.style.opacity       = ok ? '1'    : '.4';
    btn.style.pointerEvents = ok ? 'auto' : 'none';
  };

  window.guardarCarta = function (clave) {
    var ta  = document.getElementById('carta-texto-' + clave);
    var val = ta ? ta.value.trim() : '';
    window.registrarRespuesta(clave, val);
  };

  /* ── Bloque 6: Actividades interactivas ── */

  function renderActividad(datos, mIndex, aIndex) {
    var clave = mIndex + '_' + aIndex + '_' + datos.tipo;
    var inner = '';

    switch (datos.tipo) {

      case 'escala_resonancia': {
        var ets = datos.etiquetas || ['Apenas', 'Poco', 'Algo', 'Mucho', 'Profundamente'];
        var btns = ets.map(function (e, i) {
          return '<button class="escala-btn" ' +
            'onclick="this.classList.add(\'seleccionado\'); window.registrarRespuesta(\'' + clave + '\',' + i + ')">' +
            e + '</button>';
        }).join('');
        inner = '<p class="tarjeta-tipo">Actividad</p>' +
                '<p class="tarjeta-texto-lora">' + (datos.pregunta || '') + '</p>' +
                '<div class="escala-contenedor">' + btns + '</div>';
        break;
      }

      case 'seleccion_imagen': {
        var imgs = (datos.imagenes || []).map(function (url, i) {
          return '<img src="' + url + '" class="imagen-seleccion" alt="opción ' + (i + 1) + '" ' +
            'onclick="this.classList.add(\'seleccionada\'); window.registrarRespuesta(\'' + clave + '\',' + i + ')">';
        }).join('');
        inner = '<p class="tarjeta-tipo">Actividad</p>' +
                '<p class="tarjeta-texto-lora">' + (datos.pregunta || '') + '</p>' +
                '<div class="imagenes-grid">' + imgs + '</div>';
        break;
      }

      case 'completar_frase':
        inner = '<p class="tarjeta-tipo">Actividad</p>' +
                '<p class="tarjeta-texto-lora">' + (datos.enunciado || '') + '</p>' +
                '<textarea id="input-frase-' + clave + '" class="textarea-reflexion input-frase" ' +
                  'placeholder="Escribe aquí..." oninput="window.verificarFrase(\'' + clave + '\')"></textarea>' +
                '<button class="btn-primario" id="btn-frase-' + clave + '" ' +
                  'style="opacity:.4;pointer-events:none" ' +
                  'onclick="window.guardarFrase(\'' + clave + '\')">Guardar</button>';
        break;

      case 'pregunta_reconocimiento': {
        var ops = (datos.opciones || []).map(function (op) {
          return '<button class="opcion-btn" ' +
            'onclick="this.classList.add(\'seleccionado\'); window.registrarRespuesta(\'' + clave + '\',\'' + op + '\')">' +
            op + '</button>';
        }).join('');
        inner = '<p class="tarjeta-tipo">Actividad</p>' +
                '<p class="tarjeta-texto-lora">' + (datos.pregunta || '') + '</p>' +
                '<div class="opciones-lista">' + ops + '</div>';
        break;
      }

      case 'momento_silencio': {
        var seg = datos.duracion || 60;
        var m = Math.floor(seg / 60); var ss = seg % 60;
        inner = '<p class="tarjeta-tipo">Momento de silencio</p>' +
                '<p class="tarjeta-texto-lora">' + (datos.invitacion || 'Quédate en silencio.') + '</p>' +
                '<div class="silencio-timer" id="silencio-display">' + m + ':' + (ss < 10 ? '0' : '') + ss + '</div>' +
                '<button class="btn-primario" id="btn-iniciar-silencio" ' +
                  'onclick="window.iniciarSilencio(' + seg + ',\'' + clave + '\')">Comenzar</button>' +
                '<button class="btn-secundario" style="margin-top:10px" ' +
                  'onclick="window.registrarRespuesta(\'' + clave + '\',\'saltado\')">Saltar</button>';
        break;
      }

      case 'dos_caras':
        inner = '<p class="tarjeta-tipo">Actividad</p>' +
                '<p class="tarjeta-texto-lora">' + (datos.pregunta || '') + '</p>' +
                '<div class="dos-caras-contenedor">' +
                  '<button class="dos-caras-btn" ' +
                    'onclick="this.classList.add(\'seleccionado\'); window.registrarRespuesta(\'' + clave + '\',\'A\')">' +
                    (datos.opcionA || 'A') + '</button>' +
                  '<span class="dos-caras-o">o</span>' +
                  '<button class="dos-caras-btn" ' +
                    'onclick="this.classList.add(\'seleccionado\'); window.registrarRespuesta(\'' + clave + '\',\'B\')">' +
                    (datos.opcionB || 'B') + '</button>' +
                '</div>';
        break;

      case 'la_palabra': {
        var palabras = (datos.texto || '').split(' ');
        var spans = palabras.map(function (pal) {
          return '<span class="palabra-tap" onclick="' +
            'Array.from(document.querySelectorAll(\'.palabra-tap\')).forEach(function(p){p.classList.remove(\'palabra-seleccionada\');});' +
            'this.classList.add(\'palabra-seleccionada\');' +
            'window.registrarRespuesta(\'' + clave + '\',this.textContent.trim())">' +
            pal + '</span>';
        }).join(' ');
        inner = '<p class="tarjeta-tipo">Actividad</p>' +
                '<p class="tarjeta-texto-lora" style="font-size:15px;margin-bottom:16px">' + (datos.instruccion || '') + '</p>' +
                '<p class="palabras-texto">' + spans + '</p>';
        break;
      }

      case 'mapa_corporal':
        inner = '<p class="tarjeta-tipo">Actividad</p>' +
                '<p class="tarjeta-texto-lora" style="text-align:center">' + (datos.pregunta || '') + '</p>' +
                '<div class="cuerpo-contenedor">' +
                  '<svg viewBox="0 0 100 220" class="cuerpo-svg" onclick="window.tocarCuerpo(event,\'' + clave + '\')">' +
                    '<circle cx="50" cy="20" r="14" class="cuerpo-zona" data-zona="cabeza"/>' +
                    '<rect x="44" y="33" width="12" height="10" class="cuerpo-zona" data-zona="cuello"/>' +
                    '<rect x="30" y="43" width="40" height="35" rx="4" class="cuerpo-zona" data-zona="pecho"/>' +
                    '<rect x="33" y="78" width="34" height="28" rx="4" class="cuerpo-zona" data-zona="abdomen"/>' +
                    '<rect x="14" y="43" width="14" height="50" rx="6" class="cuerpo-zona" data-zona="brazo izquierdo"/>' +
                    '<rect x="72" y="43" width="14" height="50" rx="6" class="cuerpo-zona" data-zona="brazo derecho"/>' +
                    '<rect x="33" y="108" width="16" height="60" rx="6" class="cuerpo-zona" data-zona="pierna izquierda"/>' +
                    '<rect x="51" y="108" width="16" height="60" rx="6" class="cuerpo-zona" data-zona="pierna derecha"/>' +
                    '<circle id="punto-cuerpo" cx="-10" cy="-10" r="6" fill="var(--orange)" opacity="0.8"/>' +
                  '</svg>' +
                  '<p id="zona-seleccionada" class="zona-texto">Toca donde lo sientes</p>' +
                '</div>';
        break;

      case 'escala_dificultad': {
        var emojisD = ['🌱', '🌊', '⛰️'];
        var dbtns = (datos.opciones || []).map(function (op, i) {
          return '<button class="dificultad-btn" ' +
            'onclick="Array.from(document.querySelectorAll(\'.dificultad-btn\')).forEach(function(b){b.classList.remove(\'dificultad-activo\');});' +
            'this.classList.add(\'dificultad-activo\');' +
            'window.registrarRespuesta(\'' + clave + '\',\'' + op + '\')">' +
            '<span class="dificultad-emoji">' + emojisD[i] + '</span>' +
            '<span class="dificultad-label">' + op + '</span>' +
            '</button>';
        }).join('');
        inner = '<p class="tarjeta-tipo">Actividad</p>' +
                '<p class="tarjeta-texto-lora" style="text-align:center">' + (datos.pregunta || '') + '</p>' +
                '<div class="dificultad-contenedor">' + dbtns + '</div>';
        break;
      }

      case 'antes_despues':
        inner = '<p class="tarjeta-tipo">Actividad</p>' +
                '<div class="antes-despues-contenedor">' +
                  '<div class="antes-despues-bloque">' +
                    '<p class="antes-despues-label">' + (datos.enunciadoAntes || '') + '</p>' +
                    '<textarea id="ad-antes" class="textarea-reflexion" placeholder="Escribe aquí..." ' +
                      'style="min-height:70px" oninput="window.verificarAntesDespues(\'' + clave + '\')"></textarea>' +
                  '</div>' +
                  '<div class="antes-despues-bloque">' +
                    '<p class="antes-despues-label">' + (datos.enunciadoDespues || '') + '</p>' +
                    '<textarea id="ad-despues" class="textarea-reflexion" placeholder="Escribe aquí..." ' +
                      'style="min-height:70px" oninput="window.verificarAntesDespues(\'' + clave + '\')"></textarea>' +
                  '</div>' +
                  '<button class="btn-primario" id="btn-ad" style="opacity:.4;pointer-events:none" ' +
                    'onclick="window.guardarAntesDespues(\'' + clave + '\')">Guardar</button>' +
                '</div>';
        break;

      case 'nombrar_emocion': {
        var iconosMap = {
          tristeza: '😢', miedo: '😨', esperanza: '🌟', gratitud: '🙏',
          confusión: '😕', paz: '☮️', enojo: '😤', ternura: '🥰'
        };
        var ebtns = (datos.opciones || []).map(function (op) {
          var ico = iconosMap[op] || '•';
          return '<button class="emocion-btn" ' +
            'onclick="this.classList.toggle(\'emocion-activa\');window.actualizarEmociones()">' +
            '<span class="emocion-icono">' + ico + '</span>' +
            '<span class="emocion-label">' + op + '</span>' +
            '</button>';
        }).join('');
        inner = '<p class="tarjeta-tipo">Actividad</p>' +
                '<p class="tarjeta-texto-lora" style="text-align:center">' + (datos.pregunta || '') + '</p>' +
                '<div class="emociones-grid">' + ebtns + '</div>' +
                '<button class="btn-secundario" id="btn-emociones" ' +
                  'style="margin-top:16px;opacity:.4;pointer-events:none" ' +
                  'onclick="window.confirmarEmociones(\'' + clave + '\')">Confirmar</button>';
        break;
      }

      case 'carta_breve':
        inner = '<p class="tarjeta-tipo">Actividad</p>' +
                '<p class="tarjeta-texto-lora" style="font-style:italic">' + (datos.encabezado || '') + '</p>' +
                '<textarea id="carta-texto-' + clave + '" class="textarea-reflexion" placeholder="Escribe aquí..." ' +
                  'style="min-height:140px" oninput="window.verificarCarta(\'' + clave + '\')"></textarea>' +
                '<button class="btn-primario" id="btn-carta-' + clave + '" style="opacity:.4;pointer-events:none" ' +
                  'onclick="window.guardarCarta(\'' + clave + '\')">Enviar carta</button>';
        break;

      default:
        inner = '<p class="tarjeta-tipo">Actividad</p>' +
                '<p class="tarjeta-texto-lora">' +
                  (datos.pregunta || datos.enunciado || datos.instruccion || datos.encabezado || '') +
                '</p>' +
                '<button class="btn-primario" onclick="window.marcarCompletada()">Continuar</button>';
    }

    return '<div class="tarjeta-inner">' +
             inner +
             '<p class="actividad-feedback" id="actividad-feedback" style="opacity:0">✓ Guardado</p>' +
           '</div>';
  }

  /* ── Persistencia en Firestore ── */

  function guardarEnFirestore(datos) {
    if (!window._uid || !window._retiroSlug) return;
    var datosLimpios = {};
    Object.keys(datos).forEach(function (k) {
      datosLimpios[k] = datos[k] === 'SERVER_TIMESTAMP'
        ? firebase.firestore.FieldValue.serverTimestamp()
        : datos[k];
    });
    _db.collection('users').doc(window._uid)
      .collection('talleres').doc(window._retiroSlug)
      .set(datosLimpios, { merge: true })
      .catch(function (e) { console.warn('[Santuario] write:', e); });
  }

  function guardarEnDiario(entradas) {
    if (!window._uid) return;
    entradas.forEach(function (entrada) {
      _db.collection('users').doc(window._uid)
        .collection('diario')
        .add({
          fecha:          firebase.firestore.FieldValue.serverTimestamp(),
          texto:          entrada.texto,
          origen:         entrada.origen,
          tallerSlug:     entrada.tallerSlug,
          tallerNombre:   entrada.tallerNombre,
          misterioNombre: entrada.misterioNombre,
          misterioIndex:  entrada.misterioIndex,
          preguntaIndex:  entrada.preguntaIndex,
          pregunta:       entrada.pregunta
        })
        .catch(function (e) { console.warn('[Santuario] diario:', e); });
    });
  }

  function marcarRetiroCompletado() {
    if (!window._uid || !window._retiroSlug) return;
    _db.collection('users').doc(window._uid)
      .collection('talleres').doc(window._retiroSlug)
      .set({
        completed:     true,
        completedAt:   firebase.firestore.FieldValue.serverTimestamp(),
        lastCardIndex: _tarjetas.length - 1
      }, { merge: true })
      .catch(function (e) { console.warn('[Santuario] complete:', e); });
  }

  /* ── Evaluación IA ── */

  async function llamarEvaluacion() {
    var respuestas   = window._respuestas || {};
    var reflexiones  = {};

    // Leer reflexiones escritas guardadas en Firestore (subcolección diario)
    try {
      var snap = await _db.collection('users').doc(window._uid)
        .collection('diario')
        .where('tallerSlug', '==', window._retiroSlug)
        .get();
      snap.forEach(function (doc) {
        var d = doc.data();
        if (d.texto && d.texto.trim()) {
          reflexiones[doc.id] = d.texto.trim();
        }
      });
    } catch (e) {
      console.warn('[Santuario] reflexiones read:', e);
    }

    var fn = firebase.app().functions('us-central1').httpsCallable('evaluarRetiro');
    var result = await fn({
      tallerNombre: window._retiroNombre || window._retiroSlug,
      respuestas:   respuestas,
      reflexiones:  reflexiones
    });
    return result.data.feedback || '';
  }

  window.guardarFeedback = function (texto) {
    if (!window._uid || !window._retiroSlug) return;
    _db.collection('users').doc(window._uid)
      .collection('diario').add({
        origen:       'evaluacion_taller',
        tallerSlug:   window._retiroSlug,
        tallerNombre: window._retiroNombre || window._retiroSlug,
        texto:        texto,
        fecha:        firebase.firestore.FieldValue.serverTimestamp()
      })
      .catch(function (e) { console.warn('[Santuario] guardar feedback:', e); });
  };

  window.mostrarBadge = function () {
    var badge = document.getElementById('cierre-badge');
    if (badge) {
      badge.style.display = 'flex';
      badge.style.opacity = '0';
      badge.style.transition = 'opacity 0.6s';
      setTimeout(function () { badge.style.opacity = '1'; }, 30);
    }
  };

  /* ── Modal de oración ── */

  function abrirOracion(datos, mIndex) {
    var urlParams = new URLSearchParams();

    // Buscar el nombre del Misterio en el array de tarjetas
    var nombreMisterio = datos.nombre || '';
    if (!nombreMisterio) {
      for (var i = 0; i < _tarjetas.length; i++) {
        var t = _tarjetas[i];
        if (t.tipo === 'portada_misterio' && t.indice === mIndex && t.datos) {
          nombreMisterio = t.datos.nombre || 'Oración';
          break;
        }
      }
    }
    if (!nombreMisterio) nombreMisterio = 'Oración';

    urlParams.set('nombre', nombreMisterio);
    urlParams.set('texto',  datos.texto || '');
    urlParams.set('audio',  datos.audio || '');

    var ancho = Math.min(480, screen.width);
    var alto  = Math.min(700, screen.height);
    var left  = Math.floor((screen.width  - ancho) / 2);
    var top   = Math.floor((screen.height - alto)  / 2);

    var popup = window.open(
      _base() + 'rezar_taller.html?' + urlParams.toString(),
      'oracion_taller',
      'width=' + ancho + ',height=' + alto +
      ',left=' + left + ',top=' + top +
      ',resizable=no,scrollbars=yes'
    );

    if (!popup) return; // popup bloqueado — silencioso

    window.addEventListener('message', function handler(e) {
      if (e.origin !== location.origin) return;
      if (e.data && e.data.tipo === 'oracion_completada') {
        window.removeEventListener('message', handler);
        window.marcarCompletada();
      }
    });
  }

  window.abrirOracionModal = function (mIndex) {
    var tarjetaOracion = null;
    for (var i = 0; i < _tarjetas.length; i++) {
      if (_tarjetas[i].tipo === 'oracion' && _tarjetas[i].indice === mIndex) {
        tarjetaOracion = _tarjetas[i];
        break;
      }
    }
    if (tarjetaOracion) abrirOracion(tarjetaOracion.datos, mIndex);
  };

  function iniciarMotor(tarjetas, indexInicial) {
    _tarjetas          = tarjetas;
    _indexActual       = indexInicial || 0;
    _tarjetaCompletada = false;
    generarSegmentos(_tarjetas.length);
    mostrarTarjeta(_indexActual);
  }

  function mostrarTarjeta(index) {
    var contenedor = document.getElementById('retiro-tarjetas');
    var tarjeta    = _tarjetas[index];
    if (!tarjeta) return;

    cargarAudioDeTarjeta(tarjeta);

    var html = '';

    switch (tarjeta.tipo) {

      case 'umbral':
        html = `<div class="tarjeta tarjeta-umbral">
          <div class="tarjeta-hero-overlay"></div>
          <div class="tarjeta-inner tarjeta-inner-centrada">
            <p class="tarjeta-tipo">◆ Santuario</p>
            <h1 class="tarjeta-titulo-hero">${tarjeta.datos.nombre}</h1>
            <p class="tarjeta-subtexto">Un retiro para este momento de tu camino</p>
            <button class="btn-primario" onclick="window.marcarCompletada()">Comenzar el retiro</button>
          </div>
        </div>`;
        break;

      case 'introduccion':
        html = `<div class="tarjeta tarjeta-contenido">
          <div class="tarjeta-inner">
            <p class="tarjeta-tipo">Introducción</p>
            <p class="tarjeta-texto-lora">${tarjeta.datos.texto}</p>
            <button class="btn-secundario" onclick="window.marcarCompletada()"
              id="btn-continuar-intro" style="opacity:0;pointer-events:none">
              Continuar →
            </button>
          </div>
        </div>`;
        setTimeout(function () {
          var btn = document.getElementById('btn-continuar-intro');
          if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
        }, 5000);
        break;

      case 'portada_misterio':
        html = `<div class="tarjeta tarjeta-umbral">
          <div class="tarjeta-hero-overlay"></div>
          <div class="tarjeta-inner tarjeta-inner-centrada">
            <p class="tarjeta-tipo">Misterio ${tarjeta.indice + 1} de 5</p>
            <h2 class="tarjeta-titulo-hero">${tarjeta.datos.nombre}</h2>
            <p class="tarjeta-subtexto">${tarjeta.datos.subtituloTematico}</p>
          </div>
        </div>`;
        _tarjetaCompletada = true;
        setTimeout(function () {
          if (_tarjetas[_indexActual] && _tarjetas[_indexActual].tipo === 'portada_misterio') {
            window.avanzarTarjeta();
          }
        }, 3000);
        break;

      case 'evangelio':
        html = `<div class="tarjeta tarjeta-contenido">
          <div class="tarjeta-inner">
            <p class="tarjeta-tipo">Evangelio</p>
            <p class="tarjeta-texto-lora tarjeta-texto-cita">${tarjeta.datos.texto}</p>
            <p class="tarjeta-referencia">${tarjeta.datos.referencia}</p>
            <button class="btn-secundario" onclick="window.marcarCompletada()"
              id="btn-he-leido" style="opacity:0;pointer-events:none">
              He leído esto
            </button>
          </div>
        </div>`;
        setTimeout(function () {
          var btn = document.getElementById('btn-he-leido');
          if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
        }, 5000);
        break;

      case 'contemplacion':
        html = `<div class="tarjeta tarjeta-contenido">
          <div class="tarjeta-inner">
            <p class="tarjeta-tipo">Contemplación</p>
            <p class="tarjeta-texto-lora">${tarjeta.datos.texto}</p>
            <button class="btn-secundario" onclick="window.marcarCompletada()"
              id="btn-continuar-cont" style="opacity:0;pointer-events:none">
              Continuar →
            </button>
          </div>
        </div>`;
        setTimeout(function () {
          var btn = document.getElementById('btn-continuar-cont');
          if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
        }, 8000);
        break;

      case 'actividad':
        html = '<div class="tarjeta tarjeta-contenido">' +
               renderActividad(tarjeta.datos, tarjeta.indice, tarjeta.subindice) +
               '</div>';
        break;

      case 'oracion':
        html = `<div class="tarjeta tarjeta-oracion">
          <div class="tarjeta-inner tarjeta-inner-centrada">
            <p class="tarjeta-tipo" style="color:rgba(255,255,255,.5)">Oración</p>
            <p class="tarjeta-texto-lora" style="color:white;font-style:italic;font-size:17px">${tarjeta.datos.texto}</p>
            <button class="btn-amen" onclick="window.abrirOracionModal(${tarjeta.indice})">Abrir en oración</button>
            <p style="font-family:Inter,sans-serif;font-size:13px;color:rgba(255,255,255,.4);margin-top:12px">Toca para rezar este Misterio</p>
          </div>
        </div>`;
        break;

      case 'canto':
        html = `<div class="tarjeta tarjeta-contenido">
          <div class="tarjeta-inner">
            <p class="tarjeta-tipo">Canto</p>
            <h3 class="tarjeta-titulo" style="font-size:20px;margin-bottom:16px">${tarjeta.datos.titulo}</h3>
            <p class="tarjeta-texto-lora" style="font-size:16px;white-space:pre-line">${tarjeta.datos.letra}</p>
            <button class="btn-secundario" onclick="window.marcarCompletada()">Saltar</button>
          </div>
        </div>`;
        _tarjetaCompletada = true;
        break;

      case 'preguntas': {
        var preguntas = tarjeta.datos;
        var inputs = preguntas.map(function (p, i) {
          return '<div class="pregunta-bloque">' +
            '<p class="tarjeta-texto-lora" style="font-size:17px;margin-bottom:8px">' + p + '</p>' +
            '<textarea id="pregunta-' + i + '" class="textarea-reflexion" ' +
              'placeholder="Escribe aquí tu reflexión..." ' +
              'oninput="window.verificarPreguntas()"></textarea>' +
            '</div>';
        }).join('');
        html = `<div class="tarjeta tarjeta-contenido">
          <div class="tarjeta-inner">
            <p class="tarjeta-tipo">Reflexión</p>
            ${inputs}
            <button class="btn-primario" id="btn-guardar-preguntas"
              onclick="window.guardarPreguntas()"
              style="opacity:.4;pointer-events:none">
              Guardar y continuar
            </button>
          </div>
        </div>`;
        break;
      }

      case 'cierre': {
        marcarRetiroCompletado();
        var invNivelId = (tarjeta.datos && tarjeta.datos.invitacionItinerario && tarjeta.datos.invitacionItinerario.nivelId) || '';
        var itinerarioBtn = invNivelId
          ? '<button class="btn-secundario" onclick="location.href=\'orar.html?c=' + invNivelId + '\'">Continuar el itinerario →</button>'
          : '';
        html = `<div class="tarjeta tarjeta-contenido">
          <div class="tarjeta-inner">
            <div class="tarjeta-cierre">
              <p class="tarjeta-tipo">Cierre</p>
              <h2 class="tarjeta-titulo-hero" style="font-size:26px;margin:0">Has cruzado esto</h2>

              <div class="cierre-espera" id="cierre-espera">
                <div class="cierre-spinner"></div>
                <p class="cierre-espera-texto">Preparando tu acompañamiento…</p>
              </div>

              <div class="cierre-feedback" id="cierre-feedback">
                <p class="cierre-feedback-texto" id="cierre-feedback-texto"></p>
              </div>

              <div class="cierre-badge" id="cierre-badge">
                <div class="badge-icono">🕊️</div>
                <p class="badge-titulo">Retiro completado</p>
                <p class="badge-subtexto" id="cierre-badge-nombre"></p>
              </div>

              <div class="cierre-cantos" id="cierre-cantos" style="display:none">
                <p class="cierre-cantos-label">🎵 Cantos desbloqueados en este retiro</p>
                <button class="btn-secundario" onclick="location.href='cantos.html'">Ver en cantos.html</button>
              </div>

              <div class="cierre-acciones" id="cierre-acciones" style="display:none">
                <button class="btn-primario" onclick="window.volverHospederia()">Volver al Santuario</button>
                ${itinerarioBtn}
              </div>
            </div>
          </div>
        </div>`;
        _tarjetaCompletada = true;

        // Llamar evaluación IA tras render
        setTimeout(function () {
          llamarEvaluacion().then(function (feedback) {
            var espera   = document.getElementById('cierre-espera');
            var fbDiv    = document.getElementById('cierre-feedback');
            var fbTexto  = document.getElementById('cierre-feedback-texto');
            var acciones = document.getElementById('cierre-acciones');
            var cantos   = document.getElementById('cierre-cantos');
            var badgeNom = document.getElementById('cierre-badge-nombre');

            if (espera)   espera.style.display  = 'none';
            if (fbTexto)  fbTexto.textContent    = feedback || 'Has completado este retiro con honestidad y valentía.';
            if (fbDiv)    fbDiv.style.display    = 'flex';
            if (badgeNom) badgeNom.textContent   = window._retiroNombre || '';
            if (acciones) acciones.style.display = 'flex';
            if (cantos)   cantos.style.display   = 'flex';

            window._feedbackIA = feedback;
            if (feedback) window.guardarFeedback(feedback);
            window.mostrarBadge();
          }).catch(function (e) {
            console.warn('[Santuario] evaluación:', e);
            var espera   = document.getElementById('cierre-espera');
            var fbDiv    = document.getElementById('cierre-feedback');
            var fbTexto  = document.getElementById('cierre-feedback-texto');
            var acciones = document.getElementById('cierre-acciones');
            var cantos   = document.getElementById('cierre-cantos');

            if (espera)   espera.style.display  = 'none';
            if (fbTexto)  fbTexto.textContent   = 'Has completado este retiro con honestidad y valentía. Lo que has contemplado hoy es semilla — dale tiempo para crecer en tu corazón.';
            if (fbDiv)    fbDiv.style.display   = 'flex';
            if (acciones) acciones.style.display = 'flex';
            if (cantos)   cantos.style.display   = 'flex';
          });
        }, 400);
        break;
      }

      default:
        html = '<div class="tarjeta tarjeta-contenido"><div class="tarjeta-inner">' +
          '<p class="tarjeta-tipo">' + tarjeta.tipo.toUpperCase() + '</p>' +
          '<button class="btn-primario" onclick="window.marcarCompletada()">Continuar</button>' +
          '</div></div>';
    }

    contenedor.innerHTML = html;
    actualizarProgreso(index, _tarjetas.length);
    actualizarTitulo(tarjeta.titulo || tarjeta.tipo);
    iniciarSwipe();
  }

  window.marcarCompletada = function () {
    _tarjetaCompletada = true;
    setTimeout(function () { window.avanzarTarjeta(); }, 180);
  };

  window.avanzarTarjeta = function () {
    if (!_tarjetaCompletada) {
      sacudirTarjeta();
      return;
    }
    if (_indexActual < _tarjetas.length - 1) {
      _indexActual++;
      _tarjetaCompletada = false;
      mostrarTarjeta(_indexActual);
      // Guardar progreso en Firestore
      if (window._uid && slug) {
        _db.collection('users').doc(window._uid)
          .collection('talleres').doc(slug)
          .set({
            lastCardIndex: _indexActual,
            lastSeenAt:    firebase.firestore.FieldValue.serverTimestamp(),
            tallerSlug:    slug
          }, { merge: true })
          .catch(function (e) { console.warn('[Santuario] Firestore save:', e); });
      }
    }
  };

  window.retrocederTarjeta = function () {
    if (_indexActual > 0) {
      _indexActual--;
      _tarjetaCompletada = true;
      mostrarTarjeta(_indexActual);
    }
  };

  function sacudirTarjeta() {
    var el = document.getElementById('tarjeta-actual');
    if (!el) return;
    el.classList.add('sacudir');
    setTimeout(function () { el.classList.remove('sacudir'); }, 500);
    var msg = el.querySelector('.msg-bloqueo');
    if (!msg) {
      msg = document.createElement('p');
      msg.className = 'msg-bloqueo';
      msg.textContent = 'Interactúa para continuar';
      el.appendChild(msg);
    }
    msg.style.opacity = '1';
    setTimeout(function () { msg.style.opacity = '0'; }, 2000);
  }

  function iniciarSwipe() {
    var contenedor = document.getElementById('retiro-tarjetas');
    var startX = 0;
    var startY = 0;

    contenedor.ontouchstart = function (e) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    contenedor.ontouchend = function (e) {
      var dx = e.changedTouches[0].clientX - startX;
      var dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < Math.abs(dy)) return;
      if (Math.abs(dx) < 50) return;
      if (dx < 0) window.avanzarTarjeta();
      else        window.retrocederTarjeta();
    };
  }

  /* ── 5D: Carga y construcción de tarjetas ── */

  function cargarRetiro(retiroSlug) {
    return fetch(_base() + 'data/' + retiroSlug + '.json')
      .then(function (res) {
        if (!res.ok) throw new Error('No se encontró ' + retiroSlug);
        return res.json();
      });
  }

  function construirTarjetas(retiro) {
    var tarjetas = [];

    tarjetas.push({ tipo: 'umbral',       titulo: retiro.nombre,   datos: retiro });
    tarjetas.push({ tipo: 'introduccion', titulo: 'Introducción',  datos: retiro.introduccion });

    retiro.misterios.forEach(function (m, mi) {
      tarjetas.push({ tipo: 'portada_misterio', titulo: m.nombre,        datos: m,           indice: mi });
      tarjetas.push({ tipo: 'evangelio',         titulo: 'Evangelio',     datos: m.evangelio, indice: mi });
      tarjetas.push({ tipo: 'contemplacion',     titulo: 'Contemplación', datos: m.contemplacion, indice: mi });
      m.actividades.forEach(function (a, ai) {
        tarjetas.push({ tipo: 'actividad', titulo: 'Actividad', datos: a, indice: mi, subindice: ai });
      });
      tarjetas.push({ tipo: 'oracion',   titulo: 'Oración',   datos: m.oracion,   indice: mi });
      tarjetas.push({ tipo: 'canto',     titulo: 'Canto',     datos: m.canto,     indice: mi });
      tarjetas.push({ tipo: 'preguntas', titulo: 'Reflexión', datos: m.preguntas, indice: mi });
    });

    tarjetas.push({ tipo: 'cierre', titulo: 'Has cruzado esto', datos: retiro.cierre });
    return tarjetas;
  }

  window.verificarPreguntas = function () {
    var textareas = document.querySelectorAll('.textarea-reflexion');
    var alguna    = Array.from(textareas).some(function (t) { return t.value.trim().length >= 20; });
    var btn       = document.getElementById('btn-guardar-preguntas');
    if (btn) {
      btn.style.opacity      = alguna ? '1'    : '.4';
      btn.style.pointerEvents = alguna ? 'auto' : 'none';
    }
  };

  window.guardarPreguntas = function () {
    var tarjeta = _tarjetas[_indexActual];
    var mIndex  = tarjeta ? tarjeta.indice : 0;

    // Nombre del Misterio
    var portada = null;
    for (var i = 0; i < _tarjetas.length; i++) {
      if (_tarjetas[i].tipo === 'portada_misterio' && _tarjetas[i].indice === mIndex) {
        portada = _tarjetas[i]; break;
      }
    }
    var misterioNombre = (portada && portada.datos && portada.datos.nombre)
      ? portada.datos.nombre : 'Misterio ' + (mIndex + 1);

    // Nombre del retiro (umbral)
    var umbral = null;
    for (var j = 0; j < _tarjetas.length; j++) {
      if (_tarjetas[j].tipo === 'umbral') { umbral = _tarjetas[j]; break; }
    }
    var tallerNombre = (umbral && umbral.datos && umbral.datos.nombre)
      ? umbral.datos.nombre : (window._retiroSlug || '');

    var textareas = document.querySelectorAll('.textarea-reflexion');
    var update    = {};
    var entradas  = [];

    Array.prototype.forEach.call(textareas, function (ta, qi) {
      var clave = 'm' + mIndex + '_p' + qi;
      var valor = ta.value.trim();
      if (valor.length > 0) {
        window._respuestas[clave] = valor;
        update['reflexiones.' + clave] = valor;
        entradas.push({
          texto:          valor,
          pregunta:       (tarjeta && tarjeta.datos && tarjeta.datos[qi]) ? tarjeta.datos[qi] : '',
          origen:         'taller',
          tallerSlug:     window._retiroSlug || '',
          tallerNombre:   tallerNombre,
          misterioNombre: misterioNombre,
          misterioIndex:  mIndex,
          preguntaIndex:  qi
        });
      }
    });

    update['lastSeenAt'] = 'SERVER_TIMESTAMP';
    guardarEnFirestore(update);
    if (window._uid && entradas.length > 0) guardarEnDiario(entradas);
    window.marcarCompletada();
  };

  if (slug) {
    // 5E: init con auth + resume desde Firestore
    new Promise(function (resolve) { _auth.onAuthStateChanged(resolve); })
      .then(function (user) {
        if (!user) {
          location.href = _base() + 'index.html';
          return Promise.reject('no-user');
        }
        window._uid = user.uid;
        return cargarRetiro(slug);
      })
      .then(function (retiro) {
        window._retiroNombre = retiro.nombre || slug;
        var tarjetas = construirTarjetas(retiro);
        // Leer documento para: (1) crear si no existe, (2) recuperar índice si resume
        return _db.collection('users').doc(window._uid)
          .collection('talleres').doc(slug).get()
          .then(function (snap) {
            if (!snap.exists) {
              _db.collection('users').doc(window._uid)
                .collection('talleres').doc(slug)
                .set({
                  tallerSlug:    slug,
                  tallerNombre:  retiro.nombre,
                  startedAt:     firebase.firestore.FieldValue.serverTimestamp(),
                  lastSeenAt:    firebase.firestore.FieldValue.serverTimestamp(),
                  lastCardIndex: 0,
                  completed:     false,
                  completedAt:   null,
                  respuestas:    {},
                  reflexiones:   {}
                }).catch(function (e) { console.warn('[Santuario] create doc:', e); });
              iniciarMotor(tarjetas, 0);
            } else {
              var idx = resume ? (snap.data().lastCardIndex || 0) : 0;
              iniciarMotor(tarjetas, idx);
            }
          })
          .catch(function () { iniciarMotor(tarjetas, 0); });
      })
      .catch(function (err) {
        if (err === 'no-user') return;
        console.error('[Santuario] Error iniciando retiro:', err);
        var el = document.getElementById('retiro-tarjetas');
        if (el) el.innerHTML =
          '<div style="padding:2rem;text-align:center">' +
            '<p style="color:var(--text);font-family:Lora,serif;font-size:19px">' +
              'No se pudo cargar el retiro.' +
            '</p>' +
            '<button class="btn-secundario" onclick="window.volverHospederia()" ' +
              'style="margin-top:16px">Volver al Santuario</button>' +
          '</div>';
      });
  }

})();
