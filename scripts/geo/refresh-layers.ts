#!/usr/bin/env tsx
/**
 * refresh-layers.ts — regenerates public/geo/layers/*.geojson from their
 * public sources, stamping `_provenance` (plan E5.H3). Modelled on
 * OSIRIS's ArcGIS loader, but run at build/maintenance time so the site
 * ships frozen, attributed data instead of querying a server per visit.
 *
 * Usage:
 *   npx tsx scripts/geo/refresh-layers.ts                 # all layers
 *   npx tsx scripts/geo/refresh-layers.ts --layer nuclear-plants
 *   npx tsx scripts/geo/refresh-layers.ts --check          # validate files, no network
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeoLayerSchema, type GeoLayer } from '../../src/lib/geo-layer-schema';
// Node-only loader (see scripts/lib/load-trackers-node.ts): src/lib/tracker-registry.ts
// uses import.meta.glob, which is Vite-only and throws under plain `tsx` execution.
import { loadAllTrackers } from '../lib/load-trackers-node';
import { loadRadioOverrides, applyRadioOverrides } from '../../src/lib/radio-overrides';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = resolve(ROOT, 'public/geo/layers');

type Adapter = { id: string; run: (now: string) => Promise<GeoLayer> };


/** Pure: Wikidata SPARQL bindings → point features, deduped by QID, rows without a parsable point dropped. */
export function wikidataPlantsToFeatures(rows: any[]): GeoLayer['features'] {
  const seen = new Set<string>();
  return rows.flatMap(r => {
    const qid = String(r.plant?.value ?? '').split('/').pop() ?? '';
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(r.coord?.value ?? '');
    if (!qid || !m || seen.has(qid)) return [];
    seen.add(qid);
    return [{
      type: 'Feature' as const,
      id: qid,
      properties: {
        name: r.plantLabel?.value ?? qid,
        country: r.countryLabel?.value ?? null,
        capacityMW: r.capacity?.value ? Number(r.capacity.value) : null,
        status: r.statusLabel?.value ?? null,
        opened: r.opened?.value ? String(r.opened.value).slice(0, 10) : null,
        wikidata: `https://www.wikidata.org/wiki/${qid}`,
      },
      geometry: { type: 'Point' as const, coordinates: [Number(m[1]), Number(m[2])] },
    }];
  });
}

/** Pure: submarinecablemap.com cable-geo payload → line features (landing points and other geometries dropped). */
export function cableGeoToFeatures(fc: any): GeoLayer['features'] {
  if (!Array.isArray(fc?.features)) throw new Error('unexpected cable payload');
  return fc.features
    .filter((f: any) => f?.geometry?.type === 'MultiLineString' || f?.geometry?.type === 'LineString')
    .map((f: any) => ({
      type: 'Feature' as const,
      id: f.properties?.id ?? f.id,
      properties: { name: f.properties?.name ?? null, color: f.properties?.color ?? null, slug: f.properties?.slug ?? null },
      geometry: f.geometry,
    }));
}

/** Pure: Overpass node elements tagged communication:radio → point features, deduped by id, elements without lat/lon dropped. `countryCode` (when supplied) is the ISO code of the area query that produced the elements. */
export function overpassTowersToFeatures(elements: any[], countryCode?: string): GeoLayer['features'] {
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
        countryCode: countryCode ?? null,
      },
      geometry: { type: 'Point' as const, coordinates: [el.lon, el.lat] },
    }];
  });
}

/**
 * Pure: caps towers at `cap` per `properties.countryCode`, never mixing
 * countries into one another's slice. Within a country, named towers sort
 * before unnamed ones, then by `heightM` descending, then `osmId` ascending
 * (deterministic tie-break). Country groups appear in first-seen order.
 */
