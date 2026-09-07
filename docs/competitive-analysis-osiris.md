# Análisis competitivo: Watchboard vs OSIRIS

Comparación entre Watchboard y OSIRIS (`simplifaisoul/osiris`), un
dashboard OSINT en tiempo real que se posiciona como "alternativa open
source a Palantir". Complementa `competitive-analysis-worldmonitor.md`:
OSIRIS pertenece a la misma familia que World Monitor (SPA con mapa
WebGL y decenas de feeds en vivo), así que este documento se centra en
lo que OSIRIS hace distinto y en qué de eso conviene adoptar.

La versión 2 se basa en lectura directa del código fuente de ambos
repositorios (clon de OSIRIS en `master`, 69 rutas API, 36 componentes,
49 librerías; Watchboard en `feead12`). El plan de ejecución derivado
está en `docs/superpowers/plans/2026-09-07-osiris-adoption-program.md`.

**Última actualización:** 7 de septiembre de 2026 (v2)
**OSIRIS analizado:** rama `master`, commit `d2c08c8` (2026-09-06)
**Watchboard:** `feead12` (main)

---

## Resumen ejecutivo

OSIRIS y Watchboard resuelven problemas distintos con arquitecturas
opuestas. OSIRIS es un **visor de sensores**: agrega 33 capas
conmutables (aviones, sismos, incendios, CCTV, sanciones, Telegram,
malware, mercados) sobre un mapa MapLibre y no guarda historia ni cura
nada. Watchboard es un **archivo curado**: 125 trackers con línea de
tiempo, tiers de fuente y datos versionados en git, actualizados por IA.

La lectura del código cambia varias conclusiones de la v1:

- El "risk score" y el "machine assessment" de OSIRIS **no son IA**: el
  score es `1 + 2 por palabra clave` sobre una lista de 24 términos, y
  el assessment es una cadena constante que se emite cuando el score
  llega a 8. El LLM (Gemini 2.0 Flash) solo se usa bajo demanda en
  botones "AI overview" y en un briefing, sin caché.
- Los **enlaces compartibles de OSIRIS están rotos**: `SharePanel`
  genera `lat/lon/zoom/layers`, pero al cargar la página solo se lee
  `layers`. Toda URL compartida pierde la ubicación y geolocaliza por IP.
- OSIRIS tiene **más pruebas de lo que aparenta** (38 archivos, ~533
  aserciones) pero ninguna ejercita un handler HTTP, y las primitivas de
  seguridad (`ssrf-guard`, `stealthFetch`) tienen cero cobertura.
- OSIRIS trae **decisiones de ingeniería excelentes documentadas en
  comentarios** (caché con stale-on-error, dedupe con rollback en
  fallo, "el primer barrido no es un evento", "no renderizar una caja
  rota") junto con prácticas que no hay que copiar (spoofing de
  `X-Forwarded-For` desde un pool de IPs residenciales, envío de la IP
  del visitante a un Umami interno, TLS deshabilitado en el proxy de
  cámaras).
- Watchboard tiene su propia deuda de credibilidad en las capas "en
  vivo" del globo: **cinco de las nueve son arrays estáticos**
  congelados en febrero-marzo de 2026 y específicos del tracker de Irán
  (zonas de exclusión aérea, GPS jamming, blackouts, clima de 14
  ciudades), duplicados entre Cesium y Leaflet, sin fecha visible.

Lo que vale la pena tomar de OSIRIS son **patrones de producto e
ingeniería**, no sus capas. Están priorizados en el plan de ejecución
como nueve épicas; las cinco de mayor retorno:

1. Estado de vista en la URL, hecho bien (leer y escribir los cuatro
   parámetros).
2. Caché de fuentes en vivo con dedupe, stale-on-error y estado
   "degradado" visible.
3. Panel de alertas con severidad, alimentado por el light scan.
4. Dossier contextual por clic en el mapa (Nominatim + Wikidata +
   trackers del país).
