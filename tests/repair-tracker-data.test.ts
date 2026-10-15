import { describe, it, expect } from 'vitest';
import { toCoordTuple, repairMapPoints, repairMapLines } from '../scripts/repair-tracker-data';
import { MapPointSchema, MapLineSchema } from '../src/lib/schemas';

/**
 * The hourly scan hard-fails on a schema error and discards the whole run. It
 * failed 6 of 23 runs in early October, always on the same two slips:
 *
 *   map-points.json  0.date : Required
 *   map-lines.json   0.from : Expected array, received object
 *
 * Both are mechanical. The nightly has a fix agent for this class; the hourly
 * had nothing.
 */
describe('toCoordTuple', () => {
  it('accepts an existing tuple unchanged', () => {
    expect(toCoordTuple([56.5, 27.3])).toEqual([56.5, 27.3]);
  });

  it('converts {lon, lat} to [lon, lat] — verified order, not assumed', () => {
    // 105 existing entries all have the second value inside [-90, 90], and
    // iran-conflict's [56.5, 27.3] can only be lon-first. Reversing this would
    // silently relocate events.
    expect(toCoordTuple({ lon: 56.5, lat: 27.3 })).toEqual([56.5, 27.3]);
  });

  it('accepts the lng and longitude spellings', () => {
    expect(toCoordTuple({ lng: 10, lat: 20 })).toEqual([10, 20]);
    expect(toCoordTuple({ longitude: 10, latitude: 20 })).toEqual([10, 20]);
  });

  it('refuses an impossible latitude rather than writing a bad point', () => {
    // If the model labelled them backwards, Zod failing is the right outcome.
    expect(toCoordTuple({ lon: 27.3, lat: 156.5 })).toBeNull();
  });

  it('returns null for anything it cannot read', () => {
    expect(toCoordTuple(null)).toBeNull();
    expect(toCoordTuple('56,27')).toBeNull();
    expect(toCoordTuple([1, 2, 3])).toBeNull();
    expect(toCoordTuple({ x: 1, y: 2 })).toBeNull();
  });
});

describe('repairMapPoints', () => {
  it('fills a missing date with the run date', () => {
    const rows: any[] = [{ id: 'a', lon: 1, lat: 2, cat: 'x', label: 'L' }];
    expect(repairMapPoints(rows, '2026-10-11')).toHaveLength(1);
    expect(rows[0].date).toBe('2026-10-11');
  });

  it('never overwrites a date the model got right', () => {
    const rows: any[] = [{ id: 'a', date: '2026-09-01' }];
    expect(repairMapPoints(rows, '2026-10-11')).toEqual([]);
    expect(rows[0].date).toBe('2026-09-01');
  });

  it('produces a row that actually passes the real schema', () => {
    const rows: any[] = [{ id: 'a', lon: 56.5, lat: 27.3, cat: 'strike', label: 'Site', sub: 'Radar site', tier: 2 }];
    repairMapPoints(rows, '2026-10-11');
    expect(MapPointSchema.safeParse(rows[0]).success).toBe(true);
  });
});

describe('repairMapLines', () => {
  it('converts object coordinates on both ends', () => {
    const rows: any[] = [{ id: 'l1', date: '2026-10-11', from: { lon: 56.5, lat: 27.3 }, to: { lon: 55.5, lat: 26.5 } }];
    expect(repairMapLines(rows, '2026-10-11')).toHaveLength(2);
    expect(rows[0].from).toEqual([56.5, 27.3]);
    expect(rows[0].to).toEqual([55.5, 26.5]);
  });

  it('leaves a correct line untouched', () => {
    const rows: any[] = [{ id: 'l1', date: '2026-10-11', from: [1, 2], to: [3, 4] }];
    expect(repairMapLines(rows, '2026-10-11')).toEqual([]);
  });

  it('fills a missing date, which MapLineSchema requires too', () => {
    const rows: any[] = [{ id: 'l1', from: [1, 2], to: [3, 4] }];
    expect(repairMapLines(rows, '2026-10-11').some((f) => f.field === 'date')).toBe(true);
    expect(rows[0].date).toBe('2026-10-11');
  });

  it('produces a line that passes the real schema', () => {
    const rows: any[] = [{
      id: 'l1', from: { lon: 56.5, lat: 27.3 }, to: { lon: 55.5, lat: 26.5 },
      label: 'Strike', cat: 'strike', weaponType: 'ballistic', time: '14:30',
    }];
    repairMapLines(rows, '2026-10-11');
    const r = MapLineSchema.safeParse(rows[0]);
    expect(r.success, JSON.stringify((r as any).error?.errors ?? [])).toBe(true);
  });
});
