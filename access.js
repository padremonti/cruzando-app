/* CruzAndo — access.js
 * Cliente del sistema económico. Lo cargan sanar.html y mini.html.
 *
 * Reparto de responsabilidades:
 *   · estado(painId)  → LOCAL, sin red. Sirve para PINTAR (marcas del elenco).
 *   · entrar(painId)  → único camino que llama a entrarPain, y lo único que cobra.
 *
 * El caché local NO tiene autoridad sobre el dinero: el servidor decide, y no
 * descuenta nada sin `confirmado:true`. Si este caché está rancio, lo peor que
 * puede pasar es que una marca del elenco se vea desactualizada.
 *
 * Requiere: firebase compat (app + firestore) ya inicializado.
 * Para entrar() hace falta además firebase-functions-compat.js (solo sanar).
 */
(function () {
  'use strict';

  var REGION     = 'us-central1';
  var DIA_MS     = 24 * 60 * 60 * 1000;
  var GRACIA_MS  = 3 * DIA_MS;      // mismo colchón que el servidor

  var _db      = null;
  var _uid     = null;
  var _billing = null;              // { credits, sub, activeRentals, lifetime }
  var _listo   = false;

  // ── helpers ────────────────────────────────────────────────────────────────
  function _msDe(v) {
    if (v === null || v === undefined) return null;
    if (typeof v.toDate === 'function') return v.toDate().getTime();
    if (typeof v.seconds === 'number')  return v.seconds * 1000;
    if (v instanceof Date)              return v.getTime();
    if (typeof v === 'number')          return v;
    var t = new Date(v).getTime();
    return isNaN(t) ? null : t;
  }

  function _vacio() {
    return { credits: 0, activeRentals: {},
             sub: { status: 'none', currentPeriodEnd: null },
             lifetime: { granted: 0, purchased: 0, spent: 0 } };
  }

  // Plan REAL (del doc) vs plan de VISTA (honra el "ver como" del developer).
  // La UI se pinta con el de vista para que "ver como free" muestre el muro;
  // entrar() avisa al servidor con simular:'free' para que el cobro también
  // se comporte como free. Así lo simulado y lo real no se contradicen.
  function _planReal()  { return (window.currentPlan || 'free'); }
  function _planVista() { return (window.effectivePlan ? window.effectivePlan() : _planReal()); }
  function _simulandoFree() { return _planReal() === 'developer' && _planVista() === 'free'; }

  function _subVigente(ahoraMs) {
    var sub = _billing && _billing.sub;
    if (!sub) return false;
    if (sub.status !== 'active' && sub.status !== 'trialing') return false;
    var fin = _msDe(sub.currentPeriodEnd);
    if (fin === null) return true;               // igual criterio que el servidor
    return ahoraMs <= fin + GRACIA_MS;
  }

  // Espejo del motivoBypass del servidor. Si estos dos se separan, la UI miente
  // (pide crédito a quien no lo gasta, o al revés) — pero el dinero sigue
  // decidiéndolo el servidor.
  function _bypass(ahoraMs) {
    if (_simulandoFree()) return null;
    var p = String(_planVista() || 'free').toLowerCase().trim();
    if (p === 'developer') return 'developer';
    if (p === 'beta')      return 'beta';        // effectivePlan ya filtró la vencida
    if (p === 'premium' || p === 'pro') return 'plan-premium';
    if (_subVigente(ahoraMs)) return 'suscripcion';
    return null;
  }

  function _rentaMs(painId) {
    var r = (_billing && _billing.activeRentals) || {};
    return _msDe(r[painId]);
  }

  // ── etiqueta de la marca de acceso ─────────────────────────────────────────
  // Días completos que quedan. Menos de uno → "hoy vence".
  function _etiqueta(restanteMs) {
    if (restanteMs === null || restanteMs <= 0) return null;
    var dias = Math.floor(restanteMs / DIA_MS);
    if (dias <= 0) return 'hoy vence';
    if (dias === 1) return '1 día';
    return dias + ' días';
  }

  // ── API ────────────────────────────────────────────────────────────────────

  // Síncrono: sanar ya trae el doc en su Promise.all de arranque, así que no
  // cuesta ni una lectura ni un milisegundo extra.
  function hidratar(snapOrData) {
    var d = null;
    if (snapOrData) {
      d = (typeof snapOrData.exists !== 'undefined')
        ? (snapOrData.exists ? snapOrData.data() : null)
        : snapOrData;
    }
    _billing = d || _vacio();
    if (!_billing.activeRentals) _billing.activeRentals = {};
    if (!_billing.sub)           _billing.sub = { status: 'none', currentPeriodEnd: null };
    if (typeof _billing.credits !== 'number') _billing.credits = 0;
    _listo = true;
    return _billing;
  }

  // Para mini, que no tiene un Promise.all donde colarse: 1 lectura.
  function init(db, uid) {
    _db = db; _uid = uid;
    if (!db || !uid) { hidratar(null); return Promise.resolve(_billing); }
    return db.collection('users').doc(uid).collection('billing').doc('state').get()
      .then(function (snap) { return hidratar(snap); })
      .catch(function () { hidratar(null); return _billing; });
  }

  function conectar(db, uid) { _db = db; _uid = uid; }

  // LOCAL, sin red.
  function estado(painId) {
    var ahoraMs = Date.now();
    var saldo   = (_billing && _billing.credits) || 0;

    if (!_listo) return { acceso: 'desconocido', saldo: saldo, expiresAt: null, etiqueta: null };

    var by = _bypass(ahoraMs);
    if (by) return { acceso: 'sub', motivo: by, saldo: saldo, expiresAt: null, etiqueta: null };

    var fin = _rentaMs(painId);
    if (fin !== null && fin > ahoraMs) {
      return { acceso: 'renta', saldo: saldo, expiresAt: fin,
               etiqueta: _etiqueta(fin - ahoraMs) };
    }

    if (saldo >= 1) return { acceso: 'comprable',  saldo: saldo, expiresAt: null, etiqueta: null };
    return              { acceso: 'sin-saldo',  saldo: 0,     expiresAt: null, etiqueta: null };
  }

  function saldo()    { return (_billing && _billing.credits) || 0; }
  function listo()    { return _listo; }
  function esBypass() { return !!_bypass(Date.now()); }

  // Lo ÚNICO que cobra. Todo lo demás es lectura.
  function entrar(painId, opts) {
    opts = opts || {};
    var payload = {
      painId:     painId,
      confirmado: opts.confirmado === true,
      origen:     opts.origen || 'sanar'
    };
    if (_simulandoFree()) payload.simular = 'free';

    if (!window.firebase || !firebase.app || !firebase.app().functions) {
      return Promise.reject(new Error('functions-compat no está cargado'));
    }
    var call = firebase.app().functions(REGION).httpsCallable('entrarPain');
    return call(payload).then(function (res) {
      var data = (res && res.data) || {};
      _aplicar(painId, data);
      return data;
    });
  }

  // Refleja en el caché lo que el servidor acaba de decidir, para que el elenco
  // se repinte sin volver a leer.
  function _aplicar(painId, data) {
    if (!_billing) return;
    if (typeof data.saldo === 'number') _billing.credits = data.saldo;
    if (data.cobrado && data.expiresAt) {
      _billing.activeRentals[painId] = new Date(data.expiresAt);
    }
    if (data.via === 'renta' && data.expiresAt) {
      _billing.activeRentals[painId] = new Date(data.expiresAt);
    }
  }

  function refrescar() {
    if (!_db || !_uid) return Promise.resolve(_billing);
    return init(_db, _uid);
  }

  // ── COMPRA (Pieza 5) ───────────────────────────────────────────────────────
  // El cliente manda la CLAVE del paquete ('p15') y el dolor desde el que
  // compra. Nunca un importe: el precio lo pone Stripe desde el price_id que
  // elige el servidor. Devuelve la URL del checkout — quien llama redirige.

  function _fns() {
    if (!window.firebase || !firebase.app || !firebase.app().functions) {
      return null;
    }
    return firebase.app().functions(REGION);
  }

  // Modo de Stripe. Solo sirve de algo en una cuenta developer: el servidor
  // ignora 'test' para cualquier otro plan. Se activa desde la consola con
  //   sessionStorage.setItem('cruzando_stripe_modo','test')
  function _modo() {
    try { return sessionStorage.getItem('cruzando_stripe_modo') === 'test' ? 'test' : 'live'; }
    catch (e) { return 'live'; }
  }

  function _llamar(nombre, payload) {
    var fns = _fns();
    if (!fns) return Promise.reject(new Error('functions-compat no está cargado'));
    return fns.httpsCallable(nombre)(payload).then(function (res) {
      return (res && res.data) || {};
    });
  }

  function comprar(paquete, opts) {
    opts = opts || {};
    return _llamar('comprarCreditos', {
      paquete: paquete,
      painId:  opts.painId || null,
      retorno: opts.retorno || 'sanar',
      modo:    _modo()
    });
  }

  function suscribir(plan, opts) {
    opts = opts || {};
    return _llamar('createCheckoutSession', {
      plan:    plan,
      painId:  opts.painId || null,
      retorno: opts.retorno || 'sanar',
      modo:    _modo()
    });
  }

  // La red: si el webhook no llegó, esto pregunta a Stripe y acredita. Es
  // idempotente en el servidor — llamarla de más nunca duplica créditos.
  function reclamar(sessionId) {
    return _llamar('reclamarCompra', { sessionId: sessionId || null, modo: _modo() });
  }

  window.CZAccess = {
    hidratar: hidratar,
    init:     init,
    conectar: conectar,
    estado:   estado,
    saldo:    saldo,
    listo:    listo,
    esBypass: esBypass,
    entrar:   entrar,
    refrescar: refrescar,
    // compra (Pieza 5)
    comprar:  comprar,
    suscribir: suscribir,
    reclamar: reclamar
  };
}());