5. Capas geoespaciales nuevas con procedencia: frente DeepState,
   alertas GDACS, GeoJSON estático de infraestructura.

Lo que **no** conviene tomar: el toolkit RECON (20 herramientas de
consulta en vivo a terceros), CCTV, cripto, navegación turn-by-turn,
mercados, el servidor Next.js con 69 rutas, el LLM sin caché y las
técnicas de evasión de rate limits.

---

## Vista general de los repositorios

| Atributo | OSIRIS | Watchboard |
|---|---|---|
| Repositorio | `simplifaisoul/osiris` | `ArtemioPadilla/watchboard` |
| Stars / forks | ~8.6k / ~1.8k | 19 / 5 |
| Commits | ~301 | ~1,500 |
| Creado | 2026 | 2026-03-04 |
| Licencia | MIT | MIT |
| Framework | Next.js 16.2 (App Router, Turbopack), React 19 | Astro 5.18 + islas React 19 |
| Mapa | MapLibre GL 5.24 (WebGL, custom layer para satélites) | Leaflet 2D + CesiumJS 1.139 3D |
| Backend | 69 `route.ts` en 44 directorios + contenedor `intel/` (Express, 776 líneas) | Ninguno (GitHub Pages) + Worker Cloudflare para push |
| Hosting | Vercel, Docker multi-stage (GHCR, amd64+arm64), CasaOS | GitHub Pages, Worker en `push.watchboard.dev` |
| IA | Gemini 2.0 Flash bajo demanda, 8 llaves en round-robin, sin caché | Claude Code Action nocturno + Sonnet en triage cada 6 h, datos versionados |
| Componente más grande | `OsirisMap.tsx` 2,983 líneas, 49 effects, 95 `addLayer` | `CommandCenter.tsx` 1,348 líneas |
| Tests | 38 archivos, ~533 aserciones, ninguno sobre handlers HTTP | 25 archivos vitest, ~269 casos, 2 specs Playwright (sin workflow) |
| CI | 1 workflow (`docker-publish.yml`) | 21 workflows |
| Datos históricos | No | Sí (timeline por eras, eventos diarios) |
| Tiers de fuente | No | Tier 1-4 en cada dato |
| i18n | Solo inglés | en/es/fr/pt |
| Docs de API pública | `/docs` con catálogo de 56 endpoints (13 sin documentar) | `/api` y `/skill` ya publicadas |

---

## Arquitectura

### OSIRIS

```
Navegador (page.tsx: 55 useState, 20 useEffect, un dataRef + contador de versión)
  |
  +-- OsirisMap (MapLibre): 35 fuentes GeoJSON creadas vacías una vez,
  |     actualizadas con setData; sin clustering; decimación de vuelos
  |     (1 de cada 10 comerciales); custom WebGL layer para satélites
  +-- 33 capas booleanas, 11 activas por defecto
  +-- Polling: sismos 15 min, noticias 30 min, vuelos 5 min,
  |     marítimo y ciberataques cada 10 s SIN pausa con pestaña oculta
  +-- Malware por SSE (snapshot / delta / retire)
  |
  v  fetch /api/*
Next.js API routes (69)
  |   34 con Cache-Control s-maxage/swr, 8 no-store, 5 con caché en memoria,
  |   ~18 sin cabecera alguna
  +-> sourceCache.ts: TTL + dedupe en vuelo + stale-on-error (98 líneas)
  +-> ssrf-guard.ts: 14 CIDR IPv4, 15 prefijos IPv6, redirects manuales
  +-> stealthFetch.ts: rota 10 User-Agents y FALSIFICA X-Forwarded-For
  +-> intel/ (Express :4000): grafo de entidades, OFAC + Wikidata
  +-> ~20 APIs públicas sin llave
```

Hallazgos relevantes del código:

- **El store de datos es un `useRef` + contador de versión**, no estado
  React. Mantiene la identidad del objeto estable entre renders; a cambio
  rompe un `useMemo` que depende de `data` (nunca se invalida).
