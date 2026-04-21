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
}());
