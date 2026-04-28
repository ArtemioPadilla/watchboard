import { describe, it, expect } from 'vitest';

describe('hourly-scan', () => {
  describe('extractKeywords', () => {
    it('extracts 4+ char words, lowercased, without stopwords', async () => {
      const { extractKeywords } = await import('../scripts/hourly-scan.js');
      const kw = extractKeywords('Iran-US/Israel conflict 2024 military strikes');
      expect(kw).toContain('iran');
      expect(kw).toContain('israel');
      expect(kw).toContain('conflict');
      expect(kw).toContain('military');
      expect(kw).toContain('strikes');
      expect(kw).not.toContain('2024');
    });
  });

  describe('matchTrackerByKeywords', () => {
    it('returns tracker slug when >= 2 keyword hits', async () => {
      const { matchTrackerByKeywords } = await import('../scripts/hourly-scan.js');
      const trackerKeywords = new Map([
        ['iran-conflict', new Set(['iran', 'israel', 'conflict', 'military', 'strikes'])],
        ['gaza-war', new Set(['gaza', 'hamas', 'israel', 'ceasefire'])],
      ]);
      const result = matchTrackerByKeywords('Iran military operation near Israel border', trackerKeywords);
      expect(result).toBe('iran-conflict');
    });

    it('returns null when no tracker matches >= 2 keywords', async () => {
      const { matchTrackerByKeywords } = await import('../scripts/hourly-scan.js');
      const trackerKeywords = new Map([
        ['iran-conflict', new Set(['iran', 'israel', 'conflict'])],
      ]);
      const result = matchTrackerByKeywords('SpaceX launches Starship rocket', trackerKeywords);
      expect(result).toBeNull();
    });
  });

  describe('dedup', () => {
    it('removes candidates with URLs already in state', async () => {
      const { dedup } = await import('../scripts/hourly-scan.js');
      const candidates = [
        { title: 'A', url: 'https://a.com', source: 'A', timestamp: '', matchedTracker: 'x', feedOrigin: 'rss' as const },
        { title: 'B', url: 'https://b.com', source: 'B', timestamp: '', matchedTracker: 'x', feedOrigin: 'rss' as const },
      ];
      const seenUrls = new Set(['https://a.com']);
      const result = dedup(candidates, seenUrls);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('B');
    });
  });

  describe('promotePendingCandidates', () => {
    const mkCand = (url: string, title = 'T') => ({
      title, url, source: 's', timestamp: '', matchedTracker: 'x', feedOrigin: 'rss' as const,
    });

    it('promotes pending entries into candidates even if they would be in state.seen', async () => {
      const { promotePendingCandidates } = await import('../scripts/hourly-scan.js');
      const candidates = [mkCand('https://a.com')];
      const pending = { entries: [{ candidate: mkCand('https://b.com') }] };
      // Note: the live code does NOT pass state.seen — that's the bug we fixed.
      // The helper must promote 'b' even though in production it would be in state.seen.
      const promoted = promotePendingCandidates(pending, candidates);
      expect(promoted).toBe(1);
      expect(candidates.map(c => c.url)).toEqual(['https://a.com', 'https://b.com']);
    });

    it('skips pending duplicates already in the in-flight batch', async () => {
      const { promotePendingCandidates } = await import('../scripts/hourly-scan.js');
      const candidates = [mkCand('https://a.com')];
      const pending = { entries: [{ candidate: mkCand('https://a.com') }] };
      const promoted = promotePendingCandidates(pending, candidates);
      expect(promoted).toBe(0);
      expect(candidates).toHaveLength(1);
    });

    it('dedups within the pending list itself', async () => {
      const { promotePendingCandidates } = await import('../scripts/hourly-scan.js');
      const candidates: Array<ReturnType<typeof mkCand>> = [];
      const pending = {
        entries: [
          { candidate: mkCand('https://x.com') },
          { candidate: mkCand('https://x.com', 'duplicate') },
          { candidate: mkCand('https://y.com') },
        ],
      };
      const promoted = promotePendingCandidates(pending, candidates);
      expect(promoted).toBe(2);
      expect(candidates.map(c => c.url)).toEqual(['https://x.com', 'https://y.com']);
    });

    it('ignores entries with missing url or candidate', async () => {
      const { promotePendingCandidates } = await import('../scripts/hourly-scan.js');
      const candidates: Array<ReturnType<typeof mkCand>> = [];
      const pending = {
        entries: [
          { candidate: undefined },
          {} as { candidate?: ReturnType<typeof mkCand> },
          { candidate: { ...mkCand(''), url: '' } },
          { candidate: mkCand('https://ok.com') },
        ],
      };
      const promoted = promotePendingCandidates(pending, candidates);
      expect(promoted).toBe(1);
      expect(candidates.map(c => c.url)).toEqual(['https://ok.com']);
    });
  });

  describe('parseRssFeed', () => {
    it('extracts items from RSS XML', async () => {
      const { parseRssFeed } = await import('../scripts/hourly-scan.js');
      const xml = `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <item>
              <title>Test Article</title>
              <link>https://example.com/article</link>
              <pubDate>Thu, 03 Apr 2026 15:00:00 GMT</pubDate>
              <source>Reuters</source>
            </item>
          </channel>
        </rss>`;
      const items = parseRssFeed(xml);
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Test Article');
      expect(items[0].url).toBe('https://example.com/article');
    });

    it('handles Atom feeds', async () => {
      const { parseRssFeed } = await import('../scripts/hourly-scan.js');
      const xml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Atom Article</title>
            <link href="https://example.com/atom"/>
            <updated>2026-04-03T15:00:00Z</updated>
          </entry>
        </feed>`;
      const items = parseRssFeed(xml);
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Atom Article');
    });
  });
});
