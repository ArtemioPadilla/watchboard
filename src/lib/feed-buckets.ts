/**
 * Sidebar feed order (spec 2026-09-23 §1). One implementation for what the
 * list renders (FeedList) and what arrow keys walk (flatSlugs), so the two
 * can never diverge again.
 *
 * OPS + Relevance: followed → up to INTEREST_BAND_MAX interest matches (the
 * first ones in the incoming relevance order) → recent (≤ 48 h) → older.
 * Relevance is not freshness (breaking 40, activity 0-30, recency 0-15), so a
 * stale but active match can take a band slot ahead of a fresh quiet one;
 * that is how an old match crosses the recency buckets. The fresh one stays
 * in `recent`, right below the band.
 * With no interests (or bandMax 0, used while searching) the output is
 * exactly the pre-v2 algorithm.
 */
import { hasInterests, matchesInterests, type Interests } from './interests';

export const OLDER_THRESHOLD_MS = 48 * 3600 * 1000;
/** Rows the interest band may hold; overflow matches stay in their recency bucket. */
export const INTEREST_BAND_MAX = 6;

export interface BucketableTracker { slug: string; lastUpdated: string; domain?: string; region?: string }
export interface FeedBuckets<T> { followed: T[]; interests: T[]; recent: T[]; older: T[] }
export interface BucketOptions { followedSlugs: readonly string[]; interests: Interests; now: number; bandMax?: number }
export type FeedSegment<T> =
  | { kind: 'rows'; bucket: 'followed' | 'recent' | 'older'; rows: T[] }
  | { kind: 'band'; rows: T[] }
  | { kind: 'divider' };
export type FeedLayout = 'ops' | 'flat' | 'domain';

/** An unparseable date gives NaN, which is never older: same as before v2. */
export function isOlder(lastUpdated: string, now: number): boolean {
  return now - new Date(lastUpdated).getTime() > OLDER_THRESHOLD_MS;
}

export function bucketFeed<T extends BucketableTracker>(trackers: readonly T[], opts: BucketOptions): FeedBuckets<T> {
  const followed = new Set(opts.followedSlugs);
  const bandMax = opts.bandMax ?? INTEREST_BAND_MAX;
  const withInterests = hasInterests(opts.interests);
  const out: FeedBuckets<T> = { followed: [], interests: [], recent: [], older: [] };
  for (const t of trackers) {
    if (followed.has(t.slug)) { out.followed.push(t); continue; }
    if (withInterests && out.interests.length < bandMax && matchesInterests(t, opts.interests)) {
      out.interests.push(t);
      continue;
    }
    if (isOlder(t.lastUpdated, opts.now)) out.older.push(t); else out.recent.push(t);
  }
  return out;
}

export function feedSegments<T>(b: FeedBuckets<T>): FeedSegment<T>[] {
  const s: FeedSegment<T>[] = [];
  if (b.followed.length > 0) {
    s.push({ kind: 'rows', bucket: 'followed', rows: b.followed });
    if (b.interests.length > 0 || b.recent.length > 0 || b.older.length > 0) s.push({ kind: 'divider' });
  }
  if (b.interests.length > 0) {
    s.push({ kind: 'band', rows: b.interests });
    if (b.recent.length > 0) s.push({ kind: 'divider' });
  }
  if (b.recent.length > 0) s.push({ kind: 'rows', bucket: 'recent', rows: b.recent });
  if (b.older.length > 0) {
    s.push({ kind: 'divider' });
    s.push({ kind: 'rows', bucket: 'older', rows: b.older });
  }
  return s;
}

/** Mirrors FeedList's branch order: DOMAIN grouping first, then flat Activity, else OPS. */
export function feedLayout(
  viewMode: 'operations' | 'geographic' | 'domain',
  sortMode: 'relevance' | 'activity',
): FeedLayout {
  if (viewMode === 'domain') return 'domain';
  return sortMode === 'activity' ? 'flat' : 'ops';
}

export function feedOrder<T extends BucketableTracker>(
  trackers: readonly T[],
  opts: BucketOptions & { layout: FeedLayout },
): T[] {
  if (opts.layout === 'flat') return [...trackers];
  if (opts.layout === 'domain') {
    const groups = new Map<string, T[]>();
    for (const t of trackers) {
      const key = t.domain ?? 'other';
      const arr = groups.get(key) ?? [];
      arr.push(t);
      groups.set(key, arr);
    }
    return [...groups.values()].flat();
  }
  const b = bucketFeed(trackers, opts);
  return [...b.followed, ...b.interests, ...b.recent, ...b.older];
}
