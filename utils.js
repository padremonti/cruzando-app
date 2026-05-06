/* CruzAndo — shared membership helpers */
(function () {
  'use strict';

  function resolvePlan(userData) {
    if (!userData) return 'free';
    var plan = (userData.plan || '').toLowerCase().trim();
    if (plan === 'premium' || plan === 'pro') return 'premium';
    if (plan === 'beta') {
      if (!userData.betaExpiresAt) return 'free';
      var expires = userData.betaExpiresAt.toDate
        ? userData.betaExpiresAt.toDate()
        : new Date(userData.betaExpiresAt);
      return new Date() <= expires ? 'beta' : 'free';
    }
    return 'free';
  }

  function isPremium(userData) {
    return resolvePlan(userData) !== 'free';
  }

  window.resolvePlan = resolvePlan;
  window.isPremium   = isPremium;

  /* ── Skins catalog (espejo del catalog JSON para aplicar sin fetch) ── */
  var SKINS_CATALOG = {
    'skin_noche_oscura': {
      theme_vars: { '--bg': '#0A0610', '--card': '#120D1A', '--orange': '#9B59B6' }
    }
  };

  function applySavedSkin() {
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
