import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { TriageLog, TriageLogEntry } from '../../scripts/hourly-types';

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

function writeTriageLog(log: TriageLog, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(log, null, 2), 'utf8');
}

export function appendTriageEntries(entries: TriageLogEntry[], path: string): void {
  const current = readTriageLog(path);
  current.entries.push(...entries);
  writeTriageLog(current, path);
}

/** Prune entries older than `keepDays`. Returns number removed. */
export function pruneTriageLog(path: string, keepDays: number): number {
  const current = readTriageLog(path);
  const cutoffMs = Date.now() - keepDays * 24 * 3600_000;
  const before = current.entries.length;
  current.entries = current.entries.filter((e) => new Date(e.timestamp).getTime() >= cutoffMs);
  current.lastPruned = new Date().toISOString();
  writeTriageLog(current, path);
  return before - current.entries.length;
}
