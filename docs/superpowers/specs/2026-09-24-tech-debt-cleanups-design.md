# Diseño: limpieza de deuda técnica (radio, i18n, reenvíos a canales públicos)

**Estado:** Propuesto
**Fecha:** 2026-09-24
**Contexto:** después de #290 (capa de radio), #291 (refresco de torres
por país), #293 (toggle de radio en la home) y #294 (intereses del
usuario). Siete reportes pendientes; cada uno se verificó contra el
código de `main` (y, cuando aplicaba, contra Overpass en vivo y el log
del run 35952452042) antes de proponer nada. Clase de defecto dominante:
éxito silencioso (`docs/silent-failure-patterns.md`).

## Resumen

| # | Reporte | Veredicto | Severidad |
|---|---------|-----------|-----------|
| a | `sidebar.sortBy` duplicada ×4 | **Real** (TS1117 ×4; `tsc` no corre en CI) | Baja |
| b | `TrackerDirectory.tsx` sin montar | **Real** (913 líneas muertas) | Baja |
| c | IL/PS/YE/BF/NE con 0 torres | **Real, pero no es bug de query**: OSM no tiene ningún nodo con `communication:radio` en esos países. El defecto es de UX: toggle vacío sin explicación | Media |
| d | Globo 3D móvil sin `staticLayers` | **Real**, y es más amplio: tampoco recibe `liveLayers`, `trackerSlug`, `radioCountryCodes`, `mapBounds` | Media |
| e | Menores de radio | **Real** los tres; el de rendimiento es menor de lo reportado | Baja |
| f | Reenvío público si falla el push | **Real** en `light-scan`, `post-social-queue` y `daily-video`; en `telegram-notify` es teórico (la ruta no publica nada desde 2026-08-09). Más hallazgos nuevos: el resolvedor de conflictos de `hourly-scan.yml` está muerto y **pierde actualizaciones en cada run desde 2026-09-23** (N1, caída activa); `daily-video` sale en rojo a diario por árbol sucio; `curl` sin `-f` | **Crítica** (N1) / Alta |
| g | "El run se puso rojo con 2/34 stale" | **Falso.** El run 35952452042 terminó `success`; la regla de salud se comportó bien | — (se descarta) |

## Objetivos y no-objetivos

**Objetivos**

- Que ningún reintento, cancelación o push fallido pueda publicar dos
  veces en `TELEGRAM_CHANNEL_ID` o en Bluesky (el canal público tiene
  suscriptores externos; un duplicado no se puede retirar).
- Que un toggle de capa nunca prometa datos que no existen: una capa
  vacía para el tracker lo dice.
- Paridad del globo 3D móvil con el de escritorio en capas.
- Que el pipeline horario deje de perder actualizaciones (hotfix PR-0,
  antes que todo lo demás).
- Borrar código muerto y cerrar los errores TS1117 (qué texto de orden
  se conserva lo decide el owner, pregunta 5).

**No-objetivos**

- Ampliar el filtro de Overpass para incluir antenas de telefonía o
  torres genéricas (cambia la semántica de la capa; ver pregunta 1).
- Arreglar los ~113 errores de `tsc` restantes o meter `astro check`
  en CI (se anota como riesgo; es un workstream propio).
- Reescribir el pipeline de social: sólo se cierran las ventanas de
  reenvío.
- Clustering de marcadores en Leaflet.

## 1. Claves `sidebar.sortBy` duplicadas (a)

**Evidencia.** `npx tsc --noEmit -p .` reporta exactamente cuatro
TS1117, uno por locale, en `src/i18n/translations.ts:536`, `:1242`,
`:1941`, `:2640`. Los pares:

| Locale | Primera (E7, 3923c8e06, 2026-09-07) | Segunda (a9e5b68d1, 2026-04-12) — la que gana hoy |
|---|---|---|
| en | `:515` `'Sort'` | `:536` `'Sort by'` |
| es | `:1221` `'Orden'` | `:1242` `'Ordenar por'` |
| fr | `:1920` `'Tri'` | `:1941` `'Trier par'` |
| pt | `:2619` `'Ordem'` | `:2640` `'Ordenar por'` |

Único consumidor: `SidebarPanel.tsx:692-693`, como `aria-label` del
radiogroup y como etiqueta visible antes de los botones
Relevance | Activity. En un literal de objeto la última clave gana, así
que el texto que se ve hoy es "Sort by". El error nunca bloqueó nada:
`npm run build` es `generate-api && copy-cesium && astro build`
(`package.json:11`), ningún workflow corre `tsc` ni `astro check`, y el
repo tiene 117 errores de `tsc` en total. `CLAUDE.md:15` dice que
`npm run build` hace "Type-check + build", y eso es falso.

**Diseño.** Se borran las cuatro primeras (`:515`, `:1221`, `:1920`,
`:2619`) y se conservan "Sort by" / "Ordenar por" / "Trier par" /
"Ordenar por".

- *Alternativa:* conservar las cortas de E7 ("Sort", "Orden"...). Son
  más compactas para el sidebar, pero cambian el texto visible sin que
  nadie lo haya pedido, y "Orden" suelto se lee mal en español.
- *Recomendación (provisional, bloquea el merge de PR-3 hasta que el
  owner responda la pregunta 5):* conservar las largas, que es lo que se
  ve hoy. Pero la historia matiza "sin cambio visible": el consumidor
  original de "Sort by" desapareció en #116 (679afb64c, 2026-04-23), y
  E7 (3923c8e06) volvió a añadir la clave como "Sort" a propósito para
  el control compacto `.cc-sort-label`. Las largas ganan hoy por
  accidente.

**Guardarraíl.** `src/i18n/translations.test.ts` no puede ver
duplicados, porque el objeto ya llega deduplicado en runtime. Se añade
un test que lee el *texto* de `translations.ts`, parte por bloque de
locale y falla si una clave aparece dos veces. Cuesta menos que meter
`tsc` en CI con 113 errores preexistentes. Se corrige también
`CLAUDE.md:15` para que diga "build (sin type-check; ver `npm run check`)".

## 2. `TrackerDirectory.tsx` muerto (b)

