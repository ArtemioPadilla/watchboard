import { describe, it, expect } from 'vitest';
import {
  OLDER_THRESHOLD_MS, INTEREST_BAND_MAX, isOlder, bucketFeed, feedSegments, feedLayout, feedOrder,
  type BucketableTracker, type FeedSegment,
} from './feed-buckets';
import { EMPTY_INTERESTS, type Interests } from './interests';

const NOW = Date.parse('2026-09-24T12:00:00Z');
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const tr = (slug: string, hoursAgo: number, domain = 'conflict', region = 'europe'): BucketableTracker =>
  ({ slug, lastUpdated: ago(hoursAgo), domain, region });

/** Literal copy of today's OPS algorithm (SidebarPanel.tsx:454-482), rows + dividers as tokens. */
function legacyTokens(trackers: BucketableTracker[], followedSlugs: string[], now: number): string[] {
  const followed = new Set(followedSlugs);
  const f: BucketableTracker[] = []; const recent: BucketableTracker[] = []; const older: BucketableTracker[] = [];
  for (const t of trackers) {
    if (followed.has(t.slug)) { f.push(t); continue; }
    const age = now - new Date(t.lastUpdated).getTime();
    if (age > 48 * 3600 * 1000) older.push(t); else recent.push(t);
  }
  const out: string[] = [];
  if (f.length > 0) { out.push(...f.map(t => t.slug)); if (recent.length > 0 || older.length > 0) out.push('|'); }
  out.push(...recent.map(t => t.slug));
  if (older.length > 0) out.push('|');
  out.push(...older.map(t => `~${t.slug}`));
  return out;
}

function tokens(segs: FeedSegment<BucketableTracker>[], now: number): string[] {
  return segs.flatMap(s => s.kind === 'divider' ? ['|']
    : s.kind === 'band' ? ['[', ...s.rows.map(t => (isOlder(t.lastUpdated, now) ? '~' : '') + t.slug)]
    : s.rows.map(t => (s.bucket === 'older' ? '~' : '') + t.slug));
}

const gov: Interests = { domains: ['governance'], regions: [] } as Interests;

describe('constants', () => {
  it('match the spec', () => {
    expect(OLDER_THRESHOLD_MS).toBe(48 * 3600 * 1000);
    expect(INTEREST_BAND_MAX).toBe(6);
  });
});

describe('without interests: identical to the legacy OPS algorithm', () => {
  const cases: [string, BucketableTracker[], string[]][] = [
    ['empty', [], []],
    ['only recent', [tr('a', 1), tr('b', 2)], []],
    ['only older', [tr('a', 50), tr('b', 60)], []],
    ['mixed + followed', [tr('a', 1), tr('b', 50), tr('c', 3), tr('d', 70)], ['d']],
    ['all followed', [tr('a', 1), tr('b', 50)], ['a', 'b']],
    ['exact 48 h edge stays recent', [tr('edge', 48), tr('past', 48.001)], []],
    ['invalid date stays recent', [{ slug: 'bad', lastUpdated: 'not-a-date' }, tr('old', 99)], []],
  ];
  for (const [name, list, followed] of cases) {
    it(name, () => {
      const b = bucketFeed(list, { followedSlugs: followed, interests: EMPTY_INTERESTS, now: NOW });
      expect(b.interests).toEqual([]);
      expect(tokens(feedSegments(b), NOW)).toEqual(legacyTokens(list, followed, NOW));
    });
  }
});

