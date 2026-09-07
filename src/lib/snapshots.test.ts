import { describe, it, expect } from 'vitest';
import {
  NO_FLY_ZONES, GPS_JAMMING_ZONES, INTERNET_BLACKOUTS,
  NO_FLY_ZONES_PROVENANCE, GPS_JAMMING_PROVENANCE, INTERNET_BLACKOUTS_PROVENANCE,
  NoFlyZoneFileSchema, activeOn, flatLabel,
} from './snapshots';
import { getLiveLayer } from './live-layers';

describe('snapshot files', () => {
  it('load and validate with provenance', () => {
    expect(NO_FLY_ZONES.length).toBeGreaterThan(0);
    expect(GPS_JAMMING_ZONES.length).toBeGreaterThan(0);
    expect(INTERNET_BLACKOUTS.length).toBeGreaterThan(0);
    for (const p of [NO_FLY_ZONES_PROVENANCE, GPS_JAMMING_PROVENANCE, INTERNET_BLACKOUTS_PROVENANCE]) {
      expect(p.scope).toContain('iran-conflict');
      expect(p.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('agree with the live-layer registry on date and scope', () => {
    const pairs: [string, { snapshotDate: string; scope: string[] }][] = [
      ['nfz', NO_FLY_ZONES_PROVENANCE], ['gps-jamming', GPS_JAMMING_PROVENANCE], ['internet-blackouts', INTERNET_BLACKOUTS_PROVENANCE],
    ];
    for (const [id, prov] of pairs) {
      const spec = getLiveLayer(id);
      expect(spec?.kind).toBe('snapshot');
      if (spec?.kind === 'snapshot') {
        expect(spec.snapshotDate).toBe(prov.snapshotDate);
        expect(spec.scope).toEqual(prov.scope);
      }
    }
  });

  it('rejects duplicate ids, inverted date ranges and items newer than the snapshot', () => {
    const base = { _provenance: { source: 's', license: 'l', snapshotDate: '2026-03-01', scope: ['x'] } };
    const zone = { id: 'a', label: 'A', startDate: '2026-02-28', polygon: [[1, 1], [2, 2], [3, 1]], center: [2, 1.5], color: '#ff0000' };
    expect(NoFlyZoneFileSchema.safeParse({ ...base, items: [zone, zone] }).success).toBe(false);
    expect(NoFlyZoneFileSchema.safeParse({ ...base, items: [{ ...zone, endDate: '2026-02-01' }] }).success).toBe(false);
    expect(NoFlyZoneFileSchema.safeParse({ ...base, items: [{ ...zone, startDate: '2026-03-02' }] }).success).toBe(false);
    expect(NoFlyZoneFileSchema.safeParse({ ...base, items: [zone] }).success).toBe(true);
  });

  it('activeOn respects start and end dates', () => {
    const items = [{ id: 'a', startDate: '2026-03-01', endDate: '2026-03-05' }, { id: 'b', startDate: '2026-03-03' }];
    expect(activeOn(items, '2026-02-28').map(i => i.id)).toEqual([]);
    expect(activeOn(items, '2026-03-01').map(i => i.id)).toEqual(['a']);
    expect(activeOn(items, '2026-03-05').map(i => i.id)).toEqual(['a', 'b']);
    expect(activeOn(items, '2026-03-06').map(i => i.id)).toEqual(['b']);
    expect(flatLabel('A\nB')).toBe('A B');
  });
});
