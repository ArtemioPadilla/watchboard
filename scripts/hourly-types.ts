import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// --- Types ---

export interface SeenEntry {
  url: string;
  tracker: string;
  eventId: string;
  ts: string;
}

export interface HourlyState {
  lastScan: string;
  seen: SeenEntry[];
}

export interface ManifestUpdate {
  tracker: string;
  action: 'update' | 'new_tracker';
  eventIds: string[];
  sections: string[];
  tweetId: string | null;
  timestamp: string;
  seeded?: boolean;
}

export interface HourlyManifest {
  date: string;
  updates: ManifestUpdate[];
}

export interface Candidate {
  title: string;
  url: string;
  source: string;
  timestamp: string;
  matchedTracker: string | null;
  feedOrigin: 'rss' | 'gdelt' | 'bluesky' | 'telegram';
  /** Source-tier hint propagated from the feed registry; 1 = official, 2 = major outlet, 3 = institutional. */
  sourceTier?: 1 | 2 | 3;
  /** ISO 639-1 language code from the source feed (informational; matching is language-agnostic). */
  language?: 'en' | 'es' | 'fr' | 'pt' | 'ar' | 'zh' | 'ja' | 'hi';
}

export interface TriageResult {
  index: number;
  action: 'update' | 'new_tracker' | 'discard';
  tracker: string | null;
  confidence: number;
  summary: string;
  reason: string;
  suggestedSlug?: string;
  suggestedDomain?: string;
  suggestedRegion?: string;
  suggestedName?: string;
}

export interface ActionPlan {
  updates: ActionPlanUpdate[];
  newTrackers: ActionPlanNewTracker[];
  scannedAt: string;
  candidateCount: number;
  discardedCount: number;
}

export interface ActionPlanUpdate {
  tracker: string;
  events: { summary: string; sources: string[]; timestamp: string }[];
}

export interface ActionPlanNewTracker {
  suggestedSlug: string;
  suggestedDomain: string;
  suggestedRegion: string;
  suggestedName: string;
  triggerEvent: { summary: string; sources: string[]; timestamp: string };
}

/** A candidate the light scan saw with moderate confidence. The next heavy
 *  scan reads this file, merges with its own poll, and runs full triage. */
export interface PendingCandidate {
  candidate: Candidate;
  /** Multi-signal score from the light scan: keyword + liveness + tier. 0-1. */
  score: number;
  /** When the light scan recorded it. */
  recordedAt: string;
}

export interface PendingCandidates {
  version: 1;
  entries: PendingCandidate[];
}

/** One row in the audit log. Append-only; pruned at 14 days. */
export interface TriageLogEntry {
  timestamp: string;
  candidate: Candidate;
  decision: 'update' | 'new_tracker' | 'defer' | 'discard';
  reason: string;
  confidence: number;
  model: string | null;       // null for keyword-only decisions
  scanType: 'light' | 'heavy';
}

export interface TriageLog {
  version: 1;
  lastPruned: string;
  entries: TriageLogEntry[];
}

// --- Paths ---

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PATHS = {
  hourlyDir: join(ROOT, 'public', '_hourly'),
  state: join(ROOT, 'public', '_hourly', 'state.json'),
  manifest: join(ROOT, 'public', '_hourly', 'today-updates.json'),
  archiveDir: join(ROOT, 'public', '_hourly', 'archive'),
  trackersDir: join(ROOT, 'trackers'),
  socialBudget: join(ROOT, 'public', '_social', 'budget.json'),
  socialHistory: join(ROOT, 'public', '_social', 'history.json'),
  pendingCandidates: join(ROOT, 'public', '_hourly', 'pending-candidates.json'),
  triageLog:         join(ROOT, 'public', '_hourly', 'triage-log.json'),
  realtimeState:     join(ROOT, 'public', '_hourly', 'realtime-state.json'),
};

// --- State I/O ---

const PRUNE_HOURS = 48;

export function loadState(path: string = PATHS.state): HourlyState {
  if (!existsSync(path)) {
    return { lastScan: '', seen: [] };
  }
  try {
    const raw: HourlyState = JSON.parse(readFileSync(path, 'utf8'));
    const cutoff = new Date(Date.now() - PRUNE_HOURS * 60 * 60 * 1000).toISOString();
    raw.seen = raw.seen.filter(e => e.ts > cutoff);
    return raw;
  } catch {
    return { lastScan: '', seen: [] };
  }
}

export function saveState(state: HourlyState, path: string = PATHS.state): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), 'utf8');
}

// --- Manifest I/O ---

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function loadManifest(
  path: string = PATHS.manifest,
  archiveDir: string = PATHS.archiveDir,
): HourlyManifest {
  const today = todayDate();
  if (!existsSync(path)) {
    return { date: today, updates: [] };
  }
  try {
    const raw: HourlyManifest = JSON.parse(readFileSync(path, 'utf8'));
    if (raw.date !== today) {
      // Archive yesterday's manifest
      mkdirSync(archiveDir, { recursive: true });
      renameSync(path, join(archiveDir, `${raw.date}.json`));
      return { date: today, updates: [] };
    }
    return raw;
  } catch {
    return { date: today, updates: [] };
  }
}

export function saveManifest(manifest: HourlyManifest, path: string = PATHS.manifest): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 2), 'utf8');
}

// --- Candidate Normalization ---

export function normalizeCandidate(
  raw: { title: string; url: string; source: string; timestamp: string },
  matchedTracker: string | null,
  feedOrigin: Candidate['feedOrigin'],
  extra: Pick<Candidate, 'sourceTier' | 'language'> = {},
): Candidate {
  return {
    title: raw.title,
    url: raw.url,
    source: raw.source,
    timestamp: raw.timestamp,
    matchedTracker,
    feedOrigin,
    ...extra,
  };
}
