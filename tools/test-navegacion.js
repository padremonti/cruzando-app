/* ══════════════════════════════════════════════════════════════════════
   Banco de pruebas — destino unificado de las salidas de sesión

   Los tres modos de rezo terminaban en tres sitios distintos: audio y rezar
   en index.html (el hub), orar en sí mismo (su botón decía "Regresar a
   inicio" y recargaba orar), y sanar en crecer.html (el mapa). Ahora los
   cuatro vuelven al mismo lugar: crecer.html.

   Importa que no se desvíe: el splash de racha se engancha exactamente en
   estos puntos de salida, y una sola ruta que se escape a index.html sería
   un día de racha que no se celebra.

   Correr:  node tools/test-navegacion.js
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs   = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

const MAPA = 'crecer.html';

/* Las ÚNICAS idas a index.html que deben quedar en un modo de sesión: cerrar
   sesión y crear cuenta van a la pantalla de acceso, que es index. Cualquier
   otra es una salida de sesión que se quedó sin migrar.

   Se comparan como LÍNEA COMPLETA (ya sin sangría), no como subcadena: con
   subcadena, la excepción "goTo('index.html');" de rezar tapaba cualquier
   otra llamada igual y el guardián no mordía. */
const EXCEPCIONES = {
  'audio.html': [
    // cerrar sesión → pantalla de acceso
    "signOut(auth).then(() => { location.href = 'index.html'; }).catch(() => { location.href = 'index.html'; });",
    // enlace de alta dentro de un mensaje
    '\'<a href="index.html" style="color:inherit;text-decoration:underline">Créala desde el inicio</a>.\';'
  ],
  'orar.html':  ["else goTo('index.html');"],   // onAuthStateChanged sin usuario
  'rezar.html': [
    "goTo('index.html');",                      // onAuthStateChanged sin usuario
    /* El muro de pago. Antes vivía dentro de requirePremiumAccess() —en
       plan-utils.js, fuera de este barrido— pero la puerta pasó a derivarse
       del progreso: el free reza SU Nivel diario, que es uno ya cruzado, y eso
       requirePremiumAccess no sabe expresarlo. Sigue siendo una redirección de
       ACCESO, no una salida de sesión. */
    "if(!_puedeRezarAqui(_plan)){location.replace('index.html?blocked=rezar');return;}"
  ],
};

const MODOS = ['audio.html', 'orar.html', 'rezar.html'];

let fallos = 0, pasos = 0;
function ok(nombre, fn) {
  try { fn(); console.log('  ✓ ' + nombre); pasos++; }
  catch (e) { console.log('  ✗ ' + nombre + '\n      ' + e.message); fallos++; }
}

console.log('\n── Ninguna salida de sesión apunta al hub ──');

MODOS.forEach(f => {
  ok(f.padEnd(11) + ' · solo auth/alta siguen yendo a index.html', () => {
    const sueltas = leer(f).split('\n')
      .map((l, i) => ({ n: i + 1, t: l }))
      .filter(l => l.t.includes('index.html'))
      .filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l.t))          // comentarios fuera
      .filter(l => EXCEPCIONES[f].indexOf(l.t.trim()) === -1);
    if (sueltas.length) {
      throw new Error(sueltas.length + ' salida(s) sin migrar:\n      ' +
        sueltas.map(l => l.n + '| ' + l.t.trim().slice(0, 90)).join('\n      '));
    }
  });
});

console.log('\n── Los cuatro modos vuelven al mismo sitio ──');

