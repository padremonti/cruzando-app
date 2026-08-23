# CruzAndo — Guía para Claude Code

## Qué es este proyecto
PWA de formación espiritual católica. El usuario reza los 20 Misterios del Rosario organizados en un itinerario de 7 Mundos × 4 Cuadernos. Stack: HTML/CSS/JS vanilla, sin bundlers. Firebase Auth + Firestore SDK v10.12.0. Audio en Cloudflare R2. Hosting en GitHub Pages.

## Convenciones del código
- Todo JS en IIFEs o módulos ES; funciones expuestas en `window.X` para `onclick` en HTML.
- Fetch de assets: `location.origin + location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1)` — nunca rutas absolutas.
- Tema claro/oscuro: clase `body.light` (dark es default). Key localStorage: `cruzando_theme`, valores `'light'`/`'dark'`.
- Preferencias de usuario: localStorage key `cruzando_prefs` → JSON `{ bgm: bool, microInAudio: bool }`.
- Navigation pattern: `navTap(el) + playNavChord() + goTo(page)` con el mismo CSS `.app-nav / .app-nav-item / .app-nav-icon / .app-nav-label`.
- Membresía: `window.resolvePlan(userData)` → `'free' | 'beta' | 'premium'` (en `utils.js`, cargado en todas las páginas).

## Archivos principales

| Archivo | Rol |
|---------|-----|
| `index.html` | Home: métricas, bloques, acceso al resto. Modal de Preferencias (tema, BGM, micro). |
| `world.html` | Mapa de niveles. Navega a `audio.html?c=XXYY`. |
| `audio.html` | Player de sesión diaria. Módulo principal. |
| `orar.html` | Rezo por bloques (gozosos/luminosos/dolorosos/gloriosos). |
| `diario.html` | Diario de reflexiones. Lee `users/{uid}/reflections/*`. |
| `sanar.html` | Entrada emocional al Rosario (pestaña "Sanar" del hub). Máquina de 4 fases: onboarding de afinidad → elenco de dolores → acogida interactiva → handoff. Navega a `mini.html?mid=…&pain=…`. |
| `mini.html` | Mini sesión de UN Misterio (el "Misterio-puerta" que señaló Sanar). Reproductor cinematográfico a pantalla completa. Todo derivado del `mid`. Firebase compat cableado; marca el pain completado al epílogo. |
| `canto.js` / `canto.css` | Motor de karaoke de canto compartido (extraído de audio+rezar). `Canto.init({...})`; CSS por `<link>`, HTML del overlay inyectado por el módulo. `mini.html` NO lo usa (ancestro divergente). |
| `utils.js` | `window.isPremium(userData)` y `window.resolvePlan(userData)`. Cargado en todas las páginas. |
| `flags.js` | Interruptores de producto. Hoy: `MOSTRAR_RECOMPENSAS = false` + puerta `window.recompensasON()`. Ver § Kit de recompensas. |
| `bloques.js` | **Origen único del color de los cuatro bloques.** `window.COLORES_BLOQUE` + `window.rgbaBloque(bloque, alfa)`, y estampa 12 variables CSS (`--goz`, `--goz-color`, `--goz-rgb`, ×4). Va en el `<head>`. Ver § Colores de bloque. |

## Navegación: dónde termina una sesión

**Hay dos hogares, y no son intercambiables:** `index.html` es la **pantalla de acceso y hub**; `crecer.html` es el **mapa** — el camino con nodos, y el único que tiene motor de mapa (`computeAllPositions`, `drawMapPath`, `BLOQUES_MAP`). Estructuralmente `crecer` es `index` **más** el mapa: las 18 secciones de primer nivel son idénticas, y por eso el bloque de acceso está duplicado (§ Consentimiento, "los gemelos"). `crecer.html` **no enlaza a `index.html` por ningún sitio**: el flujo es un embudo de un solo sentido.

**Los cuatro modos de rezo vuelven al mapa (`crecer.html`).** Antes cada uno terminaba en un sitio distinto: audio y rezar en el hub, sanar en el mapa, y orar en sí mismo. Puntos de salida:

| Modo | Sale por |
|---|---|
| `audio` | `window._goHome()` — lo usan `salirDelEpilogo()`, el candado "vuelve mañana" y el overlay del DEMO. **Un solo sitio codifica el destino.** |
| `orar` | `salirConAviso(dest, directo)` → `salirDeOrar()`; barra de navegación y los dos botones "Volver al camino" de la celebración |
| `rezar` | `safeGoTo` / `goTo` desde la barra, el gesto atrás y los dos botones de la celebración |
| `sanar` | `navTo('crecer.html')` (ya lo hacía). `mini` devuelve a `sanar`, no al mapa: es su propio bucle |

**Solo cuatro rutas siguen yendo a `index.html`**, y todas son de acceso: `signOut` y el enlace de alta en audio, y el `onAuthStateChanged` sin usuario de orar y rezar.

**La salida de orar es nueva.** Su celebración tenía un único botón con la etiqueta fija `Regresar a inicio` que los dos manejadores sobrescribían sin tocar el texto: uno recargaba `orar.html?c=…` y el otro llamaba `loadCuaderno()`. La etiqueta mentía en los dos casos y no había forma de salir salvo la barra. Ahora ofrece **Seguir rezando / Siguiente cuaderno** (texto fijado por cada manejador) y **Volver al camino**.

⚠️ Esa salida pide **salida directa** (`salirConAviso('crecer.html', true)`): "Seguir rezando" recarga orar y mete su propia entrada en el historial, así que el atajo de `history.back()` de `salirDeOrar` devolvería al orar anterior en vez de al mapa. La bandera `_exitDirecto` se limpia en `salirDeOrar` y en `_exitCancel`.

