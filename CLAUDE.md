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
| `canto.js` / `canto.css` | Motor de karaoke de canto compartido (extraído de audio+rezar). `Canto.init({...})`; CSS por `<link>`, HTML del overlay inyectado por el módulo. `mini.html` NO lo usa (ancestro divergente). **Y el lector del `.lrc` para toda la app**: `parseLrc` (cantar) · `letraPlana` (leer) · `parseLrcMeta` · `fetchLrc` · `letraDeBloque`. Ver § El canto se explica solo. |
| `utils.js` | `window.isPremium(userData)` y `window.resolvePlan(userData)`. Cargado en todas las páginas. |
| `toast.js` | **El aviso breve.** `showToast(texto)` — autosuficiente: inyecta su CSS y monta su nodo bajo demanda. En index y crecer; audio conserva el suyo. Ver § El aviso breve. |
| `flags.js` | Interruptores de producto. Hoy: `MOSTRAR_RECOMPENSAS = false` + puerta `window.recompensasON()`. Ver § Kit de recompensas. |
| `cierre.js` / `cierre.css` | **El cierre de una sesión de rezo.** `Cierre.decenario({desde, color, titulo, metros})` → promesa. La columna se cierra en decenario. CSS por `<link>`, trayectorias generadas por el módulo. Ver § El cierre. |
| `rosario.js` | **La vuelta del Rosario**: cinco decenas REZADAS de un bloque son un Rosario, y se repite. Lógica pura, sin red ni DOM. Ver § La vuelta del Rosario. |
| `vuelta.js` / `vuelta.css` | **El reconocimiento de haber recorrido otra vez el Nivel** + la entrada de diario. Autosuficiente. Ver § La vuelta del Rosario. |
| `sarta.js` | **Geometría del decenario y la camándula.** `Sarta.geometria(forma, {decenas})` — `decenas:1` da el decenario (16 cuentas), `decenas:5` la camándula (60). Pura, sin DOM. Ver § La sarta. |
| `cuentas.js` | **Motor pasivo de la columna de cuentas del rezo** (1 Padrenuestro + 10 Ave Marías + Cruz Lux). `Cuentas.crear({audio: () => el})`. Lo usan audio y orar; rezar y mini conservan el suyo. Ver § Columna de cuentas. |
| `bloques.js` | **Origen único de los cuatro bloques**: su color y su lista ordenada (`window.BLOQUES`). `window.COLORES_BLOQUE` + `window.rgbaBloque(bloque, alfa)`, y estampa 12 variables CSS (`--goz`, `--goz-color`, `--goz-rgb`, ×4). Va en el `<head>`. Ver § Colores de bloque. |
| `niveles.js` | **Origen único del itinerario**: `NIVELES_ORDER`, `NIVEL_STATUS`, `NIVEL_NAMES` + `Niveles.publicado/siguientePublicado/nombre`. Va en el `<head>` de index, crecer, audio y diario. Ver § El itinerario. |

## El cierre de una sesión (`cierre.js`)

*Estado: los **tres cierres** implementados —decenario, Rosario y rosetón— con salida a las Letanías + banco de pruebas (`tools/test-cierre.js`, 96). **Decenario verificado en dispositivo en `mini`; el de `rezar` acaba de destrabarse (ver el aviso de la guarda). Resto PENDIENTE de prueba visual.***

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
| `rezar` | en su celebración: rezar **es** el Rosario de una sentada. Y si con ese bloque se cierran los cuatro, el **rosetón** va justo detrás (`cuadernoCompleto()` lee `prog.progress`, sin contar historial; la paleta sale de las `--lvl-*` de la propia página) |

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

**La palabra dice QUÉ Nivel se cerró.** Cerrar los veinte Misterios no es cerrar cualquier cosa, así que el pie del rosetón lleva **«Nivel recorrido» como antetítulo** y debajo el **nombre del Nivel en grande** (`Niveles.nombre(nivelId)`, el canónico). `pieDe()` acepta un `nombre` opcional: cuando llega, la palabra se retira a antetítulo (`.con-nombre`) para no competir con él. Sin nombre —una página que no cargue `niveles.js`— el pie es exactamente el de antes. *(Por eso `orar.html` carga ahora `niveles.js`: era la única de las dos que no lo tenía.)*

**La coreografía** (3,5 s, el más raro de los tres — uno cada 20 Misterios): la noche cae al fondo del propio cuaderno · las **cuatro cuñas** entran, 140 ms entre bloques · la **tracería** se dibuja del centro hacia afuera —primero los cuatro nervios mayores y el aro, después los dieciséis menores: eso es la rosa abriéndose— · la **luz atraviesa** y proyecta fuera del encuadre · la **Lux ocupa el óculo** y llega la palabra.

⚠️ **El cuaderno son los veinte, no el cuarto bloque.** Los bloques se pueden rezar en cualquier orden, así que cerrar gloriosos no significa haber cerrado el cuaderno. En audio, `cuadernoCompleto()` cuenta los 20 Misterios distintos del historial acotados a ese nivel y cuaderno; en orar, `showAdvanceLevelPrompt()` **es** exactamente ese momento.

### Los emojis salieron sustituidos, no borrados

| Qué | Lo sustituye |
|---|---|
| **🎉** del overlay "¡Completaste el DEMO!" | el rosetón, que corre antes (0101 m20 **es** el cuaderno cerrado) |
| **🙏** en el círculo degradado de la celebración de orar | el Rosario, que corre justo antes |
| El **confetti** de `_obConfetti` | **lluvia de Lux**: 14 cruces en oro y pergamino en vez de 48 rectángulos en siete colores que no aparecían en ningún otro sitio de la app. **Conserva el nombre y la firma**, así que los llamadores —el cierre del bloque 1 y el overlay del DEMO— no cambiaron |

*Queda un 🙏 en `showDailyLimit()` de audio (la pantalla de "vuelve mañana"). No es una celebración y nada lo sustituye ahí; se dejó a la espera de decisión.*

**`Cierre.decenaCompleta(foto)`** es la guarda común, y mira **dos** cosas: que la **Cruz esté encendida** —lo que `Cuentas` hace justo al pasar la última ventana del rezo— y que la columna **tenga sitio en pantalla**. El decenario es la imagen de una decena rezada, no de una columna a medias ni de una columna escondida: una columna con `display:none` devuelve rects en cero, y de ahí salía el artefacto de las cuentas partiendo de (0,0). Ante la duda **no se anima**: animar mal es peor que no animar.

⚠️ **En `rezar` esa guarda no se cumplía nunca, y el decenario moría en silencio.** Sus cuentas son interactivas y encender la Lux vivía **solo** dentro de `countBead()`, el `onclick` del botón *Contar*: quien rezaba sin ir tocando —el caso normal, contar es opcional— terminaba la decena con las once cuentas en blanco y la Cruz apagada, así que `decenaCompleta()` daba `false` y no se creaba ni el velo. *No era el eje Z: el velo (940) siempre estuvo sobre el karaoke (400), y los dos cuelgan de `body`.*

Ahora la Cruz se enciende **por la vía pasiva también** (`_encenderLux()`, llamada desde `_tickBeads` al cerrarse la undécima ventana), y de paso repara un hueco visual propio de rezar: antes esa Cruz no se veía nunca sin tocar. La consolidación `_cerrarColumnaDecena()` corre justo antes de la instantánea y termina lo que el tick habría hecho —el tick va a 80 ms y se detiene al pausar el audio, así que si la última ventana cierra con la pista la cuenta 10 se quedaba `active` y sin tinta.
⚠️ **La Cruz reserva su sitio: si no, la columna salta justo antes del decenario.** `.bead-lux-cross` era `display:none` hasta encenderse, así que **no ocupaba nada** y al aparecer la columna crecía ~49 px de golpe (36 de la Cruz + 6 de margen + 7 de `gap`). Anclada al centro (`top:50%` + `translateY(-50%)`), esa altura se repartía y **las once cuentas subían ~24 px** — un salto visible justo antes de que arrancara el decenario, que parte de esas mismas posiciones. Ahora la Cruz apagada es `display:flex` + `visibility:hidden`, y encenderla solo cambia la tinta, nunca la caja. Estaba igual en **audio, orar y rezar**; los tres corregidos, con prueba. *(`mini` tiene el mismo patrón pero su columna va anclada abajo y no se ha reportado salto: se dejó como está, verificada en dispositivo.)*

