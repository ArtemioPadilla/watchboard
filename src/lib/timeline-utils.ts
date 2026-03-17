import type { TimelineEra, TimelineEvent } from './schemas';

export interface FlatEvent extends TimelineEvent {
  resolvedDate: string; // "YYYY-MM-DD"
}

/**
 * Flatten timeline eras into a flat event array with resolved dates.
 * Includes all eras whose events have resolvable day-level dates.
 */
export function flattenTimelineEvents(
  timeline: TimelineEra[],
  eventModulePaths?: string[],
): FlatEvent[] {
  const events: FlatEvent[] = [];

  for (const era of timeline) {
    for (const ev of era.events) {
      const resolvedDate = resolveEventDate(ev.year);
      if (resolvedDate) {
        events.push({ ...ev, resolvedDate });
      }
    }
  }

  return events;
}

/**
 * Resolve a human-readable date string to "YYYY-MM-DD".
 * Supports: "Mar 1" (assumes current year), "Sep 26, 2014", "2026-03-01".
 */
export function resolveEventDate(yearField: string): string | null {
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  // Try "Mon DD, YYYY" format (e.g., "Sep 26, 2014", "Mar 1, 2026")
  const monthDayYear = yearField.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (monthDayYear) {
    const m = months[monthDayYear[1].toLowerCase()];
    const d = monthDayYear[2].padStart(2, '0');
    if (m) return `${monthDayYear[3]}-${m}-${d}`;
  }

  // Try "Mon DD" format without year (e.g., "Mar 1", "Feb 28") — assume current year
  const monthDay = yearField.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})$/i);
  if (monthDay) {
    const m = months[monthDay[1].toLowerCase()];
    const d = monthDay[2].padStart(2, '0');
    const year = new Date().getFullYear();
    if (m) return `${year}-${m}-${d}`;
  }

  // Try "YYYY-MM-DD" format
  if (/^\d{4}-\d{2}-\d{2}$/.test(yearField)) {
    return yearField;
  }

  // Just a year (e.g., "2026") or month/year — not day-level
  return null;
}
