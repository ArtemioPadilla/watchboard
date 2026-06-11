import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync } from 'fs';
import { dirname, join, basename } from 'path';
import type { TriageLog, TriageLogEntry } from '../../scripts/hourly-types';

/**
 * Weekly-partitioned triage audit log.
 *
 * Layout (all under public/_hourly/):
 * - triage-log.json            — main file: entries for the CURRENT + PREVIOUS
 *                                ISO week only, plus a `weeks` index of the
 *                                available archive files. Stays small.
 * - triage-log-YYYY-Www.json   — weekly archive files, written when entries
 *                                age out of the main window. Loaded on demand
 *                                by the audit page ("Load more").
 *
 * appendTriageEntries() is a single atomic read-modify-write that appends,
 * partitions aged-out entries into weekly files, prunes the main file, and
 * stamps `lastPruned` — so the old append/prune race (which froze lastPruned)
 * cannot recur. The first run against a legacy monolithic triage-log.json
 * performs the one-time migration automatically (all old entries are split
 * into weekly files and the main file is rewritten pruned).
 */

export function readTriageLog(path: string): TriageLog {
  if (!existsSync(path)) return { version: 1, lastPruned: '', entries: [] };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as TriageLog;
    if (raw.version !== 1 || !Array.isArray(raw.entries)) return { version: 1, lastPruned: '', entries: [] };
    return raw;
  } catch {
    return { version: 1, lastPruned: '', entries: [] };
  }
}

/** Atomic write: tmp + rename (rename is atomic on POSIX). */
function writeTriageLog(log: TriageLog, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(log, null, 2), 'utf8');
  renameSync(tmpPath, path);
}

/** ISO week key ("2026-W24") for an ISO timestamp, computed in UTC. */
export function isoWeekKey(isoTimestamp: string | number | Date): string {
  const d = new Date(isoTimestamp);
  if (isNaN(d.getTime())) return 'unknown';
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7; // Mon=1 … Sun=7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum); // nearest Thursday
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Path of the weekly archive file next to the main log. */
export function weeklyLogPath(mainPath: string, week: string): string {
  const base = basename(mainPath, '.json');
  return join(dirname(mainPath), `${base}-${week}.json`);
}

/** Scan the log directory for available weekly archive files (sorted ascending). */
function listArchiveWeeks(mainPath: string): string[] {
  const dir = dirname(mainPath);
  if (!existsSync(dir)) return [];
  const base = basename(mainPath, '.json');
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d{4}-W\\d{2})\\.json$`);
  return readdirSync(dir)
    .map((f) => f.match(re)?.[1])
    .filter((w): w is string => Boolean(w))
    .sort();
}

function entryKey(e: TriageLogEntry): string {
  return `${e.timestamp}|${e.candidate?.url ?? ''}|${e.decision}`;
}

/**
 * Append entries to the audit log, partition aged-out entries into weekly
 * archive files, prune the main file to the current + previous ISO week, and
 * stamp `lastPruned` — all in one atomic read-modify-write.
 *
 * Returns the number of entries archived out of the main file.
 */
export function appendTriageEntries(entries: TriageLogEntry[], path: string): number {
  const current = readTriageLog(path);
  current.entries.push(...entries);

  const now = Date.now();
  const keepWeeks = new Set([isoWeekKey(now), isoWeekKey(now - 7 * 86_400_000)]);

  const keep: TriageLogEntry[] = [];
  const toArchive = new Map<string, TriageLogEntry[]>();
  for (const e of current.entries) {
    const wk = isoWeekKey(e.timestamp);
    if (keepWeeks.has(wk)) {
      keep.push(e);
    } else {
      if (!toArchive.has(wk)) toArchive.set(wk, []);
      toArchive.get(wk)!.push(e);
    }
  }

  // Merge aged-out entries into their weekly archive files (idempotent —
  // deduped by timestamp+url+decision so re-runs can't duplicate).
  for (const [week, list] of toArchive) {
    const archivePath = weeklyLogPath(path, week);
    const archive = readTriageLog(archivePath);
    const seen = new Set(archive.entries.map(entryKey));
    for (const e of list) {
      const key = entryKey(e);
      if (seen.has(key)) continue;
      seen.add(key);
      archive.entries.push(e);
    }
    writeTriageLog(archive, archivePath);
  }

  const archived = current.entries.length - keep.length;
  current.entries = keep;
  current.lastPruned = new Date().toISOString();
  current.weeks = listArchiveWeeks(path);
  writeTriageLog(current, path);
  return archived;
}

/**
 * Back-compat wrapper. Appending already prunes atomically; this just runs the
 * same partition/prune pass with no new entries. The `keepDays` parameter is
 * retained for signature compatibility — retention is week-based (current +
 * previous ISO week ≈ 7–14 days) regardless of its value.
 */
export function pruneTriageLog(path: string, _keepDays?: number): number {
  return appendTriageEntries([], path);
}
