# Third-Party Notices

Watchboard is an independent project. It is not derived from, and does not
incorporate code from, any other OSINT dashboard. The 3D globe is built on
CesiumJS and the 2D map on Leaflet — both widely used libraries — and any
resemblance to other dashboards using the same libraries follows from that
shared foundation rather than from shared code.

The project itself is MIT licensed (see `LICENSE`). This file records the
third-party components it depends on and their terms.

## Runtime dependencies

License fields read from the installed packages, not from memory.

| Package | License |
| --- | --- |
| `astro`, `@astrojs/react`, `@astrojs/rss`, `@astrojs/sitemap` | MIT |
| `react`, `react-dom`, `@types/react`, `@types/react-dom` | MIT |
| `cesium` | Apache-2.0 |
| `resium` | MIT |
| `globe.gl` | MIT |
| `leaflet` | BSD-2-Clause |
| `react-leaflet` | **Hippocratic-2.1** |
| `satellite.js` | MIT |
| `zod` | MIT |
| `sharp` | Apache-2.0 |
| `satori` | MPL-2.0 |
| `@resvg/resvg-js` | MPL-2.0 |

Two notes for anyone reusing this project:

- **`react-leaflet` is Hippocratic-2.1**, an ethical-source licence that is not
  OSI-approved and places conditions on use. It is more restrictive than the
  MIT terms covering Watchboard's own code, and those conditions travel with
  the dependency.
- **`satori` and `@resvg/resvg-js` are MPL-2.0**, a file-level copyleft. They
  are used only at build time to render social stat cards; no MPL code is
  redistributed in the published site.

## Fonts

Bundled under `public/fonts/` and served from `/fonts/`:

- JetBrains Mono
- DM Sans
- Cormorant Garamond

All three are published under the SIL Open Font License 1.1. **The OFL requires
that the licence text accompany the font files, and it is not currently
bundled.** Copies of `OFL.txt` should be added alongside them. Flagged rather
than silently fixed, because the correct text must come from each font's own
upstream release rather than be reconstructed.

## Map and imagery services

- **Basemap tiles** — OpenStreetMap data under ODbL, served via CARTO. Attributed
  in the map UI (`src/components/islands/LeafletMap.tsx`).
- **Cesium World Terrain / Ion assets** — used under Cesium Ion's terms; Cesium's
  own attribution widget is retained.
- **Event media** — thumbnails and article links are fetched from the publishers'
  own `og:image` metadata and attributed to the source outlet at every display
  surface. No media is rehosted.

## Data

Tracker data is compiled from public reporting, with a source tier and citation
recorded per data point. Tier 1-2 sources (governments, UN bodies, Reuters, AP,
BBC) are linked rather than reproduced.
