/* ══════════════════════════════════════════════════════════════════════
   Banco de pruebas — el día manda (dia.js + hoy.html)

   El Nivel en curso se cruza al ritmo de la devoción. De ahí salen dos cosas
   que NO están programadas y conviene vigilar que sigan siendo ciertas:

     · LA SEMANA. Los Luminosos caen solo en jueves, así que una vuelta del
       Nivel solo puede cerrarse un jueves. La semana no la impone un
       temporizador: la impone el calendario. Si alguien tocara el mapeo,
       la semana se rompería sin que nada más fallara.
     · LA TIRA NO PUEDE MENTIR. El dibujo y la puerta salen de la misma
       función. El mapa cometió justo ese error —pinta quince nodos con
       candado que se abren igual— y esto existe para no repetirlo.

   Y dos reglas de producto: el día abre y nunca cierra, y un Rosario al día.

   Correr:  node tools/test-dia.js
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let fallos = 0, pasos = 0;
function ok(nombre, fn) {
  try { fn(); console.log('  ✓ ' + nombre); pasos++; }
  catch (e) { console.log('  ✗ ' + nombre + '\n      ' + e.message); fallos++; }
}
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error((msg || '') + '\n      esperado: ' + B + '\n      recibido: ' + A);
}

/* El módulo, corriendo de verdad */
const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(leer('dia.js'), ctx);
const D = ctx.window.Dia;

const f  = (a, m, d) => new Date(a, m - 1, d);   // septiembre 2026: 6 = domingo
const V  = n => { const a = [null,null,null,null,null]; for (let i=0;i<n;i++) a[i]=1000+i; return a; };
const doc = (v, desde, dia) => ({ vuelta: v, vueltaDesde: desde, diaBloque: dia });
const cuatro = (g,l,dl,gl) => ({ gozosos:V(g), luminosos:V(l), dolorosos:V(dl), gloriosos:V(gl) });

console.log('\n── El mapeo litúrgico, día por día ──');

ok('los siete días, exactos', () => {
  const esperado = ['gloriosos','gozosos','dolorosos','gloriosos','luminosos','dolorosos','gozosos'];
  eq([0,1,2,3,4,5,6].map(i => D.POR_DIA[i]), esperado);
});

ok('domingo = 0, como Date.getDay()', () => {
  eq(D.bloqueDeHoy(f(2026,9,6)), 'gloriosos', 'domingo');
  eq(D.bloqueDeHoy(f(2026,9,10)), 'luminosos', 'jueves');
});

ok('LA SEMANA: los Luminosos caen SOLO en jueves', () => {
  /* Es el cuello de botella del que sale que un Nivel dure siete días.
     Si alguien le diera un segundo día, la semana se rompería en silencio. */
  const cuenta = b => Object.keys(D.POR_DIA).filter(k => D.POR_DIA[k] === b).length;
  eq(cuenta('luminosos'), 1, 'luminosos');
  eq([cuenta('gozosos'), cuenta('dolorosos'), cuenta('gloriosos')], [2,2,2]);
});

ok('la clave del día es la fecha LOCAL, no 24 horas', () => {
  eq(D.clave(f(2026,9,3)), '2026-09-03');
  eq(D.clave(f(2026,12,25)), '2026-12-25');
});

ok('proximoDia dice el día concreto, no la lista', () => {
  eq(D.proximoDia('luminosos', f(2026,9,6)), 'jueves');
  eq(D.proximoDia('gozosos',   f(2026,9,6)), 'lunes');   // no "lunes y sábado"
  eq(D.proximoDia('gozosos',   f(2026,9,7)), 'sábado');  // desde lunes, el siguiente
});

console.log('\n── El día abre, nunca cierra ──');

ok('el bloque saltado sigue disponible', () => {
  /* Entró el viernes (dolorosos). Se saltó el sábado. Hoy domingo. */
  const st = D.estadoDelNivel(doc(cuatro(0,0,5,0), '2026-09-04'), f(2026,9,6));
  eq(st.disponibles, ['gozosos','gloriosos']);
  eq(st.bloques.gozosos[0],   'abierto');
  eq(st.bloques.gloriosos[0], 'hoy');
});

ok('lo que aún no ha tenido su día, espera', () => {
  const st = D.estadoDelNivel(doc(cuatro(0,0,5,0), '2026-09-04'), f(2026,9,6));
  eq(st.bloques.luminosos[0], 'espera');
  eq(st.disponibles.indexOf('luminosos'), -1);
});

ok('sin esto, el de fin de semana no cerraría un Nivel jamás', () => {
  /* Solo reza sábados y domingos. A la semana siguiente los Luminosos —que
     solo caen en jueves— tienen que estar a su alcance. */
  const st = D.estadoDelNivel(doc(cuatro(5,0,0,5), '2026-08-29'), f(2026,9,5));
  if (st.disponibles.indexOf('luminosos') < 0)
    throw new Error('los Luminosos quedaron fuera de alcance: ' + st.disponibles.join(','));
  eq(st.disponibles, ['luminosos','dolorosos']);
});

ok('una semana entera abre los cuatro', () => {
  eq(D.diasPasados('2026-09-01', f(2026,9,8)), ['gozosos','luminosos','dolorosos','gloriosos']);
});

ok('un tramo corto abre solo los días recorridos', () => {
  eq(D.diasPasados('2026-09-04', f(2026,9,6)), ['gozosos','dolorosos','gloriosos']);
});

