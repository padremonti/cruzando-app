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
| `cierre.js` / `cierre.css` | **El cierre de una sesión de rezo.** `Cierre.decenario({desde, color, titulo, metros})` → promesa. La columna se cierra en decenario. CSS por `<link>`, trayectorias generadas por el módulo. Ver § El cierre. |
| `sarta.js` | **Geometría del decenario y la camándula.** `Sarta.geometria(forma, {decenas})` — `decenas:1` da el decenario (16 cuentas), `decenas:5` la camándula (60). Pura, sin DOM. Ver § La sarta. |
| `cuentas.js` | **Motor pasivo de la columna de cuentas del rezo** (1 Padrenuestro + 10 Ave Marías + Cruz Lux). `Cuentas.crear({audio: () => el})`. Lo usan audio y orar; rezar y mini conservan el suyo. Ver § Columna de cuentas. |
| `bloques.js` | **Origen único del color de los cuatro bloques.** `window.COLORES_BLOQUE` + `window.rgbaBloque(bloque, alfa)`, y estampa 12 variables CSS (`--goz`, `--goz-color`, `--goz-rgb`, ×4). Va en el `<head>`. Ver § Colores de bloque. |

## El cierre de una sesión (`cierre.js`)

*Estado: los **tres cierres** implementados —decenario, Rosario y rosetón— con salida a las Letanías + banco de pruebas (`tools/test-cierre.js`, 73). **PENDIENTE prueba visual en dispositivo.***

**La columna del rezo se cierra en decenario.** Es el mismo objeto que el usuario tuvo a la derecha toda la sesión, enrollado. Once cuentas contra once, Padrenuestro con Padrenuestro:

| | Sale de | Llega a |
|---|---|---|
| Cuentas | `Cuentas.instantanea()` — posiciones **reales** en pantalla | `Sarta.geometria('circulo', {decenas:1})` |
| Cruz | la Lux de la columna | la Cruz del decenario |

De ahí que **el primer frame sea idéntico al último de la sesión**: nadie ve un corte. Hay una prueba que comprueba que el 0% de cada trayectoria cae donde estaba su cuenta.

**Dónde se dispara, y si espera** — no es lo mismo en los cuatro:

| Modo | Cuándo | ¿Espera? |
|---|---|---|
| `audio` | fin de sesión, en `completeSession` | **sí** — el epílogo sube después |
| `mini` | al acabar el **Gloria**, saliendo del paso de rezo | **no** — la Oración final ya suena debajo |
| `rezar` | al cerrar cada decena, en `onTrackEnded` | **no** — la siguiente pista ya arranca |
| `orar` | al pulsar **Amén**, tras marcar el Misterio | **sí** — nada suena y el usuario pulsó |

La decisión de producto detrás del "no espera": **sin tiempo muerto** entre lo que se rezó y lo que sigue.

### El Rosario

Los cinco decenarios se desenrollan y se enlazan en la camándula. **La correspondencia no hay que inventarla:** el lazo son 55 = 5 × 11, y la cuenta *i* del decenario *k* es la cuenta `k·11+i` del lazo. Cada cuenta lleva su `decena`, así que el escalonado por grupos sale solo.

Cada decenario **arranca enrollado** sobre el punto medio de su futuro arco, con el radio que le toca a 13 unidades de recorrido — así las cinco sartas se leen como cinco decenarios de verdad, no como cinco manchas.

**La coreografía** (3 s, un beat más que el decenario): las cinco decenas entran **de una en una** (90 ms entre decenas, 12 ms dentro de cada una, para que el aro se abra en vez de estirarse) · los **cinco Padrenuestros destellan** al quedar en su juntura, que es lo que hace legible que el lazo son cinco tramos · la cola desciende · **la Cruz sube desde debajo del encuadre** y toma su sitio al final de la cola: es la última en llegar y su llegada dispara el resplandor, de ahí su carácter de sello · la palabra espera a la Cruz (2,55 s).

**Dónde:**

| Modo | Cuándo |
|---|---|
| `audio` | en el bonus de bloque —el único sitio donde se sabe que los cinco están rezados por primera vez— y se muestra entre el decenario y el epílogo |
| `orar` | al completar los cinco puntos del bloque, antes de la pantalla de celebración |
| `rezar` | en su celebración: rezar **es** el Rosario de una sentada |

