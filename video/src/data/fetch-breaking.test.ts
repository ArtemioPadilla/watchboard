import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cooldownPenalty,
  noveltyBonus,
  pruneHistory,
  scoreCandidate,
  loadHistory,
  saveUsedTrackers,
  parseKpiDisplay,
  type TrackerHistory,
  type ScoredCandidate,
} from './fetch-breaking.js';
import type { VideoMode } from './fetch-breaking.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Helper to create a date string N days ago
function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function makeCandidate(overrides: Partial<ScoredCandidate> = {}): ScoredCandidate {
  return {
    tracker: {
      slug: 'test-tracker',
      name: 'Test Tracker',
      icon: '🧪',
      headline: 'Test headline',
      kpiLabel: 'DAY',
      kpiValue: 100,
      kpiPrefix: '',
      kpiSuffix: '',
      sourceTier: 2,
      sourceLabel: 'Test',
      mapCenter: [0, 0],
      thumbnailUrls: [],
    },
    score: 0,
    breaking: false,
    lastUpdated: todayStr(),
    tone: 'neutral',
    domain: 'conflict',
    temporal: 'live',
    tags: [],
    dayCount: 500,
    ...overrides,
  };
}

describe('cooldownPenalty', () => {
  it('returns 0 for unknown tracker', () => {
    const history: TrackerHistory = { version: 1, entries: {} };
    expect(cooldownPenalty('unknown', history)).toBe(0);
  });

  it('returns 0 when only entry is today', () => {
    const history: TrackerHistory = {
      version: 1,
      entries: { 'test-tracker': [todayStr()] },
    };
    expect(cooldownPenalty('test-tracker', history)).toBe(0);
  });

  it('returns 60 for tracker that appeared yesterday', () => {
    const history: TrackerHistory = {
      version: 1,
      entries: { 'test-tracker': [daysAgoStr(1)] },
    };
    expect(cooldownPenalty('test-tracker', history)).toBe(60);
  });

  it('returns 30 for tracker that appeared 2 days ago', () => {
    const history: TrackerHistory = {
      version: 1,
      entries: { 'test-tracker': [daysAgoStr(2)] },
    };
    expect(cooldownPenalty('test-tracker', history)).toBe(30);
  });

  it('returns 15 for tracker that appeared 3 days ago', () => {
    const history: TrackerHistory = {
      version: 1,
      entries: { 'test-tracker': [daysAgoStr(3)] },
    };
    expect(cooldownPenalty('test-tracker', history)).toBe(15);
  });

  it('returns 7 for tracker that appeared 4 days ago', () => {
    const history: TrackerHistory = {
      version: 1,
      entries: { 'test-tracker': [daysAgoStr(4)] },
    };
    expect(cooldownPenalty('test-tracker', history)).toBe(7);
  });

  it('returns 3 for tracker that appeared 5+ days ago', () => {
    const history: TrackerHistory = {
      version: 1,
      entries: { 'test-tracker': [daysAgoStr(6)] },
    };
    expect(cooldownPenalty('test-tracker', history)).toBe(3);
  });

  it('uses the most recent past date (ignoring today)', () => {
    const history: TrackerHistory = {
      version: 1,
      entries: { 'test-tracker': [daysAgoStr(5), daysAgoStr(1), todayStr()] },
    };
    expect(cooldownPenalty('test-tracker', history)).toBe(60);
  });
});