**`world.html` está inalcanzable.** Su único enlace vive en `mostrarEsferas()` (`crecer.html`), que solo corre bajo `recompensasON()` — se apagó con el kit de recompensas sin que nadie lo notara.

**Banco de pruebas:** `tools/test-navegacion.js` (13 pruebas). Comprueba línea a línea que ninguna salida de sesión se escape al hub (con excepciones por **línea completa**, no por subcadena), que las tres barras lleven al mapa etiquetadas "Crecer", y que la salida de orar siga cableada en sus dos finales. Importa porque el splash de racha se engancha justo en estos puntos.

## Modelo de datos Firestore

```
users/{uid}
  .plan              'free' | 'beta' | 'premium' | 'pro'
  .betaExpiresAt     Timestamp (solo plan beta)
  .totalMeters       number

users/{uid}/audioProgress/current
  .nivel, .cuaderno, .misterio   (posición actual)
  .firstAnswered                 [bool, bool, bool]
  .history                       [{ n, c, m, completedAt }]
  .blockBonuses                  { '1_1_gozosos': true, ... }

users/{uid}/progress/{nivelId}   (nivelId = '0101', '0102', ...)
  .progress    { gozosos:[ts,ts,null,null,null], luminosos:..., ... }
  .microDone   { gozosos: true, luminosos: false, ... }
  .journal, .medConfirmed, .reflectionRewards, .audioRewards

users/{uid}/reflections/{nivelId}_{bloque}_{misterioIdx}_q{qi}
  .nivelId, .bloque, .misterioIdx, .questionIdx
  .question    (texto de la pregunta)
  .text        (respuesta del usuario)
  .confirmedAt Timestamp

users/{uid}/profile/afinidad          (onboarding de sanar.html)
  .version, .status   'complete' | 'skipped'
  .tono, .anhelo      (claves de las selecciones crudas; null si skipped)
  .areas              [slugs elegidos en P2]
  .ejes               { emociones, vinculos, cuerpo, existencial, recursos, social, actitud } (pesos)
  .createdAt          Timestamp (solo 1ª vez; sobrevive al rehacer)
  .updatedAt          Timestamp

users/{uid}/profile/onboarding        (flags de tutorial — plan-utils.js, NO confundir con afinidad)

users/{uid}/progress/sanar            (pains completados en mini.html — ciclo "completado")
  .pains       { '010101a': { firstCompletedAt, lastCompletedAt, count }, ... }  (clave = pain id)
  .updatedAt   Timestamp
```

## Modelo de misterios

- Misterio 1-5 → bloque `gozosos` (idx 0-4)
- Misterio 6-10 → bloque `luminosos` (idx 0-4)
- Misterio 11-15 → bloque `dolorosos` (idx 0-4)
- Misterio 16-20 → bloque `gloriosos` (idx 0-4)
- `nivelId` = `String(nivel).padStart(2,'0') + String(cuaderno).padStart(2,'0')` → ej. `'0101'`

## Colores de bloque

**La definición** (decisión de producto, no un ajuste): `gozosos` **rosa** `#E8A0A0` · `luminosos` **cian** `#01BBE1` · `dolorosos` **rojo** `#C0392B` · `gloriosos` **oro** `#D4A017`.

**Origen único: `bloques.js`.** Sirve a las dos caras — `window.COLORES_BLOQUE` / `window.rgbaBloque(bloque, alfa)` para el JS, y 12 variables estampadas en `<html>` para el CSS (`--goz` / `--goz-color` / `--goz-rgb`, y lum, dol, glo). Va en el **`<head>`** de las 7 páginas que usan color de bloque (index, crecer, audio, orar, rezar, cantos, diario): estampa variables y tiene que correr antes del primer pintado o las franjas parpadean.

**Por qué existe.** El color estaba copiado a mano en seis páginas y se había desviado en tres direcciones a la vez: `audio`/`index`/`crecer`/`diario` declaraban Gozosos en **oro** y Gloriosos en **morado** (valores de una etapa anterior), la pantalla final del micro pintaba su cruz en **verde y amarillo** (una cuarta paleta que no existía en ningún otro sitio), y los 28 `data/{nivelId}.json` llevaban todavía la vieja en `tema.bloques`. El Diario era el bug visible: se rezaba en rosa y se leía el propio diario en oro.

**Ojo:** `tema.bloques` de los JSON **no lo lee nadie** (los `.bloques` del código son `microData.bloques`, de `{nivelId}-micro.json`, otro archivo). Se dejó corregido en vez de borrado porque es a lo que uno estira la mano al buscar "el color del bloque" — pero el origen es `bloques.js`. `tema.paleta` sí es real y distinta por Mundo: es la paleta del cuaderno, no la del bloque.

**No confundir con los colores de Mundo.** `_mundoColors` y `{id, name, color}` de index/crecer son los 7 Mundos y comparten algún hexadecimal por casualidad. Semántica distinta, no tocar.

**Banco de pruebas:** `tools/test-colores-bloque.js` (34 pruebas). Corre `bloques.js` de verdad en un `vm` y audita las 7 páginas y los 28 JSON: que nadie redeclare las variables, que nadie hornee un hexadecimal junto al nombre de un bloque, y que cada página cargue `bloques.js` en el `<head>` antes del primer uso. Existe para que la deriva no vuelva — cazó una quinta copia en `index.html` que los `grep` a mano no habían visto.