⚠️ **En `rezar` el final del Rosario se pintaba dos veces, y la pantalla de canto reaparecía.** El `return` temprano de `playNext()` —el que detecta que se acabó la lista— se saltaba el `Canto.close()` que hay al final de la función. Si la última pista era el canto, su pantalla quedaba **abierta debajo del velo del Rosario** (940 sobre 400) y reaparecía al retirarse el velo. Y como *Saltar* es `onSkip → playNext()`, el usuario volvía a entrar por la misma puerta: `plIdx++` otra vez, `onSessionComplete()` otra vez, **Rosario otra vez** y después la celebración. Ahora ese camino cierra el karaoke y fija `plIdx`, y `onSessionComplete()` es **idempotente** (`_sesionCerrada`) — el final ocurre una vez, la llame quien la llame: el fin de la última pista, *Saltar*, o el gesto de pista siguiente del sistema.


⚠️ **Encender la Cruz es una luz, no un cobro.** Los **25 m por cuenta** son el premio de tocar **a tiempo** —el incentivo para rezar atento— y siguen viviendo solo en `countBead()`. Ni `_encenderLux()` ni `_cerrarColumnaDecena()` llaman a `addMeters` ni pintan bonus, y la consolidación usa la tinta de "pasó sin tocar" (`lit-white`), **nunca** la de oro (`lit-correct`). Por la misma razón **el acorde de tres notas y la vibración se quedan en la vía táctil**: son la recompensa de haber contado las once. Tres pruebas lo vigilan.

**`mini` y `rezar` conservan su motor de cuentas** y solo crean una instancia de `Cuentas` para **leer** con `instantanea()`: mini el suyo (aro pequeño, oro sobre noche) y rezar el interactivo. Es exactamente para lo que existe `instantanea()`. `mini` usa además su propio oro `#E8B94A` en vez del color de bloque: allí toda la paleta es oro-sobre-noche y un decenario rosa desentonaría con su propia pantalla.

**Encadena, no se apila.** Devuelve promesa, igual que `RachaSplash.mostrarSiHay()`. En `completeSession` el epílogo sube **después**: `mostrarDecenario().then(abrirEpilogo)`. Las capas: decenario **940** → epílogo 500 (debajo, sube después) → splash de racha **950** (al salir al mapa). El banco vigila que el decenario nunca tape al splash.

⚠️ **Nunca impide terminar la sesión.** Si el módulo no cargó, si `Sarta` falta, si la columna no está entera (decena saltada, `rect` corrupto), `mostrarDecenario()` resuelve al instante y el epílogo sube como siempre. Cinco pruebas cubren esa degradación. Una animación no puede dejar al usuario encerrado.

**CSS generado, no un bucle.** Las once trayectorias dependen de dónde estaba cada cuenta en pantalla, así que hay que generarlas — pero se generan como `@keyframes` de `transform`, no como un `requestAnimationFrame` que escriba `cx`/`cy`. Así las mueve el compositor y no compiten con las escrituras a Firestore que ocurren en ese mismo momento. La hoja se retira con el velo.

**La coreografía** (2,5 s de núcleo + reposo): velo · las cuentas viajan a su sitio **escalonadas 30 ms**, combadas un 12% hacia afuera para que la sarta se recoja en vez de teletransportarse · la Cruz baja con rebote y **una** oscilación de péndulo (a esta velocidad, dos se leen como temblor) · un halo recorre el anillo · la palabra y los metros. Toque en cualquier parte → salta al decenario formado; `prefers-reduced-motion` lo entrega ya formado.

**Tokens de movimiento** (`cierre.css`): `--ease-rito` (el rebote que ya usaba `luxAppear`), `--ease-velo` (el de mini), `--ease-salida`, y `--t-breve` / `--t-gesto` / `--t-rito`. Sustituyen a las seis curvas y ocho duraciones sueltas que había repartidas por los reproductores.

## La vuelta del Rosario (`rosario.js` · `vuelta.js`)

*Estado: implementado + banco de pruebas (`tools/test-vuelta.js`, 38) y 3 aserciones reescritas en `tools/test-cierre.js`. **PENDIENTE prueba en dispositivo.***

**Rezar el Rosario es una costumbre, no un hito.** Cerrar cinco Misterios de un bloque es un acto piadoso cotidiano que se repite, aunque no traiga contenido nuevo. Pero la animación colgaba del **avance**, que ocurre una sola vez, así que solo se veía la primerísima vez — en los tres modos, con tres mecanismos distintos:

| Modo | De qué colgaba | Por qué solo salía una vez |
|---|---|---|
| `audio` | `!blockBonuses[bonusKey]` | el bonus se cobra una vez y **para siempre** |
| `orar` · `rezar` | `if(dots.every(Boolean))` | `completeMystery` corta si el Misterio ya estaba marcado, así que ese `if` solo puede correr una vez en la vida |

Y en audio había una segunda avería: `doneInBlock` contaba **`audioProgress.history`**, el historial privado de audio. Quien rezaba cuatro Misterios en el Libro y el quinto en audio tenía `size === 1` → ni bonus ni Rosario, **aunque el bloque estuviera cerrado de verdad**. `cuadernoCompleto()` arrastraba el mismo defecto: para quien mezclaba modos, el rosetón no llegaba jamás.

### El premio y el rito son cosas distintas

| | Regla |
|---|---|
| **Metros ordinarios** (rezo 1200, contemplación 800, canto 600, preguntas) | **cada vez que se reza**, para premium/beta/developer. El free no re-gana (`_freeNoGana` ← `yaGanado`) |
| **Bonus de primera vez** (bloque +1000) | **una sola vez**, todos los planes |
| **La animación** | cada vez que se cierra una **vuelta** |

⚠️ **Por eso `_rosarioPendiente` y `_rosarioMetros` son dos variables y no una.** Antes `_rosarioPendiente` guardaba los metros *y* servía de booleano. Con el desacople hay vueltas que se cierran **sin bonus** —porque ya se cobró—, y ahí el pie **no pinta cifra**: `pieDe()` omite la línea con `metros <= 0`. El rito no promete un premio que no hubo.

### Solo cuenta lo REZADO

**La guarda del decenario es la prueba.** `Cierre.decenaCompleta()` exige once cuentas y la Cruz encendida, y la Cruz solo se enciende cuando la última ventana de `bead_sync` pasó con el audio sonando. Quien pasa páginas en el Libro avanza en `progress` pero **no llena la vuelta**.

Por eso `marcarVuelta()` se llama **justo donde esa guarda ya dijo que sí**, síncrono, y no al resolverse la animación: en `rezar` el decenario no se espera, y hacerlo después sería una carrera con `onSessionComplete`.

### El dato

Dos campos en el documento que los tres modos ya cargan — **`progress/{doc}` permite escritura libre al dueño, así que no hubo que desplegar reglas**:

```
users/{uid}/progress/{nivelId}
  .progress   { gozosos:[ts×5], … }          ← avance temático. Intacto.
  .vuelta     { gozosos:[ts×5], … }          ← decenas REZADAS de la vuelta en curso
  .rosarios   { gozosos:3, luminosos:2, … }  ← Rosarios cerrados de cada bloque
```

- **Rosario del bloque:** se llena `vuelta[bloque]` → animación → `rosarios[bloque]++` y `vuelta[bloque]` a ceros.
- **Vuelta del Nivel:** es `Math.min(...rosarios)`. Cuando ese mínimo sube, se recorrieron otra vez los veinte. **No hay que limpiar nada y el número de vuelta sale solo.**

