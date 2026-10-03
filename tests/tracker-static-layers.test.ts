import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TrackerConfigSchema } from '../src/lib/tracker-config.js';

/**
 * IntelMap.tsx and CesiumGlobe.tsx hard-code exactly three static-layer
 * slots (staticLayers[0], [1], [2] — see useStaticGeoLayer /
 * useStaticGeoLayerData call sites). A tracker.json declaring a 4th entry in
 * map.staticLayers would silently render nothing for it: no toggle, no
 * error, no failing test. This guards the ceiling so a future addition to
 * any tracker's staticLayers fails loudly here instead of shipping mute.
 *
 * The corpus is read straight off disk, NOT through loadAllTrackers(): both
 * registries (src/lib/tracker-registry.ts, scripts/lib/load-trackers-node.ts)
 * console.error and DROP a tracker whose config fails TrackerConfigSchema.
 * Since the schema caps staticLayers at 3, a tracker with 4 would vanish from
 * the registry (and from getStaticPaths, with a green build), and a
 * registry-fed guard would pass for nothing.
 */
type RawTracker = {
  slug: string;
  json: unknown;
  map?: { staticLayers?: string[]; radioCountryCodes?: string[] };
};

const trackersDir = fileURLToPath(new URL('../trackers', import.meta.url));
const trackers: RawTracker[] = readdirSync(trackersDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(trackersDir, e.name, 'tracker.json')))
  .map((e) => {
    const json = JSON.parse(readFileSync(join(trackersDir, e.name, 'tracker.json'), 'utf8')) as {
      map?: RawTracker['map'];
    };
    return { slug: e.name, json, map: json.map };
  });

describe('every trackers/*/tracker.json passes TrackerConfigSchema', () => {
  it('reads a non-trivial raw corpus, so this test cannot pass vacuously', () => {
    expect(trackers.length).toBeGreaterThan(50);
  });

  it('no tracker.json would be silently dropped by loadAllTrackers()', () => {
    const failures = trackers.flatMap((t) => {
      const r = TrackerConfigSchema.safeParse(t.json);
      return r.success
        ? []
        : [`${t.slug}: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`];
    });
    expect(
      failures,
      `tracker.json files failing TrackerConfigSchema (the registries drop these without failing the build):\n${failures.join('\n')}`,
    ).toEqual([]);
  });
});

describe('map.staticLayers respects the 3-slot UI ceiling', () => {
  it('reads a non-trivial corpus, so this test cannot pass vacuously', () => {
    expect(trackers.length).toBeGreaterThan(50);
  });

  it('no tracker declares more than 3 entries in map.staticLayers', () => {
    const offenders = trackers
      .filter((t) => (t.map?.staticLayers?.length ?? 0) > 3)
      .map((t) => `${t.slug} (${t.map?.staticLayers?.length})`);
    expect(offenders, `trackers exceeding the 3-slot static layer ceiling: ${offenders.join(', ')}`).toEqual([]);
  });
});

/**
 * radio-towers/radio-stations are filtered by properties.countryCode against
 * map.radioCountryCodes (src/lib/radio-icons.ts `filterByCountry`) — a
 * tracker with the layer enabled but no radioCountryCodes gets zero radio
 * pins by design (never "show every station on Earth"), which would look
 * exactly like a silently broken layer to a reader. This guards against
 * shipping that misconfiguration: the layer and the codes must be declared
 * together.
 */
describe('radio-towers/radio-stations require map.radioCountryCodes', () => {
  it('every tracker with radio-towers or radio-stations in map.staticLayers declares a non-empty map.radioCountryCodes', () => {
    const offenders = trackers
      .filter((t) => {
        const sl = t.map?.staticLayers ?? [];
        return sl.includes('radio-towers') || sl.includes('radio-stations');
      })
      .filter((t) => (t.map?.radioCountryCodes?.length ?? 0) === 0)
      .map((t) => t.slug);
    expect(offenders, `trackers with a radio layer but no map.radioCountryCodes (would render zero radio pins): ${offenders.join(', ')}`).toEqual([]);
  });

  it('loads a non-trivial radio-layer corpus, so the check above cannot pass vacuously', () => {
    const radioTrackers = trackers.filter((t) => {
      const sl = t.map?.staticLayers ?? [];
      return sl.includes('radio-towers') || sl.includes('radio-stations');
    });
    expect(radioTrackers.length).toBeGreaterThan(15);
  });
});