## Archivos de datos (`data/`)

```
{nivelId}.json          Misterios, preguntas y texto del cuaderno
{nivelId}-micro.json    Micro-aprendizaje por bloque (tarjetas + preguntas de apropiación)
{nivelId}-cantos.json   Letras de cantos por bloque/misterio
```
Actualmente existen datos para Mundo 1 (`0101`–`0104`). Mundo 2 solo tiene `0201-micro.json`.

## Sistema de metros (gamificación)

**audio.html — por sección escuchada:**
- UBIBLE completado: +200m
- CONT completado: +200m
- Rezo completado: +800m
- QA / QB / QC escuchado: +150m c/u
- Canto del epílogo completo: +200m
- Micro-aprendizaje completado: +600m
- Bonus bloque (5 misterios): +1000m

**Preguntas de reflexión (audio y orar, igual):**
- Primera respuesta: +650m
- Actualización posterior: +325m (Math.floor(650/2))

**orar.html — por audio completado:**
- `rezar`: +1200m / `contempl`: +800m / `canto`: +600m

## Racha de días consecutivos

*Estado: marcador y splash implementados + banco de pruebas (`tools/test-racha.js`, 79). **PENDIENTE prueba visual en dispositivo.***

**Qué gana un día: UN Misterio rezado, en cualquiera de los cuatro modos** (audio, orar, rezar y **mini** — un Misterio-puerta de Sanar es un Misterio rezado)**.** Simétrico a propósito — no cuesta más ganar el día en el Libro que en Audio.

**No sirven los metros.** `dailyGoal/data.historial` cuenta metros, y un día de solo escuchar una pregunta (150 m) no es un Misterio rezado. Por eso la racha lleva su propio registro.

**Dónde vive** — `users/{uid}/dailyGoal/data` → campo `racha = { ultimoDia: 'YYYY-MM-DD', actual, mejor }`. Ese documento se eligió por dos razones prácticas: `dailyGoal/{doc}` **ya está permitido en `firestore.rules`** (una subcolección nueva habría exigido desplegar reglas, y las reglas listan cada subcolección una a una), y **index/crecer ya lo leen en el arranque**, así que el marcador no cuesta ni una lectura extra. *(No en `gamification/stats`: dispara el trigger de `badge-check.js` en cada escritura.)*

**`racha.js` es lógica pura** — sin red ni SDK, como `functions/economia.js`. Cada página hace su propia E/S (audio con el SDK modular, orar/rezar con compat) y le pregunta al módulo qué hacer. Por eso se prueba entero en node.

| Función | Qué resuelve |
|---|---|
| `calcular(previa, hoy)` | → `{cambio, racha, previa}`. **Idempotente por día**: encadenar Misterios devuelve `cambio:false` a partir del segundo. De aquí sale la garantía de que el splash salga una sola vez al día. |
| `paraMostrar(racha, hoy)` | La regla de vigencia: hoy o ayer → el número; más atrás → 0. **Nunca se muestra `actual` a ciegas**: se queda viejo en cuanto pasa un día y enseñaría una racha de 30 a quien lleva un mes fuera. |
| `fusionar(a, b)` | Gana la más avanzada. Cubre a la vez el rezo sin red y el segundo dispositivo, sin cola de reintentos. |
| `pendienteHoy(racha, hoy)` | Viva pero hoy sin ganar todavía. |

**Enganches** — `registrarRachaHoy()` en los cuatro modos: `completeSession()` de audio, `completeMystery()` de orar y de rezar, y el umbral del epílogo en mini (junto a `marcarCompletado`, pero **sin depender de `PAINID`**: se reza el Misterio, haya pain o no). Tres detalles que el banco vigila:

- Se registra **antes** del `if(dots[bIdx])return` de `completeMystery`: rezar un Misterio ya rezado sigue siendo rezar, y la racha pregunta si hoy rezaste, no si avanzaste.
- **Primero localStorage, luego Firestore** (`cruzando_racha`): una oración no se pierde por red; la siguiente escritura reconcilia con `fusionar`.
- El guardián de sesión lleva **el día, no un booleano** (`_rachaDiaRegistrado === hoy`): una pestaña abierta que cruza la medianoche puede ganar el día siguiente.

**Romper la racha no castiga.** No hay aviso de pérdida ni cuenta atrás: el marcador muestra 0 y el siguiente Misterio la deja en 1. `mejor` sobrevive siempre.

**El marcador** (`streak-display`, el 🔥 de la barra de stats de index y crecer) llevaba un `0` escrito a mano en el HTML que **nadie escribía nunca**. Ahora `pintarRacha()` lo pinta en las dos fases del arranque: desde localStorage sin red, y corregido con `fusionar` cuando llega el snapshot. *(Ojo: `checkMetaStreak()` no es la racha pese al nombre — es la meta de metros. Colisión de nombre, como `canjearCodigo`.)*

### El splash de incremento

Se muestra **al final de todo, justo antes de volver al mapa**, y solo el día en que la racha subió. `racha-splash.js` es autosuficiente: inyecta su CSS una vez y monta el velo bajo demanda.

**La garantía de "una sola vez al día" no vive en el splash**: viene de que `Racha.calcular` es idempotente, así que el segundo modo que se rece hoy nunca llama a `marcar()`. El flujo es `registrarRachaHoy()` → `RachaSplash.marcar(de, a)` si hubo cambio → `goTo('crecer.html')` → `await RachaSplash.mostrarSiHay()`.

