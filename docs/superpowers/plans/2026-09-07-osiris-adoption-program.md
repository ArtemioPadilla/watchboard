# Programa: lecciones de OSIRIS aplicadas a Watchboard

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking. Cada historia es una unidad de entrega independiente (una rama, un PR); cada épica es un milestone.

**Fecha:** 2026-09-07
**Estado:** Draft, pendiente de priorización por Prometeo
**Spec:** `docs/competitive-analysis-osiris.md` (v2)
**Autor:** análisis de código de `simplifaisoul/osiris@d2c08c8` y `watchboard@feead12`

**Goal:** Cerrar los nueve gaps identificados frente a OSIRIS sin abandonar el modelo estático de Watchboard: estado de vista compartible, fuentes en vivo confiables con estado degradado visible, panel de alertas, dossier por clic, capas geoespaciales con procedencia, geoparsing del light scan, índice de actividad honesto, imagen Docker y procedencia visible en texto generado por IA.

**Architecture:** Todo el trabajo es cliente estático + scripts de build + scan, salvo un handler opcional en el Worker de Cloudflare para fuentes sin CORS. No se añade servidor. Las librerías nuevas van a `src/lib/` como funciones puras con tests vitest; los componentes se enganchan en los puntos ya existentes (`CesiumGlobe.tsx:489-497` para hooks de capa, `layout-presets.ts:7-14` para paneles del globo, `CommandCenter.tsx:882-891` para overlays del homepage, `hourly-types.ts:63-74` para el pipeline).

**Tech Stack:** Astro 5, React 19, Cesium 1.139, Leaflet 1.9, Zod 3, vitest 4, Playwright, Cloudflare Worker, GitHub Actions.

---

## Cómo leer este plan

