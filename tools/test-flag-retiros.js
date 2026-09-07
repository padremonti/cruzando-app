/* ══════════════════════════════════════════════════════════════════════
   Banco de pruebas — flag MOSTRAR_RETIROS (El Santuario, bajo desarrollo)

   Corre flags.js y plan-utils.js DE VERDAD dentro de un vm con un DOM de
   mentira, y audita las páginas que tenían una entrada a los Retiros.

   Lo que vigila:
     · que apagado cierre la puerta a premium, beta y free — y SOLO a ellos:
       el developer sigue entrando, porque es quien lo está construyendo
     · que el "ver como free" del developer también la cierre: es justo para
       lo que existe ese botón
     · que encender lo devuelva todo intacto, sin tocar ningún otro archivo
     · que no quede ninguna entrada muerta: pestaña, puerta del hub, banner,
       filtro del Diario, interstitials, cofre del mapa, argumentario de pago
     · que NADA se haya borrado — ni el código ni los datos de Firestore

   Correr:  node tools/test-flag-retiros.js
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

const FLAGS  = leer('flags.js');
const PUTILS = leer('plan-utils.js');

let fallos = 0, pasos = 0;
function ok(nombre, fn) {
  try { fn(); console.log('  ' + String.fromCharCode(10003) + ' ' + nombre); pasos++; }
  catch (e) { console.log('  ' + String.fromCharCode(10007) + ' ' + nombre + '\n      ' + e.message); fallos++; }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') +
    '\n      esperado: ' + JSON.stringify(b) + '\n      recibido: ' + JSON.stringify(a));
}

/* ── DOM y almacenes de mentira ─────────────────────────────────────── */
function almacen(inicial) {
  const m = Object.assign({}, inicial || {});
  return {
    getItem: k => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; },
    _crudo: m
  };
}

function navItem(cfg) {
  const attrs = {};
  return {
    id: cfg.id || '',
    className: cfg.clase,
    textContent: cfg.texto,
    style: { display: '' },
    getAttribute: k => (k === 'onclick' ? (cfg.onclick || null) : (attrs[k] || null)),
    setAttribute: (k, v) => { attrs[k] = v; },
    removeAttribute: k => { delete attrs[k]; },
    _attrs: attrs
  };
}

/* La barra real, tal como la escriben las páginas: cada una a su manera. */
function barra() {
  return [
    navItem({ clase: 'app-nav-item', texto: 'Hoy',     onclick: "navTap(this); goTo('hoy.html')" }),
    navItem({ clase: 'app-nav-item', texto: 'Sanar',   onclick: "navTap(this); navigateTo('sanar.html')" }),
    navItem({ clase: 'app-nav-item', texto: 'Crecer',  onclick: "navTap(this); navigateTo('crecer.html')" }),
    // index.html: sin retiros.html en el onclick — se reconoce por el id
    navItem({ clase: 'app-nav-item', texto: 'Retiros', id: 'nav-sanar-btn', onclick: 'abrirSanar(this)' }),
    navItem({ clase: 'app-nav-item', texto: 'Diario',  onclick: "navTap(this); goTo('diario.html')" }),
    navItem({ clase: 'app-nav-item', texto: 'Cantos',  onclick: "navTap(this); goTo('cantos.html')" }),
    // world.html: otra clase y otro gesto
    navItem({ clase: 'nav-item',     texto: 'Retiros', onclick: "location.href='retiros.html'" })
  ];
}

