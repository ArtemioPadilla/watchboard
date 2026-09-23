import { describe, it, expect } from 'vitest';
import { countryFreshnessRows } from './radio-freshness';
import type { CountryProvenance } from './geo-layer-schema';

const NOW = new Date('2026-09-22T00:00:00Z');

const countries = (overrides: Record<string, CountryProvenance>) => ({ countries: overrides });

describe('countryFreshnessRows', () => {
  it('returns [] when prov is null/undefined or has no countries field', () => {
    expect(countryFreshnessRows(null, NOW)).toEqual([]);
    expect(countryFreshnessRows(undefined, NOW)).toEqual([]);
    expect(countryFreshnessRows({} as never, NOW)).toEqual([]);
  });

  it('maps a fresh, recently-retrieved country', () => {
    const prov = countries({
      MX: { retrievedAt: '2026-09-20T12:00:00Z', count: 42, status: 'fresh' },
    });
    const rows = countryFreshnessRows(prov, NOW);
    expect(rows).toEqual([
      { code: 'MX', count: 42, lastFetched: '2026-09-20', ageDays: 1, status: 'fresh', overdue: false },
    ]);
  });

  it('never-retrieved country: lastFetched "never", ageDays null, overdue true', () => {
    const prov = countries({
      YE: { retrievedAt: null, count: 0, status: 'stale' },
    });
    const rows = countryFreshnessRows(prov, NOW);
    expect(rows).toEqual([
      { code: 'YE', count: 0, lastFetched: 'never', ageDays: null, status: 'stale', overdue: true },
    ]);
  });

  it('overdue boundary: exactly 35 days is not overdue, 36 days is', () => {
    const prov = countries({
      AT: { retrievedAt: '2026-08-18T00:00:00Z', count: 5, status: 'fresh' }, // 35 days before NOW
      BE: { retrievedAt: '2026-08-17T00:00:00Z', count: 5, status: 'fresh' }, // 36 days before NOW
    });
    const rows = countryFreshnessRows(prov, NOW);
    const at = rows.find((r) => r.code === 'AT')!;
    const be = rows.find((r) => r.code === 'BE')!;
    expect(at.overdue).toBe(false);
    expect(be.overdue).toBe(true);
  });

  it('sorts stale/overdue rows first, then by code within each group', () => {
    const prov = countries({
      ZW: { retrievedAt: '2026-09-21T00:00:00Z', count: 3, status: 'fresh' },
      AA: { retrievedAt: null, count: 0, status: 'stale' },
      MM: { retrievedAt: '2026-01-01T00:00:00Z', count: 9, status: 'stale' },
      BB: { retrievedAt: '2026-09-21T00:00:00Z', count: 1, status: 'fresh' },
    });
    const rows = countryFreshnessRows(prov, NOW);
    expect(rows.map((r) => r.code)).toEqual(['AA', 'MM', 'BB', 'ZW']);
  });
});