describe('noveltyBonus', () => {
  it('returns 10 for tracker never in history', () => {
    const history: TrackerHistory = { version: 1, entries: {} };
    expect(noveltyBonus(todayStr(), 'new-tracker', history)).toBe(10);
  });

  it('returns 20 when tracker updated after last appearance', () => {
    const history: TrackerHistory = {
      version: 1,
      entries: { 'test-tracker': [daysAgoStr(3)] },
    };
    // lastUpdated is today, last appearance was 3 days ago
    expect(noveltyBonus(todayStr(), 'test-tracker', history)).toBe(20);
  });

  it('returns -20 when tracker NOT updated since last appearance', () => {
    const history: TrackerHistory = {
      version: 1,
      entries: { 'test-tracker': [todayStr()] },
    };
    // lastUpdated is 5 days ago, last appearance is today
    expect(noveltyBonus(daysAgoStr(5), 'test-tracker', history)).toBe(-20);
  });

  it('returns -20 when lastUpdated equals last appearance', () => {
    const lastDate = daysAgoStr(2);
    const history: TrackerHistory = {
      version: 1,
      entries: { 'test-tracker': [lastDate] },
    };
    expect(noveltyBonus(lastDate, 'test-tracker', history)).toBe(-20);
  });
});

describe('pruneHistory', () => {
  it('removes entries older than 7 days', () => {
    const history: TrackerHistory = {
      version: 1,
      entries: {
        old: [daysAgoStr(10)],
        recent: [daysAgoStr(3)],
        mixed: [daysAgoStr(10), daysAgoStr(2)],
      },
    };
    const pruned = pruneHistory(history);
    expect(pruned.entries['old']).toBeUndefined();
    expect(pruned.entries['recent']).toEqual([daysAgoStr(3)]);
    expect(pruned.entries['mixed']).toEqual([daysAgoStr(2)]);
  });

  it('returns empty entries if all are old', () => {
    const history: TrackerHistory = {
      version: 1,
      entries: { old: [daysAgoStr(15)] },
    };
    const pruned = pruneHistory(history);
    expect(Object.keys(pruned.entries)).toHaveLength(0);
  });
});