- **`loadLayerOnce` marca la capa como cargada antes del `await` y borra
  la marca si falla**, así un error de red no deja la capa vacía para
  siempre. Patrón a copiar.
- **Probe de capacidades**: el cliente consulta `?probe=1` y `LayerPanel`
  oculta las capas cuya llave no está configurada. Hace que "sin llave"
  no se vea como "roto".
- **Las 13 "zonas de conflicto"** son 15 registros estáticos con URLs de
  Liveuamap. **`country-risk`** es una tabla hardcodeada (35 China, 90
  Palestina) más un bono por sismos M4.5+ del día.
- **Nominatim se llama desde el navegador** en búsqueda y en reverse
  geocoding al pasar el cursor (debounce 3 s, LRU 500). El código intenta
  fijar `User-Agent`, cabecera que el navegador descarta.
- **`middleware.ts` no hace seguridad**: envía dos eventos Umami por
  vista de página, uno de ellos con la IP del visitante como payload,
  por HTTP plano a un host interno.
- **Caché**: cada ruta declara su `s-maxage` según la volatilidad del
  dato; `sourceCache` sirve el último dato bueno con reintento a 60 s
  cuando falla el upstream; `chainFeeds` baja el TTL a 90 s cuando la
  respuesta es parcial para no fijar un brief degradado.

### Watchboard

Ver `competitive-analysis-worldmonitor.md`. Resumen: Astro SSG, datos en
`trackers/{slug}/data/*.json` validados con Zod, pipeline nocturno de
tres fases, globo Cesium con nueve hooks de capa, light scan cada 15 min
(scoring determinista) y heavy scan cada 6 h (Sonnet), RSS, API JSON
estática, servidor MCP con 7 herramientas, push, video diario.

Hallazgos relevantes del código que el plan debe corregir:

- **Capas "en vivo" del globo**: solo `useFlights`, `useEarthquakes`,
  `useSatellites`, `useWeather` y `useShips` hacen red. `useNoFlyZones`,
  `useGpsJamming`, `useInternetBlackout` son arrays literales con
  `startDate: '2026-02-28'`, atribuidos a "NetBlocks / IODA" o "ADSB
  anomaly reports" como cadena, no como feed. Los mismos datos están
  duplicados en `MapOverlayData.ts` para Leaflet.
- **Bounding box fijo** en vuelos y sismos (lat 12-42, lon 24-65: Medio
  Oriente) aunque el tracker sea de México o Brasil. Clima de 14 ciudades
  del Golfo hardcodeadas.
- **Ningún hook pausa con `document.hidden`**; ninguno usa
  `AbortController`; ninguno cachea. `useFlights` es el único con enum
  de estado (`idle/loading/ok/rate-limited/error`) y backoff; sismos y
  clima hacen `if (!res.ok) return;` y la capa queda vacía en silencio,
  el patrón que documenta `silent-failure-patterns.md`.
- **Estado de URL**: un solo escritor (`#geo`/`#domain` en
  `CommandCenter.tsx:196`). Cero `URLSearchParams`. La cámara vive en
  `useCesiumCamera` de forma imperativa, sin serializar.
- **`public/_health/status.json`** se genera en cada deploy y **nadie lo
  lee**. `MetricsDashboard` solo conoce `success | failure`; no existe un
  estado "degradado" en todo el código.
- **Sin Dockerfile, sin ADRs.** BL-001 y BL-003 piden un ADR que no tiene
  plantilla.
- **Gazetteer gratis**: 5,876 puntos con lat/lon en los `map-points.json`
  de 125 trackers; 109 declaran `country`, 125 `region` y `map.center`.
- **Docs de API ya existen** (`/api`, `/skill`), así que el gap de la v1
  sobre "página de documentación" se retira: es trabajo aditivo.

### Trade-offs

