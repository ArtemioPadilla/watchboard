/**
 * Relevance scoring for tracker broadcast ordering.
 * Replaces simple lastUpdated sort with a layered priority system:
 * 1. Breaking / high-severity (+40)
 * 2. Followed trackers (+15)
 * 3. Editorial score (0-30): the activity index (src/lib/activity-index.ts,
 *    0-100) scaled by ACTIVITY_WEIGHT when present; otherwise the legacy
 *    event count / source tier / sections-updated heuristic
 * 4. Recency as tiebreaker (0-15)
 */

/** Share of the 0-30 editorial block taken from the activity index. */
export const ACTIVITY_WEIGHT = 0.3;

export interface RelevanceInput {
  lastUpdated: string;
  isBreaking?: boolean;
  isFollowed: boolean;
  recentEventCount?: number;
  avgSourceTier?: number;
  sectionsUpdatedCount?: number;
  /** 0-100 from computeActivity(); replaces the legacy editorial heuristic. */
  activityScore?: number;
}

export function computeRelevanceScore(input: RelevanceInput): number {
  let score = 0;

  // Breaking: +40
  if (input.isBreaking) score += 40;

  // Followed: +15
  if (input.isFollowed) score += 15;

  // Editorial score: 0-30
  if (typeof input.activityScore === 'number' && Number.isFinite(input.activityScore)) {
    score += Math.max(0, Math.min(100, input.activityScore)) * ACTIVITY_WEIGHT;
  } else {
    const eventScore = Math.min((input.recentEventCount ?? 0) / 10, 1) * 12;
    const tierScore = input.avgSourceTier != null && input.avgSourceTier > 0
      ? (1 - (input.avgSourceTier - 1) / 3) * 10
      : 0;
    const sectionsScore = Math.min((input.sectionsUpdatedCount ?? 0) / 5, 1) * 8;
    score += eventScore + tierScore + sectionsScore;
  }

  // Recency: 0-15 (exponential decay over 7 days)
  const ageMs = Date.now() - new Date(input.lastUpdated).getTime();
  const ageDays = ageMs / (24 * 3600_000);
  const recencyScore = Math.max(0, 15 * Math.exp(-ageDays / 3));
  score += recencyScore;

  return score;
}

interface SortableTracker {
  slug: string;
  lastUpdated: string;
  isBreaking?: boolean;
  recentEventCount?: number;
  avgSourceTier?: number;
  sectionsUpdatedCount?: number;
  activity?: { score: number };
}

/** Pure activity order (highest first), ties by recency. */
export function sortByActivity<T extends SortableTracker>(trackers: T[]): T[] {
  return [...trackers].sort((a, b) =>
    (b.activity?.score ?? 0) - (a.activity?.score ?? 0) ||
    new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
  );
}

export function sortByRelevance<T extends SortableTracker>(
  trackers: T[],
  followedSlugs: string[],
): T[] {
  const followedSet = new Set(followedSlugs);
  return [...trackers].sort((a, b) => {
    const scoreA = computeRelevanceScore({
      lastUpdated: a.lastUpdated,
      isBreaking: a.isBreaking,
      isFollowed: followedSet.has(a.slug),
      recentEventCount: a.recentEventCount,
      avgSourceTier: a.avgSourceTier,
      sectionsUpdatedCount: a.sectionsUpdatedCount,
      activityScore: a.activity?.score,
    });
    const scoreB = computeRelevanceScore({
      lastUpdated: b.lastUpdated,
      isBreaking: b.isBreaking,
      isFollowed: followedSet.has(b.slug),
      recentEventCount: b.recentEventCount,
      avgSourceTier: b.avgSourceTier,
      sectionsUpdatedCount: b.sectionsUpdatedCount,
      activityScore: b.activity?.score,
    });
    return scoreB - scoreA;
  });
}