/* Monta flags.js + plan-utils.js en un mundo con el plan y el flag dados. */
function mundo(op) {
  op = op || {};
  const items = op.items || barra();
  const ctx = {
    console,
    sessionStorage: almacen(op.verComo ? { cruzando_view_as: op.verComo } : {}),
    localStorage:   almacen(op.cache   ? { cruzando_plan_cache: op.cache } : {}),
    document: {
      readyState: 'complete',
      addEventListener() {},
      getElementById: () => null,
      querySelectorAll: sel => (sel.indexOf('nav-item') >= 0 ? items : [])
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(FLAGS, ctx, { filename: 'flags.js' });
  vm.runInContext(PUTILS, ctx, { filename: 'plan-utils.js' });
  if (op.flag === true) ctx.window.MOSTRAR_RETIROS = true;
  if (op.currentPlan)   ctx.window.currentPlan = op.currentPlan;
  ctx._items = items;
  return ctx;
}

console.log('\n' + String.fromCharCode(9472, 9472) + ' La puerta: quien entra y quien no ' + String.fromCharCode(9472, 9472));

ok('apagado · free, premium y beta NO ven los Retiros', () => {
  ['free', 'premium', 'beta'].forEach(p => {
    eq(mundo({ cache: p }).window.retirosON(), false, 'plan ' + p);
    eq(mundo({ cache: p }).window.canAccessModo('retiros', p), false, 'canAccessModo ' + p);
  });
});

ok('apagado · el developer SI entra: es quien lo esta construyendo', () => {
  const w = mundo({ cache: 'developer' }).window;
  eq(w.retirosON(), true);
  eq(w.canAccessModo('retiros', 'developer'), true);
});

ok('apagado · el "ver como" del developer tambien cierra la puerta', () => {
  /* Es justo para lo que existe ese boton: comprobar que recibe un usuario
     real. Un developer mirando como free no puede ver mas que el free. */
  ['free', 'premium'].forEach(p => {
    const w = mundo({ cache: 'developer', verComo: p }).window;
    eq(w.retirosON(), false, 'ver como ' + p);
  });
  eq(mundo({ cache: 'free', verComo: 'developer' }).window.retirosON(), true,
     'ver como developer si abre');
});

ok('encendido · vuelve a mandar el plan, sin tocar nada mas', () => {
  eq(mundo({ flag: true, cache: 'free'    }).window.canAccessModo('retiros', 'free'),    false);
  eq(mundo({ flag: true, cache: 'premium' }).window.canAccessModo('retiros', 'premium'), true);
  eq(mundo({ flag: true, cache: 'beta'    }).window.canAccessModo('retiros', 'beta'),    true);
  eq(mundo({ flag: true, cache: 'free'    }).window.retirosON(), true, 'retirosON abre para todos');
});

ok('una pagina que olvide flags.js deja los Retiros CERRADOS', () => {
  /* Falla del lado seguro, igual que recompensasON: sin el archivo el valor es
     undefined, y `=== true` lo lee como apagado. Nunca al reves. */
  const ctx = { console, localStorage: almacen(), sessionStorage: almacen(), document: { getElementById: () => null } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(PUTILS, ctx, { filename: 'plan-utils.js' });
  eq(ctx.window.MOSTRAR_RETIROS, undefined, 'sin flags.js no hay flag');
  eq(ctx.window.canAccessModo('retiros', 'premium'), false);
  eq(ctx.window.canAccessModo('retiros', 'developer'), true, 'el developer no depende del flag');
});

ok('el flag NO toca ningun otro modo', () => {
  const w = mundo({ cache: 'premium' }).window;
  [['audio', 'free', true], ['cantos', 'free', true], ['diario', 'free', true],
   ['sanar', 'free', true], ['mapa', 'free', true], ['libro', 'free', false],
   ['rezar', 'free', false], ['escribir', 'free', false], ['extras', 'free', false],
   ['libro', 'premium', true], ['rezar', 'premium', true], ['extras', 'premium', true]
  ].forEach(caso => eq(w.canAccessModo(caso[0], caso[1]), caso[2], caso[0] + ' / ' + caso[1]));
});

ok('MOSTRAR_RECOMPENSAS sigue siendo otro interruptor', () => {
  const w = mundo({ cache: 'developer' }).window;
  eq(w.MOSTRAR_RECOMPENSAS, false, 'las recompensas siguen apagadas');
  eq(w.recompensasON(), false, 'y el developer NO las abre: ese flag no tiene excepcion');
  eq(w.retirosON(), true, 'el de Retiros si');
});

console.log('\n' + String.fromCharCode(9472, 9472) + ' La pestana: se retira, no se atenua ' + String.fromCharCode(9472, 9472));

ok('apagado · las DOS formas de escribir la pestana desaparecen', () => {
  const ctx = mundo({ cache: 'free' });
  ctx.window.aplicarNavRetiros();
  const ret = ctx._items.filter(i => i.textContent === 'Retiros');
  eq(ret.length, 2, 'la barra de prueba tiene las dos formas');
  ret.forEach(i => {
    eq(i.style.display, 'none', 'sigue visible');
    eq(i._attrs['aria-hidden'], 'true', 'sin aria-hidden');
  });
});

ok('apagado · se retira ENTERA: nunca atenuada', () => {
  /* Un boton al 35% sigue siendo un boton, y detras no hay nada que ensenar.
     Es la misma regla que se aplico a las flechas del free en audio. */
  const ctx = mundo({ cache: 'free' });
  ctx.window.aplicarNavRetiros();
  const i = ctx._items.filter(x => x.textContent === 'Retiros')[0];
  eq(i.style.opacity, undefined, 'la atenua en vez de retirarla');
});

ok('apagado · las otras cinco pestanas no se tocan', () => {
  const ctx = mundo({ cache: 'free' });
  ctx.window.aplicarNavRetiros();
  const otras = ctx._items.filter(i => i.textContent !== 'Retiros');
  eq(otras.length, 5);
  otras.forEach(i => eq(i.style.display, '', i.textContent + ' desaparecio'));
});

ok('encendido · la pestana esta, y para el developer tambien', () => {
  [mundo({ flag: true, cache: 'free' }), mundo({ cache: 'developer' })].forEach(ctx => {
    ctx.window.aplicarNavRetiros();
    ctx._items.filter(i => i.textContent === 'Retiros')
      .forEach(i => eq(i.style.display, '', 'la pestana falta'));
  });
});

ok('es de DOS sentidos: el plan llega corregido y la pestana vuelve', () => {
  /* En el arranque el plan sale del cache y puede llegar corregido despues
     (index y crecer repintan al resolver Auth). Un developer con el cache frio
     tiene que recuperar su pestana sin recargar. */
  const ctx = mundo({ cache: 'free' });
  ctx.window.aplicarNavRetiros();
  const i = ctx._items.filter(x => x.textContent === 'Retiros')[0];
  eq(i.style.display, 'none');
  ctx.window.currentPlan = 'developer';
  ctx.window.aplicarNavRetiros();
  eq(i.style.display, '', 'no volvio al confirmarse el plan');
  eq(i._attrs['aria-hidden'], undefined, 'se quedo el aria-hidden');
});

ok('sin DOM no revienta (banco de pruebas, worker, prerender)', () => {
  const ctx = { console, localStorage: almacen(), sessionStorage: almacen() };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(FLAGS, ctx, { filename: 'flags.js' });
  ctx.window.aplicarNavRetiros();   // no debe lanzar
  eq(typeof ctx.window.retirosON, 'function');
});

console.log('\n' + String.fromCharCode(9472, 9472) + ' Las paginas: ninguna entrada muerta ' + String.fromCharCode(9472, 9472));

const CON_PESTANA = ['index.html', 'crecer.html', 'hoy.html', 'cantos.html',
                     'diario.html', 'extras.html', 'sanar.html', 'world.html'];

CON_PESTANA.forEach(f => {
  ok(f.padEnd(12) + ' · lleva la pestana Retiros Y carga flags.js', () => {
    const src = leer(f);
    if (!/retiros\.html|nav-sanar-btn/.test(src))
      throw new Error('ya no tiene entrada a los Retiros: revisar esta lista');
    if (!/<script src="flags\.js"><\/script>/.test(src))
      throw new Error('no carga flags.js, asi que la pestana se le queda visible');
  });
});

['retiros.html', 'rezar_taller.html'].forEach(f => {
  ok(f.padEnd(16) + ' · guarda de puerta trasera antes de pintar', () => {
    const src = leer(f);
    if (!/<script src="flags\.js"><\/script>/.test(src))
      throw new Error('no carga flags.js');
    if (!/window\.retirosON && window\.retirosON\(\)\) return;/.test(src))
      throw new Error('no tiene la guarda del flag');
    if (!/location\.replace/.test(src))
      throw new Error('la guarda no devuelve al camino');
    /* Antes de pintar nada: la guarda va al tope del <body>, no al final. */
    const iBody   = src.indexOf('<body');
    const iGuarda = src.indexOf('window.retirosON && window.retirosON()) return;');
    const iShell  = src.indexOf('<div class="shell"');
    if (!(iBody < iGuarda && iGuarda < iShell))
      throw new Error('la guarda no corre antes del contenido');
  });
});

ok('retiros.js conserva su puerta de plan, para el dia que se encienda', () => {
  if (!/requirePremiumAccess\('retiros'/.test(leer('retiros.js')))
    throw new Error('se perdio la puerta de plan del catalogo');
});

ok('index.html  · la puerta del hub y su panel se retiran enteros', () => {
  const src = leer('index.html');
  if (!/window\._pintarSantuario = function/.test(src))
    throw new Error('no existe _pintarSantuario');
  ['door-santuario', 'rv-santuario', 'premium-feature-retiros'].forEach(id => {
    if (src.indexOf("'" + id + "'") < 0) throw new Error('no retira ' + id);
  });
  if (!/if \(window\._pintarSantuario\) window\._pintarSantuario\(\);/.test(src))
    throw new Error('renderHome no lo repinta al resolver el plan');
});

ok('index.html  · no se lee `talleres` si no hay a quien avisar', () => {
  const src = leer('index.html');
  const i = src.indexOf('verificarRetiroEnProgreso(user.uid)');
  if (i < 0) throw new Error('desaparecio la llamada');
  const antes = src.slice(Math.max(0, i - 300), i);
  if (!/window\.retirosON && window\.retirosON\(\)/.test(antes))
    throw new Error('se sigue consultando talleres con el Santuario apagado');
});

ok('index.html  · las cuatro puertas de codigo llevan cinturon', () => {
  const src = leer('index.html');
  ['window.abrirSanar = function', 'window.retomarRetiro = function',
   'window.abrirModalTaller = function', 'window.activarSenalTaller = function'
  ].forEach(firma => {
    const i = src.indexOf(firma);
    if (i < 0) throw new Error('falta ' + firma);
    const cuerpo = src.slice(i, i + 420);
    if (!/window\.retirosON && !window\.retirosON\(\)/.test(cuerpo))
      throw new Error(firma + ' entra al Santuario con el flag apagado');
  });
});

['index.html', 'crecer.html'].forEach(f => {
  ok(f.padEnd(12) + ' · el argumentario de PAGO no promete Retiros', () => {
    const src = leer(f);
    if (/y los Retiros del Santuario<\/div>/.test(src))
      throw new Error('la linea sigue sin poder retirarse: los Retiros van pegados a Sanar');
    if (!/id="premium-feature-retiros"/.test(src))
      throw new Error('la linea de los Retiros no es gateable');
  });
});

ok('crecer.html · repinta pestana y argumentario al resolver el plan', () => {
  const src = leer('crecer.html');
  if (!/if \(window\.aplicarNavRetiros\) window\.aplicarNavRetiros\(\);/.test(src))
    throw new Error('no repinta la pestana');
  if (!/premium-feature-retiros/.test(src)) throw new Error('no repinta el argumentario');
});

ok('diario.html · se retira el filtro, NUNCA lo ya escrito', () => {
  const src = leer('diario.html');
  if (!/_pintarFiltroRetiros\(\);/.test(src))
    throw new Error('no se llama al pintado del filtro');
  if (!/filtroOrigen === 'retiro'\) setFiltro\('todas'\)/.test(src))
    throw new Error('un filtro ya puesto en Retiros se queda mostrando vacio');
  /* Lo YA escrito se sigue viendo bajo «Todas», con su chip: un flag de
     presentacion no borra el camino de nadie. */
  if (!/chip-retiro/.test(src))
    throw new Error('se borro el chip de las entradas de retiro ya escritas');
  if (!/origen === 'taller' \|\| r\.origen === 'evaluacion_taller'/.test(src))
    throw new Error('se borro la lectura de las entradas de retiro');
});

ok('cantos.html · la rotacion salta los tres anuncios de retiros', () => {
  const src = leer('cantos.html');
  if (!/_INTERSTITIAL_RETIROS = \[4, 5, 6\]/.test(src))
    throw new Error('no esta la lista de vetados');
  /* Los tres indices tienen que ser los tres textos de retiro, ni uno mas ni
     uno menos: el .mp3 va pareado por indice, y saltar el que no toca dejaria
     un audio hablando de otra cosa. */
  const ini = src.indexOf('var INTERSTITIAL_TEXTS = [');
  const fin = src.indexOf('\n];', ini);
  if (ini < 0 || fin < 0) throw new Error('no encuentro la lista de textos');
  const textos = src.slice(ini, fin).split(/\n  \/\/ \d\d /).slice(1);
  eq(textos.length, 10, 'ya no son diez interstitials: revisar la lista de vetados');
  const conRetiro = [];
  textos.forEach((t, i) => { if (/encontrarás el retiro/.test(t)) conRetiro.push(i); });
  eq(JSON.stringify(conRetiro), '[4,5,6]', 'los vetados no son los que anuncian retiros');
});

ok('cantos.html · la rotacion no gira para siempre', () => {
  /* Si alguien vetara los diez, _getInterstitialIdx tiene que devolver uno,
     no colgarse. La cota es una vuelta entera. */
  const src = leer('cantos.html');
  if (!/for \(var i = 0; i < INTERSTITIAL_TOTAL && _interstitialVetado\(next\); i\+\+\)/.test(src))
    throw new Error('el bucle de salto no tiene cota');
});

ok('world.js    · el cofre no ofrece un retiro que no existe', () => {
  const src = leer('world.js');
  if (!/if \(santuario && window\.retirosON && window\.retirosON\(\)\)/.test(src))
    throw new Error('el cofre sigue pintando la entrada al Santuario');
  const i = src.indexOf('window.tapSantuario = function');
  if (!/window\.retirosON && !window\.retirosON\(\)/.test(src.slice(i, i + 200)))
    throw new Error('tapSantuario navega con el flag apagado');
});

console.log('\n' + String.fromCharCode(9472, 9472) + ' Apagar no es borrar ' + String.fromCharCode(9472, 9472));

ok('el codigo de los Retiros sigue entero', () => {
  ['retiros.html', 'retiros.js', 'rezar_taller.html'].forEach(f => {
    if (!fs.existsSync(path.join(RAIZ, f))) throw new Error('desaparecio ' + f);
  });
  if (!/santuario_index\.json/.test(leer('retiros.js')))
    throw new Error('el catalogo ya no lee sus datos');
  if (!/exports\.evaluarRetiro/.test(leer('functions/index.js')))
    throw new Error('se toco la callable del servidor');
});

ok('los datos de Firestore no se tocaron', () => {
  if (!/match \/talleres\/\{doc\}\s+\{ allow read, write: if isOwner\(uid\); \}/.test(leer('firestore.rules')))
    throw new Error('cambiaron las reglas de talleres');
});

console.log('\n' + String.fromCharCode(9472, 9472) + ' Los documentos legales dicen la verdad ' + String.fromCharCode(9472, 9472));

// evaluarRetiro es la UNICA funcion de la App que manda texto del usuario a un
// modelo de IA, y solo la llama retiros.js. Con el flag apagado no sale nada, y
// por eso los Terminos y la Politica afirman que nada sale.
//
// El dia que MOSTRAR_RETIROS se ponga en true eso deja de ser cierto: la App
// empezaria a enviar a OpenAI lo que la persona escribio, mientras su Politica
// de Privacidad promete lo contrario. Es la clase de divergencia que no falla a
// la vista, asi que esta prueba la ata al interruptor.
ok('la promesa de "nada se envia a una IA" va atada al flag', () => {
  const encendido = /window\.MOSTRAR_RETIROS\s*=\s*true/.test(leer('flags.js'));
  const terminos  = leer('terminos.html');
  const privacid  = leer('privacidad.html');

  // Lo que dicen HOY los documentos, sin contar los comentarios HTML que
  // explican que hay que restaurar.
  const sinComentarios = s => s.replace(/<!--[\s\S]*?-->/g, '');
  const tNiega = /Nada de lo que escribas se env(i|í)a a servicios de inteligencia artificial/
                   .test(sinComentarios(terminos));
  const pNiega = /Ning(u|ú)n texto tuyo se env(i|í)a a un modelo de inteligencia artificial/
                   .test(sinComentarios(privacid));
  const pDeclara = /OpenAI/.test(sinComentarios(privacid));

  if (!encendido) {
    if (!tNiega) throw new Error('terminos.html ya no afirma que nada se envia a una IA, pero el flag sigue apagado');
    if (!pNiega) throw new Error('privacidad.html ya no afirma que nada se envia a una IA, pero el flag sigue apagado');
    if (pDeclara) throw new Error('privacidad.html declara OpenAI como encargado y no se le transfiere nada');
    return;
  }

  // Flag encendido: la App SI envia, asi que los documentos tienen que decirlo.
  if (tNiega)
    throw new Error('MOSTRAR_RETIROS esta en true y terminos.html sigue prometiendo que nada se envia a una IA');
  if (pNiega)
    throw new Error('MOSTRAR_RETIROS esta en true y privacidad.html sigue prometiendo que nada se envia a una IA');
  if (!pDeclara)
    throw new Error('MOSTRAR_RETIROS esta en true y privacidad.html no declara a OpenAI como encargado');
});

console.log('\n' + String.fromCharCode(9472).repeat(64));
console.log(fallos === 0
  ? '  TODO VERDE — ' + pasos + ' pruebas'
  : '  ' + fallos + ' FALLO(S) de ' + (pasos + fallos));
console.log(String.fromCharCode(9472).repeat(64) + '\n');
process.exit(fallos === 0 ? 0 : 1);