MODOS.forEach(f => {
  ok(f.padEnd(11) + ' · su barra de navegación lleva al mapa', () => {
    /* Casa vuelve a ser un solo sitio para todos. La Ruta C la hizo depender
       del plan porque el free no tenía mapa; ahora lo tiene —lo ve entero y
       entra solo a su Misterio de hoy— y el destino se escribe otra vez. */
    const s = leer(f);
    const nav = s.split('\n').filter(l => l.includes('app-nav-item') || l.includes('app-nav-label'));
    if (!/app-nav-label">Crecer</.test(nav.join('\n')))
      throw new Error('la barra no tiene el destino etiquetado "Crecer"');
    if (/_casa\(|_pintarCasa/.test(s))
      throw new Error('volvió la casa derivada por plan');
  });
});

ok('sanar.html  · ya volvía al mapa (no debió cambiar)', () => {
  if (!leer('sanar.html').includes("navTo('crecer.html')"))
    throw new Error('sanar dejó de apuntar al mapa');
});

ok('mini.html   · sigue devolviendo a sanar, no al mapa', () => {
  if (!leer('mini.html').includes("'sanar.html'"))
    throw new Error('mini dejó de volver a sanar');
});

console.log('\n── orar tiene por fin una salida de verdad ──');

ok('orar        · la celebración ofrece dos botones', () => {
  const s = leer('orar.html');
  if (!/id="btn-celeb-home"/.test(s))  throw new Error('falta btn-celeb-home');
  if (!/id="btn-celeb-mapa"/.test(s))  throw new Error('falta btn-celeb-mapa');
});

ok('orar        · el botón de salir está cableado en los dos finales', () => {
  const s = leer('orar.html');
  /* uno en showCelebration (bloque completo) y otro en showAdvanceLevelPrompt (20) */
  const n = (s.match(/btn-celeb-mapa'\)\.onclick/g) || []).length;
  if (n !== 2) throw new Error('esperaba 2 cableados, encontré ' + n);
});

ok('orar        · salir SIEMPRE navega al destino', () => {
  /* Aquí había un atajo: si el destino era el mapa y quedaba historial, se hacía
     history.back() para que el gesto adelante devolviera a la sesión. Pero
     history.back() va a la página ANTERIOR, que solo es crecer si se llegó
     directo desde allí: entrando desde audio, por enlace directo o tras recargar
     orar, el botón "Crecer" acababa en otro sitio. */
  const s = leer('orar.html');
  /* Sin comentarios: el propio comentario que explica por qué se quitó el atajo
     menciona history.back(), y hacía fallar la prueba. */
  const cuerpo = (s.match(/function salirDeOrar[\s\S]*?\n\}/) || [''])[0]
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  if (/history\.back/.test(cuerpo))
    throw new Error('vuelve el atajo: el botón puede acabar donde no dice');
  if (!/goTo\(dest\);/.test(cuerpo))
    throw new Error('salirDeOrar ya no navega al destino');
});

ok('orar        · la etiqueta del botón principal ya no miente', () => {
  const s = leer('orar.html');
  if (/id="btn-celeb-home"[^>]*>Regresar a inicio</.test(s))
    throw new Error('vuelve a prometer "Regresar a inicio" sin ir al inicio');
  /* ambos finales fijan su propio texto */
  if (!/btn-celeb-home'\)\.textContent='Seguir rezando'/.test(s))
    throw new Error('el fin de bloque no fija su etiqueta');
  if (!/btn-celeb-home'\)\.textContent='Siguiente Nivel'/.test(s))
    throw new Error('el fin de los 20 no fija su etiqueta');
});

ok('orar        · cancelar el aviso limpia el destino pendiente', () => {
  if (!/_exitCancel=function\(\)\{[^}]*_exitPend=null/.test(leer('orar.html')))
    throw new Error('el destino se filtraría al siguiente intento de salida');
});

console.log('\n── El developer recorre lo que su progreso desbloqueó ──');

ok('audio       · un nivel sin audio no le levanta el muro', () => {
  /* audio deduce "en desarrollo" de que la pista START dé 404. Es cierto para el
     usuario normal, pero los textos de los Mundos 2 a 7 ya están en data/ y el
     developer tiene que poder revisarlos aunque el audio no exista todavía. */
  const h = (leer('audio.html').match(/audioEl\.onerror = [\s\S]*?\n  \};/) || [''])[0];
  if (!/_dev = \(window\.effectivePlan[\s\S]{0,90}?=== 'developer'/.test(h))
    throw new Error('el manejador no resuelve el plan developer');
  const m = h.match(/if \(track\.folder === 'start'[\s\S]{0,120}?showComingSoon\(\);/);
  if (!m) throw new Error('no encontré la puerta del START');
  if (!/!_dev/.test(m[0]))
    throw new Error('el muro vuelve a alcanzar al developer');
});

ok('audio       · al developer no se le auto-avanza sin audio', () => {
  /* Si cada pista da error y se auto-avanza, la sesión entera pasa en un
     instante: no vería nada y el Misterio quedaría marcado como rezado. */
  const h = (leer('audio.html').match(/audioEl\.onerror = [\s\S]*?\n  \};/) || [''])[0];
  const iDev  = h.indexOf('if (_dev) {');
  const iAvan = h.indexOf('goTrack(idx + 1)');
  if (iDev === -1) throw new Error('no hay rama para developer en el manejador de error');
  if (iAvan === -1) throw new Error('no encontré el auto-avance');
  if (!(iDev < iAvan))
    throw new Error('la parada del developer tiene que ir ANTES del auto-avance');
});

ok('crecer      · entrar a un nivel en desarrollo exime al developer', () => {
  const f = (leer('crecer.html').match(/function selectNivel[\s\S]*?\n\}/) || [''])[0];
  if (!/plan !== 'developer'/.test(f))
    throw new Error('selectNivel volvería a bloquear al developer');
});

ok('crecer      · el selector abre por PROGRESO, no por publicación', () => {
  /* La regla pedida: todos los Mundos que el progreso haya desbloqueado,
     publicados o no. El candado del orbe mira la frontera, no NIVEL_STATUS. */
  const f = (leer('crecer.html').match(/function buildLevelPicker[\s\S]*?\n\}/) || [''])[0];
  if (!/isUnlocked = idx <= cIdx/.test(f))
    throw new Error('el candado del selector dejó de mirar el progreso');
  if (/NIVEL_STATUS/.test(f))
    throw new Error('el selector no debe cerrar orbes por estado de publicación');
});

console.log('\n── Los cuatro modos recuerdan dónde estás ──');

/* crecer decide qué nivel enseñar con `bookmark || frontier`, y el bookmark es
   localStorage.cruzando_current_nivel. Lo escribían audio, crecer e index; orar y
   rezar no. Efecto real: rezabas un bloque en 2-2, volvías al mapa y te enseñaba
   otro nivel — el progreso estaba guardado, pero el mapa miraba a otro sitio. */
const BOOKMARK = 'cruzando_current_nivel';

['audio.html', 'orar.html', 'rezar.html', 'crecer.html'].forEach(f => {
  ok(f.padEnd(11) + ' · escribe el marcador de nivel', () => {
    if (!new RegExp("setItem\\('" + BOOKMARK + "'").test(leer(f)))
      throw new Error('no lo escribe: al volver, el mapa apuntaría a otro nivel');
  });
});

['orar.html', 'rezar.html'].forEach(f => {
  ok(f.padEnd(11) + ' · sin ?c= no cae al Mundo 1, lee el marcador', () => {
    const s = leer(f);
    if (/nivelId=p\.get\('c'\)\|\|'0101'/.test(s))
      throw new Error('vuelve a caer a 0101 ignorando dónde estaba el usuario');
    if (!/nivelId=p\.get\('c'\)\|\|nivelRecordado\(\)\|\|'0101'/.test(s))
      throw new Error('el marcador no manda sobre el valor por defecto');
  });
});

ok('el marcador solo acepta un nivelId de cuatro dígitos', () => {
  /* Un valor corrupto mandaría a crecer y a orar a un nivel inexistente. */
  /* Sin regex: aquí se busca el texto literal del patrón, y escaparlo dentro de
     otro regex solo invita a equivocarse. */
  const PATRON = '/^' + String.fromCharCode(92) + 'd{4}$/';
  ['orar.html', 'rezar.html'].forEach(f => {
    const s = leer(f);
    ['recordarNivel', 'nivelRecordado'].forEach(fn => {
      const cuerpo = (s.match(new RegExp('function ' + fn + '[\\s\\S]*?\\n\\}')) || [''])[0];
      if (cuerpo.indexOf(PATRON) === -1)
        throw new Error(f + ' · ' + fn + ' no valida el formato del nivelId');
    });
  });
});

ok('el progreso de los tres modos va al MISMO documento', () => {
  /* No es que solo audio progrese: los tres escriben progress/{nivelId}, que es
     de donde crecer calcula la frontera. Lo que fallaba era el marcador. */
  ['orar.html', 'rezar.html'].forEach(f => {
    if (!/collection\('progress'\)\.doc\(nivelId\)/.test(leer(f)))
      throw new Error(f + ': dejó de escribir progress/{nivelId}');
  });
  if (!/'progress', nivelId/.test(leer('audio.html')) && !/syncToOrarProgress/.test(leer('audio.html')))
    throw new Error('audio dejó de sincronizar progress/{nivelId}');
  if (!/doc\(db, 'users', user\.uid, 'progress', id\)/.test(leer('crecer.html')))
    throw new Error('crecer dejó de calcular la frontera desde progress/');
});

console.log('\n── El itinerario: una sola tabla ──');

/* NIVELES_ORDER y NIVEL_STATUS vivían solo en index y crecer, y audio LAS LEÍA:
   llegaban vacías, el índice salía -1 y el bucle que busca el siguiente cuaderno
   publicado no entraba nunca. Un free que terminaba el Misterio 20 se quedaba en
   el mismo cuaderno. NIVEL_NAMES, además, estaba copiado en cuatro páginas. */
const vm = require('vm');
const ctxN = {}; ctxN.window = ctxN; vm.createContext(ctxN);
vm.runInContext(leer('niveles.js'), ctxN);
const N = ctxN.window.Niveles;

ok('niveles.js  · las tres tablas, con 28 entradas cada una', () => {
  if (N.ORDEN.length !== 28) throw new Error('ORDEN tiene ' + N.ORDEN.length);
  if (Object.keys(N.ESTADO).length !== 28) throw new Error('ESTADO incompleto');
  if (Object.keys(N.NOMBRES).length !== 28) throw new Error('NOMBRES incompleto');
  N.ORDEN.forEach(id => {
    if (!N.ESTADO[id]) throw new Error('sin estado: ' + id);
    if (!N.NOMBRES[id]) throw new Error('sin nombre: ' + id);
  });
});

ok('niveles.js  · el estado del itinerario, fijado', () => {
  /* Si esto cambia es porque se publicó contenido nuevo: decisión de producto,
     no un ajuste. La prueba está para que no cambie por accidente. */
  const pub = N.ORDEN.filter(N.publicado);
  if (pub.join(',') !== '0101,0102,0103,0104')
    throw new Error('publicados: ' + pub.join(','));
  if (N.ESTADO['0702'] !== 'empty') throw new Error('0702 dejó de ser empty');
});

ok('niveles.js  · siguientePublicado encuentra el siguiente', () => {
  if (N.siguientePublicado('0101') !== '0102')
    throw new Error('tras 0101 debería venir 0102, vino ' + N.siguientePublicado('0101'));
  /* Al cerrar 0104 no hay adónde ir: los Mundos 2 a 7 están en dev. Devuelve
     null a propósito, para que quien llame lo decida en vez de quedarse mudo. */
  if (N.siguientePublicado('0104') !== null) throw new Error('tras 0104 no hay publicado');
  if (N.siguientePublicado('9999') !== null) throw new Error('un id inventado debe dar null');
});

['index.html', 'crecer.html', 'audio.html', 'diario.html'].forEach(f => {
  ok(f.padEnd(13) + '· carga niveles.js y no redeclara las tablas', () => {
    const s = leer(f);
    if (!s.includes('src="niveles.js"')) throw new Error('no carga niveles.js');
    ['NIVEL_STATUS', 'NIVELES_ORDER', 'NIVEL_NAMES'].forEach(t => {
      if (new RegExp('(?:var|const) ' + t + ' ?= ?[{\[]').test(s))
        throw new Error('vuelve a declarar ' + t + ' por su cuenta');
    });
  });
});

ok('audio       · el free avanza de cuaderno al cerrar los 20', () => {
  const s = leer('audio.html');
  if (/const _NORDER {2}= window\.NIVELES_ORDER/.test(s))
    throw new Error('vuelve el bucle en línea que leía tablas inexistentes');
  if (!/Niveles\.siguientePublicado\(curNivelId\)/.test(s))
    throw new Error('no usa el módulo para buscar el siguiente cuaderno');
  if (!/if \(_sig\) nextNivelId = _sig;/.test(s))
    throw new Error('sin siguiente publicado debe quedarse en el suyo, no en undefined');
});

ok('extras      · conserva su tabla a propósito', () => {
  /* Otro formato ('Cruz · Males') y con subtítulos para los Mundos 2-7 que la
     canónica no tiene. Unificarlas es decisión de contenido, no de código. */
  if (!/var NIVEL_NAMES = \{/.test(leer('extras.html')))
    throw new Error('extras perdió su tabla propia sin decidirlo');
});

console.log('\n' + '─'.repeat(64));
if (fallos) {
  console.log('  ✗ ' + fallos + ' fallo(s), ' + pasos + ' pasada(s)');
  console.log('─'.repeat(64) + '\n');
  process.exit(1);
}
console.log('  TODO VERDE — ' + pasos + ' pruebas');
console.log('─'.repeat(64) + '\n');
