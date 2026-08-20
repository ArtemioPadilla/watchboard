import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { escalationScore } from '../video/src/data/fetch-breaking';

/**
 * #157 asks for an "impact ranking" step. The existing score measures
 * freshness and tone — it cannot tell a tracker that added one routine event
 * from one that added fifteen, so a quiet tracker flagged `breaking` outranks
 * a war that just escalated.
 *
 * escalationScore measures a tracker against ITS OWN baseline, because
 * trackers have wildly different normal volumes: three events is a huge day
 * for a country history and a slow one for an active war.
 *
 * Fixtures are built here rather than read from a fixed path, so this runs the
 * same on CI as it does locally.
 */
const TODAY = '2026-08-20';
let root: string;

function dayBefore(days: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function writeEvents(slug: string, daysAgo: number, count: number): void {
  const dir = join(root, slug, 'data', 'events');
  mkdirSync(dir, { recursive: true });
  const events = Array.from({ length: count }, (_, i) => ({
    id: `${slug}-${daysAgo}-${i}`, title: 'event', year: '2026',
  }));
  writeFileSync(join(dir, `${dayBefore(daysAgo)}.json`), JSON.stringify(events));
}

beforeAll(() => {
  root = mkdirSync(join(tmpdir(), `wb-esc-${process.pid}-`), { recursive: true }) as string
    ?? join(tmpdir(), `wb-esc-${process.pid}`);
  mkdirSync(root, { recursive: true });

  // spiking: 1 event/day baseline, then 8 across the last two days
  for (let i = 2; i < 16; i++) writeEvents('spiking', i, 1);
  writeEvents('spiking', 0, 5);
  writeEvents('spiking', 1, 3);

  // steady: 2 events every day, including now
  for (let i = 0; i < 16; i++) writeEvents('steady', i, 2);

  // silent: history, but nothing recent
  for (let i = 2; i < 16; i++) writeEvents('silent', i, 2);

  // fresh: no history at all, one event today
  writeEvents('fresh', 0, 1);

  // quiet-then-two: almost silent, then two events — high ratio, low volume
  writeEvents('quiet-then-two', 9, 1);
  writeEvents('quiet-then-two', 0, 2);
});

afterAll(() => { rmSync(root, { recursive: true, force: true }); });

describe('escalationScore', () => {
  it('rewards a tracker spiking above its own baseline', () => {
    const r = escalationScore('spiking', TODAY, root);
    expect(r.recent).toBe(8);      // 5 today + 3 yesterday
    expect(r.baseline).toBe(1);    // 14 preceding days at 1/day
    expect(r.ratio).toBe(8);
    expect(r.bonus).toBe(40);
  });

  it('counts yesterday too, since the nightly lands at 14:00 UTC', () => {
    // A video rendered before the nightly would otherwise see an empty today
    // and lose the signal entirely.
    const r = escalationScore('spiking', TODAY, root);
    expect(r.recent).toBeGreaterThan(5);
  });

  it('stays modest for a tracker moving at its normal rate', () => {
    const r = escalationScore('steady', TODAY, root);
    expect(r.recent).toBe(4);
    expect(r.baseline).toBe(2);
    expect(r.bonus).toBeLessThan(40);
  });

  it('gives nothing when there is no recent activity', () => {
    const r = escalationScore('silent', TODAY, root);
    expect(r.recent).toBe(0);
    expect(r.bonus).toBe(0);
  });

  it('returns zeros for a tracker with no events directory', () => {
    expect(escalationScore('does-not-exist', TODAY, root))
      .toEqual({ recent: 0, baseline: 0, ratio: 0, bonus: 0 });
  });

  it('does not let an empty baseline produce an infinite ratio', () => {
    // A brand-new tracker's first event must not outrank an active war.
    const r = escalationScore('fresh', TODAY, root);
    expect(Number.isFinite(r.ratio)).toBe(true);
    expect(r.bonus).toBeLessThanOrEqual(40);
  });

  it('never exceeds the breaking-flag weight of 100', () => {
    for (const slug of ['spiking', 'steady', 'silent', 'fresh']) {
      expect(escalationScore(slug, TODAY, root).bonus).toBeLessThanOrEqual(40);
    }
  });
});

describe('volume cap', () => {
  it('does not give a near-silent tracker the top bonus for two events', () => {
    // Real-data calibration: `france` had a 0.07/day baseline, so two events
    // produced ratio 4 and the maximum bonus — outranking `ukraine` going from
    // 1.29/day to 3. A big ratio on a tiny baseline is noise, not impact.
    const r = escalationScore('quiet-then-two', TODAY, root);
    expect(r.ratio).toBeGreaterThanOrEqual(4);   // ratio still says "spike"
    expect(r.bonus).toBe(12);                    // volume says "not much happened"
  });

  it('ranks a busy escalation above a noisy quiet one', () => {
    const noisy = escalationScore('quiet-then-two', TODAY, root);
    const real = escalationScore('spiking', TODAY, root);
    expect(real.bonus).toBeGreaterThan(noisy.bonus);
  });
});
