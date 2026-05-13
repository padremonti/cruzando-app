// sanar.js — El Santuario · CruzAndo
(function () {
  'use strict';

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

  /* ── Render de cards ── */

  var SVG_LOCK = '<svg class="card-lock-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';

  function _cardFooter(r) {
    var c  = r.mundoColor;
    var sl = r.slug.replace(/'/g, '');

    switch (r.estado) {
      case 'disponible':
        return '<button class="card-btn" style="background:' + c + '" ' +
               'onclick="window.entrarRetiro(\'' + sl + '\')">Entrar al retiro →</button>';

      case 'en_progreso':
        return '<button class="card-btn" style="background:' + c + '" ' +
               'onclick="window.entrarRetiro(\'' + sl + '\',true)">Sigues en retiro →</button>';

      case 'completado':
        return '<div class="card-msg-done"><span>✓</span> Has cruzado esto</div>';

      case 'pendiente':
        return '<p class="card-msg-pronto">En preparación — próximamente disponible.</p>';

      default: // bloqueado
        return SVG_LOCK +
               '<p class="card-msg-lock">Lo encontrarás más adelante en tu camino.</p>';
    }
  }

  function _renderCard(r) {
    var c      = r.mundoColor;
    var active = r.estado === 'disponible' || r.estado === 'en_progreso' || r.estado === 'completado';

    var cardStyle = active
      ? 'style="background:' + _hex2rgba(c, 0.07) + ';border-color:' + _hex2rgba(c, 0.38) + '"'
      : '';

    var progBar = r.estado === 'en_progreso'
      ? '<div class="card-prog-wrap"><div class="card-prog-bar" style="background:' + c + ';width:40%"></div></div>'
      : '';

    return [
      '<div class="retiro-card ' + r.estado + '" ' + cardStyle + '>',
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
    /* Agrupar por número de Mundo manteniendo orden del JSON */
    var order  = [];
    var groups = {};
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

  /* ── Init ── */

  _applyTheme(_isLight);

  fetch(_base() + 'data/santuario_index.json')
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      _renderCatalogo(data.retiros);
    })
    .catch(function (err) {
      document.getElementById('hospederia').innerHTML =
        '<div class="error-msg">No se pudo cargar el catálogo.<br>Revisá tu conexión e intentá de nuevo.</div>';
      console.error('[Santuario]', err);
    });

})();
