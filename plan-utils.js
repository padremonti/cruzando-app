/* CruzAndo — plan-utils.js
 * Lógica compartida de planes y acceso libre.
 * Incluir ANTES de utils.js en todos los archivos HTML.
 * Las funciones que usan Firebase reciben db/getDoc/setDoc/doc/serverTimestamp
 * como parámetros para no depender de un SDK específico.
 */
(function () {
  'use strict';

  // Niveles publicados en orden de itinerario (actualizar cuando se añada contenido).
  var PUBLISHED_NIVELES = ['0101', '0102', '0103', '0104'];

  // ── resolvePlan ──────────────────────────────────────────────────────────────
  // Devuelve 'free' | 'beta' | 'premium' | 'developer'
  function resolvePlan(userData) {
    if (!userData) return localStorage.getItem('cruzando_plan_cache') || 'free';
    var plan = (userData.plan || '').toLowerCase().trim();
    if (plan === 'developer') return 'developer';
    if (plan === 'premium' || plan === 'pro') return 'premium';
    if (plan === 'beta') {
      var exp = userData.betaExpiresAt;
      if (!exp) return 'free';
      var expMs = (typeof exp.toDate === 'function')
        ? exp.toDate().getTime()
        : (exp.seconds ? exp.seconds * 1000 : new Date(exp).getTime());
      return Date.now() <= expMs ? 'beta' : 'free';
    }
    return 'free';
  }

  // ── isPremiumOrAbove ─────────────────────────────────────────────────────────
  function isPremiumOrAbove(plan) {
    return plan === 'premium' || plan === 'beta' || plan === 'developer';
  }

  // ── canAccessModo ────────────────────────────────────────────────────────────
  // modo: 'audio' | 'libro' | 'rezar' | 'cantos' | 'sanar' | 'extras'
  //       | 'badges' | 'logros' | 'metros'
  function canAccessModo(modo, plan) {
    if (plan === 'developer') return true;
    var isPrem = isPremiumOrAbove(plan);
    if (modo === 'audio')   return true;
    if (modo === 'libro')   return isPrem;
    if (modo === 'rezar')   return isPrem;
    if (modo === 'cantos')  return isPrem;
    if (modo === 'sanar')   return isPrem;
    if (modo === 'extras')  return isPrem;
    if (modo === 'badges')  return true;
    if (modo === 'logros')  return true;
    if (modo === 'metros')  return true;
    return false;
  }

  // ── effectivePlan + _setViewAs ───────────────────────────────────────────────
  // Simulación de plan para developer (persiste en sessionStorage entre páginas).
  window.effectivePlan = function() {
    var viewAs = sessionStorage.getItem('cruzando_view_as') || window._viewAs || null;
    return viewAs || window.currentPlan ||
           localStorage.getItem('cruzando_plan_cache') || 'free';
  };

  window._setViewAs = function(simulatedPlan) {
    window._viewAs = simulatedPlan;
    if (simulatedPlan) {
      sessionStorage.setItem('cruzando_view_as', simulatedPlan);
    } else {
      sessionStorage.removeItem('cruzando_view_as');
    }
    ['dev','prem','free'].forEach(function(p) {
      var btn = document.getElementById('dev-btn-' + p);
      if (btn) btn.classList.toggle('dev-active',
        (!simulatedPlan && p === 'dev') ||
        (simulatedPlan === 'premium' && p === 'prem') ||
        (simulatedPlan === 'free'    && p === 'free'));
    });
    if (window._refreshHome)     window._refreshHome();
    if (window.buildLevelPicker) window.buildLevelPicker();
    if (window.buildMap)         window.buildMap();
  };

  // ── nivelAccesible ───────────────────────────────────────────────────────────
  // Comprueba si un nivelId (ej. '0101') es accesible para el plan dado.
  function nivelAccesible(nivelId, plan) {
    if (isPremiumOrAbove(plan)) return true;
    // Free: solo Mundo 1
    return nivelId.startsWith('01');
  }

  // ── getTodayKey ──────────────────────────────────────────────────────────────
  function getTodayKey() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // ── getFreeProgress ──────────────────────────────────────────────────────────
  // db, getDoc, doc: instancias de Firebase del archivo que llama.
  async function getFreeProgress(uid, db, getDoc, doc) {
    var DEFAULT = { nivelId: '0101', misterio: 1, completedToday: false, fechaHoy: '' };

    // Fallback a localStorage si Firebase no está disponible
    if (!db || !getDoc || !doc) {
      try {
        var cached = localStorage.getItem('cruzando_free_prog');
        if (!cached) return DEFAULT;
        var local = JSON.parse(cached);
        if (local.fechaHoy !== getTodayKey()) {
          local.completedToday = false;
          local.fechaHoy = getTodayKey();
        }
        return local;
      } catch (e) { return DEFAULT; }
    }

    try {
      var snap = await getDoc(doc(db, 'users', uid, 'freeProgress', 'current'));
      if (!snap.exists()) return DEFAULT;
      var d = snap.data();
      // Reset diario si cambió el día
      if (d.fechaHoy !== getTodayKey()) {
        d.completedToday = false;
        d.fechaHoy = getTodayKey();
      }
      return d;
    } catch (e) {
      // Intentar localStorage como segundo fallback
      try {
        var fallback = localStorage.getItem('cruzando_free_prog');
        return fallback ? JSON.parse(fallback) : DEFAULT;
      } catch (_) { return DEFAULT; }
    }
  }

  // ── advanceFreeMisterio ──────────────────────────────────────────────────────
  // Avanza al siguiente misterio en el itinerario Free y escribe en Firestore.
  // db, setDoc, doc, serverTimestamp: instancias de Firebase del archivo que llama.
  async function advanceFreeMisterio(uid, currentNivelId, currentMisterio, db, setDoc, doc, serverTimestamp) {
    var nextMisterio = currentMisterio + 1;
    var nextNivelId  = currentNivelId;

    if (nextMisterio > 20) {
      nextMisterio = 1;
      var idx = PUBLISHED_NIVELES.indexOf(currentNivelId);
      if (idx >= 0 && idx < PUBLISHED_NIVELES.length - 1) {
        nextNivelId = PUBLISHED_NIVELES[idx + 1];
      } else {
        nextNivelId = PUBLISHED_NIVELES[0];
      }
    }

    var next = {
      nivelId:        nextNivelId,
      misterio:       nextMisterio,
      completedToday: true,
      fechaHoy:       getTodayKey()
    };

    // Persistir siempre en localStorage (funciona sin Firebase)
    try { localStorage.setItem('cruzando_free_prog', JSON.stringify(next)); } catch (_) {}

    // Persistir en Firestore solo si Firebase está disponible
    if (!db || !setDoc || !doc || !serverTimestamp) return;

    try {
      await setDoc(doc(db, 'users', uid, 'freeProgress', 'current'), {
        nivelId:        nextNivelId,
        misterio:       nextMisterio,
        completedToday: true,
        fechaHoy:       getTodayKey(),
        completedAt:    serverTimestamp()
      });
    } catch (e) {
      console.warn('[plan-utils] advanceFreeMisterio:', e);
    }
  }

  // ── requirePremiumAccess ─────────────────────────────────────────────────────
  // Redirige a index.html?blocked=modo si el plan no permite acceso.
  // Devuelve true si el acceso está permitido, false si redirigió.
  function requirePremiumAccess(modo, plan) {
    if (canAccessModo(modo, plan)) return true;
    window.location.replace('index.html?blocked=' + encodeURIComponent(modo));
    return false;
  }

  // ── Expose ───────────────────────────────────────────────────────────────────
  window.resolvePlan            = resolvePlan;
  window.isPremiumOrAbove       = isPremiumOrAbove;
  window.canAccessModo          = canAccessModo;
  window.nivelAccesible         = nivelAccesible;
  window.getTodayKey            = getTodayKey;
  window.getFreeProgress        = getFreeProgress;
  window.advanceFreeMisterio    = advanceFreeMisterio;
  window.requirePremiumAccess   = requirePremiumAccess;
  // window.effectivePlan y window._setViewAs ya asignados arriba directamente

}());
