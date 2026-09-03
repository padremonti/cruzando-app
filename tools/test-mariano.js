/* ══════════════════════════════════════════════════════════════════════
   Banco de pruebas — el aviso de metros (el "slide" de Mariano)

   Tenía DOS glitches que se sumaban, y el mismo código está en las tres
   páginas:

   1. La imagen entraba sin haberse descargado. marianoNext() rota entre diez
      imágenes distintas de R2 y ninguna se precargaba: se asignaba el src y
      se arrancaba la animación en la misma línea, así que el overlay deslizaba
      con la caja vacía y el dibujo aparecía de golpe al llegar la descarga.

   2. `width:182px` vivía en `.mariano-slide`, la MISMA clase que se quita y se
      pone para reiniciar la animación. Durante ese instante el <img> volvía a
      su tamaño intrínseco. No se veía la primera vez (el overlay estaba
      oculto), pero sí con dos avisos seguidos — y en orar llegan a 600 ms:
      premiar('rezo') y, si se cerró el bloque, showSlide(MR_BNS) en un
      setTimeout de 600.

   Correr:  node tools/test-mariano.js
   ══════════════════════════════════════════════════════════════════════ */
'use strict';
const fs   = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');

let fallos = 0, pasos = 0;
function ok(nombre, fn) {
  try { fn(); console.log('  ✓ ' + nombre); pasos++; }
  catch (e) { console.log('  ✗ ' + nombre + '\n      ' + e.message); fallos++; }
}

const MODOS = ['audio.html', 'orar.html', 'rezar.html'];
const cuerpo = (s, fn) =>
  (sinComentarios(s).match(new RegExp('function ' + fn + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}')) || [''])[0];

console.log('\n── El ancho no depende de la animación ──');

MODOS.forEach(f => {
  ok(f.padEnd(13) + '· el width vive en el ID, no en .mariano-slide', () => {
    const s = leer(f).replace(/\s/g, '');
    const clase = s.match(/\.mariano-slide\{([^}]*)\}/);
    if (!clase) throw new Error('no encontré .mariano-slide');
    if (/width:/.test(clase[1]))
      throw new Error('vuelve el width a la clase que se quita y se pone: ' +
                      'con dos avisos seguidos se verá un fotograma a tamaño intrínseco');
    if (!/animation:marianoSlide/.test(clase[1]))
      throw new Error('la clase perdió su animación');
    const id = s.match(/#mariano-slide-img\{([^}]*)\}/);
    if (!id || !/width:182px/.test(id[1]))
      throw new Error('el <img> se quedó sin ancho propio');
  });
});

console.log('\n── La imagen entra ya descargada ──');

MODOS.forEach(f => {
  ok(f.padEnd(13) + '· no se pinta el src hasta que la imagen está lista', () => {
    const c = cuerpo(leer(f), 'showSlide');
    if (!c) throw new Error('no encontré showSlide');
    const plano = c.replace(/\s/g, '');
    if (!/newImage\(\)/.test(plano))
      throw new Error('no precarga: el overlay volverá a deslizar con la caja vacía');
    const iPre = plano.indexOf('pre.src=url');
    const iImg = plano.indexOf('img.src=url');
    if (iPre === -1 || iImg === -1) throw new Error('cambió la forma de la precarga');
    if (!(iImg < iPre))
      throw new Error('el <img> debe pintarse dentro de lanzar(), no antes de precargar');
    if (!/pre\.onload/.test(plano) || !/pre\.onerror/.test(plano))
      throw new Error('sin onload/onerror: una imagen que falle dejaría el aviso colgado');
  });

  ok(f.padEnd(13) + '· la red no puede secuestrar el aviso', () => {
    /* Los metros ganados importan más que el dibujo: si R2 tarda, el aviso
       sale igual. */
    const plano = cuerpo(leer(f), 'showSlide').replace(/\s/g, '');
    if (!/setTimeout\(lanzar,\d+\)/.test(plano))
      throw new Error('sin red de seguridad: una imagen que no llega bloquearía el aviso');
    if (!/if\(pre\.complete\)lanzar\(\)/.test(plano))
      throw new Error('el caso ya-en-caché debe salir sin esperar al bucle de eventos');
    if (!/if\(lanzado\)return/.test(plano))
      throw new Error('lanzar() tiene que ser idempotente: hay tres caminos que la llaman');
  });

  ok(f.padEnd(13) + '· precarga el siguiente Mariano', () => {
    /* Reparte los ~700 KB de los diez en el tiempo en vez de pedirlos de golpe
       al arrancar la sesión. */
    const s = leer(f);
    if (!/function marianoPeek/.test(s))
      throw new Error('no existe marianoPeek()');
    const peek = cuerpo(s, 'marianoPeek').replace(/\s/g, '');
    if (/_marianoIdx=/.test(peek))
      throw new Error('marianoPeek NO puede avanzar el turno: se saltaría un Mariano');
    if (!/marianoPeek\(\)/.test(cuerpo(s, 'showSlide')))
      throw new Error('showSlide no precarga el siguiente');
  });
});

console.log('\n── El aviso sigue siendo el mismo ──');

MODOS.forEach(f => {
  ok(f.padEnd(13) + '· conserva la coreografía y el cierre a 2600 ms', () => {
    const plano = cuerpo(leer(f), 'showSlide').replace(/\s/g, '');
    ['classList.remove(\'mariano-slide\')', 'voidimg.offsetWidth',
     'classList.add(\'mariano-slide\')', 'ov.style.display=\'flex\'',
     '_hideTimer'].forEach(t => {
      if (!plano.includes(t.replace(/\s/g, '')))
        throw new Error('perdió: ' + t);
    });
    if (!/2600/.test(plano)) throw new Error('cambió el tiempo de ocultado');
    if (!/extra-badge/.test(plano)) throw new Error('perdió la insignia del extra');
  });
});

console.log('\n' + '─'.repeat(64));
if (fallos) {
  console.log('  ✗ ' + fallos + ' fallo(s), ' + pasos + ' pasada(s)');
  console.log('─'.repeat(64) + '\n');
  process.exit(1);
}
console.log('  TODO VERDE — ' + pasos + ' pruebas');
console.log('─'.repeat(64) + '\n');
