/* ══════════════════════════════════════════════════════════════════════
   Banco de pruebas — la vuelta del Rosario

   Rezar cinco Misterios de un bloque es un Rosario, y rezar el Rosario es una
   COSTUMBRE: se repite. El avance temático (`progress`) solo ocurre una vez,
   pero el acto piadoso vuelve. Hasta ahora la animación colgaba del avance —
   del bonus en audio, del `dots.every(Boolean)` en orar y rezar, y los dos
   corren UNA sola vez en la vida— así que el Rosario solo se veía la primera.

   Y solo cuenta lo REZADO. Quien pasa páginas en el Libro avanza en `progress`
   pero no llena la vuelta: la prueba es la guarda del decenario, que las
   páginas comprueban antes de llamar a marcar().

   Correr:  node tools/test-vuelta.js
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
const almacen = {};
const ctx = { localStorage: {
  getItem: k => (k in almacen ? almacen[k] : null),
  setItem: (k, v) => { almacen[k] = String(v); },
} };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(leer('rosario.js'), ctx);
const R = ctx.window.Rosario;

const rezar = (estado, bloque, n) => {
  let e = estado, ult = null;
  for (let i = 0; i < n; i++) { ult = R.marcar(e, bloque, i, 1000 + i); e = ult.estado; }
  return ult;
};

console.log('\n── Cinco decenas rezadas son un Rosario ──');

ok('cuatro no bastan; la quinta lo cierra', () => {
  let e = R.normalizar(null);
  for (let i = 0; i < 4; i++) {
    const r = R.marcar(e, 'gozosos', i, 1); e = r.estado;
    if (r.rosario) throw new Error('se cerró en la decena ' + (i + 1));
  }
  if (!R.marcar(e, 'gozosos', 4, 1).rosario) throw new Error('la quinta no lo cerró');
});

ok('al cerrarse, la vuelta del bloque vuelve a empezar', () => {
  const r = rezar(R.normalizar(null), 'gozosos', 5);
  eq(r.estado.vuelta.gozosos, [null, null, null, null, null], 'la vuelta no se reinició');
  eq(r.estado.rosarios.gozosos, 1);
});

ok('SE REPITE: la segunda vuelta también celebra', () => {
  /* Esto es lo que estaba roto: el rito colgaba del avance, que solo ocurre una
     vez. Rezar otra vez los cinco gozosos tiene que volver a cerrarlos. */
  const e = rezar(R.normalizar(null), 'gozosos', 5).estado;
  const seg = rezar(e, 'gozosos', 5);
  if (!seg.rosario) throw new Error('la segunda vuelta no celebra');
  eq(seg.estado.rosarios.gozosos, 2);
});

ok('un Rosario son cinco decenas DISTINTAS', () => {
  /* Rezar nueve veces el tercer Misterio llena un hueco, no nueve. */
  let e = R.normalizar(null);
  for (let k = 0; k < 9; k++) e = R.marcar(e, 'luminosos', 2, 1).estado;
  eq(e.rosarios.luminosos, 0, 'repetir el mismo Misterio cerró un Rosario');
});

ok('mezclar bloques no cuenta como Rosario', () => {
  /* Decisión de producto: un Rosario es un SET. Dos gozosos y tres luminosos
     dejan dos vueltas a medias, no un Rosario. */
  let e = R.normalizar(null);
  e = R.marcar(e, 'gozosos', 0, 1).estado;
  e = R.marcar(e, 'gozosos', 1, 1).estado;
  e = R.marcar(e, 'luminosos', 0, 1).estado;
  e = R.marcar(e, 'luminosos', 1, 1).estado;
  if (R.marcar(e, 'luminosos', 2, 1).rosario)
    throw new Error('cerró un Rosario cruzando bloques');
});

console.log('\n── La vuelta del Nivel son los veinte ──');

ok('los cuatro bloques cierran la vuelta del Nivel', () => {
  let e = R.normalizar(null), ult = null;
  R.BLOQUES.forEach(b => { ult = rezar(e, b, 5); e = ult.estado; });
  if (!ult.vuelta) throw new Error('los veinte no cerraron la vuelta');
  eq(ult.numero, 1);
});

