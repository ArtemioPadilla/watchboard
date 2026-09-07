# Análisis competitivo: Watchboard vs OSIRIS

Comparación entre Watchboard y OSIRIS (`simplifaisoul/osiris`), un
dashboard OSINT en tiempo real que se posiciona como "alternativa open
source a Palantir". Complementa `competitive-analysis-worldmonitor.md`:
OSIRIS pertenece a la misma familia que World Monitor (SPA con mapa
WebGL y decenas de feeds en vivo), así que este documento se centra en
lo que OSIRIS hace distinto y en qué de eso conviene adoptar.

**Última actualización:** 7 de septiembre de 2026
**OSIRIS analizado:** rama `master`, ~301 commits
**Watchboard:** `feead12` (main)

---

## Resumen ejecutivo

OSIRIS y Watchboard resuelven problemas distintos con arquitecturas
opuestas. OSIRIS es un **visor de sensores**: agrega 16 capas en vivo
(aviones, sismos, incendios, CCTV, sanciones, Telegram) sobre un mapa
MapLibre y no guarda historia ni cura nada. Watchboard es un **archivo
curado**: 125 trackers con línea de tiempo, tiers de fuente y datos
versionados en git, actualizados por IA.

Lo que vale la pena tomar de OSIRIS no son sus capas (la mayoría están
fuera de misión) sino **cinco patrones de producto e ingeniería** que
encajan en el backlog actual sin cambiar la arquitectura estática:

1. Dossier contextual por clic en el mapa (Nominatim + Wikidata).
2. URL compartible con estado de vista, sin esperar el ADR de nanostores.
3. Caché de fuentes en vivo con dedupe en vuelo y "stale-on-error".
4. Frente de guerra en vivo (DeepState) y alertas GDACS como capas nuevas.
5. Panel de alertas con severidad, alimentado por el light scan que ya existe.

Lo que **no** conviene tomar: el toolkit RECON (port scan, WHOIS, SSL),
CCTV en vivo, rastreo de wallets y la dependencia de un servidor Next.js
con llamadas LLM sin caché.

---

## Vista general de los repositorios

| Atributo | OSIRIS | Watchboard |
|---|---|---|
| Repositorio | `simplifaisoul/osiris` | `ArtemioPadilla/watchboard` |
| Stars / forks | ~8.6k / ~1.8k | dos órdenes de magnitud menos |
| Commits | ~301 | ~1,500+ |
| Licencia | MIT | MIT |
| Framework | Next.js 16 (App Router, Turbopack) | Astro 5 + islas React |
| Mapa | MapLibre GL JS (WebGL) | Leaflet 2D + CesiumJS 3D |
| Backend | 44 rutas API en Next.js + contenedor `intel/` | Ninguno (GitHub Pages) + Worker para push |
| Hosting | Vercel Edge, Docker (GHCR), CasaOS | GitHub Pages, Cloudflare Worker |
| IA | Gemini 2.0 Flash bajo demanda, sin caché | Claude Code Action nocturno, datos versionados |
| Tests | 4 archivos `*.test.ts` visibles en `components/` | 26 archivos de test + Playwright e2e |
| Datos históricos | No | Sí (timeline por eras, eventos diarios) |
| Tiers de fuente | No | Tier 1-4 en cada dato |

---

## Arquitectura

### OSIRIS

```
Navegador (Next.js client, MapLibre GL, Framer Motion)
  |
  v  fetch /api/*
Next.js API routes (44)            -> proxies con Cache-Control s-maxage
  |   flights, earthquakes, fires, gdelt (GDACS), frontlines (DeepState),
  |   country-risk, region-dossier, osint (Telegram), sanctions, crypto,
  |   markets, cloudflare-radar, malware, scanner, entity/expand, ai
  |
  +-> intel/ (contenedor Node separado: grafo de entidades, scanner)
  +-> ~20 APIs públicas sin llave (OpenSky, USGS, NASA FIRMS/EONET,
      NOAA SWPC, N2YO, NVD, OpenSanctions, blockstream, t.me/s/)
```

Características:
- Todo es tiempo real; nada se persiste. Cerrar la pestaña borra el estado.
- Las 13 "zonas de conflicto" y los 39 puertos son datos estáticos en código.
- `country-risk` es una tabla hardcodeada (35 China, 90 Palestina) más un
  bono por sismos M4.5+ del día. No hay modelo detrás.
