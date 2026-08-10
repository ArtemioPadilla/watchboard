#!/usr/bin/env tsx
/**
 * Data freshness check — the pipeline's last line of defence.
 *
 * Every other alarm watches a specific failure: a job that errored, a
 * credential that stopped authenticating, a workflow that would not parse.
 * Each one only fires for a failure mode somebody thought of in advance.
 *
 * This one watches the outcome instead. If tracker data stops moving forward
 * it reports, regardless of the cause — including causes we have not seen yet.
 * Every outage found in this repo would have tripped it:
 *
 *   - the revoked OAuth token (agents never ran)
 *   - the finalize timeout (data was produced but never committed)
 *   - the hourly GDELT stall (triage starved, state never committed)
 *
 * None of those raised an alert at the time. All of them stopped the data.
 *
 * Exit codes: 0 healthy, 1 stale (alert), 2 usage/read error.
 */

import { readFileSync, readdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * If not one single active tracker has been updated in this many days, the
 * pipeline is considered down. The nightly runs daily and the hourly scan
 * every six hours, so a healthy system refreshes something continuously; three
 * days is slack for a quiet news cycle plus a skipped run.
 */
const GLOBAL_STALE_DAYS = Number(process.env.FRESHNESS_GLOBAL_STALE_DAYS ?? 3);

/**
 * How many times its own configured cadence a tracker may exceed before it
 * counts as stale.
 *
 * The first version of this compared every tracker against a flat 30 days,
 * which measured almost nothing: configured cadences here run from 7 to 365
 * days, and 67 of 96 trackers are on 90 days or more, so most of the fleet sat
 * "past 30 days" permanently and by design. Judging each tracker against its
 * own cadence is what separates a genuinely stalled tracker from one that is
 * simply slow on purpose — uap-disclosure at 66 days on a 7-day cadence (9.4x)
 * is a real problem; a 180-day arc at 88 days is not.
 */
const STALE_CADENCE_FACTOR = Number(process.env.FRESHNESS_CADENCE_FACTOR ?? 2);

/**
 * Share of active trackers allowed to be stale before we report. This is about
 * the fleet, not any single tracker — individual ones legitimately go quiet.
 */
const STALE_TRACKER_RATIO = Number(process.env.FRESHNESS_STALE_RATIO ?? 0.35);

export interface TrackerFreshness {
  slug: string;
  lastRun: string | null;
  daysSince: number | null;
  /** Longest configured update interval, in days. */
  cadenceDays: number;
  /** daysSince / cadenceDays — how far past its own schedule it has drifted. */
  overdueRatio: number | null;
}

export interface FreshnessReport {
  healthy: boolean;
  reasons: string[];
  activeCount: number;
  staleCount: number;
  freshest: TrackerFreshness | null;
  stalest: TrackerFreshness | null;
  trackers: TrackerFreshness[];
}

export function collectFreshness(now: Date, root: string = ROOT): TrackerFreshness[] {
  const trackersDir = join(root, 'trackers');
  const out: TrackerFreshness[] = [];

  for (const slug of readdirSync(trackersDir)) {
    const configPath = join(trackersDir, slug, 'tracker.json');
    if (!existsSync(configPath)) continue;

    let config: {
      status?: string;
      ai?: { updatePolicy?: { escalation?: number[] }; updateIntervalDays?: number };
    };
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch {
      continue;
    }
    if (config.status !== 'active') continue;

    // The slowest step of the escalation ladder is the real deadline: a quiet
    // tracker is allowed to drift out to it before anything is wrong.
    const escalation = config.ai?.updatePolicy?.escalation;
    const cadenceDays =
      escalation && escalation.length
        ? Math.max(...escalation)
        : (config.ai?.updateIntervalDays ?? 1);

    let lastRun: string | null = null;
    try {
      const log = JSON.parse(
        readFileSync(join(trackersDir, slug, 'data', 'update-log.json'), 'utf8'),
      );
      lastRun = typeof log.lastRun === 'string' && log.lastRun ? log.lastRun : null;
    } catch {
      lastRun = null;
    }

    let daysSince: number | null = null;
    if (lastRun) {
      const parsed = new Date(lastRun);
      if (!Number.isNaN(parsed.getTime())) {
        daysSince = Math.floor((now.getTime() - parsed.getTime()) / 86_400_000);
      }
    }

    out.push({
      slug,
      lastRun,
      daysSince,
      cadenceDays,
      overdueRatio: daysSince === null ? null : daysSince / Math.max(cadenceDays, 1),
    });
  }

  return out;
}

export function evaluate(trackers: TrackerFreshness[]): FreshnessReport {
  const reasons: string[] = [];

  // Unknown lastRun counts as stale — a tracker we cannot date is not evidence
  // of health.
  const withDays = trackers.filter((t) => t.daysSince !== null) as Array<
    TrackerFreshness & { daysSince: number }
  >;

  const sorted = [...withDays].sort((a, b) => a.daysSince - b.daysSince);
  const freshest = sorted[0] ?? null;
  const stalest = sorted[sorted.length - 1] ?? null;

  // Stale relative to its own cadence, not a flat day count. An unknown
  // lastRun counts as stale — a tracker we cannot date is not evidence of
  // health.
  const staleTrackers = trackers.filter(
    (t) => t.overdueRatio === null || t.overdueRatio > STALE_CADENCE_FACTOR,
  );
  const staleCount = staleTrackers.length;

  if (trackers.length === 0) {
    reasons.push('No active trackers found — cannot assess freshness');
  } else {
    // Primary signal: is anything moving at all?
    if (!freshest) {
      reasons.push('No active tracker has a usable lastRun timestamp');
    } else if (freshest.daysSince > GLOBAL_STALE_DAYS) {
      reasons.push(
        `Nothing updated in ${freshest.daysSince}d — the freshest active tracker is ` +
          `${freshest.slug} (limit ${GLOBAL_STALE_DAYS}d). The pipeline is not writing data.`,
      );
    }

    // Secondary signal: a slow bleed where most of the fleet drifts past its
    // horizon while a couple of trackers keep the primary check satisfied.
    const ratio = staleCount / trackers.length;
    if (ratio >= STALE_TRACKER_RATIO) {
      reasons.push(
        `${staleCount}/${trackers.length} active trackers (${Math.round(ratio * 100)}%) ` +
          `are more than ${STALE_CADENCE_FACTOR}x past their own configured cadence.`,
      );
    }
  }

  return {
    healthy: reasons.length === 0,
    reasons,
    activeCount: trackers.length,
    staleCount,
    freshest,
    stalest,
    trackers,
  };
}

function main(): void {
  let trackers: TrackerFreshness[];
  try {
    trackers = collectFreshness(new Date());
  } catch (err) {
    console.error('[freshness] Could not read trackers:', (err as Error).message);
    process.exit(2);
  }

  const report = evaluate(trackers);

  console.log(`[freshness] Active trackers: ${report.activeCount}`);
  if (report.freshest) {
    console.log(
      `[freshness] Freshest: ${report.freshest.slug} (${report.freshest.daysSince}d ago)`,
    );
  }
  if (report.stalest) {
    console.log(
      `[freshness] Stalest: ${report.stalest.slug} (${report.stalest.daysSince}d ago)`,
    );
  }
  console.log(
    `[freshness] Past ${STALE_CADENCE_FACTOR}x own cadence: ${report.staleCount}/${report.activeCount}`,
  );

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `healthy=${report.healthy}\n` +
        `summary=${report.reasons.join(' | ') || 'All good'}\n` +
        `freshest_days=${report.freshest?.daysSince ?? -1}\n` +
        `stale_count=${report.staleCount}\n` +
        `active_count=${report.activeCount}\n`,
    );
  }

  if (report.healthy) {
    console.log('[freshness] OK — data is moving');
    process.exit(0);
  }

  for (const r of report.reasons) console.error(`[freshness] STALE: ${r}`);
  process.exit(1);
}

// Only run when executed directly, so the exported helpers stay importable.
if (process.argv[1] && process.argv[1].includes('check-data-freshness')) {
  main();
}