export function capTowersPerCountry(features: GeoLayer['features'], cap: number): GeoLayer['features'] {
  const groups = new Map<string, GeoLayer['features']>();
  for (const f of features) {
    const cc = String((f.properties as any)?.countryCode ?? '');
    if (!groups.has(cc)) groups.set(cc, []);
    groups.get(cc)!.push(f);
  }
  const compare = (a: GeoLayer['features'][number], b: GeoLayer['features'][number]) => {
    const ap = a.properties as any;
    const bp = b.properties as any;
    const aNamed = ap.name != null;
    const bNamed = bp.name != null;
    if (aNamed !== bNamed) return aNamed ? -1 : 1;
    const aHeight = typeof ap.heightM === 'number' ? ap.heightM : -Infinity;
    const bHeight = typeof bp.heightM === 'number' ? bp.heightM : -Infinity;
    if (aHeight !== bHeight) return bHeight - aHeight;
    return Number(ap.osmId) - Number(bp.osmId);
  };
  const result: GeoLayer['features'] = [];
  for (const feats of groups.values()) {
    result.push(...[...feats].sort(compare).slice(0, cap));
  }
  return result;
}

/** Wikidata: every item that is an instance of "nuclear power plant" (Q134447) with coordinates. */
const nuclearPlants: Adapter = {
  id: 'nuclear-plants',
  async run(now) {
    const query = `SELECT ?plant ?plantLabel ?countryLabel ?coord ?capacity ?statusLabel ?opened WHERE {
  ?plant wdt:P31 wd:Q134447 ; wdt:P625 ?coord .
  OPTIONAL { ?plant wdt:P17 ?country }
  OPTIONAL { ?plant wdt:P2109 ?capacity }
  OPTIONAL { ?plant wdt:P5817 ?status }
  OPTIONAL { ?plant wdt:P1619 ?opened }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
} LIMIT 1500`;
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'Watchboard/geo-refresh (https://watchboard.dev)' } });
    if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
    const rows: any[] = (await res.json()).results.bindings;
    const features = wikidataPlantsToFeatures(rows);
    return {
      type: 'FeatureCollection',
      _provenance: {
        id: 'nuclear-plants', source: 'Wikidata', url: 'https://query.wikidata.org/', license: 'CC0 1.0',
        attribution: 'Nuclear power plants: Wikidata (CC0)', retrievedAt: now,
        transform: 'SPARQL: instances of Q134447 with P625; label, country, P2109 capacity, P5817 status, P1619 opened',
        featureCount: features.length,
      },
      features,
    };
  },
};

/** TeleGeography's public cable geometry, as served by submarinecablemap.com. */
const submarineCables: Adapter = {
  id: 'submarine-cables',
  async run(now) {
    const url = 'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
    const res = await fetch(url, { headers: { 'User-Agent': 'Watchboard/geo-refresh (https://watchboard.dev)' } });
    if (!res.ok) throw new Error(`submarinecablemap HTTP ${res.status}`);
    const fc = await res.json();
    const features = cableGeoToFeatures(fc);
    return {
      type: 'FeatureCollection',
      _provenance: {
        id: 'submarine-cables', source: 'TeleGeography Submarine Cable Map', url,
        license: 'CC BY-NC-SA 3.0', attribution: 'Submarine cables © TeleGeography (submarinecablemap.com), CC BY-NC-SA 3.0', retrievedAt: now,
        transform: 'Line geometries and name/color only; landing points dropped',
        featureCount: features.length,
      },
      features,
    };
  },
};

/** Ten maritime chokepoints, curated (coordinates from public reference works). */
const CHOKEPOINTS = [
  ['Strait of Hormuz', 56.50, 26.57, 'Persian Gulf ↔ Gulf of Oman; ~20% of global oil trade'],
  ['Bab-el-Mandeb', 43.33, 12.58, 'Red Sea ↔ Gulf of Aden; Suez route'],
  ['Suez Canal', 32.35, 30.45, 'Mediterranean ↔ Red Sea'],
  ['Strait of Malacca', 100.90, 2.50, 'Indian Ocean ↔ South China Sea'],
  ['Taiwan Strait', 119.80, 24.30, 'East China Sea ↔ South China Sea'],
  ['Bosporus', 29.05, 41.12, 'Black Sea ↔ Sea of Marmara'],
  ['Dardanelles', 26.40, 40.20, 'Sea of Marmara ↔ Aegean'],
  ['Strait of Gibraltar', -5.60, 35.95, 'Atlantic ↔ Mediterranean'],
  ['Panama Canal', -79.80, 9.10, 'Atlantic ↔ Pacific'],
  ['Danish Straits', 10.80, 55.90, 'Baltic ↔ North Sea'],
] as const;

