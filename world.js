import { initializeApp }             from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { initializeAppCheck, ReCaptchaV3Provider }
                                  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const _app  = initializeApp({
  apiKey:            'AIzaSyCYCZi1LmFuqIis9yx3QF3McvGHlAGKRKY',
  authDomain:        'cruzando-app.firebaseapp.com',
  projectId:         'cruzando-app',
  storageBucket:     'cruzando-app.firebasestorage.app',
  messagingSenderId: '408196948528',
  appId:             '1:408196948528:web:de291e8afc969252e943f5'
});
// ── App Check (reCAPTCHA v3) — clave en appcheck-key.js; vacía = no-op ──
try {
  if (window.RECAPTCHA_SITE_KEY) {
    initializeAppCheck(_app, {
      provider: new ReCaptchaV3Provider(window.RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
  }
} catch(e) { console.warn('[AppCheck]', e); }

const _auth = getAuth(_app);
const _db   = getFirestore(_app);

(function() {
  'use strict';

  // ── Definición de Mundos ─────────────────────────────────────────
  const MUNDOS = [
    { id: 1,  nombre: 'Cruz',           color: '#FF7A00', emoji: '✝️',  proceso: 1 },
    { id: 2,  nombre: 'Emociones',      color: '#E8603C', emoji: '🌊',  proceso: 1 },
    { id: 3,  nombre: 'Mente',          color: '#7B5EA7', emoji: '✨',  proceso: 1 },
    { id: 4,  nombre: 'Corazón',        color: '#D4A017', emoji: '💛',  proceso: 1 },
    { id: 5,  nombre: 'Relaciones',     color: '#2E7D52', emoji: '🤝',  proceso: 1 },
    { id: 6,  nombre: 'Amor',           color: '#C2185B', emoji: '🌹',  proceso: 1 },
    { id: 7,  nombre: 'Tiempo',         color: '#00838F', emoji: '⭐',  proceso: 1, estrella: true },
    { id: 8,  nombre: 'Palabra',        color: '#1565C0', emoji: '📖',  proceso: 2 },
    { id: 9,  nombre: 'Espiritualidad', color: '#4527A0', emoji: '🕊',  proceso: 2 },
    { id: 10, nombre: 'Discipulado',    color: '#00695C', emoji: '⚓',  proceso: 2 },
    { id: 11, nombre: 'Bautismo',       color: '#0277BD', emoji: '💧',  proceso: 3 },
    { id: 12, nombre: 'Reconciliación', color: '#558B2F', emoji: '🕊',  proceso: 3 },
    { id: 13, nombre: 'Unción',         color: '#E65100', emoji: '🕯',  proceso: 3 },
    { id: 14, nombre: 'Confirmación',   color: '#6A1B9A', emoji: '🔥',  proceso: 3 },
    { id: 15, nombre: 'Eucaristía',     color: '#F9A825', emoji: '☀',  proceso: 3 },
  ];

  // ── Niveles por Mundo ────────────────────────────────────────────
  const NIVELES = {
    1: [
      { id: '0101', nombre: 'Males',      num: 1 },
      { id: '0102', nombre: 'Pecado',     num: 2 },
      { id: '0103', nombre: 'Conversión', num: 3 },
      { id: '0104', nombre: 'Gracia',     num: 4 },
    ],
    2: [
      { id: '0201', nombre: 'Sensaciones',  num: 1 },
      { id: '0202', nombre: 'Sentimientos', num: 2 },
      { id: '0203', nombre: 'Gustos',       num: 3 },
      { id: '0204', nombre: 'Deseos',       num: 4 },
    ],
    3: [
      { id: '0301', nombre: 'Imaginación',  num: 1 },
      { id: '0302', nombre: 'Memoria',      num: 2 },
      { id: '0303', nombre: 'Razón',        num: 3 },
      { id: '0304', nombre: 'Intenciones',  num: 4 },
    ],
    4: [
      { id: '0401', nombre: 'Necesidad', num: 1 },
      { id: '0402', nombre: 'Placer',    num: 2 },
      { id: '0403', nombre: 'Requiero',  num: 3 },
      { id: '0404', nombre: 'Gozo',      num: 4 },
    ],
    5: [
      { id: '0501', nombre: 'Dependencia', num: 1 },
      { id: '0502', nombre: 'Vínculo',     num: 2 },
      { id: '0503', nombre: 'Pertenencia', num: 3 },
      { id: '0504', nombre: 'Comunión',    num: 4 },
    ],
    6: [
      { id: '0601', nombre: 'Afecto',  num: 1 },
      { id: '0602', nombre: 'Amistad', num: 2 },
      { id: '0603', nombre: 'Querer',  num: 3 },
      { id: '0604', nombre: 'Caridad', num: 4 },
    ],
    7: [
      { id: '0701', nombre: 'Curiosidad', num: 1 },
      { id: '0702', nombre: 'Interés',    num: 2 },
      { id: '0703', nombre: 'Problemas',  num: 3 },
      { id: '0704', nombre: 'Asombro',    num: 4 },
    ],
    8: [
      { id: '0801', nombre: 'Creación',  num: 1 },
      { id: '0802', nombre: 'Alianza',   num: 2 },
      { id: '0803', nombre: 'Redención', num: 3 },
      { id: '0804', nombre: 'Felicidad', num: 4 },
    ],
    9: [
      { id: '0901', nombre: 'Integración', num: 1 },
      { id: '0902', nombre: 'Estética',    num: 2 },
      { id: '0903', nombre: 'Ascética',    num: 3 },
      { id: '0904', nombre: 'Mística',     num: 4 },
    ],
    10: [
      { id: '1001', nombre: 'Religiosidad', num: 1 },
      { id: '1002', nombre: 'Kerygma',      num: 2 },
      { id: '1003', nombre: 'Catequesis',   num: 3 },
      { id: '1004', nombre: 'Iglesia',      num: 4 },
    ],
    11: [
      { id: '1101', nombre: 'Conversión',   num: 1 },
      { id: '1102', nombre: 'Pascua',       num: 2 },
      { id: '1103', nombre: 'Consagración', num: 3 },
      { id: '1104', nombre: 'Santidad',     num: 4 },
    ],
    12: [
      { id: '1201', nombre: 'Pecado',       num: 1 },
      { id: '1202', nombre: 'Contrición',   num: 2 },
      { id: '1203', nombre: 'Confesión',    num: 3 },
      { id: '1204', nombre: 'Satisfacción', num: 4 },
    ],
    13: [
      { id: '1301', nombre: 'Males',        num: 1 },
      { id: '1302', nombre: 'Consolación',  num: 2 },
      { id: '1303', nombre: 'Misericordia', num: 3 },
      { id: '1304', nombre: 'Sanación',     num: 4 },
    ],
    14: [
      { id: '1401', nombre: 'Gracia',     num: 1 },
      { id: '1402', nombre: 'Dones',      num: 2 },
      { id: '1403', nombre: 'Frutos',     num: 3 },
      { id: '1404', nombre: 'Testimonio', num: 4 },
    ],
    15: [
      { id: '1501', nombre: 'Sensaciones',   num: 1 },
      { id: '1502', nombre: 'Participación', num: 2 },
      { id: '1503', nombre: 'Palabra',       num: 3 },
      { id: '1504', nombre: 'Comunión',      num: 4 },
    ],
  };

  // ── Santuarios por Mundo ─────────────────────────────────────────
  const SANTUARIOS = {
    1: [
      { nivel: '0102', tipo: 'santuario',  icono: '◆', nombre: 'Sanando el Duelo' },
      { nivel: '0103', tipo: 'albergue',   icono: '⬡', nombre: 'Sanando el Perdón' },
      { nivel: '0104', tipo: 'monasterio', icono: '✦', nombre: 'Sanando la Enfermedad' },
    ],
    2: [
      { nivel: '0202', tipo: 'santuario',  icono: '◆', nombre: 'Sanando el Enojo' },
      { nivel: '0203', tipo: 'albergue',   icono: '⬡', nombre: 'Sanando el Miedo' },
      { nivel: '0204', tipo: 'monasterio', icono: '✦', nombre: 'Sanando la Tristeza' },
    ],
    3: [
      { nivel: '0302', tipo: 'santuario',  icono: '◆', nombre: 'Sanando el Trauma' },
      { nivel: '0303', tipo: 'albergue',   icono: '⬡', nombre: 'Sanando la Crítica' },
      { nivel: '0304', tipo: 'monasterio', icono: '✦', nombre: 'Sanando la Mentira' },
    ],
    4: [
      { nivel: '0402', tipo: 'santuario',  icono: '◆', nombre: 'Sanando el Cansancio' },
      { nivel: '0403', tipo: 'albergue',   icono: '⬡', nombre: 'Sanando la Adicción' },
      { nivel: '0404', tipo: 'monasterio', icono: '✦', nombre: 'Sanando la Crisis' },
    ],
    5: [
      { nivel: '0502', tipo: 'santuario',  icono: '◆', nombre: 'Sanando mi Infancia Herida' },
      { nivel: '0503', tipo: 'albergue',   icono: '⬡', nombre: 'Sanando la Soledad' },
      { nivel: '0504', tipo: 'monasterio', icono: '✦', nombre: 'Sanando el Nido Vacío' },
    ],
    6: [
      { nivel: '0602', tipo: 'santuario',  icono: '◆', nombre: 'Sanando el Desamor' },
      { nivel: '0603', tipo: 'albergue',   icono: '⬡', nombre: 'Sanando la Infidelidad' },
      { nivel: '0604', tipo: 'monasterio', icono: '✦', nombre: 'Sanando el Divorcio' },
    ],
    7: [
      { nivel: '0702', tipo: 'santuario',  icono: '◆', nombre: 'Sanando el Estrés' },
      { nivel: '0703', tipo: 'albergue',   icono: '⬡', nombre: 'Sanando el Aburrimiento' },
      { nivel: '0704', tipo: 'monasterio', icono: '✦', nombre: 'Sanando la Vejez' },
    ],
  };

  // ── Estado de nodos (se rellena desde Firestore) ─────────────────
  const _estadoNodos = {};

  function getEstadoNodo(nivelId) {
    return _estadoNodos[nivelId] || 'bloqueado';
  }

  // ── Estado global ────────────────────────────────────────────────
  let _mundoActivo          = 1;
  let _mundosDesbloqueados  = [1];

  // ── Aplicar tema ─────────────────────────────────────────────────
  const temaGuardado = localStorage.getItem('theme') || 'dark';
  document.documentElement.dataset.theme = temaGuardado === 'light' ? 'light' : '';
  actualizarIconoTema();

  window.toggleTheme = function() {
    const esLight = document.documentElement.dataset.theme === 'light';
    document.documentElement.dataset.theme = esLight ? '' : 'light';
    localStorage.setItem('theme', esLight ? 'dark' : 'light');
    actualizarIconoTema();
  };

  function actualizarIconoTema() {
    const btn = document.getElementById('btn-world-theme');
    if (!btn) return;
    btn.textContent = document.documentElement.dataset.theme === 'light' ? '🌙' : '☀';
  }

  // ── Calcular estados desde datos de Firestore ────────────────────
  const BLOQUES = ['gozosos', 'luminosos', 'dolorosos', 'gloriosos'];

  function contarMisteriosCompletados(datos) {
    if (!datos || !datos.progress) return 0;
    let count = 0;
    BLOQUES.forEach(function(b) {
      const arr = datos.progress[b] || [];
      arr.forEach(function(x) { if (x !== null && x !== undefined) count++; });
    });
    return count;
  }

  function todoCompletado(mundoId) {
    return (NIVELES[mundoId] || []).every(function(n) {
      return _estadoNodos[n.id] === 'completado';
    });
  }

  function calcularEstados(progreso) {
    const TOTAL = 20;

    // Paso base: asignar estado según progreso real
    Object.values(NIVELES).flat().forEach(function(nivel) {
      const datos = progreso[nivel.id];
      if (!datos) {
        _estadoNodos[nivel.id] = 'bloqueado';
        return;
      }
      const completados = contarMisteriosCompletados(datos);
      if (completados >= TOTAL) {
        _estadoNodos[nivel.id] = 'completado';
      } else if (completados > 0) {
        _estadoNodos[nivel.id] = 'en_progreso';
      } else {
        _estadoNodos[nivel.id] = 'disponible';
      }
    });

    // Mundo 1 primer nivel siempre disponible
    if (_estadoNodos['0101'] === 'bloqueado') {
      _estadoNodos['0101'] = 'disponible';
    }

    // Dentro de cada Mundo: el primer nivel sin progreso
    // después de uno completado pasa a disponible
    Object.keys(NIVELES).forEach(function(mundoId) {
      const niveles = NIVELES[parseInt(mundoId)];
      for (var i = 1; i < niveles.length; i++) {
        var anterior = niveles[i - 1];
        var actual   = niveles[i];
        if (_estadoNodos[anterior.id] === 'completado' &&
            _estadoNodos[actual.id]   === 'bloqueado') {
          _estadoNodos[actual.id] = 'disponible';
          break;
        }
      }
    });
  }

  // ── Calcular tabs desbloqueados ──────────────────────────────────
  function calcularTabsDesbloqueados() {
    _mundosDesbloqueados = [1];

    if (todoCompletado(1)) {
      _mundosDesbloqueados.push(2);
      if (todoCompletado(2)) {
        _mundosDesbloqueados.push(3);
        if (todoCompletado(3)) _mundosDesbloqueados.push(4);
      }
      if (todoCompletado(2) && todoCompletado(4)) _mundosDesbloqueados.push(5);
      if (todoCompletado(5))                       _mundosDesbloqueados.push(6);
      if (todoCompletado(2) && todoCompletado(3))  _mundosDesbloqueados.push(7);
    }

    // Proceso 2 (Mundos 8-10): si todos los Mundos 1-7 completados
    const p1Completo = [1,2,3,4,5,6,7].every(todoCompletado);
    if (p1Completo) {
      _mundosDesbloqueados.push(8);
      if (todoCompletado(8)) {
        _mundosDesbloqueados.push(9);
        if (todoCompletado(9)) {
          _mundosDesbloqueados.push(10);
          _mundosDesbloqueados.push(11);
        }
      }
    }

    // Proceso 3: Rama A y B desde Mundo 11
    if (_mundosDesbloqueados.includes(11) && todoCompletado(11)) {
      _mundosDesbloqueados.push(12);
      _mundosDesbloqueados.push(14);
      if (todoCompletado(12)) _mundosDesbloqueados.push(13);
      if (todoCompletado(14)) _mundosDesbloqueados.push(15);
    }

    // Determinar mundo activo: primero con nodos disponibles o en_progreso,
    // o el último desbloqueado si no hay ninguno activo
    const conProgreso = _mundosDesbloqueados.filter(function(id) {
      return (NIVELES[id] || []).some(function(n) {
        return _estadoNodos[n.id] === 'en_progreso' ||
               _estadoNodos[n.id] === 'disponible';
      });
    });
    _mundoActivo = conProgreso.length > 0
      ? conProgreso[0]
      : _mundosDesbloqueados[_mundosDesbloqueados.length - 1];
  }

  // ── Generar tabs ─────────────────────────────────────────────────
  function generarTabs() {
    const contenedor = document.getElementById('tabs-container');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    MUNDOS.forEach(function(mundo) {
      const desbloqueado = _mundosDesbloqueados.includes(mundo.id);
      const esActivo = mundo.id === _mundoActivo;

      const tab = document.createElement('button');
      tab.className = 'tab-mundo' +
        (desbloqueado ? '' : ' bloqueado') +
        (esActivo ? ' activo' : '');
      tab.dataset.mundoId = mundo.id;

      if (desbloqueado) {
        tab.style.borderColor       = esActivo ? mundo.color : 'var(--border)';
        tab.style.backgroundColor   = esActivo ? mundo.color + '22' : 'transparent';
        tab.style.color             = esActivo ? mundo.color : 'var(--text-soft)';
      }

      tab.innerHTML =
        '<span>' + mundo.emoji + '</span>' +
        '<span>' + mundo.nombre + (mundo.estrella ? ' ★' : '') + '</span>' +
        (!desbloqueado ? '<span class="tab-candado">🔒</span>' : '');

      if (desbloqueado) {
        tab.onclick = function() { window.cambiarMundo(mundo.id); };
      }

      contenedor.appendChild(tab);
    });
  }

  // ── Disponibilidad de santuarios ────────────────────────────────
  function isSantuarioAvailable(mundoId) {
    return (NIVELES[mundoId] || []).some(function(n) {
      return _estadoNodos[n.id] !== 'bloqueado';
    });
  }

  // ── Render de un Mundo ───────────────────────────────────────────
  function renderMundo(mundo) {
    const niveles    = NIVELES[mundo.id]    || [];
    const santuarios = SANTUARIOS[mundo.id] || [];
    const color      = mundo.color;
    const sanAvail   = isSantuarioAvailable(mundo.id);

    const nodosHtml = niveles.map(function(nivel, i) {
      const esPrimero = i === 0;
      const esUltimo  = i === niveles.length - 1;
      const santuario = santuarios.find(function(s) { return s.nivel === nivel.id; });
      const slug      = 's' + mundo.id + '_' + nivel.num;

      const estado       = getEstadoNodo(nivel.id);
      const esBloqueado  = estado === 'bloqueado';
      const esCompletado = estado === 'completado';
      const esDisponible = estado === 'disponible';
      const esEnProgreso = estado === 'en_progreso';

      const nodoBg     = esBloqueado ? 'var(--surface)' : color + '22';
      const nodoBorder = esBloqueado ? 'var(--border)'  : color;
      const nodoColor  = esBloqueado ? 'var(--text-soft)' : color;

      const nodoClase = 'nodo-nivel' +
        (esCompletado ? ' nodo-completado' : '') +
        (esDisponible ? ' nodo-pulso'      : '') +
        (esEnProgreso ? ' nodo-progreso'   : '') +
        (esBloqueado  ? ' nodo-bloqueado'  : '');

      const nodoContenido = esCompletado
        ? '<span class="nodo-check">✓</span>'
        : esBloqueado
          ? '<span class="nodo-num" style="color:var(--text-soft)">🔒</span>'
          : '<span class="nodo-num" style="color:' + color + '">' + nivel.num + '</span>';

      const cofreHtml = (esCompletado && window.recompensasON())
        ? '<div class="nodo-cofre"' +
            ' id="cofre-' + nivel.id + '"' +
            ' onclick="window.abrirCofre(\'' + nivel.id + '\',' + mundo.id + ',event)">' +
            '📦' +
          '</div>'
        : '';

      const lineaIzq = !esPrimero
        ? '<div class="linea-horizontal" style="background:' + color + '44"></div>'
        : '';
      const lineaDer = !esUltimo
        ? '<div class="linea-horizontal" style="background:' + color + '44"></div>'
        : '';

      const santuarioHtml = santuario
        ? '<div class="nodo-fila-santuario">' +
            '<div class="linea-vertical" style="background:' + color + '44"></div>' +
            '<div class="nodo-santuario' + (sanAvail ? ' wp-open' : ' wp-locked') + '"' +
              ' data-slug="' + slug + '"' +
              ' style="border-color:' + (sanAvail ? color + '88' : 'var(--border)') + ';color:' + (sanAvail ? color : 'var(--text-soft)') + '"' +
              (sanAvail ? ' onclick="window.tapSantuario(\'' + slug + '\')"' : '') + '>' +
              santuario.icono +
            '</div>' +
            '<p class="nodo-label nodo-label-santuario">' + santuario.nombre + '</p>' +
          '</div>'
        : '';

      return '<div class="nodo-columna">' +
               '<div class="nodo-fila-principal">' +
                 lineaIzq +
                 '<div class="nodo-wrapper">' +
                   cofreHtml +
                   '<div class="' + nodoClase + '"' +
                     ' data-nivel="' + nivel.id + '"' +
                     ' data-mundo="' + mundo.id + '"' +
                     ' data-estado="' + estado + '"' +
                     ' style="border-color:' + nodoBorder + ';background:' + nodoBg + ';color:' + nodoColor + '"' +
                     ' onclick="window.tapNodo(\'' + nivel.id + '\',' + mundo.id + ')">' +
                     nodoContenido +
                   '</div>' +
                   '<p class="nodo-label">' + nivel.nombre + '</p>' +
                 '</div>' +
                 lineaDer +
               '</div>' +
               santuarioHtml +
             '</div>';
    }).join('');

    return '<div class="mundo-mapa">' +
             '<div class="mundo-titulo-mapa">' +
               '<span style="color:' + color + '">' + mundo.emoji + '</span>' +
               '<span style="color:' + color + '">' + mundo.nombre + (mundo.estrella ? ' ★' : '') + '</span>' +
             '</div>' +
             '<div class="nodos-fila">' + nodosHtml + '</div>' +
           '</div>';
  }

  // ── Generar paneles ──────────────────────────────────────────────
  function generarPaneles() {
    const contenedor = document.getElementById('mapa-container');
    if (!contenedor) return;
    // Eliminar paneles previos (si se re-renderiza)
    contenedor.querySelectorAll('.mundo-panel').forEach(function(p) { p.remove(); });

    MUNDOS.forEach(function(mundo) {
      const panel = document.createElement('div');
      panel.className = 'mundo-panel' + (mundo.id === _mundoActivo ? ' visible' : '');
      panel.id = 'panel-mundo-' + mundo.id;
      panel.innerHTML = renderMundo(mundo);
      contenedor.appendChild(panel);
    });
  }

  // ── Ocultar loading ──────────────────────────────────────────────
  function ocultarLoading() {
    const el = document.getElementById('world-loading');
    if (el) el.style.display = 'none';
  }

  // ── Inicializar con Firestore ────────────────────────────────────
  async function inicializar() {
    try {
      const user = await new Promise(function(resolve) {
        onAuthStateChanged(_auth, resolve);
      });

      if (!user) {
        location.href = 'index.html';
        return;
      }
      window._uid = user.uid;

      // Recopilar todos los nivelIds
      const nivelIds = Object.values(NIVELES).flat().map(function(n) { return n.id; });

      // Leer progreso en paralelo
      const snaps = await Promise.all(
        nivelIds.map(function(id) {
          return getDoc(doc(_db, 'users', user.uid, 'progress', id));
        })
      );

      // Construir mapa de progreso
      const progreso = {};
      snaps.forEach(function(snap, i) {
        if (snap.exists()) progreso[nivelIds[i]] = snap.data();
      });

      calcularEstados(progreso);
      calcularTabsDesbloqueados();

    } catch(err) {
      console.warn('[world] Error cargando mapa:', err);
      // Fallback: solo Mundo 1 disponible
      _estadoNodos['0101'] = 'disponible';
      _mundosDesbloqueados  = [1];
      _mundoActivo          = 1;
    }

    ocultarLoading();
    generarTabs();
    generarPaneles();
  }

  // ── Cambiar de Mundo activo ──────────────────────────────────────
  window.cambiarMundo = function(mundoId) {
    if (!_mundosDesbloqueados.includes(mundoId)) return;
    _mundoActivo = mundoId;

    document.querySelectorAll('.tab-mundo').forEach(function(tab) {
      const id = parseInt(tab.dataset.mundoId, 10);
      const mundo = MUNDOS.find(function(m) { return m.id === id; });
      if (!mundo) return;
      tab.classList.remove('activo');
      if (id === mundoId) {
        tab.classList.add('activo');
        tab.style.borderColor     = mundo.color;
        tab.style.backgroundColor = mundo.color + '22';
        tab.style.color           = mundo.color;
      } else {
        tab.style.borderColor     = 'var(--border)';
        tab.style.backgroundColor = 'transparent';
        tab.style.color           = 'var(--text-soft)';
      }
    });

    document.querySelectorAll('.mundo-panel').forEach(function(panel) {
      panel.classList.remove('visible');
    });
    const panelActivo = document.getElementById('panel-mundo-' + mundoId);
    if (panelActivo) panelActivo.classList.add('visible');

    const tabActivo = document.querySelector('[data-mundo-id="' + mundoId + '"]');
    if (tabActivo) {
      tabActivo.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  };

  // ── Tap en nodo ──────────────────────────────────────────────────
  window.tapNodo = function(nivelId, mundoId) {
    const estado = getEstadoNodo(nivelId);
    if (estado === 'bloqueado') {
      sacudirNodo(nivelId);
      return;
    }
    // 'completado' entra igual que los demás: con el kit en standby no hay cofre
    // que reciba el tap, y un cuaderno terminado debe poder reabrirse siempre.
    if (estado === 'disponible' || estado === 'en_progreso' || estado === 'completado') {
      location.href = 'orar.html?c=' + nivelId;
    }
  };

  // ── Abrir cofre ──────────────────────────────────────────────────
  window.abrirCofre = function(nivelId, mundoId, event) {
    event.stopPropagation();

    if (window._uid) {
      setDoc(
        doc(_db, 'users', window._uid, 'recompensas', nivelId),
        { nivelId: nivelId, vista: true, vistaAt: serverTimestamp() },
        { merge: true }
      ).catch(function(e) { console.warn('[world] recompensa:', e); });
    }

    const mundoData   = MUNDOS.find(function(m) { return m.id === mundoId; });
    const nivelData   = (NIVELES[mundoId] || []).find(function(n) { return n.id === nivelId; });
    const santuario   = (SANTUARIOS[mundoId] || []).find(function(s) { return s.nivel === nivelId; });
    const mundoNombre = mundoData ? mundoData.nombre : '';
    const nivelNombre = nivelData ? nivelData.nombre : nivelId;
    const nivelNum    = nivelData ? nivelData.num : 2;

    let html =
      '<div class="cofre-recompensa">' +
        '<span class="cofre-recomp-icono">🎵</span>' +
        '<div>' +
          '<p class="cofre-recomp-titulo">Canto desbloqueado</p>' +
          '<p class="cofre-recomp-sub">Disponible en tu biblioteca</p>' +
        '</div>' +
      '</div>' +
      '<div class="cofre-recompensa">' +
        '<span class="cofre-recomp-icono">🏅</span>' +
        '<div>' +
          '<p class="cofre-recomp-titulo">Badge obtenido</p>' +
          '<p class="cofre-recomp-sub">' + nivelNombre + ' · ' + mundoNombre + '</p>' +
        '</div>' +
      '</div>';

    /* El cofre ya vive bajo MOSTRAR_RECOMPENSAS; esta segunda puerta es para el
       dia que las recompensas se enciendan y El Santuario siga bajo desarrollo:
       el cofre volveria con una entrada a un retiro que no existe. */
    if (santuario && window.retirosON && window.retirosON()) {
      const slug = 's' + mundoId + '_' + nivelNum;
      html +=
        '<div class="cofre-recompensa cofre-recompensa-santuario"' +
          ' onclick="window.tapSantuario(\'' + slug + '\')">' +
          '<span class="cofre-recomp-icono">' + santuario.icono + '</span>' +
          '<div>' +
            '<p class="cofre-recomp-titulo">' + santuario.nombre + '</p>' +
            '<p class="cofre-recomp-sub">Retiro disponible → entrar</p>' +
          '</div>' +
        '</div>';
    }

    document.getElementById('cofre-modal-contenido').innerHTML = html;
    const modal = document.getElementById('cofre-modal');
    modal.style.display = 'flex';
    modal.style.animation = 'none';
    modal.offsetHeight;
    modal.style.animation = 'fadeInUp 0.3s ease-out';
  };

  // ── Cerrar cofre ─────────────────────────────────────────────────
  window.cerrarCofre = function() {
    const modal = document.getElementById('cofre-modal');
    if (modal) modal.style.display = 'none';
  };

  // ── Sacudir nodo bloqueado ───────────────────────────────────────
  function sacudirNodo(nivelId) {
    const nodo = document.querySelector('[data-nivel="' + nivelId + '"]');
    if (!nodo) return;
    nodo.classList.remove('sacudir');
    nodo.offsetHeight;
    nodo.classList.add('sacudir');
    setTimeout(function() { nodo.classList.remove('sacudir'); }, 500);
  }

  // ── Tap en Santuario ─────────────────────────────────────────────
  window.tapSantuario = function(slug) {
    if (window.retirosON && !window.retirosON()) return;
    location.href = 'retiros.html?retiro=' + slug;
  };

  // ── Arrancar ─────────────────────────────────────────────────────
  inicializar();

})();
