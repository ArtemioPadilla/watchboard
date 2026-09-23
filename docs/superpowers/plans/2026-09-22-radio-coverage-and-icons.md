# Radio Coverage Expansion + Custom Icons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Extend the radio layer (shipped in PR #287) from Ukraine-only to 22 conflict trackers plus a worldwide homepage layer, and replace the generic colored dots with custom SVG icons.

**Architecture:** Same offline static-GeoJSON pattern as today (`scripts/geo/refresh-layers.ts` → `public/geo/layers/*.geojson` with `_provenance`, registered in `STATIC_LAYERS`). Towers switch from bounding-box Overpass queries to per-country area queries driven by each tracker's `map.radioCountryCodes`. A new `radio-stations-global` layer feeds the homepage. Renderers clip radio layers to the tracker's `map.bounds` and draw SVG icons.

**Tech Stack:** Astro 5, React islands, Leaflet (`react-leaflet`), CesiumJS, globe.gl, Zod, Vitest, `tsx`.

**Spec:** No separate spec file — the approved design lives in the conversation that produced this plan and is restated in Global Constraints below. Rulings are against these constraints.

## Global Constraints

- Radio towers are fetched **per country** with Overpass `area["ISO3166-1"="<CC>"][admin_level=2]`, filter `node["man_made"~"^(tower|mast)$"]["communication:radio"]["communication:radio"!~"^no$"]`, `[timeout:120]`, `User-Agent: Watchboard/geo-refresh (https://watchboard.dev)`.
- **Per-country cap of 800 towers**: named towers first, then by `heightM` descending, then by `osmId` ascending (deterministic).
- Every tower feature gains `properties.countryCode` (the ISO code of the area query that produced it). A tower returned by two country queries is kept once (first code wins).
- Space Overpass requests **at least 5 s apart**. On HTTP 429/504 retry once after 30 s. If any country ultimately fails, the whole `radio-towers` adapter throws — the existing `main()` guard then leaves the previous file untouched (never write a partial file).
- New layer id **`radio-stations-global`**: radio-browser `https://all.api.radio-browser.info/json/stations/search?has_geo_info=true&is_https=true&hidebroken=true&order=votes&reverse=true&limit=500`, filtered with the existing `radioBrowserToFeatures()`, then `applyRadioOverrides()`. Registered in `STATIC_LAYERS` (color `#ff66cc`, kind `point`). The homepage reads this file (keeps its 300-pin cap); tracker pages keep using `radio-stations`.
- The 22 trackers and their codes are fixed (Task 2 table). Excluded on purpose (no single theater): `nato-us-tensions`, `shield-of-the-americas`, `mecca-defense-pact`, `ice-history`.
- Renderers clip only `radio-towers` and `radio-stations` to the tracker's `map.bounds` padded by 2° on every side. Other static layers (nuclear plants, cables, chokepoints) are unchanged.
- Icon = **Option A** (badge): dark disc (`#0d1117`, 0.9 opacity) with a 1.6-unit colored ring; station glyph = broadcast symbol in `#ff66cc`; tower glyph = lattice mast with signal arcs in `#66ffcc`. Exact SVG is in Task 3. Map size 22 px. Homepage station pins get a pulse ring, disabled under `prefers-reduced-motion`.
- A tracker may declare at most 3 `map.staticLayers` (enforced by `tests/tracker-static-layers.test.ts`).
- No new secrets, keys, or paid services.

---

### Task 1: Pipeline — per-country towers, global stations layer, workflow timeout

**Files:**
- Modify: `scripts/geo/refresh-layers.ts`
- Modify: `scripts/geo/refresh-layers.test.ts`
- Modify: `src/lib/geo-layer-schema.ts` (register `radio-stations-global`)
- Modify: `.github/workflows/refresh-radio-layers.yml` (add a `--layer radio-stations-global` step; raise `timeout-minutes` to 30 — 34 spaced Overpass queries take 6–12 min)
- Modify: `docs/licenses/radio-browser.md`, `docs/licenses/README.md` (mention the global layer)

**Interfaces:**
- Produces: `export function capTowersPerCountry(features: GeoLayer['features'], cap: number): GeoLayer['features']` — pure; groups by `properties.countryCode`, applies the ordering rule from Global Constraints, keeps at most `cap` per country.
- Produces: `overpassTowersToFeatures(elements: any[], countryCode?: string)` — existing function gains an optional second arg that sets `properties.countryCode`.
- Produces: `STATIC_LAYERS` entry `{ id: 'radio-stations-global', label: 'layers.radioStationsGlobal', color: '#ff66cc', kind: 'point' }` plus i18n key `layers.radioStationsGlobal` in all four locales (en "Radio stations (world)", es "Emisoras de radio (mundo)", fr "Stations de radio (monde)", pt "Estações de rádio (mundo)").

