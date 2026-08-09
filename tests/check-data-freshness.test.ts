import { describe, it, expect } from 'vitest';
import { evaluate, type TrackerFreshness } from '../scripts/check-data-freshness.js';

const t = (slug: string, daysSince: number | null): TrackerFreshness => ({
  slug,
  lastRun: daysSince === null ? null : new Date(Date.now() - daysSince * 86_400_000).toISOString(),
  daysSince,
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
    const r = evaluate([...fleet, t('tlatelolco-1968', 400)]);
    expect(r.healthy).toBe(true);
  });

  it('catches a slow bleed where most of the fleet drifts past its horizon', () => {
    // A couple of trackers keep the primary check satisfied while everything
    // else silently rots — the state this repo was actually in.
    const stale = Array.from({ length: 19 }, (_, i) => t(`stale-${i}`, 60));
    const r = evaluate([...stale, t('fresh', 0)]);
    expect(r.healthy).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/have not been updated in 30d/);
  });

  it('treats an unknown lastRun as stale rather than healthy', () => {
    const r = evaluate([t('a', null), t('b', null)]);
    expect(r.healthy).toBe(false);
    expect(r.staleCount).toBe(2);
  });

  it('reports rather than passing when there are no trackers', () => {
    const r = evaluate([]);
    expect(r.healthy).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/No active trackers/);
  });
});