⚠️ **En audio sustituyó al Mariano y al toast del bloque.** Se disparaban justo ahí y el epílogo los tapaba a los pocos cientos de milisegundos (era el hallazgo (c) del inventario). Los metros del bonus van ahora dentro del Rosario, que sí se ve. Hay una prueba que vigila que no vuelvan.

### Y desemboca en las Letanías

Al cerrar un set de cinco, la tradición reza las Letanías. Terminado el Rosario, es a donde apunta el cierre — **ofrecidas, nunca impuestas**: en los tres el botón es secundario, nunca el primario.

| Modo | Cómo |
|---|---|
| `audio` | el epílogo ya las ofrecía en 5/10/15/20; el Rosario ahora va antes |
| `orar` | **nuevo**: `btn-celeb-letanias` en la pantalla de celebración, cableado en sus **dos** finales (bloque de cinco y cuaderno de veinte) |
| `rezar` | ya entraba solo en `RosarioFinal`; se corrigió el **orden** |

⚠️ **En rezar el orden estaba invertido.** `mostrarRosario()` vivía dentro de `celebrar()`, que corre como el `onCerrar` de `RosarioFinal`: el Rosario se coronaba con las Letanías **antes de haberse mostrado**. Ahora se cierra en `onSessionComplete()` —que pasó a `async`— y de ahí se entra a las Letanías.

Al salir de las Letanías se vuelve a la misma pantalla (`onCerrar`), y si `rosario-final.js` no está cargado el botón no aparece: no se promete lo que no se puede cumplir.

### El rosetón — el cuaderno

**El único cierre que no es una sarta.** Se cambia de material: de objetos en una cuerda a **luz atravesando color**. Y el nombre lo da el propio Rosario — un rosetón es la rosa de piedra y vidrio de las catedrales, la misma raíz.

Dos materiales, los dos de datos que ya existían:

| | Sale de |
|---|---|
| **El vidrio** | los cuatro colores de bloque — los cuatro Rosarios rezados son los cuatro paños |
| **La piedra y la luz** | `tema.paleta` del cuaderno (`soft`, `light`, `ultra`) |

Como cada Mundo tiene su paleta, **salen siete rosetones distintos con un solo componente**.

**Veinte pétalos = veinte Misterios.** Se dibujan los veinte desde el principio pero **entran de cinco en cinco**, así que mientras no hay tracería se leen como las cuatro cuñas de los cuatro bloques; lo que los separa en veinte son los nervios menores que llegan después. Por eso no hay que transformar trazados: solo aparecen líneas.

**La coreografía** (3,5 s, el más raro de los tres — uno cada 20 Misterios): la noche cae al fondo del propio cuaderno · las **cuatro cuñas** entran, 140 ms entre bloques · la **tracería** se dibuja del centro hacia afuera —primero los cuatro nervios mayores y el aro, después los dieciséis menores: eso es la rosa abriéndose— · la **luz atraviesa** y proyecta fuera del encuadre · la **Lux ocupa el óculo** y llega la palabra.

⚠️ **El cuaderno son los veinte, no el cuarto bloque.** Los bloques se pueden rezar en cualquier orden, así que cerrar gloriosos no significa haber cerrado el cuaderno. En audio, `cuadernoCompleto()` cuenta los 20 Misterios distintos del historial acotados a ese nivel y cuaderno; en orar, `showAdvanceLevelPrompt()` **es** exactamente ese momento.

### Los emojis salieron sustituidos, no borrados

| Qué | Lo sustituye |
|---|---|
| **🎉** del overlay "¡Completaste el DEMO!" | el rosetón, que corre antes (0101 m20 **es** el cuaderno cerrado) |
| **🙏** en el círculo degradado de la celebración de orar | el Rosario, que corre justo antes |
| El **confetti** de `_obConfetti` | **lluvia de Lux**: 14 cruces en oro y pergamino en vez de 48 rectángulos en siete colores que no aparecían en ningún otro sitio de la app. **Conserva el nombre y la firma**, así que los llamadores —el cierre del bloque 1 y el overlay del DEMO— no cambiaron |

*Queda un 🙏 en `showDailyLimit()` de audio (la pantalla de "vuelve mañana"). No es una celebración y nada lo sustituye ahí; se dejó a la espera de decisión.*

