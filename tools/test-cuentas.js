/* ══════════════════════════════════════════════════════════════════════
   Golden test — motor de cuentas (cuentas.js)

   El motor viejo vivía copiado en audio.html y orar.html: 37 líneas con 4 de
   diferencia, y las 4 eran el nombre del elemento de audio. Aquí abajo está
   ESA copia, congelada como referencia, y se corre contra cuentas.js frame a
   frame sobre los datos reales de data/bead_sync.json.

   Si las clases de una sola cuenta difieren en un solo instante, falla.

   Correr:  node tools/test-cuentas.js
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const SYNC = JSON.parse(leer('data/bead_sync.json'));

let fallos = 0, pasos = 0;
function ok(nombre, fn) {
  try { fn(); console.log('  ✓ ' + nombre); pasos++; }
  catch (e) { console.log('  ✗ ' + nombre + '\n      ' + e.message); fallos++; }
}
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error((msg || '') + '\n      esperado: ' + B + '\n      recibido: ' + A);
}

/* ── DOM de mentira: lo justo que tocan los dos motores ─────────────── */
function hacerDOM(idCol, idWrap) {
  const porId = {};
  function nuevoEl(tag) {
    const el = {
      tagName: tag, id: '', className: '', innerHTML: '', hijos: [],
      classList: {
        _s: new Set(),
        add()      { [].forEach.call(arguments, c => this._s.add(c)); },
        remove()   { [].forEach.call(arguments, c => this._s.delete(c)); },
        contains(c){ return this._s.has(c); },
        lista()    { return [...this._s].sort(); }
      },
      appendChild(c) {
        this.hijos.push(c);
        if (c.id) porId[c.id] = c;
        return c;
      },
      set innerHTMLProxy(v) {}
    };
    return el;
  }
  const col  = nuevoEl('div'); col.id  = idCol;
  const wrap = nuevoEl('div'); wrap.id = idWrap; wrap.style = { display: '' };
  porId[idCol] = col; porId[idWrap] = wrap;

  /* innerHTML='' vacía la columna: hay que reflejarlo o el segundo render
     apilaría cuentas sobre las viejas y el golden test no lo vería. */
  Object.defineProperty(col, 'innerHTML', {
    get() { return ''; },
    set() { col.hijos.length = 0; }
  });

  return {
    col, wrap, porId,
    document: {
      getElementById: id => porId[id] || null,
      createElement:  nuevoEl,
      querySelectorAll: sel => {
        if (sel === '#' + idCol + ' .bead') return col.hijos.filter(h => h.className === 'bead');
        return [];
      }
    }
  };
}

/* ── El motor VIEJO, congelado tal como vivía en audio.html ─────────── */
const MOTOR_VIEJO = `
let _beadSync = null, _currentSyncKey = null;
function renderBeadsCol(){
  const col=$('beads-col'); if(!col)return;
  col.innerHTML='';
  const pater=document.createElement('div'); pater.className='bead-pater'; pater.id='bead-pater'; col.appendChild(pater);
  const sep=document.createElement('div'); sep.className='bead-sep'; col.appendChild(sep);
  for(let i=0;i<10;i++){ const d=document.createElement('div'); d.className='bead'; col.appendChild(d); }
  const lux=document.createElement('div'); lux.className='bead-lux-cross'; lux.id='bead-lux-cross';
  lux.innerHTML='<div class="lux-glow"></div>';
  col.appendChild(lux);
}
function _getBeadEl(idx){ if(idx===0)return $('bead-pater'); return document.querySelectorAll('#beads-col .bead')[idx-1]||null; }
function _beadsShow(){ const w=$('beads-col-wrap'); if(w)w.style.display='flex'; }
function _beadsHide(){ const w=$('beads-col-wrap'); if(w)w.style.display='none'; }
function _updateSyncKey(trackUrl){
  if(!_beadSync||!trackUrl){ _currentSyncKey=null; _beadsHide(); return; }
  const name=trackUrl.split('/').pop().replace(/\\?.*$/,'').replace(/\\.(m4a|mp3)$/i,'').toUpperCase();
  const found=Object.keys(_beadSync).find(k=>k.toUpperCase()===name)||null;
  const changed=(found!==_currentSyncKey);
  _currentSyncKey=found;
  if(found){ if(changed)renderBeadsCol(); _beadsShow(); }
  else _beadsHide();
}
function _tickBeads(){
  if(!audioEl||!_currentSyncKey||!_beadSync)return;
  const windows=_beadSync[_currentSyncKey]; if(!windows)return;
  const t=audioEl.currentTime;
  let active=-1;
  for(let i=0;i<windows.length;i++){ if(t>=windows[i].start&&t<=windows[i].end){active=i;break;} }
  for(let i=0;i<windows.length;i++){
    const el=_getBeadEl(i); if(!el)continue;
    el.classList.remove('active','lit-normal');
    if(i===active)el.classList.add('active');
    else if(t>windows[i].end)el.classList.add('lit-normal');
  }
  const lux=$('bead-lux-cross');
  if(lux){ const last=windows[windows.length-1]; if(t>last.end)lux.classList.add('show'); else lux.classList.remove('show'); }
}
/* — añadido solo para el banco: \`let\` crea enlace léxico y no se ve desde el
     contexto del vm, así que los datos hay que sembrarlos desde dentro. No
     altera el comportamiento del motor congelado. — */
function __sembrarSync(s){ _beadSync = s; }
`;