- **Épica (E#)**: objetivo de producto, cierra ítems del `BACKLOG.md` o del roadmap.
- **Historia (E#.H#)**: entregable independiente con criterios de aceptación GIVEN/WHEN/THEN. Cumple INVEST.
- **Tarea**: paso de implementación con archivo destino. Se marca con `- [ ]`.
- **Esfuerzo**: XS < 2 h, S medio día, M 1-2 días, L 3-5 días.
- **Procedencia**: cada épica cita el archivo de OSIRIS del que toma el patrón y el archivo de Watchboard donde se inserta.

Clave de esfuerzo y prioridad igual que en `BACKLOG.md`.

---

## Principios del programa

Derivados de las lecciones en `competitive-analysis-osiris.md`. Se
aplican a toda historia; un PR que los viole no pasa revisión.

1. **Ninguna capa queda en cero en silencio.** Toda fuente en vivo
   expone un estado (`ok | stale | rate-limited | error | disabled`) y
   la UI lo muestra. Un `if (!res.ok) return;` sin estado es un bug.
2. **Toda capa dice qué es.** Datos curados estáticos llevan fecha de
   instantánea y fuente visibles; datos en vivo llevan "actualizado hace
   X". Nunca se presenta un array literal como feed.
3. **Toda cifra derivada muestra sus factores.** Un índice, un score o
   una severidad va acompañado de la lista de entradas que lo produjo.
4. **Todo texto generado lleva procedencia.** Modelo o heurística, y
   fecha.
5. **Las pruebas de red son opt-in.** `RUN_LIVE_TESTS=1` activa tests
   que tocan DeepState, GDACS, Nominatim; por defecto se saltan.
6. **Nada de evasión.** Sin rotación de User-Agent, sin `X-Forwarded-For`
   inventado, sin desactivar TLS. Si una fuente bloquea, se pide permiso
   o se descarta.
7. **La primera pasada no es un evento.** Fuentes nuevas en el scan
   siembran estado en su primera corrida y no alertan.

---

## Mapa de épicas

| ID | Épica | Fase | Esfuerzo | Depende de | Cierra |
|---|---|---|---|---|---|
| E0 | Fundamentos: ADR, tests live opt-in, registro de capas | A | S | — | Prerrequisito de BL-001/BL-003 |
| E1 | Estado de vista compartible en URL | A | S-M | E0 | BL-003 (rebajado de M-H a S) |
| E2 | Fuentes en vivo confiables y estado degradado | A | M | E0 | BL-020, parte de TD-024 |
| E3 | Panel de alertas con severidad | A | S | E2 (chip de estado) | Roadmap "What changed today" parcial |
| E8 | Distribución self-host (Docker, GHCR) | A | S | — | Ítem 1.5 de análisis World Monitor |
| E4 | Dossier contextual por clic | B | M | E1, E0 | Tema "country trackers" M4 |
| E5 | Capas geoespaciales con procedencia | B | M-L | E2, E0 | Ítem 1.1 de análisis World Monitor |
| E9 | Procedencia y honestidad en UI | B | S-M | E2 | BL-021 parcial |
| E6 | Geoparsing de candidatos | C | M | E3, E5 | — |
| E7 | Índice de actividad por tracker | C | M | — | BL-024 |
| E10 | Filtro espacial (AOI) del directorio | C (diferida) | M-L | E4 | — |

Esfuerzo total estimado: 25 a 35 días de desarrollo. Fase A cabe en dos
semanas; B en tres; C en tres.

---

## E0 — Fundamentos

**Objetivo:** dejar listas las convenciones que las demás épicas
necesitan y que hoy no existen: plantilla de ADR, tests de red opt-in,
registro declarativo de capas.

**Procedencia OSIRIS:** convención `liveIt` (`src/lib/httpJson.test.ts:15`), `vitest.config.ts` con `testTimeout: 30000`.

### E0.H1 — Convención de ADR

Como mantenedor, quiero una plantilla de ADR y dos ADR iniciales, para
que BL-001 y BL-003 dejen de estar bloqueados por "necesita ADR" sin
saber qué es un ADR en este repo.

**Criterios de aceptación**

- GIVEN `docs/adr/` WHEN abro `0000-template.md` THEN tiene secciones Contexto, Decisión, Consecuencias, Alternativas, Estado.
- GIVEN `docs/adr/0001-url-view-state-is-island-local.md` WHEN lo leo THEN explica por qué el estado de vista no requiere nanostores y cita `CesiumGlobe.tsx:119-166` e `IntelMap.tsx:42-75`.
- GIVEN `docs/adr/0002-live-layer-registry.md` THEN define el contrato de `LiveLayerSpec` (ver E0.H3).

**Tareas** (XS)

- [ ] Crear `docs/adr/0000-template.md`
- [ ] Crear `docs/adr/0001-url-view-state-is-island-local.md`
- [ ] Crear `docs/adr/0002-live-layer-registry.md`
- [ ] Enlazar `docs/adr/` desde `CONTRIBUTING.md` y `CLAUDE.md` (sección Architecture)
- [ ] Actualizar `BACKLOG.md`: BL-003 pasa de M-H a S, elimina "depende de BL-001"; BL-001 referencia el ADR-0001 como modelo

### E0.H2 — Tests de red opt-in

Como desarrollador, quiero que los tests que tocan APIs externas se
salten por defecto y se activen con `RUN_LIVE_TESTS=1`, para que CI no
dependa de DeepState o Nominatim.

**Criterios de aceptación**

- GIVEN `npm test` sin la variable WHEN corre un test marcado `liveIt` THEN aparece como skipped.
- GIVEN `RUN_LIVE_TESTS=1 npm run test:live` THEN el test corre con timeout de 30 s.

**Tareas** (XS)

- [ ] Crear `tests/helpers/live.ts` exportando `liveIt` y `liveDescribe`
- [ ] Añadir script `test:live` a `package.json`
- [ ] Añadir `testTimeout` condicional en `vitest.config.ts`
- [ ] Documentar en `CONTRIBUTING.md`

### E0.H3 — Registro declarativo de capas en vivo

Como desarrollador, quiero un registro único que describa cada capa
(id, etiqueta, URL, licencia, atribución, TTL, CORS, tipo de renderer,
si es instantánea curada o feed), para que los toggles, el chip de
estado, el CSP y la página de fuentes se deriven de un solo lugar.

**Criterios de aceptación**

- GIVEN `src/lib/live-layers.ts` WHEN importo `LIVE_LAYERS` THEN cada entrada valida contra `LiveLayerSpecSchema` (Zod) en un test.
- GIVEN una capa con `kind: 'snapshot'` THEN tiene `snapshotDate` obligatorio; con `kind: 'feed'` tiene `ttlMs` y `url`.
- GIVEN el test `live-layers.test.ts` WHEN comparo los hosts de todas las URLs con `connect-src` de `src/layouts/BaseLayout.astro` THEN no falta ninguno (test que falla si alguien añade una fuente sin actualizar CSP).

**Tareas** (S)

- [ ] Crear `src/lib/live-layers.ts` con `LiveLayerSpecSchema`, tipo `LiveLayerSpec`, `LIVE_LAYERS` (inicialmente: flights, earthquakes, satellites, weather, ships, nfz, gps-jamming, blackouts)
- [x] Marcar nfz / gps-jamming / blackouts como `kind: 'snapshot'` con `snapshotDate: '2026-03-01'` (fecha de captura, igual o posterior a todo `startDate`) y `scope: ['iran-conflict']`. El clima sigue siendo `feed` (sí consulta Open-Meteo); su grilla hardcodeada se sustituye en E2.H3
- [ ] Crear `src/lib/live-layers.test.ts` incluyendo la comprobación de CSP contra `BaseLayout.astro` y `public/_headers`
- [ ] Extraer a `scripts/lib/csp-hosts.ts` una función que lea los hosts del meta CSP para reutilizarla en el test y en `csp-hashes.ts`

---

## E1 — Estado de vista compartible en URL

**Objetivo:** que una URL del globo, del mapa 2D o del homepage
reproduzca la vista exacta: cámara, capas activas, evento abierto,
fecha del scrubber.

**Procedencia OSIRIS:** `SharePanel.tsx:17-34` (genera), `page.tsx:336-380` (lee solo `layers`, escribe con debounce 1.5 s y `replaceState`). El bug de OSIRIS define nuestro test: ida y vuelta completa.

**Inserción Watchboard:** `useCesiumCamera.ts` (cámara imperativa, sin serializar), `CesiumGlobe.tsx:129-136` (toggles), `CesiumGlobe.tsx:388-428` (`handleViewerReady`, vista inicial), `IntelMap.tsx:66-75`, `CommandCenter.tsx:145-198` (único precedente de `replaceState`).

### E1.H1 — Librería pura de estado de vista

Como desarrollador, quiero `encodeViewState` / `decodeViewState` puras
y testeadas, para que globo, mapa y homepage compartan formato.

**Criterios de aceptación**

- GIVEN un `ViewState` `{lat, lon, alt?, zoom?, heading?, pitch?, layers[], event?, date?}` WHEN lo codifico y decodifico THEN obtengo un objeto igual con lat/lon a 4 decimales, alt a entero, heading/pitch a 1 decimal.
- GIVEN `?lat=abc` THEN `decodeViewState` ignora el campo inválido y no lanza.
- GIVEN `layers=flights,quakes` THEN solo se aceptan ids presentes en `LIVE_LAYERS` o en las categorías del tracker; los desconocidos se descartan.
- GIVEN lat fuera de [-90, 90] o lon fuera de [-180, 180] THEN se descarta.

**Tareas** (S)

- [ ] Crear `src/lib/view-state.ts` con `ViewStateSchema` (Zod), `encodeViewState(state): URLSearchParams`, `decodeViewState(search, allowedLayers): Partial<ViewState>`, `mergeIntoUrl(state)` que preserva otros parámetros
- [ ] Crear `src/lib/view-state.test.ts` con ida y vuelta, BVA en rangos, layers desconocidos, parámetros ajenos preservados
- [ ] Añadir `writeViewStateDebounced(state, 500)` con `history.replaceState` (nunca `pushState`, para no llenar el historial)

### E1.H2 — Globo: leer y escribir la vista

Como lector, quiero copiar la URL del globo y que quien la abra vea la
misma cámara y capas, para compartir un hallazgo exacto.

**Criterios de aceptación**

- GIVEN `/{tracker}/globe/?lat=33.3&lon=44.4&alt=250000&heading=90&pitch=-45&layers=flights,satellites` WHEN carga THEN la cámara aterriza ahí (tolerancia 1 %) y solo esas capas están activas; el preset inicial NO se aplica.
- GIVEN muevo la cámara WHEN pasan 500 ms sin movimiento THEN la URL se actualiza sin entrada nueva en el historial.
- GIVEN `?event={slug}` THEN se abre el panel de ese evento y la cámara vuela a su punto si tiene coordenadas.
- GIVEN `?date=2026-03-05` THEN el scrubber de tiempo se posiciona en esa fecha.
- GIVEN un test Playwright en `e2e/globe-share.spec.ts` WHEN navego con parámetros THEN `viewer.camera` reporta los valores esperados.

**Tareas** (S-M)

- [ ] `useCesiumCamera.ts`: exponer `getCameraState(): {lat, lon, alt, heading, pitch}` y suscribir `camera.moveEnd` con debounce
- [ ] `CesiumGlobe.tsx:388-428`: en `handleViewerReady`, si `decodeViewState` trae cámara, usar `flyToPosition({duration: 0})` en lugar del preset
- [ ] `CesiumGlobe.tsx:129-136`: inicializar toggles desde `layers` de la URL; escribir al cambiar
- [ ] Manejar `event` con `event-slug.ts` y el `onSelect` existente de `useConflictData`
- [ ] Manejar `date` con el estado de `currentDate`
- [ ] Añadir `e2e/globe-share.spec.ts`
- [ ] Añadir el workflow `e2e.yml` (Playwright en PR, solo specs `*-share.spec.ts` al principio) porque hoy ningún workflow ejecuta Playwright (BL-022)

### E1.H3 — Mapa 2D: leer y escribir la vista

Como lector, quiero lo mismo en el mapa Leaflet del tracker.

**Criterios de aceptación**

- GIVEN `/{tracker}/?lat=&lon=&zoom=&layers=` WHEN carga THEN el mapa centra y hace zoom ahí y activa esas capas.
- GIVEN muevo el mapa THEN la URL se actualiza con debounce; el hash `#map` de navegación de secciones se preserva.

**Tareas** (S)

- [ ] `IntelMap.tsx:42-75`: leer estado inicial desde URL; `LeafletMap.tsx` expone `onMoveEnd` con centro y zoom
- [ ] `MapLayerToggles.tsx`: al alternar, escribir `layers`
- [ ] Test unitario de la fusión con el hash existente en `view-state.test.ts`

### E1.H4 — Botón "Compartir vista" y homepage

Como lector, quiero un botón que copie la URL con estado y un aviso
"Enlace copiado", para no tener que editar la barra de direcciones.

**Criterios de aceptación**

- GIVEN el globo o el mapa WHEN pulso "Compartir" THEN el portapapeles contiene la URL actual con estado y aparece un toast 2 s.
- GIVEN el homepage `/?tracker={slug}` THEN el tracker queda seleccionado y el globo vuela a él; el `#geo` existente sigue funcionando.
- GIVEN el atajo `S` en el globo THEN copia la URL (documentar en el panel `?`).

**Tareas** (XS-S)

- [ ] Componente `src/components/islands/shared/ShareViewButton.tsx` (usa `navigator.clipboard`, fallback `execCommand`)
- [ ] Montar en `CesiumControls.tsx` y `MapLayerToggles.tsx`
- [ ] `CommandCenter.tsx:145-198`: aceptar `?tracker=` además de `#geo`/`#domain`, y escribirlo en `handleSelect`
- [ ] Añadir fila a `SHORTCUTS` en `CommandCenter.tsx:40-52` y al panel del globo
- [ ] i18n en/es/fr/pt para "Compartir vista" y "Enlace copiado"

### E1.H5 — Documentación y roadmap

**Tareas** (XS)

- [ ] `docs/product-roadmap.md`: mover "Shareable deep links" a M3 con esfuerzo S y estado ✅ al cerrar
- [ ] `src/data/roadmap-items.ts`: reflejar el cambio (protocolo de doble escritura en `product-roadmap.md:121-127`)
- [ ] `CLAUDE.md`: párrafo sobre `view-state.ts` en Utilities

---

## E2 — Fuentes en vivo confiables y estado degradado

**Objetivo:** que cada hook de capa en vivo use una caché común con
dedupe, TTL, stale-on-error, pausa con pestaña oculta y bounding box
derivado de la cámara, y que la UI muestre cuando una fuente está
degradada. Además, etiquetar como instantánea curada lo que hoy se
presenta como capa en vivo.

**Procedencia OSIRIS:** `sourceCache.ts` (TTL 30 min, dedupe en vuelo, stale-on-error con reintento 60 s, tope 500 claves), `page.tsx:534-562` (`skipWhenHidden`), `page.tsx:700-706` (rollback en fallo), `ChainBrief.tsx:219-226` (bloque DEGRADED SOURCES), `LayerPanel.tsx:224-227` (probe de capacidades).

**Inserción Watchboard:** `CesiumGlobe.tsx:489-497` (los nueve hooks), `useFlights.ts:54` (enum `FlightStatus`, único existente), `useFlights.ts:85` y `useMapFlights.ts:38` (bbox fijo, 15 s), `useEarthquakes.ts:55` y `useWeather.ts:77` (`return` silencioso), `useMapOverlays.ts:159-231`, `useTrackerDetail.ts:16-57` (precedente de caché en módulo), `CesiumHud.tsx`, `MapLayerToggles.tsx:102-106`, `MapOverlayData.ts` (duplicado de datos estáticos).

### E2.H1 — Librería `live-source`

Como desarrollador, quiero `fetchLiveSource(spec, params)` con caché,
dedupe, stale-on-error y estado, para que ningún hook reimplemente la
lógica de red.

**Criterios de aceptación**

- GIVEN dos llamadas concurrentes con la misma clave WHEN la primera está en vuelo THEN la segunda recibe la misma promesa (una sola petición de red).
- GIVEN una entrada con TTL vigente THEN se devuelve sin red y `status: 'ok'`.
- GIVEN el upstream responde 429 THEN se devuelve el último dato bueno con `status: 'rate-limited'` y `retryAfterMs` doblando desde 30 s hasta 120 s.
- GIVEN el upstream falla y no hay dato previo THEN `status: 'error'`, `data: null`, y el próximo intento es a 60 s, no al TTL completo.
- GIVEN un dato con más de `ttlMs * 2` de antigüedad THEN `status: 'stale'`.
- GIVEN `document.visibilityState === 'hidden'` WHEN vence el TTL THEN no se refresca hasta `visibilitychange` a visible.
- GIVEN un `AbortSignal` abortado THEN la petición se cancela y no se escribe en caché.
- GIVEN una respuesta vacía (array de 0 elementos) THEN cuenta como fallo de refresco y se conserva el dato previo (regla de OSIRIS `sourceCache.ts:64-68`).
- Todo lo anterior cubierto con `vi.useFakeTimers()` en `live-source.test.ts`.

**Tareas** (M)

- [ ] Crear `src/lib/live-source.ts`: tipos `LiveStatus`, `LiveResult<T>`, `fetchLiveSource`, `subscribeLiveSource` (para hooks), `getLiveStatus(key)`, tope de 200 claves
- [ ] Crear `src/lib/use-live-source.ts`: hook React `useLiveSource(spec, params, {enabled, intervalMs})` que devuelve `{data, status, updatedAt, error, refresh}` y respeta `visibilitychange`
- [ ] Crear `src/lib/live-source.test.ts` (fake timers, fetch mock) con los casos anteriores
- [ ] Documentar la regla "respuesta vacía = fallo" en el header del archivo

### E2.H2 — Vuelos: un solo hook, bbox de cámara, cadencia sana

Como lector, quiero que la capa de vuelos muestre los aviones de la
región que estoy mirando y no consuma la cuota de OpenSky en minutos.

**Criterios de aceptación**

- GIVEN el globo centrado en México WHEN activo vuelos THEN el bbox de la consulta cubre el viewport actual (con margen 10 %), no Medio Oriente.
- GIVEN vuelos activos WHEN pasan 30 s THEN se refresca; con pestaña oculta no.
- GIVEN OpenSky responde 429 THEN los aviones previos siguen visibles con estado "limitado" en el HUD.
- GIVEN `useFlights.ts` y `useMapFlights.ts` THEN comparten `src/lib/flights-source.ts` (parseo, patrones militares) y ya no duplican la lista `MILITARY_PATTERNS`.

**Tareas** (S-M)

- [ ] Crear `src/lib/flights-source.ts` con `parseOpenSky`, `isMilitaryCallsign`, `openSkyUrl(bbox)`
- [ ] Reescribir `CesiumGlobe/useFlights.ts` sobre `useLiveSource`, bbox de `camera.computeViewRectangle()`, intervalo 30 s, cuantizar bbox a 1° para que la clave de caché sea estable
- [ ] Reescribir `useMapFlights.ts` igual, bbox de `map.getBounds()`
- [ ] Test unitario de `flights-source.test.ts` (parseo, cuantización de bbox)
- [ ] Verificar cuota: documentar en el header que OpenSky anónimo da 400 créditos/día y que 30 s con bbox pequeño cabe

### E2.H3 — Sismos, clima, satélites, overlays 2D sobre `live-source`

Como lector, quiero que si USGS o Open-Meteo fallan la capa diga "sin
datos desde hace X" en vez de desaparecer.

**Criterios de aceptación**

- GIVEN USGS devuelve 503 WHEN la capa de sismos ya tenía datos THEN siguen visibles con estado `stale`; si no tenía, el toggle muestra "error".
- GIVEN un tracker con `map.center` en Brasil THEN el bbox de sismos cubre Brasil.
- GIVEN clima WHEN el tracker no es de Irán THEN la grilla de ciudades se calcula a partir de `map.bounds` (grilla 3×3 dentro del bbox), no de las 14 ciudades hardcodeadas.
- GIVEN `useMapOverlays.ts` THEN ya no contiene `.catch(() => {})` sin estado.

**Tareas** (M)

- [ ] `useEarthquakes.ts`: usar `useLiveSource`, bbox de tracker (`map.bounds`) o de cámara, eliminar `if (!res.ok) return;`
- [ ] `useWeather.ts`: grilla derivada de bounds; conservar las 14 ciudades solo como override opcional en `tracker.json` (`globe.weatherPoints`)
- [ ] `useSatellites.ts`: TLE con TTL 6 h en caché; `Promise.allSettled` reporta qué grupo falló en `status`
- [ ] `useMapOverlays.ts:159-231`: migrar sismos y clima
- [ ] Extender `TrackerConfigSchema` con `globe.weatherPoints?` (opcional) en `tracker-config.ts`

### E2.H4 — Chip de estado de fuentes (cierra BL-020)

Como lector, quiero ver en el HUD y en los toggles si una fuente está
viva, retrasada o caída.

**Criterios de aceptación**

- GIVEN el globo THEN el HUD muestra por cada capa activa un punto verde (ok), ámbar (stale o rate-limited, con "hace X min") o rojo (error), reutilizando las clases `.freshness-indicator/.fresh/.stale` de `global.css:220`.
- GIVEN el mapa 2D THEN `MapLayerToggles` muestra el mismo estado junto al contador.
- GIVEN una capa `kind: 'snapshot'` THEN el chip dice "Instantánea · 28 feb 2026" en gris, nunca verde.
- GIVEN todas las fuentes ok THEN no hay ruido: el chip se colapsa a un solo punto verde.

**Tareas** (S)

- [ ] Componente `src/components/islands/shared/SourceStatusChip.tsx` (props: `LiveLayerSpec`, `LiveStatus`, `updatedAt`)
- [ ] Montar en `CesiumHud.tsx` y `MapLayerToggles.tsx:102-106`
- [ ] Contenedor "Fuentes degradadas" colapsable en `CesiumControls.tsx` que lista solo las que no están ok (patrón ChainBrief)
- [ ] i18n de los estados
- [ ] Marcar BL-020 como hecho en `BACKLOG.md`

### E2.H5 — Instantáneas curadas: un solo origen y fecha visible

Como mantenedor, quiero que zonas de exclusión aérea, GPS jamming y
blackouts vivan una sola vez, con fecha y fuente, para que Cesium y
Leaflet no diverjan y el lector sepa que no es tiempo real.

**Criterios de aceptación**

- GIVEN `MapOverlayData.ts` y los tres hooks estáticos THEN los datos se leen del mismo archivo `src/data/snapshots/{nfz,gps-jamming,blackouts}.json`, validados por Zod en build.
- GIVEN cada archivo THEN tiene `_provenance: {source, url?, snapshotDate, scope: [trackers], note}`.
- GIVEN un tracker fuera de `scope` THEN la capa no aparece en sus toggles.
- GIVEN TD-024 (datos duplicados) THEN se actualiza el registro de deuda con la parte resuelta.

**Tareas** (S)

- [ ] Crear `src/data/snapshots/*.json` + `src/lib/snapshot-schema.ts`
- [ ] Reescribir `useNoFlyZones.ts`, `useGpsJamming.ts`, `useInternetBlackout.ts` y `MapOverlayData.ts` para importar del JSON
- [ ] Filtrar por `scope` en `CesiumControls.tsx:21` y `MapLayerToggles.tsx:16-25`
- [ ] Test `snapshot-schema.test.ts`
- [ ] Actualizar `TECH_DEBT.md` (TD-024)

### E2.H6 — Consumir `_health/status.json`

Como mantenedor, quiero que el archivo de salud que se genera en cada
deploy tenga al menos un consumidor.

**Criterios de aceptación**

- GIVEN `/metrics/` THEN una franja superior muestra `lastBuild`, número de trackers con `digestGap` y estado `healthy`, leídos de `/_health/status.json`.
- GIVEN el archivo no existe (deploy viejo) THEN la franja no aparece y no hay error en consola.

**Tareas** (XS)

- [ ] `MetricsDashboard.tsx`: fetch de `${BASE}/_health/status.json` con try/catch y franja `HealthStrip`
- [ ] Añadir estado `degraded` al tipo de run en `MetricsDashboard.tsx:10` y a `MetricsRunSchema` (para runs con fix agent exitoso tras fallo Zod)

---

## E3 — Panel de alertas con severidad

**Objetivo:** mostrar en el homepage (y en la pestaña FEED móvil) las
alertas del light scan con severidad, filtros y vuelo al tracker.

**Procedencia OSIRIS:** `LiveAlerts.tsx` (pestañas all/news/quakes, severidad 8/6/4, portal para maximizar), `IntelFeed.tsx:17-29` (clases por severidad). NO se adopta su scoring por palabras clave.

**Inserción Watchboard:** `hourly-light-scan.ts:35-57` (umbrales), `triage-log.ts` (4.4 MB, demasiado para el cliente), `TriageLogBoard.tsx` (ya hace fetch y filtra), `CommandCenter.tsx:882-891`, `useFactCards.ts:9` (taxonomía), `MobileFeedTab.tsx`.

### E3.H1 — `alerts.json` recortado desde el light scan

Como desarrollador, quiero que el light scan escriba un archivo pequeño
con las últimas alertas, para que el homepage no descargue 4.4 MB.

**Criterios de aceptación**

- GIVEN una corrida del light scan THEN escribe `public/_hourly/alerts.json` con `{generated, entries[≤60]}`, ≤ 60 KB, solo decisiones `update` y `new_tracker` de las últimas 72 h.
- GIVEN cada entrada THEN tiene `{id, timestamp, tracker, title, url, source, sourceTier, score, severity, feedOrigin, geo?}`.
- GIVEN la función pura `buildAlertsFile(entries, now)` THEN está testeada con 3 casos: vacío, > 60 entradas (se recortan las más viejas), entradas de más de 72 h (se excluyen).

**Tareas** (S)

- [ ] `src/lib/alert-severity.ts`: `severityFromScore(score, tier)` → `critical ≥ 0.85 tier ≤ 2 | high ≥ 0.85 | elevated ≥ MODERATE | low`; exportar umbrales desde `keyword-match.ts` para no duplicarlos
- [ ] `src/lib/alerts-file.ts`: `buildAlertsFile`
- [ ] `hourly-light-scan.ts`: llamar a `buildAlertsFile` tras escribir el triage log; commit del archivo en `light-scan.yml` (verificar que el `git add` incluya la ruta, ver post-mortem en ese workflow)
- [ ] Tests `alert-severity.test.ts`, `alerts-file.test.ts`
- [ ] Añadir `alerts.json` a `public/_headers` con `max-age=300`

### E3.H2 — `AlertsPanel` en el homepage

Como lector, quiero un panel con las alertas recientes, filtrable por
severidad y tipo, que al hacer clic vuele al tracker.

**Criterios de aceptación**

- GIVEN el homepage WHEN pulso `A` o el botón "Alertas" THEN se abre un panel lateral con las entradas de `alerts.json`, ordenadas por tiempo, con color por severidad y "hace X min".
- GIVEN una entrada WHEN hago clic THEN `handleSelect(tracker)` se dispara y el globo vuela; con clic en el icono de enlace se abre la fuente en pestaña nueva.
- GIVEN filtros `Todas | Críticas | Nuevas fuentes | Sismos` THEN la lista responde; "Sismos" toma de `useLiveSource(earthquakes)` con magnitud ≥ 4.5 (E2).
- GIVEN `alerts.json` no existe o falla THEN el panel muestra "Sin alertas recientes" y la última hora de scan conocida (`FreshnessBadge`).
- GIVEN el panel abierto WHEN llega una entrada nueva (poll cada 5 min, pausado con pestaña oculta) THEN aparece arriba con animación breve y el contador del botón sube.
- GIVEN una entrada con `geo` (E6) THEN muestra un pin y el clic vuela al punto, no al centro del tracker.

**Tareas** (S-M)

- [ ] `src/components/islands/CommandCenter/AlertsPanel.tsx`
- [ ] Montar en `CommandCenter.tsx` junto a `ComparePanel` (`:882-891`); estado `showAlerts`; atajo `A` en el switch `:430-501` y fila en `SHORTCUTS`
- [ ] Contador en la barra superior del homepage
- [ ] `MobileFeedTab.tsx`: sección "Alertas" arriba del feed
- [ ] i18n
- [ ] E2E `e2e/alerts-panel.spec.ts` con `alerts.json` fixture

### E3.H3 — Página de auditoría enlaza con el panel

**Tareas** (XS)

- [ ] `TriageLogBoard.tsx`: usar `alert-severity.ts` para colorear igual que el panel
- [ ] Enlace "Ver auditoría completa" desde el panel a `/breaking-news-audit/`

---

## E4 — Dossier contextual por clic

**Objetivo:** clic derecho (o pulsación larga) en cualquier punto del
globo o del mapa abre un panel con país, datos básicos, trackers de
Watchboard para ese país y eventos cercanos.

**Procedencia OSIRIS:** `api/region-dossier/route.ts` (Nominatim → Wikipedia + Wikidata en paralelo, caché 1 h), `page.tsx:448-454` y `:1748-1779` (card). NO copiar: reverse geocoding en hover (`page.tsx:425-444`).

**Inserción Watchboard:** `useConflictData.ts:15-16` (único `ScreenSpaceEventHandler`), `LeafletMap.tsx:397` (clics solo en marcadores), `CommandCenter.tsx:311-338` (`handleGeoClick`, precedente), `layout-presets.ts:7-14` (`PanelId`), `src/pages/api/event-points.json.ts` (índice lat/lon por tracker), `serializedTrackers` (`country`, `geoPath`). Leer antes: `docs/superpowers/specs/2026-04-07-globe-click-to-drill-design.md`.

### E4.H1 — Librería `dossier`

Como desarrollador, quiero `buildDossier(lat, lon, ctx)` pura (con
fetch inyectable) que combine reverse geocoding, datos de país y
trackers, para testearla sin red.

**Criterios de aceptación**

- GIVEN lat/lon WHEN llamo `reverseGeocode` THEN usa `nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=5`, clave de caché redondeada a 0.1°, `sessionStorage` 24 h, y nunca más de 1 petición por segundo (cola con rate limiter).
- GIVEN un país ISO-2 WHEN llamo `countryFacts` THEN consulta Wikidata SPARQL (capital, población, jefe de estado, bandera) con caché 7 días en `localStorage`.
- GIVEN un país THEN `trackersForCountry(country, trackers)` devuelve los trackers cuyo `country` o `geoPath` incluye ese país, ordenados por `activity` (E7) o `lastUpdated`.
- GIVEN lat/lon THEN `eventsNear(lat, lon, points, 300 km)` devuelve los puntos de `/api/event-points.json` dentro del radio (haversine de `geo-utils.ts`).
- GIVEN Nominatim falla THEN el dossier se construye con lo demás y `degraded: ['geocode']`.
- Tests con fetch mock para los tres proveedores; test live opt-in contra Nominatim.

**Tareas** (M)

- [ ] `src/lib/dossier.ts` con `reverseGeocode`, `countryFacts`, `trackersForCountry`, `eventsNear`, `buildDossier`
- [ ] `src/lib/rate-limiter.ts` (cola 1 req/s) con test
- [ ] `src/lib/dossier.test.ts` + `tests/live/dossier.live.test.ts`
- [ ] Añadir `nominatim.openstreetmap.org` y `query.wikidata.org` a `connect-src` en `BaseLayout.astro` y `public/_headers` (el test de E0.H3 obliga)
- [ ] Atribución "© OpenStreetMap contributors" y "Wikidata CC0" en el panel

### E4.H2 — Clic de fondo en globo y mapa

Como lector, quiero hacer clic derecho en el globo o en el mapa y
obtener lat/lon del punto.

**Criterios de aceptación**

- GIVEN el globo WHEN hago clic derecho (o pulsación larga 600 ms en táctil) sobre terreno THEN se emite `onGroundClick({lat, lon})`; sobre una entidad se mantiene el comportamiento actual.
- GIVEN el mapa Leaflet WHEN `contextmenu` THEN lo mismo.
- GIVEN un clic derecho THEN el menú contextual del navegador no aparece.

**Tareas** (S)

- [ ] `useConflictData.ts`: añadir `RIGHT_CLICK` y `pickEllipsoid` para lat/lon; callback `onGroundClick`
- [ ] `LeafletMap.tsx`: `map.on('contextmenu')`
- [ ] Pulsación larga en móvil en ambos (`GlobeMobileSheet`, `MobileMapTab`)

### E4.H3 — `DossierPanel`

Como lector, quiero ver el dossier en un panel del globo, del mapa y del
homepage, con enlaces a los trackers.

**Criterios de aceptación**

- GIVEN clic derecho en Bagdad THEN el panel muestra: "Irak · Bagdad", bandera, capital, población, jefe de estado, extracto de Wikipedia (≤ 300 caracteres), lista de trackers de Irak con su última actualización, y 5 eventos más cercanos con distancia.
- GIVEN un tracker de la lista WHEN hago clic THEN navego a `/{slug}/` (en el homepage: `handleSelect`).
- GIVEN un evento cercano WHEN hago clic THEN abro su permalink (`eventPermalink`).
- GIVEN `degraded` no vacío THEN se muestra "Sin geocodificación" o "Sin datos de país" en gris, no un panel vacío.
- GIVEN el globo THEN el panel ocupa el slot `right-top` en `layout-presets.ts` y se puede cerrar con `Esc`.
- GIVEN móvil THEN se abre como bottom sheet.

**Tareas** (M)

- [ ] `src/components/islands/shared/DossierPanel.tsx`
- [ ] Añadir `'dossier'` a `PanelId` (`layout-presets.ts:7-14`) y al slot; render en `CesiumGlobe.tsx` guardado por `hasPanelInSlot`
- [ ] Montar en `IntelMap.tsx` como overlay
- [ ] `CommandCenter.tsx`: en `handleGeoClick` (`:311-338`) abrir el dossier del país además del acordeón; usar `serializedTrackers` como fuente de trackers
- [ ] i18n
- [ ] E2E `e2e/dossier.spec.ts` con fetch mockeado vía `page.route`

---

## E5 — Capas geoespaciales con procedencia

**Objetivo:** añadir capas reales relevantes para trackers existentes
(frente de Ucrania, alertas de desastres) y capas estáticas de
infraestructura con procedencia, todas declaradas en el registro de E0.H3.

**Procedencia OSIRIS:** `api/frontlines/route.ts` (DeepState, `s-maxage=1800`), `api/gdelt/route.ts` (GDACS RSS, `revalidate: 300`, mapeo de tipos), `public/data/submarine-cables.json`, `api/infrastructure/route.ts` (registro nuclear + join sísmico), `ArcGISPanel` (loader genérico de FeatureServer).

**Verificado:** DeepState CORS `*`, 628 KB, `max-age=300`, licencia no declarada; GDACS sin CORS, CC BY 4.0, 1.3 MB.

### E5.H1 — Frente DeepState en el tracker de Ucrania

Como lector del tracker de Ucrania, quiero ver la línea de frente actual
sobre el mapa y el globo.

**Criterios de aceptación**

- GIVEN `trackers/ukraine-*/tracker.json` con `map.liveLayers: ['deepstate-frontline']` THEN aparece el toggle "Frente (DeepState)" en mapa y globo, desactivado por defecto.
- GIVEN el toggle activo THEN se cargan los 29 polígonos vía `useLiveSource` con TTL 30 min y se pintan con el `fill`/`stroke` que trae cada feature; leyenda con los tres estados.
- GIVEN el panel de fuentes THEN muestra "DeepStateMAP · actualizado hace X · enlace".
- GIVEN un tracker sin `liveLayers` THEN no hay toggle.
- GIVEN respuesta de DeepState de más de 2 MB o sin `map.features` THEN se rechaza y la capa queda en `error` (no se pinta basura).
- **Bloqueante legal:** antes de mergear, pedir permiso por escrito a DeepState (formulario o correo) y guardar la respuesta en `docs/licenses/deepstate.md`. Si no hay respuesta en 3 semanas, la capa se publica detrás de un flag `PUBLIC_ENABLE_DEEPSTATE=false`.

**Tareas** (M)

- [ ] Extender `TrackerConfigSchema`: `map.liveLayers?: LiveLayerId[]` (`tracker-config.ts:33-42`)
- [ ] Registrar `deepstate-frontline` en `LIVE_LAYERS` con `kind: 'feed'`, `ttlMs: 1_800_000`, `license: 'permission-pending'`
- [ ] `src/lib/deepstate.ts`: `parseDeepState(json): FeatureCollection` con Zod, límite de tamaño, test con fixture recortada
- [ ] Cesium: `useGeoJsonLayer(spec)` genérico con `GeoJsonDataSource` (reutilizable por E5.H3); Leaflet: `L.geoJSON` en `LeafletMap.tsx`
- [ ] Toggle y leyenda en `CesiumControls.tsx` y `MapLayerToggles.tsx`, derivados del registro
- [ ] CSP: `deepstatemap.live`
- [ ] Test live opt-in
- [ ] `docs/licenses/deepstate.md` y solicitud de permiso

### E5.H2 — GDACS: ingesta en el light scan y capa de desastres

Como lector, quiero ver alertas naranja y rojas de GDACS en el globo y
que el scan las considere candidatas para los trackers de la región.

**Criterios de aceptación**

- GIVEN una corrida del light scan THEN descarga `gdacs.org/xml/rss.xml`, parsea `gdacs:alertlevel`, `gdacs:eventtype`, `georss:point`, `gdacs:country`, `gdacs:severity`, `gdacs:population`, y escribe `public/_hourly/gdacs.json` con los eventos de los últimos 7 días con nivel Orange o Red (≤ 100 KB).
- GIVEN un evento Red o Orange THEN entra al pipeline como `Candidate` con `feedOrigin: 'gdacs'`, `sourceTier: 1`, `geo: {lat, lon, place: country, method: 'georss'}` y título "GDACS {tipo} {severidad} · {país}".
- GIVEN la primera corrida tras el despliegue THEN siembra `seen` y no alerta (principio 7).
- GIVEN el globo del homepage y de trackers con `region` afectada THEN la capa "Desastres (GDACS)" muestra pines por tipo (sismo, inundación, ciclón, volcán, incendio) con nivel de alerta, atribución "GDACS · European Union · CC BY 4.0".
- GIVEN la descarga falla THEN se conserva el `gdacs.json` anterior y se registra en el step summary (no se borra).

**Tareas** (M)

- [ ] `scripts/lib/gdacs.ts`: `fetchGdacs`, `parseGdacsRss(xml)` (sin dependencia nueva: `fast-xml-parser` no está; usar regex robusta o añadir `fast-xml-parser` justificándolo), `toCandidates`, `buildGdacsFile`
- [ ] Tests con fixture XML recortada
- [ ] `hourly-light-scan.ts`: fase GDACS con presupuesto de 10 s; `hourly-types.ts:63-74` gana `feedOrigin: 'gdacs'` y `geo?`
- [ ] `light-scan.yml`: incluir `public/_hourly/gdacs.json` en el commit
- [ ] Registrar `gdacs-alerts` en `LIVE_LAYERS` (`kind: 'feed'`, `url: '/_hourly/gdacs.json'`, TTL 15 min)
- [ ] Hook `useGdacs` sobre `useLiveSource` + iconos en `cesium-icons.ts`; Leaflet markers
- [ ] `public/_headers`: `gdacs.json` `max-age=300`

### E5.H3 — Capas estáticas de infraestructura con procedencia

Como lector, quiero capas de contexto (cables submarinos, plantas
nucleares, chokepoints marítimos) con fuente y fecha visibles.

**Criterios de aceptación**

- GIVEN `public/geo/layers/{id}.geojson` THEN cada archivo incluye `_provenance: {source, url, license, retrievedAt, transform?}` y pasa `GeoLayerSchema` en un test.
- GIVEN el tracker declara `map.staticLayers: ['submarine-cables']` THEN el toggle aparece con chip "Instantánea · {retrievedAt}".
- GIVEN los cables THEN provienen del dataset público original (TeleGeography en GitHub, licencia CC BY-NC-SA 3.0 o la vigente), no del archivo de OSIRIS, y la licencia se cumple en la atribución.
- GIVEN el registro nuclear THEN se construye desde Wikidata (query SPARQL guardada en `scripts/geo/nuclear-plants.sparql`) con `retrievedAt`, no copiado a mano.
- GIVEN `scripts/geo/refresh-layers.ts --layer nuclear-plants` THEN regenera el archivo y actualiza `retrievedAt` (patrón ArcGIS loader de OSIRIS, pero en build, no en runtime).

**Tareas** (M)

- [ ] `src/lib/geo-layer-schema.ts` + test
- [ ] `scripts/geo/refresh-layers.ts` con adaptadores `telegeography-cables`, `wikidata-nuclear`, `maritime-chokepoints` (10 puntos curados a mano con fuente)
- [ ] `public/geo/layers/*.geojson` iniciales
- [ ] `TrackerConfigSchema`: `map.staticLayers?`
- [ ] Reutilizar `useGeoJsonLayer` de E5.H1 y `L.geoJSON`
- [ ] `docs/licenses/` con cada licencia

### E5.H4 — Página de fuentes de capas

**Tareas** (XS-S)

- [ ] `src/pages/sources.astro` (o sección en `/about`) que lista `LIVE_LAYERS` con licencia, atribución, TTL y tipo, generada del registro
- [ ] Enlace desde el panel "Fuentes degradadas" (E2.H4)

---

## E6 — Geoparsing de candidatos

**Objetivo:** que los candidatos del light scan lleguen con coordenadas
cuando el texto menciona un lugar conocido por los trackers, para
mostrarlos en el globo antes de la triage y para que el panel de
alertas vuele al punto.

**Procedencia OSIRIS:** `api/news/route.ts:25-31` (15 topónimos → centroides), `api/osint/route.ts` (geoparsing multilingüe de Telegram). Watchboard tiene 5,876 puntos propios.

### E6.H1 — Gazetteer desde los datos propios

Como desarrollador, quiero un gazetteer generado de `map-points.json`,
`map.center` y `country` de los 125 trackers, para geolocalizar sin
servicio externo.

**Criterios de aceptación**

- GIVEN `scripts/lib/gazetteer.ts` WHEN corre `buildGazetteer()` THEN produce `scripts/state/gazetteer.json` con `{name, normalized, lat, lon, trackers[], kind: 'point'|'center'|'country', aliases[]}` para cada nombre único (normalizado sin acentos, minúsculas).
- GIVEN nombres ambiguos (mismo nombre en dos trackers) THEN se conservan ambos y `resolve` prefiere el del `matchedTracker`.
- GIVEN un texto "Explosión en Kharkiv esta madrugada" y `matchedTracker: 'ukraine-war'` THEN `geoparse` devuelve `{lat, lon, place: 'Kharkiv', confidence ≥ 0.8, method: 'gazetteer'}`.
- GIVEN un texto sin topónimo conocido THEN `geo` es `undefined`, no un centro por defecto.
- GIVEN aliases en `country-names.ts` THEN "Estados Unidos" y "United States" resuelven igual.

**Tareas** (M)

- [ ] `scripts/lib/gazetteer.ts`: `buildGazetteer`, `normalizeName`, `geoparse(text, matchedTracker)`; longest-match primero, mínimo 4 caracteres, lista de stopwords (nombres como "Centro", "Norte")
- [ ] Tests con 20 frases en es/en/fr/pt
- [ ] `hourly-light-scan.ts`: llamar `geoparse` tras `scoreCandidate`; propagar a `PendingCandidate` y `TriageLogEntry` (`hourly-types.ts:112-134`)
- [ ] Regenerar gazetteer al inicio de cada scan (barato) o en `generate-api.ts`

### E6.H2 — Candidatos pendientes en el globo

Como lector, quiero ver en el globo los candidatos geolocalizados que
aún no han pasado triage, marcados como no verificados.

**Criterios de aceptación**

- GIVEN `alerts.json` con entradas `geo` THEN el globo del homepage muestra pines punteados tier-4 con tooltip "Candidato sin verificar · {fuente}".
- GIVEN la triage lo convierte en evento THEN el pin punteado desaparece y aparece el evento normal (dedupe por `url`).

**Tareas** (S)

- [ ] Capa `pending-candidates` en `LIVE_LAYERS` (`url: '/_hourly/alerts.json'`)
- [ ] Render en `GlobePanel.tsx` (globe.gl) con estilo tier-4
- [ ] Dedupe contra eventos por `url` en `hourly-scan.ts`

---

## E7 — Índice de actividad por tracker

**Objetivo:** ordenar y destacar trackers por actividad reciente con
una cifra calculada de datos reales y factores visibles, sustituyendo
heurísticas dispersas (`hero-selection.ts`, scorer del video, orden de
la sidebar).

**Procedencia OSIRIS:** `api/country-risk/route.ts` como contraejemplo (tabla hardcodeada + bono sísmico). Se adopta la idea de "índice por región", no la implementación.

### E7.H1 — Librería `activity-index`

Como desarrollador, quiero `computeActivity(tracker, data, now)` pura
que devuelva 0-100 y los factores.

**Criterios de aceptación**

- GIVEN eventos de los últimos 7 días, `meta.breaking`, `sectionsUpdatedCount`, deltas de KPI y edad del digest THEN el índice se calcula con pesos declarados en una constante exportada y `factors: [{name, value, contribution}]`.
- GIVEN un tracker histórico (`temporal: 'historical'`) THEN el índice se normaliza por su `updateIntervalDays` para no penalizar cadencia lenta.
- GIVEN dos corridas con los mismos datos THEN el resultado es idéntico (determinista).
- Test con 5 fixtures: breaking, tranquilo, histórico, sin digest, sin eventos.

**Tareas** (S-M)

- [ ] `src/lib/activity-index.ts` + test
- [ ] `KpiSchema`: campo opcional `delta: {value, direction, period}` (BL-024) en `schemas.ts`; el updater nocturno lo rellena (instrucción en `update-data.yml` STEP 3)

### E7.H2 — Exponer y usar el índice

**Criterios de aceptación**

- GIVEN `public/api/v1/trackers.json` THEN cada tracker tiene `activity: {score, factors}`.
- GIVEN el homepage THEN `serializedTrackers` incluye `activity.score`; `SidebarPanel` ofrece orden "Actividad"; el badge muestra el score con tooltip de factores.
- GIVEN `hero-selection.ts` y el scorer de `video/render.ts` THEN usan `activity` en lugar de heurísticas propias (o las combinan con peso documentado).
- GIVEN el MCP THEN `list_trackers` acepta `sort: 'activity'`.

**Tareas** (S-M)

- [ ] `generate-api.ts:319-338`: añadir `activity`
- [ ] `index.astro:26-146`: añadir `activity.score`
- [ ] `SidebarPanel.tsx`: orden y badge; `FeedRow.tsx` tooltip
- [ ] `hero-selection.ts`, `video/render.ts`: consumir
- [ ] `mcp/server.ts:230`: parámetro `sort`
- [ ] `KpiStrip.astro`: mostrar `delta` (BL-024)

---

## E8 — Distribución self-host

**Objetivo:** imagen Docker pequeña que sirva `dist/`, publicada en
GHCR, con compose y documentación honesta de variables.

**Procedencia OSIRIS:** `Dockerfile` (3 etapas, usuario no root), `docker-compose.yml` (bloque `x-casaos`), `nginx/nginx.conf` (gzip JSON, cache-control por ruta), `docker-publish.yml` (buildx amd64+arm64, `concurrency`). Contraejemplo: la deriva entre `.env.template`/`.env.example` y las 17 variables no documentadas.

### E8.H1 — Dockerfile multi-stage y nginx

**Criterios de aceptación**

- GIVEN `docker build -t watchboard .` THEN la imagen final es `nginx:alpine` + `dist/`, < 150 MB, sin `node_modules`, usuario no root, `HEALTHCHECK` sobre `/healthz`.
- GIVEN la etapa de build THEN ejecuta `npm ci && npm run build` (incluye `generate-api`, `copy-cesium`, pagefind, `csp-hashes`).
- GIVEN `nginx.conf` THEN aplica las mismas cabeceras que `public/_headers` (generadas por un script, no copiadas a mano), gzip para `application/json` y `Cache-Control` largo para `/cesium/` y `/_astro/`.
- GIVEN `docker run -p 8080:8080` (nginx escucha en 8080 como usuario no root) THEN `/`, `/iran-conflict/`, `/api/v1/trackers.json`, `/rss.xml` y un archivo de `/_hourly/` responden 200 y una ruta inexistente responde 404 con la página personalizada.

**Tareas** (S)

- [ ] `Dockerfile`, `.dockerignore`
- [ ] `scripts/headers-to-nginx.ts` que convierte `public/_headers` a `docker/nginx.conf` (test de ida y vuelta con dos reglas)
- [ ] `docker-compose.yml` con `x-casaos`
- [ ] Smoke test en `tests/docker.smoke.sh` (curl a 4 rutas)

### E8.H2 — Publicación en GHCR

**Criterios de aceptación**

- GIVEN push a `main` o tag `v*` THEN `.github/workflows/docker-publish.yml` construye amd64+arm64 y publica `ghcr.io/artemiopadilla/watchboard:{latest,sha,semver}` con `concurrency` para no pisar `latest`.
- GIVEN el step summary THEN muestra el tamaño de la imagen y las 4 rutas del smoke test en verde (verificar el artefacto, no el exit code).

**Tareas** (S)

- [ ] Workflow con `docker/build-push-action`, QEMU, cache GHA
- [ ] Smoke test dentro del workflow contra la imagen recién construida

### E8.H3 — Documentación y listados

**Criterios de aceptación**

- GIVEN `docs/self-hosting.md` THEN explica `docker run`, compose, y que los datos se actualizan al reconstruir la imagen (o montando `dist/` de un build propio), y lista **todas** las variables de entorno leídas por el código, generadas por `scripts/list-env-vars.ts` (grep de `process.env.` e `import.meta.env.`) para no repetir la deriva de OSIRIS.
- GIVEN README THEN sección "Self-host" con el comando de una línea.
- GIVEN `docs/osint-list-submissions.md` THEN se añaden awesome-selfhosted y awesome-osint con el texto propuesto.

**Tareas** (XS-S)

- [ ] `scripts/list-env-vars.ts` + salida en `docs/self-hosting.md`
- [ ] README y `docs/osint-list-submissions.md`

---

## E9 — Procedencia y honestidad en UI

**Objetivo:** que todo texto generado por IA, toda cifra derivada y toda
fuente degradada se vean como lo que son.

**Procedencia OSIRIS:** `AiOverview.tsx:127-130` (badge GEMINI vs HEURISTIC), `ChainBrief.tsx:219-226` (DEGRADED SOURCES), taxonomía del módulo username, doctrina de `camera-feed.ts:108-115` (IDs reciclados).

### E9.H1 — Badge de procedencia en texto generado

**Criterios de aceptación**

- GIVEN `digests.json` y `meta.heroHeadline` THEN llevan `provenance: {model, generatedAt, method: 'llm'|'heuristic'|'human'}` (campo opcional en `schemas.ts`, rellenado por `update-data.yml` y `hourly-triage.ts`).
- GIVEN el hero y la sección de digest THEN muestran un badge discreto "IA · Claude · 6 sep" o "Editorial".
- GIVEN un dato sin `provenance` THEN muestra "Sin procedencia registrada" en gris (no se oculta).

**Tareas** (S)

- [ ] `schemas.ts`: `ProvenanceSchema`
- [ ] Prompts de `update-data.yml` y `hourly-triage.ts`: emitir `provenance`
- [ ] `src/components/static/ProvenanceBadge.astro`; montar en `Hero.astro` y en la vista de digest
- [ ] i18n

### E9.H2 — Bloque "Fuentes degradadas" en la página del tracker

**Criterios de aceptación**

- GIVEN un tracker con capas en `stale|error` (E2) o con `digestGap` en `_health/status.json` THEN aparece un bloque colapsado bajo el `KpiStrip` con la lista y la hora del último dato bueno.
- GIVEN todo ok THEN el bloque no se renderiza.

**Tareas** (S)

- [ ] `src/components/islands/shared/DegradedSources.tsx` consumiendo `getLiveStatus` y `_health`
- [ ] Montar en `[tracker]/index.astro`

### E9.H3 — Verificación de thumbnails reciclados

Como mantenedor, quiero detectar `og:image` que cambiaron de contenido
bajo la misma URL, para no mostrar una foto equivocada con un pie
confiado.

**Criterios de aceptación**

- GIVEN `backfill-media.ts` THEN guarda `media[].hash` (sha1 de los primeros 64 KB) y `fetchedAt` al descargar.
- GIVEN la validación nocturna (HEAD de media) THEN si `Content-Length` o `ETag` cambian respecto a lo guardado, marca `media[].suspect: true` y lo lista en el step summary.
- GIVEN `suspect: true` THEN las superficies de media muestran el gradiente de fallback en lugar de la imagen.

**Tareas** (S)

- [ ] `MediaItemSchema`: `hash?`, `fetchedAt?`, `suspect?`
- [ ] `backfill-media.ts` y el paso de validación de `update-data.yml`
- [ ] Fallback en `MobileStoryCarousel.tsx`, `TrackerDirectory.tsx`, `BroadcastOverlay.tsx`

### E9.H4 — Taxonomía epistémica en claims

**Criterios de aceptación**

- GIVEN `ClaimSchema` THEN acepta `status: 'confirmed'|'contested'|'unverifiable'|'retracted'` además de los campos actuales; `ClaimsMatrix.astro` lo muestra con icono.
- GIVEN datos existentes sin `status` THEN se infiere `contested` (compatibilidad).

**Tareas** (XS-S)

- [ ] `schemas.ts`, `ClaimsMatrix.astro`, prompt del updater

---

## E10 — Filtro espacial del directorio (diferida)

**Objetivo:** dibujar un área en el globo y obtener los trackers y
eventos dentro. Se pospone hasta que E4 y E7 existan, porque su valor
depende del dossier y del índice de actividad.

**Procedencia OSIRIS:** `draw.ts` (reducer puro, 4 modos → un anillo), `aoi.ts` (bbox reject + ray casting), `aoi-export.ts` (localStorage validado por registro, export CSV/GeoJSON). Se descarta `watch.ts`.

**Historias previstas** (no detalladas): E10.H1 `src/lib/draw.ts` portado con tests; E10.H2 `selectInPolygon` sobre `/api/event-points.json` y centros de tracker; E10.H3 toolbar en el globo del homepage con export GeoJSON; E10.H4 persistencia en `localStorage` con validación por registro.

---

## Story map y dependencias

```
Fase A (2 semanas) — Quick wins y fundamentos
  E0.H1 ADR ───────────────┐
  E0.H2 tests live         │
  E0.H3 registro capas ────┼──► E1.H1 view-state ──► E1.H2 globo ──► E1.H4 share
                           │                      └► E1.H3 mapa      └► E1.H5 docs
                           └──► E2.H1 live-source ──► E2.H2 vuelos
                                                  ├► E2.H3 sismos/clima/sats
                                                  ├► E2.H4 chip estado ──► E3.H2 panel alertas
                                                  ├► E2.H5 snapshots
                                                  └► E2.H6 _health
                                E3.H1 alerts.json ──► E3.H2 ──► E3.H3
  E8.H1 Dockerfile ──► E8.H2 GHCR ──► E8.H3 docs      (independiente)

Fase B (3 semanas) — Contexto espacial y honestidad
  E1 + E0 ──► E4.H1 dossier lib ──► E4.H2 clic fondo ──► E4.H3 panel
  E2 + E0 ──► E5.H1 DeepState (bloqueo legal en paralelo desde semana 1)
          ├─► E5.H2 GDACS (scan + capa)
          ├─► E5.H3 capas estáticas
          └─► E5.H4 página de fuentes
  E2 ──► E9.H1 procedencia ──► E9.H2 degradadas ──► E9.H3 thumbnails ──► E9.H4 claims

Fase C (3 semanas) — Señal
  E3 + E5.H2 ──► E6.H1 gazetteer ──► E6.H2 candidatos en globo
  E7.H1 índice ──► E7.H2 exponer (independiente; puede adelantarse)
  E4 ──► E10 (diferida)
```

Orden recomendado de PRs en Fase A: E0.H3 → E2.H1 → E1.H1 → E8.H1 →
E2.H2 → E1.H2 → E3.H1 → E2.H4 → E3.H2 → resto.

---

## Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| DeepState no autoriza el uso | Media | Se pierde E5.H1 | Flag `PUBLIC_ENABLE_DEEPSTATE`; alternativa ISW (shapefiles públicos) documentada en E5.H1 |
| Nominatim bloquea tráfico desde el navegador | Baja | Dossier degradado | Rate limiter 1 req/s, caché agresiva, `degraded: ['geocode']` con UI honesta; fallback a `country-names.ts` + `map.center` |
| OpenSky cambia cuota o exige OAuth | Media | Capa de vuelos en `rate-limited` | El chip lo hace visible; adsb.fi como segunda fuente (patrón OSIRIS `flights/route.ts`) en historia futura |
| `alerts.json`/`gdacs.json` no se commitean (post-mortem de `light-scan.yml`) | Media | Panel vacío en silencio | Step summary cuenta entradas y falla si el archivo no cambió en 24 h; test de E3.H1 |
| Payload del homepage crece con `activity` y `geo` | Baja | LCP | Solo escalares en `serializedTrackers`; factores vía `/api/cards/{slug}.json` |
| CSP rompe una fuente nueva en producción | Media | Capa muerta sin error visible | Test de E0.H3 que compara registro vs CSP en cada PR |
| Playwright en CI es lento o inestable | Media | PRs bloqueados | Solo specs `*-share.spec.ts` y `alerts-panel` al inicio; `retries: 1`; fixtures locales, sin red |

**Criterio de rollback por épica:** cada épica añade código detrás de
un registro (`LIVE_LAYERS`) o de un campo opcional de schema; retirar
la entrada del registro o el campo desactiva la feature sin migración.

---

## Definición de hecho (aplica a toda historia)

- [ ] Criterios de aceptación cubiertos por tests unitarios (vitest) y, cuando hay UI, por un spec Playwright con fixtures sin red.
- [ ] `npm run build` verde, incluido `csp-hashes.ts`; el test de CSP de E0.H3 pasa.
- [ ] Ningún `fetch` nuevo sin estado expuesto (principio 1) ni sin entrada en `LIVE_LAYERS`.
- [ ] i18n en/es/fr/pt de cualquier texto visible.
- [ ] `CLAUDE.md` actualizado si hay archivo nuevo en `src/lib/` o `scripts/`.
- [ ] `BACKLOG.md`, `docs/product-roadmap.md` y `src/data/roadmap-items.ts` actualizados en la misma PR (protocolo de doble escritura).
- [ ] Verificación del artefacto, no del exit code: el PR incluye captura o salida que muestre el archivo generado, la capa pintada o la URL restaurada (`docs/silent-failure-patterns.md`).

---

## Fuera de alcance (decidido)

RECON toolkit, CCTV, cripto, mercados, navegación, `WorldRemote`,
`stealthFetch`, telemetría de IP, LLM bajo demanda en runtime,
`country-risk` estático, StyleStudio completo. Razones en
`competitive-analysis-osiris.md`, sección "Lo que no conviene tomar".