`rosario.js` es lógica pura como `racha.js` —sin red, sin SDK, sin DOM— y cada página hace su E/S. Espejo en `localStorage` (`cruzando_vuelta_{nivelId}`) primero y Firestore después; `fusionar()` reconcilia dos dispositivos sin cola de reintentos, y da prioridad a quien va por una vuelta más avanzada (la vuelta en curso del otro pertenece a una anterior).

**Decisiones de producto que el código fija:**
- **`mini` no participa.** Es una unidad autocontenida y puntual: no suma al bloque ni al Nivel. Los **Retiros** futuros heredarán ese trato. Hay una prueba que lo vigila.
- **La vuelta es por Nivel**, que es donde el dato ya vive.
- **Mezclar bloques no cuenta**: `vuelta` se indexa por bloque, así que dos gozosos y tres luminosos dejan dos vueltas a medias, no un Rosario. Un Rosario es un *set*.
- **Un Rosario son cinco decenas DISTINTAS**: rezar nueve veces el tercer Misterio llena un hueco, no nueve.

### El Rosario dice qué Rosario fue

El color ya era el del bloque (la camándula entera se dibuja en él). Faltaba el **nombre**, y la pieza ya existía: el `nombre` opcional de `pieDe()`, el mismo del rosetón. Antetítulo «ROSARIO RECORRIDO» + «**Misterios Gozosos**» en grande.

⚠️ Ese nombre estaba **copiado cuatro veces y ya divergiendo** — `BFN` en orar y en rezar (idénticos), `BLOCK_NAMES` en audio (¡en singular!) y `BLOQUE_NAMES` en diario. Pasó a **`bloques.js` como `window.NOMBRES_BLOQUE`**, que ya es el origen único de los cuatro bloques.

### El reconocimiento de la vuelta del Nivel

**El rosetón se queda como hito y no se repite.** Lo que se repite es la vuelta, y tiene su propia pantalla (`vuelta.js` + `vuelta.css`, autosuficientes como `toast.js`):

```
              VUELTA COMPLETA
           Cruz 1-3: Conversión
     Has recorrido de nuevo este Nivel.
     ¿Qué has descubierto en esta ocasión?
        [ Escribir en mi diario ]
              Ahora no
```

**Deliberadamente sin geometría.** El decenario es una sarta, el Rosario una camándula, el rosetón un vitral — objetos. Esto es una palabra y una pregunta; darle un objeto propio lo pondría a competir con el rosetón o a imitarlo. Comparte el velo y la tipografía de la familia `cierre` y nada más. Paleta propia y cerrada, porque sale en tres páginas que no definen las mismas variables.

**«De nuevo», no «por segunda vez»:** el número exacto es rígido y a la tercera o la décima vuelta suena a contabilidad, no a reconocimiento.

**Y a diferencia de los tres cierres, esta espera**: hay algo que leer y algo que decidir. No se cierra sola ni salta al toque. El «Ahora no» está siempre — **ofrecido, nunca impuesto**, la misma regla que las Letanías.

⚠️ **El rosetón manda.** Si sale, el reconocimiento se calla (`_vueltaPendiente = false`): no se comparte el primer recorrido con el aviso de haberlo repetido. En la práctica, la vuelta se ve de la segunda en adelante.

**Lo escrito va a `users/{uid}/diario/{id}`** —no a `reflections`: una reflexión está atada a un Misterio y a una pregunta numerada del cuaderno, y esto es sobre el recorrido entero—. La colección ya existía, ya estaba en las reglas y `diario.html` ya la pintaba; solo se añadió la rama `origen: 'vuelta'` con su chip. Si la red falla, la pantalla **no se cierra ni pierde el texto**: avisa y deja reintentar.


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

*Estado: extraído + dos tintas + congelación, con **golden test** (`tools/test-cuentas.js`, 32 pruebas: motor viejo congelado contra el nuevo, 146 instantes sobre las pistas reales de `bead_sync.json`). **PENDIENTE prueba visual en dispositivo.***

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

⚠️ **La congelación solo blindaba la mitad, y en audio las cuentas se apagaban solas.** `congelada` protegía a `pista()`, pero **`tick()` seguía corriendo** — y `tick()` no acumula estado: **repinta las once desde cero** a partir de `currentTime` en cada `timeupdate`. Al terminar el rezo y arrancar Q1, el tiempo vuelve a ~0 mientras `clave` sigue apuntando a las ventanas del rezo, así que ninguna había pasado: borraba las once tintas y **apagaba la Cruz**. La columna sobrevivía, pero vacía — y el decenario de `completeSession` moría en la guarda, que exige justo esa Cruz. Ahora `tick()` sale al instante si está congelada: el frame pintado un instante antes ya es el completo.

⚠️ **Y una vez congelada no volvía a arrancar en toda la sesión.** `pista()` retornaba **antes** de calcular la clave, así que volver al rezo con los saltos de sección no la despertaba. Ahora la clave se calcula primero y la congelación se levanta **solo** si aparece otra clave de rezo: Q1/Q2/Q3 y la oración final no están en `bead_sync`, así que la dejan congelada como debe ser.

⚠️ **`reiniciar()` no reiniciaba nada visible.** Tenía un parámetro `repintar` **opcional**: sin él olvidaba la clave y escondía la columna, pero las once cuentas conservaban su tinta y la Cruz su `show`. audio pasaba `true`; **orar no**. Efecto en orar: al pasar al Misterio siguiente sin rezar, la Cruz heredada dejaba pasar la guarda del decenario, y como la columna estaba escondida sus rects eran ceros y **las once cuentas salían volando desde la esquina (0,0)**. El parámetro era una trampa tendida: **se repinta siempre** y desapareció de la firma. Dos pruebas lo vigilan, una de ellas sobre las páginas.

**Nota del banco:** el motor viejo va congelado dentro del test como referencia. Lleva un `__sembrarSync()` añadido **solo para el banco**: `let` crea enlace léxico y no se ve desde el contexto del `vm`, así que los datos hay que sembrarlos desde dentro. No altera su comportamiento.

## El itinerario (`niveles.js`)

*Estado: extraído + pruebas dentro de `tools/test-navegacion.js` (34 en total). **PENDIENTE prueba en dispositivo** — ver el aviso del final de esta sección.*

**Las tres tablas que describen el camino** —el orden de los 28 cuadernos, su estado de publicación y su nombre— estaban declaradas dentro de las páginas: `NIVELES_ORDER` y `NIVEL_STATUS` en index y crecer; `NIVEL_NAMES` además en audio y diario, cuatro copias idénticas. Ahora salen de un solo sitio, igual que el color de bloque.

| | Qué es |
|---|---|
| `Niveles.ORDEN` | los 28 ids en orden de itinerario |
| `Niveles.ESTADO` | `'published'` (textos **y** audio) · `'dev'` (textos en `data/`, falta el audio) · `'empty'` (nada). Hoy solo **0101–0104** están publicados |
| `Niveles.NOMBRES` | el nombre corto (`'Cruz 1-1: Males'`). El selector de crecer parte por `': '` para sacar el subtítulo |
| `siguientePublicado(id)` | el siguiente cuaderno publicado, o **`null`** si no hay |

⚠️ **`audio.html` leía dos tablas que allí no existían.** El bucle que busca el siguiente cuaderno al terminar el Misterio 20 hacía `window.NIVELES_ORDER || []` → `[]`, `indexOf` → `-1`, y el `for` no entraba nunca. **Un usuario free que cerraba los 20 Misterios se quedaba en el mismo cuaderno.** Ahora usa `Niveles.siguientePublicado(curNivelId)`.

⚠️ **Al cerrar 0104 sigue sin haber adónde ir**, y eso ya no es un bug de código: los Mundos 2 a 7 están en `'dev'`, así que `siguientePublicado('0104')` devuelve `null` **a propósito** y el usuario se queda en su cuaderno. Se destrabará solo cuando 0201 pase a `'published'`. El arreglo cambia el comportamiento real hoy en **0101→0102→0103→0104**.

