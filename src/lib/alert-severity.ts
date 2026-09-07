/**
 * alert-severity.ts — one mapping from a light-scan score to a severity
 * label, shared by the homepage alerts panel and the audit page.
 *
 * The score itself is the deterministic keyword/tier/liveness score from
 * src/lib/keyword-match.ts (0-1); the thresholds are the ones the light
 * scan already acts on (0.85 posts to Telegram, 0.25 queues for the heavy
 * scan). Severity adds source tier on top: a 0.9 from a tier-3 blog is not
 * the same alert as a 0.9 from Reuters. Unlike the competitor this was
 * modelled on, no "machine assessment" text is invented: the label says
 * what the number and the tier say, nothing more.
 */

import { HIGH_THRESHOLD, MODERATE_THRESHOLD } from './keyword-match';

export type AlertSeverity = 'critical' | 'high' | 'elevated' | 'low';

/** The light scan's own thresholds — imported, not copied, so they cannot drift. */
export const ALERT_THRESHOLDS = {
  high: HIGH_THRESHOLD,
  moderate: MODERATE_THRESHOLD,
} as const;

/**
 * critical ≥ high & tier ≤ 2 | high ≥ high | elevated ≥ moderate | low.
 * Anything that cleared the actionable (moderate) threshold is "elevated":
 * it was worth queueing for the heavy scan, so it is worth a colour.
 */
export function severityFromScore(score: number, sourceTier?: number | null): AlertSeverity {
  if (!Number.isFinite(score)) return 'low';
  if (score >= ALERT_THRESHOLDS.high) return sourceTier != null && sourceTier <= 2 ? 'critical' : 'high';
  if (score >= ALERT_THRESHOLDS.moderate) return 'elevated';
  return 'low';
}

export const SEVERITY_ORDER: AlertSeverity[] = ['critical', 'high', 'elevated', 'low'];

export const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  critical: 'var(--accent-red, #e74c3c)',
  high: 'var(--accent-amber, #f39c12)',
  elevated: 'var(--accent-blue, #58a6ff)',
  low: 'var(--text-muted, #8b949e)',
};

export function severityRank(s: AlertSeverity): number {
  return SEVERITY_ORDER.indexOf(s);
}