const chokepoints: Adapter = {
  id: 'maritime-chokepoints',
  async run(now) {
    const features = CHOKEPOINTS.map(([name, lon, lat, note], i) => ({
      type: 'Feature' as const,
      id: `cp-${i + 1}`,
      properties: { name, note },
      geometry: { type: 'Point' as const, coordinates: [lon, lat] },
    }));
    return {
      type: 'FeatureCollection',
      _provenance: {
        id: 'maritime-chokepoints', source: 'Watchboard curated (EIA "World Oil Transit Chokepoints", CIA World Factbook)',
        url: 'https://www.eia.gov/international/analysis/special-topics/World_Oil_Transit_Chokepoints',
        license: 'MIT (Watchboard curated data)', attribution: 'Chokepoints: Watchboard curated, after EIA/CIA reference works', retrievedAt: now,
        transform: 'Hand-curated centre points',
        featureCount: features.length,
      },
      features,
    };
  },
};

/** Union of `map.radioCountryCodes` from every tracker that opted into the "radio-towers" layer. */
function radioTowerCountryCodes(): string[] {
  const codes = new Set<string>();
  for (const t of loadAllTrackers()) {
    if (!t.map?.staticLayers?.includes('radio-towers')) continue;
    for (const c of t.map.radioCountryCodes ?? []) codes.add(c);
  }
  return [...codes];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** True when an Overpass response body is a 200 carrying a server-side timeout, e.g. `{"remark":"runtime error: Query timed out in ... after 120 s.","elements":[]}`. Overpass answers these with HTTP 200, so status alone can't detect them. */
function isOverpassRuntimeError(body: any): boolean {
  return typeof body?.remark === 'string' && body.remark.includes('runtime error');
}

/**
 * Builds the combined query: resolve the country's ISO3166-1 area, count it
 * (`.a out count;`, so a caller can tell "area matched, zero towers" apart
 * from "area didn't match at all" in the same request), then the tower
 * nodes within it. `strict` includes `[admin_level=2]`; some ISO codes
 * (e.g. Palestine: `boundary=disputed`, no `admin_level` tag) only resolve
 * without it.
 */
function buildTowerAreaQuery(cc: string, strict: boolean): string {
  const areaFilter = strict ? `["ISO3166-1"="${cc}"][admin_level=2]` : `["ISO3166-1"="${cc}"]`;
  return `[out:json][timeout:120];area${areaFilter}->.a;.a out count;node["man_made"~"^(tower|mast)$"]["communication:radio"]["communication:radio"!~"^no$"](area.a);out body;`;
}

/**
 * Splits an Overpass response's `elements` into the `.a out count;` result
 * and the actual node elements. `areaCount` is `null` (not `0`) when no
 * `type: "count"` element is present — e.g. a query that never asked for a
 * count — so callers only treat an explicit, measured zero as "no area
 * matched", never the absence of the question.
 */
function splitAreaCountAndNodes(elements: any[]): { areaCount: number | null; nodes: any[] } {
  let areaCount: number | null = null;
  const nodes: any[] = [];
  for (const el of elements) {
    if (el?.type === 'count') areaCount = Number(el.tags?.areas ?? el.tags?.total ?? 0);
    else nodes.push(el);
  }
  return { areaCount, nodes };
}

/**
 * One Overpass area+count+nodes query for a country's ISO 3166-1 code.
 * Retries once after 30s when the response is HTTP 429/504, *or* HTTP 200
 * with a `remark` reporting a server-side "runtime error" (Overpass's own
 * [timeout:…] budget exceeded) — that shape is a failure disguised as
 * success and must not be read as "zero towers". If it still fails after
 * the retry, throws (the caller then fails the whole adapter, leaving the
 * previous file untouched).
 *
 * Separately: `["ISO3166-1"="<cc>"][admin_level=2]` can match *zero areas*
 * with a clean HTTP 200 — the query succeeds, it just resolved nothing (e.g.
 * Palestine's OSM relation is `boundary=disputed` without an `admin_level`
 * tag). That is a failed lookup, not "the country has zero towers", so when
 * the strict selector's measured area count is 0, this retries once more
 * with the country code alone (no `admin_level` filter); if that also
 * measures zero areas, it throws instead of silently returning `[]`.
 *
 * `sleepFn` is injectable so tests don't wait 30s.
 */
export async function fetchOverpassCountryTowers(cc: string, sleepFn: (ms: number) => Promise<void> = sleep): Promise<any[]> {
  const doFetch = (query: string) => fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'User-Agent': 'Watchboard/geo-refresh (https://watchboard.dev)', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  // One attempt for a given query: returns the area count + node elements,
  // or a retryable reason string when the response is a 429/504 or a
  // disguised-as-200 Overpass runtime error.
  const attempt = async (query: string): Promise<{ areaCount: number | null; nodes: any[] } | { retryReason: string }> => {
    const res = await doFetch(query);
    if (res.status === 429 || res.status === 504) return { retryReason: `HTTP ${res.status}` };
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status} for ${cc}`);
    const body = await res.json();
    if (isOverpassRuntimeError(body)) return { retryReason: `runtime error: ${body.remark}` };
    return splitAreaCountAndNodes(body.elements ?? []);
  };

  // One area selector (strict or fallback), with the 429/504/runtime-error
  // retry-once behavior above — independent of the area-empty fallback below.
  const runSelector = async (strict: boolean): Promise<{ areaCount: number | null; nodes: any[] }> => {
    const query = buildTowerAreaQuery(cc, strict);
    let result = await attempt(query);
    if ('retryReason' in result) {
      await sleepFn(30_000);
      result = await attempt(query);
      if ('retryReason' in result) throw new Error(`Overpass failed for ${cc} after retry (${result.retryReason})`);
    }
    return result;
  };

  let { areaCount, nodes } = await runSelector(true);
  if (areaCount === 0) {
    ({ areaCount, nodes } = await runSelector(false));
    if (areaCount === 0) throw new Error(`Overpass matched no area for ISO3166-1=${cc} (tried with and without admin_level=2) — a code that matches no area is a failed lookup, not zero towers`);
  }
  return nodes;
}

/**
 * Overpass: communication towers/masts (radio broadcast, not generic cell
 * masts — communication:radio must be set), one area query per country code
 * declared by every tracker with "radio-towers" in map.staticLayers. Queries
 * are spaced ≥5s apart; a country whose query still fails after one 30s
 * retry fails the whole adapter (main() then leaves the previous file
 * untouched). Deduped by OSM id (first country wins), then capped at 800
 * towers per country.
 */
const radioTowers: Adapter = {
  id: 'radio-towers',
  async run(now) {
    const codes = radioTowerCountryCodes();
    if (codes.length === 0) throw new Error('no tracker has "radio-towers" in map.staticLayers');
    const seen = new Map<string, GeoLayer['features'][number]>();
    for (let i = 0; i < codes.length; i++) {
      if (i > 0) await sleep(5_000);
      const cc = codes[i];
      const elements = await fetchOverpassCountryTowers(cc);
      for (const f of overpassTowersToFeatures(elements, cc)) {
        const id = String(f.id);
        if (!seen.has(id)) seen.set(id, f);
      }
    }
    const cap = 800;
    const features = capTowersPerCountry([...seen.values()], cap);
    return {
      type: 'FeatureCollection',
      _provenance: {
        id: 'radio-towers', source: 'OpenStreetMap (Overpass API)', url: 'https://overpass-api.de/api/interpreter',
        license: 'ODbL 1.0', attribution: 'Radio towers: © OpenStreetMap contributors, ODbL', retrievedAt: now,
        transform: `Per-country Overpass area queries (ISO3166-1: ${codes.join(', ')}) for nodes tagged man_made=tower|mast with communication:radio set, deduped by OSM id, capped at ${cap} towers per country (named first, then heightM descending, then osmId ascending)`,
        featureCount: features.length,
      },
      features,
    };
  },
};

// Two-part match (not a single regex): station names put the unit word
// ("FM"/"MHz") after other text, e.g. "101.5 Kiss FM" — a single regex
// requiring the unit immediately after the number misses that case.
const FREQ_NUM_RE = /\b(\d{2,3}(?:\.\d{1,2})?)\b/;
const FREQ_UNIT_RE = /\b(?:fm|mhz)\b/i;

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
    const name = String(r.name ?? '');
    const numMatch = FREQ_NUM_RE.exec(name);
    const freqLabel = numMatch && FREQ_UNIT_RE.test(name) ? `${numMatch[1]} FM` : null;
    return [{
      type: 'Feature' as const,
      id: uuid,
      properties: {
        stationUuid: uuid,
        name: r.name ?? uuid,
        country: r.country ?? null,
        countryCode: r.countrycode ?? null,
        language: r.language || null,
        freqLabel,
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
      const res = await fetch(`https://all.api.radio-browser.info/json/stations/bycountrycodeexact/${cc}?hidebroken=true&is_https=true`, {
        headers: { 'User-Agent': 'Watchboard/geo-refresh (https://watchboard.dev)' },
      });
      if (!res.ok) throw new Error(`radio-browser HTTP ${res.status} for ${cc}`);
      rows.push(...(await res.json()));
    }
    const features = applyRadioOverrides(radioBrowserToFeatures(rows), loadRadioOverrides());
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