| Dimensión | Ventaja OSIRIS | Ventaja Watchboard |
|---|---|---|
| Frescura | Segundos a minutos | Nocturno + light scan de 15 min |
| Profundidad | Ninguna: no hay historia ni contexto | Timeline, KPIs, claims, casualties por tema |
| Costo infra | Vercel + contenedor `intel/` (pide Patreon) | Cero |
| Confiabilidad | Cae cuando cae una API upstream | Datos en git nunca caen |
| Calidad de dato | Crudo; "risk score" por palabras clave | Curado, tier 1-4, cuatro polos |
| Honestidad de UI | Mixta: excelente en cámaras y satélites, mala en "AI Analysis" | Buena en datos curados, mala en capas estáticas sin fecha |
| Distribución | Docker/GHCR/CasaOS, comunidad self-hosting | Solo la web |
| Descubribilidad | 8.6k stars, Discord, narrativa "Palantir alternative" | Nicho, sin narrativa |

---

## Matriz de features

### Paridad o ventaja Watchboard

| Feature | OSIRIS | Watchboard | Evaluación |
|---|---|---|---|
| Vuelos en vivo | adsb.fi + adsb.lol + OpenSky; decimación 1/10; watchlist por icao24 | OpenSky en globo y mapa, filtro militar por callsign | Paridad; OSIRIS más robusto en fuentes |
| Sismos | USGS 2.5+ cada 15 min | USGS 2.5+ una vez por fecha, bbox fijo | Paridad funcional; WB sin polling ni estado |
| Satélites | ~19k TLE Celestrak, SGP4 real, órbita bajo demanda, shader propio | 6 grupos Celestrak + satellite.js, cap 200 Starlink | Paridad; `orbit.ts` de OSIRIS es mejor (antimeridiano, no interpola) |
| Globo 3D | No (MapLibre globe projection) | Cesium con misiles, misiones lunares, modo cinemático | Ventaja WB |
| Multi-tema | Un dashboard global | 125 trackers independientes | Ventaja WB mayor |
| Timeline / eventos | No | Eras, particiones diarias, media, permalinks por evento | Ventaja WB mayor |
| Tiers de fuente | No | Tier 1-4 + polos | Ventaja WB mayor |
| Pipeline IA | Gemini bajo demanda, sin caché ni verificación | Claude nocturno + fix agent + build gate + Sonnet triage | Ventaja WB mayor |
| Telegram | Scraping t.me/s/ de 4 canales + geoparsing de 15 topónimos | `pollTelegram()` de 5 canales, sin geoparsing | Paridad parcial |
| Alertas | LiveAlerts con severidad 8/6/4 | Telegram + push por tracker; sin panel web | Gap (épica E3) |
| Atajos de teclado | 13 reales, 8 documentados, colisión en `S` | 11 en tabla `SHORTCUTS`, panel `?` | Ventaja WB (documentados y sin colisión) |
| RSS / API / MCP | `/docs` con catálogo, SSE "SDK" sin auth | 4 RSS, API JSON, MCP 7 tools, `/api` y `/skill` | Ventaja WB |
| Broadcast / stories / video | Nada | BroadcastOverlay, stories, video diario | Ventaja WB |
| Métricas de ingesta | `/api/health` declarativo; "ONLINE" hardcodeado en verde | MetricsDashboard con calendario de uptime | Ventaja WB |
| Error boundaries | `ErrorBoundary.tsx` genérico | `IslandErrorBoundary` en 3 islas | Paridad (ambos solo errores de render) |
| Self-hosting | Dockerfile 3 etapas, compose, nginx, CasaOS, GHCR multi-arch | Nada | Gap (épica E8) |
| Compartir vista | Genera `lat/lon/zoom/layers`, solo lee `layers` | Nada | Gap en ambos (épica E1) |

### Gaps: lo que OSIRIS tiene y Watchboard no

Cada gap se convierte en una épica del plan de ejecución. Aquí se
describe el hallazgo; allí, las historias y tareas.

#### Gap 1: Dossier contextual por clic (épica E4)

