# Diseño: capa de radio y contribución comunitaria sin backend

**Estado:** Propuesto
**Fecha:** 2026-09-21
**Contexto:** inspirado por `gods-eye-view` (bilawalsidhu/gods-eye-view,
MIT), pero adopta patrones, no código — es JS vanilla con proxies de
Vite que no encajan en un sitio estático en GitHub Pages. Ver
`docs/competitive-analysis-osiris.md` y ADR-0002 para el precedente:
las capas geoespaciales de Watchboard son instantáneas horneadas con
`_provenance`, no consultas en vivo desde el navegador.

## Resumen

Dos piezas independientes, cada una sin backend nuevo:

1. **Capa de radio** — torres de comunicación (OSM) y emisoras con
   stream (radio-browser.info) como capas GeoJSON estáticas,
   activables por tracker (`map.staticLayers`) y en el globo global,
   con un reproductor de audio al hacer clic.
2. **Contribución comunitaria** — extiende los issue-forms ya
   existentes (`data-correction.yml`, `tracker-request.yml`) con
   sugerencia de eventos/fuentes, curación de estaciones de radio por
   PR, y un `CONTRIBUTING.md` que documenta todo el flujo, incluidas
   traducciones.

Fuera de alcance en esta fase: EiBi (onda corta; licencia sin
verificar), KiwiSDR/WebSDR (contenido mixto, sin API), cualquier chat
en vivo (requiere backend y rompe el modelo de tiers — mensajes
serían Tier 4 sin verificar), skill de revisión automática de PRs
(análogo al `community-pr` de gods-eye-view).

## 1. Capa de radio

### 1.1 Modelo de datos

Dos capas GeoJSON en `public/geo/layers/`, validadas por el
`GeoLayerSchema` existente (`src/lib/geo-layer-schema.ts`), con
`_provenance` obligatorio:

**`radio-towers.geojson`** — `Point`, de OSM Overpass
(`man_made=mast|tower` + `tower:type=communication`):
```
properties: { osmId: string, heightM: number | null }
```

**`radio-stations.geojson`** — `Point`, de radio-browser.info
(`docs.radio-browser.info`, sin ToS dedicado encontrado; directorio en
PDDL 1.0):
```
properties: {
  name: string,
  country: string,
  language: string | null,
  freqLabel: string | null,   // regex sobre el nombre, ej. "101.5 FM" — marcado "aprox." en la UI
  streamUrl: string,          // HTTPS únicamente; http:// se descarta en el script
  codec: 'MP3' | 'AAC',
  stationUuid: string,        // id de radio-browser, para overrides y reportes
  verifiedAt: string,         // ISO date del último HEAD exitoso
}
```

Ninguna capa infiere que una torre emite una frecuencia concreta: son
dos capas distintas, correlacionadas solo visualmente por cercanía.

### 1.2 Pipeline (`scripts/geo/refresh-layers.ts`)

Dos adaptadores nuevos, siguiendo el patrón de
`wikidataPlantsToFeatures` / `cableGeoToFeatures`:

- `overpassTowersToFeatures(rows)` — una consulta Overpass por tracker
  con `staticLayers` que incluya `radio`, acotada a `map.bounds`.
- `radioBrowserToFeatures(rows)` — filtra a HTTPS + MP3/AAC, aplica
  `radio-stations.overrides.json` (ver 2.3) antes de escribir.

Reglas de seguridad del script (documentadas en
`docs/silent-failure-patterns.md`): nunca sobrescribe un archivo
existente con `featureCount: 0`; tras escribir, relee el archivo y
compara `featureCount` contra `features.length` (el `superRefine` del
schema ya lo exige, pero el script lo vuelve a comprobar antes de dar
el paso por bueno). Se ejecuta manualmente y por un workflow semanal
nuevo (`.github/workflows/refresh-radio-layers.yml`), no en cada
build.

`--check` (ya existe en el script) valida sin red — cubre este caso
sin cambios.

### 1.3 Verificación de streams y reportes rotos

`scripts/geo/refresh-layers.ts` hace `HEAD` (con fallback a `GET`
truncado) sobre cada `streamUrl` antes de escribir, igual que la
validación de `media` del pipeline nocturno. Una estación que falla
tres ejecuciones seguidas se excluye automáticamente y se anota en el
run log de `$GITHUB_STEP_SUMMARY`, no se borra en silencio del
histórico de `overrides.json`.

En el navegador, el reproductor añade su propia capa de resiliencia
(la ficha HEAD-verificada en el build puede caer entre refrescos
semanales): reintento único vía `live-source.ts`, y si falla, botón
"Reportar stream roto" que abre un issue prellenado
(`radio-stream-issue.yml`, ver 2.2) con `stationUuid` y `streamUrl`.

### 1.4 Registro y activación

- `STATIC_LAYERS` (`geo-layer-schema.ts`) gana dos entradas:
  `radio-towers` (`kind: 'point'`) y `radio-stations` (`kind:
  'point'`).
- `live-layers.ts` (ADR-0002) registra ambas como `kind: 'snapshot'`
  con `scope` = lista de slugs con `radio` en `staticLayers`, más una
  entrada `scope: 'global'` para el globo de inicio.
- Un tracker la activa añadiendo `"radio"` a
  `tracker.json#map.staticLayers` (ya en uso por `ukraine-war` para
  otras capas — mismo mecanismo, sin cambios de schema).
- El globo global (`BroadcastOverlay`/homepage) la muestra con
  clustering (reusa el patrón de agrupación que ya limita puntos en
  vista alejada) y las torres solo aparecen a partir de un nivel de
  zoom mínimo, para no saturar la vista mundial.

