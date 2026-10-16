/**
 * social-schedule.ts — keep the daily queue's publish times in the future.
 *
 * The model writes publishAt against fixed slots (08:00, 13:00, 18:00,
 * 22:00 UTC), assuming the nightly runs at 14:00. GitHub starts it four to
 * six hours late, so by the time the queue is written the early slots have
 * passed: on 2026-09-28 the queue landed at 21:06 and every entry became due
 * at once, posting back to back at 22:51.
 *
 * reslotQueue() leaves future times alone and spreads the entries whose time
 * has passed from `now` onwards, in their original order, `gapMs` apart and
 * never beyond `horizonMs`, so the next poster runs pick them up one or two
 * at a time instead of in one burst.
 *
 * Both posters read only queue-<today>.json, so an entry whose new time falls
 * after midnight would never be seen. splitByDay() moves those entries into
 * the next day's file (scripts/reslot-social-queue.ts does the I/O).
 */

export interface SchedulableEntry {
  publishAt?: string | null;
  status?: string;
  postedAt?: string | null;
  postedTo?: Record<string, unknown> | null;
}

export interface ReslotOptions {
  /** Spacing between rescheduled entries (default 3 h). */
  gapMs?: number;
  /** Latest a rescheduled entry may land, measured from `now` (default 18 h). */
  horizonMs?: number;
}

export const DEFAULT_GAP_MS = 3 * 60 * 60 * 1000;
export const DEFAULT_HORIZON_MS = 18 * 60 * 60 * 1000;

/** Statuses that can still be posted (or approved, then posted). */
const OPEN_STATUSES = new Set(['approved', 'auto_approved', 'pending_review']);

function isPosted(e: SchedulableEntry): boolean {
  return Boolean(e.postedAt) || Boolean(e.postedTo && Object.keys(e.postedTo).length > 0);
}

function timeOf(e: SchedulableEntry): number {
  const t = e.publishAt ? new Date(e.publishAt).getTime() : NaN;
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * Mutates the entries in place; returns how many were moved. Posted entries
 * and closed statuses (held, rejected, expired, posted) are never touched, so
 * the archive keeps its real times.
 */
export function reslotQueue<T extends SchedulableEntry>(entries: T[], now: Date, opts: ReslotOptions = {}): number {
  const gap = opts.gapMs ?? DEFAULT_GAP_MS;
  const horizon = opts.horizonMs ?? DEFAULT_HORIZON_MS;
  const nowMs = Math.ceil(now.getTime() / 60_000) * 60_000; // next whole minute

  const stale = entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !isPosted(e) && OPEN_STATUSES.has(e.status ?? '') && timeOf(e) < nowMs)
    .sort((a, b) => timeOf(a.e) - timeOf(b.e) || a.i - b.i);

  if (stale.length === 0) return 0;
  const step = stale.length > 1 ? Math.min(gap, horizon / (stale.length - 1)) : 0;
  stale.forEach(({ e }, k) => {
    e.publishAt = new Date(nowMs + Math.round(k * step)).toISOString().replace(/\.\d{3}Z$/, 'Z');
  });
  return stale.length;
}

/** UTC calendar date (YYYY-MM-DD) of an entry's publishAt, or null. */
function dayOf(e: SchedulableEntry): string | null {
  const t = timeOf(e);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

/**
 * Split a queue file's entries into those that stay in `fileDate`'s file and
 * open, unposted entries scheduled on a later day, which belong in that day's
 * file so its poster runs can find them.
 */
export function splitByDay<T extends SchedulableEntry>(entries: T[], fileDate: string): { keep: T[]; later: Map<string, T[]> } {
  const keep: T[] = [];
  const later = new Map<string, T[]>();
  for (const e of entries) {
    const day = dayOf(e);
    if (day && day > fileDate && !isPosted(e) && OPEN_STATUSES.has(e.status ?? '')) {
      later.set(day, [...(later.get(day) ?? []), e]);
    } else {
      keep.push(e);
    }
  }
  return { keep, later };
}

/** Merge entries into an existing queue by id; entries already there win. */
export function mergeById<T extends { id?: string }>(existing: T[], incoming: T[]): T[] {
  const ids = new Set(existing.map((e) => e.id).filter(Boolean));
  return [...existing, ...incoming.filter((e) => !e.id || !ids.has(e.id))];
}