Clic derecho en OSIRIS llama `/api/region-dossier?lat&lng`: Nominatim
reverse, luego Wikipedia REST y Wikidata SPARQL en paralelo con
`Promise.allSettled`; caché 1 h. En Watchboard el único handler de clic
del globo está en `useConflictData.ts:15` (entidades), y Leaflet solo
tiene clics en marcadores (`LeafletMap.tsx:397`). No existe clic de
fondo que capture lat/lon. El precedente más cercano es
`handleGeoClick` en `CommandCenter.tsx:311` (polígono de país en el
homepage). Especificaciones previas a leer:
`docs/superpowers/specs/2026-04-07-globe-click-to-drill-design.md` y
`2026-04-03-geographic-hierarchy-design.md`.

#### Gap 2: URL compartible (épica E1)

OSIRIS lo hace mal y eso es la lección: `SharePanel.tsx:17-34` escribe
cuatro parámetros y `page.tsx:336-345` lee uno. El criterio de
aceptación de Watchboard debe ser un test de ida y vuelta. La cámara de
Cesium vive en `useCesiumCamera.ts` (imperativa); los toggles de capa
en un `useState` en `CesiumGlobe.tsx:129-136`; los del mapa 2D en
`IntelMap.tsx:66-75`. Todo es local a la isla, así que **la dependencia
de BL-003 sobre el ADR de nanostores (BL-001) es falsa**: baja de M-H a
S.

#### Gap 3: Caché de fuentes en vivo (épica E2)

`sourceCache.ts` de OSIRIS: TTL, dedupe en vuelo, stale-on-error con
reintento a 60 s, tope de 500 claves. Watchboard tiene un precedente
propio en `useTrackerDetail.ts:16-17` (mapas `CACHE` e `IN_FLIGHT` a
nivel de módulo). El punto de inserción es el bloque de nueve hooks en
`CesiumGlobe.tsx:489-497`. El enum `FlightStatus` de `useFlights.ts:54`
se generaliza a todas las fuentes. Cierra BL-020.

#### Gap 4: Capas geoespaciales con procedencia (épica E5)

Verificado el 7 de septiembre de 2026:

| Fuente | CORS | Tamaño | Caché upstream | Licencia |
|---|---|---|---|---|
| `deepstatemap.live/api/history/last` | `*` | 628 KB, 29 polígonos | `max-age=300` | No declarada; pedir permiso |
| `gdacs.org/xml/rss.xml` | ninguno | 1.3 MB, 428 items | ninguno | CC BY 4.0 (UE) |
| `nominatim.openstreetmap.org/reverse` | `*` | <1 KB | ninguno | ODbL; política 1 req/s |

DeepState se puede consumir desde el navegador; GDACS necesita ingesta
del lado del scan (cada 15 min) y publicar un JSON recortado. Los
GeoJSON estáticos de OSIRIS (cables submarinos 665 KB, dos copias
idénticas; ~55 plantas nucleares) modelan lo que Watchboard debería
tener como capas con `_provenance`. Cierra el ítem 1.1 del análisis de
World Monitor.

#### Gap 5: Panel de alertas (épica E3)

`LiveAlerts.tsx` mezcla noticias (severidad por score), sismos (por
magnitud) y 23 streams hardcodeados. Watchboard ya produce la señal en
`hourly-light-scan.ts` (`HIGH_THRESHOLD 0.85`, `MODERATE 0.25`) y la
escribe en `public/_hourly/triage-log.json`, pero ese archivo pesa 4.4
MB: el panel necesita un `alerts.json` recortado. La taxonomía de
severidad puede reusar `useFactCards.ts:9` (KINETIC / INFRASTRUCTURE /
CIVILIAN IMPACT / ESCALATION).

#### Gap 6: Geoparsing (épica E6)

OSIRIS mapea 15 topónimos a centroides. Watchboard tiene 5,876 puntos
con nombre en sus propios datos. `Candidate` (`hourly-types.ts:63-74`)
no tiene campo geo.

#### Gap 7: Índice de actividad honesto (épica E7)

