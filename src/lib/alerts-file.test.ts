import { describe, it, expect } from 'vitest';
import { buildAlertsFile, ALERTS_MAX_ENTRIES, alertId } from './alerts-file';
import { severityFromScore } from './alert-severity';
import type { TriageLogEntry } from '../../scripts/hourly-types';

const NOW = new Date('2026-09-07T12:00:00Z');
function entry(over: Partial<TriageLogEntry> & { url?: string; hoursAgo?: number; tier?: 1 | 2 | 3 }): TriageLogEntry {
  const ts = new Date(NOW.getTime() - (over.hoursAgo ?? 1) * 3_600_000).toISOString();
  return {
    timestamp: ts,
    candidate: {
      title: 'Something happened', url: over.url ?? `https://example.test/${ts}`, source: 'reuters', timestamp: ts,
      matchedTracker: 'iran-conflict', feedOrigin: 'rss', sourceTier: over.tier ?? 2,
    },
    decision: over.decision ?? 'update',
    reason: 'r', confidence: over.confidence ?? 0.9, model: null, scanType: over.scanType ?? 'light',
  };
}

describe('severityFromScore', () => {
  it('maps thresholds and tier', () => {
    expect(severityFromScore(0.95, 2)).toBe('critical');
    expect(severityFromScore(0.95, 3)).toBe('high');
    expect(severityFromScore(0.85, null)).toBe('high');
    expect(severityFromScore(0.7, 1)).toBe('elevated');
    expect(severityFromScore(0.3, 1)).toBe('low');
    expect(severityFromScore(NaN, 1)).toBe('low');
  });
});

describe('buildAlertsFile', () => {
  it('returns an empty file for no entries', () => {
    const f = buildAlertsFile([], NOW);
    expect(f.entries).toEqual([]);
    expect(f.generated).toBe(NOW.toISOString());
  });

  it('keeps only actionable decisions inside the 72 h window, newest first', () => {
    const f = buildAlertsFile([
      entry({ hoursAgo: 1, url: 'https://a' }),
      entry({ hoursAgo: 80, url: 'https://old' }),
      entry({ hoursAgo: 2, url: 'https://b', decision: 'discard' }),
      entry({ hoursAgo: 3, url: 'https://c', decision: 'defer' }),
      entry({ hoursAgo: 0.5, url: 'https://d', decision: 'new_tracker' }),
    ], NOW);
    expect(f.entries.map(e => e.url)).toEqual(['https://d', 'https://a']);
    expect(f.entries[0].decision).toBe('new_tracker');
  });

  it('caps at ALERTS_MAX_ENTRIES dropping the oldest and dedupes by url', () => {
    const many = Array.from({ length: ALERTS_MAX_ENTRIES + 15 }, (_, i) => entry({ hoursAgo: i * 0.5, url: `https://x/${i}` }));
    many.push(entry({ hoursAgo: 0.1, url: 'https://x/0' })); // duplicate of the newest url
    const f = buildAlertsFile(many, NOW);
    expect(f.entries).toHaveLength(ALERTS_MAX_ENTRIES);
    expect(f.entries[0].url).toBe('https://x/0');
    expect(new Set(f.entries.map(e => e.url)).size).toBe(ALERTS_MAX_ENTRIES);
    expect(f.entries.at(-1)!.url).toBe(`https://x/${ALERTS_MAX_ENTRIES - 1}`);
  });

  it('serialises small enough to poll (≤ 60 KB at the cap)', () => {
    const many = Array.from({ length: ALERTS_MAX_ENTRIES }, (_, i) => entry({ hoursAgo: i * 0.5, url: `https://example.test/some/long/article/path/number/${i}` }));
    const bytes = Buffer.byteLength(JSON.stringify(buildAlertsFile(many, NOW)));
    expect(bytes).toBeLessThan(60 * 1024);
  });

  it('ignores entries with unparsable or future timestamps', () => {
    const bad = entry({ url: 'https://bad' }); bad.timestamp = 'not-a-date';
    const future = entry({ hoursAgo: -5, url: 'https://future' });
    expect(buildAlertsFile([bad, future], NOW).entries).toEqual([]);
  });

  it('produces stable ids', () => {
    const e = entry({ url: 'https://example.test/a?b=1' });
    expect(alertId(e)).toBe(alertId(e));
    expect(alertId(e)).toMatch(/^\d{14}-example-test-a-b-1$/);
  });
});
