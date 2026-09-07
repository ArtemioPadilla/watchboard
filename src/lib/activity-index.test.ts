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
  // Nothing saturates here, so every weight shows through in the exact score.
  mid: { events: [ev(1, 2), ev(3, 3), ev(5, 1), ev(2, 2)], breaking: false, lastUpdated: day(1), sectionsUpdatedCount: 2, kpiDeltaCount: 1, latestDigestDate: day(3), temporal: 'live', updateIntervalDays: 1 },
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
  it('pins exact contributions for a mid-activity tracker (weight changes fail here)', () => {
    const a = computeActivity(FIXTURES.mid, NOW);
    const byName = Object.fromEntries(a.factors.map((f) => [f.name, f]));
    expect(byName.recentEvents).toMatchObject({ value: 4, contribution: 14 });          // 4/10 × 35
    expect(byName.breaking.contribution).toBe(0);
    expect(byName.digestFreshness.contribution).toBeCloseTo(15 * (1 - (3.5 - 1) / 7), 1); // bare date = UTC midnight → 3.5 d old at noon; 1 d cadence, 7 d window
    expect(byName.sectionsUpdated).toMatchObject({ value: 2, contribution: 4 });        // 2/5 × 10
    expect(byName.kpiDeltas).toMatchObject({ value: 1, contribution: 3.33 });           // 1/3 × 10
    expect(byName.sourceQuality).toMatchObject({ value: 2, contribution: 6.67 });       // mean tier 2 → (4-2)/3 × 10
    expect(a.score).toBe(38); // 14 + 0 + 9.64 + 4 + 3.33 + 6.67
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
    expect(activityWindowDays({ temporal: 'live', updateIntervalDays: 10 })).toBe(7);
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
