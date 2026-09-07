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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = resolve(ROOT, 'public/geo/layers');

type Adapter = { id: string; run: (now: string) => Promise<GeoLayer> };

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
    const seen = new Set<string>();
    const features = rows.flatMap(r => {
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
    if (!Array.isArray(fc?.features)) throw new Error('unexpected cable payload');
    const features = fc.features
      .filter((f: any) => f?.geometry?.type === 'MultiLineString' || f?.geometry?.type === 'LineString')
      .map((f: any) => ({
        type: 'Feature' as const,
        id: f.properties?.id ?? f.id,
        properties: { name: f.properties?.name ?? null, color: f.properties?.color ?? null, slug: f.properties?.slug ?? null },
        geometry: f.geometry,
      }));
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

const ADAPTERS: Adapter[] = [nuclearPlants, submarineCables, chokepoints];

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
