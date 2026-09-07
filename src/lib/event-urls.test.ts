import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectRecentEventUrls } from '../../scripts/lib/event-urls-node';
import { buildAlertsFile } from './alerts-file';
import type { TriageLogEntry } from '../../scripts/hourly-types';

function tree(): string {
  const root = mkdtempSync(join(tmpdir(), 'wb-events-'));
  const mk = (slug: string, date: string, events: unknown) => {
    const d = join(root, slug, 'data', 'events');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, `${date}.json`), JSON.stringify(events));
  };
  mk('a', '2026-09-06', [{ id: 'x', sources: [{ name: 'Reuters', url: 'https://r.test/1' }, 'https://r.test/2'] }]);
  mk('a', '2026-08-01', [{ id: 'old', sources: [{ url: 'https://r.test/old' }] }]);
  mk('b', '2026-09-07', { not: 'an array' });
  mkdirSync(join(root, 'c', 'data'), { recursive: true });
  return root;
}

describe('collectRecentEventUrls', () => {
  it('collects string and object sources within the window only', () => {
    const urls = collectRecentEventUrls(tree(), 7, new Date('2026-09-07T12:00:00Z'));
    expect([...urls].sort()).toEqual(['https://r.test/1', 'https://r.test/2']);
  });
  it('returns an empty set for a missing directory', () => {
    expect(collectRecentEventUrls('/nonexistent/path').size).toBe(0);
  });
});

describe('buildAlertsFile resolved flag', () => {
  const e = (url: string): TriageLogEntry => ({
    timestamp: '2026-09-07T11:00:00Z', decision: 'update', reason: 'r', confidence: 0.9, model: null, scanType: 'light',
    candidate: { title: 't', url, source: 'reuters', timestamp: '2026-09-07T11:00:00Z', matchedTracker: 'a', feedOrigin: 'rss', sourceTier: 2, geo: { lat: 1, lon: 2, method: 'gazetteer' } },
  });
  it('marks entries whose URL an event now cites', () => {
    const f = buildAlertsFile([e('https://r.test/1'), e('https://r.test/9')], new Date('2026-09-07T12:00:00Z'), new Set(['https://r.test/1']));
    expect(f.entries.find(x => x.url === 'https://r.test/1')?.resolved).toBe(true);
    expect(f.entries.find(x => x.url === 'https://r.test/9')?.resolved).toBeUndefined();
    expect(f.entries[0].geo).toEqual({ lat: 1, lon: 2, method: 'gazetteer' });
  });
});