- El LLM (Gemini) se llama bajo demanda para "AI overview" y briefing
  diario; sin caché, sin curación, sin verificación de fuentes.
- Caché por ruta con `s-maxage` + `stale-while-revalidate` y una
  `sourceCache` en memoria con TTL, dedupe de peticiones concurrentes y
  fallback al último dato bueno si la fuente falla.
- Rate limiting por IP y `ssrf-guard` en los proxies.

### Watchboard

Ver `competitive-analysis-worldmonitor.md`. Resumen: Astro SSG, datos en
`trackers/{slug}/data/*.json` validados con Zod, pipeline nocturno de
tres fases, globo Cesium con capas en vivo (vuelos OpenSky, satélites
Celestrak, sismos USGS, clima Open-Meteo, GPS jamming, blackouts), light
scan cada 15 min, RSS, API JSON estática, servidor MCP, push, video diario.

### Trade-offs

| Dimensión | Ventaja OSIRIS | Ventaja Watchboard |
|---|---|---|
| Frescura | Segundos a minutos | Nocturno + light scan de 15 min |
| Profundidad | Ninguna: no hay historia ni contexto | Timeline, KPIs, claims, casualties por tema |
| Costo infra | Vercel + contenedor `intel/` (pide Patreon) | Cero |
| Confiabilidad | Cae cuando cae una API upstream | Datos en git nunca caen |
| Calidad de dato | Crudo, sin tiers | Curado, tier 1-4, cuatro polos |
| Distribución | Docker/GHCR/CasaOS, fácil de auto-hospedar | Solo la web |
| Descubribilidad | 8.6k stars, Discord, "Palantir alternative" | Nicho, sin narrativa de posicionamiento |

---

## Matriz de features

### Paridad o ventaja Watchboard

| Feature | OSIRIS | Watchboard | Evaluación |
|---|---|---|---|
| Vuelos en vivo | OpenSky, capa global | OpenSky en globo y mapa, filtro militar por callsign | Paridad |
| Sismos | USGS 2.5+ | USGS 2.5+ en globo | Paridad |
| Satélites | N2YO (llave) | Celestrak TLE + satellite.js, sin llave | Ventaja WB |
| Globo 3D | No (solo mapa 2D) | Cesium con misiles, modo cinemático, misiones lunares | Ventaja WB |
| Multi-tema | Un dashboard global | 125 trackers independientes | Ventaja WB mayor |
| Timeline / eventos | No | Eras, particiones diarias, media | Ventaja WB mayor |
| Tiers de fuente | No | Tier 1-4 + polos | Ventaja WB mayor |
| Pipeline IA | Gemini bajo demanda, sin verificación | Claude nocturno + fix agent + build gate | Ventaja WB mayor |
| Telegram | Scraping t.me/s/ + geoparsing | `pollTelegram()` en light scan, sin geoparsing | Paridad parcial (ver Gap 6) |
| Alertas | Panel LiveAlerts con severidad | Telegram + push por tracker, sin panel en la web | Paridad parcial (ver Gap 5) |
| Atajos de teclado | Panel de shortcuts | Panel `?` | Paridad |
| RSS / API / MCP | Nada | 4 feeds RSS, API JSON, servidor MCP | Ventaja WB |
| Broadcast / stories / video | Nada | BroadcastOverlay, MobileStoryCarousel, video diario | Ventaja WB |
| Métricas de ingesta | `/api/health` declarativo (no prueba nada) | MetricsDashboard con calendario de uptime | Ventaja WB |
| i18n | Solo inglés | en/es/fr/pt | Ventaja WB |
| Compartir vista | URL con lat/lon/zoom/layers | No hay deep links | Gap (ver Gap 2) |

### Gaps: lo que OSIRIS tiene y Watchboard no

Cada gap indica qué hace OSIRIS, cómo se traduce a Watchboard, esfuerzo
estimado (XS <2h, S medio día, M 1-2 días, L 3-5 días) y si requiere
backend.

#### Gap 1: Dossier contextual por clic en el mapa

**Severidad:** Alta. **Backend:** No.

En OSIRIS, clic derecho en cualquier punto del mapa llama a
`/api/region-dossier`: Nominatim (reverse geocoding) y luego, en
paralelo, Wikipedia REST y Wikidata SPARQL para país, capital, población,
jefe de estado y bandera. Cachea una hora.