ok('tres bloques no la cierran', () => {
  let e = R.normalizar(null), ult = null;
  ['gozosos', 'luminosos', 'dolorosos'].forEach(b => { ult = rezar(e, b, 5); e = ult.estado; });
  if (ult.vuelta) throw new Error('cerró la vuelta con quince Misterios');
  eq(R.vueltas(e), 0);
});

ok('la vuelta es el MÍNIMO, no la suma', () => {
  /* Rezar tres veces los gozosos y ninguna vez el resto no es haber recorrido
     el Nivel. min(rosarios) da la respuesta sin contadores auxiliares. */
  let e = R.normalizar(null);
  for (let k = 0; k < 3; k++) e = rezar(e, 'gozosos', 5).estado;
  eq(R.vueltas(e), 0);
  R.BLOQUES.slice(1).forEach(b => { e = rezar(e, b, 5).estado; });
  eq(R.vueltas(e), 1, 'con una vuelta de cada bloque debería ser 1');
});

ok('la segunda vuelta del Nivel también se reconoce', () => {
  let e = R.normalizar(null), ult = null;
  R.BLOQUES.forEach(b => { ult = rezar(e, b, 5); e = ult.estado; });
  R.BLOQUES.forEach(b => { ult = rezar(e, b, 5); e = ult.estado; });
  if (!ult.vuelta) throw new Error('la segunda vuelta del Nivel no se reconoce');
  eq(ult.numero, 2);
});

console.log('\n── No revienta con datos a medias ──');

ok('documento ausente, vacío o con basura', () => {
  [null, undefined, {}, { vuelta: 'no soy un objeto' }, { rosarios: { gozosos: -3 } },
   { vuelta: { gozosos: [1, 2] } }].forEach(d => {
    const e = R.normalizar(d);
    R.BLOQUES.forEach(b => {
      if (e.vuelta[b].length !== 5) throw new Error('vuelta mal normalizada');
      if (!(e.rosarios[b] >= 0)) throw new Error('rosarios mal normalizado');
    });
  });
});

ok('un bloque o un índice inventados no hacen nada', () => {
  const e = R.normalizar(null);
  eq(R.marcar(e, 'inventados', 0, 1).rosario, false);
  eq(R.marcar(e, 'gozosos', 9, 1).rosario, false);
  eq(R.marcar(e, 'gozosos', -1, 1).rosario, false);
});

console.log('\n── Dos dispositivos, una vuelta ──');

ok('fusionar toma lo más avanzado', () => {
  const a = R.marcar(R.normalizar(null), 'gozosos', 0, 1).estado;
  const b = R.marcar(R.normalizar(null), 'gozosos', 3, 1).estado;
  const f = R.fusionar(a, b);
  if (!f.vuelta.gozosos[0] || !f.vuelta.gozosos[3])
    throw new Error('perdió una decena rezada en otro aparato');
});

ok('quien va por otra vuelta manda sobre la anterior', () => {
  /* Si un aparato ya cerró más Rosarios, su vuelta EN CURSO es la buena: la del
     otro pertenece a una vuelta anterior, y fusionarlas adelantaría huecos que
     no se rezaron en esta. */
  const viejo = R.marcar(R.normalizar(null), 'gozosos', 2, 1).estado;
  let nuevo = rezar(R.normalizar(null), 'gozosos', 5).estado;
  nuevo = R.marcar(nuevo, 'gozosos', 0, 1).estado;
  const f = R.fusionar(viejo, nuevo);
  eq(f.rosarios.gozosos, 1);
  eq(f.vuelta.gozosos[2], null, 'arrastró un hueco de la vuelta anterior');
});

console.log('\n── El espejo local ──');

ok('guardar y leer sobrevive a un JSON roto', () => {
  R.guardarLocal('0101', rezar(R.normalizar(null), 'dolorosos', 5).estado);
  eq(R.leerLocal('0101').rosarios.dolorosos, 1);
  almacen['cruzando_vuelta_0102'] = '{roto';
  eq(R.leerLocal('0102').rosarios.gozosos, 0, 'un JSON roto debería degradar a vacío');
});

console.log('\n── Cableado en las tres páginas ──');

const MODOS = ['audio.html', 'orar.html', 'rezar.html'];
const cuerpoRosario = s =>
  (s.match(/function mostrarRosario\([^)]*\)\s*\{[\s\S]*?\n\}/) || [''])[0];

