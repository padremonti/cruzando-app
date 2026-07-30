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
| `sanar.html` | Entrada emocional al Rosario (pestaña "Sanar" del hub). Máquina de 3 fases: elenco de dolores → acogida interactiva → handoff al Misterio. Navega a `mini.html?mid=…&pain=…`. |
| `mini.html` | Mini sesión de UN Misterio (el "Misterio-puerta" que señaló Sanar). Reproductor cinematográfico a pantalla completa. Todo derivado del `mid` de la URL. |
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

Módulo maduro (~1400 líneas, autocontenido en una IIFE). Máquina de 3 fases (`estado.fase`):

1. **Elenco** — catálogo de *pains* (dolores) en un **wheel 3D con scroll-snap**. Cuatro modos:
   - `navegar` (recorrer todo), `buscar` (texto libre: frase + tags ocultos), `ejes` (chips por eje), `misterio` (numberpad tipo PIN para cargar un `mid` — **solo plan `developer`**, vía `_effectivePlan()` sobre storage).
   - Tocar la tarjeta central abre un **velo de foco** de confirmación antes de entrar.
2. **Acogida** — 1-N pasos definidos por Misterio en `m.acogida`. **7 mecánicas interactivas** ya implementadas: `corazones`, `termometro` (slider vertical), `cuerpo` (silueta + lista accesible), `sendero` (tiempo), `cercania` (colocar el "yo" ante Lux), `peso` (bulto creciente con arte R2), `mosaico` (fallback universal). Cada paso hace `commit(tipo, valor, eco)`; los ecos se reservan para el handoff. Soporta retroceso restaurando estado.
3. **Handoff** — muestra los ecos acumulados uno a uno y presenta el Misterio-puerta. Botón "Entrar al Misterio" → `mini.html?mid=…&pain=…`.

**Datos** (`data/`): `tags.json`, `acogida-plantillas-v1.json`, `{elemento}-pains.json`, `pains-index.json`. Piloto sobre `ELEMENTO = '0101'` (único elenco con datos hoy).
**Pendiente:** `guardarAfinidad()` es un `TODO` — aún no persiste afinidad por eje/tag en Firestore.

## Mini sesión (mini.html) — Misterio-puerta

Reproductor cinematográfico a pantalla completa (~750 líneas). Destino de Sanar. **Todo se deriva del `mid`** de la URL (`?mid=010101&pain=…`), sin hardcode: elemento, número global (1-20), assets R2 y `data/{elemento}.json`.

Flujo de "momentos" (`STEPS`): **Canto** (karaoke `.lrc` sobre carrusel Ken Burns procedimental) → **Palabra** (UBIBLE) → **Contemplación** (CONT) → **Rezo** (con beads/rosario sincronizados vía `data/bead_sync.json`) → **Oración final** (PRAY) → **Epílogo** (canto / diario / concluir).

Buckets R2: `R2_ILU` (ilustraciones), `R2_MUS` (música/lrc), `R2_AUD` (audios). Paleta por Mundo desde `tema.paleta` del JSON. Diálogo de confirmación al salir integrado con `gestures.js` (intercepta el atrás de iOS).
**Pendientes (`TODO`):** guardar el diario en `reflections/…` (mismo formato que orar/audio), alternar pistas de rezo MA/MB/L_MA, y marcar "completado" + consumir crédito al salir.

## Estado de integración por archivo

| Archivo | Nav bar | Tema unificado | Plan/beta | Micro | Metros |
|---------|---------|---------------|-----------|-------|--------|
| index.html | ✅ | ✅ `cruzando_theme` | ✅ `resolvePlan` | — | ✅ lee Firestore |
| world.html | ✅ | ✅ | ✅ | — | — |
| audio.html | ✅ | ✅ | ✅ | ✅ | ✅ progresivos |
| orar.html | ✅ | ✅ (parcial) | ✅ | ✅ | ✅ |
| diario.html | ⚠️ no revisado | ⚠️ | ⚠️ | — | — |
| sanar.html | ✅ | ✅ `cruzando_theme` | ✅ gate `developer` | — | ❌ `guardarAfinidad` TODO |
| mini.html | — (pantalla completa) | ✅ `cruzando_theme` | — | — | ❌ diario/crédito TODO |

## Pendientes conocidos

1. `diario.html` — revisar nav bar, tema y plan (nunca auditado en este ciclo).
2. `sanar.html` — `guardarAfinidad()` no persiste nada en Firestore (solo `console.log`). Datos solo para `ELEMENTO = '0101'`.
3. `mini.html` — guardar el diario en `reflections/…`, alternar pistas de rezo MA/MB/L_MA por posición/idioma, y marcar "completado" + consumir crédito al salir (todos `TODO`).
4. Contenido Mundo 2 — faltan `0201.json`, `0202.json`, etc. (audio, preguntas, cantos).
5. Verificación en producción: que las respuestas del modal de audio.html aparezcan en diario.html.