**Enganchado en el embudo, no en cada botón:** el `goTo()` de audio, orar y rezar comprueba si el destino es el mapa; así quedan cubiertos la barra de navegación, los botones de las celebraciones y el epílogo de una vez. Dos rutas necesitan enganche a mano: la rama de `history.back()` de `salirDeOrar` (no pasa por `goTo`) y el `volver()` de mini (va a sanar, no al mapa). El `_goHome()` de audio ahora pasa por `goTo` en vez de navegar a pelo.

⚠️ **Toda salida lleva alternativa** (`.then(ir, ir)` y `else ir()`): si `racha-splash.js` no cargara, la navegación no puede quedarse colgada.

**El material, no la coreografía.** La secuencia viene del demo y se conserva entera —el número viejo sube y se va, el nuevo entra desde abajo con rebote, la llama se enciende— pero **no es una tarjeta con sombra sobre un velo gris**, que es el registro de las apps de rachas: va a sangre sobre el mismo velo hondo de la pantalla de canto y del diálogo de salida de mini, para encadenar con el cierre del Misterio en vez de apilarse encima. Cormorant Garamond para el número, 🔥 conservado, `z-index: 950` (sobre el epílogo 500 y las celebraciones 900; bajo el DEMO completado 9999).

**Paleta propia y cerrada** (`--rs-tinta`, `--rs-llama`, `--rs-velo-bg`): `--orange` solo existe en index/crecer y mini ni siquiera tiene `--text`. Sobre un velo oscuro se ve igual en las cinco páginas y en los dos temas sin depender de nadie.

**Núcleo 2.0 s + 0.35 s de salida.** Toque en cualquier parte → salta al estado final y cierra; `prefers-reduced-motion` entrega la composición ya formada. Dos temporizadores de cierre (el normal y una red de seguridad) para que la navegación que espera detrás nunca se quede bloqueada.

*El demo original (`racha-splash.js` que pasó el usuario) no entró tal cual: venía con mojibake (UTF-8 leído como Latin-1 — el 🔥 salía como `ð¥`), la mitad del CSS inyectado sin usar (define `.splash-number`/`.splash-message.pop` pero el JS ponía `style.animation` en línea), naranja `#FF7F09` horneado, `z-index:999` colisionando, y sin salto ni `reduced-motion`.*

## Micro-aprendizaje (audio.html)

Aparece solo en misterios 1, 6, 11, 16 (primero de cada bloque).
- Si `microDone[bloque]` es false en Firestore → muestra pantalla `scr-micro` antes del player.
- Si ya está hecho → muestra botón "Preparación" al tope de los controles del player.
- Se puede desactivar con `cruzando_prefs.microInAudio = false`.
- Al completar el micro en audio.html, escribe `microDone[bloque] = true` en `users/{uid}/progress/{nivelId}` (mismo campo que lee orar.html).

## Reflections (diario.html)

- **audio.html** escribe: `users/{uid}/reflections/{nivelId}_{bloque}_{misterioIdx}_q{qi}` con campos `{ nivelId, bloque, misterioIdx, questionIdx, question, text, confirmedAt }`.
- **orar.html** escribe: mismo formato.
- **diario.html** lee: toda la subcolección `reflections` del usuario.
- Hay un fallback en `loadReflections()` de audio.html para el formato antiguo (`{nivel}_{cuaderno}_{misterio}`).

## Sanar (sanar.html) — entrada emocional

Módulo maduro (~1250 líneas de IIFE). Carga **Firebase compat + `plan-utils.js`** (patrón de orar/audio): 3 scripts compat + inline init (`initializeApp`, `_db`/`_auth`, shim `window._fbFirestore`). **Arranque diferido tras `onAuthStateChanged`**: con sesión captura `uid` (`window._obUID`), resuelve el plan real del doc (`window.currentPlan = resolvePlan(userData)`) y arranca; sin sesión → redirect a `index.html`. El gate developer (`DEV`) se resuelve así de verdad (no del caché frío; deep link no cae en falso `free`); `effectivePlan()` honra el "ver como".

Máquina de 4 fases (`estado.fase`): `onboarding` → `elenco` → `acogida` → `handoff`.

0. **Onboarding de afinidad** (Fase B) — test guiado de 5 pantallas (`estado.obPaso` 0-4): bienvenida → tono (P1 single) → áreas (P2 multi, máx 4 con desmarcado) → anhelo (P3 single) → cierre personalizado. Datos en constantes `TONOS`/`ANHELOS`/`AREAS` (cada área mapea a un eje). Se muestra si no hay perfil **o** `?rehacer=1`; si ya hay perfil, salta al elenco. **Desacoplado de la carga de datos**: se pinta al instante y los JSON del elenco bajan en 2º plano (`cargarDatos()`/`entrarElenco()`); si fallan al terminar → aviso amable con reintentar, no error seco.
1. **Elenco** — catálogo de *pains* (dolores) en un **wheel 3D con scroll-snap**. Cuatro modos:
   - `navegar` (recorrer todo), `buscar` (texto libre: frase + tags ocultos), `ejes` (chips por eje), `misterio` (numberpad tipo PIN para cargar un `mid` — **solo plan `developer`**).
   - **Orden del wheel centralizado en `ordenElenco(list, modo, _perfil)`**. user+navegar → `ordenarPorAfinidad(list, perfil, _completados)`: **sort de clave compuesta** `(–afinidad, completado?1:0, índice)` → 4 grupos: **afín-pendiente → afín-completado → no-afín-pendiente → no-afín-completado** (el completado hunde *dentro* de su banda de afinidad, no globalmente; nunca filtra, todo sigue clicable). developer+navegar → orden de itinerario (mid canónico), sin check ni hundimiento. buscar/ejes → sin reordenar (pero sí muestran check).
   - **Check "rezado"** (Pieza 2): badge discreto en la tarjeta de un pain completado, **solo modo user**; va dentro del botón → se desvanece con la opacidad 3D del wheel. `_completados` = `Set(painId)` leído de `progress/sanar` en el mismo `Promise.all` del arranque.
   - Tocar la tarjeta central abre un **velo de foco** de confirmación antes de entrar.
