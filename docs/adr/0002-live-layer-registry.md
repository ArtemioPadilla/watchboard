# ADR-0002: Un registro declarativo describe cada capa en vivo o instantánea

**Estado:** Aceptado
**Fecha:** 2026-09-07
**Autores:** Watchboard (plan de adopción OSIRIS, épica E0/E2/E5)

## Contexto

El globo Cesium y el mapa Leaflet dibujan nueve capas "externas". Cinco
de ellas no hacen red: `useNoFlyZones`, `useGpsJamming`,
`useInternetBlackout` y la grilla de clima son arrays literales con
`startDate: '2026-02-28'` específicos del tracker de Irán, duplicados
entre `src/components/islands/CesiumGlobe/*.ts` y
`src/components/islands/MapOverlayData.ts`. Las cuatro que sí hacen red
(OpenSky, USGS, Celestrak, Open-Meteo, más el WebSocket de AIS) tienen
cada una su propia URL, su propia cadencia y su propio manejo de error,
y ninguna declara licencia ni atribución en un lugar consultable.

Consecuencias visibles hoy:

- Los toggles muestran una instantánea de febrero de 2026 con el mismo
  aspecto que un feed en vivo.
- Añadir una fuente nueva exige recordar actualizar el `connect-src` en
  dos sitios (`src/layouts/BaseLayout.astro` y `public/_headers`); si se
  olvida, la capa muere en producción sin error visible.
- No hay lugar desde el que generar una página de fuentes ni un chip de
  estado por capa.

OSIRIS resuelve parte de esto con un `LayerPanel` que oculta capas cuya
llave no está configurada (probe de capacidades) y con comentarios de
licencia por ruta. No tiene registro central.

## Decisión

1. `src/lib/live-layers.ts` exporta `LiveLayerSpecSchema` (Zod) y
   `LIVE_LAYERS`, un array validado en test con una entrada por capa.
2. Contrato de `LiveLayerSpec`:
   - `id`, `label` (clave i18n), `renderer` (`cesium | leaflet | both | globe-home`).
   - `kind: 'feed'` obliga `url` (o `urlTemplate`), `ttlMs`, `cors: true | 'proxy'`.
   - `kind: 'snapshot'` obliga `snapshotDate` y `scope` (slugs de tracker
     donde aplica) y prohíbe `url` de red.
   - `attribution` con `source`, `license`, `url` opcional, `requiresKey` opcional.
3. Un test (`src/lib/live-layers.test.ts`) comprueba que el host de cada
   `url` de un feed está permitido por el `connect-src` de
   `BaseLayout.astro` y de `public/_headers`. Añadir una fuente sin
   actualizar CSP rompe CI.
4. Los toggles, el chip de estado, la página de fuentes y la caché de
   fuentes (`live-source.ts`, épica E2) leen el registro; no se añaden
   capas fuera de él.

## Consecuencias

- Una instantánea se muestra siempre con su fecha y nunca en verde.
- Migrar un hook al registro es incremental: primero se registra,
  luego se reescribe sobre `live-source.ts` (E2), luego se consolidan
  los datos duplicados (E2.H5).
- Un tracker puede restringir capas por `scope`; las capas de Irán
  dejan de aparecer en trackers de otras regiones.
- La ubicación del parser de CSP (`scripts/lib/csp-hosts.ts`) se
  comparte con `scripts/csp-hashes.ts`.

## Alternativas consideradas

- **Declarar las capas en cada `tracker.json`.** Duplica atribución y
  licencia 125 veces; el registro global con `scope` cubre el caso.
- **Probe en runtime como OSIRIS.** Útil para llaves (AIS), no para
  licencias ni fechas de instantánea. Se conserva como campo
  `requiresKey`.
- **Registro solo en documentación.** No se puede testear contra CSP.

## Referencias

- `docs/competitive-analysis-osiris.md`, lecciones 1, 2 y 12.
- `docs/superpowers/plans/2026-09-07-osiris-adoption-program.md`, E0.H3, E2, E5.
