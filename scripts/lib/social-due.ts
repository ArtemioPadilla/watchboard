/**
 * social-due.ts — which queue entries a given platform should post now.
 *
 * One queue (`public/_social/queue-YYYY-MM-DD.json`) feeds two posters:
 * `bluesky-post.ts` and `post-social-queue.ts` (X). Before this module both
 * decided "due" from `status` alone and both flipped it to `posted`, so
 * whichever ran first starved the other — and X was re-enabled after the
 * April 2026 suspension only under a manual-approval gate (#235) that the
 * status field cannot express once Bluesky has already posted the entry.
 *
 * The entry now carries per-platform state (`postedTo`) and remembers how it
 * was approved (`approval`), so:
 *   - each platform posts an entry at most once;
 *   - Bluesky may post anything approved or auto-approved;
 *   - X posts only what a human approved unless `allowAutoApproved` is set.
 * Entries with `status: 'posted'` and no `postedTo` predate this module and
 * are treated as fully posted — never re-sent anywhere.
 */
import type { QueueEntry } from '../social-types.js';

export type SocialPlatformId = 'bluesky' | 'x';

export interface PlatformPost {
  /** Platform-native id (Bluesky AT URI, X tweet id). */
  id: string;
  url?: string;
  /** ISO timestamp. */
  at: string;
}

export type Approval = 'manual' | 'auto';

/** Fields added to QueueEntry by this module; all optional for older queues. */
export interface PlatformTracking {
  postedTo?: Partial<Record<SocialPlatformId, PlatformPost>>;
  approval?: Approval;
}

export type TrackedEntry = QueueEntry & PlatformTracking;

export interface DueOptions {
  /** Post entries the judge auto-approved, not only ones a human approved. */
  allowAutoApproved: boolean;
  /** When set, only these `lang` codes are due (config.languages). */
  languages?: readonly string[];
}

/** How the entry was approved, whatever its current status. */
export function approvalOf(entry: TrackedEntry): Approval | null {
  if (entry.approval) return entry.approval;
  if (entry.status === 'approved') return 'manual';
  if (entry.status === 'auto_approved') return 'auto';
  return null;
}

export function isDueOn(entry: TrackedEntry, platform: SocialPlatformId, now: Date, opts: DueOptions): boolean {
  // Legacy: posted before per-platform tracking existed → posted everywhere.
  if (entry.status === 'posted' && !entry.postedTo) return false;
  if (entry.postedTo?.[platform]) return false;

  const approval = approvalOf(entry);
  if (!approval) return false; // pending_review, held, rejected, expired
  if (approval === 'auto' && !opts.allowAutoApproved) return false;

  // Only approved/auto_approved/posted(by another platform) reach here.
  if (entry.status !== 'approved' && entry.status !== 'auto_approved' && entry.status !== 'posted') return false;

  if (opts.languages && !opts.languages.includes(entry.lang)) return false;

  const publishAt = new Date(entry.publishAt);
  if (Number.isNaN(publishAt.getTime())) return false;
  return publishAt <= now;
}

/**
 * Record a successful post. Sets `postedTo[platform]`, remembers the approval
 * kind (so a later platform can still apply its own gate), and flips `status`
 * to `posted` for the dashboard. `tweetId` is kept for older readers: the
 * first platform to post fills it, later ones leave it alone.
 */
export function markPostedOn(entry: TrackedEntry, platform: SocialPlatformId, post: PlatformPost): void {
  const approval = approvalOf(entry);
  if (approval && !entry.approval) entry.approval = approval;
  entry.postedTo = { ...(entry.postedTo ?? {}), [platform]: post };
  entry.status = 'posted';
  entry.postedAt = post.at;
  if (!entry.tweetId) entry.tweetId = post.id;
}

export function selectDue(queue: readonly TrackedEntry[], platform: SocialPlatformId, now: Date, opts: DueOptions): TrackedEntry[] {
  return queue.filter((e) => isDueOn(e, platform, now, opts));
}