**Traducción a Watchboard.** El mismo gesto sobre el globo del homepage
o el mapa de un tracker abriría un panel con: los trackers cuyo
`country` coincide con el país resuelto, sus últimos eventos, y los
datos de Wikidata. Esto convierte el globo en un índice espacial de los
125 trackers, que hoy solo se navegan por lista. El campo `country` ya
existe en `tracker.json` (lo usa `tracker-feeds.ts`).

- Nominatim se puede llamar desde el cliente respetando su política de
  uso (1 req/s, `User-Agent` identificable). Wikidata SPARQL también.
- Reusar `FloatingFactCard` / `CesiumInfoPanel` para el panel.
- Cachear por país en `sessionStorage`.

**Esfuerzo:** M. Encaja con el tema "Country trackers" de M4.

#### Gap 2: URL compartible con estado de vista

**Severidad:** Alta. **Backend:** No.

`SharePanel.tsx` de OSIRIS codifica cuatro parámetros: `lat`, `lon`,
`zoom`, `layers` (lista separada por comas). Nada más. Al abrir la URL
el mapa aterriza en el mismo estado.

**Traducción a Watchboard.** El backlog tiene BL-003 (deep links) como
M-H y bloqueado por el ADR de nanostores para búsqueda. OSIRIS demuestra
que la versión mínima no necesita estado compartido entre islas: el
globo y el mapa ya poseen su cámara y sus toggles de capa. Leer
`URLSearchParams` al montar y escribir con `history.replaceState` al
cambiar es local a `CesiumGlobe.tsx` y `IntelMap.tsx`.

- Parámetros propuestos: `lat`, `lon`, `alt` (Cesium) o `zoom` (Leaflet),
  `layers`, `event` (slug de evento para abrir su panel; `event-slug.ts`
  ya existe), `date` (para el scrubber de timeline).
- Sirve de base para OG images dinámicas y para que el light scan
  incluya enlaces que aterricen en el punto exacto.

**Esfuerzo:** S. Desbloquea BL-003 sin esperar BL-001.

#### Gap 3: Caché de fuentes en vivo con dedupe y stale-on-error

**Severidad:** Media-alta. **Backend:** No.

`sourceCache.ts` de OSIRIS implementa tres cosas que Watchboard no tiene
en sus hooks de globo: TTL configurable, una sola petición en vuelo por
clave (dos componentes que piden vuelos comparten la promesa) y, si la
fuente falla, servir el último dato bueno con reintento a 60 s en vez
de dejar la capa en cero. El README reporta "75% menos peticiones edge"
al relajar polling de datos estables a 15-30 min y cargar por viewport.

**Estado en Watchboard.** `useMapFlights.ts` y `useFlights.ts` llaman a
OpenSky cada 15 s con un bounding box fijo (12-42N, 24-65E) aunque el
usuario mire otra región. OpenSky anónimo tiene cupo diario de créditos
y ese ritmo lo agota en minutos de sesión larga. No se pausa cuando la
pestaña está oculta. Si OpenSky devuelve 429 la capa desaparece sin
aviso, exactamente el patrón que documenta `silent-failure-patterns.md`.

**Propuesta.** Un `src/lib/live-source-cache.ts` compartido por
`useFlights`, `useEarthquakes`, `useSatellites`, `useWeather`:

- TTL por fuente (vuelos 30-60 s, sismos 5 min, TLE 6 h).
- Dedupe en vuelo por clave (`fuente + bbox`).
- Último dato bueno + flag `degraded` que la UI muestre como chip ámbar
  en el HUD (cierra BL-020 "API health indicator").
- Bbox derivado de la cámara actual, no fijo.
- Pausa con `document.visibilityState === 'hidden'`.

**Esfuerzo:** S-M. Ahorra cuota de API y hace visible la degradación.

#### Gap 4: Frente de guerra en vivo y alertas de desastres

**Severidad:** Media. **Backend:** Depende de CORS.

OSIRIS expone dos capas sin llave que sí son relevantes para trackers
existentes:

- **DeepState frontlines** (`deepstatemap.live/api/history/last`):
  GeoJSON de la línea de frente en Ucrania, cacheado 30 min. Para el
  tracker de Ucrania sería la capa más valiosa del mapa: hoy el mapa
  muestra puntos curados, no el frente.