ok('sin fecha de inicio, solo cuenta hoy', () => {
  eq(D.diasPasados(null, f(2026,9,10)), ['luminosos']);
  eq(D.diasPasados('basura', f(2026,9,10)), ['luminosos']);
});

console.log('\n── Un Rosario al día ──');

ok('elegido un bloque, los demás esperan a mañana', () => {
  const d = doc(cuatro(0,0,5,0), '2026-09-04', { fecha:'2026-09-06', bloque:'gozosos' });
  const st = D.estadoDelNivel(d, f(2026,9,6));
  eq(st.elegido, 'gozosos');
  eq(st.diaGastado, true);
  eq(st.disponibles, ['gozosos'], 'los Gloriosos de hoy ya no se pueden');
});

ok('la elección caduca a medianoche, no a las 24 horas', () => {
  const d = doc(cuatro(0,0,5,0), '2026-09-04', { fecha:'2026-09-06', bloque:'gozosos' });
  eq(D.elegidoHoy(d, f(2026,9,6)), 'gozosos');
  eq(D.elegidoHoy(d, f(2026,9,7)), null, 'al día siguiente vuelve a estar por decidir');
  eq(D.estadoDelNivel(d, f(2026,9,7)).disponibles, ['gozosos','gloriosos']);
});

ok('una elección corrupta no encierra a nadie', () => {
  const d = doc(cuatro(0,0,5,0), '2026-09-04', { fecha:'2026-09-06', bloque:'inventado' });
  eq(D.elegidoHoy(d, f(2026,9,6)), null);
});

console.log('\n── La tira no puede mentir ──');

ok('permitido() y la tira dan la misma respuesta', () => {
  const casos = [
    doc(cuatro(0,0,5,0), '2026-09-04'),
    doc(cuatro(5,0,0,5), '2026-08-29'),
    doc(cuatro(5,5,5,5), '2026-09-04'),
    doc(cuatro(0,0,0,0), '2026-09-04'),
    doc(cuatro(2,0,5,1), '2026-09-04', { fecha:'2026-09-06', bloque:'gozosos' })
  ];
  for (const d of casos) {
    for (let dia = 1; dia <= 7; dia++) {
      const fe = f(2026, 9, dia);
      const st = D.estadoDelNivel(d, fe);
      for (const b of D.BLOQUES) {
        eq(D.permitido(b, d, fe), st.disponibles.indexOf(b) >= 0,
           'discrepan puerta y dibujo en ' + b);
      }
    }
  }
});

ok('ninguna cuenta en espera es alcanzable', () => {
  const d  = doc(cuatro(0,0,5,0), '2026-09-04');
  const fe = f(2026,9,6);
  const st = D.estadoDelNivel(d, fe);
  for (const b of D.BLOQUES) {
    if (st.bloques[b][0] === 'espera' && D.permitido(b, d, fe))
      throw new Error(b + ' se pinta en espera pero la puerta lo deja pasar');
  }
});

console.log('\n── Solo cuenta lo REZADO de esta vuelta ──');

ok('hechos lee `vuelta`, nunca `progress`', () => {
  /* En la segunda vuelta progress está lleno —los veinte se cruzaron hace
     semanas— y leerlo daría siempre "nada pendiente". */
  const d = {
    progress: { gozosos:[1,1,1,1,1], luminosos:[1,1,1,1,1],
                dolorosos:[1,1,1,1,1], gloriosos:[1,1,1,1,1] },
    vuelta:   cuatro(2,0,0,0)
  };
  eq(D.hechos(d, 'gozosos'), 2);
  eq(D.hechos(d, 'luminosos'), 0);
  eq(D.nivelCompleto(d), false, 'progress lleno no es la vuelta cerrada');
});

ok('el punto de retoma es el primer hueco, y se deriva', () => {
  const d = doc(cuatro(0,2,5,5), '2026-09-04');
  eq(D.primerPendiente(d, 'luminosos'), 2, 'retoma en el Misterio 8');
  eq(D.primerPendiente(d, 'dolorosos'), 0, 'bloque lleno: no hay hueco');
});

ok('un documento a medias o con basura no revienta', () => {
  eq(D.hechos({}, 'gozosos'), 0);
  eq(D.hechos(null, 'gozosos'), 0);
  eq(D.hechos({ vuelta: { gozosos: 'no soy un array' } }, 'gozosos'), 0);
  eq(D.estadoDelNivel({}, f(2026,9,6)).disponibles.length > 0, true);
});

console.log('\n── El día de vuelta ──');

ok('Nivel completo: el bloque del día se puede volver a rezar', () => {
  const st = D.estadoDelNivel(doc(cuatro(5,5,5,5), '2026-09-04'), f(2026,9,7));
  eq(st.completo, true);
  eq(st.disponibles, ['gozosos'], 'el del día, no los cuatro');
  eq(st.bloques.gozosos[0], 'vueltahoy');
  eq(st.bloques.luminosos[0], 'rezado');
});

console.log('\n── Qué Nivel se reza hoy ──');

const ORDEN = ['0101','0102','0103','0104'];

ok('premium reza el que está cruzando', () => {
  eq(D.nivelDiario('premium', { bookmark:'0103', frontera:'0104', orden:ORDEN }), '0103');
  eq(D.nivelDiario('beta',    { bookmark:null,   frontera:'0102', orden:ORDEN }), '0102');
  eq(D.nivelDiario('developer',{ bookmark:'0104', frontera:'0101', orden:ORDEN }), '0104');
});

