/**
 * Relevance scoring for tracker broadcast ordering.
 * Replaces simple lastUpdated sort with a layered priority system:
 * 1. Breaking / high-severity (+40)
 * 2. Followed trackers (+15)
 * 3. Editorial score: event count, source tier, sections updated (0-30)
 * 4. Recency as tiebreaker (0-15)
 */

export interface RelevanceInput {
  lastUpdated: string;
  isBreaking?: boolean;
  isFollowed: boolean;
  recentEventCount?: number;
  avgSourceTier?: number;
  sectionsUpdatedCount?: number;
}

export function computeRelevanceScore(input: RelevanceInput): number {
  let score = 0;

  // Breaking: +40
  if (input.isBreaking) score += 40;

  // Followed: +15
  if (input.isFollowed) score += 15;

  // Editorial score: 0-30
  const eventScore = Math.min((input.recentEventCount ?? 0) / 10, 1) * 12;
  const tierScore = input.avgSourceTier != null && input.avgSourceTier > 0
    ? (1 - (input.avgSourceTier - 1) / 3) * 10
    : 0;
  const sectionsScore = Math.min((input.sectionsUpdatedCount ?? 0) / 5, 1) * 8;
  score += eventScore + tierScore + sectionsScore;

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
    });
    const scoreB = computeRelevanceScore({
      lastUpdated: b.lastUpdated,
      isBreaking: b.isBreaking,
      isFollowed: followedSet.has(b.slug),
      recentEventCount: b.recentEventCount,
      avgSourceTier: b.avgSourceTier,
      sectionsUpdatedCount: b.sectionsUpdatedCount,
    });
    return scoreB - scoreA;
  });
}