/** Worldwide station layer for the homepage globe: top 500 by votes, same HTTPS/MP3/AAC/geo filters as the per-tracker layer, no country scoping. */
const radioStationsGlobal: Adapter = {
  id: 'radio-stations-global',
  async run(now) {
    const url = 'https://all.api.radio-browser.info/json/stations/search?has_geo_info=true&is_https=true&hidebroken=true&order=votes&reverse=true&limit=500';
    const res = await fetch(url, { headers: { 'User-Agent': 'Watchboard/geo-refresh (https://watchboard.dev)' } });
    if (!res.ok) throw new Error(`radio-browser HTTP ${res.status}`);
    const rows: any[] = await res.json();
    const features = applyRadioOverrides(radioBrowserToFeatures(rows), loadRadioOverrides());
    return {
      type: 'FeatureCollection',
      _provenance: {
        id: 'radio-stations-global', source: 'radio-browser.info', url,
        license: 'PDDL 1.0 (directory); each stream is subject to its own broadcaster terms', attribution: 'Stations: radio-browser.info community directory (PDDL 1.0)', retrievedAt: now,
        transform: 'top 500 by votes worldwide, HTTPS MP3/AAC with geo coordinates',
        featureCount: features.length,
      },
      features,
    };
  },
};

const ADAPTERS: Adapter[] = [nuclearPlants, submarineCables, chokepoints, radioTowers, radioStations, radioStationsGlobal];