**`Cierre.decenaCompleta(foto)`** es la guarda común: mira si la **Cruz está encendida**, que es lo que `Cuentas` hace justo al pasar la última ventana del rezo. El decenario es la imagen de una decena rezada, no de una columna a medias.

**`mini` y `rezar` conservan su motor de cuentas** y solo crean una instancia de `Cuentas` para **leer** con `instantanea()`: mini el suyo (aro pequeño, oro sobre noche) y rezar el interactivo. Es exactamente para lo que existe `instantanea()`. `mini` usa además su propio oro `#E8B94A` en vez del color de bloque: allí toda la paleta es oro-sobre-noche y un decenario rosa desentonaría con su propia pantalla.

**Encadena, no se apila.** Devuelve promesa, igual que `RachaSplash.mostrarSiHay()`. En `completeSession` el epílogo sube **después**: `mostrarDecenario().then(abrirEpilogo)`. Las capas: decenario **940** → epílogo 500 (debajo, sube después) → splash de racha **950** (al salir al mapa). El banco vigila que el decenario nunca tape al splash.

⚠️ **Nunca impide terminar la sesión.** Si el módulo no cargó, si `Sarta` falta, si la columna no está entera (decena saltada, `rect` corrupto), `mostrarDecenario()` resuelve al instante y el epílogo sube como siempre. Cinco pruebas cubren esa degradación. Una animación no puede dejar al usuario encerrado.

**CSS generado, no un bucle.** Las once trayectorias dependen de dónde estaba cada cuenta en pantalla, así que hay que generarlas — pero se generan como `@keyframes` de `transform`, no como un `requestAnimationFrame` que escriba `cx`/`cy`. Así las mueve el compositor y no compiten con las escrituras a Firestore que ocurren en ese mismo momento. La hoja se retira con el velo.

**La coreografía** (2,5 s de núcleo + reposo): velo · las cuentas viajan a su sitio **escalonadas 30 ms**, combadas un 12% hacia afuera para que la sarta se recoja en vez de teletransportarse · la Cruz baja con rebote y **una** oscilación de péndulo (a esta velocidad, dos se leen como temblor) · un halo recorre el anillo · la palabra y los metros. Toque en cualquier parte → salta al decenario formado; `prefers-reduced-motion` lo entrega ya formado.

**Tokens de movimiento** (`cierre.css`): `--ease-rito` (el rebote que ya usaba `luxAppear`), `--ease-velo` (el de mini), `--ease-salida`, y `--t-breve` / `--t-gesto` / `--t-rito`. Sustituyen a las seis curvas y ocho duraciones sueltas que había repartidas por los reproductores.

## La sarta (`sarta.js`)

*Estado: geometría + banco de pruebas (`tools/test-sarta.js`, 47). **La animación que la usa no está construida** — ver § Animaciones de cierre.*

**Una sarta, dos escalas.** El mismo objeto parametrizado por el número de decenas, así que no hay dos geometrías que mantener:

| | Lazo | Cola | Cruz | Total |
|---|---|---|---|---|
| `decenas: 1` — **decenario** | 1 Padrenuestro + 10 Avemarías | — | ✓ | **11** |
| `decenas: 5` — **camándula** | 5 Padrenuestros + 50 Avemarías | 5 | ✓ | **60** |

**La cola es de la camándula, no de la sarta en general.** Bajando desde la unión: Padrenuestro, 3 Avemarías, Padrenuestro, Cruz. El **decenario no la lleva**: es el aro de diez Avemarías con su Padrenuestro, y de ese Padrenuestro cuelga la Cruz. Por defecto `cola` vale `decenas > 1`; se puede forzar en los dos sentidos.

**Espaciado con una sola regla** —doble junto a un Padrenuestro, sencillo entre Avemarías— de la que salen el lazo, la cola, y la separación de la Cruz en los dos casos.

**Tres formas**, y la elegida para la animación es **`circulo`**: el decenario se cierra en círculo, así que las cinco decenas son cinco arcos **iguales de 72°** y se lee «son mis mismas cuentas, recolocadas». Con `gota` o `capricho` cada decena tendría curvatura distinta y el desenrollado habría que resolverlo cinco veces. `gota` queda guardada para el sello estático (la marca en el mapa, el Diario): es la más holgada y la que más se lee como objeto.