ok('el Nivel del free NO sale de aquí, y por eso devuelve null', () => {
  /* El free no sigue el calendario litúrgico: recorre el itinerario de un
     Misterio al día, y su Nivel vive en freeProgress/current. Devolver null
     hace que un llamador que se olvide de esa rama falle a la VISTA, en vez de
     servirle en silencio un Nivel que no es el suyo. */
  eq(D.nivelDiario('free', { bookmark:'0103', frontera:'0103', orden:ORDEN }), null);
  eq(D.nivelDiario('free', { bookmark:null,   frontera:'0104', orden:ORDEN }), null);
  eq(D.nivelDiario('free', { bookmark:null,   frontera:'0101', orden:ORDEN }), null);
});

console.log('\n── Las páginas ──');

const HOY = leer('hoy.html');

ok('hoy.html · carga dia.js, y bloques.js en el <head>', () => {
  const head = HOY.slice(0, HOY.indexOf('</head>'));
  for (const s of ['bloques.js','niveles.js','dia.js','rosario.js','plan-utils.js']) {
    if (!head.includes('src="' + s + '"')) throw new Error('falta ' + s + ' en el <head>');
  }
});

ok('hoy.html · no redeclara el mapeo del día', () => {
  const cuerpo = HOY.slice(HOY.indexOf('</head>'));
  if (/(var|let|const)\s+(POR_DIA|DAY_BLOCKS|DIA_BLOQUE)\s*=/.test(cuerpo))
    throw new Error('hoy.html se hizo su propia copia del mapeo litúrgico');
});

