import { describe, it, expect } from 'vitest';
import { evaluate, type TrackerFreshness } from '../scripts/check-data-freshness.js';

const t = (slug: string, daysSince: number | null, cadenceDays = 1): TrackerFreshness => ({
  slug,
  lastRun: daysSince === null ? null : new Date(Date.now() - daysSince * 86_400_000).toISOString(),
  daysSince,
  cadenceDays,
  overdueRatio: daysSince === null ? null : daysSince / cadenceDays,
});

describe('check-data-freshness', () => {
  it('is healthy when the fleet is moving', () => {
    const r = evaluate([t('a', 0), t('b', 1), t('c', 5)]);
    expect(r.healthy).toBe(true);
    expect(r.reasons).toEqual([]);
    expect(r.freshest?.slug).toBe('a');
    expect(r.stalest?.slug).toBe('c');
  });

  it('reports when nothing has been updated recently', () => {
    // This is the shape of the outage that ran undetected for two weeks:
    // agents never ran, so no tracker advanced at all.
    const r = evaluate([t('a', 14), t('b', 20), t('c', 30)]);
    expect(r.healthy).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/Nothing updated in 14d/);
  });

  it('tolerates individual quiet trackers while the fleet moves', () => {
    // Historical arcs legitimately go silent — one stale tracker is not an alert.
    const fleet = Array.from({ length: 20 }, (_, i) => t(`live-${i}`, 1));
    const r = evaluate([...fleet, t('tlatelolco-1968', 400, 365)]);
    expect(r.healthy).toBe(true);
  });

  it('catches a slow bleed where most of the fleet drifts past its horizon', () => {
    // A couple of trackers keep the primary check satisfied while everything
    // else silently rots — the state this repo was actually in.
    const stale = Array.from({ length: 19 }, (_, i) => t(`stale-${i}`, 60, 7));
    const r = evaluate([...stale, t('fresh', 0)]);
    expect(r.healthy).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/past their own configured cadence/);
  });

  it('treats an unknown lastRun as stale rather than healthy', () => {
    const r = evaluate([t('a', null), t('b', null)]);
    expect(r.healthy).toBe(false);
    expect(r.staleCount).toBe(2);
  });

  it('judges each tracker against its own cadence, not a flat day count', () => {
    // The exact pair the flat 30-day threshold could not tell apart: a 7-day
    // tracker 66 days behind is badly stalled (9.4x); a 180-day arc 88 days
    // behind is early. Measured against a flat 30 days both look identical.
    const stalled = t('uap-disclosure', 66, 7);
    const healthy = t('september-11', 88, 180);
    expect(stalled.overdueRatio).toBeGreaterThan(2);
    expect(healthy.overdueRatio).toBeLessThan(1);

    // A fleet of slow arcs sitting inside their cadence must not alarm, even
    // though every one of them is far past 30 days.
    const arcs = Array.from({ length: 20 }, (_, i) => t(`arc-${i}`, 88, 180));
    expect(evaluate([t('live', 0, 1), ...arcs]).healthy).toBe(true);
  });

  it('reports rather than passing when there are no trackers', () => {
    const r = evaluate([]);
    expect(r.healthy).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/No active trackers/);
  });
});