describe('interest band', () => {
  const list = [
    tr('r1', 1), tr('g-old1', 60, 'governance'), tr('r2', 2), tr('g1', 3, 'governance'),
    ...Array.from({ length: 7 }, (_, i) => tr(`g-more${i}`, 70 + i, 'governance')),
    tr('o1', 80),
  ];
  it('lifts at most INTEREST_BAND_MAX matches, in input order, above recent rows', () => {
    const b = bucketFeed(list, { followedSlugs: [], interests: gov, now: NOW });
    expect(b.interests.map(t => t.slug)).toEqual(['g-old1', 'g1', 'g-more0', 'g-more1', 'g-more2', 'g-more3']);
    expect(b.recent.map(t => t.slug)).toEqual(['r1', 'r2']);
    // Overflow matches stay in their recency bucket.
    expect(b.older.map(t => t.slug)).toEqual(['g-more4', 'g-more5', 'g-more6', 'o1']);
  });
  it('keeps a followed match in followed and does not count it toward the limit', () => {
    const b = bucketFeed(list, { followedSlugs: ['g1'], interests: gov, now: NOW, bandMax: 2 });
    expect(b.followed.map(t => t.slug)).toEqual(['g1']);
    expect(b.interests.map(t => t.slug)).toEqual(['g-old1', 'g-more0']);
  });
  it('membership follows the incoming relevance order, not freshness (spec §1.3, open question 4)', () => {
    // sortByRelevance puts a stale high-activity match (72 h, activity 63: 18.9 + 5.5 = 24.4)
    // ahead of a fresh low-activity one (1 h, activity 0: 14.8); both get the same +10. The band keeps
    // that order: the stale one takes the slot, the fresh one stays in `recent`.
    const input = [tr('stale-hot', 72, 'governance'), tr('fresh-cold', 1, 'governance'), tr('other', 2)];
    const b = bucketFeed(input, { followedSlugs: [], interests: gov, now: NOW, bandMax: 1 });
    expect(b.interests.map(t => t.slug)).toEqual(['stale-hot']);
    expect(b.recent.map(t => t.slug)).toEqual(['fresh-cold', 'other']);
    expect(tokens(feedSegments(b), NOW)).toEqual(['[', '~stale-hot', '|', 'fresh-cold', 'other']);
  });
  it('bandMax = 0 behaves like no interests (used while searching)', () => {
    const b = bucketFeed(list, { followedSlugs: [], interests: gov, now: NOW, bandMax: 0 });
    expect(tokens(feedSegments(b), NOW)).toEqual(legacyTokens(list, [], NOW));
  });
  it('loses and duplicates no row', () => {
    const order = feedOrder(list, { followedSlugs: ['r2'], interests: gov, now: NOW, layout: 'ops' });
    expect(order.map(t => t.slug).sort()).toEqual(list.map(t => t.slug).sort());
  });
  it('segments: followed | band | recent | older, band rows keep their older flag', () => {
    const b = bucketFeed([tr('f', 1), tr('g', 60, 'governance'), tr('r', 2), tr('o', 90)],
      { followedSlugs: ['f'], interests: gov, now: NOW });
    expect(tokens(feedSegments(b), NOW)).toEqual(['f', '|', '[', '~g', '|', 'r', '|', '~o']);
  });
  it('segments: band without recent goes straight to the older divider', () => {
    const b = bucketFeed([tr('g', 60, 'governance'), tr('o', 90)], { followedSlugs: [], interests: gov, now: NOW });
    expect(tokens(feedSegments(b), NOW)).toEqual(['[', '~g', '|', '~o']);
  });
});

describe('layout and order', () => {
  it('feedLayout: domain wins, then activity is flat, else ops', () => {
    expect(feedLayout('domain', 'activity')).toBe('domain');
    expect(feedLayout('operations', 'activity')).toBe('flat');
    expect(feedLayout('operations', 'relevance')).toBe('ops');
    expect(feedLayout('geographic', 'relevance')).toBe('ops');
  });
  it('flat keeps input order and ignores interests', () => {
    const list = [tr('a', 90), tr('g', 1, 'governance'), tr('b', 1)];
    expect(feedOrder(list, { followedSlugs: ['b'], interests: gov, now: NOW, layout: 'flat' }).map(t => t.slug))
      .toEqual(['a', 'g', 'b']);
  });
  it('domain groups by first appearance, keeping order inside a group', () => {
    const list = [tr('a', 1, 'science'), tr('b', 1, 'conflict'), tr('c', 1, 'science'), { slug: 'd', lastUpdated: ago(1) }];
    expect(feedOrder(list, { followedSlugs: [], interests: gov, now: NOW, layout: 'domain' }).map(t => t.slug))
      .toEqual(['a', 'c', 'b', 'd']);
  });
});
