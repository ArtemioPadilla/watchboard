# ADR-0001: El estado de vista compartible vive en cada isla, no en un store global

**Estado:** Aceptado
**Fecha:** 2026-09-07
**Autores:** Watchboard (plan de adopción OSIRIS, épica E1)

## Contexto

`BACKLOG.md` lista BL-003 "Shareable deep links" con esfuerzo M-H y la
nota "depende de BL-001" (búsqueda cross-tracker con nanostores, que
"necesita ADR antes de codificar"). La dependencia nace de una lectura
razonable: si varias islas React deben coordinarse, hace falta un store
compartido.

La lectura del código muestra que el estado que una URL compartible
tiene que capturar ya es local a una sola isla en cada página:

- Globo: la cámara vive en `useCesiumCamera.ts` (imperativa, sobre
  `viewer.camera`), los toggles de capa en un `useState` en
  `CesiumGlobe.tsx` (bloque de estado de vista, alrededor de las líneas
  119-166), la fecha del scrubber en `currentDate` de la misma isla.
- Mapa 2D: `IntelMap.tsx` mantiene sus ocho booleanos de capa (líneas
  66-75) y el centro/zoom los tiene `LeafletMap`.
- Homepage: `CommandCenter.tsx` ya escribe `#geo` / `#domain` con
  `history.replaceState` (líneas 196-198) y los lee en el inicializador
  de `viewMode` (145-150). Es el único escritor de URL del sitio.

Ninguna de las tres páginas necesita que otra isla conozca ese estado.
La búsqueda cross-tracker (BL-001) sí necesitará estado compartido, pero
es un problema distinto.

OSIRIS (`simplifaisoul/osiris`) ilustra el fallo a evitar: su
`SharePanel` genera `lat/lon/zoom/layers` y `page.tsx` solo lee
`layers`, así que todo enlace compartido pierde la ubicación.

## Decisión

1. El estado de vista compartible se codifica con una librería pura
   `src/lib/view-state.ts` (`encodeViewState` / `decodeViewState`) y
   cada isla lee la URL al montar y la escribe con `history.replaceState`
   (nunca `pushState`) con debounce de 500 ms.
2. Parámetros: `lat`, `lon`, `alt` (Cesium) o `zoom` (Leaflet),
   `heading`, `pitch`, `layers` (lista separada por comas validada
   contra el registro de capas), `event` (slug de `event-slug.ts`),
   `date` (ISO), `tracker` (homepage).
3. No se introduce nanostores ni ningún store global para esto. Si
   BL-001 lo introduce después, `view-state.ts` sigue siendo la única
   fuente de formato de URL.
4. El criterio de aceptación obligatorio es un test de ida y vuelta:
   toda clave que se escribe se lee.

## Consecuencias

- BL-003 baja de M-H a S y deja de depender de BL-001.
- Cada isla gana un efecto de sincronización con la URL; el formato es
  común, la lógica de aplicar el estado es propia de cada isla.
- Los parámetros desconocidos o inválidos se ignoran sin lanzar; la
  página nunca falla por una URL rota.
- Los hashes de navegación de secciones (`#map`, `#timeline`) se
  preservan al escribir la query.

## Alternativas consideradas

- **nanostores compartido entre islas.** Correcto para BL-001, pero
  añade una dependencia y un patrón nuevo para un problema que hoy es
  local. Se pospone hasta que la búsqueda lo exija.
- **Estado en `localStorage`.** No es compartible entre personas, que
  es el objetivo.
- **`pushState` por movimiento de cámara.** Llena el historial y rompe
  el botón atrás. Descartado.

## Referencias

- `docs/competitive-analysis-osiris.md`, Gap 2.
- `docs/superpowers/plans/2026-09-07-osiris-adoption-program.md`, épica E1.