2. **Acogida** — 1-N pasos definidos por Misterio en `m.acogida`. **7 mecánicas interactivas**: `corazones`, `termometro` (slider vertical), `cuerpo` (silueta + lista accesible), `sendero` (tiempo), `cercania` (colocar el "yo" ante Lux), `peso` (bulto creciente con arte R2), `mosaico` (fallback universal). Cada paso hace `commit(tipo, valor, eco)`; los ecos se reservan para el handoff. Soporta retroceso restaurando estado.
3. **Handoff** — muestra los ecos acumulados uno a uno y presenta el Misterio-puerta. Botón "Entrar al Misterio" → `mini.html?mid=…&pain=…`.

**Perfil de afinidad** → `users/{uid}/profile/afinidad`: `{ version, status:'complete'|'skipped', tono, anhelo, areas[], ejes{7 claves}, createdAt, updatedAt }`. `ejes` = pesos por eje (cada área elegida +1); es lo que Fase C lee para ordenar. `guardarPerfilAfinidad()` escribe **localStorage primero** (`cruzando_afinidad`, mirror + flag "visto" + `pendingSync`) y luego Firestore vía el shim; `createdAt` se fija solo la 1ª vez (read-before-write, sobrevive al rehacer), `updatedAt` siempre; si falla la red, `pendingSync` reintenta en el próximo arranque.

**Datos** (`data/`): `tags.json`, `acogida-plantillas-v1.json`, `{elemento}-pains.json`, `pains-index.json`. Piloto sobre `ELEMENTO = '0101'` (único elenco con datos hoy).

**Estado (honesto):**
- **Fase A** (cimientos: `plan-utils.js` + Firebase compat + uid tras Auth + gate developer robusto + `ordenElenco` centralizado) — **PROBADA en navegador** ("Cargando…" fugaz, developer OK, "ver como free" oculta el modo Misterio).
- **Fase B** (onboarding de afinidad) y **Fase C** (reordenamiento) — **implementadas + lógica probada en node** (sort de afinidad y 4 grupos), **PENDIENTE prueba en dispositivo** (que `_perfil` llegue del doc tras Auth y el elenco se repinte).
- **Pendiente:** `guardarAfinidad(pain,senales)` (señal implícita de uso, post-acogida) sigue como `TODO` — separado del perfil del test.

## Mini sesión (mini.html) — Misterio-puerta

Reproductor cinematográfico a pantalla completa (~750 líneas). Destino de Sanar. **Todo se deriva del `mid`** de la URL (`?mid=010101&pain=…`), sin hardcode: elemento, número global (1-20), assets R2 y `data/{elemento}.json`.

Flujo de "momentos" (`STEPS`): **Canto** (karaoke `.lrc` sobre carrusel Ken Burns procedimental) → **Palabra** (UBIBLE) → **Contemplación** (CONT) → **Rezo** (con beads/rosario sincronizados vía `data/bead_sync.json`) → **Oración final** (PRAY) → **Epílogo** (canto / diario / concluir).

Buckets R2: `R2_ILU` (ilustraciones), `R2_MUS` (música/lrc), `R2_AUD` (audios). Paleta por Mundo desde `tema.paleta` del JSON. Diálogo de confirmación al salir integrado con `gestures.js` (intercepta el atrás de iOS).

**Firebase + marca de completado (Pieza 1)** — *implementado + lógica probada en node, PENDIENTE prueba end-to-end en navegador*:
- Firebase compat cableado en `<head>` (mismo patrón que sanar): `_db`, `_auth`, shim `window._fbFirestore`. **Fundación genérica** (servirá al diario y al crédito futuros). `onAuthStateChanged` resuelve **en paralelo**: la reproducción NUNCA espera a Auth (arranque desde la URL sigue síncrono).
- Al **llegar al epílogo** (embudo `goStep`, antes de `goEpilogue`) se marca el pain: `users/{uid}/progress/sanar` → `pains[PAINID] = {firstCompletedAt (read-before-write, conserva), lastCompletedAt, count}` (merge). **Granularidad PAIN** (no mid): completado = rezó de verdad ese pain.
- **Guardia de sesión** (`_completadoMarcado`): una marca por sesión (re-visitar el epílogo no re-cuenta). **Respaldo offline**: localStorage `cruzando_pains_completados` + cola `pendingSync`; `_flushPendientes()` al resolver Auth. Una oración real no se pierde por red.

**Pendientes (`TODO`):** guardar el diario en `reflections/…` (mismo formato que orar/audio), alternar pistas de rezo MA/MB/L_MA, y **consumir crédito** (comentario reubicado al epílogo, sin construir — espera el modelo económico).

## Reskin de players (audio/rezar/orar) — unificación con mini

*Estado: implementado + harness (sintaxis/lógica). **PENDIENTE prueba visual en dispositivo.***

