import { describe, it, expect } from 'vitest';

describe('hourly-triage', () => {
  describe('buildTriagePrompt', () => {
    it('includes tracker context and candidates', async () => {
      const { buildTriagePrompt } = await import('../scripts/hourly-triage.js');
      const prompt = buildTriagePrompt(
        [{ title: 'Iran strikes', url: 'https://a.com', source: 'Reuters', timestamp: '2026-04-03T15:00:00Z', matchedTracker: 'iran-conflict', feedOrigin: 'gdelt' as const }],
        new Map([['iran-conflict', ['IAEA inspection report', 'US deploys carrier']]]),
      );
      expect(prompt).toContain('iran-conflict');
      expect(prompt).toContain('Iran strikes');
      expect(prompt).toContain('IAEA inspection report');
    });
  });

  describe('parseTriageResponse', () => {
    it('parses valid JSON response', async () => {
      const { parseTriageResponse } = await import('../scripts/hourly-triage.js');
      const json = JSON.stringify({
        candidates: [
          { index: 0, action: 'update', tracker: 'iran-conflict', confidence: 0.9, summary: 'New strike', reason: 'Matches' },
          { index: 1, action: 'discard', tracker: null, confidence: 0.3, summary: 'Old news', reason: 'Dupe' },
        ],
      });
      const results = parseTriageResponse(json);
      expect(results).toHaveLength(2);
      expect(results[0].action).toBe('update');
      expect(results[1].action).toBe('discard');
    });

    it('extracts JSON from code fences', async () => {
      const { parseTriageResponse } = await import('../scripts/hourly-triage.js');
      const response = '```json\n{"candidates":[{"index":0,"action":"discard","tracker":null,"confidence":0.2,"summary":"x","reason":"y"}]}\n```';
      const results = parseTriageResponse(response);
      expect(results).toHaveLength(1);
    });

    it('returns empty array on unparseable response', async () => {
      const { parseTriageResponse } = await import('../scripts/hourly-triage.js');
      const results = parseTriageResponse('not json at all');
      expect(results).toEqual([]);
    });
  });

  describe('buildActionPlan', () => {
    it('groups updates by tracker and filters by confidence', async () => {
      const { buildActionPlan } = await import('../scripts/hourly-triage.js');
      const candidates = [
        { title: 'A', url: 'https://a.com', source: 'Reuters', timestamp: 'T1', matchedTracker: 'iran-conflict', feedOrigin: 'gdelt' as const },
        { title: 'B', url: 'https://b.com', source: 'AP', timestamp: 'T2', matchedTracker: 'iran-conflict', feedOrigin: 'gdelt' as const },
        { title: 'C', url: 'https://c.com', source: 'BBC', timestamp: 'T3', matchedTracker: null, feedOrigin: 'gdelt' as const },
      ];
      const triageResults = [
        { index: 0, action: 'update' as const, tracker: 'iran-conflict', confidence: 0.9, summary: 'Event A', reason: '' },
        { index: 1, action: 'update' as const, tracker: 'iran-conflict', confidence: 0.4, summary: 'Event B', reason: '' },
        { index: 2, action: 'new_tracker' as const, tracker: null, confidence: 0.85, summary: 'Event C', reason: '',
          suggestedSlug: 'new-thing', suggestedDomain: 'disaster', suggestedRegion: 'europe', suggestedName: 'New Thing' },
      ];
      const plan = buildActionPlan(candidates, triageResults);
      expect(plan.updates).toHaveLength(1);
      expect(plan.updates[0].tracker).toBe('iran-conflict');
      expect(plan.updates[0].events).toHaveLength(1); // Event B filtered out (0.4 < 0.6)
      expect(plan.newTrackers).toHaveLength(1);
      expect(plan.newTrackers[0].suggestedSlug).toBe('new-thing');
      expect(plan.discardedCount).toBe(1);
    });
  });
});