**Cabe en un teléfono.** A 342 px de ancho (pantalla de 390 con márgenes) la cuenta mide 10,3 px de diámetro y el Padrenuestro 14,9 — comparable a los 11 px de `mini.html`. Holgura mínima entre cuentas: círculo 2,3 px, gota 2,7, capricho 1,7. Sin un solo solape. *Mi estimación previa de que no cabría partía de conservar el paso de la columna del rezo; encoger la cuenta era la salida.*

⚠️ **Dos correcciones sobre el boceto original** (`rosaries.js`), las dos con prueba dedicada:
- **La Cruz colgaba de la mitad de la tercera decena** en `circulo`: el muestreo arrancaba arriba mientras la unión estaba abajo, así que salía a 180° del primer Padrenuestro, por la Avemaría 6. `gota` y `capricho` no lo tenían.
- **Faltaba el Padrenuestro que toca la Cruz.** Eran 59 cuentas; con él son 60.

⚠️ **La cuenta crece con las decenas — el decenario es el mismo dibujo a otro zoom.** El trazado mide lo mismo siempre, pero el recorrido baja de 65 unidades a 13 al pasar de camándula a decenario: la unidad de espacio crece ×5. Con la cuenta fija en radio 3, el decenario salía con **5 diámetros de aire** entre cuenta y cuenta —23 veces más que la camándula— y perdía la forma; y la cola, estirada por esa misma unidad, dejaba **la Cruz en `y=571` sobre un lienzo de 300**, invisible. Por eso el radio y la Cruz se escalan por `65 / recorrido` (factor exacto, independiente de la forma) y el dibujo se reencuadra después. A 5 decenas el factor es 1: **la camándula no se mueve ni un punto**, y hay una prueba que fija sus coordenadas.

⚠️ **La Cruz NO escala con el espaciado: escala con el aro.** No es una cuenta — es el emblema que remata el objeto. Escalándola con la unidad, la del decenario salía tan alta como ancho es el aro (`Cruz/aro = 1,00` contra 0,23 en la camándula) y se leía como una Cruz con un aro colgando. Con el aro por vara:

| | Cruz/aro | Cruz/cuenta | Cruz en pantalla | Cordón |
|---|---|---|---|---|
| Camándula | 0,23 | 6,0 | 62 px | 0,065 del aro |
| Decenario | 0,40 | 2,4 | 108 px | 0,065 del aro |

**La del decenario va al doble** (`COLA.cruzDecenario`), y es decisión de diseño, no inconsistencia: en la camándula la Cruz es un elemento entre sesenta cuentas y una cola; en el decenario es el **único ornamento** de un objeto simple, y a la proporción de la camándula se leía tímida.

**El cordón se mide igual, contra el aro** (`COLA.cordon`): en unidades de espacio dejaba medio aro de hilo desnudo, porque la unidad del decenario es cinco veces mayor.

**`caja`** describe lo que de verdad ocupa el dibujo. El decenario es estrecho y alto —aro pequeño, cola larga— y ocupa un tercio del ancho del lienzo, así que quien lo pinte solo puede recortar con eso.

**Reparto por distancia, no por parámetro.** Las posiciones salen de la longitud de arco acumulada: por t del bezier, las cuentas se apelotonarían en las curvas cerradas de la gota y se abrirían en los tramos rectos. Hay una prueba que mide esa desviación.

**`puntoEn(forma, fracción)`** devuelve un punto del lazo por fracción de recorrido — es lo que permitirá interpolar cada cuenta desde la columna recta hasta su sitio sin recalcular la geometría en cada frame. Y cada cuenta lleva su `decena`, para escalonar la animación por grupos.

**Codificación:** `rosaries.js` llegó con UTF-8 leído como Latin-1 («CamÃ¡ndulas», «AvemarÃ­as»), igual que el demo del splash. Hay una prueba que vigila que no vuelva a colarse.

## Columna de cuentas (`cuentas.js`)

*Estado: extraído + dos tintas + congelación, con **golden test** (`tools/test-cuentas.js`, 28 pruebas: motor viejo congelado contra el nuevo, 146 instantes sobre las pistas reales de `bead_sync.json`). **PENDIENTE prueba visual en dispositivo.***

