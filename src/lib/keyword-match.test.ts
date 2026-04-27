import { describe, it, expect } from 'vitest';
import { buildKeywordIndex, buildKeywordIndices, scoreCandidate, scoreCandidateDetailed } from './keyword-match';
import type { TrackerConfig } from './tracker-config';
import type { Candidate } from '../../scripts/hourly-types';

const mkTracker = (over: Partial<TrackerConfig> & { searchContext?: string; keywords?: string[] }): TrackerConfig => ({
  slug: 'iran-conflict', name: 'Iran Conflict', shortName: 'Iran', icon: '🇮🇷',
  status: 'active', domain: 'conflict', region: 'middle-east', sections: [],
  description: '',
  navSections: [],
  searchContext: 'Iran-US/Israel conflict over nuclear program',
  keywords: ['Iran', 'Tehran', 'Khamenei', 'IRGC'],
  ...over,
} as unknown as TrackerConfig);

const mkCandidate = (title: string, source = 'reuters'): Candidate => ({
  title, url: `https://x.com/${encodeURIComponent(title)}`, source,
  timestamp: new Date().toISOString(), matchedTracker: null, feedOrigin: 'rss',
  sourceTier: 2,
});

describe('keyword-match', () => {
  it('three or more specific keyword hits push tier-2 candidates over the post threshold', () => {
    const tr = mkTracker({});
    const idx = buildKeywordIndex(tr);
    const c = mkCandidate('Iran says it will respond to Israel strike on Tehran');
    const s = scoreCandidate(c, idx);
    expect(s).toBeGreaterThanOrEqual(0.85);
  });

  it('low score for unrelated headline', () => {
    const tr = mkTracker({});
    const idx = buildKeywordIndex(tr);
    const c = mkCandidate('Local bake sale raises money for school library');
    const s = scoreCandidate(c, idx);
    expect(s).toBeLessThan(0.3);
  });

  it('moderate score for partial / single-keyword hits — defers to heavy scan', () => {
    const tr = mkTracker({});
    const idx = buildKeywordIndex(tr);
    const c = mkCandidate('Tehran weather: hot and dry');
    const s = scoreCandidate(c, idx);
    expect(s).toBeGreaterThan(0.15);
    expect(s).toBeLessThan(0.85);
  });

  it('case insensitive and tolerant to punctuation', () => {
    const tr = mkTracker({});
    const idx = buildKeywordIndex(tr);
    // 2 specific hits = high-moderate score; the post gate further requires substance
    const c = mkCandidate('TEHRAN: Khamenei addresses Iranian parliament about IRGC.');
    const detail = scoreCandidateDetailed(c, idx);
    expect(detail.specificHits).toBeGreaterThanOrEqual(3);
    expect(detail.score).toBeGreaterThanOrEqual(0.85);
  });

  it('boosts higher source tiers', () => {
    const tr = mkTracker({});
    const idx = buildKeywordIndex(tr);
    const tier1 = { ...mkCandidate('Iran statement'), sourceTier: 1 as const };
    const tier3 = { ...mkCandidate('Iran statement'), sourceTier: 3 as const };
    expect(scoreCandidate(tier1, idx)).toBeGreaterThan(scoreCandidate(tier3, idx));
  });

  it('returns 0 when both keywords and searchContext are empty', () => {
    const tr = mkTracker({ keywords: [], searchContext: '' });
    const idx = buildKeywordIndex(tr);
    const c = mkCandidate('Anything at all');
    expect(scoreCandidate(c, idx)).toBe(0);
  });

  it('returns 0 (no tier floor) for headlines with zero keyword hits', () => {
    const tr = mkTracker({});
    const idx = buildKeywordIndex(tr);
    const c = { ...mkCandidate('Cooking recipes for the autumn season'), sourceTier: 2 as const };
    expect(scoreCandidate(c, idx)).toBe(0);
  });

  it('strips tokens that appear in too many trackers (corpus-aware)', () => {
    // 12 trackers all share the noise token "tracker"; only one mentions "starship"
    const trackers = Array.from({ length: 12 }, (_, i) => ({
      slug: `t${i}`,
      keywords: i === 0 ? ['Starship', 'tracker'] : ['tracker'],
      searchContext: 'tracker',
    }));
    const map = buildKeywordIndices(trackers);
    const idx = map.get('t0')!;
    expect(idx.tokens.has('starship')).toBe(true);
    expect(idx.tokens.has('tracker')).toBe(false); // df 12/12 → stripped
    const c = mkCandidate('Starship breaks altitude record', 'reuters');
    const detail = scoreCandidateDetailed(c, idx, map);
    expect(detail.specificHits).toBe(1);
  });

  it('multi-word phrase shorter than three tokens does not trigger the phrase bonus', () => {
    const tr = mkTracker({ keywords: ['United States'], searchContext: '' });
    const idx = buildKeywordIndex(tr);
    expect(idx.phrases).toHaveLength(0); // 2-word geographic tag is not a phrase
    const c = mkCandidate('Britain visits the United States today');
    const detail = scoreCandidateDetailed(c, idx);
    expect(detail.phraseHits).toBe(0);
  });

  it('long phrase from searchContext counts as a phrase hit', () => {
    const tr = mkTracker({
      keywords: [],
      searchContext: 'Korea democracy under scrutiny since impeachment',
    });
    const idx = buildKeywordIndex(tr);
    expect(idx.phrases.length).toBeGreaterThan(0);
    const c = mkCandidate('Korea democracy under scrutiny since impeachment crisis deepens');
    const detail = scoreCandidateDetailed(c, idx);
    expect(detail.phraseHits).toBeGreaterThanOrEqual(1);
  });
});