describe('scoreCandidate with diversity', () => {
  it('returns base score when no history provided', () => {
    const candidate = makeCandidate({ breaking: true });
    const score = scoreCandidate(candidate, 'conflict');
    // breaking(100) + age<=1(30) + domain=conflict(10) + temporal=live(5) + dayCount>0(3) = 148
    expect(score).toBe(148);
  });

  it('applies cooldown penalty from history', () => {
    const candidate = makeCandidate({ breaking: true });
    const history: TrackerHistory = {
      version: 1,
      entries: { 'test-tracker': [daysAgoStr(1)] },
    };
    const scoreWithHistory = scoreCandidate(candidate, 'conflict', history);
    const baseScore = scoreCandidate(candidate, 'conflict');
    // penalty=60, novelty=20 (lastUpdated=today > yesterday), net = -40
    expect(scoreWithHistory).toBe(baseScore! - 60 + 20);
  });

  it('never returns negative score', () => {
    const candidate = makeCandidate({
      breaking: false,
      lastUpdated: daysAgoStr(5),
      domain: undefined,
      temporal: undefined,
      dayCount: 0,
    });
    const history: TrackerHistory = {
      version: 1,
      entries: { 'test-tracker': [daysAgoStr(1), daysAgoStr(2), todayStr()] },
    };
    const score = scoreCandidate(candidate, 'conflict', history);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('applies novelty bonus for never-seen tracker', () => {
    const candidate = makeCandidate({ breaking: false, dayCount: 0 });
    const emptyHistory: TrackerHistory = { version: 1, entries: {} };
    const scoreWithEmpty = scoreCandidate(candidate, 'conflict', emptyHistory);
    const baseScore = scoreCandidate(candidate, 'conflict');
    // novelty=10 (never appeared), cooldown=0
    expect(scoreWithEmpty).toBe(baseScore! + 10);
  });

  it('works in positive mode with history', () => {
    const candidate = makeCandidate({ tone: 'progress', dayCount: 1500 });
    const history: TrackerHistory = {
      version: 1,
      entries: { 'test-tracker': [daysAgoStr(2)] },
    };
    const scoreWithHistory = scoreCandidate(candidate, 'positive', history);
    const baseScore = scoreCandidate(candidate, 'positive');
    // penalty=30, novelty=20 (lastUpdated=today > 2 days ago)
    expect(scoreWithHistory).toBe(baseScore! - 30 + 20);
  });

  it('excludes non-progress trackers in positive mode regardless of history', () => {
    const candidate = makeCandidate({ tone: 'neutral' });
    const history: TrackerHistory = { version: 1, entries: {} };
    expect(scoreCandidate(candidate, 'positive', history)).toBeNull();
  });
});

describe('loadHistory and saveUsedTrackers', () => {
  const STATE_DIR = resolve(import.meta.dirname ?? '.', '../../state');
  const STATE_PATH = join(STATE_DIR, 'tracker-history.json');

  beforeEach(() => {
    // Ensure clean state
    if (existsSync(STATE_PATH)) {
      rmSync(STATE_PATH);
    }
  });

  afterEach(() => {
    if (existsSync(STATE_PATH)) {
      rmSync(STATE_PATH);
    }
  });

  it('loadHistory returns default when no file exists', () => {
    const history = loadHistory();
    expect(history).toEqual({ version: 1, entries: {} });
  });

  it('saveUsedTrackers creates state file and records slugs', () => {
    saveUsedTrackers(['iran-conflict', 'chernobyl']);
    const saved = JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
    expect(saved.version).toBe(1);
    expect(saved.entries['iran-conflict']).toContain(todayStr());
    expect(saved.entries['chernobyl']).toContain(todayStr());
  });

  it('saveUsedTrackers does not duplicate today', () => {
    saveUsedTrackers(['iran-conflict']);
    saveUsedTrackers(['iran-conflict']);
    const saved = JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
    const dates = saved.entries['iran-conflict'];
    expect(dates.filter((d: string) => d === todayStr())).toHaveLength(1);
  });

  it('round-trip: save then load', () => {
    saveUsedTrackers(['tracker-a', 'tracker-b']);
    const loaded = loadHistory();
    expect(loaded.entries['tracker-a']).toContain(todayStr());
    expect(loaded.entries['tracker-b']).toContain(todayStr());
  });
});

describe('parseKpiDisplay', () => {
  it('extracts suffix % from percentage values', () => {
    expect(parseKpiDisplay('145%')).toEqual({ prefix: '', suffix: '%' });
    expect(parseKpiDisplay('+0.7%')).toEqual({ prefix: '+', suffix: '%' });
    expect(parseKpiDisplay('~13.7%')).toEqual({ prefix: '~', suffix: '%' });
  });

  it('normalizes million/billion/trillion long-form to letter', () => {
    expect(parseKpiDisplay('7.1 Million')).toEqual({ prefix: '', suffix: 'M' });
    expect(parseKpiDisplay('14 million+')).toEqual({ prefix: '', suffix: 'M+' });
    expect(parseKpiDisplay('14.9 Million')).toEqual({ prefix: '', suffix: 'M' });
  });

  it('preserves short-form letter suffixes', () => {
    expect(parseKpiDisplay('100B+')).toEqual({ prefix: '', suffix: 'B+' });
    expect(parseKpiDisplay('~1.323M')).toEqual({ prefix: '~', suffix: 'M' });
  });

  it('extracts trailing + from plain numbers', () => {
    expect(parseKpiDisplay('150,000+')).toEqual({ prefix: '', suffix: '+' });
    expect(parseKpiDisplay('72,560+')).toEqual({ prefix: '', suffix: '+' });
  });

  it('handles plain numbers with no suffix', () => {
    expect(parseKpiDisplay('49')).toEqual({ prefix: '', suffix: '' });
    expect(parseKpiDisplay('778')).toEqual({ prefix: '', suffix: '' });
  });

  it('handles tilde prefix only', () => {
    expect(parseKpiDisplay('~90')).toEqual({ prefix: '~', suffix: '' });
    expect(parseKpiDisplay('~7,000+')).toEqual({ prefix: '~', suffix: '+' });
  });

  it('handles × multiplier suffix', () => {
    expect(parseKpiDisplay('4×')).toEqual({ prefix: '', suffix: '×' });
  });
});
