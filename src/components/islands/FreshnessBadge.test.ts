import { describe, it, expect } from 'vitest';
import { classifyFreshness, formatAgo } from './FreshnessBadge';

const HOUR = 3_600_000;
const MIN  = 60_000;
const DAY  = 86_400_000;

describe('classifyFreshness', () => {
  const fresh = 12 * HOUR;
  const stale = 30 * HOUR;

  it('returns "fresh" for the inclusive lower bound (< 12h)', () => {
    expect(classifyFreshness(0, fresh, stale)).toBe('fresh');
    expect(classifyFreshness(11 * HOUR, fresh, stale)).toBe('fresh');
  });

  it('flips to "neutral" exactly at the fresh boundary (12h)', () => {
    // Spec: < 12h is fresh, exactly 12h falls into the neutral bucket.
    expect(classifyFreshness(fresh, fresh, stale)).toBe('neutral');
  });

  it('returns "neutral" between fresh and stale', () => {
    expect(classifyFreshness(20 * HOUR, fresh, stale)).toBe('neutral');
    expect(classifyFreshness(29 * HOUR + 59 * MIN, fresh, stale)).toBe('neutral');
  });

  it('returns "stale" at the inclusive upper bound (>= 30h)', () => {
    expect(classifyFreshness(stale, fresh, stale)).toBe('stale');
    expect(classifyFreshness(48 * HOUR, fresh, stale)).toBe('stale');
  });

  it('returns "unknown" for negative or non-finite diffs', () => {
    expect(classifyFreshness(-1, fresh, stale)).toBe('unknown');
    expect(classifyFreshness(NaN, fresh, stale)).toBe('unknown');
  });
});

describe('formatAgo', () => {
  it('returns "Updated X min ago" for under one hour, with floor of 1', () => {
    expect(formatAgo(0)).toBe('Updated 1 min ago');           // less than a minute → 1
    expect(formatAgo(30 * 1000)).toBe('Updated 1 min ago');   // 30s → 1 min
    expect(formatAgo(5 * MIN)).toBe('Updated 5 min ago');
    expect(formatAgo(59 * MIN)).toBe('Updated 59 min ago');
  });

  it('returns "Updated Xh ago" for 1 to 23 hours', () => {
    expect(formatAgo(HOUR)).toBe('Updated 1h ago');
    expect(formatAgo(5 * HOUR)).toBe('Updated 5h ago');
    expect(formatAgo(23 * HOUR + 59 * MIN)).toBe('Updated 23h ago');
  });

  it('returns "Updated yesterday" for 24 to 47 hours', () => {
    expect(formatAgo(24 * HOUR)).toBe('Updated yesterday');
    expect(formatAgo(36 * HOUR)).toBe('Updated yesterday');
    expect(formatAgo(47 * HOUR + 59 * MIN)).toBe('Updated yesterday');
  });

  it('returns "Updated X days ago" for 48+ hours', () => {
    expect(formatAgo(48 * HOUR)).toBe('Updated 2 days ago');
    expect(formatAgo(7 * DAY)).toBe('Updated 7 days ago');
    expect(formatAgo(30 * DAY)).toBe('Updated 30 days ago');
  });
});
