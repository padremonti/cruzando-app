// ═══════════════════════════════════════════════════════════════════
// CruzAndo — interruptores de producto (feature flags)
// ═══════════════════════════════════════════════════════════════════
//
// UN SOLO LUGAR para encender o apagar piezas completas del producto.
//
// ── MOSTRAR_RECOMPENSAS ────────────────────────────────────────────
// Gobierna el "kit" de recompensas, que está a medio construir y va
// en standby para el MVP:
//   · Cofres del mapa (crecer.html cada 5 Misterios, world.js por cuaderno)
//   · Tienda del Peregrino (extras.html) y su entrada en el drawer
//   · Filtro "Extras" de la biblioteca de cantos
//   · Esferas de recompensa pendiente, toasts de medalla, skins compradas
//
// Apagado NO borra nada: el código sigue entero y los datos de Firestore
// (extras/purchases, extrasCantos, recompensas) quedan intactos. Encender
// es cambiar false → true aquí y nada más.
//
// El nodo del mapa que hoy es cofre NO desaparece cuando está apagado:
// se convierte en un separador pequeño y mudo que marca la división
// entre bloques de 5 Misterios (ver .tramo-node en crecer.html).
//
// ⚠️ DEUDA BLOQUEANTE antes de poner esto en true:
//    extras.html compara objetos contra strings al decidir si un producto
//    ya es tuyo (getProductState → userPurchases.indexOf(product.id)),
//    así que tras recargar nunca reconoce lo comprado y deja pagar dos
//    veces el mismo producto. Arreglarlo —o rehacer la tienda— ANTES de
//    exponerla. Ver CLAUDE.md § "Kit de recompensas (standby)".
window.MOSTRAR_RECOMPENSAS = false;

// Puerta única. Se compara contra `true` a propósito: si una página
// olvidara cargar este archivo, el valor es undefined y el kit queda
// OCULTO. Falla del lado seguro — nunca se le escapa un cofre al usuario.
window.recompensasON = function () { return window.MOSTRAR_RECOMPENSAS === true; };

// ── MOSTRAR_RETIROS ────────────────────────────────────────────────
// Gobierna El Santuario entero — los Retiros — que sigue bajo desarrollo
// y queda fuera del MVP con el que se harán las pruebas con usuarios reales:
//   · La puerta "El Santuario" del hub (index.html) y su panel
//   · La pestaña "Retiros" de la barra de las ocho páginas del hub
//   · retiros.html (el catálogo) y rezar_taller.html (el reproductor)
//   · El banner y el modal de "retiro en curso", y el pulso de la pestaña
//   · El filtro "Retiros" del Diario
//   · Los tres interstitials de cantos.html que anuncian retiros
//   · La entrada al Santuario desde el cofre del mapa (world.js)
//   · La línea de los Retiros en el argumentario de Premium
//
// A diferencia de MOSTRAR_RECOMPENSAS, este flag tiene una excepción: el
// DEVELOPER sigue entrando a todo, porque es quien lo está construyendo.
// Premium, beta y free no ven nada — para ellos los Retiros no existen
// todavía, y prometer lo que no se puede cumplir es peor que callar.
//
// Apagado NO borra nada: el código sigue entero y los datos de Firestore
// (users/{uid}/talleres, y las entradas de diario con origen 'taller') quedan
// intactos. Lo ya escrito se sigue viendo en el Diario bajo "Todas".
// Encender es cambiar false → true aquí y nada más.
window.MOSTRAR_RETIROS = false;

// Puerta única. Como la de recompensas, se compara contra `true` exacto: una
// página que olvide cargar este archivo deja los Retiros OCULTOS, nunca
// visibles. La diferencia es la salida del developer, que no depende de
// plan-utils.js (world.html no lo carga) y honra el "ver como" del banco de
// pruebas: un developer mirando como free tampoco los ve, que es justo lo que
// necesita para comprobar qué recibe un usuario real.
window.retirosON = function () {
  if (window.MOSTRAR_RETIROS === true) return true;
  var verComo = null;
  try { verComo = sessionStorage.getItem('cruzando_view_as'); } catch (e) {}
  if (verComo) return verComo === 'developer';
  var plan = window.currentPlan;
  if (!plan) { try { plan = localStorage.getItem('cruzando_plan_cache'); } catch (e) {} }
  return plan === 'developer';
};

// La pestaña "Retiros" vive en la barra de OCHO páginas y cada una la escribe
// distinta (unas con onclick a retiros.html, index/crecer con abrirSanar y el
// id nav-sanar-btn, world.html con otra clase). En vez de ocho parches en
// ocho HTML, se reconoce por lo que la identifica y se retira entera.
//
// Se RETIRA, no se atenúa: un botón al 35% sigue siendo un botón, y detrás no
// hay nada que enseñar. Es la misma regla que se aplicó a las flechas del free
// en el hero de audio.
//
// Es de dos sentidos e idempotente a propósito: en el arranque el plan sale
// del caché y puede llegar corregido después (index/crecer repintan al
// resolver Auth), así que un developer cuyo caché venía frío recupera su
// pestaña sin recargar.
window.aplicarNavRetiros = function () {
  var visible = window.retirosON();
  var items;
  try { items = document.querySelectorAll('.app-nav-item, .nav-item'); }
  catch (e) { return; }
  for (var i = 0; i < items.length; i++) {
    var el  = items[i];
    var oc  = el.getAttribute('onclick') || '';
    var txt = (el.textContent || '').trim().toLowerCase();
    var esRetiros = oc.indexOf('retiros.html') >= 0 ||
                    el.id === 'nav-sanar-btn' ||
                    txt === 'retiros' || txt === 'retiro';
    if (!esRetiros) continue;
    el.style.display = visible ? '' : 'none';
    if (visible) el.removeAttribute('aria-hidden');
    else         el.setAttribute('aria-hidden', 'true');
  }
};

(function () {
  var aplicar = function () { window.aplicarNavRetiros(); };
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aplicar);
  } else {
    aplicar();
  }
}());