**Evidencia.** Nada importa el componente: la búsqueda de
`TrackerDirectory` en `src/` sólo encuentra el propio archivo
(`src/components/islands/TrackerDirectory.tsx`, 913 líneas) y un
comentario en `src/lib/tracker-directory-utils.ts:2` ("Pure business
logic for the TrackerDirectory component"). En cambio,
`tracker-directory-utils.ts` sí está vivo: lo importan 13 módulos de
`CommandCenter/`, `hero-selection.ts`, `geo-utils.ts` y
`src/pages/api/cards/[tracker].json.ts:17`. El último commit que tocó
el componente fue #158. Los imports del componente son sólo React y
ese módulo de utilidades, así que borrarlo no deja otros módulos
huérfanos.

**Diseño.**

1. `git rm src/components/islands/TrackerDirectory.tsx`. Ojo con la
   trampa de pathspec de `[tracker]`: esta ruta no tiene corchetes,
   pero conviene revisar `git status` después.
2. `tracker-directory-utils.ts:2`: reescribir el comentario como
   "Pure business logic for tracker cards (CommandCenter, cards API)".
   *Alternativa:* renombrar el módulo a `tracker-card-utils.ts`. Toca
   17 imports sin ganar nada de comportamiento; no se hace en este
   workstream.
3. `CLAUDE.md:108`: quitar la línea de `TrackerDirectory.tsx` de la
   lista "Display surfaces" de Event Media. La lista de React Islands
   **no** menciona el componente (verificado), así que ahí no hay nada
   que cambiar. El reporte original lo daba por hecho.

**Verificación.** `npm run build` en verde y `grep -rn TrackerDirectory
src CLAUDE.md` vacío, salvo el nombre del módulo de utilidades.

## 3. Torres de radio con cero features (c)

**Evidencia: no es un bug de la query.** La query real es
`buildTowerAreaQuery` (`scripts/geo/refresh-layers.ts:246-249`):
`node["man_made"~"^(tower|mast)$"]["communication:radio"]["communication:radio"!~"^no$"](area.a)`.
Se lanzó a mano contra `overpass-api.de` el 2026-09-24 con `out count`,
usando la misma forma de área (strict para IL/YE/BF y no-strict para
PS/NE):

| País | Áreas | `tower\|mast` (nodos) | + `communication:radio` (filtro actual) | `tower:type=communication` | + `communication:radio` | `communication:television` | `communication:mobile_phone` |
|---|---|---|---|---|---|---|---|
| IL | 1 | 484 | **0** | 247 | 0 | 18 | 112 |
| YE | 1 | 792 | **0** | 200 | 0 | 0 | 15 |
| BF | 1 | 612 | **0** | 543 | 0 | 0 | 9 |
| PS | 1 (no-strict) | — | **0** (`nwr["communication:radio"]` = 0) | 5 | 0 | 0 | 1 |
| NE | 1 (no-strict) | — | **0** (`nwr["communication:radio"]` = 0) | 243 | 0 | 0 | 7 |

En todos los casos el área se resuelve (count = 1), de modo que el
fallback de PS (`:367-371`) no interviene en el cero. Lo que pasa es
que en OSM, en estos países, nadie etiqueta las torres con
`communication:radio`. Los mismos números aparecen en `main`:
`_provenance.countries` de `public/geo/layers/radio-towers.geojson`
registra `IL/PS/YE/BF/NE: count 0, status fresh` a
`2026-09-24T03:41:10Z`. Por construcción son "fresh": una respuesta con
área válida y cero nodos es un resultado legítimo, y
`isSuspiciousDrop` (`:378`) nunca salta desde 0.

**El defecto real es de UX (éxito silencioso).** Estos trackers tienen
**todos** sus países en cero:

| Tracker | `radioCountryCodes` | Torres visibles |
|---|---|---|
| `gaza-war` | PS, IL | 0 |
| `israel-palestine` | IL, PS | 0 |
| `yemen-conflict` | YE | 0 |

(`sahel-insurgency` tiene ML = 74 e `iran-conflict` tiene IR/IQ, así
que no están vacíos.) En esos tres el toggle "Radio towers" aparece,
se activa y no pinta nada. `IntelMap.tsx:186-187` calcula
`count: layer?.features.length` *después* de `filterByCountry`, pero
`MapLayerToggles.tsx:128` sólo muestra el contador si `count > 0`, y lo
mismo hace `CesiumControls.tsx:392`. El estado de la fuente es `fresh`
porque el archivo global no está vacío (`useGeoLayers.ts:144`,
`isEmpty` mira el archivo entero y no el subconjunto del tracker).
Resultado: el lector ve un toggle encendido, sin error y sin datos.

**Diseño.** Hay tres opciones, no excluyentes:

- **C1 — quitar `radio-towers` de `map.staticLayers`** en los tres
  trackers de la tabla, sin tocar `radioCountryCodes` (lo sigue usando
  `radio-stations`, `refresh-layers.ts:866`). Es barato, pero oculta el
  hueco en vez de explicarlo, y si mañana alguien etiqueta torres en
  OSM, nadie se entera.
- **C2 — estado explícito "sin torres etiquetadas".** Si una capa que
  declara `emptyStateKey` (sólo `radio-towers`; `radio-stations` también
  tiene `filterByCountry` y no debe decir "torres") queda en 0 features
  tras filtrar y **todos** los países del tracker son `count 0, fresh`,
  el toggle muestra un texto corto visible ("none tagged") y, como
  descripción accesible (`aria-describedby`) y `title`, la frase
  completa: "No radio-tagged towers in OpenStreetMap for Israel,
  Palestinian Territories". El texto nombra el filtro, no dice que no
  haya torres: IL tiene 484 nodos `tower|mast`, ninguno con
  `communication:radio` (tabla de arriba). Los países van con nombre
  localizado (`Intl.DisplayNames`), no con código ISO. El dato sale de
  `_provenance.countries`, vía el helper puro
  `emptyScopeReason(layer, codes, meta)` en `src/lib/geo-layer-schema.ts`.
  Superficies: `MapLayerToggles` (2D, escritorio y la pestaña MAP
  móvil), `CesiumControls` (globo escritorio) y `GlobeMobileSheet`
  (globo en teléfono, `CesiumGlobe.tsx:993-1034`).
- **Antes del clic.** Las capas sólo se descargan cuando se encienden
  (`useGeoLayersData.ts:39`), así que un estado calculado sólo en runtime
  aparece después de que el lector ya pulsó un toggle vacío. Por eso el
  conjunto vacío se calcula también **en build** (`computeEmptyScopes`
  lee `public/geo/layers/radio-towers.geojson` en `getStaticPaths`) y
  llega como prop `emptyScopes`; el valor en runtime, cuando existe,
  manda.
- **Vacío parcial.** `sahel-insurgency` (ML 74, BF y NE en 0) no muestra
  nada con la regla todo-o-nada; si se revela el vacío parcial es la
  pregunta 8.
- **C3 — ampliar el filtro** a `communication:television` o
  `tower:type=communication`. Para IL daría 18 o 247 elementos, pero
  mezcla televisión y antenas celulares en una capa que se llama
  "Radio towers" y que abre un reproductor de audio al hacer clic.
  Queda fuera de alcance (pregunta 1).

**Recomendación:** C2 ahora; C1 sólo si el owner prefiere no mostrar
toggles vacíos en absoluto. C2 generaliza: sirve para cualquier
tracker futuro cuyo país esté vacío en OSM y no depende de que alguien
se acuerde de editar `tracker.json`. Además, en el refresco,
`runRadioTowers` emite un `::notice::radio-towers <CC>: 0 radio-tagged
towers in OSM` por país cuyo estado **final** (tras `mergeCountryTowers`)
es `fresh` con 0; un cero que el merge conservó como `stale` por caída
sospechosa sólo recibe su warning. No es warning (no es fallo),
pero deja rastro en el log. YE ya se sabía vacío; lo nuevo es que IL,
PS, BF y NE están igual.

## 4. El globo 3D móvil no recibe capas estáticas (d)

**Evidencia.** La ruta móvil es la siguiente: `src/pages/[tracker]/index.astro:155-170`
monta `MobileTabShellLoader` con `liveLayers`, `staticLayers` y
`radioCountryCodes`. De ahí pasa a `MobileTabShell.tsx:166` y después
a `MobileMapTab.tsx`, que recibe todas esas props (`:25`, `:40`) y las
pasa al mapa 2D `IntelMap` (`:100-111`). Pero la instancia perezosa de
`CesiumGlobe` (`:141-153`), la del botón "Load 3D Globe", sólo recibe
`points, lines, kpis, meta, events, cameraPresets, categories,
mapCenter, isHistorical, endDate, clocks`. Por eso `CesiumGlobe.tsx:131`
toma los valores por defecto `staticLayers = []` y `liveLayers = []`,
con `trackerSlug` y `radioCountryCodes` en `undefined`. Hay más de lo
reportado: además de las capas estáticas (nucleares, cables, radio),
faltan las capas live (frontline, GDACS...) y `trackerSlug`, que
`CesiumGlobe` usa para el estado de vista compartible (ADR-0001) y
para scopes. También falta `mapBounds`. `weatherPoints` y
`globeLayout`, en cambio, no llegan ni a `MobileMapTab`.

**Diseño.** Pasar a `<CesiumGlobe>` en `MobileMapTab.tsx` las mismas
props que ya tiene: `trackerSlug`, `mapBounds`, `liveLayers`,
`staticLayers` y `radioCountryCodes`.

- *Alternativa:* que `MobileMapTab` reparta un único objeto
  `layerProps`, compartido por `IntelMap` y `CesiumGlobe`, para que las
  dos listas no vuelvan a divergir. Es más robusto, pero cambia la
  firma de dos componentes.
- *Recomendación:* el `layerProps` compartido, sólo dentro de
  `MobileMapTab` (un `const layerProps = {…}` que se esparce en ambos).
  No cambia ninguna firma y la divergencia pasa a ser imposible en ese
  archivo.

**Riesgo de rendimiento.** En móvil, `useStaticGeoLayer` crea una
entidad Cesium con billboard SVG por cada feature (`useGeoLayers.ts:172-178`).
Para `nato-airspace-incursions` son unas 470 torres más las
estaciones. Las capas arrancan apagadas (`CesiumGlobe.tsx:185`)
**salvo** por una ruta: el mapa 2D móvil escribe `layers=` en la URL
(`IntelMap.tsx:135`) y el globo perezoso la lee al montarse
(`CesiumGlobe.tsx:148`, `:181-187`); si el lector encendió las torres en
2D, en 3D arrancan encendidas, y las capas por defecto del globo que no
están en `layers=` (satélites, vuelos) arrancan apagadas (`:165-175`).
Antes de mergear, el **owner** (no un agente) prueba ambas rutas en un
teléfono real y decide: publicar, ocultar las capas de radio en el
globo móvil o agrupar billboards primero.

**Techo silencioso anotado.** `CesiumGlobe.tsx:641-649` y
`IntelMap.tsx:171` tienen tres slots fijos (`staticLayers[0..2]`); un
cuarto id se ignora sin aviso. Hoy el máximo es 3 (`ukraine-war`). Se
propone `.max(3)` en `tracker-config.ts:46`, para que el cuarto falle
en build y no en silencio.

## 5. Menores de radio diferidos (e)

**e1 — `radioTowers.run()` sin uso.** `refresh-layers.ts:743-754`
define un `Adapter` cuyo `run()` llama a `runRadioTowers`, pero
`main()` salta el camino genérico para ese id (`:950-956`) y usa
`runAndWriteRadioTowers`. El adapter sólo sigue en `ADAPTERS` (`:924`)
para que `--check` itere su id. Es código duplicado que nadie ejecuta,
y lo mantiene vivo un comentario que admite que es un "fallback"
(`:737-742`). *Diseño:* separar la lista en `LAYER_IDS` (lo que valida
`--check`) y los runners; `radio-towers` queda como un runner custom.
La forma mínima es un campo `custom: true` en `Adapter`, cuyo `run`
lanza `'radio-towers uses runAndWriteRadioTowers'`, de modo que
cualquier llamada accidental falla en vez de escribir un archivo sin
chequeo de salud.

**e2 — idiom `'previous' in deps`** (`:796`):
`const previous = 'previous' in deps ? deps.previous! : readPreviousFn(…)`.
Distingue "no pasé `previous`" de "pasé `null`", pero `{ previous:
undefined }` cuenta como pasado, y el `!` miente al tipo. Los tests de
`runAndWriteRadioTowers` (`refresh-layers.test.ts:752-811`) no pasan
`previous`, así que hoy leen el `radio-towers.geojson` real del disco
(inocuo, porque `runFn` está stubbeado, pero es acoplamiento).
*Diseño:* eliminar `previous` de `RunAndWriteRadioTowersDeps`; los
tests inyectan `readPreviousFn: () => null` (o el layer que necesiten).
Una sola vía de inyección.

**e3 — `divIcon` por marcador** (`GeoLayersLeaflet.tsx:53-54`).
`pointToLayer` crea un `L.divIcon` nuevo por feature, con el SVG
completo como `html`. El objeto icono se podría compartir, pero Leaflet
crea un nodo DOM por marcador de todos modos: hoistear el icono ahorra
asignaciones, no DOM. El coste real es DOM: unas 470 torres en
`nato-airspace-incursions` (PL 317 + RO 101 + bálticos) más estaciones,
todos en el panel SVG/HTML. *Diseño:* (1) crear el `divIcon` una vez
por capa (`useMemo` por `id`); es gratis. (2) Medir con el Performance
panel en `nato-airspace-incursions` y `southeast-asia-escalation`
(PH 373) con las dos capas de radio encendidas. Si el pan/zoom baja de
unos 50 fps en un portátil medio, pasar las torres (que no necesitan
icono de marca) a `L.circleMarker` con `renderer: L.canvas()`. *No* se
propone clustering (es un no-objetivo).

## 6. Reenvío a canales públicos tras un push fallido (f)

Patrón común: **publicar → escribir estado en disco → `git push`**. La
fuente de verdad del "ya publicado" es un archivo en `main`, y cada run
empieza con un checkout fresco. Así que cualquier cosa que impida que
el estado llegue a `main` hace que el siguiente run vuelva a publicar:
un push fallido, un job cancelado entre la publicación y el push, o un
timeout.

**Evidencia por workflow:**

| Workflow | Publica en | Estado | Ventanas de reenvío |
|---|---|---|---|
| `telegram-notify.yml` | `TELEGRAM_CHANNEL_ID` (`:82`) vía `scripts/telegram-channel.ts` | `public/_hourly/telegram-sent.json`, push en `:85-110` | **Hoy no publica nada:** los dos llamadores de `hourly-post.ts`, único escritor en CI de `today-updates.json`, están en `if: false` (`hourly-scan.yml:594`, `:682`); el manifiesto sigue en `2026-08-09` y el último commit del sent-log es `f3bc2060a` (2026-08-09). Las ventanas siguientes son teóricas hasta que el owner decida re-cablear o retirar la ruta (pregunta 6). (1) push fallido tras 3 intentos; el propio `:107` lo admite: "next run will re-send these updates to the public channel". (2) `concurrency: cancel-in-progress: true` (`:16-18`): un push a `today-updates.json` durante el envío cancela el run *después* de publicar y *antes* de hacer commit, y el run nuevo reenvía. (3) El sent-log se guarda una sola vez, al final del bucle (`telegram-channel.ts:476`); un crash a mitad pierde todo lo ya enviado. |
| `light-scan.yml` | `TELEGRAM_CHANNEL_ID` (`:29`, como `TELEGRAM_CHAT_ID`) | `state.alerted` en `public/_hourly/state.json`, push en `:32-72` | (1) Push fallido, y el siguiente run, 15 min después, no tiene memoria del `state.alerted` (`hourly-light-scan.ts:370-386`). Es exactamente el incidente de mayo que el comentario de `:36-44` documenta, sólo que esta vez por push y no por `git add`. Además, `saveState` se llama una sola vez, al final (`:462`), después del bucle que publica (`:385-386`) y de escribir `alerts.json`: un crash o timeout tras una alerta no deja nada en disco. Es el único publicador por-evento que está vivo hoy. (2) `cancel-in-progress: true` (`:9-10`) con cron cada 15 min y `timeout-minutes: 5`: la cancelación sólo ocurre si un run se solapa con el siguiente, lo cual es raro pero posible. |
| `post-social-queue.yml` | Bluesky (`:35-39`, `scripts/bluesky-post.ts`) | `public/_social/queue-<fecha>.json` (`status: posted`), `history.json`, `budget.json`; push en `:41-66` | Si el push falla, el siguiente slot del mismo día (cron `0 8,13,18,22`) vuelve a encontrar la entrada `approved` sin `tweetId` (`bluesky-post.ts:423-427`) y la publica otra vez: hasta 3 duplicados al día. El estado se guarda sólo al final (`:589-592`), así que si `timeout-minutes: 5` mata el proceso a mitad de lote, pasa lo mismo. |
| `daily-video.yml` (job `video`) | Bluesky (`:175-191`), Telegram `sendVideo` (`:330-368`) | `public/_social/video-post-<fecha>.json` (`:193-218`) | Bluesky tiene idempotencia (`post-video-social.ts:514-516`, `:542-544`), pero depende de un archivo que sólo existe en `main` si el push funcionó. **Telegram no tiene ninguna**: `curl` publica sin consultar ningún registro. Y `:370-385` pone el job en rojo cuando falla el push de estado, lo que invita justo a pulsar "Re-run" y provoca el reenvío a Telegram (y a Bluesky, si el registro no llegó). **Esto ocurre a diario:** los runs 36090465310, 35950367253 y 35814001800 fallan en ese paso porque `commit_social` choca 5 veces con `cannot pull with rebase: You have unstaged changes`. El registro sí llega a `main` (el paso siguiente hace `git reset --hard` y empuja ambos commits; los registros del 09-23, 09-24 y 09-25 están en `origin/main`), pero el job queda rojo. Y un "Re-run" no vería el registro aunque esté en `main`: el checkout (`:26`, `:394`) no fija `ref`, y un re-run reutiliza el `GITHUB_SHA` original. |
| `daily-video.yml` (job `video-progress`) | Ídem (`:516-604`) | `:534-553` | Igual que arriba, y además el push es de un solo intento: `git pull --rebase … \|\| true` seguido de un `git push` (`:547-548`). |

**Hallazgos nuevos durante la verificación:**

- **N1 — resolución de conflictos invertida en `hourly-scan.yml:1033-1044`.**
  Durante `git pull --rebase`, `--ours` es la rama *sobre la que* se
  rebasa (`origin/main`) y `--theirs` es el commit local que se está
  reaplicando; así lo documenta `git-rebase(1)`. El comentario dice
  "theirs for metrics, ours for tracker data", pero el efecto es el
  contrario de lo que pretende: en un conflicto sobre datos del
  tracker gana la versión de `main` y **se descarta la actualización de
  este job**. En `_metrics/` y `state.json`, en cambio, gana la versión
  local y se pisa la de `main`. Como cada job de la matriz hace
  `git add public/_hourly/ public/_social/` (`:1013`), los conflictos en
  `today-updates.json` son plausibles. Si ese archivo se resuelve a la
  versión de `main`, se pierde la entrada de este tracker y
  `telegram-notify` nunca anuncia la actualización. Además,
  `git rebase --continue --no-edit` (`:1044`): `git rebase -h` (git
  2.53) no lista `--no-edit` para `--continue`. *Hay que verificarlo en
  un repo de prueba*; si el flag se rechaza, cada conflicto acaba en
  `--abort` y el bucle sólo reintenta. **Verificado (revisión
  adversarial, 2026-09-25): es una caída activa.** `--no-edit` sale con
  129, el bloque de resolución es código muerto, y como cada job de la
  matriz añade su entrada a `public/_metrics/index.json`
  (`hourly-scan.yml:988-1001`), todos menos el primero chocan 5 veces
  igual y su actualización se pierde en el runner. Los 9 runs desde
  `35810420279` (2026-09-23T02:27Z, justo después de #289) terminan en
  `failure`; el run `36086706261` empujó 1 de 10 jobs `act`. Además,
  como `hourly-scan` falla, `telegram-notify` (trigger `workflow_run`)
  queda `skipped`. **Severidad crítica; va sola en un hotfix PR-0.**
- **N2 — `curl -s` sin `-f` en `daily-video.yml:361-368` (y `:597`).**
  Un 400 o 403 de Telegram deja a `curl` con salida 0 e imprime
  "✅ Video posted to Telegram". Es éxito silencioso de manual.
- **N3 — `telegram-channel.ts:454-458` marca como enviado un update
  cuyo envío falló:** añade la entrada al sent-log aunque `messageId`
  sea `null`. Es lo contrario de un reenvío: una
  pérdida permanente. Va en el mismo PR porque toca la misma función.

**Diseño.** Hay un principio para todos los casos: *el registro de "ya
publicado" se hace durable antes de dar por terminada la publicación, y
cada publicación consulta ese registro inmediatamente antes de enviar*.

- **F1 — cancelaciones fuera.** Poner `cancel-in-progress: false` en
  `telegram-notify.yml` y en `light-scan.yml`. El segundo run espera
  (`concurrency` encola uno solo) y encuentra el estado ya empujado.
- **F2 — commit incremental del estado.** En `hourly-light-scan.ts`
  (`saveState` justo después de cada alerta publicada; es el publicador
  vivo), `bluesky-post.ts` y, si se re-cablea, `telegram-channel.ts`,
  el estado se guarda después de *cada* publicación exitosa, no al
  final. Así un crash o un timeout
  conserva lo ya publicado en el working tree. (No protege si falla el
  push; eso lo cubre F3.)
- **F3 — el push fallido no puede provocar un reenvío.** Hay tres
  alternativas:
  - *F3a:* reintentos más robustos (5 intentos con backoff, como
    `hourly-scan`), con `git pull --rebase --autostash` (el árbol sucio
    es lo que rompe `daily-video` hoy). Sólo cubre **carreras** de push:
    un conflicto de contenido se repite idéntico en cada intento, así
    que el helper lo detecta, nombra el archivo en un `::error::` y deja
    de reintentar. Reduce la probabilidad, pero no la elimina.
  - *F3d:* **checkout de `main`, no del SHA original.** Todo job que
    publica usa `actions/checkout` con `ref: main`; si no, un "Re-run"
    (mismo `GITHUB_SHA`) no ve el registro que empujó el intento 1.
  - *F3b:* una rama de estado dedicada (`bot-state`) sin carreras con
    los 14 bots de `main`. Es un cambio grande de arquitectura.
  - *F3c:* **consultar la plataforma antes de publicar.** Telegram no
    permite leer el historial de un canal con la Bot API, pero sí se
    puede guardar el `message_id` en una caché de Actions
    (`actions/cache` con clave `telegram-sent-<run_attempt>`), o subir
    el sent-log como artefacto y descargarlo en el siguiente run. En
    Bluesky, `app.bsky.feed.getAuthorFeed` sí permite comprobar si el
    texto o la URL ya se publicó en las últimas 24 h.
  - *Recomendación:* F3a en todos los casos, más F3c para Bluesky
    (`getAuthorFeed`, deduplicando por la URL del tracker en el
    embed). Para Telegram, F3a más una **alerta privada** cuando el push
    falla tras publicar: un `sendMessage` a `TELEGRAM_ALERT_CHAT_ID`
    (nunca al canal público) con los keys publicados, para que el
    operador pueda añadirlos a mano. F3b queda como pregunta abierta.
- **F4 — `daily-video.yml`.** (1) El paso de Telegram consulta
  `record.posted.telegram` del mismo `video-post-<fecha>.json` que usa
  `post-video-social.ts`, y lo escribe tras un éxito. En la práctica
  basta con mover el envío de Telegram a `post-video-social.ts` como
  una plataforma más, así hereda su idempotencia. (2) `curl -sf` y
  comprobar `.ok == true` en el JSON de respuesta (N2); un rechazo de
  Telegram pone el job en rojo (con un texto que dice que re-ejecutar es
  seguro, porque no se publicó). (3) Los tres pushes de estado del
  workflow pasan por el helper con `--autostash` (PR-0), y ambos jobs
  hacen checkout de `ref: main` (F3d).
- **F5 — N1 (PR-0).** Cambiar `--no-edit` por
  `GIT_EDITOR=true git rebase --continue` y sustituir "un lado entero"
  por uniones estructurales: `public/_metrics/index.json` se une por
  `file` (con la poda de 90 días), las particiones
  `trackers/<T>/data/events/*.json` por `id` (gana la versión del job en
  un id compartido) y `digests.json` por `date + title`. Cualquier otro
  archivo del tracker toma la versión del job **con un `::warning::`**
  que lo nombra; `state.json` toma `main`; cualquier otra ruta aborta.
  Tomar un lado entero descartaría en silencio la entrada de métricas
  del job en cada run, o eventos/digests que el nightly añadió mientras
  el job corría. Test en repo temporal que comprueba que **ambos lados
  sobreviven**.
- **F6 — N3.** Tres estados: `sent`, `rejected` (4xx, no se publicó) e
  `unknown` (timeout, red, 5xx: quizá se publicó). Sólo `rejected` queda
  fuera del sent-log; la foto sólo cae a texto en `rejected` (una foto
  5xx seguida de texto podría publicar dos veces); un `rejected` 3 veces
  pasa a terminal con alerta privada. Qué hacer con `unknown` (perder vs.
  arriesgar duplicado) es decisión del owner, pregunta 7; el valor
  provisional es no reintentar y avisar al chat privado.

## 7. Salud del refresco de torres del 2026-09-24 (g)

**Veredicto: el reporte es falso; se descarta.** `gh run view
35952452042` muestra `✓ main Refresh Radio Layers`, con `fetch-towers`
✓ (13m15s), `commit` ✓, `fetch-stations` omitido (dispatch sólo de
torres) y `notify-failure` omitido. Las únicas anotaciones son dos
`warning`: `radio-towers RW stale: Overpass failed for RW after retry
(HTTP 504)` y lo mismo para TH. En el log hay líneas con `::error::`,
pero son el *eco del script* del paso `Fail the job if radio-towers
refresh was unhealthy` (`refresh-radio-layers.yml:108-112`) y del bucle
de push. Actions imprime el cuerpo de cada `run:` antes de ejecutarlo,
y esas líneas nunca se ejecutaron. Probablemente de ahí salió el
reporte, al buscar `::error::` con grep.

**La regla se comportó bien.** `assessRadioTowerHealth`
(`refresh-layers.ts:518-548`) marca un run como no sano si algún país
tiene `retrievedAt === null`, si alguno supera los 35 días o si
`stale / total > 0.2`. En este run: 2/34 = 5,9 %, y RW y TH conservan
`retrievedAt: 2026-09-22T23:42:46Z` gracias a la migración legacy
(`:437-470`, `parseLegacyTransformCodes`), es decir, tienen 1 día y no
son `null`. Resultado: `ok: true`, como corresponde a dos 504 de
Overpass. Los cinco países en cero (§3) son `fresh` y no cuentan.

**Una aclaración menor, que no es defecto:** el `--check` posterior
imprime `retrieved 2026-09-22T23:42:46Z`, la fecha del país más viejo
(`radioTowersTopLevelRetrievedAt`, `:594`). Es lo diseñado, pero se lee
como "el archivo no se refrescó". *Propuesta opcional:* que `--check`
imprima para radio-towers `fresh 32/34, oldest 2026-09-22`.

**Riesgo real que sí queda:** el umbral del 20 % tolera hasta 6 de 34
países stale en cada run. Como el cron es mensual (`0 7 1 * *`), un
país con 504 persistente se vuelve rojo por edad (> 35 días) en el
segundo mes, no en el primero. Es aceptable; se deja anotado.

## Orden de implementación

Un hotfix y cuatro PRs independientes, en orden de severidad:

0. **PR-0 · hotfix (N1, F5, árbol sucio de daily-video):** helper de
   push con `--autostash`, resolvedor de conflictos con uniones
   estructurales y los tres pushes de `daily-video` por el helper. No
   depende de ninguna pregunta al owner. Tras el merge: el siguiente
   `hourly-scan` en verde, sin `Failed to push hourly update`, y la
   lista de trackers que perdieron actualizaciones desde 2026-09-23 para
   el owner (pregunta 9).
1. **PR-1 · ops (f):** F1, F2 (light-scan primero), F3a/F3d, F4, F6 más
   la alerta privada. La parte de `telegram-notify` espera a la pregunta
   6. Antes de mergear, `gh pr checks --watch` (ver "Merging" en
   `CLAUDE.md`); el dispatch de `telegram-notify` **no** sirve como
   verificación mientras su manifiesto esté muerto.
2. **PR-2 · UX de radio (c, d):** C2 (`emptyScopeReason` + chip +
   i18n), el `::notice::` de países en cero, las props del globo móvil
   vía `layerProps` y `.max(3)` en `staticLayers`.
3. **PR-3 · limpieza (a, b, e1, e2):** borrado de claves y del
   componente, test de claves duplicadas, correcciones de `CLAUDE.md`,
   refactor de `ADAPTERS` y `previous`.
4. **PR-4 · rendimiento (e3):** hoisting del `divIcon` y, *sólo si la
   medición lo pide*, cambio de las torres a canvas.

## Riesgos

- **F3 no elimina el reenvío en Telegram**, sólo lo hace improbable y
  visible (alerta privada). Para cerrarlo del todo haría falta un
  almacén fuera de `main` (F3b); ver pregunta 3.
- **F5 cambia qué versión gana en conflictos que hoy ocurren.** Las
  uniones cubren los arreglos JSON (métricas, eventos, digests). Para
  archivos-objeto del tracker (`kpis.json`, `meta.json`) gana el job
  entero y lo avisa con `::warning::`; si esos avisos aparecen a menudo,
  hará falta un merge por campo. El test de F5 cubre el caso de dos
  lados que añaden entradas distintas a la misma partición.
- **Timeout del light-scan.** `timeout-minutes: 5` es del job; un job
  cancelado sólo da un margen corto a los pasos `always()`. El plan
  mueve el límite al paso del scan (4 min) para que el commit del
  estado tenga tiempo. Queda un residual si el runner muere.
- **Tests e2e con datos fijos.** Los specs nuevos sirven GeoJSON de
  fixture con `page.route`; así un refresco mensual de OSM (que hace
  commit directo a `main`, donde corre `e2e.yml`) no pone `main` en
  rojo. La parte de build (toggle marcado antes del clic) se prueba con
  un test unitario y con la verificación en vivo.
- **C2 añade una clave i18n** que `translations.test.ts` exigirá en
  los 4 locales. Si alguien añade un locale nuevo, hereda la
  obligación.
- **d en móvil:** si las capas de radio se encienden en el globo móvil,
  cientos de billboards SVG pueden degradar la batería y los fps en
  gama baja. Mitigación: siguen apagadas por defecto; hay que medir en
  un dispositivo real antes de mergear.
- **Deuda de `tsc` (113 errores más):** el test de claves duplicadas
  sólo tapa esta clase de error; el resto sigue sin ningún gate.

## Testing

- `src/i18n/translations.test.ts`: test nuevo que lee el texto fuente
  y falla ante claves duplicadas dentro de un mismo bloque de locale.
  Primero se comprueba que falla contra el `main` actual (4 casos) y
  después que pasa.
- `src/lib/geo-layer-schema.test.ts`: `emptyScopeReason` con (a) todos
  los países en 0 y `fresh` → razón con los códigos; (b) uno con
  features → `null`; (c) país `stale` con 0 → no es "sin torres
  mapeadas" (es otra cosa: dato viejo).
- `MapLayerToggles` / `CesiumControls`: test de render del chip
  atenuado con tooltip cuando `count === 0` y hay razón.
- `scripts/geo/refresh-layers.test.ts`: los tests de
  `runAndWriteRadioTowers` inyectan `readPreviousFn` (e2); un test
  nuevo comprueba que llamar a `run()` del adapter custom lanza (e1), y
  otro que se emite el `::notice::` de país en cero.
- `MobileMapTab`: test que monta la pestaña en estado `loaded` y
  comprueba que `CesiumGlobe` recibe `staticLayers`, `liveLayers`,
  `trackerSlug` y `radioCountryCodes` (mock del lazy import).
- `tracker-config`: un `staticLayers` de 4 elementos falla el parse.
- Ops (f): test de shell (`tests/rebase-conflict.sh`, ejecutado por
  vitest vía `execa` o como paso de `test.yml`) que crea un repo
  temporal, provoca un conflicto en `trackers/x/data/kpis.json` y en
  `public/_metrics/index.json`, ejecuta el bloque de resolución y
  comprueba el contenido que queda. Para `telegram-channel.ts` y
  `bluesky-post.ts`, tests unitarios con fetch inyectado: un fallo a
  mitad de lote deja el sent-log o la cola con las publicaciones
  anteriores ya guardadas (F2), y un envío fallido no entra en el
  sent-log (F6).
- Manual: abrir el panel de capas en `gaza-war` **sin** encender las
  torres (debe leerse "none tagged" y, como descripción accesible, "No
  radio-tagged towers in OpenStreetMap for Israel, Palestinian
  Territories"), también en viewport de teléfono (pestaña MAP y globo),
  y la prueba del owner en un móvil real con `ukraine-war` por las dos
  rutas de §4.
- Specs Playwright nuevos con fixture (`page.route`) y casos con
  viewport 390×844.

## Preguntas abiertas para el owner

1. **¿Ampliar el significado de la capa?** En IL hay 18 torres con
  `communication:television` y 247 con `tower:type=communication`. ¿Se
  queda "Radio towers" en sentido estricto (C2: explicar el vacío) o se
  crea una capa aparte, "Broadcast towers (TV + radio)"? Mezclarlas en
  la actual no se recomienda.
2. **¿C2 o C1 para `gaza-war`, `israel-palestine` y `yemen-conflict`?**
  ¿Toggle visible con "sin torres mapeadas" o quitar la capa del
  `tracker.json`?
3. **Telegram y el reenvío residual (F3):** ¿se acepta "improbable y
  alertado en privado", o se invierte en una rama `bot-state` (F3b) o
  en otro almacén fuera de `main` para el sent-log?
4. **`tsc` en CI:** ¿se abre un workstream para bajar los 113 errores a
  0 y añadir `npm run check` a `test.yml`, o basta el test puntual de
  claves duplicadas?
5. **Texto del label de orden (bloquea PR-3):** "Sort by" gana hoy por
  accidente (su consumidor original se fue en #116); E7 escribió "Sort"
  / "Orden" / "Tri" / "Ordem" a propósito para `.cc-sort-label`. ¿Largo
  (sin cambio visible) o corto (intención de E7)?
6. **(Primera pregunta.) El canal público no recibe posts por
  actualización desde 2026-08-09.** Los llamadores de `hourly-post.ts`
  están en `if: false` desde que se retiró X, y `telegram-channel.ts`
  sólo lee ese manifiesto. ¿Re-cablear un escritor del manifiesto sin X,
  o retirar `telegram-notify.yml`? Hoy sólo llegan al canal las alertas
  del light-scan y el vídeo diario.
7. **Envíos inciertos a Telegram (timeout, red, 5xx):** ¿perder el
  mensaje (valor provisional, con aviso privado), reintentar una vez
  tras una espera (riesgo de duplicado) o dejarlo para seguimiento
  manual?
8. **Vacío parcial:** ¿mostrar "No radio-tagged towers for Burkina Faso,
  Niger" en `sahel-insurgency`, donde Mali sí tiene torres?
9. **Actualizaciones horarias perdidas desde 2026-09-23:** ¿esperar al
  backfill del `update-data` nocturno o lanzarlo ya para los trackers
  afectados?

## Adversarial review log

Revisión del 2026-09-25. Cada hallazgo se verificó contra el código,
los logs de `gh run` y la historia de `origin/main`.

| # | lens | severity | finding | verdict | action/rationale |
|---|------|----------|---------|---------|------------------|
| 1 | truth | important | La ruta `telegram-notify` / `today-updates.json` está muerta desde que se retiró X; PR-1 la endurece sin publicar nada | Aceptado | Verificado: `hourly-scan.yml:594` y `:682` son `if: false`; manifiesto `date: 2026-08-09`; último sent-log `f3bc2060a` (2026-08-09). §6 y el plan lo declaran; Task 3 y la parte telegram-notify de Task 4 quedan en espera de la pregunta 6; se quita la unión de `today-updates` de Task 2; se añade un aviso de manifiesto viejo (Task 4 Step 4c) |
| 2 | truth | important | En teléfono el globo usa `GlobeMobileSheet`, que nunca mostraría el estado vacío | Aceptado | Verificado: `CesiumGlobe.tsx:899` / `:993-1034`; `GlobeMobileSheet.tsx:82` y `:415-423` sin count ni `data-layer`. Task 10 Step 5b añade tipo y render; e2e con viewport 390×844 |
| 3 | truth | important | El razonamiento de `if: always()` en light-scan es falso: `state.alerted` sólo se escribe al final | Aceptado | Verificado: post en `hourly-light-scan.ts:385-386`, `saveState` sólo en `:462`. Nueva Task 4b (`alertAndRecord` guarda tras cada alerta), razonamiento corregido en Task 4 Step 4, y el timeout pasa al paso del scan |
| 4 | truth | minor | "No towers mapped" es falso: hay torres en OSM, sólo sin `communication:radio` | Aceptado | Texto nuevo "No radio-tagged towers in OpenStreetMap for {codes}" en 4 locales; e2e actualizados |
| 5 | truth | minor | El `::notice::` usa el resultado crudo y contradice el warning de caída sospechosa | Aceptado | Task 11 recorre `merged.countries` y excluye `merged.staleReasons`; test nuevo con previous=20 y fetch=[] sin escape hatch |
| 6 | truth | minor | La foto cae a texto también en 5xx, lo que puede publicar dos veces | Aceptado | Verificado `telegram-channel.ts:116-121`. Sólo `rejected` cae a texto; test con fetch falso: foto 502 = cero `sendMessage` |
| 7 | truth | minor | El chip sólo aparece tras encender la capa, porque no se descarga antes | Aceptado | Verificado `useGeoLayersData.ts:39`. Nueva Task 10b: `computeEmptyScopes` en build y prop `emptyScopes`; el valor runtime manda si existe |
| 8 | truth | minor | Reintentar un rebase con conflicto de contenido falla igual 5 veces | Aceptado | `push-state.sh` detecta `--diff-filter=U`, nombra el archivo en `::error::` y deja de reintentar; test nuevo. F3a queda descrito como protección sólo contra carreras |
| 9 | product | critical | N1 es una caída activa que pierde actualizaciones en cada run, no "un fallo ruidoso"; no debe esperar a PR-1 | Aceptado | Verificado: 9 runs `failure` seguidos desde `35810420279`; `36086706261`: 44× conflicto en `public/_metrics/index.json`, 44× `unknown option 'no-edit'`, 9 trackers sin push. Nuevo PR-0 hotfix que va primero y solo; Task 2 Step 9 lista lo perdido (pregunta 9) |
| 10 | product | critical | El push de estado de daily-video falla siempre por árbol sucio; el registro nunca llega a `main` | Parcial (baja a important) | Verificado el árbol sucio: `cannot pull with rebase: You have unstaged changes` ×5 en `36090465310`, `35950367253`, `35814001800`. **Rechazado** que el registro falte: `commit_video_state` hace `git reset --hard HEAD` tras su primer fallo y su segundo intento empuja ambos commits (`526c002..a5a7a74`); los registros 09-23/24/25 están en `origin/main`. El daño real es el job rojo a diario, que invita al "Re-run". Nueva Task 2b (PR-0): diagnóstico del archivo, `--autostash` en `push-state.sh` y test de árbol sucio |
| 11 | product | important | El spec dedica PR-1 a una ruta que no publica nada y deja fuera el canal mudo | Aceptado | Igual que #1; la pregunta 6 pasa a ser la primera y bloquea Task 3; el dispatch de `telegram-notify` deja de ser verificación de despliegue |
| 12 | product | important | La explicación sólo vive en un `title`: invisible en táctil y poco fiable en lectores de pantalla; además usa códigos ISO | Aceptado | Texto corto visible ("none tagged") y frase completa en `aria-describedby` + `title`; nombres con `Intl.DisplayNames` (verificado en Node: "Israel, Palestinian Territories"); e2e con `toHaveAccessibleDescription` y caso móvil |
| 13 | product | important | Tratar un envío incierto como hecho es decisión de producto, no una "desviación" | Aceptado | Nueva pregunta 7; el valor queda como provisional y cada `unknown` manda aviso al chat privado con las claves |
| 14 | product | minor | Resolver `index.json` a favor de `main` borra la entrada de métricas del job | Aceptado | Unión por `file` con poda de 90 días (`merge-json.mjs metrics-index`); el test exige que ambas entradas sobrevivan |
| 15 | product | minor | El texto "towers" es genérico pero `radio-stations` también filtra por país | Aceptado | Campo `emptyStateKey` sólo en `radio-towers`; `emptyScopeReason` devuelve `null` sin él; test para `radio-stations` |
| 16 | product | minor | "Sort by" no es "sin cambio visible" neutral: E7 eligió "Sort" a propósito | Aceptado | Verificado con `git log -S`: a9e5b68d1, 679afb64c (#116), 3923c8e06. La pregunta 5 incluye la historia y bloquea Task 15; comprobación de ancho en 4 locales |
| 17 | product | minor | Vacío parcial (sahel: BF, NE) sin explicación y sin preguntar al owner | Aceptado | Nueva pregunta 8; por defecto se mantiene todo-o-nada |
| 18 | product | minor | Un agente no puede hacer la prueba en teléfono ni decidir "seguir igual" | Aceptado | Task 12 Step 6 pasa a ser OWNER GATE; el PR queda en draft hasta que el owner registre resultado y decisión |
| 19 | failure | critical | Un "Re-run" hace checkout del SHA original y no ve el registro que empujó el intento 1, así que la idempotencia por archivo no protege el caso que pretende cubrir | Aceptado | Verificado: `actions/checkout@v5` sin `ref` en `daily-video.yml:26`, `:394`, `post-social-queue.yml:26`, `light-scan.yml:20`; un re-run reutiliza `GITHUB_SHA`. Nuevo F3d: `ref: main` en todos los jobs que publican, con test de guarda |
| 20 | failure | important | N1 debe ir como hotfix propio, con la tasa de pérdida medida | Aceptado | Duplicado de #9; la medición (1 de 10 jobs `act` en `36086706261`) está en §6 N1 |
| 21 | failure | important | `--ours` para métricas pierde en silencio la entrada del job | Aceptado | Duplicado de #14 |
| 22 | failure | important | `--theirs` de archivo entero para datos del tracker borra lo que `main` añadió al mismo archivo | Aceptado | Verificado: `digests.json` lo escriben el nightly y el hourly (`hourly-scan.yml:569`). Eventos por `id` y digests por `date + title` se unen; otros archivos del tracker toman el job con `::warning::` que los nombra; test donde ambos lados añaden entradas distintas |
| 23 | failure | important | Light-scan escribe el estado sólo al final; F2 no lo cubría | Aceptado | Duplicado de #3 (Task 4b) |
| 24 | failure | important | Parte de PR-1 endurece una ruta muerta y el despliegue la usaría como verificación | Aceptado | Duplicado de #1/#11; Task 7 Step 3 ya no usa `telegram-notify` |
| 25 | failure | minor | `push-state.sh` trata un conflicto como una carrera | Aceptado | Duplicado de #8 |
| 26 | failure | minor | Con `continue-on-error`, un rechazo de Telegram al vídeo deja el run en verde | Aceptado | El paso recibe `id: telegram`; el paso final falla si `steps.telegram.outcome == 'failure'`, con un texto que dice que re-ejecutar es seguro |
| 27 | failure | minor | Los 4xx permanentes se reintentan para siempre; la foto puede duplicar; un error de DNS se pierde como `unknown` | Aceptado | Terminal tras 3 rechazos con aviso privado; foto cae a texto sólo en 4xx; `ENOTFOUND`/`EAI_AGAIN`/`ECONNREFUSED` se tratan como no enviado (reintentable) |
| 28 | failure | minor | La mitigación "las capas arrancan apagadas" no vale: el 2D escribe `layers=` y el globo lo lee | Aceptado | Verificado `IntelMap.tsx:135`, `CesiumGlobe.tsx:148`, `:165-187`. §4 lo documenta y la prueba del owner cubre esa segunda ruta |
| 29 | failure | minor | Los e2e nuevos dependen del GeoJSON real; un refresco de OSM pondría `main` en rojo | Aceptado | Verificado `e2e.yml` `push: branches: [main]`. Los specs sirven fixtures con `page.route` (`radio-towers-empty.geojson`, `radio-towers-ua.geojson`); la parte de build se prueba con test unitario |

Resumen: 28 aceptados, 1 parcial (#10: el diagnóstico del árbol sucio
se acepta; la pérdida del registro se rechaza con evidencia). Ninguno
rechazado del todo.