⚠️ **La guarda de "nivel en desarrollo" de audio también estaba muerta, y ahora vive.** `audio.html:2356` hacía `(window.NIVEL_STATUS || {})`, siempre `{}`, así que `_stReq` caía en `'published'` por defecto y el `location.replace('crecer.html?msg=nivel_en_desarrollo')` **no se disparaba jamás**. Con las tablas cargadas, un usuario no-developer que entre a audio en un cuaderno `dev` o `empty` es devuelto al mapa con su aviso —que es lo que el código pedía— en vez de encontrarse un 404 de audio y la pantalla de "próximamente". El developer queda exento por la misma condición que ya tenía.

**`extras.html` conserva su propia tabla a propósito.** Usa otro formato (`'Cruz · Males'`) y tiene subtítulos para los Mundos 2-7 que la canónica no lleva: unificarlas es decisión de contenido, no de código. Hay una prueba que la vigila para que la diferencia siga siendo deliberada.

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

⚠️ **La salida de orar NO usa `history.back()`.** Había un atajo —si el destino era el mapa y quedaba historial, se retrocedía para que el gesto adelante devolviera a la sesión— pero `history.back()` va a la página **anterior**, que solo es `crecer` si se llegó directo desde allí: entrando desde audio, por enlace directo o tras recargar orar, el botón "Crecer" acababa en otro sitio. Ahora `salirDeOrar()` siempre navega al destino. Con él se fue la bandera `_exitDirecto`, que solo existía para eximirse de ese atajo.

### Dónde estoy ≠ hasta dónde he llegado

**Los tres modos progresan igual.** audio, orar y rezar escriben en `users/{uid}/progress/{nivelId}`, y la frontera del mapa se calcula **exactamente de ahí** — no del historial de audio. No es cierto que solo audio haga progresar.

Lo que estaba descuadrado era el **marcador de nivel**, `localStorage.cruzando_current_nivel`. crecer decide qué nivel enseñar con:

```js
return bookmark || frontier;   // crecer.html · getCurrentNivelFromFirestore
```

**El marcador manda sobre la frontera**, y lo escribían solo audio, crecer e index. Efecto real: rezabas un bloque en 2-2 desde el Libro, volvías al mapa y te enseñaba otro nivel — el progreso estaba guardado, pero el mapa miraba a otro sitio.

Y una segunda mitad: `orar` y `rezar` caían a `'0101'` cuando no había `?c=`, así que entrar por la barra de navegación te devolvía al Mundo 1 aunque estuvieras rezando el 2-2.

Ahora los dos **escriben** el marcador al fijar nivel y lo **leen** como valor por defecto (`p.get('c') || nivelRecordado() || '0101'`), con `recordarNivel` / `nivelRecordado` validando que sean cuatro dígitos.

⚠️ **La frontera no sirve para "dónde estoy":** solo avanza con el nivel **entero** (los 20 Misterios, los cuatro bloques). Con 5 de 20 en 2-2 no se mueve, y eso es correcto. Por eso el marcador tiene que llevar la posición, aparte del avance.


### El mapa pintaba el progreso en el bloque equivocado

*Estado: arreglado + 8 pruebas en `tools/test-cierre.js`. **PENDIENTE prueba en dispositivo.***

⚠️ **El mapa trataba el progreso como un prefijo lineal.** Cada nodo decidía su estado con `gi < DONE_COUNT`, y `DONE_COUNT` es un **conteo** —la suma de Misterios hechos de los cuatro bloques—, no un mapa. Quien rezaba los **gloriosos** (Misterios 16-20) tenía `DONE_COUNT = 5` y el mapa le encendía **gozosos 1-5**. El sendero hacía lo mismo (`done = DONE_COUNT - bi*5`). El progreso estaba bien guardado; se pintaba en los nodos de otro bloque.

El modelo de datos tiene **dos dimensiones** —`progress[bloque][misterio]`— y los bloques se rezan en cualquier orden desde orar y rezar. El mapa era el único sitio que asumía orden. Ahora `misterioHecho(bi, mi)` lee el hueco exacto: granularidad de **Misterio dentro de bloque**, que es lo que necesitan tanto el free (avanza de uno en uno) como el premium (puede cruzar bloques enteros en una sesión de rezar).

**La rama del plan free no se tocó**: su camino *sí* es lineal por diseño (`_freeActiveGi`), y el fallo era solo de la rama premium/beta/developer. Hay una prueba que lo vigila.

**El "aquí vas"** (`isActive`) es ahora el **primer Misterio pendiente en orden de itinerario**: con el progreso desordenado hay varios candidatos, y ese es el que se lee como "continúa por aquí".

⚠️ **`BLOCKS` no era visible desde el script del mapa.** El script del mapa vive en un `<script>` distinto del que declara `var BLOCKS`, y el banco `tools/test-globales.js` lo cazó al primer intento. La lista ordenada de los cuatro bloques pasó a **`bloques.js` como `window.BLOQUES`** — que ya es el origen único de los cuatro bloques, así que es donde pertenece.

### El mapa ya no espera a la red para pintar bien

⚠️ **Ningún reproductor refrescaba el caché del mapa.** `cruzando_progress_{nivelId}` lo escribían **solo** `crecer.html` e `index.html`; audio, orar y rezar marcaban `cruzando_progress_cache_dirty` pero no actualizaban el dato. Al volver de una sesión, la **FASE 1** pintaba desde el caché viejo —sin red, instantánea— y había que esperar a que la **FASE 2** resolviera Auth y leyera Firestore para que la FASE 3 repintara. Ese era el "tarda demasiado en actualizarse el mapa".

Los tres ya tienen el documento en memoria cuando escriben a Firestore, así que dejarlo en el caché cuesta una línea (`refrescarCacheMapa()` en orar y rezar; en audio, dentro de `syncToOrarProgress`, **fusionando** para no perder los campos que audio no toca —`microDone`, `journal`—). El `dirty` se mantiene: la FASE 2 sigue confirmando contra Firestore.

### El nodo "Siguiente" bloqueado NO es un fallo

`_accessible = _nextIdx2 <= _frontierIdx || DONE_COUNT >= 20` ([crecer.html](crecer.html)). El nodo **siempre se dibuja**; sale con candado hasta que la frontera lo alcanza o están los 20 Misterios. Cerrar **un bloque** (5 de 20) no lo desbloquea, y es correcto: la frontera solo avanza con el **nivel entero**.

**El estado de publicación no entra en ese candado.** Solo aparece al **pulsar** el nodo (`selectNivel` avisa "en desarrollo"), y de eso el developer está exento. Que 2-2 esté en `dev` no tiene nada que ver con que el nodo salga bloqueado en 2-1.

### ⚠️ La frontera se rompió en silencio, y se arregló en tres piezas

*Estado: arreglado + dos bancos nuevos (`tools/test-frontera.js`, 28; `tools/test-globales.js`, 17). **PENDIENTE prueba en dispositivo** — ver el punto 17 de Pendientes.*

**El síntoma:** un iPhone limpió los datos de Safari, volvió a entrar y el **selector de niveles se quedó anclado en 1-1** con los cuatro cuadernos del Mundo 1 rezados. Todo lo demás —metros, racha, cantos, los nodos del mapa— sí volvió.

**La causa** estaba en `crecer.html` **e `index.html`**, en una sola línea. Al extraer `NIVELES_ORDER` a `niveles.js` (c316f82) se borró el array **y el salto de línea que cerraba su comentario**, y la declaración de abajo quedó dentro:

```js
// Orden de todos los niveles del itinerariovar BLOCKS = ['gozosos',…];
```

De ahí en cascada: `BLOCKS.every(…)` lanzaba `ReferenceError` en la primera vuelta de `getCurrentNivelFromFirestore` · el `try/catch` de degradación lo tomaba por una caída de red y bajaba la frontera a `'0101'` sin decir nada · la cola de `onAuthStateChanged` **persistía** ese `'0101'` · y la FASE 1 lo prefería sobre el bookmark en la carga siguiente. **Se reescribía a sí mismo para siempre.**