- **Barritas de progreso** movidas a la **topbar** (flotando centradas); botones agrupados a los lados. `audio` = 10 barritas de sección; `rezar` = 7 barritas (mapeo 11→7 por tipo, "Conclusión" al completar el Misterio 5); `orar` = 5 barritas (Misterios del set, no tocables).
- **Barra de herramientas sin el hilo del rosario.** `audio` = 3 botones (−10s / play / preguntas) + saltos de sección solo developer; `rezar`/`orar` mantienen sus botones sin hilo.
- Títulos a **1.65rem / 23px** en las tres. `audio`: imagen del hero a `object-fit:cover` (llena el hero como mini). Variable `--seg-idle` por tema (contraste de barritas apagadas en claro y oscuro).

## Karaoke de canto + `canto.js` (motor compartido)

*Estado: implementado + harness + **golden test** (motor viejo vs. nuevo, frame a frame). **PENDIENTE prueba visual en dispositivo.***

- Pantalla de canto **full-screen** con `.lrc` sincronizado, Ken Burns, botón **Saltar** (20s en sesión / 0s en epílogo).
- **Escalera de degradación (3 peldaños):** `.lrc` → letra estática de `{nivelId}-cantos.json` → no abre.
- `audio` **Fase 1** (karaoke en sesión) + **Fase 2** (epílogo simplificado: helper de botones que reutiliza el karaoke; matriz de planes free/premium/demo; +200m con guardia; "vuelve mañana" diferido a Salir). `rezar` **Fase 3** (BGM se pausa/reanuda según estado previo).
- **Fase 4 — `canto.js` compartido**: motor extraído de audio+rezar (**mini NO lo usa**, es el ancestro divergente). CSS en `canto.css` (`<link>`), HTML del overlay inyectado por el módulo. Consumidores futuros (retiro, cantos) → `<script>` + `Canto.init({...})`.

## Ciclo "completado" (Piezas 1-2)

*Estado: implementado + lógica probada en node. **PENDIENTE prueba end-to-end en navegador.***

- **Granularidad PAIN** (no mid): completado = llegó al epílogo de mini (rezó de verdad). Cada pain+acogida es experiencia orante propia.
- **Pieza 1 (mini)** — escribe `users/{uid}/progress/sanar` (ver sección Mini): Firebase compat, marca al epílogo, guardia de sesión, respaldo `pendingSync`, Auth en paralelo.
- **Pieza 2 (sanar)** — lee `_completados` (Set, misma pasada del `Promise.all`), pinta el check discreto (solo user), **sort de 4 grupos** (hundir por banda de afinidad, no global). Check universal en modo user (buscar/ejes incluidos); hundimiento solo en navegar-user. Retrocompatible con Fase C.
- **Refresco**: `mini.volver()` = `location.href` a `sanar.html` → recarga completa → re-lee `progress/sanar` (sin detección de foco).
- **PENDIENTE en dispositivo**: ciclo completo (rezar en mini → volver → check + reordenado), render del check en el wheel 3D, offline (rezar sin red → sube al reabrir).

## Kit de recompensas (STANDBY — oculto tras flag para el MVP)

*Estado: implementado + banco de pruebas (`tools/test-flag-recompensas.js`, 35 pruebas). **PENDIENTE prueba visual en dispositivo.***

El kit estaba a medio construir y se apagó entero para el lanzamiento al grupo de prueba. **Nada se borró y ningún dato de Firestore se toca**: la ocultación es 100 % de presentación.

**El interruptor** — `flags.js` (patrón de `appcheck-key.js`): `window.MOSTRAR_RECOMPENSAS = false` + la puerta única `window.recompensasON()`. Se compara contra `true` **exacto**: una página que olvide cargar `flags.js` deja el kit **oculto**, no visible — falla del lado seguro. Cargado en 9 páginas (index, crecer, extras, cantos, world, audio, orar, rezar, diario), **siempre antes de `utils.js`**. Encender en el futuro = `false` → `true`, una línea.

**Qué apaga** (10 guardas de una línea):

| Pieza | Dónde |
|---|---|
| Nodo cada-5 → separador mudo | `crecer.html` render del `forEach` de `type==='treasure'` |
| Popup del cofre | `openTreasure()` sale temprano |
| Esferas 🎁 de recompensa pendiente | no se llama `verificarRecompensas()` |
| Botón "Extras" del drawer | oculto entero en `index`+`crecer` (no un "Próximamente": no prometer lo que no se cumple) + `goToExtras()` bloqueado |
| Tienda por URL directa | velo/`location.replace` al tope de `extras.html` (salida conservada para `developer`) |
| Filtro "Extras" de la biblioteca | fila oculta en `cantos.html` (contador 0 = sección vacía) |
| Toast "🏅 ¡Medalla desbloqueada!" | callado en `audio`+`orar` — **el dato se sigue escribiendo**, solo se calla el aviso |
| Skin fantasma | `applySavedSkin()` bajo el flag (`localStorage.activeSkin` NO se borra) |
| Cofre por cuaderno | `world.js` |

**El nodo cada-5 no desaparece, se transforma.** Tres estados, un interruptor: hoy = cofre · MVP = `.tramo-node` (separador de 32 px, `pointer-events:none`, sin `onclick`, sin cofre/etiqueta/candado, tokens `--pater-bg`/`--pater-border`) · futuro = cofre otra vez. Jerarquía deliberada: 32 px contra los 104 px de un Misterio y los 18 px de un pater — marca de tramo, ni destino ni cuenta del rosario.

