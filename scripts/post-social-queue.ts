#!/usr/bin/env tsx
/**
 * post-social-queue.ts
 *
 * Reads today's queue, posts due tweets to X, updates budget and history.
 *
 * Staged restart after the April 2026 suspension (#235): by default only
 * entries a human approved in /social/ are posted. Auto-approved entries are
 * included only when X_ALLOW_AUTO_APPROVED=true. Languages follow
 * social-config.json (`languages`). Per-platform state lives in
 * scripts/lib/social-due.ts, so an entry Bluesky already posted is still due
 * here and neither poster re-sends the other's.
 *
 * Usage: npx tsx scripts/post-social-queue.ts [--dry-run]
 */
import {
  loadConfig, loadBudget, saveBudget, loadHistory, saveHistory,
  loadQueue, saveQueue, todayDateString,
  type QueueEntry, type HistoryEntry,
} from './social-types.js';
import { TwitterApi } from 'twitter-api-v2';
import { isDueOn, markPostedOn, type TrackedEntry } from './lib/social-due.js';

function getTwitterClient(): TwitterApi | null {
  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    console.log('[poster] Missing X API credentials — skipping');
    return null;
  }
  return new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
}

async function uploadImageFromUrl(client: TwitterApi, imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) {
      console.warn(`[poster] Image fetch failed (${res.status}): ${imageUrl}`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? 'image/png';
    const mediaId = await client.v1.uploadMedia(buffer, { mimeType: contentType });
    console.log(`[poster] Image uploaded: ${mediaId}`);
    return mediaId;
  } catch (err) {
    console.warn(`[poster] Image upload failed:`, err);
    return null;
  }
}