`country-risk` de OSIRIS es una tabla. Watchboard puede calcularlo de
eventos de 7 días, flags `breaking`, deltas de KPI (BL-024) y frescura
del digest, y **mostrar los factores**, no solo el número.

#### Gap 8: Self-hosting (épica E8)

OSIRIS: Dockerfile de 3 etapas, `output: standalone`, usuario no root,
compose con nginx (gzip para JSON de 4 MB, proxy de tiles cacheado 365
días), bloque `x-casaos`, workflow GHCR amd64+arm64 con `concurrency`.
Su documentación deriva: README cita `.env.template` y el archivo es
`.env.example`; DOCKER.md dice que solo se leen dos variables y el
código lee 17; `FIRMS_API_KEY` y `N2YO_API_KEY` están documentadas y no
se leen nunca. Lección: **generar la lista de variables desde el
código**, no a mano. Watchboard no tiene Dockerfile; `npm run build`
requiere `copy-cesium` (7.5 MB) y `generate-api`.

#### Gap 9: Herramientas de dibujo y AOI (épica E9, diferida)

`draw.ts` es un reducer puro con cuatro modos que colapsan a un anillo
GeoJSON; `aoi.ts` barre 11 capas con rechazo por bounding box antes del
ray casting; `aoi-export.ts` persiste en `localStorage` validando cada
registro y descartando solo los corruptos. Para Watchboard el caso de
uso es "dibuja un área y te digo qué trackers y eventos caen dentro".
`watch.ts` (enter/exit) no aplica a un archivo estático, salvo la regla
"la primera pasada no es un evento".

### Lo que no conviene tomar

| Feature OSIRIS | Razón para no adoptarla |
|---|---|
| RECON toolkit (20 módulos: port scan, vuln sweep, Shodan, WHOIS, leaks, infostealer, teléfono) | Consultas en vivo a terceros, doble uso, exposición legal. Dos módulos llaman a Shodan y XposedOrNot directo desde el navegador del usuario |
| `WorldRemote` (Bluetooth + escaneo de puertos locales vía WebRTC) | Fuera de misión y sin UI de consentimiento |
| CCTV (48 adaptadores, ~19k cámaras) | Sin relación con trackers temáticos; el proxy deshabilita TLS (`rejectUnauthorized=false`) y sigue redirects sin revalidar allowlist |
| Cripto / ChainBrief / TokenPanel | Otro producto; el TokenPanel promociona el token del proyecto |
| Navegación turn-by-turn (`DirectionsBar`, 1,048 líneas) | App de consumo injertada; nada de OSINT |
| Mercados (Yahoo Finance con UA falso) | Live-only; scraping |
| `stealthFetch` (rotación de UA + `X-Forwarded-For` falsificado) | Evasión de rate limits; envenena logs de terceros; problema de términos de uso antes que técnico |
| Servidor Next.js con 69 rutas | Rompe el modelo de cero infraestructura |
| LLM bajo demanda sin caché | Costo por visitante; `/api/ai/overview` sin rate limit llama a Gemini con llaves del servidor en cada petición anónima |
| `risk_score` + `machine_assessment` | Conteo de palabras presentado como análisis; los tiers de Watchboard existen para evitar exactamente esto |
| `country-risk` estático | Números inventados con apariencia de modelo |
| StyleStudio (28 controles) | Cesium ya tiene 7 modos visuales; el modelo de tokens sí es bueno (ver lecciones) |
| Telemetría de IP en middleware | PII enviada a un host interno por HTTP plano |

---

## Lecciones de ingeniería transferibles

Independientes de features, con la cita del código donde viven:

1. **Nunca dejar una capa en cero en silencio.** `sourceCache.ts:11-15`:
   "keep serving the last good index rather than dropping the layer to
   zero cameras". `loadLayerOnce` (`page.tsx:700-706`) borra la marca
   de "ya cargado" si la petición falla. Es la misma regla que
   `silent-failure-patterns.md` aprendió por el camino difícil.
