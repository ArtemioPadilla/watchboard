import { describe, it, expect } from 'vitest';
import { buildKeywordIndex, scoreCandidate } from './keyword-match';
import type { TrackerConfig } from './tracker-config';
import type { Candidate } from '../../scripts/hourly-types';

const mkTracker = (over: Partial<TrackerConfig> & { searchContext?: string; keywords?: string[] }): TrackerConfig => ({
  slug: 'iran-conflict', name: 'Iran Conflict', shortName: 'Iran', icon: '🇮🇷',
  status: 'active', domain: 'conflict', region: 'middle-east', sections: [],
  description: '',
  navSections: [],
  searchContext: 'Iran-US/Israel conflict',
  keywords: ['Iran', 'Tehran', 'Khamenei', 'IRGC'],
  ...over,
} as unknown as TrackerConfig);

const mkCandidate = (title: string, source = 'reuters'): Candidate => ({
  title, url: `https://x.com/${encodeURIComponent(title)}`, source,
  timestamp: new Date().toISOString(), matchedTracker: null, feedOrigin: 'rss',
  sourceTier: 2,
});

describe('keyword-match', () => {
  it('high score for clear keyword match in title from a tier-2 source', () => {
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

  it('moderate score for partial / single-keyword hits', () => {
    const tr = mkTracker({});
    const idx = buildKeywordIndex(tr);
    const c = mkCandidate('Tehran weather: hot and dry');
    const s = scoreCandidate(c, idx);
    expect(s).toBeGreaterThan(0.3);
    expect(s).toBeLessThan(0.85);
  });

  it('case insensitive and tolerant to punctuation', () => {
    const tr = mkTracker({});
    const idx = buildKeywordIndex(tr);
    const c = mkCandidate('TEHRAN: Khamenei addresses parliament.');
    const s = scoreCandidate(c, idx);
    expect(s).toBeGreaterThanOrEqual(0.85);
  });

  it('boosts higher source tiers', () => {
    const tr = mkTracker({});
    const idx = buildKeywordIndex(tr);
    const tier1 = { ...mkCandidate('Iran statement'), sourceTier: 1 as const };
    const tier3 = { ...mkCandidate('Iran statement'), sourceTier: 3 as const };
    expect(scoreCandidate(tier1, idx)).toBeGreaterThan(scoreCandidate(tier3, idx));
  });

  it('handles tracker with no keywords (uses searchContext words)', () => {
    const tr = mkTracker({ keywords: undefined, searchContext: 'Mexico City protests AMLO' });
    const idx = buildKeywordIndex(tr);
    const c = mkCandidate('Mexico City protests turn violent');
    expect(scoreCandidate(c, idx)).toBeGreaterThanOrEqual(0.6);
  });

  it('returns 0 when both keywords and searchContext are empty', () => {
    const tr = mkTracker({ keywords: [], searchContext: '' });
    const idx = buildKeywordIndex(tr);
    const c = mkCandidate('Anything at all');
    expect(scoreCandidate(c, idx)).toBe(0);
  });
});
