# Radio Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a provenance-stamped, opt-in radio layer — communication towers (OSM) and internet-stream radio stations (radio-browser.info) — clickable on the tracker globe/map and on the homepage globe, with an in-browser player.

**Architecture:** Two new static GeoJSON layers (`radio-towers`, `radio-stations`) generated offline by `scripts/geo/refresh-layers.ts` into `public/geo/layers/`, following the exact pattern already used for `nuclear-plants`/`submarine-cables`/`maritime-chokepoints` (ADR-0002, `docs/adr/0002-live-layer-registry.md`). No new backend, no runtime queries to OSM or radio-browser from the browser. A tracker opts in via `tracker.json#map.staticLayers`; the homepage globe (a separate `globe.gl`-based component, not Cesium) gets a capped, curated subset as DOM pins. Clicking a station opens a shared card with a native `<audio>` player; clicking a tower shows its radio band. Community members can correct/exclude stations via a PR to a checked-in overrides file.

**Tech Stack:** Astro 5, React islands, CesiumJS (tracker globe), Leaflet (tracker 2D map), `globe.gl` (homepage globe), Zod, Vitest, `tsx` scripts.

**Spec:** `docs/superpowers/specs/2026-09-21-radio-layer-and-community-design.md`

## Global Constraints

- Static layers are generated offline and committed; nothing fetches OSM or radio-browser from the browser (ADR-0002).
- Every `.geojson` under `public/geo/layers/` must validate against `GeoLayerSchema` and carry `_provenance` (source, url, license, attribution, retrievedAt, featureCount matching `features.length`).
- A tracker's Cesium globe and 2D map render at most 3 `staticLayers` entries today (`CesiumGlobe.tsx` and `IntelMap.tsx` both hard-code `static0/static1/static2`); `radio-towers` + `radio-stations` together must not push any tracker past that ceiling. Today only `ukraine-war` uses `staticLayers` (1 entry: `nuclear-plants`), so adding 2 more fits exactly. Do not raise the ceiling in this plan — flag it as a follow-up if a future tracker needs a 4th.
- A refresh script adapter must never overwrite an existing `.geojson` with zero features (existing rule in `refresh-layers.ts`, keep it for the new adapters too).
- Every external host a *feed* layer talks to must be in `connect-src` of both `src/layouts/BaseLayout.astro` and `public/_headers` (enforced by `src/lib/live-layers.test.ts`). Static/snapshot layers are same-origin and exempt — radio audio playback is a new case (`<audio>` element, not `fetch`) and needs `media-src`, not `connect-src`.
- No new secrets, API keys, or paid services.
- Audio exposes the listener's IP to the broadcaster directly (no proxy) — every play action must be preceded by a one-time, dismissible privacy notice.
- Deliberate scope cuts versus `docs/superpowers/specs/2026-09-21-radio-layer-and-community-design.md`, called out here because they change what the spec promised:
  - **No persistent mini-bar across navigation.** The spec's §1.5 asked for playback to survive navigating between map/globe/home. This plan keeps it simple: audio stops when the card closes or a different feature is selected, one `<audio>` per `RadioStationCard` instance. A persistent player is a reasonable follow-up once there's evidence people want to keep listening while navigating.
  - **No 3-strikes exclusion history.** The spec's §1.3 asked for stations to be auto-excluded after three consecutive failed runs, tracked across runs. Because the pipeline fully regenerates both files from upstream on every run (not incrementally), radio-browser's own `lastcheckok` flag already re-derives "is this currently up" every time — a station that's down this week simply won't be in this week's file, and reappears on its own once it's back. A persistent failure-streak file would be redundant given that.
  - **No server-side HEAD verification in the refresh script.** The spec's §1.3 asked the script to HEAD every `streamUrl` before writing. radio-browser.info already runs this exact check roughly every 2 hours and exposes it as `lastcheckok`; Task 2 filters on that field instead of re-deriving it from potentially thousands of HTTP requests per run. The client-side retry (Task 6) is the resilience layer that's actually new here — it catches drift between the weekly file and a stream that just went down.

---

## File Structure

- `src/lib/geo-layer-schema.ts` — **modify**: register `radio-towers`, `radio-stations` in `STATIC_LAYERS`.
- `src/lib/tracker-config.ts` — **modify**: add `map.radioCountryCodes?: string[]` to `MapConfigSchema`.
- `scripts/geo/refresh-layers.ts` — **modify**: two new pure feature-mapping functions + two new adapters + overrides application.
- `src/lib/radio-overrides.ts` — **create**: Zod schema + loader for the community overrides file (mirrors `src/lib/snapshots.ts`).
- `src/data/radio-stations-overrides.json` — **create**: starts as an empty overrides list; PR target for community curation.
- `src/lib/radio-station.ts` — **create**: pure helpers shared by every surface — frequency-label extraction, privacy-consent localStorage helpers, GitHub issue prefill URL builder.
- `src/components/islands/shared/RadioStationCard.tsx` — **create**: the click-to-listen card (info + player + privacy notice + report-broken link), used by the Leaflet map, the Cesium globe and the homepage globe.
- `src/components/islands/GeoLayersLeaflet.tsx` — **modify**: click (not just hover) on `radio-stations`/`radio-towers` features.
- `src/components/islands/IntelMap.tsx` — **modify**: selection state + render `RadioStationCard`.
- `src/components/islands/CesiumGlobe/CesiumGlobe.tsx` — **modify**: route radio entity clicks to `RadioStationCard` instead of the generic fact-card carousel.
- `src/components/islands/CommandCenter/GlobePanel.tsx` — **modify**: DOM-pin layer for radio stations (reuses the existing `pendingCandidates` html-elements mechanism).
- `src/components/islands/CommandCenter/CommandCenter.tsx` — **modify**: fetch the global station subset, thread selection state, render `RadioStationCard`.
- `src/layouts/BaseLayout.astro` — **modify**: add `media-src` to the CSP.
- `public/_headers` — **modify**: same.
- `src/i18n/translations.ts` — **modify**: new keys in `en`/`es`/`fr`/`pt`.
- `docs/licenses/openstreetmap.md` — **modify**: add the Overpass towers section.
- `docs/licenses/radio-browser.md` — **create**.
- `docs/licenses/README.md` — **modify**: two new rows.
- `.github/ISSUE_TEMPLATE/radio-stream-issue.yml` — **create**.
- `.github/workflows/refresh-radio-layers.yml` — **create**: weekly regeneration.
- `trackers/ukraine-war/tracker.json` — **modify**: opt in (`"radio"` layers + `radioCountryCodes: ["UA"]`).

---

### Task 1: `radio-towers` static layer — schema + Overpass adapter

**Files:**
- Modify: `src/lib/geo-layer-schema.ts`
- Modify: `scripts/geo/refresh-layers.ts`
- Modify: `scripts/geo/refresh-layers.test.ts`
- Modify: `docs/licenses/openstreetmap.md`
- Modify: `docs/licenses/README.md`
- Modify: `trackers/ukraine-war/tracker.json` (temporary — `"radio-towers"` only; Task 2 extends it)
- Create (generated, committed): `public/geo/layers/radio-towers.geojson`

**Interfaces:**
- Produces: `STATIC_LAYERS` entry `{ id: 'radio-towers', label: 'layers.radioTowers', color: '#66ffcc', kind: 'point' }`.
- Produces: `export function overpassTowersToFeatures(elements: any[]): GeoLayer['features']` in `scripts/geo/refresh-layers.ts` — pure, importable by tests.
- Produces: `public/geo/layers/radio-towers.geojson`, a real file validated by `GeoLayerSchema`, with `properties: { osmId: string, name: string | null, heightM: number | null, radioBand: string }`.

- [ ] **Step 1: Add the `radio-towers` entry to `STATIC_LAYERS`**

In `src/lib/geo-layer-schema.ts`, edit the array:

```ts
export const STATIC_LAYERS: StaticLayerMeta[] = [
  { id: 'nuclear-plants', label: 'layers.nuclearPlants', color: '#ffcc00', kind: 'point' },
  { id: 'submarine-cables', label: 'layers.submarineCables', color: '#4fc3f7', kind: 'line' },
  { id: 'maritime-chokepoints', label: 'layers.chokepoints', color: '#ff8a65', kind: 'point' },
  { id: 'radio-towers', label: 'layers.radioTowers', color: '#66ffcc', kind: 'point' },
  { id: 'radio-stations', label: 'layers.radioStations', color: '#ff66cc', kind: 'point' },
];
```

