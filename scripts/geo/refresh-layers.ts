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
      const query = `[out:json][timeout:90];(node["man_made"~"^(tower|mast)$"]["communication:radio"]["communication:radio"!~"^no$"](${b.latMin},${b.lonMin},${b.latMax},${b.lonMax}););out body;`;
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

const ADAPTERS: Adapter[] = [nuclearPlants, submarineCables, chokepoints, radioTowers, radioStations];

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