2. **Fallo parcial explícito, no global.** `chainFeeds.ts:11-13`: "one
   dead upstream must never blank the brief, so every collector
   resolves to an empty section plus a stated reason". `ChainBrief`
   muestra un bloque "DEGRADED SOURCES" como elemento de primera clase.
3. **Procedencia visible en texto generado.** `AiOverview.tsx:127-130`
   etiqueta el resultado como `GEMINI 2.0 FLASH` o `HEURISTIC ANALYST`
   y tiene un digest determinista de respaldo para que el botón nunca
   falle.
4. **Taxonomía epistémica.** El módulo de username separa confirmado /
   no verificable / bloqueado / no aplicable en vez de colapsar
   "desconocido" en "no encontrado". Encaja con los tiers y el campo
   `contested` de Watchboard.
5. **Identificadores reciclados.** `camera-feed.ts:108-115`: Skyline
   reutiliza IDs numéricos y una cámara retirada muestra otro lugar bajo
   el mismo rótulo. "A wrong picture under a confident label is worse
   than no picture". Aplica a `og:image` y thumbnails de Watchboard.
6. **No renderizar una caja rota.** `CctvPreviews.tsx:196-198`; y el
   handshake `postMessage` de YouTube para detectar "video unavailable"
   dentro de un iframe que cargó bien.
7. **Compresión para display, valor real en el readout.**
   `satellite-layer.ts:49-51`: la altitud se comprime en una curva
   sqrt para que quepa en el frustum, y el popup muestra la real.
8. **Elegir con las mismas matemáticas con que se dibuja.** El picking
   de satélites reutiliza el vertex shader escribiendo `gl_InstanceID`
   para que no haya dos fuentes de verdad que deriven.
9. **La primera pasada no es un evento.** `watch.ts:11-19`. Aplicar al
   light scan al añadir una fuente nueva: primera corrida solo siembra.
10. **Tokens de tema en dos mecanismos separados.**
    `style-tokens.ts:1-16`: paleta como custom properties inline (gana
    siempre), lo demás en una sola hoja inyectada condicional; `null`
    significa "no tocar".
11. **Pruebas de red opt-in.** `const liveIt = process.env.RUN_LIVE_TESTS
    === '1' ? it : it.skip;` repetido en 10 archivos y `npm run
    test:live`. Watchboard no tiene esta convención y la necesitará para
    DeepState, GDACS y Nominatim.
12. **Probe de capacidades.** Ocultar capas cuya llave no existe en vez
    de mostrarlas rotas (`LayerPanel.tsx:224-227`). Aplica a la capa de
    barcos, que hoy exige llave AIS en `localStorage`.
13. **Cabeceras de caché por fuente y allowlist de hosts** en cualquier
    proxy. Si Watchboard añade handlers al Worker, mirar
    `functions/api/push/_shared.ts:30` (ya tiene allowlist de orígenes)
    y no repetir los errores del proxy de cámaras de OSIRIS.

---

## Fuentes

- Clon de `simplifaisoul/osiris` en `master` (`d2c08c8`, 2026-09-06):
  `src/app/page.tsx`, `OsirisMap.tsx`, 36 componentes, 49 librerías, 69
  rutas, `intel/server.js`, `middleware.ts`, `Dockerfile`,
  `docker-compose.yml`, `nginx/nginx.conf`, README, DOCKER.md,
  SECURITY.md, 38 archivos de test.
- Watchboard `feead12`: `src/components/islands/CesiumGlobe/*`,
  `IntelMap.tsx`, `useMapOverlays.ts`, `MapOverlayData.ts`,
  `CommandCenter/*`, `scripts/hourly-*.ts`, `src/lib/keyword-match.ts`,
  `worker/`, `functions/`, `scripts/generate-api.ts`,
  `scripts/generate-health.ts`, `BACKLOG.md`, `TECH_DEBT.md`,
  `docs/product-roadmap.md`.
- Verificación de cabeceras CORS y caché de DeepState, GDACS y
  Nominatim el 7 de septiembre de 2026.
