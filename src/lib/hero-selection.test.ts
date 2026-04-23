import { describe, it, expect } from 'vitest';
import { selectHeroTracker } from './hero-selection';
import type { TrackerCardData } from './tracker-directory-utils';

function makeTracker(overrides: Partial<TrackerCardData> & { slug: string }): TrackerCardData {
  const defaults: Omit<TrackerCardData, 'slug'> = {
    shortName: overrides.slug,
    name: overrides.slug,
    description: '',
    icon: '',
    color: '#3498db',
    status: 'active',
    temporal: 'live',
    domain: 'conflict',
    region: 'global',
    startDate: '2024-01-01',
    sections: [],
    dayCount: 0,
    lastUpdated: '2026-04-22T00:00:00Z',
    topKpis: [],
    headline: 'Default headline',
    latestEventMedia: { url: 'https://example.com/a.jpg', source: 'Src', tier: 1 },
    eventImages: [],
    isBreaking: false,
    recentEventCount: 0,
    avgSourceTier: 2,
    sectionsUpdatedCount: 0,
  } as unknown as Omit<TrackerCardData, 'slug'>;
  return { ...defaults, ...overrides } as TrackerCardData;
}

describe('selectHeroTracker', () => {
  it('returns null when the list is empty', () => {
    expect(selectHeroTracker([], [])).toBeNull();
  });

  it('returns null when no tracker has a headline', () => {
    const trackers = [
      makeTracker({ slug: 'a', headline: undefined }),
      makeTracker({ slug: 'b', headline: '' }),
    ];
    expect(selectHeroTracker(trackers, [])).toBeNull();
  });

  it('excludes trackers with no media and empty eventImages', () => {
    const trackers = [
      makeTracker({ slug: 'no-media', latestEventMedia: undefined, eventImages: [] }),
      makeTracker({ slug: 'has-media', latestEventMedia: { url: 'x', source: 's', tier: 1 } }),
    ];
    expect(selectHeroTracker(trackers, [])?.slug).toBe('has-media');
  });

  it('accepts trackers with eventImages even if latestEventMedia is missing', () => {
    const trackers = [
      makeTracker({
        slug: 'by-events',
        latestEventMedia: undefined,
        eventImages: [{ url: 'x', source: 's', tier: 1 }],
      }),
    ];
    expect(selectHeroTracker(trackers, [])?.slug).toBe('by-events');
  });

  it('excludes archived trackers', () => {
    const trackers = [
      makeTracker({ slug: 'archived', status: 'archived' }),
      makeTracker({ slug: 'active' }),
    ];
    expect(selectHeroTracker(trackers, [])?.slug).toBe('active');
  });

  it('prefers breaking > followed > editorial > recency', () => {
    const trackers = [
      makeTracker({
        slug: 'breaking',
        isBreaking: true,
        lastUpdated: '2026-04-01T00:00:00Z',
      }),
      makeTracker({
        slug: 'followed',
        isBreaking: false,
        lastUpdated: '2026-04-22T00:00:00Z',
      }),
    ];
    expect(selectHeroTracker(trackers, ['followed'])?.slug).toBe('breaking');
  });

  it('returns the followed tracker when nothing is breaking', () => {
    const trackers = [
      makeTracker({ slug: 'a' }),
      makeTracker({ slug: 'b' }),
    ];
    expect(selectHeroTracker(trackers, ['b'])?.slug).toBe('b');
  });

  it('is stable — same input, same output', () => {
    const trackers = [
      makeTracker({ slug: 'x', recentEventCount: 5 }),
      makeTracker({ slug: 'y', recentEventCount: 2 }),
    ];
    const a = selectHeroTracker(trackers, []);
    const b = selectHeroTracker(trackers, []);
    expect(a?.slug).toBe(b?.slug);
  });
});
