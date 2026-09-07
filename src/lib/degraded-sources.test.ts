import { describe, it, expect } from 'vitest';
import { collectDegraded, layerIdForKey, type HealthStatus } from './degraded-sources';
import type { LiveResult } from './live-source';

const r = (status: LiveResult<unknown>['status'], updatedAt: number | null = null, error?: string): LiveResult<unknown> => ({ data: null, status, updatedAt, error });

const health: HealthStatus = {
  lastBuild: '2026-09-07T00:00:00Z',
  trackers: {
    'iran-conflict': { lastEvent: '2026-09-06', lastDigest: '2026-09-01', digestGap: 6, lastUpdated: '2026-09-06T00:00:00Z' },
    'ukraine-war': { lastEvent: '2026-09-07', lastDigest: '2026-09-07', digestGap: 0, lastUpdated: null },
  },
  digestGaps: ['iran-conflict'],
  healthy: false,
};

describe('layerIdForKey', () => {
  it('maps hook cache keys to registry ids', () => {
    expect(layerIdForKey('quakes:2026-09-07:world')).toBe('earthquakes');
    expect(layerIdForKey('flights:1,2,3,4')).toBe('flights');
    expect(layerIdForKey('static-geo:nuclear-plants')).toBe('nuclear-plants');
    expect(layerIdForKey('unknown')).toBe('unknown');
  });
});

describe('collectDegraded', () => {
  it('returns nothing when everything is ok and no digest gap', () => {
    const out = collectDegraded([{ key: 'quakes:x', result: r('ok', 1) }], health, 'ukraine-war');
    expect(out).toEqual([]);
  });
  it('lists stale/error/rate-limited layers once, worst status wins', () => {
    const out = collectDegraded([
      { key: 'flights:a', result: r('stale', 100) },
      { key: 'flights:b', result: r('error', 50, 'HTTP 502') },
      { key: 'quakes:x', result: r('ok', 1) },
      { key: 'weather:d:g', result: r('rate-limited', 7) },
    ], null, 'ukraine-war');
    expect(out.map((i) => [i.id, i.status])).toEqual([
      ['flights', 'error'],
      ['weather', 'rate-limited'],
    ]);
    const flights = out.find((i) => i.id === 'flights')!;
    expect(flights.lastGoodAt).toBe(100);
    expect(flights.detail).toBe('HTTP 502');
    expect(flights.labelKey).toBe('layers.flights');
  });
  it('same layer at equal severity keeps one item with the newest good timestamp and the first error text', () => {
    const out = collectDegraded([
      { key: 'flights:a', result: r('stale', 100, 'first') },
      { key: 'flights:b', result: r('stale', 300, 'second') },
      { key: 'flights:c', result: r('stale', 200) },
    ], null, 't');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'flights', status: 'stale', lastGoodAt: 300, detail: 'first' });
    // A worse status replaces the entry but never loses the best timestamp.
    const worse = collectDegraded([
      { key: 'flights:a', result: r('stale', 900) },
      { key: 'flights:b', result: r('error', 10, 'HTTP 500') },
    ], null, 't');
    expect(worse[0]).toMatchObject({ status: 'error', lastGoodAt: 900, detail: 'HTTP 500' });
  });
  it('adds a digest-gap item from health for this tracker only', () => {
    const iran = collectDegraded([], health, 'iran-conflict');
    expect(iran).toHaveLength(1);
    expect(iran[0]).toMatchObject({ kind: 'digest', status: 'gap', lastGoodAt: Date.parse('2026-09-01') });
    expect(collectDegraded([], health, 'ukraine-war')).toEqual([]);
    expect(collectDegraded([], health, 'not-a-tracker')).toEqual([]);
  });
  it('ignores loading/idle/disabled', () => {
    const out = collectDegraded([
      { key: 'quakes:x', result: r('loading') },
      { key: 'satellites:tle', result: r('disabled') },
      { key: 'deepstate:frontline', result: r('idle') },
    ], null, 't');
    expect(out).toEqual([]);
  });
});
