import { describe, it, expect } from 'vitest';
import { computeRelevanceScore, sortByRelevance, sortByActivity, ACTIVITY_WEIGHT } from './relevance';

const NOW = new Date().toISOString();

describe('computeRelevanceScore', () => {
  it('uses the activity index for the editorial block when present', () => {
    const withActivity = computeRelevanceScore({ lastUpdated: NOW, isFollowed: false, activityScore: 100 });
    const legacyMax = computeRelevanceScore({ lastUpdated: NOW, isFollowed: false, recentEventCount: 10, avgSourceTier: 1, sectionsUpdatedCount: 5 });
    expect(withActivity).toBeCloseTo(100 * ACTIVITY_WEIGHT + 15, 5);
    expect(legacyMax).toBeCloseTo(30 + 15, 5);
    // Activity beats the legacy inputs when both are given.
    const both = computeRelevanceScore({ lastUpdated: NOW, isFollowed: false, activityScore: 0, recentEventCount: 10, avgSourceTier: 1, sectionsUpdatedCount: 5 });
    expect(both).toBeCloseTo(15, 5);
  });
  it('keeps breaking and followed above any activity', () => {
    const breaking = computeRelevanceScore({ lastUpdated: NOW, isFollowed: false, isBreaking: true, activityScore: 0 });
    const busy = computeRelevanceScore({ lastUpdated: NOW, isFollowed: false, activityScore: 100 });
    expect(breaking).toBeGreaterThan(busy);
    const followed = computeRelevanceScore({ lastUpdated: NOW, isFollowed: true, activityScore: 40 });
    const unfollowed = computeRelevanceScore({ lastUpdated: NOW, isFollowed: false, activityScore: 80 });
    expect(followed).toBeGreaterThan(unfollowed);
  });
  it('ignores a non-finite activity score', () => {
    expect(computeRelevanceScore({ lastUpdated: NOW, isFollowed: false, activityScore: NaN, recentEventCount: 10, avgSourceTier: 1, sectionsUpdatedCount: 5 })).toBeCloseTo(45, 5);
  });
});

describe('sorting', () => {
  const t = (slug: string, score: number | undefined, lastUpdated = NOW) => ({ slug, lastUpdated, activity: score === undefined ? undefined : { score } });
  it('sortByActivity orders by score then recency and tolerates missing scores', () => {
    const old = new Date(Date.now() - 86_400_000).toISOString();
    const out = sortByActivity([t('a', 10), t('b', undefined), t('c', 50, old), t('d', 50)]);
    expect(out.map(x => x.slug)).toEqual(['d', 'c', 'a', 'b']);
  });
  it('sortByRelevance folds activity in', () => {
    const out = sortByRelevance([t('low', 5), t('high', 95)], []);
    expect(out[0].slug).toBe('high');
  });
});