**El reparto del tramo va con el interruptor.** `MAP_TRAMO_F` / `MAP_PATER_F` en `crecer.html`: `cofre: 0.35/0.65` · `separador: 0.072/0.447`. Las fracciones originales reservaban sitio arriba para un cuerpo de 104 px + etiqueta; con un punto de 32 px dejaban **145 px** de vacío tras la última esfera y el tramo se veía desierto. El juego nuevo reparte el hueco en **tres vacíos de 73 px** (esfera → separador → pater → esfera). Solo mueven dos `div` absolutos: `MAP_BLOCK_GAP` sigue en 260, así que `totalH`, el bioma, las esferas y las `x` de todos los nodos son idénticos en los dos estados (probado).

**No descuadra nada** (verificado): `computeAllPositions`, `DONE_COUNT` y `drawMapPath` **sin tocar**. El nodo es `position:absolute` → su tamaño no participa del layout; `globalIdx` solo avanza en los Misterios; el sendero se dibuja solo sobre `mPts`. `chestState` se sigue calculando y cacheando igual, así que al encender el flag el cofre vuelve con su estado correcto sin migración.

**Frontera con los metros** — la acumulación (corazón del MVP) queda intacta. La **única resta** de `totalMeters` en toda la app vive en `extras.html` (`executePurchase`), dentro de la tienda oculta: inalcanzable. `DONE_COUNT` (progreso) y `chestState` (cofre) se calculan en el mismo bucle pero son independientes; el bucle no se tocó.

