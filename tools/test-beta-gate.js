/* Banco de pruebas de la puerta del grupo piloto (beta-gate.js).
 *
 * Vigila las tres cosas que, si se rompen, no fallan a la vista:
 *
 *  1. LA VERSIÓN. Está declarada en TRES sitios —el módulo, la callable y el
 *     propio documento, que además la muestra dos veces—. Si divergieran, la
 *     puerta entraría en BUCLE: la persona firmaría y en la siguiente carga se
 *     le volvería a pedir, sin que nada diera error. Es el mismo criterio de
 *     test-lrc-titulos.js con los 16 títulos: la sincronía no se confía a la
 *     disciplina, se comprueba.
 *
 *  2. QUE NINGUNA PÁGINA CON SESIÓN SE QUEDE SIN PUERTA. Son TRECE —el primer recuento a mano dijo doce y dejó
 *     rezar_taller.html fuera—, y una que
 *     se olvide es una puerta trasera: quien tenga audio.html en marcadores
 *     entraría al material del piloto sin firmar. Se derivan de lo que las
 *     páginas hacen —arrancar Auth—, no de una lista escrita a mano, para que
 *     una página nueva la haga fallar.
 *
 *  3. EL MÓDULO CORRE DE VERDAD, contra un DOM de mentira: que degrade en vez
 *     de encerrar, que no herede la firma de otra persona, y que el nombre que
 *     llega tarde no pise lo que se está escribiendo.
 *
 * Ejecutar:  node tools/test-beta-gate.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let ok = 0, fail = 0;
const fallos = [];
function t(nombre, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nombre); }
  catch (e) { fail++; fallos.push(nombre); console.log('  ✗ ' + nombre + '\n      ' + e.message); }
}
async function ta(nombre, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + nombre); }
  catch (e) { fail++; fallos.push(nombre); console.log('  ✗ ' + nombre + '\n      ' + e.message); }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error((msg || '') + ' esperado ' + JSON.stringify(b) + ', obtenido ' + JSON.stringify(a));
  }
}
function assert(c, msg) { if (!c) throw new Error(msg || 'assert falló'); }

// ── Las trece páginas que arrancan sesión ─────────────────────────────────────
// MODULARES: le pasan su E/S a la puerta (no tienen `firebase` global).
// COMPAT:    les basta el <script> — el módulo se engancha solo.
const MODULARES = ['index.html', 'crecer.html', 'audio.html', 'cantos.html'];
// ⚠️ rezar_taller.html es la TRECE, y se coló en el primer recuento a mano:
// arranca sesión (_auth.onAuthStateChanged) igual que las demás. Hoy está
// detrás de MOSTRAR_RETIROS, así que solo entra el developer —que está
// exento—, pero el día que El Santuario se encienda sería una puerta trasera.
// Es exactamente para esto que la última prueba de esta sección deriva la
// lista del código en vez de fiarse de la escrita aquí arriba.
const COMPAT    = ['hoy.html', 'orar.html', 'rezar.html', 'sanar.html',
                   'mini.html', 'diario.html', 'extras.html', 'retiros.html',
                   'rezar_taller.html'];
const CON_PUERTA = MODULARES.concat(COMPAT);

// world.html queda fuera a propósito: es INALCANZABLE (su único enlace vive en
// mostrarEsferas(), bajo recompensasON(), que está apagado). world.js sí
// arranca Auth, pero solo se carga desde esa página.
const EXENTAS = ['world.html'];

(async function () {

  // ══ 1 · La versión, en sus cuatro declaraciones ════════════════════════════
  console.log('\n── La versión vigente es UNA, esté escrita donde esté ──');

  const modulo    = leer('beta-gate.js');
  const funciones = leer('functions/index.js');
  const documento = leer('acuerdo-beta.html');

  const vModulo = (modulo.match(/VERSION_ACUERDO\s*=\s*'([^']+)'/) || [])[1];
  const vServer = (funciones.match(/VERSION_ACUERDO_BETA\s*=\s*'([^']+)'/) || [])[1];

  t('beta-gate.js declara una versión', () => assert(!!vModulo, 'no se encontró VERSION_ACUERDO'));
  t('la callable declara una versión',  () => assert(!!vServer, 'no se encontró VERSION_ACUERDO_BETA'));

  t('el cliente y el servidor exigen la MISMA versión', () => {
    eq(vModulo, vServer, 'si divergen, la puerta entra en bucle:');
  });

  // El documento la muestra DOS veces: la píldora de arriba y el pie. Dos
  // copias del mismo dato en el mismo archivo es justo la deriva que este repo
  // ya pagó con el color de bloque, así que se comprueban las dos.
  const enPildora = (documento.match(/Versión del acuerdo:\s*<strong>([^<]+)<\/strong>/) || [])[1];
  const enPie     = (documento.match(/·\s*Versión\s+([0-9][0-9.]*)\s*·/) || [])[1];

  t('acuerdo-beta.html declara su versión en la píldora', () => assert(!!enPildora, 'no se encontró'));
  t('acuerdo-beta.html declara su versión en el pie',     () => assert(!!enPie, 'no se encontró'));

  t('la píldora y el pie del documento coinciden entre sí', () => {
    eq((enPildora || '').trim(), (enPie || '').trim(), 'el documento se contradice:');
  });

  t('el documento dice la MISMA versión que el código', () => {
    eq((enPildora || '').trim(), vModulo,
       'se firmaría un documento distinto del que se registra:');
  });

  // ══ 2 · Ninguna página con sesión sin puerta ═══════════════════════════════
  console.log('\n── Las trece páginas que arrancan sesión tienen puerta ──');

  const TAG = /<script src="beta-gate\.js"><\/script>/;

  CON_PUERTA.forEach(function (p) {
    t(p.padEnd(13) + '· carga beta-gate.js', () => {
      assert(TAG.test(leer(p)), 'falta el <script>: sería una puerta trasera');
    });
  });

  MODULARES.forEach(function (p) {
    t(p.padEnd(13) + '· la llama con su propia E/S (es modular)', () => {
      const s = leer(p);
      assert(/function _puertaBeta\(/.test(s), 'falta el helper _puertaBeta');
      assert(/_puertaBeta\(user\)/.test(s),    'no se llama desde onAuthStateChanged');
      assert(/aceptaciones_beta/.test(s),      'no lee la firma');
      assert(/aceptarAcuerdoBeta/.test(s),     'no llama a la callable');
    });
  });

  COMPAT.forEach(function (p) {
    t(p.padEnd(13) + '· le basta el <script> (compat, se engancha solo)', () => {
      const s = leer(p);
      assert(!/function _puertaBeta\(/.test(s),
             'no debería cablearse a mano: el módulo se engancha por sí mismo');
      assert(/firebase-app-compat\.js/.test(s) || /firebase\.initializeApp/.test(s) ||
             /retiros\.js/.test(s),
             'se la trata como compat pero no carga el SDK compat');
    });
  });

  t('el velo retira al cerrar sesión en las cuatro modulares', () => {
    MODULARES.forEach(function (p) {
      assert(/BetaGate\.cerrar\(\)/.test(leer(p)),
             p + ': el velo se quedaría flotando sobre la pantalla de acceso');
    });
  });

  // Esta es la que hace que el banco NO se pudra: si mañana alguien añade una
  // página que arranque sesión y no le pone la puerta, aquí salta.
  t('no hay ninguna página con sesión fuera de la lista', () => {
    const todas = fs.readdirSync(RAIZ).filter(f => f.endsWith('.html'));
    const conAuth = todas.filter(function (f) {
      const s = leer(f);
      return /onAuthStateChanged/.test(s) && !/^acuerdo-beta\.html$/.test(f);
    });
    const huerfanas = conAuth.filter(f => CON_PUERTA.indexOf(f) < 0 && EXENTAS.indexOf(f) < 0);
    eq(huerfanas, [], 'páginas que arrancan sesión y no tienen puerta:');
  });

  t('la puerta NO corta el arranque en ninguna página', () => {
    CON_PUERTA.forEach(function (p) {
      const s = leer(p);
      // Un `await`/`return` sobre la puerta se saltaría el resto del arranque
      // —plan real, frontera, freeProgress, los localStorage del final— que es
      // el mecanismo que envenenó la frontera. Se llama y no se espera.
      assert(!/await\s+_puertaBeta/.test(s), p + ': no se puede esperar a la puerta');
      assert(!/return\s+_puertaBeta/.test(s), p + ': no se puede cortar el arranque con ella');
    });
  });

  // ══ 3 · La regla y la callable existen ════════════════════════════════════
  console.log('\n── El servidor es quien firma, y el cliente no puede escribir ──');

  t('firestore.rules declara aceptaciones_beta', () => {
    const r = leer('firestore.rules');
    assert(/match \/aceptaciones_beta\/\{uid\}/.test(r), 'sin regla, la lectura se deniega siempre');
  });

  t('el cliente NO puede escribir su propia firma', () => {
    const r = leer('firestore.rules');
    // El `{uid}` del propio match lleva llaves, así que el bloque empieza en
    // la llave de APERTURA que va después de la ruta, no en la primera que
    // aparezca.
    const bloque = r.slice(r.indexOf('match /aceptaciones_beta/{uid}'));
    const cierre = bloque.slice(0, bloque.indexOf('}', bloque.indexOf('{uid}') + 5));
    assert(/allow read:\s*if isOwner\(uid\)/.test(cierre), 'el dueño tiene que poder LEER lo suyo');
    assert(/allow write:\s*if false/.test(cierre),
           'una firma que el firmante puede borrar o editar no prueba nada');
  });

  t('la callable aceptarAcuerdoBeta está exportada', () => {
    assert(/exports\.aceptarAcuerdoBeta\s*=/.test(funciones), 'no está en functions/index.js');
  });

  t('el correo lo pone el SERVIDOR, no el cuerpo de la llamada', () => {
    const i = funciones.indexOf('exports.aceptarAcuerdoBeta');
    const cuerpo = funciones.slice(i, i + 5000);
    assert(/context\.auth\.token/.test(cuerpo), 'debe salir de la sesión verificada');
    assert(!/data\.correo/.test(cuerpo), 'no puede aceptarse un correo elegido por el cliente');
  });

  // ══ 4 · El módulo corre ═══════════════════════════════════════════════════
  console.log('\n── El módulo, corriendo contra un DOM de mentira ──');

  function nodo(tag) {
    const n = {
      tagName: (tag || 'div').toUpperCase(),
      className: '', id: '', type: '', src: '', href: '', value: '',
      textContent: '', innerHTML: '', disabled: false,
      hijos: [], parentNode: null,
      style: new Proxy({}, { get: (o, k) => o[k] || '', set: (o, k, v) => (o[k] = v, true) }),
      classList: {
        _s: new Set(),
        add() { [].forEach.call(arguments, c => this._s.add(c)); },
        remove() { [].forEach.call(arguments, c => this._s.delete(c)); },
        contains(c) { return this._s.has(c); }
      },
      setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
      addEventListener() {},
      appendChild(c) { this.hijos.push(c); c.parentNode = this; return c; },
      insertBefore(c) { this.hijos.push(c); c.parentNode = this; return c; },
      removeChild(c) { this.hijos = this.hijos.filter(h => h !== c); c.parentNode = null; },
      querySelector(sel) { return buscar(this, sel); }
    };
    return n;
  }
  function todos(n, acc) { acc = acc || []; acc.push(n); n.hijos.forEach(h => todos(h, acc)); return acc; }
  function buscar(raiz, sel) {
    const cls = sel.replace(/^\./, '').split('.')[0];
    return todos(raiz).find(n => n !== raiz && String(n.className).split(/\s+/).indexOf(cls) >= 0) || null;
  }

  function nuevoModulo() {
    const almacen = {};
    const store = {
      getItem: k => (k in almacen ? almacen[k] : null),
      setItem: (k, v) => { almacen[k] = String(v); },
      removeItem: k => { delete almacen[k]; }
    };
    const body = nodo('body');
    const ctx = {
      console: { log() {}, warn() {}, info() {}, error() {} },
      Promise, Date, Math, JSON, Object, String, Number, Array, Error, encodeURIComponent,
      setTimeout, clearTimeout, setInterval, clearInterval,
      requestAnimationFrame: fn => setTimeout(fn, 0),
      location: { origin: 'https://cruzando.app', pathname: '/index.html', replace() {} },
      localStorage: store,
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      document: {
        body, head: nodo('head'), styleSheets: [],
        getElementById: () => null, createElement: nodo,
        addEventListener() {}, readyState: 'complete'
      }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(modulo, ctx);
    return { G: ctx.window.BetaGate, body, store, buscar, todos };
  }

  const esperar = ms => new Promise(r => setTimeout(r, ms));

  await ta('firma vigente → deja pasar sin montar velo', async () => {
    const m = nuevoModulo();
    const r = await m.G.puerta({ uid: 'u1', leer: () => Promise.resolve({ aceptado: true, version: vModulo }) });
    eq(r, true);
    assert(!m.G.montado(), 'no debe verse nada');
  });

  await ta('sin firma → se pinta el acuerdo y NO deja pasar todavía', async () => {
    const m = nuevoModulo();
    let resuelta = false;
    m.G.puerta({ uid: 'u2', leer: () => Promise.resolve(null), firmar: () => Promise.resolve() })
      .then(() => { resuelta = true; });
    await esperar(40);
    assert(m.G.montado(), 'el velo tiene que estar puesto');
    assert(!!m.buscar(m.body, '.bg-caja'), 'con la caja del acuerdo');
    assert(!resuelta, 'la puerta no puede abrirse sola');
  });

  await ta('«Acepto» exige documento leído Y nombre', async () => {
    const m = nuevoModulo();
    m.G.puerta({ uid: 'u3', nombre: 'Ana Ruiz', leer: () => Promise.resolve(null), firmar: () => Promise.resolve() });
    await esperar(40);
    const btn = m.todos(m.body).find(n => n.className === 'bg-btn primario');
    assert(btn.disabled === true, 'con nombre pero sin leer, sigue cerrado');
    m.buscar(m.body, '.bg-enlace').onclick();
    await esperar(4600);                      // degradación por permanencia
    assert(btn.disabled === false, 'leído y con nombre, se abre');
  });

  await ta('una versión ANTERIOR en el espejo no vale por firma', async () => {
    const m = nuevoModulo();
    m.store.setItem('cruzando_acuerdo_beta', JSON.stringify({ uid: 'u4', version: '0.0' }));
    m.G.puerta({ uid: 'u4', leer: () => Promise.resolve({ aceptado: true, version: '0.0' }),
                 firmar: () => Promise.resolve() });
    await esperar(40);
    assert(m.G.montado(), 'debe volver a pedirse la firma');
  });

  await ta('el espejo de OTRA persona no se hereda', async () => {
    const m = nuevoModulo();
    m.store.setItem('cruzando_acuerdo_beta', JSON.stringify({ uid: 'otro', version: vModulo }));
    let consultado = false;
    await m.G.puerta({ uid: 'u5', leer: () => { consultado = true; return Promise.resolve({ aceptado: true, version: vModulo }); } });
    assert(consultado, 'se consulta al servidor igual');
  });

  await ta('sin respuesta del servidor DEGRADA abriendo, nunca encierra', async () => {
    const m = nuevoModulo();
    const r = await m.G.puerta({ uid: 'u6', leer: () => Promise.reject(new Error('sin red')) });
    eq(r, true, 'quien ya firmó no puede quedar atrapado por estar sin cobertura:');
    assert(!m.G.montado(), 'y el velo no se queda colgado');
  });

  await ta('el developer no firma', async () => {
    const m = nuevoModulo();
    const r = await m.G.puerta({ uid: 'u7', esDeveloper: true,
                                 leer: () => Promise.reject(new Error('no debe llamarse')) });
    eq(r, true);
  });

  await ta('el nombre puede llegar tarde y rellena el campo', async () => {
    const m = nuevoModulo();
    let pon; const tarde = new Promise(r => { pon = r; });
    m.G.puerta({ uid: 'u8', nombre: () => tarde, leer: () => Promise.resolve(null), firmar: () => Promise.resolve() });
    await esperar(40);
    const inp = m.buscar(m.body, '.bg-input');
    eq(inp.value, '', 'arranca vacío:');
    pon('Luis Paz');
    await esperar(30);
    eq(inp.value, 'Luis Paz');
  });

  await ta('un nombre que llega tarde NO pisa lo que se está escribiendo', async () => {
    const m = nuevoModulo();
    let pon; const tarde = new Promise(r => { pon = r; });
    m.G.puerta({ uid: 'u9', nombre: () => tarde, leer: () => Promise.resolve(null), firmar: () => Promise.resolve() });
    await esperar(40);
    const inp = m.buscar(m.body, '.bg-input');
    inp.value = 'Lo que yo escribí';
    pon('Nombre del servidor');
    await esperar(30);
    eq(inp.value, 'Lo que yo escribí');
  });

  await ta('al firmar se envía el nombre y la versión, y se guarda el espejo', async () => {
    const m = nuevoModulo();
    let enviado = null;
    const p = m.G.puerta({ uid: 'uA', nombre: 'Ana Ruiz', leer: () => Promise.resolve(null),
                           firmar: d => { enviado = d; return Promise.resolve(); } });
    await esperar(40);
    m.buscar(m.body, '.bg-enlace').onclick();
    await esperar(4600);
    m.todos(m.body).find(n => n.className === 'bg-btn primario').onclick();
    eq(await p, true);
    eq(enviado, { nombre: 'Ana Ruiz', version: vModulo });
    eq(JSON.parse(m.store.getItem('cruzando_acuerdo_beta')).uid, 'uA');
    assert(!m.G.montado(), 'y el velo se retira');
  });

  await ta('si la firma falla NO se cierra la pantalla ni se pierde lo escrito', async () => {
    const m = nuevoModulo();
    let resuelta = false;
    m.G.puerta({ uid: 'uB', nombre: 'Ana Ruiz', leer: () => Promise.resolve(null),
                 firmar: () => Promise.reject(new Error('sin red')) }).then(() => { resuelta = true; });
    await esperar(40);
    m.buscar(m.body, '.bg-enlace').onclick();
    await esperar(4600);
    const btn = m.todos(m.body).find(n => n.className === 'bg-btn primario');
    btn.onclick();
    await esperar(60);
    assert(m.G.montado(), 'la pantalla sigue puesta para reintentar');
    assert(!resuelta, 'y la puerta no se abre por un fallo de red');
    eq(m.buscar(m.body, '.bg-input').value, 'Ana Ruiz', 'el nombre sigue ahí:');
    assert(!m.store.getItem('cruzando_acuerdo_beta'), 'y no se guarda un espejo falso');
  });

  await ta('cerrar() retira el velo (cierre de sesión)', async () => {
    const m = nuevoModulo();
    m.G.puerta({ uid: 'uC', leer: () => Promise.resolve(null), firmar: () => Promise.resolve() });
    await esperar(40);
    assert(m.G.montado(), 'estaba puesto');
    m.G.cerrar();
    await esperar(400);
    assert(!m.G.montado(), 'y se retira');
  });

  // ══ 5 · El CSS que la pantalla necesita ═══════════════════════════════════
  console.log('\n── El velo va por encima de TODO ──');

  const css = leer('beta-gate.css');

  t('beta-gate.css existe y define el velo', () => {
    assert(/\.bg-velo\s*\{/.test(css), 'sin .bg-velo no hay pantalla');
  });

  t('el velo tapa el splash de onboarding, el de racha y el candado del free', () => {
    const z = parseInt((css.match(/\.bg-velo[\s\S]*?z-index:\s*(\d+)/) || [])[1], 10);
    assert(z > 9999, 'con z-index ' + z + ' algo podría pintarse encima y usarse la app sin firmar');
  });

  t('paleta propia: no depende de variables que las trece páginas no comparten', () => {
    const bloque = css.slice(css.indexOf('.bg-velo'), css.indexOf('.bg-doc'));
    assert(!/var\(--(text|orange|card|border|bg)\b/.test(bloque),
           'mini no define --text y --orange solo existe en index y crecer');
  });

  console.log('\n' + (fail ? '✗' : '✓') + '  ' + ok + ' pasaron, ' + fail + ' fallaron');
  if (fail) { fallos.forEach(f => console.log('   · ' + f)); process.exit(1); }
  // Salida explicita: el modulo deja temporizadores propios en vuelo (el
  // reintento del enganche automatico), y sin esto node esperaria a que se
  // agoten en cada una de las instancias que crea el banco.
  process.exit(0);
})();
