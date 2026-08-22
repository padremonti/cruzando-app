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
