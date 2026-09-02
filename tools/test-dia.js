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

ok('el free reza el último ENTERO, nunca el que está en curso', () => {
  eq(D.nivelDiario('free', { bookmark:'0103', frontera:'0103', orden:ORDEN }), '0102');
  eq(D.nivelDiario('free', { bookmark:null,   frontera:'0104', orden:ORDEN }), '0103');
});

ok('el free sin ningún Nivel cerrado todavía no tiene Hoy', () => {
  /* Se abre al cruzar el primer cuaderno: la regla "el free no progresa aquí"
     se cumple por construcción, no por una condición que alguien pueda olvidar. */
  eq(D.nivelDiario('free', { bookmark:null, frontera:'0101', orden:ORDEN }), null);
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

ok('rezar.html · ya no delega en requirePremiumAccess para el Rezo', () => {
  if (/requirePremiumAccess\('rezar'/.test(REZ))
    throw new Error('sigue la puerta vieja, que rebota al free siempre');
  if (!/nivelId==='0101'\|\|_nivelCruzado\(\)/.test(REZ))
    throw new Error('la puerta del free no deriva del progreso');
});

ok('rezar.html · el marcador solo se mueve si la sesión progresa', () => {
  /* Escribirlo en un Nivel ya cruzado arrastraría el mapa hacia atrás. */
  eq(REZ.split('if(!_nivelCruzado()) recordarNivel(nivelId);').length - 1, 2,
     'las dos entradas deben proteger el marcador');
  if (/\n  recordarNivel\(nivelId\);\n/.test(REZ))
    throw new Error('queda una escritura del marcador sin proteger');
});

ok('rezar.html · el DEMO sin cruzar NO cae bajo la puerta del día', () => {
  /* En 0101 el free sigue su itinerario lineal: Hoy se le abre al cerrar su
     primer cuaderno. Sin el && le romperíamos el DEMO. */
  if (!/plan==='free'&&_nivelCruzado\(\)/.test(REZ))
    throw new Error('la puerta del día alcanzaría al free dentro del DEMO');
});

ok('rezar.html · la puerta del día se deriva, no se cree la bandera', () => {
  const b = REZ.slice(REZ.indexOf('function _diaPermite'), REZ.indexOf('function _diaPermite') + 420);
  if (!/Dia\.permitido\(blk,prog,new Date\(\)\)/.test(b))
    throw new Error('no vuelve a derivar el permiso del progreso');
});

ok('audio.html · carga dia.js y protege las dos escrituras del marcador', () => {
  if (!AUD.includes('src="dia.js"')) throw new Error('no carga dia.js');
  eq(AUD.split('if (_mueveMarcador())').length - 1, 2);
  const sueltas = AUD.split('\n')
    .filter(l => /localStorage\.setItem\('cruzando_current_nivel'/.test(l))
    .filter(l => !/^\s{6}try \{/.test(l));
  eq(sueltas.length, 0, 'queda una escritura del marcador fuera de la guarda');
});

ok('audio.html · la bandera solo suprime, nunca concede', () => {
  const b = AUD.slice(AUD.indexOf('function _mueveMarcador'), AUD.indexOf('function _mueveMarcador') + 260);
  if (!/return !\(_hoy && userPlan === 'free'\);/.test(b))
    throw new Error('_mueveMarcador cambió de forma');
});

ok('hoy.html · declara la clase de sesión en los dos traspasos', () => {
  eq(HOY.split("'&hoy=1'").length - 1, 2,
     'rezar y audio deben recibir la marca de sesión diaria');
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
console.log('== El mapa es de Premium, y el camino no se salta ==');

const CRE = norm(leer('crecer.html'));

ok('crecer.html  . cierra la puerta al free', () => {
  if (!CRE.includes("if (!canAccessModo('mapa', realPlan)) {"))
    throw new Error('no hay puerta: el mapa seguiria abierto para el free');
  if (!CRE.includes("location.replace('index.html?premium=1')"))
    throw new Error('la puerta no lleva a la compra');
});

ok('crecer.html  . la puerta va tras el plan CONFIRMADO, no tras el cache', () => {
  /* La FASE 1 pinta con el plan cacheado. Cerrar alli expulsaria a un premium
     con el cache frio de su propia pagina: el fallo tiene que ser retrasar, */
  /* nunca expulsar. */
  const iF3 = CRE.indexOf('FASE 3');
  const iPuerta = CRE.indexOf("if (!canAccessModo('mapa', realPlan)) {");
  if (iF3 < 0 || iPuerta < 0) throw new Error('no se encuentran las dos marcas');
  if (iPuerta < iF3)
    throw new Error('la puerta corre antes de confirmar el plan contra Firestore');
  if (!CRE.includes("if (_cPlan !== 'free') {"))
    throw new Error('la FASE 1 pinta el mapa aunque el cache diga free');
});

ok('el candado y la puerta se pusieron a la vez', () => {
  /* Un candado sin puerta detras es el defecto que el mapa ya arrastraba con
     sus quince nodos decorativos. Si alguien quita una, esto salta. */
  const pu = leer('plan-utils.js');
  if (!pu.includes('function marcarCrecerSiFree'))
    throw new Error('no existe el candado de la pestana');
  if (!CRE.includes("if (!canAccessModo('mapa', realPlan)) {"))
    throw new Error('hay candado pero no hay puerta');
});

HUB.concat(['hoy.html']).forEach(f => {
  ok(f.padEnd(12) + '. su pestana Crecer esta identificada para el candado', () => {
    if (!norm(leer(f)).includes('id="nav-crecer"'))
      throw new Error('sin id, el candado no la encuentra');
  });
});

ok('crecer.html  . un Misterio pendiente no abre el popup de modos', () => {
  /* El camino se VE, no se salta: lo pendiente pertenece a Hoy. En un Nivel ya
     cruzado no hay pendientes, asi que solo alcanza al Nivel en curso. */
  if (!CRE.includes('if (!hecho) { _pendienteEsDeHoy(); return; }'))
    throw new Error('el nodo pendiente sigue abriendo el popup');
  if (!CRE.includes('function _pendienteEsDeHoy()'))
    throw new Error('falta el aviso que explica a donde va');
});

ok('rezar.html   . la puerta del dia ya cubre el Nivel en curso', () => {
  /* Se pudo cerrar del todo cuando el mapa dejo de ofrecerlo: hasta entonces
     habria hecho rebotar los nodos del mapa con los beta dentro. */
  if (!REZ.includes('||!_nivelCruzado()'))
    throw new Error('el enlace escrito a mano sigue saltandose el dia');
});
console.log('\n' + '─'.repeat(64));
if (fallos) {
  console.log('  ✗ ' + fallos + ' fallo(s), ' + pasos + ' pasada(s)');
  console.log('─'.repeat(64) + '\n');
  process.exit(1);
}
console.log('  TODO VERDE — ' + pasos + ' pruebas');
console.log('─'.repeat(64) + '\n');