async function postTweet(
  client: TwitterApi,
  text: string,
  options?: { replyToId?: string; mediaId?: string },
): Promise<string | null> {
  const payload: Record<string, unknown> = { text };
  if (options?.replyToId) {
    payload.reply = { in_reply_to_tweet_id: options.replyToId };
  }
  if (options?.mediaId) {
    payload.media = { media_ids: [options.mediaId] };
  }
  const result = await client.v2.tweet(payload);
  return result.data.id;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Permanent X API errors that will fail identically on every retry —
 * duplicate content (HTTP 403 / legacy code 187) and suspended/locked
 * accounts. Retrying these just burns budget slots; mark the entry rejected.
 */
function isPermanentXError(err: unknown): boolean {
  const e = err as {
    code?: number;
    data?: { detail?: string; title?: string; errors?: Array<{ code?: number; message?: string }> };
    errors?: Array<{ code?: number; message?: string }>;
  };
  const legacyCodes = [
    ...(e?.errors ?? []),
    ...(e?.data?.errors ?? []),
  ].map(x => x?.code);
  if (legacyCodes.includes(187)) return true; // duplicate status

  const detail = `${e?.data?.detail ?? ''} ${e?.data?.title ?? ''} ${
    [...(e?.errors ?? []), ...(e?.data?.errors ?? [])].map(x => x?.message ?? '').join(' ')
  }`.toLowerCase();
  if (detail.includes('duplicate')) return true;
  if (detail.includes('suspended')) return true;
  if (e?.code === 403 && (detail.includes('not allowed') || detail.includes('forbidden'))) return true;
  return false;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const today = todayDateString();
  const now = new Date();
  const config = loadConfig();
  const budget = loadBudget();
  const history = loadHistory();
  const queue = loadQueue(today);

  if (queue.length === 0) {
    console.log(`[poster] No queue for ${today}`);
    return;
  }

  // Budget gate — stop posting if monthly budget is exhausted
  if (budget.remaining <= 0) {
    console.log(`[poster] Monthly budget exhausted ($${budget.spent.toFixed(2)}/$${budget.monthlyTarget.toFixed(2)}) — skipping all posts`);
    return;
  }

  // Normalize legacy field names (trackerSlug → tracker)
  for (const entry of queue) {
    const raw = entry as unknown as Record<string, unknown>;
    if (!raw.tracker && raw.trackerSlug) {
      raw.tracker = raw.trackerSlug;
      delete raw.trackerSlug;
    }
    // Remove non-Twitter entries that slipped past post-processing
    if (raw.platform && raw.platform !== 'twitter' && raw.platform !== 'x') {
      raw.status = 'expired';
    }
    delete raw.platform;
    delete raw.trackerName;
  }

  // Find due tweets. Manual approval only unless X_ALLOW_AUTO_APPROVED=true.
  const allowAutoApproved = process.env.X_ALLOW_AUTO_APPROVED === 'true';
  const due = (queue as TrackedEntry[]).filter(entry =>
    isDueOn(entry, 'x', now, { allowAutoApproved, languages: config.languages }),
  );

  console.log(`[poster] gate: ${allowAutoApproved ? 'approved + auto_approved' : 'manually approved only'}; languages: ${config.languages.join(', ')}`);
  console.log(`[poster] ${due.length} tweets due for posting (${queue.length} total in queue)`);

  if (due.length === 0) return;

  if (dryRun) {
    console.log('\n[DRY RUN] Would post:');
    for (const entry of due) {
      console.log(`  [${entry.type}/${entry.lang}] ${entry.tracker}: ${entry.text.slice(0, 80)}...`);
    }
    return;
  }

  const client = getTwitterClient();
  if (!client) return;

  let posted = 0;

  for (const entry of due) {
    try {
      let xId: string | undefined;
      // Normalize hashtags — ensure # prefix
      const tags = entry.hashtags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ');

      // Upload image if present (image URL or memegen URL)
      const imageUrl = entry.image || entry.memegenUrl;
      let mediaId: string | null = null;
      if (imageUrl) {
        mediaId = await uploadImageFromUrl(client, imageUrl);
      }

      if (entry.threadTweets && entry.threadTweets.length > 0) {
        // Post thread — append link to last tweet, attach image to first tweet
        let lastId: string | undefined;
        let threadPosted = 0;
        for (let i = 0; i < entry.threadTweets.length; i++) {
          const isLast = i === entry.threadTweets.length - 1;
          const tweetText = isLast
            ? `${entry.threadTweets[i]}\n\n${entry.link}`
            : entry.threadTweets[i];
          const id = await postTweet(client, tweetText, {
            replyToId: lastId,
            mediaId: i === 0 ? (mediaId ?? undefined) : undefined,
          });
          if (id) {
            if (!lastId) xId = id;
            lastId = id;
            threadPosted++;
          }
          await sleep(2000);
        }
        if (threadPosted < entry.threadTweets.length) {
          console.warn(`[poster] Thread partial: ${entry.tracker}/${entry.type} (${threadPosted}/${entry.threadTweets.length} tweets)`);
        } else {
          console.log(`[poster] Thread posted: ${entry.tracker}/${entry.type} (${entry.threadTweets.length} tweets)`);
        }
      } else {
        // Post single tweet
        const fullText = `${entry.text}\n\n${entry.link}\n\n${tags}`;
        const id = await postTweet(client, fullText, { mediaId: mediaId ?? undefined });
        xId = id ?? undefined;
        console.log(`[poster] Posted: ${entry.tracker}/${entry.type}/${entry.lang} → ${id}${mediaId ? ' (with image)' : ''}`);
      }

      if (!xId) throw new Error('X returned no tweet id');
      markPostedOn(entry as TrackedEntry, 'x', {
        id: xId,
        url: `https://x.com/${config.handle.replace(/^@/, '')}/status/${xId}`,
        at: new Date().toISOString(),
      });

      // Update budget (round to avoid IEEE 754 float drift)
      budget.spent = Math.round((budget.spent + entry.estimatedCost) * 100) / 100;
      budget.remaining = Math.round((budget.monthlyTarget - budget.spent) * 100) / 100;
      budget.tweetsPosted++;

      // Add to history
      history.push({
        tweetId: xId,
        date: today,
        tracker: entry.tracker,
        type: entry.type,
        voice: entry.voice,
        lang: entry.lang,
        text: entry.text,
        cost: entry.estimatedCost,
        utmClicks: 0,
        publishedAt: entry.postedAt ?? new Date().toISOString(),
      });

      posted++;

      // Persist after EVERY successful post — a crash mid-loop must not
      // re-post tweets that already went out (queue carries tweetId/status).
      saveQueue(today, queue);
      saveBudget(budget);
      saveHistory(history);

      await sleep(2000);
    } catch (err) {
      console.error(`[poster] Failed: ${entry.tracker}/${entry.type}:`, err);
      if (isPermanentXError(err)) {
        // Permanent error (duplicate content, suspended account) — retrying
        // is pointless; reject so the next run skips this entry.
        entry.status = 'rejected';
        if (entry.judge) {
          entry.judge.comment += ' [AUTO-REJECTED: permanent X API error (duplicate/suspended)]';
        }
        console.warn(`[poster] Permanent X API error — marking ${entry.tracker}/${entry.type} as rejected`);
        saveQueue(today, queue);
      }
      // Transient errors (rate limits, network) keep status approved → retried next run.
    }
  }

  // Final save (covers entries normalized at load time even if nothing posted)
  saveQueue(today, queue);
  saveBudget(budget);
  saveHistory(history);

  console.log(`[poster] Done. ${posted}/${due.length} posted. Budget: $${budget.spent.toFixed(2)}/$${budget.monthlyTarget.toFixed(2)}`);
}

main().catch(err => {
  console.error('[poster] Fatal error:', err);
  process.exit(1);
});
