/**
 * activity-index.ts — one number per tracker for "how much is happening",
 * computed from real data with declared weights and visible factors
 * (plan E7.H1). Replaces the scattered heuristics in hero-selection, the
 * video scorer and the sidebar order with a single deterministic function.
 *
 * Score is 0-100. Every factor reports its raw value and its contribution,
 * so a badge can show *why* a tracker ranks where it does. Historical
 * trackers are normalised by their update cadence so a tracker that is
 * meant to move once a month is not punished for moving once a month.
 */

export interface ActivityEvent {
  /** ISO date or timestamp. */
  date: string;
  sources?: { tier: number }[];
}

export interface ActivityInput {
  events: ActivityEvent[];
  breaking?: boolean;
  lastUpdated?: string | null;
  sectionsUpdatedCount?: number;
  /** KPI rows that carry a structured delta with a non-zero value. */
  kpiDeltaCount?: number;
  /** Date of the newest digest entry (YYYY-MM-DD). */
  latestDigestDate?: string | null;
  temporal?: 'live' | 'historical' | string;
  updateIntervalDays?: number;
}

export interface ActivityFactor {
  name: 'recentEvents' | 'breaking' | 'sectionsUpdated' | 'kpiDeltas' | 'digestFreshness' | 'sourceQuality';
  /** Raw measured value (count, boolean as 0/1, days, mean tier). */
  value: number;
  /** Points added to the score (0..weight). */
  contribution: number;
  /** Weight in points; contributions never exceed it. */
  weight: number;
}

export interface ActivityIndex {
  score: number;
  factors: ActivityFactor[];
  /** Window in days used for "recent", after cadence normalisation. */
  windowDays: number;
}

/** Declared weights; they sum to 100. */
export const ACTIVITY_WEIGHTS = {
  recentEvents: 35,
  breaking: 20,
  digestFreshness: 15,
  sectionsUpdated: 10,
  kpiDeltas: 10,
  sourceQuality: 10,
} as const;

/** Events in the window that saturate the recentEvents factor. */
export const RECENT_EVENTS_SATURATION = 10;
export const SECTIONS_SATURATION = 5;
export const KPI_DELTAS_SATURATION = 3;
const BASE_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function parseTime(s: string | null | undefined): number | null {
  if (!s) return null;
  // Bare dates are UTC midnight; keep timestamps as given.
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s);
  return Number.isFinite(t) ? t : null;
}

/**
 * Window for "recent": 7 days for live trackers; for historical ones twice
 * the cadence, never less than 7 days. A weekly tracker gets 14 days.
 */
export function activityWindowDays(input: Pick<ActivityInput, 'temporal' | 'updateIntervalDays'>): number {
  const interval = Math.max(1, Math.floor(input.updateIntervalDays ?? 1));
  if (input.temporal === 'historical') return Math.max(BASE_WINDOW_DAYS, interval * 2);
  return Math.max(BASE_WINDOW_DAYS, interval);
}

export function computeActivity(input: ActivityInput, now: Date = new Date()): ActivityIndex {
  const nowMs = now.getTime();
  const windowDays = activityWindowDays(input);
  const cutoff = nowMs - windowDays * DAY_MS;

  let recent = 0;
  let tierSum = 0;
  let tierCount = 0;
  for (const ev of input.events) {
    const t = parseTime(ev.date);
    if (t === null || t < cutoff || t > nowMs + DAY_MS) continue;
    recent++;
    for (const s of ev.sources ?? []) {
      if (typeof s.tier === 'number' && s.tier >= 1 && s.tier <= 4) { tierSum += s.tier; tierCount++; }
    }
  }
  const meanTier = tierCount > 0 ? tierSum / tierCount : null;

  const digestAt = parseTime(input.latestDigestDate ?? null);
  const digestAgeDays = digestAt === null ? Infinity : Math.max(0, (nowMs - digestAt) / DAY_MS);
  // Fresh within one cadence, zero after the whole window.
  const interval = Math.max(1, input.updateIntervalDays ?? 1);
  const digestFresh = digestAgeDays === Infinity ? 0 : clamp01(1 - Math.max(0, digestAgeDays - interval) / windowDays);

  const factors: ActivityFactor[] = [
    f('recentEvents', recent, clamp01(recent / RECENT_EVENTS_SATURATION)),
    f('breaking', input.breaking ? 1 : 0, input.breaking ? 1 : 0),
    f('digestFreshness', digestAgeDays === Infinity ? -1 : round2(digestAgeDays), digestFresh),
    f('sectionsUpdated', input.sectionsUpdatedCount ?? 0, clamp01((input.sectionsUpdatedCount ?? 0) / SECTIONS_SATURATION)),
    f('kpiDeltas', input.kpiDeltaCount ?? 0, clamp01((input.kpiDeltaCount ?? 0) / KPI_DELTAS_SATURATION)),
    // Tier 1 → full points, tier 4 → none; no recent sources → none.
    f('sourceQuality', meanTier === null ? 0 : round2(meanTier), meanTier === null ? 0 : clamp01((4 - meanTier) / 3)),
  ];
  const score = Math.round(factors.reduce((acc, x) => acc + x.contribution, 0));
  return { score: Math.max(0, Math.min(100, score)), factors, windowDays };
}

function f(name: ActivityFactor['name'], value: number, share: number): ActivityFactor {
  const weight = ACTIVITY_WEIGHTS[name];
  return { name, value, contribution: round2(share * weight), weight };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Compact "why" text for tooltips: "events 7d: 12 (+35) · breaking (+20) · …". */
export function describeFactors(a: Pick<ActivityIndex, 'factors' | 'windowDays'>): string {
  return a.factors
    .filter((x) => x.contribution > 0)
    .map((x) => {
      switch (x.name) {
        case 'recentEvents': return `events ${a.windowDays}d: ${x.value} (+${Math.round(x.contribution)})`;
        case 'breaking': return `breaking (+${Math.round(x.contribution)})`;
        case 'digestFreshness': return `digest ${x.value}d ago (+${Math.round(x.contribution)})`;
        case 'sectionsUpdated': return `sections: ${x.value} (+${Math.round(x.contribution)})`;
        case 'kpiDeltas': return `kpi deltas: ${x.value} (+${Math.round(x.contribution)})`;
        case 'sourceQuality': return `mean tier ${x.value} (+${Math.round(x.contribution)})`;
      }
    })
    .join(' · ');
}

/** Count KPI rows whose structured delta is non-zero. */
export function countKpiDeltas(kpis: { deltaDetail?: { value: number } | null }[] | undefined | null): number {
  if (!kpis) return 0;
  return kpis.filter((k) => k.deltaDetail && Number.isFinite(k.deltaDetail.value) && k.deltaDetail.value !== 0).length;
}
