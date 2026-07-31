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

## Modelo económico (DISEÑADO, NO implementado — proyecto futuro)

- **Híbrido**: suscripción (mensual/anual, todo incluido) **O** créditos (renta pain por pain). **Unidad = pain**; 1 crédito = 1 pain. **Cobro al ENTRAR**. Ventana de acceso **1 semana**. Paquetes vía **Stripe** + créditos de regalo al registrarse. El completado anotará vía `sub | credito` para analytics.
- Arquitectura técnica (Stripe, shape Firestore, cobro atómico) **en inspección, sin implementar**.
- **Crédito en mini**: comentario TODO reubicado al epílogo ("completó = pagó", con guardia por sesión) — documentado, **no construido**. No implementar por pedazos: espera el modelo completo.

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
