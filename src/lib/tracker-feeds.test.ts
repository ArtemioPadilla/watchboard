import { describe, it, expect } from 'vitest';
import {
  resolveFeedsForTracker,
  resolveFeedsForActiveTrackers,
  REGION_FEEDS,
  DOMAIN_FEEDS,
  type FeedSpec,
} from './tracker-feeds';
import type { TrackerConfig } from './tracker-config';

const mkTracker = (overrides: Partial<TrackerConfig>): TrackerConfig => ({
  slug: 'x', name: 'X', shortName: 'X', icon: '?', status: 'active',
  domain: 'conflict', region: 'middle-east', sections: [],
  meta: { startDate: '2024-01-01' } as any,
  ...overrides,
});

describe('tracker-feeds', () => {
  it('returns combined region + domain feeds for a tracker', () => {
    const tr = mkTracker({ region: 'mexico', domain: 'governance' });
    const feeds = resolveFeedsForTracker(tr);
    const urls = feeds.map((f) => f.url);
    expect(urls.some((u) => u.includes('animalpolitico'))).toBe(true);
    for (const f of feeds) {
      expect(f.url).toMatch(/^https?:\/\//);
      expect([1, 2, 3]).toContain(f.tier);
    }
  });

  it('returns empty array when tracker has no region or domain', () => {
    const tr = mkTracker({ region: undefined, domain: undefined });
    expect(resolveFeedsForTracker(tr)).toEqual([]);
  });

  it('dedupes by URL when region and domain share a feed', () => {
    const dup = REGION_FEEDS['mexico']?.[0];
    if (!dup) return;
    const tr = mkTracker({ region: 'mexico', domain: 'governance' });
    const feeds = resolveFeedsForTracker(tr);
    const urls = feeds.map((f) => f.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('resolveFeedsForActiveTrackers dedupes union across many trackers', () => {
    const trs = [
      mkTracker({ slug: 'a', region: 'mexico' }),
      mkTracker({ slug: 'b', region: 'mexico', domain: 'governance' }),
    ];
    const feeds = resolveFeedsForActiveTrackers(trs);
    const urls = feeds.map((f) => f.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('skips inactive trackers', () => {
    const trs = [mkTracker({ slug: 'a', region: 'mexico', status: 'archived' })];
    const feeds = resolveFeedsForActiveTrackers(trs);
    expect(feeds).toEqual([]);
  });

  it('REGION_FEEDS has well-formed entries', () => {
    for (const [region, feeds] of Object.entries(REGION_FEEDS)) {
      expect(typeof region).toBe('string');
      expect(Array.isArray(feeds)).toBe(true);
      for (const f of feeds) {
        expect(f.url).toMatch(/^https?:\/\//);
        expect([1, 2, 3]).toContain(f.tier);
      }
    }
  });
});
