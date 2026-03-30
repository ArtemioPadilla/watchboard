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
import * as crypto from 'crypto';
import * as https from 'https';

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

// ── X/Twitter OAuth 1.0a ──

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string,
): string {
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map(k => `${percentEncode(k)}=${percentEncode(params[k])}`).join('&');
  const baseString = `${method}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

function buildOAuthHeader(
  method: string,
  url: string,
  body: Record<string, string>,
  apiKey: string,
  apiSecret: string,
  accessToken: string,
  accessTokenSecret: string,
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  };

  const allParams = { ...oauthParams, ...body };
  const signature = generateOAuthSignature(method, url, allParams, apiSecret, accessTokenSecret);
  oauthParams.oauth_signature = signature;

  const header = Object.keys(oauthParams)
    .sort()
    .map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(', ');

  return `OAuth ${header}`;
}

async function postTweet(text: string, replyToId?: string): Promise<{ id: string } | null> {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    console.log('[X] Missing API credentials — skipping');
    return null;
  }

  const url = 'https://api.twitter.com/2/tweets';
  const payload: Record<string, unknown> = { text };
  if (replyToId) {
    payload.reply = { in_reply_to_tweet_id: replyToId };
  }

  const bodyJson = JSON.stringify(payload);
  const authHeader = buildOAuthHeader('POST', url, {}, apiKey, apiSecret, accessToken, accessTokenSecret);

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyJson),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          const parsed = JSON.parse(data);
          console.log(`[X] Posted tweet: ${parsed.data?.id}`);
          resolve({ id: parsed.data?.id });
        } else {
          console.error(`[X] Error ${res.statusCode}: ${data}`);
          reject(new Error(`X API error: ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.write(bodyJson);
    req.end();
  });
}

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
          console.log(`[LinkedIn] Posted successfully`);
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
    // Find the latest draft file
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

  // Detect format: daily (SocialPost[]) or weekly (WeeklyDigest)
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
    for (const post of twitterPosts.slice(0, 3)) {
      try {
        await postTweet(post.text);
        await sleep(2000); // rate limit buffer
      } catch (e) {
        console.error(`[X] Failed for ${post.trackerName}:`, e);
      }
    }

    // Post top LinkedIn update (one per day is ideal)
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
    let lastTweetId: string | undefined;
    for (const tweet of digest.twitterThread) {
      try {
        const result = await postTweet(tweet, lastTweetId);
        if (result) lastTweetId = result.id;
        await sleep(2000);
      } catch (e) {
        console.error('[X] Thread error:', e);
        break;
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