Steps (TDD):
- [ ] Tests first in `refresh-layers.test.ts`: (a) `overpassTowersToFeatures(els, 'IR')` sets `countryCode: 'IR'`; (b) `capTowersPerCountry` with 3 IR + 2 UA features and cap 2 keeps named-first then tallest per country and never mixes countries; (c) ties broken by `osmId` ascending. Run, confirm fail.
- [ ] Implement. `radioTowers.run()` iterates the de-duplicated union of `map.radioCountryCodes` from every tracker whose `map.staticLayers` includes `radio-towers`, one area query per code, 5 s spacing, one 30 s retry on 429/504, throws if a code still fails; dedupes by osm id (first code wins); applies `capTowersPerCountry(…, 800)`. `_provenance.transform` names the country list and the cap.
- [ ] Add the `radioStationsGlobal` adapter per Global Constraints; `_provenance.transform` says "top 500 by votes worldwide, HTTPS MP3/AAC with geo coordinates".
- [ ] Do NOT regenerate `radio-towers`/`radio-stations` data in this task (the 22 trackers aren't configured yet — Task 2 does that). DO generate `public/geo/layers/radio-stations-global.geojson` (`npx tsx scripts/geo/refresh-layers.ts --layer radio-stations-global`) and commit it; the `STATIC_LAYERS` existence test requires it.
- [ ] `npx vitest run scripts/geo/refresh-layers.test.ts src/i18n/translations.test.ts` green; YAML valid. Commit.

### Task 2: Enable 22 trackers and regenerate data

**Files:**
- Modify: the 22 `trackers/<slug>/tracker.json` below (add `"radio-towers", "radio-stations"` to `map.staticLayers`, creating the array if absent; set `map.radioCountryCodes`)
- Regenerate + commit: `public/geo/layers/radio-towers.geojson`, `public/geo/layers/radio-stations.geojson`

| Tracker | radioCountryCodes |
|---|---|
| afghanistan-pakistan-war | AF, PK |
| drc-conflict | CD, RW |
| ecuador-narco-conflict | EC |
| ethiopia-conflict | ET, ER |
| gaza-war | PS, IL |
| india-pakistan-conflict | IN, PK |
| iran-conflict | IR, IL, IQ |
| israel-palestine | IL, PS |
| libya-conflict | LY |
| mencho-cjng | MX |
| moldova-transnistria | MD |
| myanmar-civil-war | MM |
| nato-airspace-incursions | PL, RO, EE, LV, LT |
| sahel-insurgency | ML, BF, NE |
| sinaloa-fragmentation | MX |
| somalia-conflict | SO |
| southeast-asia-escalation | PH, VN |
| sudan-conflict | SD, SS |
| taiwan-conflict | TW |
| thailand-cambodia-border-war | TH, KH |
| ukraine-war | UA (already configured — leave as is) |
| yemen-conflict | YE |

Steps:
- [ ] Edit the 21 tracker.json files (ukraine-war is already done). Preserve existing formatting (2-space JSON, trailing newline).
- [ ] `npx vitest run tests/tracker-static-layers.test.ts` green (no tracker exceeds 3).
- [ ] Regenerate: `npx tsx scripts/geo/refresh-layers.ts --layer radio-stations` then `--layer radio-towers` (the latter takes several minutes; Overpass may throttle — the adapter's retry handles one 429 per country; if it still fails, wait a few minutes and rerun rather than hand-editing data). Report feature counts per country from each file.
- [ ] `npx vitest run scripts/geo/refresh-layers.test.ts` green. `npm run build` passes (tracker.json changes go through Zod). Commit.

### Task 3: Renderers — SVG icons, bounds clipping, homepage global layer

**Files:**
- Create: `src/lib/radio-icons.ts`
- Create: `src/lib/radio-icons.test.ts`
- Modify: `src/lib/geo-layer-schema.ts` (optional `clipToBounds?: boolean` on `StaticLayerMeta`; `true` for `radio-towers`, `radio-stations`)
- Modify: `src/components/islands/GeoLayersLeaflet.tsx` (radio layers use `L.divIcon` with the SVG; clip by bounds)
- Modify: `src/components/islands/IntelMap.tsx` (pass `mapBounds` down to `GeoLayersLeaflet` if not already available there)
- Modify: `src/components/islands/CesiumGlobe/useGeoLayers.ts` + `CesiumGlobe.tsx` (radio layers render as `billboard` with the SVG data URI instead of `point`; clip by bounds)
- Modify: `src/components/islands/CommandCenter/GlobePanel.tsx` (radio pin uses the station SVG; pulse ring)
- Modify: `src/components/islands/CommandCenter/CommandCenter.tsx` (fetch `radio-stations-global.geojson` instead of `radio-stations.geojson`)
- Modify: `src/styles/global.css` (pulse keyframes + `prefers-reduced-motion`)

**Interfaces:**
- Produces in `src/lib/radio-icons.ts`: `export const RADIO_STATION_SVG: string`, `export const RADIO_TOWER_SVG: string` (full `<svg xmlns=… viewBox="0 0 32 32">…</svg>` strings), `export function svgDataUri(svg: string): string` (`data:image/svg+xml;charset=utf-8,` + `encodeURIComponent`), `export function radioIconSvgFor(layerId: string): string | null` (station SVG for `radio-stations`/`radio-stations-global`, tower SVG for `radio-towers`, else null), `export function withinBounds(lon: number, lat: number, b: {lonMin,lonMax,latMin,latMax}, padDeg = 2): boolean`.

Exact SVGs (Option A — approved by the user from a rendered preview):

```ts
export const RADIO_STATION_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14.5" fill="#0d1117" fill-opacity=".9" stroke="#ff66cc" stroke-width="1.6"/><g fill="none" stroke="#ff66cc" stroke-width="1.8" stroke-linecap="round"><path d="M12.2 12.2a5.4 5.4 0 0 0 0 7.6"/><path d="M19.8 12.2a5.4 5.4 0 0 1 0 7.6"/><path d="M9.2 9.2a9.6 9.6 0 0 0 0 13.6" stroke-opacity=".75"/><path d="M22.8 9.2a9.6 9.6 0 0 1 0 13.6" stroke-opacity=".75"/></g><circle cx="16" cy="16" r="2.4" fill="#ff66cc"/></svg>`;

export const RADIO_TOWER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14.5" fill="#0d1117" fill-opacity=".9" stroke="#66ffcc" stroke-width="1.6"/><g fill="none" stroke="#66ffcc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 11.5 11.3 25M16 11.5 20.7 25"/><path d="M13.2 19.5h5.6M12.3 22.3h7.4M13.2 19.5l6.5 2.8M18.8 19.5l-6.5 2.8"/><path d="M12.9 16.8h6.2"/><path d="M12.6 7.6a4.8 4.8 0 0 0 0 5.6" stroke-opacity=".8"/><path d="M19.4 7.6a4.8 4.8 0 0 1 0 5.6" stroke-opacity=".8"/></g><circle cx="16" cy="10.4" r="1.7" fill="#66ffcc"/></svg>`;
```

Steps:
- [ ] Tests first in `radio-icons.test.ts`: `radioIconSvgFor` mapping (incl. null for `nuclear-plants`); `svgDataUri` round-trips (decodeURIComponent of the payload equals the SVG); `withinBounds` inside/outside/padding edge cases. Run, confirm fail; implement; pass.
- [ ] Leaflet: in `GeoLayersLeaflet.tsx`'s static layer `pointToLayer`, when `radioIconSvgFor(id)` is non-null return `L.marker(latlng, { icon: L.divIcon({ html: svg, className: 'radio-map-icon', iconSize: [22, 22], iconAnchor: [11, 11] }), pane })` instead of the circle marker; keep click + tooltip behaviour. Clip radio layers: filter `layer.features` with `withinBounds` (via a `bounds` prop) before rendering when `staticLayerMeta(id)?.clipToBounds`.
- [ ] Cesium: in `useStaticGeoLayer`, for radio layer ids create `billboard: { image: svgDataUri(svg), width: 22, height: 22, verticalOrigin: CENTER, scaleByDistance: new NearFarScalar(2e5, 1.1, 8e6, 0.55) }` instead of `point`; entity `description` stays `JSON.stringify(properties)` (click routing in `CesiumGlobe.tsx` depends on it). Clip with `withinBounds` using the tracker's `mapBounds` (thread it in as a hook arg).
- [ ] Homepage: `CommandCenter.tsx` fetches `geo/layers/radio-stations-global.geojson`. `GlobePanel.tsx` radio pin element's innerHTML = `RADIO_STATION_SVG` at 20 px inside a `.cc-radio-pin` wrapper with class `pulse`; CSS pulse ring in `global.css` (`@keyframes` ring scale 1→2.3, opacity .8→0, 2.2 s ease-out infinite; `@media (prefers-reduced-motion: reduce)` disables it). Keep `data-testid="radio-pin"`, aria-label ref, click handler.
- [ ] `npx vitest run` green; `npm run build` passes; Playwright (webapp-testing) spot-check is done by the reviewer. Commit.