function montarViejo() {
  const d = hacerDOM('beads-col', 'beads-col-wrap');
  const audioEl = { currentTime: 0 };
  const ctx = {
    document: d.document, audioEl,
    $: id => d.document.getElementById(id)
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(MOTOR_VIEJO, ctx);
  ctx.__sembrarSync(SYNC);                   // como tras loadBeadSync()
  return { ctx, dom: d, audioEl,
           pista: u => ctx._updateSyncKey(u),
           tick:  () => ctx._tickBeads() };
}

function montarNuevo() {
  const d = hacerDOM('beads-col', 'beads-col-wrap');
  const audioEl = { currentTime: 0 };
  const ctx = { document: d.document, fetch: () => Promise.resolve({ ok: false }) };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(leer('cuentas.js'), ctx);
  const c = ctx.window.Cuentas.crear({
    audio: () => audioEl,
    luxHTML: '<div class="lux-glow"></div>'
  });
  // Sembrar el sync sin red, igual que el viejo
  return { ctx, dom: d, audioEl, motor: c,
           sembrar: () => { c.cargarSync.__ = 1; },
           pista: u => c.pista(u),
           tick:  () => c.tick() };
}

/* Retrato comparable del estado: las clases de cada cuenta + la Lux + si la
   columna se ve. Es lo único que el usuario percibe. */
function retrato(porId, colHijos) {
  const beads = colHijos.filter(h => h.className === 'bead');
  const pater = porId['bead-pater'];
  const lux   = porId['bead-lux-cross'];
  const wrap  = porId['beads-col-wrap'];
  return {
    pater: pater ? pater.classList.lista() : null,
    aves:  beads.map(b => b.classList.lista()),
    lux:   lux ? lux.classList.lista() : null,
    visible: wrap ? wrap.style.display : null
  };
}

console.log('\n── El motor nuevo hace exactamente lo mismo ──');

ok('carga el sync sin red sin reventar', () => {
  const n = montarNuevo();
  if (typeof n.motor.cargarSync !== 'function') throw new Error('no expone cargarSync');
});

/* Para el golden test hace falta que AMBOS tengan los mismos datos. El nuevo
   los toma por fetch; aquí se le inyecta el mismo objeto por el mismo camino. */
function montarNuevoConSync() {
  const d = hacerDOM('beads-col', 'beads-col-wrap');
  const audioEl = { currentTime: 0 };
  const ctx = {
    document: d.document,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC) })
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(leer('cuentas.js'), ctx);
  const c = ctx.window.Cuentas.crear({ audio: () => audioEl, luxHTML: '<div class="lux-glow"></div>' });
  return { dom: d, audioEl, motor: c };
}

const PISTAS = ['https://x/global/MA.m4a', 'https://x/global/MB.m4a',
                'https://x/global/L_MA.m4a', 'https://x/ubible/UBIBLE_1_1_1.mp3'];

/* Las comparaciones de verdad van en una pasada asíncrona: cargarSync devuelve
   promesa y hay que esperarla antes de comparar. */
