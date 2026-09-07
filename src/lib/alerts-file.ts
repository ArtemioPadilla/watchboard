/**
 * alerts-file.ts — builds public/_hourly/alerts.json, the small file the
 * homepage alerts panel reads.
 *
 * triage-log.json is the full audit trail (4+ MB, every discard included)
 * and is the right thing for /breaking-news-audit/. The homepage needs the
 * opposite: the last few actionable decisions, small enough to poll every
 * five minutes. Pure function so the size and window rules are tested.
 */
import type { TriageLogEntry } from '../../scripts/hourly-types';
import { severityFromScore, type AlertSeverity } from './alert-severity';

export interface AlertEntry {
  /** Stable id: sha-free, derived from timestamp + url so re-runs dedupe. */
  id: string;
  timestamp: string;
  tracker: string | null;
  title: string;
  url: string;
  source: string;
  sourceTier: number | null;
  score: number;
  severity: AlertSeverity;
  decision: 'update' | 'new_tracker';
  feedOrigin: TriageLogEntry['candidate']['feedOrigin'];
  scanType: TriageLogEntry['scanType'];
  /** Filled by E6 geoparsing when a place was resolved. */
  geo?: { lat: number; lon: number; place?: string };
  /** True once a tracker event cites this URL: the pin yields to the event. */
  resolved?: boolean;
}

export interface AlertsFile {
  version: 1;
  generated: string;
  windowHours: number;
  entries: AlertEntry[];
}

export const ALERTS_MAX_ENTRIES = 60;
export const ALERTS_WINDOW_HOURS = 72;

const ACTIONABLE = new Set<TriageLogEntry['decision']>(['update', 'new_tracker']);

export function alertId(e: Pick<TriageLogEntry, 'timestamp'> & { candidate: { url: string } }): string {
  const t = e.timestamp.replace(/[^0-9]/g, '').slice(0, 14);
  const u = e.candidate.url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 60);
  return `${t}-${u}`;
}

export function toAlertEntry(e: TriageLogEntry & { geo?: AlertEntry['geo'] }): AlertEntry {
  const c = e.candidate as TriageLogEntry['candidate'] & { geo?: AlertEntry['geo'] };
  return {
    id: alertId(e),
    timestamp: e.timestamp,
    tracker: c.matchedTracker,
    title: c.title,
    url: c.url,
    source: c.source,
    sourceTier: c.sourceTier ?? null,
    score: e.confidence,
    severity: severityFromScore(e.confidence, c.sourceTier ?? null),
    decision: e.decision as AlertEntry['decision'],
    feedOrigin: c.feedOrigin,
    scanType: e.scanType,
    ...(c.geo ? { geo: c.geo } : e.geo ? { geo: e.geo } : {}),
  };
}

/**
 * Newest first, actionable decisions only, within the window, capped.
 * Duplicate URLs keep the newest occurrence.
 */
export function buildAlertsFile(entries: TriageLogEntry[], now: Date = new Date(), resolvedUrls: ReadonlySet<string> = new Set()): AlertsFile {
  const cutoff = now.getTime() - ALERTS_WINDOW_HOURS * 3_600_000;
  const seen = new Set<string>();
  const picked: AlertEntry[] = [];
  const sorted = [...entries]
    .filter(e => ACTIONABLE.has(e.decision))
    .filter(e => {
      const t = Date.parse(e.timestamp);
      return Number.isFinite(t) && t >= cutoff && t <= now.getTime() + 60_000;
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  for (const e of sorted) {
    if (seen.has(e.candidate.url)) continue;
    seen.add(e.candidate.url);
    const entry = toAlertEntry(e);
    if (resolvedUrls.has(entry.url)) entry.resolved = true;
    picked.push(entry);
    if (picked.length >= ALERTS_MAX_ENTRIES) break;
  }
  return { version: 1, generated: now.toISOString(), windowHours: ALERTS_WINDOW_HOURS, entries: picked };
}