Nadie lo notó durante semanas porque los aparatos ya traían un valor bueno de antes del commit: **borrar los datos de Safari no causó el bug, destapó el que ya estaba.**

**Por qué lo demás sí funcionaba** — y es la firma del fallo:

| Qué | De dónde sale | |
|---|---|---|
| Metros, racha, cantos | `users/{uid}` + `dailyGoal/data`, lectura directa | ✅ |
| Nodos "cleared" del mapa | `renderHome` → `_firestoreProgress` → `DONE_COUNT` | ✅ |
| `world.html` | sus 28 `progress/{id}` en paralelo, con su propia `BLOQUES` bien declarada | ✅ |
| **Selector de esferas** | `buildLevelPicker` → `frontierNivelId` → **`BLOCKS`** | ❌ |
| Nodo "Siguiente" | `_nextIdx2 <= _frontierIdx \|\| window.DONE_COUNT >= 20` | ⚠️ **la rama de `DONE_COUNT` lo rescató** |

La única vía que siguió funcionando fue la única que tenía una alternativa a la frontera. Por eso el usuario podía seguir avanzando.

**El arreglo, en tres piezas** — la primera sola no bastaba:

1. **`BLOCKS` de vuelta a su propia línea**, en los dos gemelos.
2. **Clave versionada `cruzando_frontier_v2`** (`FRONTIER_KEY`). La v1 quedó envenenada con `'0101'` en los aparatos ya afectados y la FASE 1 la prefería sobre todo lo demás; cambiar de clave la jubila y fuerza **un** recálculo por dispositivo, sin tocar Firestore. La puerta de la FASE 2 pasó a `dirty || !_hasCache || !_hasFrontier`: sin frontera guardada hay que recalcularla aunque el caché de plan esté fresco. Y **`getCurrentNivelFromFirestore` es ahora la única que escribe la clave** — se quitó el `setItem` de la cola de `onAuthStateChanged`, que era el eslabón de la autoperpetuación.
3. **El `catch` dejó de mentir.** Distingue `ReferenceError`/`TypeError` (error de código → `console.error` + `window._frontierDegradado = 'bug'`) de una caída de red (→ `console.warn` + `'red'`), y **ninguno de los dos persiste nada**. El cálculo de completitud salió a `nivelCompleto(d)`, con nombre propio.

**Y un cuarto detalle:** `repintarSelectorSiAbierto()` en la FASE 3. La frontera se recalcula en la FASE 2, que puede resolver con el selector ya abierto — y el selector solo se construye al abrirse.

### El barrido que salió de ahí

El bug no se ve leyendo: la línea parece un comentario normal. Lo que sí lo caza es comparar, por página, **lo que se usa contra lo que alguien declara o expone en `window`** — eso es `tools/test-globales.js` (parsea las 15 páginas con acorn; si acorn no está, avisa y **no finge** haber comprobado). Encontró cuatro huérfanos más del mismo tipo, tres arreglados:

| Hallazgo | Estado |
|---|---|
| `db` y `currentUser` vivían en el `<script type="module">` y se usaban desde el `<script>` clásico (`_obCerrarSplash`) → **ReferenceError al cerrar el splash de onboarding**, que mataba el `setTimeout` y con él la navegación a `audio.html` y el `mapSeen` de Firestore | **arreglado** — `window.db` / `window.currentUser`, consumidos con `window.` delante |
| `updateDoc` se usaba **sin importar** en `saveMetrosHoy` → siempre lanzaba, rescatado por el `setDoc merge` del `catch` (efecto neto idéntico, una llamada desperdiciada) | **arreglado** — añadido al `import` |
| `onMetaSliderChange` de **index** llamaba a `updateOdometro` y a `metaMetros`, los dos del módulo → la vista previa del anillo nunca corría (crecer no lo tenía) | **arreglado** — puente `window._previewMeta`, gemelo del `_guardarMeta` que ya existía |
| `showToast` **no existía** en index ni crecer (solo en audio) — las 3 llamadas van tras `if (window.showToast)`, así que el aviso de checkout y el de tutoriales **nunca salían** | **arreglado** — nuevo `toast.js` compartido, ver § El aviso breve |

Los huérfanos que quedan están en la lista `GUARDADOS` del banco, con su razón. La lista **no se pudre**: uno nuevo hace fallar el banco, y uno que ya no haga falta también.

*También salió código muerto: `renderAudioHome()` de `audio.html` llama a `openAudioHome`/`closeAudioHome`, que no existen — pero a `renderAudioHome` no la llama nadie.*

### El aviso breve (`toast.js`)

*Estado: implementado + banco de pruebas (`tools/test-toast.js`, 11 — el módulo corre de verdad contra un DOM de mentira). **PENDIENTE prueba visual en dispositivo.***

De ahí salió el hallazgo (d): `showToast` se llamaba en **tres** sitios de index y crecer —los dos avisos de bienvenida tras el checkout y el de tutoriales reactivados— y la función solo vivía dentro de `audio.html`. La guarda `if (window.showToast)` evitaba el crash, así que el aviso simplemente **nunca salía**.

**Por qué un módulo y no una cuarta copia.** El aviso de audio está pegado a su pantalla: un `<div>` estático en el HTML y CSS que depende de `--lvl-soft`, el color del bloque que se está rezando. Copiarlo habría dejado tres implementaciones del mismo objeto — la deriva que este repo ya pagó con el color de bloque y con las tablas del itinerario.

`toast.js` es **autosuficiente**, como `racha-splash.js`: inyecta su CSS una vez y monta el elemento bajo demanda. Una página que lo quiera solo añade el `<script>`; no hay que tocarle el HTML ni el CSS. Va cargado en index y crecer, junto a `plan-utils.js`.

**El material.** Va **centrado sobre la barra de navegación**, no en la esquina: el de audio es una notificación de metros —discreta, abajo a la derecha, mientras se reza— y estos son anuncios que hay que leer ("bienvenido a Premium"), largos, que en la esquina de un teléfono de 390 px se parten. Los colores salen de los tokens de la página (`--card`, `--border`, `--text`, `--shadow`) **con respaldo horneado**, así que sigue al tema claro/oscuro sin saber nada de él y no se rompe en una página que no los defina. Detecta `.app-nav`: sin barra debajo, baja al pie en vez de flotar en el aire. Lleva `role="status"` + `aria-live="polite"`.

⚠️ **Dos avisos seguidos no se apilan:** el segundo releva al primero y **reinicia la cuenta**. Sin eso, el temporizador del primero cerraría el segundo a mitad de leerlo. Hay una prueba que lo vigila.

⚠️ **`audio.html` conserva el suyo a propósito**, igual que `mini` conserva su karaoke: el de audio se tiñe con el color del bloque y vive en su barra de herramientas. Adoptar el compartido allí es decisión **visual**, no de código. El banco vigila que la diferencia siga siendo deliberada — y que audio no cargue los dos a la vez.

### El developer recorre lo que su progreso desbloqueó

Los Mundos 2 a 7 están en `NIVEL_STATUS` como `dev`/`empty`, pero **sus textos ya existen** en `data/{nivelId}.json` (los 28 archivos están completos y con la misma forma que el Mundo 1). Lo que falta es el **audio en R2**.

Tres puertas, y las tres eximen al developer:

| Dónde | Qué hace |
|---|---|
| `crecer` · `selectNivel()` | avisa "en desarrollo" salvo para developer |
| `crecer` · `buildLevelPicker()` | el candado del orbe mira **el progreso** (la frontera), no el estado de publicación |
| `audio` · `audioEl.onerror` | ⚠️ **la que fallaba** |

⚠️ **audio deducía "en desarrollo" de un 404.** No hay comprobación de permisos: si la pista `start` no carga, `showComingSoon()` levanta el muro. Con los Mundos 2-7 sin audio, eso alcanzaba también al developer. Ahora la pantalla solo sale para el usuario normal.