(Both new ids are added together here so Task 2 doesn't have to touch this array again.)

- [ ] **Step 2: Write the failing test for `overpassTowersToFeatures`**

Add to `scripts/geo/refresh-layers.test.ts`, inside the existing `describe('adapters (pure parsing)', ...)` block:

```ts
  it('overpassTowersToFeatures maps nodes with communication:radio, drops nodes without lat/lon, dedupes ids', () => {
    const node = (id: number, lat: number, lon: number, tags: Record<string, string>) => ({ type: 'node', id, lat, lon, tags });
    const feats = overpassTowersToFeatures([
      node(1, 47.2, 27.9, { name: 'Cetireni', height: '235', 'communication:radio': 'fm' }),
      node(1, 47.2, 27.9, { name: 'Cetireni', height: '235', 'communication:radio': 'fm' }), // duplicate id
      node(2, 50.1, 30.5, { 'communication:radio': 'am;shortwave' }), // no name
      { type: 'way', id: 3, tags: { 'communication:radio': 'fm' } }, // no lat/lon
    ]);
    expect(feats).toHaveLength(2);
    expect(feats[0]).toMatchObject({
      id: '1',
      properties: { osmId: '1', name: 'Cetireni', heightM: 235, radioBand: 'fm' },
      geometry: { type: 'Point', coordinates: [27.9, 47.2] },
    });
    expect(feats[1].properties).toMatchObject({ osmId: '2', name: null, heightM: null, radioBand: 'am;shortwave' });
  });
```

Also add the import at the top of the test file:

```ts
import { validateLayerFile, wikidataPlantsToFeatures, cableGeoToFeatures, overpassTowersToFeatures } from './refresh-layers';
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run scripts/geo/refresh-layers.test.ts`
Expected: FAIL — `overpassTowersToFeatures` is not exported.

- [ ] **Step 4: Implement `overpassTowersToFeatures` and the `radioTowers` adapter**

In `scripts/geo/refresh-layers.ts`, add after `cableGeoToFeatures`:

```ts
/** Pure: Overpass node elements tagged communication:radio → point features, deduped by id, elements without lat/lon dropped. */
export function overpassTowersToFeatures(elements: any[]): GeoLayer['features'] {
  const seen = new Set<string>();
  return elements.flatMap((el) => {
    if (el?.type !== 'node' || typeof el.lat !== 'number' || typeof el.lon !== 'number') return [];
    const id = String(el.id);
    if (seen.has(id)) return [];
    seen.add(id);
    const tags = el.tags ?? {};
    return [{
      type: 'Feature' as const,
      id,
      properties: {
        osmId: id,
        name: tags.name ?? null,
        heightM: tags.height ? Number.parseFloat(tags.height) || null : null,
        radioBand: String(tags['communication:radio'] ?? ''),
      },
      geometry: { type: 'Point' as const, coordinates: [el.lon, el.lat] },
    }];
  });
}
```

Then, near the bottom of the adapters section (after `chokepoints`), add the adapter and a small helper to gather tracker bounds:

```ts
import { loadAllTrackers } from '../../src/lib/tracker-registry';

/** Bounding boxes of every tracker that opted into the radio layer. */
function radioTrackerBounds(): { lonMin: number; lonMax: number; latMin: number; latMax: number }[] {
  return loadAllTrackers()
    .filter((t) => t.map?.staticLayers?.includes('radio-towers') && t.map?.bounds)
    .map((t) => t.map!.bounds);
}

/** Overpass: communication towers/masts (radio broadcast, not generic cell masts — communication:radio must be set) inside every radio-enabled tracker's bounds. */
const radioTowers: Adapter = {
  id: 'radio-towers',
  async run(now) {
    const boundsList = radioTrackerBounds();
    if (boundsList.length === 0) throw new Error('no tracker has "radio-towers" in map.staticLayers');
    const seen = new Map<string, any>();
    for (const b of boundsList) {
      const query = `[out:json][timeout:90];(node["man_made"~"^(tower|mast)$"]["communication:radio"](${b.latMin},${b.lonMin},${b.latMax},${b.lonMax}););out body;`;
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'User-Agent': 'Watchboard/geo-refresh (https://watchboard.dev)', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      const j = await res.json();
      for (const el of j.elements ?? []) seen.set(`${el.type}:${el.id}`, el);
    }
    const features = overpassTowersToFeatures([...seen.values()]);
    return {
      type: 'FeatureCollection',
      _provenance: {
        id: 'radio-towers', source: 'OpenStreetMap (Overpass API)', url: 'https://overpass-api.de/api/interpreter',
        license: 'ODbL 1.0', attribution: 'Radio towers: © OpenStreetMap contributors, ODbL', retrievedAt: now,
        transform: `Nodes tagged man_made=tower|mast with communication:radio set, inside the bounds of every tracker with "radio-towers" in map.staticLayers (${boundsList.length} tracker(s))`,
        featureCount: features.length,
      },
      features,
    };
  },
};
```

Register it: `const ADAPTERS: Adapter[] = [nuclearPlants, submarineCables, chokepoints, radioTowers];`

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run scripts/geo/refresh-layers.test.ts`
Expected: PASS for the new test. The `${meta.id}.geojson exists` loop test will still FAIL for `radio-towers` until Step 6 generates the file — that's expected at this point.

- [ ] **Step 6: Generate the real file**

Run: `npx tsx scripts/geo/refresh-layers.ts --layer radio-towers`

This requires `trackers/ukraine-war/tracker.json` (or any tracker) to already have `"radio-towers"` in `map.staticLayers` — if none does yet, temporarily add it to `ukraine-war/tracker.json` now (Task 7 will make this permanent and add `radio-stations` alongside it):

```json
    "staticLayers": [
      "nuclear-plants",
      "radio-towers"
    ]
```

Expected output: `[geo] wrote radio-towers: N features → .../radio-towers.geojson (~XX KB)`. If the query times out, retry — Overpass occasionally throttles; the script's `throw` on non-200 makes a failed run visible instead of silently writing nothing.

- [ ] **Step 7: Run the full geo test suite**

Run: `npx vitest run scripts/geo/refresh-layers.test.ts`
Expected: PASS, including the `radio-towers.geojson exists, validates and carries provenance` case.

- [ ] **Step 8: Document the license**

Append to `docs/licenses/openstreetmap.md`:

```markdown

## Overpass API (radio towers)

- Endpoint: `https://overpass-api.de/api/interpreter` (build-time only, `scripts/geo/refresh-layers.ts`)
- Query: nodes tagged `man_made=tower|mast` with `communication:radio` set, inside each radio-enabled tracker's `map.bounds`.
- License: ODbL, same as all OSM data.
- Attribution shown: "© OpenStreetMap contributors"
```

Edit `docs/licenses/README.md`, add a row:

```markdown
| OSM communication towers (Overpass) | ODbL 1.0 | attribution shown | `openstreetmap.md` |
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/geo-layer-schema.ts scripts/geo/refresh-layers.ts scripts/geo/refresh-layers.test.ts public/geo/layers/radio-towers.geojson docs/licenses/openstreetmap.md docs/licenses/README.md trackers/ukraine-war/tracker.json
git commit -m "feat(geo): add radio-towers static layer (OSM Overpass, communication:radio)"
```

---

### Task 2: `radio-stations` static layer — schema + radio-browser adapter

**Files:**
- Modify: `src/lib/tracker-config.ts`
- Modify: `scripts/geo/refresh-layers.ts`
- Modify: `scripts/geo/refresh-layers.test.ts`
- Create: `docs/licenses/radio-browser.md`
- Modify: `docs/licenses/README.md`
- Create (generated, committed): `public/geo/layers/radio-stations.geojson`

**Interfaces:**
- Consumes: `Adapter` type, `ADAPTERS` array, `loadAllTrackers` — from Task 1.
- Produces: `export function radioBrowserToFeatures(rows: any[]): GeoLayer['features']`.
- Produces: `public/geo/layers/radio-stations.geojson` with `properties: { stationUuid: string, name: string, country: string, countryCode: string, language: string | null, freqLabel: string | null, streamUrl: string, codec: string, votes: number }`.
- Produces (consumed by Task 5/6): every station feature's `properties.stationUuid` is how the UI layer tells a radio-station entity apart from any other static-layer entity.

- [ ] **Step 1: Add `radioCountryCodes` to the map config schema**

In `src/lib/tracker-config.ts`, edit `MapConfigSchema` (right after `staticLayers`):

```ts
  /** Static GeoJSON layers from public/geo/layers/{id}.geojson (e.g. 'submarine-cables'). */
  staticLayers: z.array(z.string().regex(/^[a-z0-9-]+$/)).optional(),
  /** ISO 3166-1 alpha-2 codes queried against radio-browser.info when this tracker opts into the 'radio-stations' layer. */
  radioCountryCodes: z.array(z.string().regex(/^[A-Z]{2}$/)).optional(),
});
```

(Replaces the closing `});` of `MapConfigSchema` — the new field goes before it.)

- [ ] **Step 2: Write the failing test for `radioBrowserToFeatures`**

Add to `scripts/geo/refresh-layers.test.ts`:

```ts
  it('radioBrowserToFeatures keeps HTTPS MP3/AAC stations with geo coordinates, drops the rest, dedupes by uuid', () => {
    const row = (uuid: string, overrides: Record<string, unknown> = {}) => ({
      stationuuid: uuid, name: `Station ${uuid}`, url_resolved: `https://stream.example/${uuid}`,
      countrycode: 'UA', country: 'Ukraine', language: 'ukrainian', votes: 10, codec: 'MP3',
      lastcheckok: 1, geo_lat: 50.1, geo_long: 30.5,
      ...overrides,
    });
    const feats = radioBrowserToFeatures([
      row('a'),
      row('a'), // duplicate uuid
      row('b', { url_resolved: 'http://stream.example/b' }), // not https
      row('c', { geo_lat: null, geo_long: null }), // no geo
      row('d', { codec: 'OGG' }), // unsupported codec
      row('e', { lastcheckok: 0 }), // marked broken
      row('f', { name: '101.5 Kiss FM' }),
    ]);
    expect(feats.map(f => f.id)).toEqual(['a', 'f']);
    expect(feats[0].properties).toMatchObject({ stationUuid: 'a', streamUrl: 'https://stream.example/a', codec: 'MP3', votes: 10, freqLabel: null });
    expect(feats[1].properties).toMatchObject({ freqLabel: '101.5 FM' });
  });