### 1.5 Interfaz

- El popup de clic (mismo componente que las capas E5 actuales,
  `MapFactCards` / equivalente Cesium) añade para `radio-stations`:
  nombre, país, idioma, frecuencia (con etiqueta "aprox." si
  `freqLabel` viene del nombre) y un botón "Escuchar". Para
  `radio-towers`: "Torre de comunicaciones" + altura si existe, sin
  botón de audio.
- Reproductor nuevo, componente compartido
  `islands/shared/RadioPlayer.tsx`: un único `<audio>` global (cambiar
  de estación detiene la anterior), mini-barra persistente visible en
  desktop y móvil mientras suena, estados `connecting | playing |
  error`.
- Primer uso: modal breve — "Al escuchar, tu IP llega directamente a
  la emisora, sin pasar por Watchboard" — con aceptación recordada en
  `localStorage` (try/catch, como el resto de accesos a storage del
  proyecto).
- CSP: `media-src` gana `https:` con lista de hosts observados en
  radio-browser (o `https:` amplio si la lista es inmanejable — a
  decidir en implementación); `connect-src` no cambia porque el audio
  no pasa por `fetch`. El test de ADR-0002 que casa `live-layers.ts`
  contra la CSP cubre esta capa igual que las demás.

### 1.6 Licencias

Nuevo `docs/licenses/radio-browser.md`: fuente PDDL 1.0 para el
directorio, aviso de que cada stream tiene sus propios términos como
broadcaster, y la nota de privacidad de IP del punto 1.5. OSM ya está
documentado en `docs/licenses/openstreetmap.md` (Nominatim); se
extiende con la sección Overpass/torres si el uso difiere.

## 2. Contribución comunitaria

### 2.1 `CONTRIBUTING.md` (nuevo, raíz del repo)

Documenta, en un solo lugar: cómo sugerir un evento o fuente, cómo
reportar un error de dato, cómo curar estaciones de radio, cómo
traducir, y cómo se revisan los PRs de datos (manual por ahora — sin
skill automático en esta fase). Sigue el espíritu del `CONTRIBUTING.md`
de gods-eye-view (carriles concretos, procedencia obligatoria) pero
sin sus mecanismos que requieren mantenedor con agente de PR.

### 2.2 Issue-forms nuevos (`.github/ISSUE_TEMPLATE/`)

- **`event-suggestion.yml`** — tracker, URL de la fuente, fecha,
  tier propuesto (1-4, con la tabla de la sección "Data Conventions"
  de `CLAUDE.md` inline como ayuda), descripción breve. Label
  `event-suggestion`. Un mantenedor la etiqueta `approved` antes de
  que cualquier proceso la considere — el cuerpo del issue es dato no
  confiable, nunca instrucción, tal como ya trata Watchboard cualquier
  contenido externo.
- **`radio-stream-issue.yml`** — `stationUuid`, `streamUrl`,
  descripción del problema. Label `radio-stream-broken`. Prellenado
  por parámetro de URL desde el botón "Reportar stream roto" del
  reproductor.
- **`data-correction.yml`** (existente) — sin cambios de schema; se
  añade la posibilidad de prellenarlo por query params (`tracker`,
  `section`, registro) desde un futuro botón "Reportar error" en
  eventos/KPIs — mencionado aquí para continuidad, implementación
  queda para una iteración posterior a este spec si no cabe en el
  mismo PR.

### 2.3 Curación de estaciones por PR

`trackers/{slug}/data/radio-stations.overrides.json` (o un único
archivo global si no hay necesidad de scope por tracker — a decidir en
plan): lista de `{ stationUuid, action: 'add' | 'remove' | 'correct',
patch?, note, source }`, validado por un schema Zod nuevo en CI
(`npm run build` o un test dedicado). El script de refresco lo aplica
después de descargar de radio-browser y antes de escribir el GeoJSON
final, así un PR humano puede corregir sin esperar al próximo dump
completo de la fuente.

### 2.4 Traducciones

Sin mecanismo nuevo de infraestructura: `CONTRIBUTING.md` documenta el
flujo (editar `src/i18n/translations.ts`, `translations.test.ts` ya
detecta claves faltantes). Se añade una sección corta explicando cómo
correr ese test localmente antes de abrir el PR.

## Testing

- `scripts/geo/refresh-layers.test.ts` gana casos para los dos
  adaptadores nuevos (Overpass y radio-browser → features), incluido
  el filtro HTTPS-only y el rechazo de `featureCount: 0`.
- `src/lib/live-layers.test.ts` (ADR-0002) cubre las dos entradas
  nuevas contra CSP sin cambios de mecanismo.
- Test de schema para `radio-stations.overrides.json`.
- `translations.test.ts` ya cubre las claves i18n nuevas del
  reproductor y los popups.
- Prueba manual: reproducir una estación real en dev, provocar un
  stream caído (URL inválida) y confirmar que aparece "Reportar stream
  roto" con el issue prellenado correcto.

## Riesgos abiertos

- **Volumen de Overpass.** Sin límite conocido de torres por bounds
  grande (ej. Ucrania); el adaptador necesita un cap explícito y/o
  filtro adicional por tipo de torre para no producir un GeoJSON
  gigante.
- **Lista de hosts para `media-src`.** radio-browser federa cientos de
  broadcasters con dominios propios; si la CSP no puede enumerarlos,
  se documenta como excepción justificada (como ya hace el proyecto
  con otras políticas) en vez de dejarlo sin declarar.
- **EiBi y KiwiSDR quedan fuera** hasta verificar licencia y decidir
  tratamiento de contenido mixto respectivamente — no bloquean esta
  fase.