(async function () {
  for (const pista of PISTAS) {
    const nombre = pista.split('/').pop();
    const v = montarViejo();
    const n = montarNuevoConSync();
    await n.motor.cargarSync();

    v.pista(pista);
    n.motor.pista(pista);

    // Barrido de tiempos: antes de empezar, dentro de cada ventana, en los
    // bordes, y pasado el final.
    const vs = SYNC[nombre.replace(/\.(m4a|mp3)$/i, '').toUpperCase()];
    const tiempos = [-1, 0];
    if (vs) {
      vs.forEach(w => { tiempos.push(w.start, (w.start + w.end) / 2, w.end, w.end + 0.01); });
      tiempos.push(vs[vs.length - 1].end + 60);
    } else {
      tiempos.push(10, 100, 1000);
    }

    let diferencias = 0, primera = null;
    for (const t of tiempos) {
      v.audioEl.currentTime = t;
      n.audioEl.currentTime = t;
      v.tick();
      n.motor.tick();
      const rv = retrato(v.dom.porId, v.dom.col.hijos);
      const rn = retrato(n.dom.porId, n.dom.col.hijos);
      if (JSON.stringify(rv) !== JSON.stringify(rn)) {
        diferencias++;
        if (!primera) primera = { t, viejo: rv, nuevo: rn };
      }
    }

    const etiqueta = 'pista ' + nombre.padEnd(18) + ' · idéntico en ' + tiempos.length + ' instantes';
    if (diferencias) {
      console.log('  ✗ ' + etiqueta + '\n      ' + diferencias + ' diferencia(s); la primera en t=' +
        primera.t + '\n      viejo: ' + JSON.stringify(primera.viejo) +
        '\n      nuevo: ' + JSON.stringify(primera.nuevo));
      fallos++;
    } else { console.log('  ✓ ' + etiqueta); pasos++; }
  }

  console.log('\n── Lo que el motor nuevo añade ──');

  const n = montarNuevoConSync();
  await n.motor.cargarSync();

  ok('pista() dice si la columna se ve', () => {
    eq(n.motor.pista('https://x/global/MA.m4a'), true,  'MA está en bead_sync');
    eq(n.motor.pista('https://x/q/Q_1_1_1.mp3'), false, 'una pregunta no lleva cuentas');
  });

  ok('el getter de audio es vivo, no una referencia congelada', () => {
    /* audio.html REASIGNA audioEl al abrir el canto del epílogo. Con una
       referencia guardada, el tick miraría a un audio muerto. */
    let cual = { currentTime: 0 };
    const d = hacerDOM('beads-col', 'beads-col-wrap');
    const ctx = { document: d.document, fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC) }) };
    ctx.window = ctx; vm.createContext(ctx);
    vm.runInContext(leer('cuentas.js'), ctx);
    const m = ctx.window.Cuentas.crear({ audio: () => cual, luxHTML: '' });
    return m.cargarSync().then(() => {
      m.pista('https://x/global/MA.m4a');
      cual = { currentTime: 99999 };          // el epílogo cambia el elemento
      m.tick();
      const lux = d.porId['bead-lux-cross'];
      if (!lux.classList.contains('show'))
        throw new Error('el tick siguió mirando al audio viejo');
    });
  });

  ok('instantanea() lee sin tocar', () => {
    n.motor.pista('https://x/global/MA.m4a');
    n.audioEl.currentTime = 50;
    n.motor.tick();
    const antes = retrato(n.dom.porId, n.dom.col.hijos);
    const foto  = n.motor.instantanea();
    const despues = retrato(n.dom.porId, n.dom.col.hijos);
    eq(antes, despues, 'instantanea() modificó el DOM');
    eq(foto.cuentas.length, 11, '11 cuentas: 1 pater + 10 aves');
    eq(foto.cuentas[0].tipo, 'pater');
    eq(foto.cuentas[10].tipo, 'ave');
  });

  ok('instantanea() traduce los estados que la animación necesita', () => {
    n.motor.pista('https://x/global/MA.m4a');
    const vs = SYNC.MA;
    n.audioEl.currentTime = (vs[3].start + vs[3].end) / 2;   // dentro de la 4ª
    n.motor.tick();
    const f = n.motor.instantanea();
    eq(f.cuentas[3].estado, 'activa', 'la cuenta en curso');
    eq(f.cuentas[0].estado, 'rezada', 'las anteriores');
    eq(f.cuentas[9].estado, 'apagada', 'las que faltan');
  });

  ok('instantanea() reconoce también los estados de rezar', () => {
    /* rezar no usa este motor, pero la animación clona SU columna igual:
       lit-white / lit-correct / lit-spam también cuentan como rezada. */
    n.motor.pista('https://x/global/MA.m4a');
    const b = n.motor.elemento(2);
    b.classList.remove('active', 'lit-normal');
    b.classList.add('lit-spam');
    eq(n.motor.instantanea().cuentas[2].estado, 'rezada');
  });

  ok('una sola descarga por página aunque haya varias instancias', async () => {
    let veces = 0;
    const d = hacerDOM('beads-col', 'beads-col-wrap');
    const ctx = { document: d.document,
      fetch: () => { veces++; return Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC) }); } };
    ctx.window = ctx; vm.createContext(ctx);
    vm.runInContext(leer('cuentas.js'), ctx);
    const a = ctx.window.Cuentas.crear({ audio: () => ({ currentTime: 0 }) });
    const b = ctx.window.Cuentas.crear({ audio: () => ({ currentTime: 0 }) });
    await a.cargarSync(); await b.cargarSync(); await a.cargarSync();
    eq(veces, 1);
  });

  console.log('\n── La columna sobrevive al rezo (Fase 2) ──');

  function montarCongelable() {
    const d = hacerDOM('beads-col', 'beads-col-wrap');
    const audioEl = { currentTime: 0 };
    const ctx = { document: d.document,
      fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(SYNC) }) };
    ctx.window = ctx; vm.createContext(ctx);
    vm.runInContext(leer('cuentas.js'), ctx);
    const c = ctx.window.Cuentas.crear({
      audio: () => audioEl, luxHTML: '', congelarAlCompletar: true });
    return { dom: d, audioEl, motor: c };
  }

  const cong = montarCongelable();
  await cong.motor.cargarSync();

  ok('no se congela mientras la decena va a medias', () => {
    cong.motor.pista('https://x/global/MA.m4a');
    cong.audioEl.currentTime = SYNC.MA[5].start + 1;
    cong.motor.tick();
    eq(cong.motor.estaCongelada(), false);
  });

  ok('se congela cuando aparece la Cruz', () => {
    cong.audioEl.currentTime = SYNC.MA[SYNC.MA.length - 1].end + 1;
    cong.motor.tick();
    eq(cong.motor.estaCongelada(), true);
    eq(cong.dom.porId['bead-lux-cross'].classList.contains('show'), true);
  });

  ok('congelada, la pregunta siguiente NO la borra', () => {
    /* Este era el fallo: la columna se ocultaba en el primer cambio de pista,
       así que al usuario se le quitaba de la vista justo lo que acababa de rezar. */
    cong.motor.pista('https://x/q/Q_1_1_1.mp3');
    eq(cong.dom.porId['beads-col-wrap'].style.display, 'flex');
  });

  ok('congelada, conserva las cuentas tal cual (ni atenuadas ni repintadas)', () => {
    const antes = retrato(cong.dom.porId, cong.dom.col.hijos);
    cong.motor.pista('https://x/pray/PRAY_1_1_1.mp3');
    cong.motor.pista('https://x/bye/BYE.mp3');
    eq(retrato(cong.dom.porId, cong.dom.col.hijos), antes);
  });

  ok('congelada, un tick de la pista siguiente NO la apaga', () => {
    /* ESTE era el fallo que se veía en audio. tick() no acumula: repinta las
       once cuentas desde cero a partir de currentTime. Al arrancar Q1 el
       currentTime vuelve a ~0 mientras `clave` sigue apuntando a las ventanas
       del rezo, así que ninguna había pasado: borraba las once tintas y
       apagaba la Cruz. La columna sobrevivía, pero vacía —y el decenario del
       final moría en la guarda, que exige justo esa Cruz—. */
    const antes = retrato(cong.dom.porId, cong.dom.col.hijos);
    cong.audioEl.currentTime = 0.4;          // la pregunta acaba de empezar
    cong.motor.tick();
    cong.audioEl.currentTime = 12.7;
    cong.motor.tick();
    eq(retrato(cong.dom.porId, cong.dom.col.hijos), antes,
       'la columna congelada se repintó con el tiempo de otra pista');
    eq(cong.dom.porId['bead-lux-cross'].classList.contains('show'), true,
       'la Cruz se apagó, y con ella el decenario del final');
  });

  ok('volver al rezo SÍ la descongela y la repinta', () => {
    /* Los saltos de sección (◀◀ ▶▶, solo developer) pueden devolver al rezo, y
       el Misterio siguiente trae otra pista de rezo. Antes pista() retornaba
       antes de calcular la clave, así que una vez congelada la columna ya no
       volvía a arrancar en toda la sesión. */
    cong.motor.pista('https://x/global/MB.m4a');
    eq(cong.motor.estaCongelada(), false);
    eq(cong.dom.porId['beads-col-wrap'].style.display, 'flex');
    eq(cong.dom.porId['bead-lux-cross'].classList.contains('show'), false,
       'la Cruz de la decena anterior sobrevivió al repintado');
  });

  ok('Misterio nuevo la descongela y la limpia', () => {
    cong.motor.reiniciar();
    eq(cong.motor.estaCongelada(), false);
    eq(cong.dom.porId['beads-col-wrap'].style.display, 'none');
    eq(cong.dom.porId['bead-lux-cross'].classList.contains('show'), false);
  });

  const sinCong = montarNuevoConSync();
  await sinCong.motor.cargarSync();
  ok('sin la opción, nada se congela (orar sigue igual)', () => {
    sinCong.motor.pista('https://x/global/MA.m4a');
    sinCong.audioEl.currentTime = SYNC.MA[SYNC.MA.length - 1].end + 1;
    sinCong.motor.tick();
    eq(sinCong.motor.estaCongelada(), false);
    sinCong.motor.pista('https://x/q/Q_1_1_1.mp3');
    eq(sinCong.dom.porId['beads-col-wrap'].style.display, 'none');
  });

  ok('reiniciar() limpia SIN pedírselo', () => {
    /* Aquí había un parámetro `repintar` opcional, y sin él "reiniciar" no
       reiniciaba nada visible: olvidaba la clave y escondía la columna, pero
       las once cuentas conservaban su tinta y la Cruz su `show`. audio pasaba
       true; orar no. Al pasar al Misterio siguiente en orar, esa Cruz heredada
       dejaba pasar la guarda del decenario aunque no se hubiera rezado —y como
       la columna estaba escondida, sus rects eran ceros y las cuentas salían
       volando desde la esquina (0,0). */
    const foto = sinCong.motor.instantanea();
    if (!foto.lux || !foto.lux.visible)
      throw new Error('la columna no quedó rezada; la prueba no probaría nada');
    sinCong.motor.reiniciar();                       // sin argumento
    const r = retrato(sinCong.dom.porId, sinCong.dom.col.hijos);
    eq(r.lux, [], 'la Cruz del Misterio anterior sobrevive');
    eq(r.pater, [], 'el Padrenuestro conserva su tinta');
    r.aves.forEach(c => eq(c, [], 'una Avemaría conserva su tinta'));
    eq(r.aves.length, 10, 'la columna se repintó incompleta');
    eq(r.visible, 'none');
  });

  ok('ninguna página pide ya el repintado a mano', () => {
    /* El parámetro era una trampa tendida: si vuelve, vuelve el bug de orar. */
    ['audio.html', 'orar.html'].forEach(f => {
      const s = leer(f);
      if (/reiniciar\(\s*(true|false)\s*\)/.test(s))
        throw new Error(f + ' vuelve a pasarle argumento a reiniciar()');
      if (!/_cuentas\.reiniciar\(\)/.test(s))
        throw new Error(f + ' ya no reinicia las cuentas al cambiar de Misterio');
    });
    if (/function reiniciar\(\w/.test(leer('cuentas.js')))
      throw new Error('reiniciar() recuperó su parámetro opcional');
  });

  ok('audio.html  · pide la congelación; orar no', () => {
    if (!/congelarAlCompletar:\s*true/.test(leer('audio.html')))
      throw new Error('audio no congela: las cuentas se le borrarían al usuario');
    if (/congelarAlCompletar/.test(leer('orar.html')))
      throw new Error('orar no debería congelar: su columna es del tool de rezo');
  });

  console.log('\n── Dos tintas, no un hueco (Fase 2) ──');

  ['audio.html', 'orar.html', 'rezar.html', 'mini.html'].forEach(f => {
    ok(f.padEnd(12) + ' · la cuenta sin rezar tiene tinta propia', () => {
      const s = leer(f);
      if (!/--cuenta-apagada:\s*rgba\(/.test(s))
        throw new Error('no define --cuenta-apagada');
      const bead = (s.match(/\n\.bead\{[\s\S]{0,240}?\}/) || [''])[0];
      if (!/var\(--cuenta-apagada\)/.test(bead))
        throw new Error('.bead no usa la tinta apagada: ' + bead.trim().slice(0, 110));
      if (/background:\s*transparent/.test(bead))
        throw new Error('.bead sigue con background:transparent');
    });
  });

  ok('rezar      · la activa no queda más vacía que las que faltan', () => {
    /* En rezar la activa era transparent a propósito (espera tu toque). Con las
       apagadas ya rellenas, eso invertía el significado. */
    const s = leer('rezar.html');
    if (/\.bead\.active[^{]*\{[^}]*background:\s*transparent/.test(s))
      throw new Error('la activa sigue transparente');
    if (!/\.bead\.active\{[^}]*var\(--cuenta-apagada\)/.test(s))
      throw new Error('la activa no lleva la tinta apagada de fondo');
  });

  console.log('\n── Quién lo usa ──');

  ok('audio.html  · carga cuentas.js y usa el motor', () => {
    const s = leer('audio.html');
    if (!s.includes('src="cuentas.js"')) throw new Error('no carga cuentas.js');
    if (/function renderBeadsCol/.test(s)) throw new Error('conserva su copia del motor');
  });

  ok('orar.html   · carga cuentas.js y usa el motor', () => {
    const s = leer('orar.html');
    if (!s.includes('src="cuentas.js"')) throw new Error('no carga cuentas.js');
    if (/function renderBeadsCol/.test(s)) throw new Error('conserva su copia del motor');
  });

  ok('la instancia se declara antes de su primer uso', () => {
    /* `const` no tiene hoisting: si una llamada a _cuentas quedara por delante
       de su declaración a nivel superior, sería un error fatal en carga. */
    ['audio.html', 'orar.html'].forEach(f => {
      const s = leer(f);
      const decl = s.indexOf('const _cuentas = Cuentas.crear');
      const uso  = s.indexOf('_cuentas.');
      if (decl === -1) throw new Error(f + ': no declara la instancia');
      if (uso < decl)  throw new Error(f + ': la usa antes de declararla');
    });
  });

  ok('cuentas.js se carga en el <head>, antes del módulo', () => {
    ['audio.html', 'orar.html'].forEach(f => {
      const s = leer(f);
      const carga = s.indexOf('src="cuentas.js"');
      const finHead = s.indexOf('</head>');
      if (carga === -1) throw new Error(f + ': no carga cuentas.js');
      if (finHead !== -1 && carga > finHead) throw new Error(f + ': lo carga fuera del <head>');
    });
  });

  ok('rezar y mini conservan la suya a propósito', () => {
    /* rezar tiene cuentas INTERACTIVAS (toques, saltos, spam) — es un
       superconjunto. mini es el ancestro divergente, igual que con canto.js.
       Si algún día adoptan el motor, esta prueba se actualiza a mano. */
    if (!/function renderBeadsCol/.test(leer('rezar.html')))
      throw new Error('rezar perdió su motor interactivo');
    if (!/function renderBeadsCol/.test(leer('mini.html')))
      throw new Error('mini perdió su motor');
  });

  console.log('\n' + '─'.repeat(64));
  if (fallos) {
    console.log('  ✗ ' + fallos + ' fallo(s), ' + pasos + ' pasada(s)');
    console.log('─'.repeat(64) + '\n');
    process.exit(1);
  }
  console.log('  TODO VERDE — ' + pasos + ' pruebas');
  console.log('─'.repeat(64) + '\n');
}());