⚠️ **Y al developer no se le auto-avanza.** Cada pista que falta dispara `onerror` → `goTrack(idx+1)`: en un nivel sin audio, la sesión entera pasaría en un instante, no se vería nada y el Misterio quedaría **marcado como rezado**. Para el developer el reproductor se queda en la sección y se mueve con los saltos `◀◀ ▶▶`, que ya son solo suyos.

*Ojo: `NIVEL_STATUS` y `NIVELES_ORDER` se definen solo en `index.html` y `crecer.html`. En `audio.html` llegan `undefined`, así que su comprobación de nivel publicado (`_stReq`) es inerte, y el bucle de avance del free (`_NSTATUS[...] === 'published'`) nunca encuentra el siguiente nivel.*

**`world.html` está inalcanzable.** Su único enlace vive en `mostrarEsferas()` (`crecer.html`), que solo corre bajo `recompensasON()` — se apagó con el kit de recompensas sin que nadie lo notara.

**Banco de pruebas:** `tools/test-navegacion.js` (25 pruebas). Comprueba línea a línea que ninguna salida de sesión se escape al hub (con excepciones por **línea completa**, no por subcadena), que las tres barras lleven al mapa etiquetadas "Crecer", y que la salida de orar siga cableada en sus dos finales. Importa porque el splash de racha se engancha justo en estos puntos.

## Vocabulario: qué es un «Nivel» y por qué el código dice «cuaderno»

**Lo que el usuario ve** (revisado y unificado el 2026-09-01):

| Unidad | Cómo se muestra | Cuántas |
|---|---|---|
| **Mundo** | «Mundo 1 · Cruz» · `tema.mundo_nombre` = "CruzAndo la Cruz" | 7 |
| **Nivel** | «Nivel 1-3» · «Cruz 1-3: Conversión» (`Niveles.nombre`) | 28 |
| **Bloque** | «Misterios Gozosos» (`NOMBRES_BLOQUE`) | 4 por Nivel |
| **Misterio** | «Anunciación» | 20 por Nivel |

**«Cuaderno» ya no aparece en pantalla.** Era un resto interno que se había escapado a cuatro cadenas —la celebración de bloque y la de los veinte en `orar`, su botón «Siguiente cuaderno», y el mensaje de carga «Abriendo el cuaderno…» de `audio`— más una pregunta de `data/0104-micro.json`. Las cinco corregidas. Un barrido que extrae **todos** los literales y nodos de texto de las páginas vivas confirma que no queda ninguna.

⚠️ **En el código, `nivel` significa dos cosas distintas según el archivo.** Las dos convenciones producen la misma cadena correcta en pantalla, así que **no hay bug** — pero leer `nivel` sin saber en qué archivo estás lleva a conclusiones falsas:

| Archivo | `nivel` es | El Nivel se llama |
|---|---|---|
| `index.html` · `crecer.html` | **el cuaderno** (`'Nivel ' + mundo + '-' + nivel`) | `nivel` |
| `audio` · `orar` · `rezar` · `mini` · `cantos` | **el Mundo** | `cuaderno` / `cua` |

Y `nivelId` —los cuatro dígitos, `'0103'`— es **el Nivel** en las dos convenciones: es el identificador canónico y el que no engaña.

**Decisión (2026-09-01): NO se renombra el campo `cuaderno`.** Está persistido en Firestore (`audioProgress/current.cuaderno`), viaja en las URLs (`audio.html?nivel=1&cuaderno=3`) y estructura el nombre de **todos** los assets de R2 (`M_1_3_7.lrc`, `P_1_3_7a.webp`, `CANTO_1_3_2.m4a`). Renombrarlo exigiría migrar datos, romper los enlaces ya guardados y resincronizar los dos buckets — mucho riesgo para un cambio que el usuario no ve. Si una sesión futura lo ve y le parece deriva: no lo es, es esta decisión.

