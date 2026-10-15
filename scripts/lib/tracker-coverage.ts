/**
 * tracker-coverage.ts — what each tracker is actually covering lately.
 *
 * The scout deduplicates by slug and, since #320, by event. Neither catches
 * a proposal for a subject an existing tracker is already following under a
 * different name. Three got through in one batch:
 *
 *   brazil-election-2026       → `brazil` had 49 of its 64 2026 events on
 *                                the election, polls and runoff
 *   ethiopia-eritrea-rupture   → `ethiopia-conflict` carried the embassy
 *                                closures
 *   cuba-energy-blockade-2026  → `cuba-crises` had 28 of 38 2026 events
 *
 * The cause is what the scout is shown: slug, name, domain and a static
 * `ai.searchContext` from the config. None of that says what the tracker has
 * been writing about this year, so the model cannot tell the Brazilian
 * election is already covered.
 *
 * This builds the missing signal — recent event titles per tracker — so the
 * prompt can be asked to check against it.
 *
 * One caution encoded here: only CURRENT-YEAR events count. Many trackers
 * are country histories spanning decades, and a naive keyword match finds
 * "election" in a 1998 entry or "tanker" in the 1962 missile crisis. That
 * mistake nearly closed three issues on false evidence before being caught.
 */

export interface TrackerCoverage {
  slug: string;
  /** Events dated in the reference year. */
  recentCount: number;
  /** A sample of recent titles, newest first. */
  recentTitles: string[];
}

export interface RawEvent {
  title?: string;
  year?: string;
  date?: string;
}

const TITLE_MAX = 90;

/** True when the event belongs to the reference year. */
export function isFromYear(e: RawEvent, year: number): boolean {
  const stamp = `${e.date ?? ''} ${e.year ?? ''}`;
  return stamp.includes(String(year));
}

/**
 * Condenses one tracker's events into the signal the scout needs.
 *
 * Titles are truncated and capped: the whole table goes into a prompt, and
 * 130 trackers of unbounded titles would crowd out the task itself.
 */
export function summarise(
  slug: string,
  events: RawEvent[],
  year: number,
  sampleSize = 6,
): TrackerCoverage {
  const recent = events.filter((e) => isFromYear(e, year) && e.title);
  return {
    slug,
    recentCount: recent.length,
    recentTitles: recent
      .slice(-sampleSize)
      .reverse()
      .map((e) => {
        const t = String(e.title).replace(/\s+/g, ' ').trim();
        return t.length > TITLE_MAX ? t.slice(0, TITLE_MAX - 1) + '…' : t;
      }),
  };
}

/** Drops trackers with nothing recent — they add bulk and no signal. */
export function activeOnly(all: TrackerCoverage[]): TrackerCoverage[] {
  return all.filter((c) => c.recentCount > 0);
}

/** Renders the table the scout prompt reads. */
export function renderCoverage(all: TrackerCoverage[]): string {
  const active = activeOnly(all).sort((a, b) => b.recentCount - a.recentCount);
  if (!active.length) return '(no tracker has events dated this year)';
  return active
    .map((c) => `${c.slug} (${c.recentCount} events this year)\n` +
      c.recentTitles.map((t) => `  - ${t}`).join('\n'))
    .join('\n');
}
