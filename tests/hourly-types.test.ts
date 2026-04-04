import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

// We'll test against a temp directory
const TMP = join(__dirname, '__hourly_test_tmp__');

describe('hourly-types', () => {
  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  describe('loadState', () => {
    it('returns empty state when file does not exist', async () => {
      const { loadState } = await import('../scripts/hourly-types.js');
      const state = loadState(join(TMP, 'state.json'));
      expect(state.seen).toEqual([]);
      expect(state.lastScan).toBe('');
    });

    it('loads existing state and prunes entries older than 48h', async () => {
      const { loadState } = await import('../scripts/hourly-types.js');
      const now = new Date();
      const old = new Date(now.getTime() - 49 * 60 * 60 * 1000).toISOString();
      const recent = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();
      writeFileSync(join(TMP, 'state.json'), JSON.stringify({
        lastScan: old,
        seen: [
          { url: 'https://old.com', tracker: 'a', eventId: 'e1', ts: old },
          { url: 'https://new.com', tracker: 'b', eventId: 'e2', ts: recent },
        ],
      }));
      const state = loadState(join(TMP, 'state.json'));
      expect(state.seen).toHaveLength(1);
      expect(state.seen[0].url).toBe('https://new.com');
    });
  });

  describe('loadManifest', () => {
    it('returns empty manifest when file does not exist', async () => {
      const { loadManifest } = await import('../scripts/hourly-types.js');
      const manifest = loadManifest(join(TMP, 'today-updates.json'));
      expect(manifest.updates).toEqual([]);
    });

    it('archives old manifest and returns fresh one on date rollover', async () => {
      const { loadManifest } = await import('../scripts/hourly-types.js');
      mkdirSync(join(TMP, 'archive'), { recursive: true });
      writeFileSync(join(TMP, 'today-updates.json'), JSON.stringify({
        date: '2026-04-02',
        updates: [{ tracker: 'test', action: 'update' }],
      }));
      const manifest = loadManifest(join(TMP, 'today-updates.json'), join(TMP, 'archive'));
      expect(manifest.date).toBe(new Date().toISOString().slice(0, 10));
      expect(manifest.updates).toEqual([]);
      expect(existsSync(join(TMP, 'archive', '2026-04-02.json'))).toBe(true);
    });
  });

  describe('Candidate normalization', () => {
    it('normalizes RSS and GDELT candidates to common shape', async () => {
      const { normalizeCandidate } = await import('../scripts/hourly-types.js');
      const c = normalizeCandidate({
        title: 'Breaking: Test Event',
        url: 'https://reuters.com/article',
        source: 'Reuters',
        timestamp: '2026-04-03T15:00:00Z',
      }, 'iran-conflict', 'rss');
      expect(c.matchedTracker).toBe('iran-conflict');
      expect(c.feedOrigin).toBe('rss');
      expect(c.title).toBe('Breaking: Test Event');
    });
  });
});
