import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendTriageEntries, pruneTriageLog, readTriageLog } from './triage-log';
import type { TriageLogEntry, Candidate } from '../../scripts/hourly-types';

let entryId = 0;
const mkEntry = (daysAgo = 0): TriageLogEntry => {
  const id = entryId++;
  return {
    timestamp: new Date(Date.now() - daysAgo * 24 * 3600_000).toISOString(),
    candidate: {
      title: `t-${daysAgo}-${id}`, url: `https://x/${id}`, source: 'r',
      timestamp: new Date().toISOString(), matchedTracker: null, feedOrigin: 'rss',
    } as Candidate,
    decision: 'discard', reason: 'noise', confidence: 0.1,
    model: null, scanType: 'light',
  };
};

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'triage-'));
  entryId = 0;
});
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('triage-log', () => {
  it('appendTriageEntries creates the file on first write', () => {
    const path = join(tmp, 'test1.json');
    appendTriageEntries([mkEntry()], path);
    expect(existsSync(path)).toBe(true);
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    expect(raw.version).toBe(1);
    expect(raw.entries).toHaveLength(1);
  });

  it('appendTriageEntries appends to existing file in order', () => {
    const path = join(tmp, 'test2.json');
    appendTriageEntries([mkEntry(0)], path);
    appendTriageEntries([mkEntry(1), mkEntry(2)], path);
    const log = readTriageLog(path);
    expect(log.entries).toHaveLength(3);
    expect(log.entries[0].candidate.title).toMatch(/^t-0-/);
    expect(log.entries[2].candidate.title).toMatch(/^t-2-/);
  });

  it('pruneTriageLog removes entries older than the cutoff (15+ days w/ 14-day retention)', () => {
    const path = join(tmp, 'test3.json');
    // Use 15/20 instead of 14/20 — 14 sits exactly at the cutoff boundary,
    // so timing jitter between mkEntry() and pruneTriageLog() can flip whether
    // the 14d entry is kept (>= cutoffMs) or dropped. Test the unambiguous
    // case: clearly-old entries are removed, recent entries are kept.
    appendTriageEntries([mkEntry(0), mkEntry(7), mkEntry(15), mkEntry(20)], path);
    const removed = pruneTriageLog(path, 14);
    const log = readTriageLog(path);
    const titles = log.entries.map((e) => e.candidate.title);
    expect(titles.length).toBe(2);
    expect(titles[0]).toMatch(/^t-0-/);
    expect(titles[1]).toMatch(/^t-7-/);
    expect(removed).toBe(2);
    expect(log.lastPruned).toBeTruthy();
  });

  it('readTriageLog returns an empty log when the file is missing', () => {
    const log = readTriageLog(join(tmp, 'nope.json'));
    expect(log.entries).toEqual([]);
    expect(log.version).toBe(1);
  });

  it('handles a corrupt file by treating it as empty', () => {
    const path = join(tmp, 'bad.json');
    writeFileSync(path, 'not json');
    const log = readTriageLog(path);
    expect(log.entries).toEqual([]);
  });
});
