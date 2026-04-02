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

async function postTweet(
  client: TwitterApi,
  text: string,
  replyToId?: string,
): Promise<string | null> {
  const payload: { text: string; reply?: { in_reply_to_tweet_id: string } } = { text };
  if (replyToId) {
    payload.reply = { in_reply_to_tweet_id: replyToId };
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
      if (entry.threadTweets && entry.threadTweets.length > 0) {
        // Post thread
        let lastId: string | undefined;
        for (const tweetText of entry.threadTweets) {
          const id = await postTweet(client, tweetText, lastId);
          if (id) {
            if (!lastId) entry.tweetId = id; // store first tweet ID
            lastId = id;
          }
          await sleep(2000);
        }
        console.log(`[poster] Thread posted: ${entry.tracker}/${entry.type} (${entry.threadTweets.length} tweets)`);
      } else {
        // Post single tweet
        const fullText = `${entry.text}\n\n${entry.link}\n\n${entry.hashtags.join(' ')}`;
        const id = await postTweet(client, fullText);
        entry.tweetId = id;
        console.log(`[poster] Posted: ${entry.tracker}/${entry.type}/${entry.lang} → ${id}`);
      }

      entry.status = 'posted';
      entry.postedAt = new Date().toISOString();

      // Update budget
      budget.spent += entry.estimatedCost;
      budget.remaining = budget.monthlyTarget - budget.spent;
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