**Las ocho maquetas huérfanas se borraron** en la misma pasada (`cruzando-demo`, `indexv2`, `mini-mock`, `mockup-beads`, `reskin`, `reskin-rezar`, `hero-preview`, `world_backup`). Ninguna página las enlazaba y varias llevaban nomenclatura vieja. Están en el historial de git por si hicieran falta.

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
```
Actualmente existen datos para Mundo 1 (`0101`–`0104`). Mundo 2 solo tiene `0201-micro.json`.

⚠️ **`{nivelId}-cantos.json` ya no existe** (borrado 2026-08-26). Su contenido vive en el `.lrc` de cada canto. Ver § El canto se explica solo.

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
- **Escalera de degradación de la LETRA (2 peldaños):** `.lrc` → no abre. *El peldaño intermedio —la letra estática de `{nivelId}-cantos.json`— desapareció con el archivo: era una copia de la del `.lrc`, así que no cubría ningún caso que el `.lrc` no cubriera ya. `loadFallbackLetra` sigue existiendo en el motor y lo usa la galería, que sí tiene otra fuente (Firestore).*
- **Escalera de degradación de la IMAGEN (3 peldaños), nueva:** carrusel `cantos/{mid}/P_{mid}{a-i}.webp` → imagen única `P_{mid}.webp` (la misma del hero) → **fondo sin arte**.

⚠️ **La imagen no tenía escalera: `finishDetect()` pintaba la única SIN COMPROBARLA.** Si tampoco existía, la capa se quedaba transparente con su Ken Burns corriendo sobre nada — pantalla negra con una animación invisible. Era un camino que **solo recorre audio**: en `rezar` todos los cantos tienen carrusel, así que `showStill()` no se usa nunca y el fallo estaba tapado. Ahora la única se sondea con `new Image()` antes de pintarse, y si falla —o si no hay— entra `.canto-stills.sin-arte`: la noche de la app con un halo alto **del color del bloque** (`--canto-tinte-rgb`, que las páginas dan con el nuevo `window.rgbBloque`), **quieto**, porque sin imagen no hay nada que recorrer. La letra sigue siendo la protagonista, que es de lo que va la pantalla.

*Banco: `tools/test-canto.js` (10). Son pruebas de **fuente**, no de ejecución: `mount()` usa `innerHTML` y correr el motor pediría un parser de HTML de verdad. Vigilan el cableado, que es donde estuvo el error.*
- `audio` **Fase 1** (karaoke en sesión) + **Fase 2** (epílogo simplificado: helper de botones que reutiliza el karaoke; matriz de planes free/premium/demo; +200m con guardia; "vuelve mañana" diferido a Salir). `rezar` **Fase 3** (BGM se pausa/reanuda según estado previo).
- **Fase 4 — `canto.js` compartido**: motor extraído de audio+rezar (**mini NO lo usa**, es el ancestro divergente). CSS en `canto.css` (`<link>`), HTML del overlay inyectado por el módulo. Consumidores futuros (retiro, cantos) → `<script>` + `Canto.init({...})`.

### El arte del canto: completo o no se publica (decisión 2026-08-25)

**`audio.html` no se rebaja.** Es el producto que se ofrece incluso gratis —una sesión al día— y el canto es su remate. Se sopesó y **se descartó** la alternativa de "experiencia parcial mientras llega el arte": una pantalla a medias ahí se lee como producto incompleto, no como contenido en camino, y el free es justo quien menos margen da para eso. El cuaderno se publica con su arte, o no se publica.

**El respaldo de `canto.js` se queda, pero como seguro, no como estrategia.** Cubre una imagen que falte, tarde o falle. El objetivo es no verlo nunca.

**Lo que la decisión deja como trabajo, medido el 2026-08-25** (contra `C:\R2\cruzando-ilustraciones\cantos`):

| Cuaderno | Estado | Con carrusel | Faltan |
|---|---|---|---|
| 1-1 · 1-2 | `published` | 20 / 20 | — |
| **1-3** | `published` | M1–M6 | **M7 … M20** (14) |
| **1-4** | `published` | — | **M1 … M20** (20) |

**34 Misterios**, a las 8,2 imágenes por Misterio que llevan 1-1 y 1-2: **~280 imágenes**. Los Mundos 2 a 7 no cuentan mientras sigan en `dev` en `niveles.js`. *(`1_3_7` tiene la carpeta creada y vacía: se comporta igual que no existir.)*

### El manifiesto: cómo entra el arte, y por qué nunca se toca a mano

`cantos/manifest.json` **lo genera `tools/generate-cantos-manifest.js` como paso 1 de 4 de `tools/cruzando-sync-real.bat`**, leyendo la carpeta local **antes** de que rclone suba nada. Si node falla, el .bat cancela el sync entero: el manifiesto no puede quedar desfasado respecto a las imágenes que describe. La salida es determinista (claves y listas ordenadas, sin marca de tiempo), así que si el arte no cambió el archivo sale idéntico y rclone no lo resube.

**El flujo es siempre: dejar los `.webp` en `cantos/{n}_{c}_{m}/` → correr el .bat.**

⚠️ **Subir arte por el panel de Cloudflare rompe la garantía.** Con `imgTrust:true` el motor no sondea nada: una imagen nueva que no esté listada es **invisible** hasta el próximo sync, y una borrada que siga listada deja la capa transparente. La regla no es burocracia — es la condición que permite quitar el sondeo.

### El canto se explica solo (2026-08-26)

*Estado: migración **aplicada** a los 121 `.lrc` de `C:\R2\cruzando-music` + los cuatro JSON borrados + banco de pruebas (`tools/test-lrc-titulos.js`, 18, con la letra sellada en `lrc-baseline.json`) y 5 guardas nuevas en `tools/test-canto.js`. **PENDIENTE: correr el sync a R2 y prueba visual en dispositivo.***

**Los cuatro `data/{nivelId}-cantos.json` se jubilaron.** Guardaban la letra de los 20 cantos de cada cuaderno y su título. La **letra ya estaba en el `.lrc`** —medido con el parser real, 80 de 80 en los cuadernos publicados: 76 idénticas, 2 con diferencias de puntuación y 2 (`0104` M1 y M9) con las estrofas en otro orden. En esas dos **manda el `.lrc`**: va pegado al audio que de verdad suena; el JSON era texto escrito que se desvió del disco.

**Lo único que no estaba en el asset eran dos cosas, y las dos se mudaron a él:**

| Qué | Dónde vive ahora |
|---|---|
| **El título** del canto (16: uno por bloque, compartido por sus 5 Misterios) | el `[ti:]` de cada `.lrc` |
| **Los cortes de estrofa** — cómo el autor parte el texto para leerlo | los renglones vacíos del `.lrc` |

Así **un canto nuevo llega con su nombre puesto** y no hay tabla paralela que se desincronice. Es la misma lección que este repo ya pagó con el color de bloque y con las tablas del itinerario.

**Dos lecturas del mismo archivo, y son distintas a propósito:**

| | Para qué | Qué hace con el renglón vacío |
|---|---|---|
| `parseLrc` | **cantar** — un evento por línea, con su segundo | lo descarta: al karaoke le sobra |
| `letraPlana` | **leer** — el popup de orar, la hoja de la galería | lo **conserva**: es la separación de estrofas |

⚠️ **Por eso los cortes de estrofa había que migrarlos, no deducirlos.** El `.lrc` traía menos que el JSON: en 1-1, cuatro estrofas legibles quedaban en dos bloques de ocho versos. Da igual en el karaoke (una línea cada vez) pero no en `orar`, que es texto para leer. Se alinearon las dos versiones por **subsecuencia común más larga**, no por índice — 76 de 80 coinciden verso a verso, pero alinear a ciegas los dos reordenados de 1-4 les habría metido cortes en mitad de una estrofa. Lo que no se empareja se queda como está: **ante la duda, no se toca**. Resultado: 134 renglones en 62 archivos; la paridad de estrofas subió de 27/80 a 66/80.

*Las 14 que siguen difiriendo no son un defecto: el `.lrc` agrupa el estribillo como se canta («Buena noticia, Dios no huye del dolor.») y el JSON lo partía como se imprime, en versos cortos. Son dos tipografías del mismo texto, y manda la del disco.*

⚠️ **El karaoke estaba pintando basura en pantalla.** 99 líneas en **98 de los 105** `.lrc` por Misterio empezaban con la numeración de estrofa —*«1. No fue fácil tu comienzo,»*— y `parseLrc` limpia directivas pero no eso. Salió en la misma pasada. **En los 16 `CANTO_*.lrc` de bloque se conserva**: allí ese número no es basura, es la estructura que separa los 5 Misterios, y es justo por donde `letraDeBloque` parte la letra que se guarda en `unlockedCantos`.

**Dónde tocó, y qué cambió de verdad:**

| Sitio | Antes | Ahora |
|---|---|---|
| `audio` · `rezar` · `loadFallbackLetra` | letra de respaldo del JSON | **borrado** — era copia de la del `.lrc`; el título sale del `[ti:]` |
| `audio` · desbloqueo de `unlockedCantos` | JSON del cuaderno, cargado en **cada** Misterio | `CANTO_{n}_{c}_{b}.lrc`, y solo cuando cierra el bloque |
| `cantos` · `backfillCantos` | ídem | ídem, por `cantoLrcUrl` |
| `orar` · popup «Canto» | 3 fetch del JSON + texto plano | 1 fetch del `.lrc` del Misterio + el mismo texto plano |

**La forma del dato no cambió**, así que los `unlockedCantos` ya escritos en producción siguen valiendo: `letraDeBloque` reproduce los cinco tramos unidos por `───` partiendo por las marcas del `.lrc`, y el estribillo de entrada va con el Misterio 1 —como iba cuando la letra se armaba concatenando los cinco textos.

**`orar` se queda con el texto plano, y es decisión de producto.** Ya carga `canto.css` + `canto.js`, ya reproduce el `m4a` y ya tiene el `.lrc`: montarle el karaoke sincronizado era gratis. **No se hizo.** `orar` es el «libro digital» — la modalidad para quien prefiere **menos estimulación** e ir a su ritmo en todo momento. La pantalla sincronizada empuja; el texto quieto espera. Hay una prueba que falla si alguien le monta un `Karaoke.create` allí.

**El migrador está gastado.** `tools/lrc-migrar-titulos.js` corrió sus dos pasadas y su fuente ya no existe: relanzarlo avisa y no hace nada. Se conserva como acta. Quien quiera comprobar el resultado usa `tools/test-lrc-titulos.js`, que **no depende del JSON**: lleva los 16 títulos congelados en su propio código y la letra sellada verso a verso en `lrc-baseline.json` (`--sellar` la vuelve a sellar cuando el contenido cambie a propósito). El respaldo de los `.lrc` originales quedó en `C:\R2\_respaldo-lrc\{sello}\`, **fuera** del árbol que rclone sincroniza.

### Los `.lrc`: dónde viven y por qué conviven dos formatos

**Local `C:\R2\cruzando-music\lrc\` → paso 3/4 del `.bat` → `pub-faed94e…r2.dev/lrc/M_{n}_{c}_{m}.lrc`.** Las tres páginas leen la misma carpeta: `audio` con `LRC_BASE` (que ya incluye `/lrc/`), `rezar` con `MUSB + 'lrc/'`, `mini` con `R2_MUS + '/lrc/'`. **Solo esa carpeta se sirve.**

⚠️ **Había 105 `.lrc` sueltos en la RAÍZ del bucket que nadie leía** (2026-08-25). 66 eran copia de los de `lrc/`; los otros **39 existían solo ahí** — y eran exactamente 1-4 M6–M20, 2-1 M2–M20 y 2-2 M1–M5, los mismos que un inventario superficial daba por "sin letra sincronizada". No faltaban: estaban donde la app no mira. Se movieron los 39, se borraron los 65 duplicados idénticos, y de `M_2_1_1.lrc` (el único con dos versiones distintas) se conservó **el más antiguo**. Resultado: raíz 0, `lrc/` 105.

**Dos formatos conviven en `lrc/`, y es deliberado.** La mayoría es la versión limpia (marca de tiempo + texto); el **formato fuente de autoría** añade bloque `[stills]` y directivas `[cut:N]` / `[kb:slow|hold|in]` en línea. *(Corrección de inventario, 2026-08-26: aquí se decía «65 y 40». Medido archivo por archivo, **solo `M_2_1_1.lrc` traía cabecera** y solo él usa `[stills]`/`[cut:]`. Hoy 97 de 121 llevan `[ti:]`, pero puesto por la migración, no por autoría.)* **`parseLrc` digiere los dos** — salta las cabeceras ([canto.js:79](canto.js#L79)), reconoce `[stills]`/`[lyrics]`, y borra las directivas del texto con `\[[a-z]+:[^\]]*\]`. Comprobado archivo por archivo contra el parser real: los 105 parsean limpios, ninguno vacío, ninguna directiva colándose en la letra. Y las dos versiones de `M_2_1_1` parseaban a las **mismas 17 líneas**.

**Decisión (2026-08-25): NO uniformarlos.** Las directivas son material de autoría del usuario y no rompen nada. Si una sesión futura las ve y le parecen deriva, esto es la respuesta: no lo son.

*(`[stills]` y `[cut]` alimentaban el fondo en una etapa anterior; hoy el carrusel avanza por su cuenta. El comentario de `mini.html` lo dice: «stills/cut ya no alimentan el fondo».)*

### Las dos mejoras aprobadas son de velocidad, no de experiencia

*Medido el 2026-08-25 contra el bucket real. Ninguna toca lo que el usuario ve; las dos hacen que la experiencia completa llegue antes. **Pendientes, no implementadas.***

**1. Manifiesto por Misterio + `imgTrust`.** Hoy cada canto sondea sus imágenes **en cadena** y remata con un 404 para descubrir que no hay una más — y un 404 del bucket público de R2 **pesa 27 KB** (devuelve una página de error HTML completa). Medido en `1_1_1`: 7 aciertos (159 KB) + 1 fallo (27 KB), **~3,1 s de peticiones encadenadas**; la primera imagen sí entra a los 0,37 s. Con el manifiesto no sondea nada: pinta la primera y carga las demás según le tocan. El generador **ya calcula ese mapa por Misterio** (`porMisterio`) y lo descarta al agrupar por bloque; publicarlo cuesta 1,0 KB gzip para 46 entradas. `cantos.html` ya consume el manifiesto de bloques con `imgTrust:true` — es el patrón a seguir, no uno a inventar.

**2. `Cache-Control` en el bucket de ilustraciones.** Hoy **no manda ninguna cabecera de caché**: solo `ETag` y `Last-Modified`, así que todo depende de la heurística del navegador, que en iOS es la más tacaña. Con carruseles completos son ~200 KB por canto y el free repite sesión cada día. Es una casilla en Cloudflare, no código, y beneficia a los 160 heroes y a la app entera.

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
5. **Itinerario** (`niveles.js`) — comprobar en dispositivo: que un **free** que cierra el Misterio 20 de 0101 despierte en **0102** Misterio 1, y que un no-developer que abra audio en un cuaderno `dev` (p. ej. 0202) sea devuelto al mapa con el aviso `nivel_en_desarrollo` en vez de toparse con la pantalla de "próximamente". El developer debe seguir entrando a todos.
5b. **Frontera de progreso** — en el iPhone que destapó el bug: entrar y comprobar que el **selector de niveles** pinta encendidos los cuadernos ya rezados (no solo 1-1), sin borrar nada a mano — el cambio a `cruzando_frontier_v2` se encarga. Y que la consola no saque `[CruzAndo] frontera: error de CÓDIGO`. De paso: cerrar el splash de onboarding debe navegar a `audio.html`, y el slider de la meta diaria en `index` debe mover el anillo en vivo.
5c. **El aviso breve** — prueba **visual**: forzar un `showToast(…)` desde la consola en index y crecer, en tema claro y oscuro, y comprobar que se lee entero sobre la barra de navegación y que no la tapa.

5d. **El canto sin su JSON** — primero **correr `tools\cruzando-sync-real.bat`**: hasta que suba, el bucket sigue sirviendo los `.lrc` viejos (sin `[ti:]`, con el «N. » y sin los cortes) mientras el código ya espera los nuevos — el título saldría vacío y caería en el nombre del Misterio. Después, en dispositivo: que el karaoke de `audio` y `rezar` muestre **«Buena noticia»** y no «1. No fue fácil tu comienzo,»; que el popup «Canto» de `orar` abra con su título y **sus estrofas separadas**; y que al cerrar un bloque de cinco la tarjeta nueva de la galería salga con nombre y con la letra partida en cinco tramos. Ver § El canto se explica solo.

5e. **La vuelta del Rosario** — prueba en dispositivo: rezar cinco decenas de un bloque **ya cerrado** y comprobar que el Rosario sale igual (y **sin cifra de metros**, porque el bonus ya se cobró); saltarse el rezo en el Libro y comprobar que **no** cuenta; y al cerrar los veinte por segunda vez, que salga el reconocimiento con su pregunta y que lo escrito aparezca en el Diario con el chip «Vuelta».

**Tareas anotadas (aparte):**
6. **Settings** de `index.html`/`crecer.html` — botón "Rehacer mi perfil de afinidad" → `sanar.html?rehacer=1` (sanar ya reconoce el parámetro).
7. `sanar.html` — `guardarAfinidad(pain,senales)` (señal implícita de uso) sigue `TODO`, para una fase futura que combine test+uso.
8. `mini.html` — diario en `reflections/…`, alternar pistas MA/MB/L_MA, y crédito (esperan el **modelo económico**, no implementar por pedazos).
9. `diario.html` — revisar nav bar, tema y plan (nunca auditado).
10. Contenido Mundo 2 — faltan `0201.json`, `0202.json`, etc.
10b. **Arte de canto de lo ya publicado** — 34 Misterios sin carrusel en cuadernos `published`: **1-3 M7–M20** y **1-4 completo** (~280 imágenes). Es el trabajo que abre la decisión de no degradar `audio.html`. **Es lo único que falta**: la letra sincronizada ya está completa en los cuatro cuadernos publicados (ver § Los `.lrc`). Ver § El arte del canto.
10c. **Manifiesto por Misterio + `Cache-Control` en R2** — las dos mejoras de velocidad aprobadas y **sin implementar**. Ver § Las dos mejoras aprobadas.
11. Verificación en producción: respuestas del modal de audio.html → diario.html.
12. **App Check**: registrar la clave de sitio reCAPTCHA v3 para `cruzando.app`, pegarla en `appcheck-key.js`, desplegar y mirar métricas unos días **antes** de activar el bloqueo en la consola (Auth primero; Firestore/Functions después).
13. Alta en dispositivo: casilla bloqueando por los dos métodos, `users/{uid}.terminos` escrito, y que "Entrar" siga sin fricción.
14. `firebase-service.js` es código muerto (ninguna página lo carga) y todavía registra sin casilla: borrarlo o alinearlo si alguna vez se conecta.
15. **Kit de recompensas en standby** — prueba **visual** en dispositivo con `MOSTRAR_RECOMPENSAS = false`: que el nodo cada-5 se vea como separador discreto (claro y oscuro), que el camino no se descuadre, que no quede ningún cofre/botón/filtro muerto, y que los metros se sigan acumulando y mostrando normal.
16. **DEUDA BLOQUEANTE del kit** — el doble cobro de `extras.html` (`getProductState` compara objetos contra strings) debe arreglarse **o eliminarse en el rediseño de la tienda ANTES** de poner `MOSTRAR_RECOMPENSAS = true`. Ver § Kit de recompensas.
