import { describe, it, expect } from 'vitest';
import { loadAllTrackers } from '../scripts/lib/load-trackers-node.js';

/**
 * IntelMap.tsx and CesiumGlobe.tsx hard-code exactly three static-layer
 * slots (staticLayers[0], [1], [2] — see useStaticGeoLayer /
 * useStaticGeoLayerData call sites). A tracker.json declaring a 4th entry in
 * map.staticLayers would silently render nothing for it: no toggle, no
 * error, no failing test. This guards the ceiling so a future addition to
 * any tracker's staticLayers fails loudly here instead of shipping mute.
 */
const trackers = loadAllTrackers();

describe('map.staticLayers respects the 3-slot UI ceiling', () => {
  it('loads a non-trivial corpus, so this test cannot pass vacuously', () => {
    expect(trackers.length).toBeGreaterThan(50);
  });

  it('no tracker declares more than 3 entries in map.staticLayers', () => {
    const offenders = trackers
      .filter((t) => (t.map?.staticLayers?.length ?? 0) > 3)
      .map((t) => `${t.slug} (${t.map!.staticLayers!.length})`);
    expect(offenders, `trackers exceeding the 3-slot static layer ceiling: ${offenders.join(', ')}`).toEqual([]);
  });
});