- **GDACS** (`gdacs.org/xml/rss.xml`): alertas geocodificadas de sismos,
  inundaciones, ciclones, volcanes. Alimentaría los trackers de Sahel,
  Myanmar, Sudán y cualquier tracker de desastre, y es un candidato
  natural para el light scan (los eventos ya vienen con coordenadas).

**Consideraciones.** Verificar CORS y términos de uso de DeepState antes
de llamarlo desde el navegador; si no permite CORS, un handler en
`worker/handlers/` con allowlist de hosts (el `ssrf-guard` de OSIRIS es
el patrón) y `Cache-Control` de 30 min. NASA FIRMS y EONET requieren
llave o son globales y ruidosos; dejarlos para después.

**Esfuerzo:** M por capa. DeepState primero, GDACS segundo.

#### Gap 5: Panel de alertas con severidad en la web

**Severidad:** Media. **Backend:** No.

`LiveAlerts.tsx` de OSIRIS mezcla noticias con `risk_score` 0-10,
sismos por magnitud y streams en vivo, con pestañas por tipo y colores
por severidad (CRITICAL ≥8, HIGH ≥6, ELEVATED ≥4). Al pasar el cursor
vuela al punto en el mapa.

**Estado en Watchboard.** El light scan ya produce exactamente esa
señal: `scoreCandidate()` da 0-1, con umbral 0.85 para alerta y
`MODERATE_THRESHOLD` para pendiente, y todo queda en
`public/_hourly/triage-log.json`. Pero esa señal solo llega a Telegram y
a la página de auditoría; el homepage no la muestra.

**Propuesta.** Un panel colapsable en `CommandCenter` que lea
`triage-log.json` en runtime (como ya hace `TriageLogBoard`), filtre
`update` y `new_tracker` con score ≥ umbral, muestre severidad por color
y vuele al tracker al hacer clic. Los sismos M≥4.5 de `useEarthquakes`
pueden entrar como segunda pestaña.

**Esfuerzo:** S. Reusa datos y componentes existentes.

#### Gap 6: Geoparsing de candidatos del light scan

**Severidad:** Media-baja. **Backend:** No.

OSIRIS geoparsea posts de Telegram contra diccionarios multilingües y
los pinta en el mapa. Watchboard ya lee los mismos canales con
`pollTelegram()` pero los candidatos no tienen coordenadas hasta que el
heavy scan los convierte en eventos.

**Propuesta.** Construir el gazetteer desde los propios datos: los
`map-points.json` de los 125 trackers ya tienen nombre + lat/lon, y
`geo-utils.ts` tiene helpers. Añadir a `keyword-match.ts` un paso que
asigne el punto más cercano por nombre y guardar `lat/lon` en
`pending-candidates.json`. Con eso los candidatos aparecen en el globo
antes de la triage IA y el panel del Gap 5 puede volar a ellos.

**Esfuerzo:** M.

#### Gap 7: Índice de actividad por tracker en lugar de riesgo hardcodeado

**Severidad:** Baja. **Backend:** No.

`country-risk` en OSIRIS es una tabla estática más sismos. Watchboard
puede hacerlo honestamente: eventos de los últimos 7 días, cuántos
marcados `breaking`, deltas de KPI (BL-024), frescura del digest.
Calculado en build en `generate-api.ts` y expuesto en
`public/api/v1/trackers.json`, alimentaría el orden de la sidebar, el
carrusel de stories y la selección de trackers del video diario
(`hero-selection.ts` ya hace una versión de esto).

**Esfuerzo:** M. Hacer junto con BL-024.

#### Gap 8: Imagen Docker para auto-hospedaje

**Severidad:** Baja para producto, alta para crecimiento. **Backend:** No.

OSIRIS publica una imagen en GHCR (~220 MB) con instalación de un clic
en CasaOS. Una parte considerable de sus stars viene del ecosistema de
self-hosting. Watchboard es estático: un `Dockerfile` multi-stage que
haga `npm run build` y sirva `dist/` con nginx pesaría menos y se
publicaría desde `deploy.yml`.

**Esfuerzo:** S. Palanca de distribución barata; añadir a awesome-selfhosted.

#### Gap 9: AOI y "watch" con detección de cambios

**Severidad:** Baja. **Backend:** No.

