import { describe, it, expect } from 'vitest';
import {
  resolveFeedsForTracker,
  resolveFeedsForActiveTrackers,
  REGION_FEEDS,
  COUNTRY_FEEDS,
  DOMAIN_FEEDS,
  type FeedSpec,
} from './tracker-feeds';
import type { TrackerConfig } from './tracker-config';

const mkTracker = (overrides: Partial<TrackerConfig>): TrackerConfig => ({
  slug: 'x', name: 'X', shortName: 'X', icon: '?', status: 'active',
  domain: 'conflict', region: 'middle-east', sections: [],
  description: '',
  navSections: [],
  ...overrides,
} as unknown as TrackerConfig);

describe('tracker-feeds', () => {
  it('returns country + region + domain feeds for a tracker', () => {
    const tr = mkTracker({ country: 'MX', region: 'north-america', domain: 'economy' });
    const feeds = resolveFeedsForTracker(tr);
    const urls = feeds.map((f) => f.url);
    // Country feeds present (the whole point of the registry — Mexico-specific outlets)
    expect(urls.some((u) => u.includes('animalpolitico'))).toBe(true);
    // Domain feeds present (economy → reuters business)
    expect(urls.some((u) => u.includes('businessNews'))).toBe(true);
    for (const f of feeds) {
      expect(f.url).toMatch(/^https?:\/\//);
      expect([1, 2, 3]).toContain(f.tier);
    }
  });

  it('returns empty array when tracker has no country, region, or domain', () => {
    const tr = mkTracker({ country: undefined, region: undefined, domain: undefined });
    expect(resolveFeedsForTracker(tr)).toEqual([]);
  });

  it('dedupes within resolveFeedsForTracker if country, region, and domain share a feed', () => {
    // south-america region and BR country share two URLs (Folha + G1). Verify dedup.
    const tr = mkTracker({ country: 'BR', region: 'south-america', domain: undefined });
    const feeds = resolveFeedsForTracker(tr);
    const urls = feeds.map((f) => f.url);
    expect(new Set(urls).size).toBe(urls.length);
    // Folha must appear exactly once even though it is in both buckets
    expect(urls.filter((u) => u.includes('folha')).length).toBe(1);
  });

  it('resolveFeedsForActiveTrackers dedupes union across many trackers', () => {
    const trs = [
      mkTracker({ slug: 'a', country: 'MX', region: 'north-america' }),
      mkTracker({ slug: 'b', country: 'MX', region: 'north-america', domain: 'economy' }),
    ];
    const feeds = resolveFeedsForActiveTrackers(trs);
    const urls = feeds.map((f) => f.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('skips inactive trackers', () => {
    const trs = [mkTracker({ slug: 'a', country: 'MX', status: 'archived' })];
    const feeds = resolveFeedsForActiveTrackers(trs);
    expect(feeds).toEqual([]);
  });

  it('all feed registries have well-formed entries', () => {
    const all = { ...COUNTRY_FEEDS, ...REGION_FEEDS, ...DOMAIN_FEEDS };
    for (const [key, feeds] of Object.entries(all)) {
      expect(typeof key).toBe('string');
      expect(Array.isArray(feeds)).toBe(true);
      for (const f of feeds) {
        expect(f.url).toMatch(/^https?:\/\//);
        expect([1, 2, 3]).toContain(f.tier);
      }
    }
  });

  it('REGION_FEEDS keys match the RegionSchema enum (no stray taxonomy)', () => {
    // These are the values RegionSchema accepts in src/lib/tracker-config.ts.
    const validRegions = new Set([
      'africa', 'central-america', 'central-europe', 'east-asia', 'europe',
      'global', 'middle-east', 'north-america', 'south-america', 'south-asia',
      'southeast-asia',
    ]);
    for (const region of Object.keys(REGION_FEEDS)) {
      expect(validRegions.has(region)).toBe(true);
    }
  });
});
