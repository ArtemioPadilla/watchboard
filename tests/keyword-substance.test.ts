import { describe, it, expect } from 'vitest';
import { loadAllTrackers } from '../scripts/lib/load-trackers-node.js';
import {
  buildKeywordIndices,
  scoreCandidateDetailed,
  hasSubstance,
} from '../src/lib/keyword-match';

/**
 * Regression tests for #149 — headlines routed into unrelated trackers.
 *
 * The cause was not the score being too generous in aggregate; it was a single
 * matched token being enough. Index tokens are lowercased, so domain acronyms
 * collide with ordinary English words. Measured over one full day of traffic,
 * 143 of 170 deferred candidates routed on exactly one token.
 *
 * These headlines are real: three from the issue, the rest from
 * public/_hourly/triage-log.json.
 */

// Mirrors how scripts/hourly-light-scan.ts builds its corpus.
const trackers = loadAllTrackers().filter((t: any) => t.status === 'active');
const indices = buildKeywordIndices(
  trackers.map((t: any) => ({
    slug: t.slug,
    keywords: [...(Array.isArray(t.tags) ? t.tags : []), ...(t.name ? [t.name] : [])],
    searchContext: t.ai?.searchContext,
  })),
);

function best(title: string, sourceTier: 1 | 2 | 3 = 2) {
  const cand: any = { title, url: '', source: 'test', timestamp: '', sourceTier };
  let top = { score: 0, specificHits: 0, commonHits: 0, phraseHits: 0 };
  let slug = '';
  for (const t of trackers as any[]) {
    const i = indices.get(t.slug);
    if (!i) continue;
    const d = scoreCandidateDetailed(cand, i, indices);
    if (d.score > top.score) { top = d; slug = t.slug; }
  }
  return { slug, ...top };
}

const MODERATE_THRESHOLD = 0.25;

describe('single-token matches do not route', () => {
  const misroutes: Array<[string, string]> = [
    ['Israel confirms soldiers fired at car in which Hind Rajab was killed', 'car / CAR-T'],
    ['Florida surgeon who removed wrong organ says he is forever traumatized', 'who / WHO'],
    ['Who is Natalie Harp, Trump’s right-hand woman?', 'who / WHO'],
    ['Tesla Model Y is first vehicle to pass new US driver-assistance system tests', 'system'],
    ['Angélique Kidjo becomes first African musician with a Hollywood star', 'single token'],
    ['Watch: SpaceX rocket spotted off Christmas Island coast', 'single token'],
    ['Head-on collision between bus and lorry in Brazil kills more than 20', 'single token'],
    ['81-year-old confesses to German cold case murder of US tourist', 'single token'],
  ];

  it.each(misroutes)('does not route %s (%s)', (title) => {
    const b = best(title);
    // It may still score above the threshold — that is the point. The gate is
    // what stops it, not the score.
    expect(hasSubstance(b)).toBe(false);
  });

  it('the score alone would have let them through', () => {
    // Documents why the threshold was not the right lever: these clear it.
    const b = best('Israel confirms soldiers fired at car in which Hind Rajab was killed');
    expect(b.score).toBeGreaterThan(MODERATE_THRESHOLD);
    expect(b.specificHits).toBe(1);
  });
});

describe('genuine matches still route', () => {
  it('accepts a headline naming several tracker-specific tokens', () => {
    // Built from a real tracker's own tags so the test tracks the corpus.
    const withTags = (trackers as any[]).find(
      (t) => Array.isArray(t.tags) && t.tags.length >= 3 && t.status === 'active',
    );
    expect(withTags, 'expected some active tracker to carry >= 3 tags').toBeTruthy();
    const title = `${withTags.tags.slice(0, 3).join(' ')} escalates sharply`;
    const cand: any = { title, url: '', source: 'test', timestamp: '', sourceTier: 1 };
    const d = scoreCandidateDetailed(cand, indices.get(withTags.slug)!, indices);
    expect(hasSubstance(d)).toBe(true);
  });
});

describe('hasSubstance', () => {
  it('requires two specific tokens, or one plus a phrase', () => {
    expect(hasSubstance({ specificHits: 2, phraseHits: 0 })).toBe(true);
    expect(hasSubstance({ specificHits: 1, phraseHits: 1 })).toBe(true);
    expect(hasSubstance({ specificHits: 1, phraseHits: 0 })).toBe(false);
    expect(hasSubstance({ specificHits: 0, phraseHits: 1 })).toBe(false);
    expect(hasSubstance({ specificHits: 0, phraseHits: 0 })).toBe(false);
  });
});