**Qué es.** La columna que acompaña al rezo, sincronizada con `data/bead_sync.json` (11 ventanas por pista: 1 Padrenuestro + 10 Ave Marías). Estaba copiada en los cuatro reproductores.

**Quién lo usa y quién no** — el mapa real, medido:

| Módulo | Situación |
|---|---|
| `audio` · `orar` | **Eran la misma copia**: 37 líneas con 4 de diferencia, y las 4 eran el nombre del elemento de audio (`audioEl` / `rezoEl`). Ahora usan el módulo. |
| `mini` | Misma lógica pasiva con otros nombres (`#beadsCol`, `.bead-lux` en oro). Puede adoptarlo cambiando la config; se dejó por ser el ancestro divergente, igual que con `canto.js`. |
| `rezar` | **No es el mismo motor.** Sus cuentas son **interactivas**: el usuario las toca al rezar, con detección de toques, saltos y spam (`lit-correct` / `lit-white` / `lit-spam`, `beadCount`, `_beadTapTimes`). Es un superconjunto; forzarlo aquí sería arriesgar esa función sin ganar nada. |

⚠️ **El audio va por getter, no por referencia.** `abrirCantoEpilogo()` de audio **reasigna** `audioEl = new Audio(...)`; con una referencia guardada, el `tick` se quedaría mirando a un audio muerto. Hay una prueba dedicada.

⚠️ **La instancia se declara antes de su primer uso.** `const` no tiene hoisting, y `startPlayerSession()` / `renderSession()` la usan cientos de líneas antes del punto donde nació la declaración. El banco vigila el orden.

**`instantanea()` sirve a los cuatro.** Solo lee el DOM —posiciones y estado de cada cuenta, más la Lux— así que la animación del decenario podrá clonar la columna de mini y de rezar sin que adopten el motor. Reconoce también los estados propios de rezar (`lit-white`, `lit-correct`, `lit-spam`) como "rezada". Es lo que hace que el **"frame 1"** de la animación sea idéntico al último frame de la sesión.

### Dos tintas, no un hueco

La cuenta sin rezar era literalmente un agujero: `background:rgba(255,255,255,0.08)` en audio/orar/rezar y `transparent` en mini. Ahora es **una cuenta de verdad en perla apagada** que al rezarse **cambia de tinta**, no que se rellena. Así el decenario se lee como objeto desde el primer momento —que es lo que la animación va a enrollar— y no como una barra de progreso a medio llenar.

Cuatro tokens en el `:root` de cada reproductor (`--cuenta-apagada`, `--cuenta-borde`, `--cuenta-pater-apagada`, `--cuenta-pater-borde`), en el pergamino `#F3EAD8` que la app ya usa en canto, mini y el splash. Un futuro `cuentas.css` compartido solo tendría que mudarlos.

⚠️ **En `rezar` hubo que tocar la afordancia.** Su cuenta activa era `background:transparent` **a propósito** —está hueca porque espera tu toque—. Con las apagadas ya rellenas, la activa habría quedado **más vacía que las que aún faltan**, invirtiendo el significado. Ahora la activa lleva la tinta apagada de fondo y conserva su borde de color y su pulso. Es el punto que más pide revisión visual.

### La columna sobrevive al rezo (solo en audio)

`congelarAlCompletar: true`. Cuando el `tick` enciende la Cruz —la decena está entera— la columna se **congela**: `pista()` deja de tocarla y ningún cambio de pista la borra. Sigue visible **tal cual quedó, sin atenuar**, durante Q1/Q2/Q3 y la oración final. `reiniciar()` la descongela al cambiar de Misterio.

Antes se ocultaba en el primer cambio de pista: al usuario se le quitaba de la vista justo lo que acababa de rezar. **Es mejora por sí sola**, y además es el "frame 1" del que partirá el decenario.

`orar` **no** congela: allí la columna pertenece al tool de rezo y el usuario sigue leyendo en la misma pantalla. El banco vigila que siga siendo así.

**Nota del banco:** el motor viejo va congelado dentro del test como referencia. Lleva un `__sembrarSync()` añadido **solo para el banco**: `let` crea enlace léxico y no se ve desde el contexto del `vm`, así que los datos hay que sembrarlos desde dentro. No altera su comportamiento.

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
