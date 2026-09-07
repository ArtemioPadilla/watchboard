/**
 * gazetteer-node.ts — build the gazetteer from disk for tsx scripts.
 *
 * Reads every tracker.json + map-points.json and writes
 * scripts/state/gazetteer.json (gitignored; regenerated at the start of each
 * light scan — it takes well under a second for 125 trackers).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGazetteer, type Gazetteer, type GazetteerTrackerInput } from '../../src/lib/gazetteer.js';
import { loadAllTrackers } from './load-trackers-node.js';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..');
export const GAZETTEER_PATH = join(ROOT, 'scripts', 'state', 'gazetteer.json');

export function gazetteerInputs(): GazetteerTrackerInput[] {
  return loadAllTrackers().map((t) => {
    let points: GazetteerTrackerInput['points'] = [];
    const p = join(ROOT, 'trackers', t.slug, 'data', 'map-points.json');
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, 'utf8'));
        if (Array.isArray(raw)) points = raw.filter((x) => x && typeof x.label === 'string').map((x) => ({ label: x.label, lat: Number(x.lat), lon: Number(x.lon) }));
      } catch { /* unreadable file: contributes nothing */ }
    }
    return { slug: t.slug, country: t.country, city: t.city, state: t.state, map: t.map ? { center: t.map.center } : undefined, points };
  });
}

/** Build and persist; returns the gazetteer so callers need not re-read it. */
export function refreshGazetteerFile(path: string = GAZETTEER_PATH): Gazetteer {
  const gz = buildGazetteer(gazetteerInputs());
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(gz), 'utf8');
  return gz;
}

export function loadGazetteerFile(path: string = GAZETTEER_PATH): Gazetteer | null {
  try {
    const gz = JSON.parse(readFileSync(path, 'utf8')) as Gazetteer;
    return gz && gz.version === 1 && Array.isArray(gz.entries) ? gz : null;
  } catch {
    return null;
  }
}

// CLI: npx tsx scripts/lib/gazetteer-node.ts
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const gz = refreshGazetteerFile();
  const byKind = gz.entries.reduce<Record<string, number>>((acc, e) => { acc[e.kind] = (acc[e.kind] ?? 0) + 1; return acc; }, {});
  console.log(`gazetteer: ${gz.entries.length} entries (${JSON.stringify(byKind)}) → ${GAZETTEER_PATH}`);
}
