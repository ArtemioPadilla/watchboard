import { describe, it, expect } from 'vitest';
import { lagDays, report, FRESH_DAYS, type LocaleLag } from './check-translation-freshness';

describe('lagDays', () => {
  const EN = '2026-10-19T03:00:00Z';

  it('counts whole days the translation trails the English', () => {
    expect(lagDays(EN, '2026-10-19T03:00:00Z')).toBe(0);
    expect(lagDays(EN, '2026-10-12T03:00:00Z')).toBe(7);
    // The real figure for every locale in the repo on 2026-10-19.
    expect(lagDays(EN, '2026-04-12T09:00:23.000Z')).toBe(189);
  });

  it('is measured against the English timestamp, not against now', () => {
    // A tracker nobody has updated in a year is a quiet tracker, not a stale
    // translation — counting from `now` would report every dormant tracker.
    expect(lagDays('2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', Date.parse('2026-10-19'))).toBe(0);
  });

  it('says nothing rather than guessing when a side has no timestamp', () => {
    expect(lagDays(EN, undefined)).toBeNull();
    expect(lagDays(undefined, EN)).toBeNull();
    expect(lagDays(EN, 'not a date')).toBeNull();
  });
});

describe('report', () => {
  const lags = (days: number[], locale = 'es'): LocaleLag[] =>
    days.map((d, i) => ({ slug: `t${i}`, locale, days: d }));

  it('summarises each locale separately', () => {
    const lines = report([...lags([1, 2], 'es'), ...lags([100], 'fr')]);
    expect(lines[0]).toContain('es:');
    expect(lines[1]).toContain('fr:');
  });

  it('counts only what is actually behind', () => {
    const lines = report(lags([0, 1, FRESH_DAYS, FRESH_DAYS + 1]));
    expect(lines[0]).toContain('1 stale');
  });

  it('stays quiet about culprits when everything is current', () => {
    const lines = report(lags([0, 1, 2]));
    expect(lines.join('\n')).not.toContain('Furthest behind');
  });

  it('names the worst offenders and where to look when they are not', () => {
    const text = report(lags([200, 1, 2])).join('\n');
    expect(text).toContain('Furthest behind');
    expect(text).toContain('translate-data.yml');
  });

  it('says so plainly when there is nothing translated at all', () => {
    expect(report([])).toEqual(['No translated tracker data found.']);
  });
});