MODOS.forEach(f => {
  ok(f.padEnd(13) + '· marca la vuelta donde la guarda dice que sí', () => {
    /* La guarda del decenario ES la prueba de rezo: once cuentas y la Cruz
       encendida solo ocurren si la última ventana de bead_sync pasó con el
       audio sonando. Marcar ahí —y no al resolverse la animación— evita además
       la carrera con el final de sesión en rezar, donde no se espera. */
    const s = leer(f).replace(/\s/g, '');
    const i = s.indexOf('decenaCompleta(foto))returnPromise.resolve(false);');
    if (i === -1) throw new Error('no encontré la guarda del decenario');
    const j = s.indexOf('marcarVuelta(', i);
    const k = s.indexOf('Cierre.decenario({', i);
    if (j === -1) throw new Error('no marca la vuelta');
    if (!(j < k)) throw new Error('marca la vuelta después de lanzar la animación');
  });

  ok(f.padEnd(13) + '· el Rosario ya no cuelga del premio', () => {
    const c = cuerpoRosario(leer(f));
    if (!/_rosarioPendiente/.test(c)) throw new Error('no consulta la vuelta');
    if (/METERS_BLOCK_BONUS|MR_BNS/.test(c))
      throw new Error('el rito vuelve a decidirse por el bonus');
  });

  ok(f.padEnd(13) + '· el pie no promete metros que no hubo', () => {
    /* Los metros ordinarios se ganan cada vez (premium); el bonus de primera
       vez, una sola. Cuando la vuelta se cierra de nuevo no hay bonus, y el pie
       no puede pintar una cifra. */
    const s = leer(f);
    if (!/_rosarioMetros/.test(s))
      throw new Error('no separa la cifra del bonus de la decisión de mostrar');
    if (!/_rosarioMetros/.test(cuerpoRosario(s)))
      throw new Error('el pie no toma la cifra real de la sesión');
  });

  ok(f.padEnd(13) + '· el Rosario nombra su bloque', () => {
    if (!/NOMBRES_BLOQUE/.test(cuerpoRosario(leer(f))))
      throw new Error('sigue diciendo solo "Rosario recorrido", sin decir cuál');
  });

  ok(f.padEnd(13) + '· el rosetón calla el reconocimiento', () => {
    /* El rosetón es el HITO y manda: no se comparte el primer recorrido con el
       aviso de haberlo repetido. */
    /* Se comprueba la GUARDA, no la posición en el archivo: en audio la
       cadena usa `.then(mostrarRoseton)` sin paréntesis, y la definición de
       mostrarVuelta va antes que la del rosetón. */
    const s = leer(f).replace(/\s/g, '');
    const g = s.indexOf('_vueltaPendiente=false;');
    if (g === -1) throw new Error('la vuelta podría salir encima del rosetón');
    if (s.indexOf('mostrarVuelta()', g) === -1)
      throw new Error('la guarda no precede a la llamada del reconocimiento');
    if (s.indexOf('mostrarRoseton') === -1) throw new Error('falta el rosetón en la cadena');
  });

  ok(f.padEnd(13) + '· carga los módulos de la vuelta', () => {
    const s = leer(f);
    ['rosario.js', 'vuelta.js', 'vuelta.css'].forEach(m => {
      if (!s.includes(m)) throw new Error('no carga ' + m);
    });
  });

  ok(f.padEnd(13) + '· lo escrito va al diario, no a reflections', () => {
    /* Una reflexión está atada a un Misterio y a una pregunta numerada del
       cuaderno. Esto no lo está: es sobre el recorrido entero. */
    const c = (leer(f).match(/function mostrarVuelta\(\)[\s\S]*?\n\}/) || [''])[0];
    if (!c) throw new Error('no existe mostrarVuelta');
    if (!/'diario'/.test(c)) throw new Error('no escribe en la colección diario');
    if (/reflections/.test(c)) throw new Error('escribe en reflections');
    if (!/origen:\s*'vuelta'/.test(c))
      throw new Error('sin origen: el diario no sabrá pintarlo');
  });
});

ok('mini.html    · NO participa de la vuelta', () => {
  /* Decisión de producto: mini es una unidad autocontenida y puntual. No suma
     al bloque ni al Nivel, y los Retiros futuros heredarán ese trato. */
  if (/rosario\.js|marcarVuelta|Rosario\.marcar/.test(leer('mini.html')))
    throw new Error('mini empezó a contar para la vuelta');
});

