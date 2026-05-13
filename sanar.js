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

    // Verificar si los 5 Misterios Dolorosos del nivel de desbloqueo están completados
    if (progSnap.exists) {
      var completedMysteries = progSnap.data().completedMysteries;
      if (Array.isArray(completedMysteries)) {
        if (DOLOROSOS.every(function (n) { return completedMysteries.indexOf(n) !== -1; })) {
          return 'disponible';
        }
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

    var progBar = estado === 'en_progreso'
      ? '<div class="card-prog-wrap"><div class="card-prog-bar" style="background:' + c + ';width:40%"></div></div>'
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
    var el = document.getElementById('retiro-titulo');
    if (el) el.textContent = texto;
  }

  window.cerrarRetiro = function () {
    if (confirm('¿Salir del retiro? Tu progreso está guardado.')) {
      window.volverHospederia();
    }
  };

  window.toggleAudioRetiro = function () {
    console.log('Audio — próximamente en Bloque 5E');
  };

  /* ── 5C: Motor de tarjetas ── */

  var _tarjetas         = [];
  var _indexActual      = 0;
  var _tarjetaCompletada = false;

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
        html = `<div class="tarjeta tarjeta-contenido">
          <div class="tarjeta-inner">
            <p class="tarjeta-tipo">Actividad</p>
            <p class="tarjeta-texto-lora">${
              tarjeta.datos.pregunta  ||
              tarjeta.datos.enunciado ||
              tarjeta.datos.instruccion ||
              tarjeta.datos.encabezado  || ''
            }</p>
            <p class="tarjeta-subtexto" style="font-size:12px;opacity:.5">Tipo: ${tarjeta.datos.tipo}</p>
            <button class="btn-primario" onclick="window.marcarCompletada()">Responder</button>
          </div>
        </div>`;
        break;

      case 'oracion':
        html = `<div class="tarjeta tarjeta-oracion">
          <div class="tarjeta-inner tarjeta-inner-centrada">
            <p class="tarjeta-tipo" style="color:rgba(255,255,255,.5)">Oración</p>
            <p class="tarjeta-texto-lora" style="color:white;font-style:italic">${tarjeta.datos.texto}</p>
            <button class="btn-amen" onclick="window.marcarCompletada()">Amén</button>
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

      case 'cierre':
        html = `<div class="tarjeta tarjeta-contenido">
          <div class="tarjeta-inner tarjeta-inner-centrada">
            <p class="tarjeta-tipo">Cierre</p>
            <h2 class="tarjeta-titulo-hero" style="font-size:28px">Has cruzado esto</h2>
            <p class="tarjeta-subtexto">El cierre completo se implementa en el Bloque 10</p>
            <button class="btn-primario" onclick="window.volverHospederia()">Volver al Santuario</button>
          </div>
        </div>`;
        _tarjetaCompletada = true;
        break;

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
    var btn = document.querySelector('.btn-completar');
    if (btn) {
      btn.textContent = '✓ Completada — desliza para continuar';
      btn.style.opacity = '0.6';
      btn.disabled = true;
    }
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
    // Guardado real en Bloque 8
    window.marcarCompletada();
  };

  if (slug) {
    cargarRetiro(slug)
      .then(function (retiro) {
        var tarjetas = construirTarjetas(retiro);
        iniciarMotor(tarjetas, 0);
      })
      .catch(function (err) {
        console.error('Error cargando retiro:', err);
        document.getElementById('retiro-tarjetas').innerHTML =
          '<p style="padding:2rem;color:var(--text)">No se pudo cargar el retiro.</p>';
      });
  }

})();
