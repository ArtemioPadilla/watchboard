#!/usr/bin/env tsx
/**
 * post-social-queue.ts
 *
 * Reads today's queue, posts due tweets (status approved/auto_approved + publishAt <= now),
 * updates budget and history.
 *
 * Usage: npx tsx scripts/post-social-queue.ts [--dry-run]
 */
import {
  loadConfig, loadBudget, saveBudget, loadHistory, saveHistory,
  loadQueue, saveQueue, todayDateString,
  type QueueEntry, type HistoryEntry,
} from './social-types.js';
import { TwitterApi } from 'twitter-api-v2';

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

  // Find due tweets
  const due = queue.filter(entry =>
    (entry.status === 'approved' || entry.status === 'auto_approved') &&
    new Date(entry.publishAt) <= now &&
    !entry.tweetId
  );

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
            if (!lastId) entry.tweetId = id;
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
        entry.tweetId = id;
        console.log(`[poster] Posted: ${entry.tracker}/${entry.type}/${entry.lang} → ${id}${mediaId ? ' (with image)' : ''}`);
      }

      entry.status = 'posted';
      entry.postedAt = new Date().toISOString();

      // Update budget (round to avoid IEEE 754 float drift)
      budget.spent = Math.round((budget.spent + entry.estimatedCost) * 100) / 100;
      budget.remaining = Math.round((budget.monthlyTarget - budget.spent) * 100) / 100;
      budget.tweetsPosted++;

      // Add to history
      history.push({
        tweetId: entry.tweetId ?? '',
        date: today,
        tracker: entry.tracker,
        type: entry.type,
        voice: entry.voice,
        lang: entry.lang,
        text: entry.text,
        cost: entry.estimatedCost,
        utmClicks: 0,
        publishedAt: entry.postedAt,
      });

      posted++;
      await sleep(2000);
    } catch (err) {
      console.error(`[poster] Failed: ${entry.tracker}/${entry.type}:`, err);
    }
  }

  // Save all state
  saveQueue(today, queue);
  saveBudget(budget);
  saveHistory(history);

  console.log(`[poster] Done. ${posted}/${due.length} posted. Budget: $${budget.spent.toFixed(2)}/$${budget.monthlyTarget.toFixed(2)}`);
}

main().catch(err => {
  console.error('[poster] Fatal error:', err);
  process.exit(1);
});
