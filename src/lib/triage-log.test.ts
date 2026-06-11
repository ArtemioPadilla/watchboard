import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendTriageEntries, pruneTriageLog, readTriageLog, isoWeekKey, weeklyLogPath } from './triage-log';
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

  it('append archives entries older than current+previous ISO week into weekly files', () => {
    const path = join(tmp, 'test3.json');
    // 0 and 7 days ago are always within the current or previous ISO week;
    // 15 and 20 days ago are always outside it (max window span is 14 days).
    const old15 = mkEntry(15);
    const old20 = mkEntry(20);
    const archived = appendTriageEntries([mkEntry(0), mkEntry(7), old15, old20], path);
    const log = readTriageLog(path);
    const titles = log.entries.map((e) => e.candidate.title);
    expect(titles.length).toBe(2);
    expect(titles[0]).toMatch(/^t-0-/);
    expect(titles[1]).toMatch(/^t-7-/);
    expect(archived).toBe(2);
    expect(log.lastPruned).toBeTruthy();

    // The aged-out entries land in their weekly archive files
    for (const old of [old15, old20]) {
      const wp = weeklyLogPath(path, isoWeekKey(old.timestamp));
      expect(existsSync(wp)).toBe(true);
      const archive = readTriageLog(wp);
      expect(archive.entries.some((e) => e.candidate.title === old.candidate.title)).toBe(true);
    }
    // ...and the main file indexes the archive weeks
    expect(log.weeks).toContain(isoWeekKey(old20.timestamp));
  });

  it('pruneTriageLog is the same atomic pass and is idempotent (no duplicate archive entries)', () => {
    const path = join(tmp, 'test3b.json');
    const old = mkEntry(20);
    appendTriageEntries([old], path);
    const removedAgain = pruneTriageLog(path, 14);
    expect(removedAgain).toBe(0); // already archived during append
    const archive = readTriageLog(weeklyLogPath(path, isoWeekKey(old.timestamp)));
    expect(archive.entries).toHaveLength(1);
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
