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

export type AlertSeverity = 'critical' | 'high' | 'elevated' | 'low';

/** Mirrors HIGH_THRESHOLD / MODERATE_THRESHOLD in scripts/hourly-light-scan.ts. */
export const ALERT_THRESHOLDS = {
  high: 0.85,
  moderate: 0.25,
} as const;

export function severityFromScore(score: number, sourceTier?: number | null): AlertSeverity {
  if (!Number.isFinite(score)) return 'low';
  if (score >= ALERT_THRESHOLDS.high) return sourceTier != null && sourceTier <= 2 ? 'critical' : 'high';
  if (score >= 0.6) return 'elevated';
  if (score >= ALERT_THRESHOLDS.moderate) return 'low';
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
