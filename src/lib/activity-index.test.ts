import { describe, it, expect } from 'vitest';
import { ACTIVITY_WEIGHTS, activityWindowDays, computeActivity, countKpiDeltas, describeFactors, type ActivityInput } from './activity-index';

const NOW = new Date('2026-09-07T12:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);
const ev = (n: number, tier = 2) => ({ date: day(n), sources: [{ tier }] });

const FIXTURES: Record<string, ActivityInput> = {
  breaking: { events: Array.from({ length: 12 }, (_, i) => ev(i % 6, 1)), breaking: true, lastUpdated: NOW.toISOString(), sectionsUpdatedCount: 6, kpiDeltaCount: 3, latestDigestDate: day(0), temporal: 'live', updateIntervalDays: 1 },
  quiet: { events: [ev(20), ev(45)], breaking: false, lastUpdated: day(20), sectionsUpdatedCount: 1, kpiDeltaCount: 0, latestDigestDate: day(20), temporal: 'live', updateIntervalDays: 1 },
  historical: { events: [ev(10, 3), ev(25, 3)], breaking: false, lastUpdated: day(10), sectionsUpdatedCount: 2, kpiDeltaCount: 1, latestDigestDate: day(10), temporal: 'historical', updateIntervalDays: 14 },
  noDigest: { events: [ev(1), ev(2)], breaking: false, lastUpdated: day(1), sectionsUpdatedCount: 1, latestDigestDate: null, temporal: 'live', updateIntervalDays: 1 },
  noEvents: { events: [], breaking: false, lastUpdated: null, latestDigestDate: day(0), temporal: 'live', updateIntervalDays: 1 },
};

describe('ACTIVITY_WEIGHTS', () => {
  it('sum to 100', () => {
    expect(Object.values(ACTIVITY_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe('computeActivity', () => {
  it('breaking tracker scores near the top with every factor visible', () => {
    const a = computeActivity(FIXTURES.breaking, NOW);
    expect(a.score).toBeGreaterThanOrEqual(95);
    expect(a.factors.map((f) => f.name)).toEqual(['recentEvents', 'breaking', 'digestFreshness', 'sectionsUpdated', 'kpiDeltas', 'sourceQuality']);
    for (const f of a.factors) expect(f.contribution).toBeLessThanOrEqual(f.weight);
    expect(a.factors.find((f) => f.name === 'breaking')!.contribution).toBe(20);
  });
  it('quiet tracker scores low', () => {
    const a = computeActivity(FIXTURES.quiet, NOW);
    expect(a.score).toBeLessThan(15);
    expect(a.factors.find((f) => f.name === 'recentEvents')!.value).toBe(0);
  });
  it('historical tracker is normalised by its cadence', () => {
    const hist = computeActivity(FIXTURES.historical, NOW);
    expect(hist.windowDays).toBe(28);
    expect(hist.factors.find((f) => f.name === 'recentEvents')!.value).toBe(2);
    // The same data judged as a daily live tracker would see nothing recent.
    const asLive = computeActivity({ ...FIXTURES.historical, temporal: 'live', updateIntervalDays: 1 }, NOW);
    expect(asLive.factors.find((f) => f.name === 'recentEvents')!.value).toBe(0);
    expect(hist.score).toBeGreaterThan(asLive.score);
    expect(hist.factors.find((f) => f.name === 'digestFreshness')!.contribution).toBe(15);
  });
  it('missing digest contributes nothing and is reported as -1', () => {
    const a = computeActivity(FIXTURES.noDigest, NOW);
    const d = a.factors.find((f) => f.name === 'digestFreshness')!;
    expect(d.value).toBe(-1);
    expect(d.contribution).toBe(0);
    expect(a.score).toBeGreaterThan(0);
  });
  it('no events → no event or source points, digest still counts', () => {
    const a = computeActivity(FIXTURES.noEvents, NOW);
    expect(a.factors.find((f) => f.name === 'recentEvents')!.contribution).toBe(0);
    expect(a.factors.find((f) => f.name === 'sourceQuality')!.contribution).toBe(0);
    expect(a.score).toBe(15);
  });
  it('is deterministic for the same input and clock', () => {
    const a = computeActivity(FIXTURES.breaking, NOW);
    const b = computeActivity(JSON.parse(JSON.stringify(FIXTURES.breaking)), new Date(NOW));
    expect(b).toEqual(a);
  });
  it('ignores unparseable and far-future dates', () => {
    const a = computeActivity({ events: [{ date: 'yesterday' }, { date: day(-30) }, ev(0)], temporal: 'live' }, NOW);
    expect(a.factors.find((f) => f.name === 'recentEvents')!.value).toBe(1);
  });
});

describe('helpers', () => {
  it('activityWindowDays floors at 7', () => {
    expect(activityWindowDays({ temporal: 'live', updateIntervalDays: 1 })).toBe(7);
    expect(activityWindowDays({ temporal: 'live', updateIntervalDays: 10 })).toBe(10);
    expect(activityWindowDays({ temporal: 'historical', updateIntervalDays: 3 })).toBe(7);
    expect(activityWindowDays({ temporal: 'historical', updateIntervalDays: 30 })).toBe(60);
  });
  it('countKpiDeltas counts non-zero structured deltas only', () => {
    expect(countKpiDeltas([{ deltaDetail: { value: 2 } }, { deltaDetail: { value: 0 } }, {}, { deltaDetail: null }])).toBe(1);
    expect(countKpiDeltas(undefined)).toBe(0);
  });
  it('describeFactors lists only contributing factors', () => {
    const s = describeFactors(computeActivity(FIXTURES.noEvents, NOW));
    expect(s).toBe('digest 0.5d ago (+15)');
  });
});
