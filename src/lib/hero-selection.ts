import type { TrackerCardData } from './tracker-directory-utils';
import { sortByRelevance } from './relevance';

/**
 * Pick the hero tracker for the sidebar: the highest-relevance active tracker
 * that has a headline and at least one usable image. Returns null if none qualify.
 *
 * Stable for a given (trackers, followedSlugs) pair.
 */
export function selectHeroTracker(
  trackers: TrackerCardData[],
  followedSlugs: string[],
): TrackerCardData | null {
  const eligible = trackers.filter(t =>
    t.status === 'active' &&
    typeof t.headline === 'string' &&
    t.headline.length > 0 &&
    (t.latestEventMedia != null || (t.eventImages?.length ?? 0) > 0)
  );
  if (eligible.length === 0) return null;
  const sorted = sortByRelevance(eligible, followedSlugs);
  return sorted[0] ?? null;
}
