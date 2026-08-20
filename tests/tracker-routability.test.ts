import { describe, it, expect } from 'vitest';
import { loadAllTrackers } from '../scripts/lib/load-trackers-node.js';
import { buildKeywordIndices } from '../src/lib/keyword-match';

/**
 * A tracker with no keyword index is invisible to the breaking-news pipeline.
 *
 * The light scan builds its index from `tags` + `name` + `ai.searchContext`
 * (see scripts/hourly-light-scan.ts). Two trackers created by init-tracker.yml
 * came out with no `tags` at all — nothing failed, the pages rendered, the
 * nightly updated them, and breaking news simply never routed to them.
 *
 * That is invisible from every other angle, which is exactly why it needs a
 * test rather than a code review.
 */
const trackers = (loadAllTrackers() as any[]).filter((t) => t.status === 'active');
const indices = buildKeywordIndices(
  trackers.map((t) => ({
    slug: t.slug,
    keywords: [...(Array.isArray(t.tags) ? t.tags : []), ...(t.name ? [t.name] : [])],
    searchContext: t.ai?.searchContext,
  })),
);

describe('every active tracker is reachable by the breaking-news scan', () => {
  it('loads a non-trivial corpus, so this test cannot pass vacuously', () => {
    expect(trackers.length).toBeGreaterThan(50);
  });

  it('gives every active tracker a non-empty keyword index', () => {
    const empty = trackers
      .map((t) => t.slug)
      .filter((slug) => (indices.get(slug)?.tokens.size ?? 0) === 0);
    expect(empty, `trackers unreachable by the light scan: ${empty.join(', ')}`).toEqual([]);
  });

  it('gives every active tracker at least one tag', () => {
    // Tags are the highest-signal part of the index: searchContext tokens are
    // shared across many trackers and get stripped as common, so a tracker
    // relying on searchContext alone routes poorly even when non-empty.
    const untagged = trackers
      .filter((t) => !Array.isArray(t.tags) || t.tags.length === 0)
      .map((t) => t.slug);
    expect(untagged, `trackers with no tags: ${untagged.join(', ')}`).toEqual([]);
  });
});
