import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TrackerConfigSchema } from './tracker-config';

const ukraine = () => JSON.parse(readFileSync('trackers/ukraine-war/tracker.json', 'utf8'));

describe('map.staticLayers', () => {
  it('accepts the current maximum of 3 (ukraine-war)', () => {
    expect(TrackerConfigSchema.safeParse(ukraine()).success).toBe(true);
  });
  it('rejects a 4th layer instead of silently ignoring it (3 fixed render slots)', () => {
    const cfg = ukraine();
    cfg.map.staticLayers = [...cfg.map.staticLayers, 'submarine-cables'];
    const r = TrackerConfigSchema.safeParse(cfg);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('staticLayers');
  });
});