OSIRIS permite dibujar un polígono y responde "qué hay dentro" barriendo
todas las capas (`aoi.ts`, con rechazo por bounding box antes del ray
casting), y `watch.ts` convierte barridos repetidos en eventos
enter/exit con una ventana rodante de 100.

Para Watchboard el caso de uso es más débil: los datos curados cambian
una vez al día y ya hay push por tracker. La versión útil sería "dibuja
un área, te digo qué trackers y eventos caen dentro", como filtro
espacial del directorio. Diferir hasta que exista el Gap 1.

**Esfuerzo:** M-L.

### Lo que no conviene tomar

| Feature OSIRIS | Razón para no adoptarla |
|---|---|
| RECON toolkit (port scan, WHOIS, SSL, IP intel, CVE) | Fuera de misión, doble uso, exposición legal. Watchboard es periodismo de datos, no reconocimiento de red |
| CCTV en vivo (17k cámaras) | Sin relación con trackers temáticos; costo de mantenimiento alto, riesgo de privacidad |
| Rastreo de wallets y ChainBrief | Otro producto |
| Servidor Next.js con 44 proxies | Rompe el modelo de cero infraestructura que es la ventaja de confiabilidad de Watchboard |
| LLM bajo demanda sin caché (Gemini) | Costo por visitante, sin verificación de fuentes, sin tiers. El modelo nocturno con datos versionados es superior para un archivo |
| `country-risk` estático | Números inventados con apariencia de modelo. Ver Gap 7 para la versión honesta |
| StyleStudio (theming por usuario) | Cesium ya tiene 7 modos visuales; bajo retorno |

---

## Roadmap sugerido

Ordenado por retorno sobre esfuerzo y por dependencias. Los IDs BL-* y
las referencias a milestones son del `BACKLOG.md` y `product-roadmap.md`.

```
Fase A — Quick wins (una semana)
  Gap 2  URL compartible en globo y mapa            [S]   desbloquea BL-003
  Gap 5  Panel de alertas desde triage-log          [S]
  Gap 3  live-source-cache + chip "degraded"        [S-M] cierra BL-020
  Gap 8  Dockerfile + imagen GHCR                   [S]

Fase B — Contexto espacial (M3-M4)
  Gap 1  Dossier por clic (Nominatim + Wikidata)    [M]   tema country trackers
  Gap 4  DeepState frontline en tracker Ucrania     [M]
  Gap 4  GDACS como fuente del light scan           [M]

Fase C — Señal (M4+)
  Gap 7  Índice de actividad por tracker            [M]   junto con BL-024
  Gap 6  Geoparsing de candidatos                   [M]
  Gap 9  Filtro espacial del directorio             [M-L] después de Gap 1
```

---

## Lecciones de ingeniería transferibles

Independientes de features, tres decisiones de OSIRIS valen la pena
copiar como convención:

1. **Nunca dejar una capa en cero en silencio.** El comentario de
   `sourceCache.ts` ("keep serving the last good index rather than
   dropping the layer to zero") es la misma regla que
   `silent-failure-patterns.md` aprendió por el camino difícil. Aplicarla
   a todos los hooks de datos en vivo.
2. **Cabeceras de caché explícitas por fuente.** Cada ruta de OSIRIS
   declara `s-maxage` y `stale-while-revalidate` acordes a la
   volatilidad del dato. Si Watchboard añade handlers en el Worker
   (Gap 4), adoptar la misma disciplina y un allowlist de hosts.
3. **Baseline silencioso.** `watch.ts` no reporta nada en la primera
   pasada para no generar falsas alertas de "entrada". El light scan
   podría aplicar el mismo principio al añadir una fuente nueva: primera
   corrida solo siembra, no alerta.

---

## Fuentes

- README, `SECURITY.md` y árbol de `src/` de `simplifaisoul/osiris`
  (rama `master`), consultados el 7 de septiembre de 2026.
- Rutas leídas: `api/region-dossier`, `api/gdelt`, `api/frontlines`,
  `api/country-risk`, `api/entity/expand`, `api/health`.
- Componentes leídos: `IntelFeed`, `LiveAlerts`, `SharePanel`,
  `ViewPresets`, `ChainBrief`, `StyleStudio`.
- Librerías leídas: `ai-engine.ts`, `aoi.ts`, `watch.ts`, `sourceCache.ts`.
