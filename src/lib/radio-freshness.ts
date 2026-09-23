/**
 * radio-freshness.ts — turns a static layer's `_provenance.countries`
 * (populated for `radio-towers` by `scripts/geo/refresh-layers.ts`'s
 * per-country merge) into display rows for the `/sources` page. Pure: no
 * DOM, no fetch, `now` is injected so it's trivially testable.
 */
import { RADIO_TOWERS_MAX_AGE_DAYS, type GeoLayerProvenance } from './geo-layer-schema';

export interface CountryFreshnessRow {
  code: string;
  count: number;
  /** 'YYYY-MM-DD' of the last successful fetch, or 'never'. */
  lastFetched: string;
  /** Days since the last successful fetch; null if it never succeeded. */
  ageDays: number | null;
  status: 'fresh' | 'stale';
  /** null retrievedAt, or older than RADIO_TOWERS_MAX_AGE_DAYS — same rule as assessRadioTowerHealth. */
  overdue: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_AGE_MS = RADIO_TOWERS_MAX_AGE_DAYS * MS_PER_DAY;

/**
 * Builds per-country freshness rows from a layer's provenance. Returns []
 * when `prov` is missing or has no `countries` (every layer except
 * `radio-towers`, and any `radio-towers.geojson` written before per-country
 * provenance existed). Sorted stale/overdue rows first, then by code —
 * within each group, alphabetically by code.
 */
export function countryFreshnessRows(
  prov: Pick<GeoLayerProvenance, 'countries'> | null | undefined,
  now: Date,
): CountryFreshnessRow[] {
  const countries = prov?.countries;
  if (!countries) return [];

  const nowMs = now.getTime();
  const rows: CountryFreshnessRow[] = Object.entries(countries).map(([code, c]) => {
    const ageMs = c.retrievedAt ? nowMs - new Date(c.retrievedAt).getTime() : null;
    const ageDays = ageMs === null ? null : Math.floor(ageMs / MS_PER_DAY);
    const overdue = ageMs === null || ageMs > MAX_AGE_MS;
    return {
      code,
      count: c.count,
      lastFetched: c.retrievedAt ? c.retrievedAt.slice(0, 10) : 'never',
      ageDays,
      status: c.status,
      overdue,
    };
  });

  rows.sort((a, b) => {
    const aUnhealthy = a.overdue || a.status === 'stale';
    const bUnhealthy = b.overdue || b.status === 'stale';
    if (aUnhealthy !== bUnhealthy) return aUnhealthy ? -1 : 1;
    return a.code.localeCompare(b.code);
  });

  return rows;
}
