// ═══════════════════════════════════════════════════════════════════
// CruzAndo — racha de días consecutivos
// ═══════════════════════════════════════════════════════════════════
//
// LÓGICA PURA: no toca red ni SDK. Cada página hace su propia E/S —
// audio con el SDK modular, orar/rezar con compat— y le pregunta a este
// módulo qué hacer. Mismo criterio que functions/economia.js.
//
// ── Qué gana un día ────────────────────────────────────────────────
// UN Misterio rezado, en cualquiera de los tres modos. Simétrico: no
// cuesta más ganar el día en el Libro que en Audio.
//
// NO sirven los metros: users/{uid}/dailyGoal/data.historial cuenta
// metros, y un día de solo escuchar una pregunta (150m) no es un
// Misterio rezado. Por eso la racha lleva su propio registro —aunque
// viva en ese mismo documento, que ya está permitido en las reglas y
// que index/crecer ya leen en el arranque.
//
// ── Forma del dato ─────────────────────────────────────────────────
//   users/{uid}/dailyGoal/data
//     .racha = { ultimoDia: 'YYYY-MM-DD', actual: n, mejor: n }
//
// ── Romper la racha no castiga ─────────────────────────────────────
// No hay aviso de pérdida ni cuenta atrás. Si se rompió, el marcador
// muestra 0 y el siguiente Misterio la deja en 1. Sin ceremonia.
(function () {
  'use strict';

  var LS_KEY = 'cruzando_racha';

  function vacia() { return { ultimoDia: null, actual: 0, mejor: 0 }; }

  /* 'YYYY-MM-DD' → el día anterior, en la misma zona local que getTodayKey().
     Se construye con Date para que los cambios de mes, año y bisiesto salgan
     solos; el mediodía evita que el horario de verano corra el día. */
  function ayerDe(diaKey) {
    var p = String(diaKey || '').split('-');
    if (p.length !== 3) return null;
    var d = new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0);
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  /* Registrar el día de hoy. IDEMPOTENTE: rezar tres Misterios seguidos
     devuelve cambio:false a partir del segundo, y de ahí sale la garantía
     de que el splash se muestre una sola vez al día. */
  function calcular(previa, hoyKey) {
    var r = normalizar(previa);
    if (!hoyKey) return { cambio: false, racha: r };

    if (r.ultimoDia === hoyKey) return { cambio: false, racha: r };

    var actual = (r.ultimoDia === ayerDe(hoyKey)) ? r.actual + 1 : 1;
    var nueva = {
      ultimoDia: hoyKey,
      actual:    actual,
      mejor:     Math.max(r.mejor || 0, actual)
    };
    return { cambio: true, racha: nueva, previa: r.actual };
  }

  /* Lo que enseña el marcador. Ojo: el 'actual' guardado se queda viejo en
     cuanto pasa un día sin rezar, así que NO se muestra tal cual.
       hoy   → la racha, ya contada
       ayer  → la racha sigue viva, hoy está pendiente
       antes → rota: 0 */
  function paraMostrar(racha, hoyKey) {
    var r = normalizar(racha);
    if (!r.ultimoDia || !hoyKey) return 0;
    if (r.ultimoDia === hoyKey)          return r.actual;
    if (r.ultimoDia === ayerDe(hoyKey))  return r.actual;
    return 0;
  }

  /* ¿Sigue viva pero hoy aún no cuenta? Sirve para matizar el marcador
     sin castigar: el número está, pero el día todavía no se ha ganado. */
  function pendienteHoy(racha, hoyKey) {
    var r = normalizar(racha);
    return !!r.ultimoDia && r.ultimoDia !== hoyKey &&
           r.ultimoDia === ayerDe(hoyKey);
  }

  /* Sin cola de reintentos: ante dos copias (la local y la del servidor) gana
     la más avanzada. Cubre a la vez el rezo sin red y el segundo dispositivo,
     que es lo único que puede desincronizar esto. */
  function fusionar(a, b) {
    var x = normalizar(a), y = normalizar(b);
    if (!x.ultimoDia) return y;
    if (!y.ultimoDia) return x;
    var ganadora = (x.ultimoDia > y.ultimoDia) ? x
                 : (y.ultimoDia > x.ultimoDia) ? y
                 : (x.actual >= y.actual ? x : y);
    return {
      ultimoDia: ganadora.ultimoDia,
      actual:    ganadora.actual,
      mejor:     Math.max(x.mejor || 0, y.mejor || 0)
    };
  }

  function normalizar(r) {
    if (!r || typeof r !== 'object') return vacia();
    var actual = parseInt(r.actual, 10); if (!(actual > 0)) actual = 0;
    var mejor  = parseInt(r.mejor,  10); if (!(mejor  > 0)) mejor  = 0;
    var dia    = (typeof r.ultimoDia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.ultimoDia))
                 ? r.ultimoDia : null;
    if (!dia) return { ultimoDia: null, actual: 0, mejor: mejor };
    return { ultimoDia: dia, actual: Math.max(actual, 1), mejor: Math.max(mejor, actual) };
  }

  /* Espejo local: el marcador se pinta antes de que Firestore conteste, igual
     que el odómetro de metros (la "FASE 1" de index/crecer). */
  function leerLocal() {
    try { return normalizar(JSON.parse(localStorage.getItem(LS_KEY) || 'null')); }
    catch (e) { return vacia(); }
  }
  function guardarLocal(racha) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(normalizar(racha))); } catch (e) {}
  }

  window.Racha = {
    LS_KEY:       LS_KEY,
    vacia:        vacia,
    ayerDe:       ayerDe,
    calcular:     calcular,
    paraMostrar:  paraMostrar,
    pendienteHoy: pendienteHoy,
    fusionar:     fusionar,
    normalizar:   normalizar,
    leerLocal:    leerLocal,
    guardarLocal: guardarLocal
  };
}());