**Ojo con el nombre**: `canjearCodigo` (functions #9) son **códigos promocionales de beta**, NO la tienda. Colisión de nombre. No tocar al trabajar el kit.

### ⚠️ DEUDA BLOQUEANTE antes de encender el flag

`extras.html` **deja pagar dos veces el mismo producto**. Firestore guarda `extras/purchases.items` como **objetos** `{id,type,purchasedAt}`, pero `getProductState()` hace `userPurchases.indexOf(product.id)` sobre **strings**: nunca coincide, así que tras recargar la página lo comprado vuelve a mostrarse como "Canjear" y se cobra de nuevo. (En la misma sesión sí funciona, porque tras comprar se concatena el `id` suelto — otra inconsistencia de forma del mismo dato.)

**Arreglarlo —o eliminarlo en el rediseño de la tienda— ANTES de poner `MOSTRAR_RECOMPENSAS = true`.** No exponer la tienda con este bug.

**Otros pendientes del kit** (no bloqueantes, pero es lo que había "a medias"): los premios que anuncia el popup del cofre son texto fijo en `BLOQUES_MAP` y no existen en el catálogo; `openTreasure` no otorga nada y su estado `opened` no persiste; el cofre de `world.js` es placeholder puro; BGM y estampitas se compran pero nada las consume; `SKINS_CATALOG` de `utils.js` es un espejo manual del JSON que se desincroniza a la primera skin nueva.

## Modelo económico (DISEÑADO, NO implementado — proyecto futuro)

- **Híbrido**: suscripción (mensual/anual, todo incluido) **O** créditos (renta pain por pain). **Unidad = pain**; 1 crédito = 1 pain. **Cobro al ENTRAR**. Ventana de acceso **1 semana**. Paquetes vía **Stripe** + créditos de regalo al registrarse. El completado anotará vía `sub | credito` para analytics.
- Arquitectura técnica (Stripe, shape Firestore, cobro atómico) **en inspección, sin implementar**.
- **Crédito en mini**: comentario TODO reubicado al epílogo ("completó = pagó", con guardia por sesión) — documentado, **no construido**. No implementar por pedazos: espera el modelo completo.

## Consentimiento de términos + App Check (registro)

*Estado: implementado + bancos de prueba en node. **PENDIENTE**: registrar la clave reCAPTCHA y probar el alta en dispositivo.*

**Pantalla de acceso en dos caminos** (`index.html` y `crecer.html`, gemelos):
`#login-paths` (Entrar / Crear cuenta) → `#login-providers` (Google / correo + Volver).
La variable `authMode` (`'login'|'register'`) manda; la casilla `#chk-terminos` **solo** se muestra y solo bloquea en `register`. Quien vuelve no ve casilla.

- `terminosAceptados()` es la **puerta única** del alta: la llaman el botón de Google, el de correo y el submit del modal. Nunca premarcada (`_terminosReset()` al entrar al camino).
- El enlace "¿No tienes cuenta?" del modal **no** cambia de modo dentro del modal: lo cierra y devuelve al camino correspondiente, para que el alta no empiece sin pasar por la casilla.
- **Google crea la cuenta si el correo es nuevo**, aunque se haya pulsado "Entrar". Por eso se mira `getAdditionalUserInfo(result).isNewUser` y, si nació ahí, se deshace con `deleteUser` (`_deshacerAltaAccidental`). Lo mismo cierra el agujero de `audio.html`, cuya pantalla es solo de entrada y remite al inicio para el alta.

**La constancia** — callable `aceptarTerminos({version, metodo})` (functions/index.js #9):
escribe `users/{uid}.terminos = { aceptado, fecha (serverTimestamp), version, metodo }`, **write-once** (read-before-write: conserva la primera fecha). La versión la fija `TERMINOS_VERSION` del **servidor**, no el cliente. `terminos` está en `blindados()` de `firestore.rules` y en la lista de la regla `create`: el cliente no lo puede fabricar, alterar ni borrar. **No toca `crearCuentaEconomica`** (aquel siembra `billing/state`, campo distinto, sin carrera).

**Orden del alta** (email): casilla → `createUserWithEmailAndPassword` (App Check muerde aquí; si rechaza no nace nada) → `setDoc(users/{uid})` → `aceptarTerminos`. Si la callable falla por red, el intento queda en `localStorage.cruzando_consent_pending` (con `uid`, para no regalarle el consentimiento a otra persona del mismo dispositivo) y `flushConsentimiento()` reintenta tras `ensureUserDoc` en `onAuthStateChanged`.

**App Check (reCAPTCHA v3, invisible)** — inicializado en las 12 superficies que arrancan Firebase (modulares: index, crecer, audio, cantos, world.js; compat: sanar, mini, orar, rezar, diario, extras, retiros). La clave vive **solo** en `appcheck-key.js` (`window.RECAPTCHA_SITE_KEY`); **vacía = no-op** en todas. El **bloqueo se activa en la consola**, no en el código: enforcement sobre Auth está en *Preview* y es todo-o-nada, así que primero va en **monitoreo**.

**Bancos de prueba:** `functions/test-terminos.js` (la callable real, con Firebase de mentira) y `tools/test-terminos-cliente.js` (extrae el bloque de `index.html` y lo corre en un `vm`; verifica además que `crecer.html` sigue siendo su gemelo).

**Beta actuales: fuera de esta entrega** por decisión — grupo conocido, sin consentimiento diferido. Solo las altas nuevas registran `terminos`.

## Principios de contenido

- **Curaduría exigente de vínculos pain→Misterio**: vincular un pain a un Misterio es decisión **pastoral seria**, no tag de conveniencia. Pocos pains por Misterio, cada uno justificado (a veces 1-2). Un vínculo se justifica solo si ese Misterio + esa Acogida responde genuinamente a esa necesidad.
- **Cada pain+acogida es experiencia orante propia** → por eso el completado es por **pain** (no por mid) y la renta es por **pain**.

## Estado de integración por archivo

| Archivo | Nav bar | Tema unificado | Plan/beta | Micro | Metros |
|---------|---------|---------------|-----------|-------|--------|
| index.html | ✅ | ✅ `cruzando_theme` | ✅ `resolvePlan` | — | ✅ lee Firestore |
| world.html | ✅ | ✅ | ✅ | — | — |
| audio.html | ✅ | ✅ | ✅ | ✅ | ✅ progresivos |
| orar.html | ✅ | ✅ (parcial) | ✅ | ✅ | ✅ |
| diario.html | ⚠️ no revisado | ⚠️ | ⚠️ | — | — |
| sanar.html | ✅ | ✅ `cruzando_theme` | ✅ Firebase+`plan-utils`, gate `developer` tras Auth | onboarding afinidad | ❌ (perfil + completados persisten; `guardarAfinidad` uso TODO) |
| mini.html | — (pantalla completa) | ✅ `cruzando_theme` | ✅ Firebase compat (uid tras Auth, no bloquea) | — | ❌ marca completado ✅; diario/crédito TODO |
| extras.html (tienda) | ✅ | ✅ | ✅ | — | 🔒 **oculta** tras `MOSTRAR_RECOMPENSAS` (standby) |

*Reskins (audio/rezar/orar) y karaoke/`canto.js`: implementados + harness/golden test, **pendiente prueba visual en dispositivo**.*

## Pendientes conocidos

**Pruebas en dispositivo pendientes (esta sesión):**
1. Reskins de players (audio/rezar/orar) — prueba **visual** en dispositivo.
2. Karaoke / `canto.js` — prueba **visual** (harness + golden test ya pasados).
3. `sanar.html` Fases B-C — que `_perfil` llegue del doc tras Auth y el elenco se repinte reordenado (Fase A ya probada).
4. Ciclo "completado" end-to-end — rezar en mini → volver a sanar → check + reordenado; render del check en wheel 3D; offline (rezar sin red → sube al reabrir).

**Tareas anotadas (aparte):**
5. **Settings** de `index.html`/`crecer.html` — botón "Rehacer mi perfil de afinidad" → `sanar.html?rehacer=1` (sanar ya reconoce el parámetro).
6. `sanar.html` — `guardarAfinidad(pain,senales)` (señal implícita de uso) sigue `TODO`, para una fase futura que combine test+uso.
7. `mini.html` — diario en `reflections/…`, alternar pistas MA/MB/L_MA, y crédito (esperan el **modelo económico**, no implementar por pedazos).
8. `diario.html` — revisar nav bar, tema y plan (nunca auditado).
9. Contenido Mundo 2 — faltan `0201.json`, `0202.json`, etc.
10. Verificación en producción: respuestas del modal de audio.html → diario.html.
11. **App Check**: registrar la clave de sitio reCAPTCHA v3 para `cruzando.app`, pegarla en `appcheck-key.js`, desplegar y mirar métricas unos días **antes** de activar el bloqueo en la consola (Auth primero; Firestore/Functions después).
12. Alta en dispositivo: casilla bloqueando por los dos métodos, `users/{uid}.terminos` escrito, y que "Entrar" siga sin fricción.
13. `firebase-service.js` es código muerto (ninguna página lo carga) y todavía registra sin casilla: borrarlo o alinearlo si alguna vez se conecta.
14. **Kit de recompensas en standby** — prueba **visual** en dispositivo con `MOSTRAR_RECOMPENSAS = false`: que el nodo cada-5 se vea como separador discreto (claro y oscuro), que el camino no se descuadre, que no quede ningún cofre/botón/filtro muerto, y que los metros se sigan acumulando y mostrando normal.
15. **DEUDA BLOQUEANTE del kit** — el doble cobro de `extras.html` (`getProductState` compara objetos contra strings) debe arreglarse **o eliminarse en el rediseño de la tienda ANTES** de poner `MOSTRAR_RECOMPENSAS = true`. Ver § Kit de recompensas.
