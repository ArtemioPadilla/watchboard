/**
 * The roadmap is a public page, and on 2026-10-18 it was wrong in public: the
 * canonical file stopped at PR #135 while 204 PRs had merged, 21 of its 39
 * items described work that had shipped months earlier, and the milestone
 * labels still read "M2 — May 2026 · next" in October. Nothing in CI looked
 * at it.
 *
 * These are the invariants a reader depends on. Staleness itself cannot be a
 * hard failure — blocking an unrelated PR because a document is old is how
 * checks get switched off — so it warns here and the weekly self-review's
 * `roadmap-drift` dimension files an issue instead.
 */
import { describe, it, expect } from 'vitest';
import {
  MILESTONES,
  MILESTONE_ORDER,
  ROADMAP_ITEMS,
  ROADMAP_LAST_REVIEWED,
  counts,
} from '../src/data/roadmap-items.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('roadmap items', () => {
  it('have unique ids', () => {
    const ids = ROADMAP_ITEMS.map((i) => i.id);
    expect(new Set(ids).size, `duplicate id(s): ${ids.filter((id, n) => ids.indexOf(id) !== n).join(', ')}`).toBe(ids.length);
  });

  it('cite evidence when they claim to be shipped', () => {
    // A PR number or a concrete artefact. Some early work landed as direct
    // commits with no PR, so `outcome` naming the file or URL also counts —
    // what is not acceptable is a shipped claim with nothing behind it.
    const unevidenced = ROADMAP_ITEMS.filter(
      (i) => i.status === 'shipped' && !(i.prs?.length) && !i.outcome,
    ).map((i) => i.id);
    expect(unevidenced, 'shipped with neither prs nor outcome').toEqual([]);
  });

  it('only depend on items that exist', () => {
    const ids = new Set(ROADMAP_ITEMS.map((i) => i.id));
    const dangling = ROADMAP_ITEMS.flatMap((i) =>
      (i.dependsOn ?? []).filter((d) => !ids.has(d)).map((d) => `${i.id} → ${d}`),
    );
    expect(dangling).toEqual([]);
  });

  it('keep status and milestone consistent', () => {
    // The milestone is the horizon, the status is the lifecycle, and the two
    // disagreeing is exactly what made the old file unreadable: shipped items
    // sitting in a milestone labelled "next".
    const wrong = ROADMAP_ITEMS.filter(
      (i) =>
        (i.status === 'shipped' && i.milestone !== 'done') ||
        (i.status !== 'shipped' && i.milestone === 'done') ||
        (i.status === 'in-progress' && i.milestone !== 'now'),
    ).map((i) => `${i.id} (${i.status} / ${i.milestone})`);
    expect(wrong).toEqual([]);
  });

  it('carry a plausible ISO date', () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const i of ROADMAP_ITEMS) {
      expect(i.date, `${i.id} date`).toMatch(ISO_DATE);
      expect(i.date <= today, `${i.id} is dated in the future: ${i.date}`).toBe(true);
    }
  });

  it('use a milestone that is declared and ordered', () => {
    for (const i of ROADMAP_ITEMS) {
      expect(MILESTONES[i.milestone], `${i.id} milestone ${i.milestone}`).toBeDefined();
      expect(MILESTONE_ORDER).toContain(i.milestone);
    }
    expect([...MILESTONE_ORDER].sort()).toEqual(Object.keys(MILESTONES).sort());
  });

  it('counts() agrees with the array', () => {
    const c = counts();
    expect(c.total).toBe(ROADMAP_ITEMS.length);
    expect(c.shipped + c.inProgress + c.planned + c.idea).toBe(c.total);
  });
});

describe('roadmap review date', () => {
  it('is an ISO date, not in the future', () => {
    expect(ROADMAP_LAST_REVIEWED).toMatch(ISO_DATE);
    expect(ROADMAP_LAST_REVIEWED <= new Date().toISOString().slice(0, 10)).toBe(true);
  });

  it('warns rather than fails when the roadmap is overdue a review', () => {
    const days = Math.floor((Date.now() - new Date(ROADMAP_LAST_REVIEWED).getTime()) / 86_400_000);
    if (days > 45) {
      console.warn(
        `[roadmap] last reviewed ${days} days ago (${ROADMAP_LAST_REVIEWED}). ` +
          'Reconcile src/data/roadmap-items.ts against merged work and bump ROADMAP_LAST_REVIEWED.',
      );
    }
    expect(days).toBeGreaterThanOrEqual(0);
  });
});