ok('hoy.html · la tira y la puerta salen de la misma función', () => {
  if (!/Dia\.estadoDelNivel\(/.test(HOY)) throw new Error('no usa Dia.estadoDelNivel');
  if (/(var|let|const)\s+POR_DIA/.test(HOY)) throw new Error('reimplementa el estado');
});

ok('hoy.html · las cuentas NO navegan', () => {
  /* Decisión de producto: se entra solo por los botones. Si una cuenta
     llevara a rezar, la tira se convertiría en el mapa por accidente. */
  const i = HOY.indexOf("querySelectorAll('.bead')");
  if (i < 0) throw new Error('no se encontró el manejador de las cuentas');
  const bloque = HOY.slice(i, i + 1400);
  if (/location\.(href|replace)/.test(bloque))
    throw new Error('una cuenta navega: la tira dejó de ser un instrumento de lectura');
});

ok('hoy.html · fija el bloque del día antes de salir a rezar', () => {
  if (!/fijarBloqueDelDia\(/.test(HOY)) throw new Error('no fija el Rosario del día');
  const i = HOY.indexOf("'ir-rezar'");
  const bloque = HOY.slice(i, i + 400);
  if (bloque.indexOf('fijarBloqueDelDia') < 0 ||
      bloque.indexOf('fijarBloqueDelDia') > bloque.indexOf('rezar.html'))
    throw new Error('navega sin haber fijado el bloque: al volver, el día seguiría por decidir');
});

ok('audio.html · su DAY_BLOCKS no se ha desviado del canon', () => {
  /* Sigue vivo dentro de renderAudioHome(), que no llama nadie. Se retirará
     cuando esa función muera; hasta entonces, que no diverja. */
  const A = leer('audio.html');
  const m = A.match(/const DAY_BLOCKS = \{([^}]+)\}/);
  if (!m) return;                       // ya se retiró: nada que vigilar
  const copia = {};
  m[1].split(',').forEach(p => {
    const [k, v] = p.split(':');
    copia[k.trim()] = v.trim().replace(/'/g, '');
  });
  for (let i = 0; i <= 6; i++) eq(copia[i], D.POR_DIA[i], 'día ' + i);
});

console.log('\n-- El seam: rezar y audio vuelven a derivar la regla --'.replace(/--/g,'\u2500\u2500'));

/* Las páginas grandes van con CRLF; se normaliza para poder afirmar sobre
   la forma exacta del código sin que un final de línea decida la prueba. */
const norm = t => t.split(String.fromCharCode(13)).join('');
const REZ = norm(leer('rezar.html'));
const AUD = norm(leer('audio.html'));

ok('rezar.html · carga dia.js', () => {
  if (!REZ.includes('src="dia.js"')) throw new Error('no carga dia.js');
});

ok('rezar.html · la puerta se comprueba DESPUÉS de leer el progreso', () => {
  /* El derecho del free a rezar aquí depende de que el Nivel esté cruzado, y
     eso solo lo dice `progress`. requirePremiumAccess corría antes de leerlo,
     así que no podía saberlo. */
  const par = '}catch(e){prog={};}\n\n  if(!_puedeRezarAqui';
  eq(REZ.split(par).length - 1, 2,
     'loadAndStart y loadAndEnter deben comprobarla tras el progreso');
});

ok('rezar.html · el Rezo es de Premium, sin excepciones', () => {
  /* Hubo aquí una rama para el free —su Nivel diario más el DEMO— y se fue con
     el DEMO. El free ora en audio: una sesión guiada al día. El permiso vuelve
     a salir de una sola tabla, que es donde se lee de un vistazo. */
  if (/nivelId==='0101'\|\|_nivelCruzado\(\)/.test(REZ))
    throw new Error('volvió la rama del free al Rezo');
  if (!/return window\.canAccessModo\?canAccessModo\('rezar',plan,nivelId\):true;/.test(REZ))
    throw new Error('_puedeRezarAqui dejó de delegar en la tabla');
});

ok('rezar.html · el marcador solo se mueve si la sesión progresa', () => {
  /* Escribirlo en un Nivel ya cruzado arrastraría el mapa hacia atrás. */
  eq(REZ.split('if(!_nivelCruzado()) recordarNivel(nivelId);').length - 1, 2,
     'las dos entradas deben proteger el marcador');
  if (/\n  recordarNivel\(nivelId\);\n/.test(REZ))
    throw new Error('queda una escritura del marcador sin proteger');
});

ok('el DEMO se retiró: 0101 ya no es un Nivel-regalo', () => {
  /* `plan === 'free' && nivelId === '0101' -> return true` abría TODOS los
     modos en el primer cuaderno. El free no tiene un Nivel con todo abierto:
     tiene el itinerario entero en audio, de un Misterio al día. */
  const pu = leer('plan-utils.js');
  if (/plan === 'free' && nivelId === '0101'/.test(pu))
    throw new Error('la cláusula del DEMO sigue abriendo 0101 entero');
  if (/plan==='free'&&_nivelCruzado\(\)/.test(REZ))
    throw new Error('rezar conserva su rama del DEMO');
});

ok('rezar.html · la puerta del día se deriva, no se cree la bandera', () => {
  const b = REZ.slice(REZ.indexOf('function _diaPermite'), REZ.indexOf('function _diaPermite') + 420);
  if (!/Dia\.permitido\(blk,prog,new Date\(\)\)/.test(b))
    throw new Error('no vuelve a derivar el permiso del progreso');
});

ok('audio.html · el marcador del free vuelve a moverse', () => {
  /* `_mueveMarcador` existia porque el Rosario diario del free ocurria en un
     Nivel YA CRUZADO y escribir el marcador arrastraba el mapa hacia atras.
     Ahora el free avanza por SU Nivel: su sesion progresa, y el marcador tiene
     que seguirla como el de cualquiera. La guarda quedo muerta y se retiro. */
  if (!AUD.includes('src="dia.js"')) throw new Error('no carga dia.js');
  if (/_mueveMarcador/.test(AUD))
    throw new Error('volvió la guarda que le congelaba el marcador al free');
});

ok('hoy.html · declara la clase de sesión en los traspasos del día', () => {
  /* Los DOS de la vista del día —rezar y audio— la llevan. El del free NO,
     y es la diferencia entera: `hoy=1` dice "esta sesión cae bajo la regla del
     día", y la del free cae bajo su itinerario. */
  eq(HOY.split("'&hoy=1'").length - 1, 2,
     'rezar y audio deben recibir la marca de sesión diaria');
  const iF = HOY.indexOf('function renderFree');
  const fin = HOY.indexOf('function hechoEn', iF);
  if (iF < 0 || fin < 0) throw new Error('no se encuentra renderFree');
  if (/hoy=1/.test(HOY.slice(iF, fin)))
    throw new Error('el traspaso del free lleva la bandera del día');
});

console.log('\n' + String.fromCharCode(9472,9472) + ' La barra: Hoy es la pestana principal ' + String.fromCharCode(9472,9472));

const HUB = ['index.html','crecer.html','sanar.html','diario.html',
             'cantos.html','retiros.html','extras.html'];

/* La primera etiqueta que aparece dentro de la barra */
function primeraPestana(src) {
  const i = src.search(/<nav class="app-nav[^>]*>/);
  if (i < 0) return null;
  const m = src.slice(i).match(/app-nav-label">([^<]*)</);
  return m ? m[1] : null;
}

HUB.forEach(f => {
  ok(f.padEnd(12) + ' · Hoy es la primera pestana de la barra', () => {
    const src = norm(leer(f));
    if (!/app-nav-label">Hoy</.test(src)) throw new Error('no lleva la pestana Hoy');
    eq(primeraPestana(src), 'Hoy', 'Hoy tiene que ir la primera');
  });
});

ok('el hub entero usa su propia funcion de navegacion', () => {
  /* Cada pagina llama distinto —navigateTo, navTo, goTo, window.goTo— y el
     item de Hoy tiene que hablar el idioma de su pagina, no traer el suyo. */
  HUB.forEach(f => {
    const src = norm(leer(f));
    const i = src.indexOf('app-nav-label">Hoy<');
    const boton = src.slice(src.lastIndexOf('<button', i), i);
    if (!/navTap\(/.test(boton)) throw new Error(f + ': Hoy no usa navTap');
    if (!/hoy\.html/.test(boton))  throw new Error(f + ': Hoy no apunta a hoy.html');
    if (/location\.href/.test(boton))
      throw new Error(f + ': Hoy navega a pelo en vez de con la funcion de la pagina');
  });
});

ok('hoy.html    · su propia pestana no navega hacia si misma', () => {
  const src = norm(HOY);
  const i = src.indexOf('app-nav-label">Hoy<');
  const boton = src.slice(src.lastIndexOf('<button', i), i);
  if (!/disabled/.test(boton) || !/app-nav-item active/.test(boton))
    throw new Error('la pestana activa deberia estar marcada y deshabilitada');
  eq(primeraPestana(src), 'Hoy');
});

ok('hoy.html    · la barra lleva las seis, con icono y gesto', () => {
  const src = norm(HOY);
  const etqs = (src.match(/app-nav-label">([^<]*)</g) || [])
    .map(x => x.replace('app-nav-label">','').replace('<',''));
  /* Hoy primero, y Sanar antes que Crecer: lo cotidiano y la puerta de
     entrada por delante del mapa, que ademas pasa a ser de Premium. */
  eq(etqs, ['Hoy','Sanar','Crecer','Retiros','Diario','Cantos']);
  eq((src.match(/app-nav-icon/g) || []).length >= 6, true, 'faltan iconos');
  if (!/window\.navTap = function/.test(src)) throw new Error('navTap no esta cableada');
});

ok('la barra de los reproductores NO se toco', () => {
  /* Es otra barra y otro propósito: cambia de modo DENTRO de una sesion.
     Su salida etiquetada "Crecer" se revisa en el paso 3, cuando el mapa
     deje de ser de todos: para un free llevaria a un sitio sin nada. */
  ['audio.html','orar.html','rezar.html'].forEach(f => {
    if (/app-nav-label">Hoy</.test(norm(leer(f))))
      throw new Error(f + ' recibio la pestana Hoy, que no le corresponde todavia');
  });
});

console.log('');
console.log('== El camino del free: un Misterio al dia, el suyo ==');

ok('hoy.html · el free sale por su propia rama, no por condicionales sueltos', () => {
  /* Dos modelos en un archivo es el riesgo real de esta pantalla. Se pagan por
     adelantado: arrancar/render para el dia, arrancarFree/renderFree para el
     itinerario, y el reparto en UNA linea. */
  if (!/if \(plan === 'free'\) \{ await arrancarFree\(\); return; \}/.test(HOY))
    throw new Error('el reparto no está en una sola línea');
  if (!/function arrancarFree\(\)/.test(HOY)) throw new Error('falta arrancarFree');
  if (!/function renderFree\(\)/.test(HOY))   throw new Error('falta renderFree');
});

ok('hoy.html · el Nivel del free sale de freeProgress, no de la frontera', () => {
  /* Es el MISMO documento que audio lee al arrancar, y por eso Hoy no puede
     mandarle a un Misterio que audio le vaya a rechazar. */
  const b = HOY.slice(HOY.indexOf('async function arrancarFree'),
                      HOY.indexOf('function renderFree'));
  if (!/collection\('freeProgress'\)\.doc\('current'\)/.test(b))
    throw new Error('no lee freeProgress/current');
  if (/calcularFrontera|nivelDiario/.test(b))
    throw new Error('el free vuelve a resolver su Nivel por la frontera');
});

ok('hoy.html · el reinicio de medianoche no se reescribe aquí', () => {
  /* Una sola regla, en plan-utils, porque la leen dos mundos que no comparten
     SDK: getFreeProgress (modular) y esta página (compat). */
  if (!/normalizarFreeProgress/.test(HOY))
    throw new Error('hoy.html no usa la regla compartida');
  if (/completedToday\s*=\s*false/.test(HOY))
    throw new Error('hoy.html se copió el reinicio diario');
});

ok('plan-utils · el reinicio diario vive en un solo sitio', () => {
  const pu = leer('plan-utils.js');
  if (!/function normalizarFreeProgress/.test(pu))
    throw new Error('no existe la regla compartida');
  eq((pu.match(/completedToday = false/g) || []).length, 1,
     'el reinicio volvió a estar escrito más de una vez');
});

ok('plan-utils · el itinerario del free deriva de niveles.js', () => {
  /* PUBLISHED_NIVELES era una QUINTA copia, literal y a mano: el día que 0201
     pase a published, el free se habría quedado dando vueltas entre los cuatro
     primeros sin que nada fallara. */
  const pu = leer('plan-utils.js');
  if (!/function publicados\(\)/.test(pu))
    throw new Error('no hay derivación desde Niveles');
  if (/PUBLISHED_NIVELES\[idx \+ 1\]/.test(pu))
    throw new Error('el avance del free sigue leyendo la lista literal');
});

ok('hoy.html · la tira es una sola pieza para los dos modelos', () => {
  /* Cambia el ESTADO de cada cuenta, no el dibujo. Dos copias de la tira
     habrían divergido a la primera vez que se retocara una.  */
  if (!/function tiraDe\(estadoDe\)/.test(HOY))  throw new Error('falta tiraDe');
  if (!/function cablearTira\(leyendaDe\)/.test(HOY)) throw new Error('falta cablearTira');
  eq((HOY.match(/h \+= tiraDe\(/g) || []).length, 2, 'los dos modelos deben usarla');
  eq((HOY.match(/cablearTira\(function/g) || []).length, 2, 'y los dos deben cablearla');
});

ok('hoy.html · la tira del free dice lo REZADO, no lo supuesto', () => {
  /* El mapa pinta el camino del free como prefijo lineal (gi < activo). Aquí se
     lee `progress`, que es lo que los reproductores escriben de verdad: así
     dice la verdad también para quien fue premium y bajó de plan. */
  if (!/function hechoEn\(bloque, j\)/.test(HOY))
    throw new Error('falta la lectura del progreso real');
  if (!/prog\.progress\[bloque\]/.test(HOY))
    throw new Error('la tira del free no lee progress');
});

ok('hoy.html · al free se le ofrece audio, y nada más', () => {
  /* Rezar es de Premium y el Libro también: ofrecerlos aquí sería un botón que
     promete y no cumple, el defecto de los nodos con candado que se abrían. */
  const b = HOY.slice(HOY.indexOf('function renderFree'), HOY.indexOf('function hechoEn'));
  if (/rezar\.html|orar\.html/.test(b))
    throw new Error('la vista del free ofrece un modo que no puede usar');
  if (!/id="ir-audio"/.test(b)) throw new Error('falta el botón de orar');
});

ok('hoy.html · completado el día, la puerta lleva al mapa', () => {
  /* Y el mapa es suyo: la Ruta D se lo devolvió. Sin salida, la pantalla de
     "vuelve mañana" sería un callejón. */
  const b = HOY.slice(HOY.indexOf('function renderFree'), HOY.indexOf('function hechoEn'));
  if (!/id="ir-camino"/.test(b)) throw new Error('sin salida al terminar el día');
  if (!/crecer\.html/.test(b))   throw new Error('la salida no lleva al mapa');
});
console.log('');
console.log('== La politica de progreso: cambia el RITMO, no el premio ==');

ok('el odómetro del free no se congela', () => {
  /* `_freeNoGana` era la "Política Free v2, forward-only": metían metros la
     primera vez en cada Misterio y nunca más. Nació cuando el mundo del free
     era el DEMO 0101 y podía repetirlo sin fin. Ahora avanza un Nivel cada
     veinte días, y en su segunda vuelta el odómetro se le habría quedado
     clavado para siempre aunque siguiera rezando cada día. */
  ['audio.html', 'orar.html', 'rezar.html', 'plan-utils.js'].forEach(f => {
    const s = leer(f);
    if (/_freeNoGana/.test(s)) throw new Error(f + ' conserva la bandera');
    if (/yaGanado/.test(s))    throw new Error(f + ' conserva yaGanado');
  });
});

ok('el free avanza de Nivel, y al final se QUEDA en el último', () => {
  /* Volver al primero arrastraría `cruzando_current_nivel` hacia atrás: el mapa
     le enseñaría el Mundo 1 después de haber cruzado cuatro Niveles. Es lo
     mismo que hace Premium cuando siguientePublicado() devuelve null. */
  const pu = leer('plan-utils.js');
  if (!/nextNivelId = PUB\[idx \+ 1\];/.test(pu))
    throw new Error('el free dejó de avanzar al Nivel siguiente');
  if (/nextNivelId = PUB\[0\];/.test(pu))
    throw new Error('al cerrar lo publicado el free vuelve al primero');
  if (!/nextNivelId = currentNivelId;/.test(pu))
    throw new Error('no se queda en el último publicado');
});

ok('audio.html · al free se le retiran las flechas de Misterio', () => {
  /* Solo puede entrar al suyo —audio ya lo redirige si la URL no coincide con
     freeProgress—, así que eran un control que se pulsaba y devolvía al mismo
     sitio. Se RETIRAN, no se atenúan: un botón al 30% sigue siendo un botón. */
  const b = AUD.slice(AUD.indexOf('function updateMysteryNavBtns'),
                      AUD.indexOf('function updateMysteryNavBtns') + 800);
  if (!/=== 'free'/.test(b))
    throw new Error('las flechas no distinguen al free');
  if (!/prev\.style\.display = solo \? 'none' : ''/.test(b))
    throw new Error('la flecha de retroceso sigue visible para el free');
  if (!/next\.style\.display = solo \? 'none' : ''/.test(b))
    throw new Error('la flecha de avance sigue visible para el free');
});
console.log('');
console.log('== El Diario: el free lee, y escribe en Sanar ==');

ok('plan-utils · escribir es de Premium; LEER no', () => {
  /* La asimetria es la decision: un downgrade de plan no puede borrarle a nadie
     su camino, asi que la biblioteca del Diario sigue abierta y lo que se
     retira es el campo de texto. */
  const pu = leer('plan-utils.js');
  if (!/if \(modo === 'escribir'\) return isPrem;/.test(pu))
    throw new Error('escribir no está en la tabla de planes');
  if (!/if \(modo === 'diario'\)  return true;/.test(pu))
    throw new Error('leer el Diario dejó de ser de todos');
});

ok('audio.html · la guarda va en el punto por el que se escribe', () => {
  /* Sin campo no hay como teclear, pero forceSaveAll corre al CERRAR el modal
     con lo que se hubiera leido de Firestore: reescribiria las respuestas de un
     ex-premium y cobraria metros por ellas sin que nadie hubiera escrito nada.
     Por eso la guarda esta en saveReflection, no solo en el marcado. */
  const b = AUD.slice(AUD.indexOf('async function saveReflection'),
                      AUD.indexOf('async function saveReflection') + 600);
  if (!/if \(!_puedeEscribirDiario\(\)\) return;/.test(b))
    throw new Error('saveReflection escribe sin comprobar el plan');
  if (!/function _puedeEscribirDiario/.test(AUD))
    throw new Error('falta la función que deriva el permiso');
  if (!/canAccessModo\('escribir'/.test(AUD))
    throw new Error('audio no pregunta a la tabla de planes');
});

ok('audio.html · los metros de reflexión no se cobran sin escribir', () => {
  const b = AUD.slice(AUD.indexOf('async function awardQuestionMeters'),
                      AUD.indexOf('async function awardQuestionMeters') + 300);
  if (!/if \(!_puedeEscribirDiario\(\)\) return;/.test(b))
    throw new Error('un free podría ganar los 650 m sin campo donde escribir');
});

ok('audio.html · las preguntas se siguen VIENDO', () => {
  /* Se omite la invitación a escribir, no la pregunta: lo que se medita es la
     pregunta, y el campo es solo donde se guarda la respuesta. */
  const b = AUD.slice(AUD.indexOf('const _escribe = _puedeEscribirDiario'),
                      AUD.indexOf('// Eventos con debounce'));
  if (!/q-question/.test(b))  throw new Error('la pregunta desapareció para el free');
  if (!/q-leida/.test(b))     throw new Error('lo ya escrito no se conserva a la vista');
  if (!/_escribe$/m.test(b) && !/\$\{_escribe/.test(b))
    throw new Error('el campo no está condicionado al plan');
});
console.log('');
console.log('== El mapa se ve entero; lo que se paga es moverse por él ==');

const CRE = norm(leer('crecer.html'));

ok('crecer.html  . el mapa esta abierto para todos', () => {
  /* Ver donde vas no se cobra: el mapa ES el camino. Lo que Premium abre es
     moverse por el, y de eso responden 'libro', 'rezar' y la rama free de
     openMapPopup —que ofrece Audio en SU Misterio y nada en los demas—. */
  if (CRE.includes("if (!canAccessModo('mapa', realPlan)) {"))
    throw new Error('volvio la puerta que expulsaba al free de su camino');
  const pu = leer('plan-utils.js');
  if (!/if \(modo === 'mapa'\) *return true;/.test(pu))
    throw new Error('la tabla sigue tratando el mapa como privilegio');
});

ok('crecer.html  . la FASE 1 pinta el mapa sin mirar el plan', () => {
  /* Llego a saltarselo si el cache decia free, para no ensenar una pantalla
     que no era suya. Ahora es suya, y esperar a la FASE 3 solo seria un
     destello de mapa vacio en el arranque de todo el mundo. */
  if (CRE.includes("if (_cPlan !== 'free') {"))
    throw new Error('la FASE 1 sigue condicionando el mapa al plan cacheado');
});

ok('el candado se retiro con la puerta, y ninguno vuelve solo', () => {
  /* Se pusieron a la vez y se quitan a la vez. Un candado sin puerta detras
     es el defecto que el mapa arrastraba con sus quince nodos decorativos;
     una puerta sin candado delante es peor: expulsa sin haber avisado. */
  const pu = leer('plan-utils.js');
  if (pu.includes('function marcarCrecerSiFree'))
    throw new Error('el candado de Crecer volvio sin su puerta');
  if (/cz-bloqueada/.test(pu))
    throw new Error('queda el marcado del candado');
});

ok('crecer.html  . el nodo pendiente manda a Hoy, pero solo a Premium', () => {
  /* Para Premium el camino se VE y no se salta: lo pendiente pertenece a Hoy,
     que es donde manda el dia. Para el free NO se aplica, y no por descuido:
     su Misterio activo tampoco esta hecho, asi que la guarda se lo llevaria a
     Hoy y no veria nunca su propio popup —Audio en SU Misterio, chip Premium
     sobre Libro y Rezo—. Esa respuesta dice mas que un redirect. */
  if (!CRE.includes('if (!hecho && !_isFree) { _pendienteEsDeHoy(); return; }'))
    throw new Error('la guarda no exime al free, que perderia su propio popup');
  if (!CRE.includes('function _pendienteEsDeHoy()'))
    throw new Error('falta el aviso que explica a donde va');
});

ok('rezar.html   . la puerta del dia ya cubre el Nivel en curso', () => {
  /* Se pudo cerrar del todo cuando el mapa dejo de ofrecerlo: hasta entonces
     habria hecho rebotar los nodos del mapa con los beta dentro. */
  if (!REZ.includes('||!_nivelCruzado()'))
    throw new Error('el enlace escrito a mano sigue saltandose el dia');
});
console.log('');
console.log('== La puerta Hoy del hub ==');

/* Solo la region de las puertas: `.hub-door-sanar` esta declarado en el CSS
   mucho antes que el boton, y buscar en todo el archivo encontraba la regla
   de estilo en vez del elemento. */
const IDX = (function () {
  const t = norm(leer('index.html'));
  const i = t.indexOf('PUERTAS PRINCIPALES');
  return i < 0 ? t : t.slice(i);
}());

ok('index.html   . la puerta Hoy va ARRIBA de Sanar', () => {
  const iHoy   = IDX.indexOf('id="door-hoy"');
  const iSanar = IDX.indexOf('hub-door-sanar');
  if (iHoy < 0)   throw new Error('no existe la puerta Hoy');
  if (iSanar < 0) throw new Error('no se encuentra la puerta de Sanar');
  if (iHoy > iSanar) throw new Error('la puerta Hoy quedo debajo de Sanar');
});

ok('index.html   . es un boton, no un acordeon', () => {
  /* Hoy no tiene nada que desplegar: se entra y se reza. Un acordeon aqui
     anadiria un toque entre el usuario y su Rosario del dia. */
  const i = IDX.indexOf('id="door-hoy"');
  const boton = IDX.slice(IDX.lastIndexOf('<button', i), IDX.indexOf('</button>', i));
  if (!boton.includes("navigateTo('hoy.html')"))
    throw new Error('no navega a hoy.html');
  if (boton.includes('revHub('))
    throw new Error('se convirtio en acordeon');
  if (boton.includes('hub-door-arrow'))
    throw new Error('lleva flecha de desplegar, y no despliega nada');
});

ok('index.html   . el escalonado de las puertas se lee en orden', () => {
  const orden = ['hub-elige', 'door-hoy', 'hub-door-sanar', 'door-crecer', 'door-santuario'];
  let prev = -1;
  for (const marca of orden) {
    const i = IDX.indexOf(marca);
    const linea = IDX.slice(IDX.lastIndexOf('<', i), IDX.indexOf('>', i));
    const m = linea.match(/animation-delay:\.(\d+)s/);
    if (!m) throw new Error(marca + ': sin retardo de entrada');
    /* .48s y .6s son DECIMALES: como enteros, 6 < 48 y el orden saldria al reves. */
    const v = parseFloat('0.' + m[1]);
    if (v <= prev) throw new Error(marca + ': entra antes que la anterior');
    prev = v;
  }
});

ok('index.html   . la puerta se tine con el bloque de QUIEN LA MIRA', () => {
  /* Para premium es el bloque que la Iglesia reza hoy; para el free, el de SU
     Misterio. La puerta y la pantalla tienen que decir lo mismo: si el hub
     promete un color y Hoy entrega otro, no se sabe cual de los dos miente.
     Y degrada: sin dia.js se queda con su texto y su cian, nunca revienta. */
  const TODO = norm(leer('index.html'));   // head y CSS quedan fuera de IDX
  if (!TODO.includes('src="dia.js"'))
    throw new Error('index no carga dia.js');
  if (!IDX.includes('Dia.bloqueDeHoy()'))
    throw new Error('la puerta no consulta el bloque del dia');
  if (!IDX.includes('if (!d || !b || !window.rgbBloque) return;'))
    throw new Error('sin guarda: sin bloque o sin bloques.js la puerta reventaria');
  if (!IDX.includes('if (window.Dia) _tenirPuertaHoy(Dia.bloqueDeHoy());'))
    throw new Error('la puerta no se pinta al cargar');
  if (!TODO.includes('.hub-door-hoy       { background:rgba(2,187,224,0.07); }'))
    throw new Error('falta el color de respaldo de la puerta');
});

ok('index.html   . y el free ve el bloque de SU Misterio, no el del dia', () => {
  /* Sale de `_freeProg`, el MISMO puntero que lee hoy.html: por eso los dos no
     pueden discrepar. Se repinta en las dos fases del arranque —con el cache
     primero, sin red, y con el plan confirmado despues—. */
  if (!IDX.includes("if (p === 'free' && fp && fp.misterio) {"))
    throw new Error('la puerta no distingue al free');
  if (!IDX.includes('window._freeProg'))
    throw new Error('no lee el puntero del itinerario');
  const TODO = norm(leer('index.html'));
  if (!/window\._pintarPuertaHoy = function/.test(TODO))
    throw new Error('no existe el repintado');
  eq((TODO.match(/_pintarPuertaHoy\(/g) || []).length, 2,
     'debe repintarse en las DOS fases del arranque: con cache y con el plan real');
});

ok('index.html   . el reinicio de medianoche no se copia aqui', () => {
  /* Estaba escrito por SEXTA vez. Una sola regla, en plan-utils. */
  const TODO = norm(leer('index.html'));
  if (!/normalizarFreeProgress/.test(TODO))
    throw new Error('index no usa la regla compartida');
  if (/fpData\.completedToday = false/.test(TODO))
    throw new Error('index se copio otra vez el reinicio diario');
});
console.log('');
console.log('== La pregunta de donde empezar se hace UNA vez ==');

ok('rezar.html   . no repregunta si la posicion se la dijeron', () => {
  /* crecer.irARezar() ya pregunta antes de navegar, nombrando el bloque y el
     Misterio. rezar volvia a preguntar porque solo miraba bIdx > 0 sin saber
     de donde salia: el usuario contestaba dos veces lo mismo antes de rezar.
     La regla es: se pregunta SOLO cuando se ha adivinado. */
  if (!REZ.includes('else if(bIdx>0 && !_posDicha){showModalInicio();}'))
    throw new Error('decideEntry volvio a preguntar sin mirar quien fijo la posicion');
  eq(REZ.split('_posDicha=true;').length - 1, 2,
     'las dos entradas explicitas (loadAndStart con ?b= y loadAndEnter) deben marcarla');
});

ok('rezar.html   . pero SIGUE preguntando cuando la adivina', () => {
  /* Entrando por la barra de navegacion no hay parametros y la posicion sale
     del progreso. Ahi la pregunta es lo unico que evita reanudar a ciegas. */
  if (!REZ.includes('function showModalInicio()'))
    throw new Error('se perdio el modal de inicio');
  const i = REZ.indexOf("const bParam=p.get('b')");
  if (i < 0) throw new Error('no se encuentra la rama de parametros');
  if (REZ.slice(i, i + 700).indexOf('found=true') < 0)
    throw new Error('desaparecio la rama que infiere la posicion del progreso');
});

ok('crecer.html  . conserva su modal, que es el informativo', () => {
  /* Nombra el bloque y el Misterio, y se hace ANTES de cargar la pagina. */
  if (!CRE.includes('function esInicioDeBloqueRezo'))
    throw new Error('crecer dejo de decidir si preguntar');
  if (!CRE.includes('_rezarDestDesdeInicio'))
    throw new Error('crecer perdio la opcion de empezar por el principio del bloque');
});
console.log('\n' + '─'.repeat(64));
if (fallos) {
  console.log('  ✗ ' + fallos + ' fallo(s), ' + pasos + ' pasada(s)');
  console.log('─'.repeat(64) + '\n');
  process.exit(1);
}
console.log('  TODO VERDE — ' + pasos + ' pruebas');
console.log('─'.repeat(64) + '\n');
