import { describe, it, expect } from 'vitest';
import { isFromYear, summarise, activeOnly, renderCoverage } from '../scripts/lib/tracker-coverage';

describe('isFromYear', () => {
  it('reads either date or year', () => {
    expect(isFromYear({ date: '2026-03-01' }, 2026)).toBe(true);
    expect(isFromYear({ year: 'Mar 1, 2026' }, 2026)).toBe(true);
  });
  it('excludes other years', () => {
    // The point of the whole module: `brazil` spans decades, and counting a
    // 1998 "election" as current coverage is how false evidence gets built.
    expect(isFromYear({ year: 'Oct 1, 1998' }, 2026)).toBe(false);
    expect(isFromYear({ date: '1962-10-22' }, 2026)).toBe(false);
  });
  it('is false when neither field is present', () => {
    expect(isFromYear({}, 2026)).toBe(false);
  });
});

describe('summarise', () => {
  const ev = (y: string, t: string) => ({ year: y, title: t });

  it('counts only the reference year', () => {
    const c = summarise('x', [ev('2026', 'a'), ev('1998', 'b'), ev('2026', 'c')], 2026);
    expect(c.recentCount).toBe(2);
    expect(c.recentTitles).toEqual(['c', 'a']);
  });

  it('returns the newest first and caps the sample', () => {
    const many = Array.from({ length: 20 }, (_, i) => ev('2026', `t${i}`));
    const c = summarise('x', many, 2026, 3);
    expect(c.recentTitles).toEqual(['t19', 't18', 't17']);
  });

  it('truncates long titles, because the whole table goes to a model', () => {
    const c = summarise('x', [ev('2026', 'y'.repeat(300))], 2026);
    expect(c.recentTitles[0].length).toBeLessThanOrEqual(90);
  });

  it('skips events with no title rather than emitting blanks', () => {
    expect(summarise('x', [{ year: '2026' }], 2026).recentTitles).toEqual([]);
  });

  it('collapses whitespace', () => {
    expect(summarise('x', [ev('2026', 'a\n  b')], 2026).recentTitles[0]).toBe('a b');
  });
});

describe('renderCoverage', () => {
  it('drops trackers with nothing recent and orders by volume', () => {
    const out = renderCoverage([
      { slug: 'quiet', recentCount: 0, recentTitles: [] },
      { slug: 'small', recentCount: 2, recentTitles: ['s'] },
      { slug: 'busy', recentCount: 50, recentTitles: ['b'] },
    ]);
    expect(out).not.toContain('quiet');
    expect(out.indexOf('busy')).toBeLessThan(out.indexOf('small'));
  });

  it('says so plainly when there is nothing, instead of emitting an empty prompt', () => {
    expect(renderCoverage([{ slug: 'a', recentCount: 0, recentTitles: [] }]))
      .toMatch(/no tracker/i);
  });
});

describe('activeOnly', () => {
  it('keeps only trackers with current-year events', () => {
    expect(activeOnly([
      { slug: 'a', recentCount: 1, recentTitles: [] },
      { slug: 'b', recentCount: 0, recentTitles: [] },
    ]).map((c) => c.slug)).toEqual(['a']);
  });
});
