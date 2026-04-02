#!/usr/bin/env tsx
/**
 * post-social.ts
 *
 * Posts social media drafts from public/_social/ to X/Twitter and LinkedIn.
 * Reads the latest daily or weekly draft file and posts each entry.
 *
 * Required env vars:
 *   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
 *   LINKEDIN_ACCESS_TOKEN, LINKEDIN_ORG_ID (for company page posts)
 *
 * Usage:
 *   npx tsx scripts/post-social.ts [--dry-run] [--file path/to/drafts.json]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { TwitterApi } from 'twitter-api-v2';

console.warn('[DEPRECATED] This script is replaced by generate-social-queue.ts / post-social-queue.ts. See docs/superpowers/specs/2026-04-01-social-command-center-design.md');

// ── Types ──

interface SocialPost {
  platform: 'twitter' | 'linkedin';
  trackerSlug: string;
  trackerName: string;
  text: string;
  hashtags: string[];
  link: string;
  date: string;
}

interface WeeklyDigest {
  type: 'weekly';
  twitterThread: string[];
  linkedIn: string;
}

// ── X/Twitter via twitter-api-v2 ──

function getTwitterClient(): TwitterApi | null {
  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    console.log('[X] Missing API credentials — skipping');
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
  console.log(`[X] Posted tweet: ${result.data.id}`);
  return result.data.id;
}

// ── LinkedIn ──

async function postToLinkedIn(text: string): Promise<void> {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const orgId = process.env.LINKEDIN_ORG_ID;

  if (!accessToken) {
    console.log('[LinkedIn] Missing access token — skipping');
    return;
  }

  const author = orgId ? `urn:li:organization:${orgId}` : 'urn:li:person:me';
  const url = 'https://api.linkedin.com/v2/ugcPosts';
  const payload = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  const bodyJson = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Length': Buffer.byteLength(bodyJson),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          console.log('[LinkedIn] Posted successfully');
          resolve();
        } else {
          console.error(`[LinkedIn] Error ${res.statusCode}: ${data}`);
          reject(new Error(`LinkedIn API error: ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.write(bodyJson);
    req.end();
  });
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileIdx = args.indexOf('--file');

  let draftPath: string;

  if (fileIdx !== -1 && args[fileIdx + 1]) {
    draftPath = path.resolve(args[fileIdx + 1]);
  } else {
    const socialDir = path.resolve('public/_social');
    if (!fs.existsSync(socialDir)) {
      console.log('No public/_social/ directory — nothing to post.');
      return;
    }
    const files = fs.readdirSync(socialDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) {
      console.log('No draft files found.');
      return;
    }
    draftPath = path.join(socialDir, files[0]);
  }

  console.log(`Reading drafts from: ${draftPath}`);
  const content = JSON.parse(fs.readFileSync(draftPath, 'utf8'));

  const twitterClient = getTwitterClient();

  if (Array.isArray(content)) {
    // Daily drafts
    const posts: SocialPost[] = content;
    const twitterPosts = posts.filter(p => p.platform === 'twitter');
    const linkedInPosts = posts.filter(p => p.platform === 'linkedin');

    console.log(`Found ${twitterPosts.length} Twitter + ${linkedInPosts.length} LinkedIn drafts`);

    if (dryRun) {
      console.log('\n[DRY RUN] Would post:');
      twitterPosts.forEach(p => console.log(`  [X] ${p.trackerName}: ${p.text.slice(0, 80)}...`));
      linkedInPosts.forEach(p => console.log(`  [LI] ${p.trackerName}: ${p.text.slice(0, 80)}...`));
      return;
    }

    // Post top 3 Twitter updates (avoid flooding)
    if (twitterClient) {
      for (const post of twitterPosts.slice(0, 3)) {
        try {
          await postTweet(twitterClient, post.text);
          await sleep(2000);
        } catch (e) {
          console.error(`[X] Failed for ${post.trackerName}:`, e);
        }
      }
    }

    // Post top LinkedIn update
    if (linkedInPosts.length > 0) {
      try {
        await postToLinkedIn(linkedInPosts[0].text);
      } catch (e) {
        console.error('[LinkedIn] Failed:', e);
      }
    }
  } else if (content.type === 'weekly') {
    // Weekly digest
    const digest: WeeklyDigest = content;
    console.log(`Weekly digest: ${digest.twitterThread.length} tweets + 1 LinkedIn post`);

    if (dryRun) {
      console.log('\n[DRY RUN] Would post thread:');
      digest.twitterThread.forEach((t, i) => console.log(`  Tweet ${i + 1}: ${t.slice(0, 80)}...`));
      console.log(`  [LI]: ${digest.linkedIn.slice(0, 80)}...`);
      return;
    }

    // Post Twitter thread
    if (twitterClient) {
      let lastTweetId: string | undefined;
      for (const tweet of digest.twitterThread) {
        try {
          const id = await postTweet(twitterClient, tweet, lastTweetId);
          if (id) lastTweetId = id;
          await sleep(2000);
        } catch (e) {
          console.error('[X] Thread error:', e);
          break;
        }
      }
    }

    // Post LinkedIn
    try {
      await postToLinkedIn(digest.linkedIn);
    } catch (e) {
      console.error('[LinkedIn] Failed:', e);
    }
  }

  console.log('Done.');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
