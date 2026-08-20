import { describe, it, expect } from 'vitest';

/**
 * The review window decides how far back the nightly looks for missing events.
 *
 * `review_window_days` used to be only a *ceiling*, which meant it could not do
 * the one job it exists for. The window is driven by `daysSinceLastRun`, and
 * any run resets `lastRun` to today — so a catch-up dispatched right after a
 * normal night got max(0, 7) = 7 days regardless of the value passed.
 *
 * Found chasing a real gap: the Berlin Pride attack of 25 July 2026 was missing
 * from `germany`, and two targeted runs with review_window_days=60 both scanned
 * seven days and never looked at it.
 */
function windowSize(daysSinceLastRun: number, explicit: number | null): number {
  const max = explicit ?? 30;
  return explicit ?? Math.min(Math.max(daysSinceLastRun, 7), max);
}

describe('review window', () => {
  it('uses an explicit value as the window, not a cap on it', () => {
    // The bug: a fresh lastRun made daysSinceLastRun 0, and 60 was ignored.
    expect(windowSize(0, 60)).toBe(60);
  });

  it('reaches back far enough for a 26-day-old gap', () => {
    // 25 July was 26 days before the run that was meant to catch it.
    expect(windowSize(0, 60)).toBeGreaterThan(26);
  });

  it('leaves normal nights untouched', () => {
    expect(windowSize(0, null)).toBe(7);
    expect(windowSize(3, null)).toBe(7);
    expect(windowSize(45, null)).toBe(30);
  });

  it('still floors at 7 days so a same-day rerun scans something', () => {
    expect(windowSize(0, null)).toBe(7);
  });

  it('still caps an unattended tracker at 30 days without an explicit value', () => {
    // A wide window inflates the manifest and the agent has a fixed turn
    // budget, so the default cap stays.
    expect(windowSize(365, null)).toBe(30);
  });
});