ok('diario.html  · sabe pintar una entrada de vuelta', () => {
  const s = leer('diario.html');
  if (!/origen === 'vuelta'/.test(s)) throw new Error('no distingue el origen');
  if (!/chip-vuelta/.test(s)) throw new Error('sin chip propio');
  if (!/nivelNombre/.test(s)) throw new Error('no mapea el nombre del Nivel');
});

ok('bloques.js   · es el origen único del nombre del bloque', () => {
  /* Estaba copiado cuatro veces y ya divergiendo: BFN en orar y rezar,
     BLOCK_NAMES en audio (¡en singular!) y BLOQUE_NAMES en diario. */
  if (!/window\.NOMBRES_BLOQUE/.test(leer('bloques.js')))
    throw new Error('NOMBRES_BLOQUE no vive en bloques.js');
  const c = { document: { documentElement: { style: { setProperty() {} } } } };
  c.window = c; vm.createContext(c);
  vm.runInContext(leer('bloques.js'), c);
  eq(c.window.NOMBRES_BLOQUE.gozosos, 'Misterios Gozosos');
  eq(Object.keys(c.window.NOMBRES_BLOQUE).length, 4);
});


// ══════════  La invitacion a escribir es de Premium  ══════════

{
  const VU = leer('vuelta.js');

  ok('vuelta · la regla se deriva en el módulo, no en los tres llamadores', () => {
    /* audio, orar y rezar comparten esta pantalla. Una regla que hay que
       recordar en tres sitios se olvida en uno — y el que se olvida es el que
       le regala a un free lo que no tiene, o se lo quita a quien sí. */
    if (!/function _soloLee\(opts\)/.test(VU))
      throw new Error('no hay derivación en el módulo');
    if (!/canAccessModo\('escribir'/.test(VU))
      throw new Error('no pregunta a la tabla de planes');
    ['audio.html', 'orar.html', 'rezar.html'].forEach(f => {
      const s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
      const i = s.indexOf('Vuelta.mostrar({');
      if (i < 0) throw new Error(f + ' dejó de mostrar la vuelta');
    });
  });

  ok('vuelta · sin plan-utils se puede escribir, como antes', () => {
    /* Degradar no puede quitarle nada a quien ya lo tenía: si la tabla no está
       cargada, la pantalla se comporta como se comportaba. */
    if (!/if \(typeof window === 'undefined' \|\| !window\.canAccessModo\) return false;/.test(VU))
      throw new Error('sin la tabla cargada la pantalla se cerraría de más');
  });

  ok('vuelta · se omite la invitación, NO el reconocimiento', () => {
    /* Lo que el free conserva entero: el kicker, el nombre del Nivel, la línea
       y la pregunta. Lo único que se va es el botón y la caja. */
    if (!/if \(!soloLee\) acciones\.appendChild\(bEscribir\);/.test(VU))
      throw new Error('el botón de escribir no está condicionado');
    if (!/if \(!soloLee\) velo\.appendChild\(caja\);/.test(VU))
      throw new Error('la caja de texto se sigue montando');
    ['vuelta-kicker', 'vuelta-linea', 'vuelta-pregunta'].forEach(c => {
      const re = new RegExp("appendChild\\(el\\('div', '" + c + "");
      if (!re.test(VU)) throw new Error('se perdió ' + c + ' del reconocimiento');
    });
  });

  ok('vuelta · sin oferta no hay nada que declinar', () => {
    /* "Ahora no" es una RESPUESTA a una invitación. Retirada la invitación,
       deja de tener sentido y el botón pasa a ser una salida: "Continuar". */
    if (!/soloLee \? 'Continuar' : 'Ahora no'/.test(VU))
      throw new Error("el botón sigue diciendo 'Ahora no' sin haber ofrecido nada");
    if (!/'vuelta-btn ' \+ \(soloLee \? 'primario' : 'discreto'\)/.test(VU))
      throw new Error('la única salida se quedó en discreta');
  });
}

console.log('\n' + '─'.repeat(64));
if (fallos) {
  console.log('  ✗ ' + fallos + ' fallo(s), ' + pasos + ' pasada(s)');
  console.log('─'.repeat(64) + '\n');
  process.exit(1);
}
console.log('  TODO VERDE — ' + pasos + ' pruebas');
console.log('─'.repeat(64) + '\n');