```

Add the import: `radioBrowserToFeatures` alongside `overpassTowersToFeatures` in the test file's import line.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run scripts/geo/refresh-layers.test.ts`
Expected: FAIL — `radioBrowserToFeatures` not exported.

- [ ] **Step 4: Implement `radioBrowserToFeatures` and the `radioStations` adapter**

In `scripts/geo/refresh-layers.ts`, add:

```ts
const FREQ_RE = /(\d{2,3}(?:\.\d{1,2})?)\s*(?:fm|mhz)/i;

/** Pure: radio-browser.info station rows → point features. Drops non-HTTPS streams, unsupported codecs, stations without geo coordinates or failing their last check; dedupes by stationuuid. */
export function radioBrowserToFeatures(rows: any[]): GeoLayer['features'] {
  const seen = new Set<string>();
  return rows.flatMap((r) => {
    const uuid = String(r.stationuuid ?? '');
    if (!uuid || seen.has(uuid)) return [];
    if (r.lastcheckok !== 1) return [];
    if (typeof r.geo_lat !== 'number' || typeof r.geo_long !== 'number') return [];
    const url = String(r.url_resolved ?? '');
    if (!url.startsWith('https://')) return [];
    const codec = String(r.codec ?? '').toUpperCase();
    if (codec !== 'MP3' && codec !== 'AAC') return [];
    seen.add(uuid);
    const freqMatch = FREQ_RE.exec(String(r.name ?? ''));
    return [{
      type: 'Feature' as const,
      id: uuid,
      properties: {
        stationUuid: uuid,
        name: r.name ?? uuid,
        country: r.country ?? null,
        countryCode: r.countrycode ?? null,
        language: r.language || null,
        freqLabel: freqMatch ? `${freqMatch[1]} FM` : null,
        streamUrl: url,
        codec,
        votes: typeof r.votes === 'number' ? r.votes : 0,
      },
      geometry: { type: 'Point' as const, coordinates: [r.geo_long, r.geo_lat] },
    }];
  });
}

/** Country codes every radio-enabled tracker asks radio-browser.info for. */
function radioCountryCodes(): string[] {
  const codes = new Set<string>();
  for (const t of loadAllTrackers()) {
    if (!t.map?.staticLayers?.includes('radio-stations')) continue;
    for (const c of t.map.radioCountryCodes ?? []) codes.add(c);
  }
  return [...codes];
}

const radioStations: Adapter = {
  id: 'radio-stations',
  async run(now) {
    const codes = radioCountryCodes();
    if (codes.length === 0) throw new Error('no tracker declares map.radioCountryCodes for "radio-stations"');
    const rows: any[] = [];
    for (const cc of codes) {
      const res = await fetch(`https://de1.api.radio-browser.info/json/stations/bycountrycodeexact/${cc}?hidebroken=true&is_https=true`, {
        headers: { 'User-Agent': 'Watchboard/geo-refresh (https://watchboard.dev)' },
      });
      if (!res.ok) throw new Error(`radio-browser HTTP ${res.status} for ${cc}`);
      rows.push(...(await res.json()));
    }
    const features = radioBrowserToFeatures(rows);
    return {
      type: 'FeatureCollection',
      _provenance: {
        id: 'radio-stations', source: 'radio-browser.info', url: 'https://www.radio-browser.info/',
        license: 'PDDL 1.0 (directory); each stream is subject to its own broadcaster terms', attribution: 'Stations: radio-browser.info community directory (PDDL 1.0)', retrievedAt: now,
        transform: `Country codes from every tracker's map.radioCountryCodes (${codes.join(', ')}); HTTPS MP3/AAC streams with geo coordinates and a passing last check only`,
        featureCount: features.length,
      },
      features,
    };
  },
};
```

Register it: `const ADAPTERS: Adapter[] = [nuclearPlants, submarineCables, chokepoints, radioTowers, radioStations];`

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run scripts/geo/refresh-layers.test.ts`
Expected: PASS for the new test.

- [ ] **Step 6: Opt `ukraine-war` into `radio-stations` and generate the file**

Edit `trackers/ukraine-war/tracker.json`'s `map` block (from Task 1's temporary `radio-towers`-only state):

```json
    "staticLayers": [
      "nuclear-plants",
      "radio-towers",
      "radio-stations"
    ],
    "radioCountryCodes": [
      "UA"
    ]
```

Run: `npx tsx scripts/geo/refresh-layers.ts --layer radio-stations`
Expected: `[geo] wrote radio-stations: N features → .../radio-stations.geojson`.

- [ ] **Step 7: Run the full geo test suite**

Run: `npx vitest run scripts/geo/refresh-layers.test.ts`
Expected: PASS, including the new `radio-stations.geojson exists...` case.

- [ ] **Step 8: Run the site build to confirm `tracker.json` still validates**

Run: `npm run build`
Expected: succeeds — `radioCountryCodes` is a recognized `MapConfigSchema` field.

- [ ] **Step 9: Document the license**

Create `docs/licenses/radio-browser.md`:

