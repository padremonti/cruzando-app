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
  // nivelId: opcional — en 0101 Free tiene acceso completo a todos los modos
  function canAccessModo(modo, plan, nivelId) {
    if (plan === 'developer') return true;
    var isPrem = isPremiumOrAbove(plan);
    if (plan === 'free' && nivelId === '0101') return true;
    if (modo === 'audio')   return true;
    if (modo === 'libro')   return isPrem;
    /* rezar sigue siendo de pago AQUI. El Rosario diario del free se resuelve
       aparte, en rezar.html, porque depende de que ESE Nivel ya este cruzado
       y eso solo lo dice el documento de progreso. */
    if (modo === 'rezar')   return isPrem;
    /* La biblioteca de cantos y el Diario son de todos: lo que el free canta y
       lo que el free escribe es suyo. Cerrarlos seria un despojo, no un muro. */
    if (modo === 'cantos')  return true;
    if (modo === 'diario')  return true;
    /* Sanar se abre a cualquiera, y lo que se abre es de verdad: el elenco, el
       velo de foco y TODA la acogida son libres para siempre. Lo que cuesta es
       entrar al Misterio-puerta, y eso no lo decide esta tabla sino el saldo,
       en entrarPain() del servidor.
       Hubo un credito pastoral diario en diseno y se DESCARTO: el porque esta
       en CLAUDE.md, seccion 'El credito pastoral que se descarto'. */
    if (modo === 'sanar')   return true;
    /* Retiros. Se llamaba 'sanar' por una colision de nombre —el boton es
       nav-sanar-btn y lleva a retiros.html—, asi que 'sanar' gateaba esto y
       Sanar de verdad no tenia puerta ninguna. */
    if (modo === 'retiros') return isPrem;
    /* El mapa: la libertad de moverse por lo ya cruzado es lo que se paga. */
    if (modo === 'mapa')    return isPrem;
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
    // Onboarding zone: 0101 misterios 1-5 siempre accesibles
    if (window._obAlwaysFree && window._obAlwaysFree(nivelId, 1)) return true;
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

  // ── Idioma de las oraciones ──────────────────────────────────────────────────
  // Había DOS claves para lo mismo, y no se hablaban: index/audio usaban
  // cruzando_prefs.latinPrayer y rezar usaba cruzando_rezar_prefs.idioma. Quien
  // activaba el latín en Preferencias lo oía en audio pero no en rezar.
  // Canónica: cruzando_prefs.latinPrayer (el ajuste del drawer de index).
  // La otra se sigue leyendo (usuarios que ya la tenían puesta) y se mantiene
  // sincronizada al escribir, para que la pantalla de rezar no se contradiga.
  function esLatin() {
    try {
      var p = JSON.parse(localStorage.getItem('cruzando_prefs') || '{}');
      if (p.latinPrayer === true)  return true;
      if (p.latinPrayer === false) return false;
      var r = JSON.parse(localStorage.getItem('cruzando_rezar_prefs') || '{}');
      return r.idioma === 'latin';
    } catch (e) { return false; }
  }
  window.esLatin = esLatin;

  function setLatin(on) {
    on = !!on;
    try {
      var p = JSON.parse(localStorage.getItem('cruzando_prefs') || '{}');
      p.latinPrayer = on;
      localStorage.setItem('cruzando_prefs', JSON.stringify(p));
      var r = JSON.parse(localStorage.getItem('cruzando_rezar_prefs') || '{}');
      r.idioma = on ? 'latin' : 'espanol';
      localStorage.setItem('cruzando_rezar_prefs', JSON.stringify(r));
    } catch (e) {}
    return on;
  }
  window.setLatin = setLatin;

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
    // No consumir el "misterio del día" si es zona de onboarding (replayable)
    if (window._obAlwaysFree && window._obAlwaysFree(currentNivelId, currentMisterio)) {
      return;
    }
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
  // nivelId: opcional — se reenvía a canAccessModo para que en 0101 (DEMO Free)
  //   el plan free acceda a todos los modos. Si no se pasa (llamadas de 2 args),
  //   nivelId queda undefined y el comportamiento es idéntico al anterior.
  function requirePremiumAccess(modo, plan, nivelId) {
    if (canAccessModo(modo, plan, nivelId)) return true;
    window.location.replace('index.html?blocked=' + encodeURIComponent(modo));
    return false;
  }

  // ── yaGanado ─────────────────────────────────────────────────────────────────
  // Devuelve true si este Misterio YA fue completado antes (tiene timestamp).
  // progressDoc: el doc de progreso del nivel (objeto con .progress[blk][idx]).
  // Regla de uso (la aplican las PÁGINAS, no esta función):
  //   - premium/beta/developer: ignoran yaGanado (siempre ganan metros).
  //   - free: si yaGanado(...) === true, NO se otorgan metros por ese Misterio
  //     (ganancia "forward-only" dentro de 0101).
  function yaGanado(progressDoc, blk, idx) {
    try {
      return !!(progressDoc && progressDoc.progress &&
                progressDoc.progress[blk] && progressDoc.progress[blk][idx]);
    } catch (e) { return false; }
  }
  window.yaGanado = yaGanado;

  // ── demoCompleto ─────────────────────────────────────────────────────────────
  // true si 0101 (el DEMO Free) está completo: 4 bloques × 5 misterios con valor.
  // Misma definición de "nivel completo" que badge-check.js (v !== null).
  // Las páginas lo llaman al completar un Misterio de 0101 para cerrar el DEMO;
  // aquí NO se dispara ninguna celebración ni navegación.
  function demoCompleto(progressDoc) {
    var BLOQUES = ['gozosos', 'luminosos', 'dolorosos', 'gloriosos'];
    var prog = (progressDoc && progressDoc.progress) || {};
    return BLOQUES.every(function (b) {
      var arr = prog[b];
      return Array.isArray(arr) && arr.length === 5 &&
             arr.every(function (v) { return v !== null; });
    });
  }
  window.demoCompleto = demoCompleto;

  // ── marcarCrecerSiFree ─────────────────────────────────────────
  // El mapa es de Premium. La pestana se marca con candado y su toque abre la
  // compra, en vez de llevar a una puerta cerrada. El candado es solo la
  // senal: quien cierra de verdad es la puerta de crecer.html, y las dos se
  // pusieron a la vez a proposito -- un candado sin puerta detras es el
  // defecto que el mapa ya arrastraba con sus quince nodos decorativos.
  function marcarCrecerSiFree() {
    var b = document.getElementById('nav-crecer');
    if (!b || isPremiumOrAbove(window.effectivePlan())) return;
    b.style.opacity = '0.45';
    b.onclick = function () { location.href = 'index.html?premium=1'; };
    var ico = b.querySelector('.app-nav-icon');
    if (ico && !ico.querySelector('.nav-candado')) {
      ico.style.position = 'relative';
      var c = document.createElement('span');
      c.className = 'nav-candado';
      c.textContent = '\uD83D\uDD12';
      c.style.cssText = 'position:absolute;top:-4px;right:-8px;font-size:9px;line-height:1';
      ico.appendChild(c);
    }
  }
  window.marcarCrecerSiFree = marcarCrecerSiFree;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', marcarCrecerSiFree);
  } else { marcarCrecerSiFree(); }

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

  // ─────────────────────────────────────────────
  //  ONBOARDING FLAGS
  // ─────────────────────────────────────────────
  var _OB_KEY    = 'cruzando_onboarding';
  var _OB_FIELDS = ['mapSeen', 'audioSeen', 'libroSeen', 'rezarSeen', 'bloque1Done'];

  function _obCache() {
    try { return JSON.parse(localStorage.getItem(_OB_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function _obSaveCache(obj) {
    try { localStorage.setItem(_OB_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  function _obDone(key) {
    return !!_obCache()[key];
  }
  window._obDone = _obDone;

  function _obSet(key, db, uid) {
    var cache = _obCache();
    cache[key] = true;
    _obSaveCache(cache);

    if (db && uid) {
      try {
        var fsm = window._fbFirestore || {};
        var docFn = fsm.doc; var setDocFn = fsm.setDoc; var stFn = fsm.serverTimestamp;
        if (!docFn || !setDocFn) return;
        var ref     = docFn(db, 'users', uid, 'profile', 'onboarding');
        var payload = {};
        payload[key]        = true;
        payload['updatedAt'] = stFn ? stFn() : null;
        setDocFn(ref, payload, { merge: true }).catch(function (e) {
          console.warn('[OB] Firestore write failed:', e);
        });
      } catch (e) {}
    }
  }
  window._obSet = _obSet;

  async function _obSync(db, uid) {
    if (!db || !uid) return;
    var cache   = _obCache();
    var allDone = _OB_FIELDS.every(function (f) { return !!cache[f]; });
    if (allDone) return;

    try {
      var fsm = window._fbFirestore || {};
      var docFn = fsm.doc; var getDocFn = fsm.getDoc;
      if (!docFn || !getDocFn) return;
      var snap = await getDocFn(docFn(db, 'users', uid, 'profile', 'onboarding'));
      if (!snap.exists()) return;
      var remote = snap.data();
      var merged = Object.assign({}, cache);
      _OB_FIELDS.forEach(function (f) { if (remote[f] === true) merged[f] = true; });
      _obSaveCache(merged);
    } catch (e) {
      console.warn('[OB] Firestore sync failed:', e);
    }
  }
  window._obSync = _obSync;

  function _obZone(nivelId, misterio) {
    return nivelId === '0101' && misterio >= 1 && misterio <= 5;
  }
  window._obZone = _obZone;

  function _obAlwaysFree(nivelId, misterio) {
    return nivelId === '0101';
  }
  window._obAlwaysFree = _obAlwaysFree;

  // Módulo Firestore registrado por cada página al iniciar Firebase
  window._fbFirestore = window._fbFirestore || {};

  // ─────────────────────────────────────────────
  //  ONBOARDING CIERRE BLOQUE 1
  // ─────────────────────────────────────────────

  /* Lluvia de Lux — conserva el nombre y la firma de _obConfetti a propósito:
     los llamadores (el cierre del bloque 1 y el overlay del DEMO) no cambian.

     Antes eran 48 rectángulos en siete colores —naranja, oro, cian, morado,
     verde, magenta, rojo— que no aparecen en ningún otro sitio de la app. Ahora
     son catorce cruces Lux en oro y blanco, cayendo lento y con la rotación
     amortiguada. Mismo sitio en el código, otro registro. */
  function _obConfetti(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var TINTAS = ['#E8B94A', '#F3EAD8'];
    container.innerHTML = '';
    for (var i = 0; i < 14; i++) {
      var pieza = document.createElement('div');
      var tinta = TINTAS[i % TINTAS.length];
      var left  = 4 + Math.random() * 92;
      var delay = (Math.random() * 2.0).toFixed(2);
      var lado  = 11 + Math.random() * 9;
      var grosor = Math.max(2, lado * 0.19);
      pieza.style.cssText =
        'position:absolute;top:-28px;left:' + left + '%;' +
        'width:' + lado + 'px;height:' + lado + 'px;' +
        'opacity:' + (0.55 + Math.random() * 0.35).toFixed(2) + ';' +
        'animation:confettiFall 3.4s linear ' + delay + 's forwards;';
      pieza.innerHTML =
        '<span style="position:absolute;left:50%;top:0;width:' + grosor + 'px;height:100%;' +
        'margin-left:' + (-grosor / 2) + 'px;background:' + tinta + '"></span>' +
        '<span style="position:absolute;top:34%;left:0;width:100%;height:' + grosor + 'px;' +
        'background:' + tinta + '"></span>';
      container.appendChild(pieza);
    }
  }
  window._obConfetti = _obConfetti;

  function _obBloque1Mostrar(metros, plan, imgBase) {
    var ov = document.getElementById('ob-bloque1-overlay');
    if (!ov) return;

    var img = document.getElementById('ob-bloque1-mariano');
    if (img) img.src = (imgBase || 'https://pub-96c43f31e0da42dd950d4ac90328256e.r2.dev/') + 'mariano_celeb.webp';

    var metrosEl = document.getElementById('ob-bloque1-metros');
    if (metrosEl && metros) metrosEl.textContent = '+' + metros + 'm · Bloque completado';
    else if (metrosEl) metrosEl.textContent = '¡Primer bloque completado!';

    var freeMsg = document.getElementById('ob-bloque1-free-msg');
    if (freeMsg) freeMsg.style.display = (plan === 'free') ? 'block' : 'none';

    _obConfetti('ob-bloque1-confetti');
    ov.style.display = 'flex';
  }
  window._obBloque1Mostrar = _obBloque1Mostrar;

  function _obBloque1Cerrar(irInicio) {
    var ov = document.getElementById('ob-bloque1-overlay');
    if (ov) {
      ov.style.transition = 'opacity 0.5s';
      ov.style.opacity = '0';
      setTimeout(function() {
        ov.style.display = 'none';
        ov.style.opacity = '';
        ov.style.transition = '';
      }, 500);
    }
    if (irInicio) {
      if (window.navigateTo) window.navigateTo('index.html');
      else if (window.goTo) window.goTo('index.html');
      else window.location.href = 'index.html';
    }
  }
  window._obBloque1Cerrar = _obBloque1Cerrar;

  function _obCheckBloque1(nivelId, misterio, metros, plan, imgBase, db, uid) {
    if (nivelId !== '0101') return;
    if (misterio !== 5) return;
    if (window._obDone && window._obDone('bloque1Done')) return;

    if (window._obSet) _obSet('bloque1Done', db, uid);

    setTimeout(function() {
      _obBloque1Mostrar(metros, plan, imgBase);
    }, 1200);
  }
  window._obCheckBloque1 = _obCheckBloque1;

}());
