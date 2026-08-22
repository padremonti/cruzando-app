/* CruzAndo — shared helpers (plan lógica → plan-utils.js) */
(function () {
  'use strict';

  // resolvePlan vive en plan-utils.js (cargado antes que este archivo).
  function isPremium(userData) {
    return window.resolvePlan(userData) !== 'free';
  }

  window.isPremium = isPremium;

  /* ── Skins catalog (espejo del catalog JSON para aplicar sin fetch) ── */
  var SKINS_CATALOG = {
    'skin_noche_oscura': {
      theme_vars: { '--bg': '#0A0610', '--card': '#120D1A', '--orange': '#9B59B6' }
    }
  };

  function applySavedSkin() {
    // Kit de recompensas en standby: sin tienda visible, una skin comprada antes
    // (o por un developer) se vería como un tema fantasma que nadie puede quitar.
    // La preferencia NO se borra: sigue en localStorage.activeSkin esperando.
    if (!(window.recompensasON && window.recompensasON())) return;
    var skinId = localStorage.getItem('activeSkin');
    if (!skinId) return;
    var skin = SKINS_CATALOG[skinId];
    if (!skin || !skin.theme_vars) return;
    var root = document.documentElement;
    Object.keys(skin.theme_vars).forEach(function (k) {
      root.style.setProperty(k, skin.theme_vars[k]);
    });
  }

  window.SKINS_CATALOG  = SKINS_CATALOG;
  window.applySavedSkin = applySavedSkin;
  applySavedSkin();
}());