export function validateLayerFile(path: string): GeoLayer {
  return GeoLayerSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const only = args.includes('--layer') ? args[args.indexOf('--layer') + 1] : null;
  mkdirSync(OUT_DIR, { recursive: true });
  if (args.includes('--check')) {
    let bad = 0;
    for (const a of ADAPTERS) {
      const p = resolve(OUT_DIR, `${a.id}.geojson`);
      if (!existsSync(p)) { console.error(`[geo] missing ${p}`); bad++; continue; }
      try { const l = validateLayerFile(p); console.log(`[geo] ok ${a.id}: ${l.features.length} features, retrieved ${l._provenance.retrievedAt}`); }
      catch (e) { console.error(`[geo] invalid ${a.id}: ${(e as Error).message}`); bad++; }
    }
    process.exit(bad ? 1 : 0);
  }
  const now = new Date().toISOString();
  let failed = 0;
  for (const a of ADAPTERS) {
    if (only && a.id !== only) continue;
    try {
      const layer = GeoLayerSchema.parse(await a.run(now));
      if (layer.features.length === 0) throw new Error('adapter returned no features; refusing to overwrite');
      const out = resolve(OUT_DIR, `${a.id}.geojson`);
      writeFileSync(out, JSON.stringify(layer) + '\n');
      console.log(`[geo] wrote ${a.id}: ${layer.features.length} features → ${out} (${(Buffer.byteLength(JSON.stringify(layer)) / 1024).toFixed(0)} KB)`);
    } catch (e) {
      console.error(`[geo] ${a.id} failed: ${(e as Error).message}`);
      failed++;
    }
  }
  process.exit(failed ? 1 : 0);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