```markdown
# radio-browser.info

- Endpoint: `https://de1.api.radio-browser.info/json/stations/bycountrycodeexact/{CC}` (build-time only, `scripts/geo/refresh-layers.ts`)
- License: the directory itself is PDDL 1.0 (public domain). Each listed stream is a link to a third-party broadcaster and is subject to that broadcaster's own terms, which radio-browser.info does not vouch for.
- Implementation: filtered to HTTPS URLs, MP3/AAC codecs, stations with geo coordinates (most rows lack them — roughly 1 in 6 in an initial Ukraine sample) and a passing last-check flag.
- Privacy: playback is a direct browser-to-broadcaster `<audio>` connection — Watchboard does not proxy it. The listener's IP reaches the broadcaster. The UI shows a one-time notice before the first play (`src/lib/radio-station.ts`).
- Attribution shown: "Stations: radio-browser.info community directory (PDDL 1.0)"
```

Edit `docs/licenses/README.md`, add a row:

```markdown
| radio-browser.info stations | PDDL 1.0 (directory); streams are third-party | attribution shown; IP exposure disclosed to listener | `radio-browser.md` |
```

- [ ] **Step 10: Commit**

```bash
git add src/lib/tracker-config.ts scripts/geo/refresh-layers.ts scripts/geo/refresh-layers.test.ts public/geo/layers/radio-stations.geojson trackers/ukraine-war/tracker.json docs/licenses/radio-browser.md docs/licenses/README.md
git commit -m "feat(geo): add radio-stations static layer (radio-browser.info)"
```

---

### Task 3: Community overrides for radio stations

**Files:**
- Create: `src/lib/radio-overrides.ts`
- Create: `src/lib/radio-overrides.test.ts`
- Create: `src/data/radio-stations-overrides.json`
- Modify: `scripts/geo/refresh-layers.ts`
- Modify: `scripts/geo/refresh-layers.test.ts`

**Interfaces:**
- Consumes: `GeoLayer['features']` shape from Tasks 1–2.
- Produces: `export const RadioOverrideSchema` (Zod), `export type RadioOverride`, `export function loadRadioOverrides(): RadioOverride[]`, `export function applyRadioOverrides(features: GeoLayer['features'], overrides: RadioOverride[]): GeoLayer['features']` — all pure except the JSON import itself.

- [ ] **Step 1: Write the failing test**

Create `src/lib/radio-overrides.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RadioOverrideSchema, applyRadioOverrides } from './radio-overrides';
import type { GeoLayer } from './geo-layer-schema';

const feature = (id: string, name = 'X'): GeoLayer['features'][number] => ({
  type: 'Feature', id, properties: { stationUuid: id, name }, geometry: { type: 'Point', coordinates: [0, 0] },
});

describe('RadioOverrideSchema', () => {
  it('accepts add/remove/correct actions and rejects an unknown one', () => {
    expect(RadioOverrideSchema.safeParse({ stationUuid: 'a', action: 'remove', note: 'dead stream', source: 'issue #1' }).success).toBe(true);
    expect(RadioOverrideSchema.safeParse({ stationUuid: 'a', action: 'bogus', note: 'x', source: 'x' }).success).toBe(false);
  });
});

describe('applyRadioOverrides', () => {
  it('removes a station', () => {
    const out = applyRadioOverrides([feature('a'), feature('b')], [{ stationUuid: 'a', action: 'remove', note: 'dead', source: 'issue #1' }]);
    expect(out.map(f => f.id)).toEqual(['b']);
  });
  it('corrects fields via a shallow patch', () => {
    const out = applyRadioOverrides([feature('a')], [{ stationUuid: 'a', action: 'correct', patch: { name: 'Renamed' }, note: 'wrong name', source: 'issue #2' }]);
    expect(out[0].properties.name).toBe('Renamed');
  });
  it('adds a station not present in the upstream fetch', () => {
    const added = { stationUuid: 'z', action: 'add' as const, note: 'curated', source: 'issue #3', patch: { name: 'Manual', stationUuid: 'z', streamUrl: 'https://s.example/z', codec: 'MP3', votes: 0, country: null, countryCode: null, language: null, freqLabel: null } };
    const out = applyRadioOverrides([feature('a')], [added]);
    expect(out.map(f => f.id)).toEqual(['a', 'z']);
    expect(out[1].geometry.type).toBe('Point');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/radio-overrides.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the empty overrides file**

Create `src/data/radio-stations-overrides.json`:

```json
[]
```

- [ ] **Step 4: Implement `src/lib/radio-overrides.ts`**

```ts
/**
 * radio-overrides.ts — community corrections to the radio-stations static
 * layer, applied by scripts/geo/refresh-layers.ts on top of whatever
 * radio-browser.info returns for the current run. A PR that edits
 * src/data/radio-stations-overrides.json changes the next regeneration
 * without waiting on the upstream directory to fix itself.
 */
import { z } from 'zod';
import overridesJson from '../data/radio-stations-overrides.json';
import type { GeoLayer } from './geo-layer-schema';

const StationPatchSchema = z.object({
  name: z.string().optional(),
  country: z.string().nullable().optional(),
  countryCode: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  freqLabel: z.string().nullable().optional(),
  streamUrl: z.string().url().optional(),
  codec: z.string().optional(),
  votes: z.number().optional(),
  stationUuid: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
});

export const RadioOverrideSchema = z.object({
  stationUuid: z.string().min(1),
  action: z.enum(['add', 'remove', 'correct']),
  note: z.string().min(1),
  source: z.string().min(1),
  patch: StationPatchSchema.optional(),
});
export type RadioOverride = z.infer<typeof RadioOverrideSchema>;

export function loadRadioOverrides(): RadioOverride[] {
  return z.array(RadioOverrideSchema).parse(overridesJson);
}

/** Pure: applies add/remove/correct overrides on top of the fetched features. */
export function applyRadioOverrides(features: GeoLayer['features'], overrides: RadioOverride[]): GeoLayer['features'] {
  let out = [...features];
  for (const ov of overrides) {
    if (ov.action === 'remove') {
      out = out.filter((f) => f.id !== ov.stationUuid);
    } else if (ov.action === 'correct') {
      out = out.map((f) => (f.id === ov.stationUuid ? { ...f, properties: { ...f.properties, ...ov.patch } } : f));
    } else if (ov.action === 'add') {
      const p = ov.patch ?? {};
      if (typeof p.lat !== 'number' || typeof p.lon !== 'number') continue; // can't place it without coordinates
      out.push({
        type: 'Feature', id: ov.stationUuid,
        properties: { stationUuid: ov.stationUuid, name: p.name ?? ov.stationUuid, country: p.country ?? null, countryCode: p.countryCode ?? null, language: p.language ?? null, freqLabel: p.freqLabel ?? null, streamUrl: p.streamUrl ?? '', codec: p.codec ?? 'MP3', votes: p.votes ?? 0 },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      });
    }
  }
  return out;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/radio-overrides.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire overrides into the `radioStations` adapter**

In `scripts/geo/refresh-layers.ts`, import and apply after building `features`:

```ts
import { loadRadioOverrides, applyRadioOverrides } from '../../src/lib/radio-overrides';
```

In `radioStations.run`, replace `const features = radioBrowserToFeatures(rows);` with:

```ts
    const features = applyRadioOverrides(radioBrowserToFeatures(rows), loadRadioOverrides());
```

- [ ] **Step 7: Regenerate and re-validate**

Run: `npx tsx scripts/geo/refresh-layers.ts --layer radio-stations && npx vitest run scripts/geo/refresh-layers.test.ts src/lib/radio-overrides.test.ts`
Expected: both PASS; `radio-stations.geojson` unchanged in content (the overrides file is empty) but freshly stamped.

- [ ] **Step 8: Commit**

```bash
git add src/lib/radio-overrides.ts src/lib/radio-overrides.test.ts src/data/radio-stations-overrides.json scripts/geo/refresh-layers.ts public/geo/layers/radio-stations.geojson
git commit -m "feat(radio): community overrides file for station curation"
```

---

### Task 4: CSP `media-src` for direct-to-broadcaster audio

**Files:**
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `public/_headers`
- Create: `src/lib/csp-media.test.ts`

**Interfaces:**
- Consumes: `extractPolicies` from `scripts/lib/csp-hosts.ts` (already exists, used by `src/lib/live-layers.test.ts`).
- Produces: nothing new consumed elsewhere — this task only needs to make `<audio src="https://...">` not get blocked.

- [ ] **Step 1: Write the failing test**

Create `src/lib/csp-media.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractPolicies } from '../../scripts/lib/csp-hosts';

const ROOT = resolve(__dirname, '../..');

describe('CSP allows direct-to-broadcaster audio playback', () => {
  for (const file of ['src/layouts/BaseLayout.astro', 'public/_headers']) {
    it(`${file} declares media-src covering https:`, () => {
      const body = readFileSync(resolve(ROOT, file), 'utf8');
      const [policy] = extractPolicies(body);
      expect(policy, `${file} has no CSP`).toBeTruthy();
      const m = /media-src\s+([^;]+)/i.exec(policy);
      expect(m, `${file} has no media-src directive`).toBeTruthy();
      expect(m![1]).toMatch(/https:/);
    });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/csp-media.test.ts`
Expected: FAIL — no `media-src` directive exists yet (CSP falls back to `default-src 'self'`, which blocks the third-party audio origin).

- [ ] **Step 3: Add `media-src` to both CSP declarations**

In `src/layouts/BaseLayout.astro`, edit the `<meta http-equiv="Content-Security-Policy" ...>` content attribute: insert `media-src 'self' https:;` right after the `img-src` directive and before `connect-src` (exact insertion point — after `img-src 'self' data: blob: https:;` and before `connect-src 'self' ...`):

```
img-src 'self' data: blob: https:; media-src 'self' https:; connect-src 'self' https://*.posthog.com ...
```

In `public/_headers`, make the identical edit to the `Content-Security-Policy:` line (same insertion point, same value).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/csp-media.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the existing CSP-coverage test to confirm no regression**

Run: `npx vitest run src/lib/live-layers.test.ts`
Expected: PASS (unchanged — that test only checks `connect-src`, not `media-src`).

- [ ] **Step 6: Commit**

```bash
git add src/layouts/BaseLayout.astro public/_headers src/lib/csp-media.test.ts
git commit -m "feat(radio): allow direct-to-broadcaster audio playback in CSP"
```

---

### Task 5: Pure radio-station helpers (frequency label, privacy consent, report-issue URL)

**Files:**
- Create: `src/lib/radio-station.ts`
- Create: `src/lib/radio-station.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `export interface RadioStationProperties` (the shape of a `radio-stations` feature's `properties`, matching Task 2's adapter output), `export function hasAcceptedRadioPrivacyNotice(): boolean`, `export function setAcceptedRadioPrivacyNotice(): void`, `export function buildRadioStreamIssueUrl(station: RadioStationProperties): string`, `export function isRadioStationProperties(v: unknown): v is RadioStationProperties` (the type guard `RadioStationCard`/click handlers use to tell a radio-station entity apart from any other static-layer entity).

- [ ] **Step 1: Write the failing test**

Create `src/lib/radio-station.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hasAcceptedRadioPrivacyNotice, setAcceptedRadioPrivacyNotice, buildRadioStreamIssueUrl, isRadioStationProperties } from './radio-station';

describe('radio privacy consent (localStorage, try/catch)', () => {
  beforeEach(() => { localStorage.clear(); });

  it('is false until set, true after', () => {
    expect(hasAcceptedRadioPrivacyNotice()).toBe(false);
    setAcceptedRadioPrivacyNotice();
    expect(hasAcceptedRadioPrivacyNotice()).toBe(true);
  });

  it('degrades to false instead of throwing when localStorage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(hasAcceptedRadioPrivacyNotice()).toBe(false);
    spy.mockRestore();
  });
});

describe('buildRadioStreamIssueUrl', () => {
  it('prefills the radio-stream-issue template with the station uuid and stream url', () => {
    const url = buildRadioStreamIssueUrl({ stationUuid: 'abc-123', name: 'Test FM', streamUrl: 'https://stream.example/x', country: 'Ukraine', countryCode: 'UA', language: null, freqLabel: null, codec: 'MP3', votes: 1 });
    expect(url).toContain('https://github.com/ArtemioPadilla/watchboard/issues/new');
    expect(url).toContain('template=radio-stream-issue.yml');
    expect(url).toContain(encodeURIComponent('abc-123'));
    expect(url).toContain(encodeURIComponent('https://stream.example/x'));
  });
});

describe('isRadioStationProperties', () => {
  it('accepts a station-shaped object and rejects anything without stationUuid', () => {
    expect(isRadioStationProperties({ stationUuid: 'x', name: 'n', streamUrl: 'https://a', codec: 'MP3', votes: 0, country: null, countryCode: null, language: null, freqLabel: null })).toBe(true);
    expect(isRadioStationProperties({ osmId: '1', radioBand: 'fm' })).toBe(false);
    expect(isRadioStationProperties(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/radio-station.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/lib/radio-station.ts`**

```ts
/**
 * radio-station.ts — shared, framework-free logic for the radio-stations
 * layer: the feature-properties shape, the privacy-consent gate (audio
 * plays direct-to-broadcaster, exposing the listener's IP — see
 * docs/licenses/radio-browser.md), and the prefilled "report a broken
 * stream" issue link. Used by every surface (Leaflet, Cesium, home globe)
 * so the notice and the report flow behave identically everywhere.
 */
export interface RadioStationProperties {
  stationUuid: string;
  name: string;
  country: string | null;
  countryCode: string | null;
  language: string | null;
  freqLabel: string | null;
  streamUrl: string;
  codec: string;
  votes: number;
}

export function isRadioStationProperties(v: unknown): v is RadioStationProperties {
  return !!v && typeof v === 'object' && typeof (v as any).stationUuid === 'string' && typeof (v as any).streamUrl === 'string';
}

const CONSENT_KEY = 'watchboard-radio-privacy-ack-v1';

export function hasAcceptedRadioPrivacyNotice(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === '1'; } catch { return false; }
}

export function setAcceptedRadioPrivacyNotice(): void {
  try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* private browsing / blocked storage: ask again next time */ }
}

const REPO = 'https://github.com/ArtemioPadilla/watchboard';

export function buildRadioStreamIssueUrl(station: RadioStationProperties): string {
  const params = new URLSearchParams({
    template: 'radio-stream-issue.yml',
    'station-uuid': station.stationUuid,
    'stream-url': station.streamUrl,
    'station-name': station.name,
  });
  return `${REPO}/issues/new?${params.toString()}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/radio-station.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/radio-station.ts src/lib/radio-station.test.ts
git commit -m "feat(radio): shared station helpers (privacy consent, report-issue link)"
```

---

### Task 6: `RadioStationCard` shared component + i18n

**Files:**
- Create: `src/components/islands/shared/RadioStationCard.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: `RadioStationProperties`, `isRadioStationProperties`, `hasAcceptedRadioPrivacyNotice`, `setAcceptedRadioPrivacyNotice`, `buildRadioStreamIssueUrl` from Task 5.
- Produces: `export default function RadioStationCard(props: { station: RadioStationProperties | { osmId: string; name: string | null; heightM: number | null; radioBand: string } | null; onClose: () => void; className?: string })` — a single component that renders either a station card (with player) or a tower card (info only), used identically by Leaflet, Cesium and the home globe in Tasks 7–9.

- [ ] **Step 1: Add i18n keys**

In `src/i18n/translations.ts`, add to the `en` block right after `'layers.chokepoints': 'Maritime chokepoints',` (around line 165):

```ts
  'layers.radioTowers': 'Radio towers',
  'layers.radioStations': 'Radio stations',
  'radio.listen': 'Listen',
  'radio.stop': 'Stop',
  'radio.connecting': 'Connecting…',
  'radio.playing': 'On air',
  'radio.error': 'Stream unavailable',
  'radio.reportBroken': 'Report broken stream',
  'radio.tower': 'Communication tower',
  'radio.towerNoName': 'Unnamed communication tower',
  'radio.band': 'Band',
  'radio.frequencyApprox': 'freq. approx., from station name',
  'radio.privacyTitle': 'Before you listen',
  'radio.privacyBody': 'Playing a station connects your browser directly to the broadcaster — your IP address reaches them, not just Watchboard.',
  'radio.privacyAccept': 'Understood, play',
  'radio.close': 'Close',
```

Add the equivalent Spanish, French and Portuguese blocks at the matching position in the `es`, `fr` and `pt` objects (same keys, translated values — the `es` block starts at line 689, `fr` at 1342, `pt` at 1995; each already carries a `'layers.chokepoints'` entry to anchor the insertion point). Spanish:

```ts
  'layers.radioTowers': 'Torres de radio',
  'layers.radioStations': 'Emisoras de radio',
  'radio.listen': 'Escuchar',
  'radio.stop': 'Detener',
  'radio.connecting': 'Conectando…',
  'radio.playing': 'Al aire',
  'radio.error': 'Stream no disponible',
  'radio.reportBroken': 'Reportar stream roto',
  'radio.tower': 'Torre de comunicaciones',
  'radio.towerNoName': 'Torre de comunicaciones sin nombre',
  'radio.band': 'Banda',
  'radio.frequencyApprox': 'frecuencia aprox., tomada del nombre de la emisora',
  'radio.privacyTitle': 'Antes de escuchar',
  'radio.privacyBody': 'Al reproducir una emisora, tu navegador se conecta directo con el radiodifusor — tu IP llega a ellos, no solo a Watchboard.',
  'radio.privacyAccept': 'Entendido, reproducir',
  'radio.close': 'Cerrar',
```

French:

```ts
  'layers.radioTowers': 'Tours radio',
  'layers.radioStations': 'Stations de radio',
  'radio.listen': 'Écouter',
  'radio.stop': 'Arrêter',
  'radio.connecting': 'Connexion…',
  'radio.playing': 'En direct',
  'radio.error': 'Flux indisponible',
  'radio.reportBroken': 'Signaler un flux cassé',
  'radio.tower': 'Tour de communication',
  'radio.towerNoName': 'Tour de communication sans nom',
  'radio.band': 'Bande',
  'radio.frequencyApprox': 'fréquence approx., tirée du nom de la station',
  'radio.privacyTitle': 'Avant d\'écouter',
  'radio.privacyBody': 'Lire une station connecte votre navigateur directement au diffuseur — votre IP lui parvient, pas seulement à Watchboard.',
  'radio.privacyAccept': 'Compris, lire',
  'radio.close': 'Fermer',
```

Portuguese:

```ts
  'layers.radioTowers': 'Torres de rádio',
  'layers.radioStations': 'Estações de rádio',
  'radio.listen': 'Ouvir',
  'radio.stop': 'Parar',
  'radio.connecting': 'Conectando…',
  'radio.playing': 'No ar',
  'radio.error': 'Transmissão indisponível',
  'radio.reportBroken': 'Reportar transmissão quebrada',
  'radio.tower': 'Torre de comunicação',
  'radio.towerNoName': 'Torre de comunicação sem nome',
  'radio.band': 'Banda',
  'radio.frequencyApprox': 'frequência aprox., extraída do nome da estação',
  'radio.privacyTitle': 'Antes de ouvir',
  'radio.privacyBody': 'Reproduzir uma estação conecta seu navegador diretamente à emissora — seu IP chega até ela, não só ao Watchboard.',
  'radio.privacyAccept': 'Entendi, reproduzir',
  'radio.close': 'Fechar',
```

- [ ] **Step 2: Run the i18n completeness test**

Run: `npx vitest run src/i18n/translations.test.ts`
Expected: PASS — confirms every locale has the same key set (this is what the existing test already checks).

- [ ] **Step 3: Implement `RadioStationCard.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { t } from '../../../i18n/translations';
import { useLocale } from '../../../i18n/useLocale';
import {
  type RadioStationProperties, isRadioStationProperties,
  hasAcceptedRadioPrivacyNotice, setAcceptedRadioPrivacyNotice, buildRadioStreamIssueUrl,
} from '../../../lib/radio-station';

interface TowerProperties { osmId: string; name: string | null; heightM: number | null; radioBand: string }

interface Props {
  station: RadioStationProperties | TowerProperties | null;
  onClose: () => void;
  className?: string;
}

type PlaybackState = 'idle' | 'connecting' | 'playing' | 'error';

export default function RadioStationCard({ station, onClose, className = '' }: Props) {
  const locale = useLocale();
  const [playback, setPlayback] = useState<PlaybackState>('idle');
  const [needsConsent, setNeedsConsent] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setPlayback('idle');
    setNeedsConsent(false);
    return () => { audioRef.current?.pause(); audioRef.current = null; };
  }, [station]);

  if (!station) return null;

  if (!isRadioStationProperties(station)) {
    const tower = station as TowerProperties;
    return (
      <div className={`radio-card ${className}`} role="dialog" aria-label={t('radio.tower', locale)}>
        <button className="radio-card-close" onClick={onClose} aria-label={t('radio.close', locale)}>×</button>
        <div className="radio-card-title">{tower.name ?? t('radio.towerNoName', locale)}</div>
        <div className="radio-card-meta">{t('radio.band', locale)}: {tower.radioBand || '—'}</div>
        {tower.heightM != null && <div className="radio-card-meta">{tower.heightM} m</div>}
      </div>
    );
  }

  function play() {
    if (!hasAcceptedRadioPrivacyNotice()) { setNeedsConsent(true); return; }
    startPlayback();
  }

  // One retry before giving up: the weekly file can drift from a stream
  // that just went down since its last radio-browser.info health check.
  function startPlayback(isRetry = false) {
    if (!isRadioStationProperties(station)) return;
    setPlayback('connecting');
    const audio = new Audio(station.streamUrl);
    audioRef.current = audio;
    audio.addEventListener('playing', () => setPlayback('playing'));
    audio.addEventListener('error', () => {
      if (isRetry) { setPlayback('error'); return; }
      setTimeout(() => { if (audioRef.current === audio) startPlayback(true); }, 1500);
    });
    audio.play().catch(() => {
      if (isRetry) { setPlayback('error'); return; }
      setTimeout(() => { if (audioRef.current === audio) startPlayback(true); }, 1500);
    });
  }

  function stop() {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayback('idle');
  }

  return (
    <div className={`radio-card ${className}`} role="dialog" aria-label={station.name}>
      <button className="radio-card-close" onClick={onClose} aria-label={t('radio.close', locale)}>×</button>
      <div className="radio-card-title">{station.name}</div>
      <div className="radio-card-meta">
        {station.country ?? '—'}{station.language ? ` · ${station.language}` : ''}
        {station.freqLabel ? ` · ${station.freqLabel} (${t('radio.frequencyApprox', locale)})` : ''}
      </div>

      {needsConsent && (
        <div className="radio-card-consent">
          <div className="radio-card-consent-title">{t('radio.privacyTitle', locale)}</div>
          <p>{t('radio.privacyBody', locale)}</p>
          <button onClick={() => { setAcceptedRadioPrivacyNotice(); setNeedsConsent(false); startPlayback(); }}>
            {t('radio.privacyAccept', locale)}
          </button>
        </div>
      )}

      {!needsConsent && playback !== 'playing' && (
        <button className="radio-card-play" onClick={play} disabled={playback === 'connecting'}>
          {playback === 'connecting' ? t('radio.connecting', locale) : t('radio.listen', locale)}
        </button>
      )}
      {playback === 'playing' && (
        <button className="radio-card-play radio-card-play-active" onClick={stop}>
          {t('radio.playing', locale)} · {t('radio.stop', locale)}
        </button>
      )}
      {playback === 'error' && (
        <div className="radio-card-error">
          {t('radio.error', locale)}
          {' — '}
          <a href={buildRadioStreamIssueUrl(station)} target="_blank" rel="noopener noreferrer">
            {t('radio.reportBroken', locale)}
          </a>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: succeeds (the component isn't mounted anywhere yet, but must still compile cleanly).

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/shared/RadioStationCard.tsx src/i18n/translations.ts
git commit -m "feat(radio): shared RadioStationCard (player, privacy notice, report link)"
```

---

### Task 7: Leaflet wiring (tracker 2D map)

**Files:**
- Modify: `src/components/islands/GeoLayersLeaflet.tsx`
- Modify: `src/components/islands/IntelMap.tsx`

**Interfaces:**
- Consumes: `RadioStationCard` (Task 6), `staticLayerMeta` (existing).
- Produces: `GeoLayersLeaflet` gains an optional `onSelectRadioFeature?: (properties: any) => void` prop.

- [ ] **Step 1: Add the click branch in `GeoLayersLeaflet.tsx`**

Edit the `statics.map(...)` block's `onEachFeature` — keep the existing tooltip for every static layer, and additionally fire a click callback for the two radio layers:

```tsx
export default function GeoLayersLeaflet({ frontline, gdacs, statics = [], onSelectRadioFeature }: Props) {
```

Add `onSelectRadioFeature?: (properties: any) => void;` to the `Props` interface, then change:

```tsx
              onEachFeature={(f: any, l: any) => { const n = f?.properties?.name; if (n) l.bindTooltip(String(n), { className: 'dark-tooltip', sticky: true }); }}
```

to:

```tsx
              onEachFeature={(f: any, l: any) => {
                const n = f?.properties?.name;
                if (n) l.bindTooltip(String(n), { className: 'dark-tooltip', sticky: true });
                if ((id === 'radio-stations' || id === 'radio-towers') && onSelectRadioFeature) {
                  l.on('click', () => onSelectRadioFeature(f.properties));
                }
              }}
```

- [ ] **Step 2: Thread the callback and render the card in `IntelMap.tsx`**

Add state near the other selection state (alongside `selectedPoint`):

```tsx
  const [selectedRadioFeature, setSelectedRadioFeature] = useState<any | null>(null);
```

Pass the new prop to `GeoLayersLeaflet` (in the `geoLayers={<GeoLayersLeaflet .../>}` prop at line ~286):

```tsx
          geoLayers={<GeoLayersLeaflet frontline={extraLayers['deepstate-frontline'] ? frontline.data : null} gdacs={extraLayers['gdacs-alerts'] ? gdacs.data : null} statics={staticData} onSelectRadioFeature={setSelectedRadioFeature} />}
```

Render the card near the other floating panels (right after the `MapEventsPanel` block):

```tsx
        {selectedRadioFeature && (
          <RadioStationCard station={selectedRadioFeature} onClose={() => setSelectedRadioFeature(null)} className="map-radio-card" />
        )}
```

Add the import at the top of the file: `import RadioStationCard from './shared/RadioStationCard';`

- [ ] **Step 3: Opt `ukraine-war` render check**

Run: `npm run dev` (or `npm run build && npm run preview`) and open `/ukraine-war/` — toggle "Radio stations" / "Radio towers" in the layer panel, click a station pin, confirm the card opens with a working "Escuchar" button and a station pin's popup no longer shows only a bare tooltip.

This is a manual verification step (no automated test exists for Leaflet DOM interaction in this repo) — confirm it before committing.

- [ ] **Step 4: Commit**

```bash
git add src/components/islands/GeoLayersLeaflet.tsx src/components/islands/IntelMap.tsx
git commit -m "feat(radio): click-to-listen on the tracker 2D map"
```

---

### Task 8: Cesium wiring (tracker 3D globe)

**Files:**
- Modify: `src/components/islands/CesiumGlobe/CesiumGlobe.tsx`

**Interfaces:**
- Consumes: `RadioStationCard` (Task 6), `isRadioStationProperties`, `RadioStationProperties` (Task 5), `handleEntitySelect`/`GenericEntityInfo` (existing, `useConflictData.ts`).

- [ ] **Step 1: Add radio selection state and the import**

Near the top of `CesiumGlobe.tsx`, add:

```tsx
import RadioStationCard from '../shared/RadioStationCard';
import { isRadioStationProperties, type RadioStationProperties } from '../../../lib/radio-station';
```

Near `carouselEntities`/`activeCardIndex` state:

```tsx
  const [selectedRadioFeature, setSelectedRadioFeature] = useState<RadioStationProperties | { osmId: string; name: string | null; heightM: number | null; radioBand: string } | null>(null);
```

- [ ] **Step 2: Branch `handleEntitySelect` before it falls into the generic carousel**

Edit the existing `handleEntitySelect` (around line 576) — add the radio check at the top of the callback, before the `const entity: CarouselEntity = ...` construction:

```tsx
  const handleEntitySelect = useCallback((info: GenericEntityInfo) => {
    if (info.description) {
      try {
        const props = JSON.parse(info.description);
        if (isRadioStationProperties(props) || typeof props.osmId === 'string') {
          setSelectedRadioFeature(props);
          return;
        }
      } catch { /* not a static-layer entity description; fall through */ }
    }
    const entity: CarouselEntity = {
      id: `entity-${info.name}`,
      type: 'generic',
      position: info.position
        ? Cartesian3.fromDegrees(info.position.lon, info.position.lat, 0)
        : Cartesian3.fromDegrees(0, 0, 0),
      name: info.name,
      description: info.description,
    };
    setCarouselEntities(prev => {
      if (prev.some(e => e.id === entity.id)) {
        setActiveCardIndex(prev.findIndex(e => e.id === entity.id));
        return prev;
      }
      const next = [...prev, entity].slice(-5);
      setActiveCardIndex(next.length - 1);
      return next;
    });
    setEventsOpen(false);
  }, []);
```

- [ ] **Step 3: Render the card**

Find the component's returned JSX and add, alongside the other overlays (e.g. near where the fact-card carousel renders):

```tsx
      {selectedRadioFeature && (
        <RadioStationCard station={selectedRadioFeature} onClose={() => setSelectedRadioFeature(null)} className="globe-radio-card" />
      )}
```

- [ ] **Step 4: Type-check and manual verification**

Run: `npm run build`
Expected: succeeds.

Run: `npm run dev`, open `/ukraine-war/globe`, enable the radio layers, click a station and a tower entity on the 3D globe, confirm the card opens (and no longer falls into the generic fact-card carousel for these two layers specifically — other static layers like nuclear plants must keep their current behavior unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/CesiumGlobe/CesiumGlobe.tsx
git commit -m "feat(radio): click-to-listen on the tracker 3D globe"
```

---

### Task 9: Homepage globe — capped radio-station pins

**Files:**
- Modify: `src/components/islands/CommandCenter/GlobePanel.tsx`
- Modify: `src/components/islands/CommandCenter/CommandCenter.tsx`

**Interfaces:**
- Consumes: `public/geo/layers/radio-stations.geojson` (Task 2), `RadioStationCard`, `RadioStationProperties` (Tasks 5–6).
- Produces: `GlobePanel` gains `radioStations?: RadioStationProperties[]` and `onSelectRadioStation?: (s: RadioStationProperties) => void` props.

- [ ] **Step 1: Fetch and cap the dataset in `CommandCenter.tsx`**

`RadioStationProperties` (Task 5) has no coordinates — they live in the GeoJSON `geometry`, not `properties`. Define a local type that carries both, and use it for `CommandCenter.tsx`'s state and `GlobePanel`'s new props.

Add near wherever `CommandCenter.tsx` already fetches homepage-scoped JSON (same `basePath()` helper pattern used elsewhere in this file):

```tsx
  const [radioStations, setRadioStations] = useState<GlobeRadioStation[]>([]);
  useEffect(() => {
    fetch(`${basePath}geo/layers/radio-stations.geojson`)
      .then(r => r.ok ? r.json() : null)
      .then((fc: any) => {
        if (!fc?.features) return;
        const top = [...fc.features]
          .sort((a: any, b: any) => (b.properties.votes ?? 0) - (a.properties.votes ?? 0))
          .slice(0, 300)
          .map((f: any): GlobeRadioStation => ({ ...f.properties, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }));
        setRadioStations(top);
      })
      .catch(() => { /* home globe still works without the radio layer */ });
  }, []);
```

Add the import: `import type { GlobeRadioStation } from './GlobePanel';` (the type is defined in and exported from `GlobePanel.tsx` in Step 2, so this import is only valid once Step 2 is done — within this task that's fine since both steps land in the same commit).

Add state for the selected station and pass both down to `GlobePanel`:

```tsx
  const [selectedRadioStation, setSelectedRadioStation] = useState<RadioStationProperties | null>(null);
```

In the `<GlobePanel ... />` JSX, add:

```tsx
          radioStations={radioStations}
          onSelectRadioStation={setSelectedRadioStation}
```

Render the card as a sibling of `GlobePanel` (same level as other overlay panels in `CommandCenter.tsx`):

```tsx
      {selectedRadioStation && (
        <RadioStationCard station={selectedRadioStation} onClose={() => setSelectedRadioStation(null)} className="home-radio-card" />
      )}
```

Add the import: `import RadioStationCard from './shared/RadioStationCard';` (adjust the relative path if `shared/` sits one level up from `CommandCenter/` — it does: `../shared/RadioStationCard`).

- [ ] **Step 2: Render radio stations as a second html-pin layer in `GlobePanel.tsx`**

`globe.gl` supports one `htmlElementsData`/`htmlElement` pair per globe instance, already used by `pendingCandidates`. Merge both datasets into one array with a `kind` discriminator instead of adding a second layer.

Export the coordinate-carrying type other files need (`CommandCenter.tsx`'s Step 1 imports it):

```tsx
export type GlobeRadioStation = RadioStationProperties & { lat: number; lon: number };
```

Add to `Props`:

```tsx
  radioStations?: GlobeRadioStation[];
  onSelectRadioStation?: (s: RadioStationProperties) => void;
```

Import the type: `import type { RadioStationProperties } from '../../../lib/radio-station';`

Destructure the new prop with a default in the component signature, alongside `pendingCandidates = []`:

```tsx
  radioStations = [],
  onSelectRadioStation,
```

Add a ref for the callback, mirroring the existing `onSelectRef` pattern:

```tsx
  const onSelectRadioRef = useRef(onSelectRadioStation);
  onSelectRadioRef.current = onSelectRadioStation;
```

Replace the `pendingCandidates`-only html-pin effect (the block starting `const pendingLabelRef = useRef(...)`) with a version that merges both datasets:

```tsx
  const pendingLabelRef = useRef(t('globe.pendingCandidate', locale));
  pendingLabelRef.current = t('globe.pendingCandidate', locale);
  const pendingConfiguredRef = useRef(false);
  const htmlPins = useMemo(() => [
    ...pendingCandidates.map(p => ({ kind: 'pending' as const, ...p })),
    ...radioStations.map(s => ({ kind: 'radio' as const, id: s.stationUuid, lat: s.lat, lon: s.lon, title: s.name, station: s })),
  ], [pendingCandidates, radioStations]);
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || loading) return;
    if (!pendingConfiguredRef.current) {
      pendingConfiguredRef.current = true;
      globe
      .htmlLat('lat')
      .htmlLng('lon')
      .htmlAltitude(0.012)
      .htmlElement((d: any) => {
        if (d.kind === 'radio') {
          const el = document.createElement('div');
          el.className = 'cc-radio-pin';
          el.dataset.testid = 'radio-pin';
          el.title = d.title;
          el.setAttribute('aria-label', `${t('layers.radioStations', locale)}: ${d.title}`);
          el.style.cssText = 'width:10px;height:10px;border-radius:50%;border:1.5px solid #ff66cc;background:rgba(255,102,204,0.25);box-shadow:0 0 5px rgba(255,102,204,0.5);pointer-events:auto;cursor:pointer;transform:translate(-50%,-50%);';
          el.addEventListener('click', (ev) => { ev.stopPropagation(); onSelectRadioRef.current?.(d.station); });
          return el;
        }
        const label = pendingLabelRef.current;
        const el = document.createElement('div');
        el.className = 'cc-pending-pin';
        el.dataset.testid = 'pending-pin';
        el.dataset.alertId = d.id;
        el.title = `${label} · ${d.source}${d.place ? ` · ${d.place}` : ''}\n${d.title}`;
        el.setAttribute('aria-label', `${label}: ${d.title}`);
        el.style.cssText = 'width:12px;height:12px;border-radius:50%;border:2px dotted var(--tier-4, #8b949e);background:rgba(139,148,158,0.15);box-shadow:0 0 6px rgba(139,148,158,0.5);pointer-events:auto;cursor:help;transform:translate(-50%,-50%);';
        el.addEventListener('click', (ev) => { ev.stopPropagation(); if (d.tracker) onSelectRef.current(d.tracker); });
        return el;
      });
    }
    globe.htmlElementsData(htmlPins);
  }, [htmlPins, loading]);
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the homepage, confirm pink radio-station dots render on the globe (alongside any pending-candidate dotted pins), click one, confirm `RadioStationCard` opens and plays.

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/CommandCenter/GlobePanel.tsx src/components/islands/CommandCenter/CommandCenter.tsx
git commit -m "feat(radio): capped radio-station pins on the homepage globe"
```

---

### Task 10: `radio-stream-issue.yml` issue template

**Files:**
- Create: `.github/ISSUE_TEMPLATE/radio-stream-issue.yml`

**Interfaces:**
- Consumes: the query params built by `buildRadioStreamIssueUrl` (Task 5): `station-uuid`, `stream-url`, `station-name`.

- [ ] **Step 1: Create the template**

Model it on the existing `.github/ISSUE_TEMPLATE/data-correction.yml` structure:

```yaml
name: Radio Stream Issue
description: Report a broken or misbehaving radio stream on the radio layer
title: "[Radio] "
labels: ["radio-stream-broken"]
body:
  - type: input
    id: station-uuid
    attributes:
      label: Station UUID
      description: radio-browser.info station identifier (prefilled from the player)
    validations:
      required: true
  - type: input
    id: station-name
    attributes:
      label: Station name
    validations:
      required: false
  - type: input
    id: stream-url
    attributes:
      label: Stream URL
    validations:
      required: true
  - type: dropdown
    id: problem
    attributes:
      label: What's wrong?
      options:
        - Stream does not play / connection error
        - Stream plays but is silent or wrong content
        - Wrong location on the map
        - Station should be removed (offline permanently)
        - Other
    validations:
      required: true
  - type: textarea
    id: details
    attributes:
      label: Details
      description: Anything else that helps a maintainer verify and fix this (a src/data/radio-stations-overrides.json PR closes most of these)
```

- [ ] **Step 2: Confirm the field ids match the query params Task 5 builds**

`buildRadioStreamIssueUrl` sets `station-uuid`, `stream-url`, `station-name` — GitHub issue-form prefill matches on each `type: input`/`type: dropdown` block's `id`. Re-read `src/lib/radio-station.ts`'s `buildRadioStreamIssueUrl` and this file side by side; the three ids must match exactly (they do: `station-uuid`, `station-name`, `stream-url`).

- [ ] **Step 3: Commit**

```bash
git add .github/ISSUE_TEMPLATE/radio-stream-issue.yml
git commit -m "feat(radio): issue template for broken-stream reports"
```

---

### Task 11: Weekly refresh workflow

**Files:**
- Create: `.github/workflows/refresh-radio-layers.yml`

**Interfaces:**
- Consumes: `scripts/geo/refresh-layers.ts --layer radio-towers` / `--layer radio-stations` (Tasks 1–2).

- [ ] **Step 1: Create the workflow**

```yaml
name: Refresh Radio Layers

on:
  schedule:
    - cron: '0 6 * * 1' # Mondays 06:00 UTC — stations and towers change slowly; weekly avoids hammering Overpass/radio-browser
  workflow_dispatch: {}

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx tsx scripts/geo/refresh-layers.ts --layer radio-towers
      - run: npx tsx scripts/geo/refresh-layers.ts --layer radio-stations
      - run: npx vitest run scripts/geo/refresh-layers.test.ts
      - name: Commit if changed
        run: |
          git config user.name "watchboard-bot"
          git config user.email "actions@github.com"
          git add public/geo/layers/radio-towers.geojson public/geo/layers/radio-stations.geojson
          git diff --staged --quiet || git commit -m "chore(radio): weekly refresh $(date -u +%Y-%m-%dT%H-%M-%SZ)"
          git diff --staged --quiet || git push
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/refresh-radio-layers.yml'))"`
Expected: no output (parses cleanly). If `pyyaml` isn't installed, use `npx js-yaml .github/workflows/refresh-radio-layers.yml` instead.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/refresh-radio-layers.yml
git commit -m "feat(radio): weekly automated refresh of radio layers"
```

---

## Final Verification

- [ ] **Run the full test suite**

Run: `npm test`
Expected: all tests pass, including every new file above.

- [ ] **Run the full build**

Run: `npm run build`
Expected: succeeds, including Zod validation of every `tracker.json` and every `public/geo/layers/*.geojson`.

- [ ] **Manual pass**

On `/ukraine-war/` (2D map) and `/ukraine-war/globe` (3D globe) and the homepage: toggle radio layers on, click a station and a tower, confirm the privacy notice appears once, confirm audio plays, confirm the "report broken stream" link opens a prefilled GitHub issue.
