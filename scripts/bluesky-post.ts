#!/usr/bin/env tsx
/**
 * bluesky-post.ts
 *
 * Posts Watchboard updates to Bluesky via AT Protocol.
 * Reads today's social queue (same format as Twitter poster) and posts
 * due entries to Bluesky. Replaces the banned Twitter posting pipeline.
 *
 * Can also read directly from the site RSS feed for standalone use.
 *
 * Usage:
 *   npx tsx scripts/bluesky-post.ts [--dry-run] [--from-rss]
 *
 * Environment:
 *   BLUESKY_HANDLE   — Bluesky handle (e.g. watchboard.bsky.social)
 *   BLUESKY_PASSWORD  — App password (not account password)
 */
import {
  loadConfig, loadBudget, saveBudget, loadHistory, saveHistory,
  loadQueue, saveQueue, todayDateString,
  type QueueEntry, type HistoryEntry,
} from './social-types.js';
import { BskyAgent, RichText } from '@atproto/api';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';

// ── Constants ─────────────────────────────────────────────────────────────────

const BLUESKY_MAX_LENGTH = 300;
const BLUESKY_MAX_GRAPHEMES = 300;
const THREAD_DELAY_MS = 2000;
const POST_DELAY_MS = 3000;

// ── RSS types (for --from-rss mode) ──────────────────────────────────────────

interface RSSItem {
  title: string;
  link: string;
  description: string;
  category: 'breaking' | 'daily';
  pubDate: string;
  slug: string;
}

// ── Bluesky client ────────────────────────────────────────────────────────────

async function getBlueskyAgent(): Promise<BskyAgent | null> {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_PASSWORD;
  if (!handle || !password) {
    console.log('[bluesky] Missing BLUESKY_HANDLE or BLUESKY_PASSWORD — skipping');
    return null;
  }
  const agent = new BskyAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier: handle, password });
  console.log(`[bluesky] Logged in as ${handle}`);
  return agent;
}

// ── Text formatting ───────────────────────────────────────────────────────────

/**
 * Counts graphemes (Bluesky's char unit) using Intl.Segmenter.
 */
function graphemeLength(text: string): number {
  const segmenter = new Intl.Segmenter();
  return [...segmenter.segment(text)].length;
}

/**
 * Truncate text to fit within a grapheme budget, appending '…' if truncated.
 */
function truncateToGraphemes(text: string, maxGraphemes: number): string {
  const segmenter = new Intl.Segmenter();
  const segments = [...segmenter.segment(text)];
  if (segments.length <= maxGraphemes) return text;
  return segments.slice(0, maxGraphemes - 1).map(s => s.segment).join('') + '…';
}

/**
 * Extract the tracker slug from a watchboard.dev URL.
 */
function extractSlug(url: string): string {
  const match = url.match(/watchboard\.dev\/([^/#?]+)/);
  return match?.[1] ?? '';
}

/**
 * Get emoji for a tracker from its config, falling back to 📊.
 */
function getTrackerEmoji(slug: string): string {
  const trackerPath = join(process.cwd(), 'trackers', slug, 'tracker.json');
  try {
    if (existsSync(trackerPath)) {
      const config = JSON.parse(readFileSync(trackerPath, 'utf8'));
      return config.icon || config.emoji || '📊';
    }
  } catch { /* ignore */ }
  return '📊';
}

/**
 * Format a post for Bluesky from queue entry data.
 * Format: "{emoji} {title}\n\n{description truncated}\n\n🔗 watchboard.dev/{slug}/"
 */
function formatBlueskyPost(
  title: string,
  description: string,
  link: string,
  emoji: string,
): string {
  const slug = extractSlug(link);
  const linkText = `🔗 watchboard.dev/${slug}/`;

  // Calculate available space for description
  // Structure: "{emoji} {title}\n\n{description}\n\n{link}"
  const header = `${emoji} ${title}`;
  const skeleton = `${header}\n\n\n\n${linkText}`;
  const skeletonLength = graphemeLength(skeleton);

  if (skeletonLength >= BLUESKY_MAX_GRAPHEMES) {
    // Title alone is too long — truncate title and skip description
    const titleBudget = BLUESKY_MAX_GRAPHEMES - graphemeLength(`${emoji} \n\n${linkText}`) - 1;
    const truncatedTitle = truncateToGraphemes(title, titleBudget);
    return `${emoji} ${truncatedTitle}\n\n${linkText}`;
  }

  const descBudget = BLUESKY_MAX_GRAPHEMES - skeletonLength;
  if (descBudget <= 10) {
    // Not enough room for a meaningful description
    return `${emoji} ${title}\n\n${linkText}`;
  }

  const truncatedDesc = truncateToGraphemes(description, descBudget);
  return `${emoji} ${title}\n\n${truncatedDesc}\n\n${linkText}`;
}

// ── Bluesky posting ───────────────────────────────────────────────────────────

/**
 * Create a RichText object with auto-detected links and mentions.
 */
async function createRichText(agent: BskyAgent, text: string): Promise<RichText> {
  const rt = new RichText({ text });
  await rt.detectFacets(agent);
  return rt;
}

/**
 * Fetch an image from URL and upload as a blob for embedding.
 */
async function uploadImageBlob(
  agent: BskyAgent,
  imageUrl: string,
): Promise<{ blob: any; mimeType: string } | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) {
      console.warn(`[bluesky] Image fetch failed (${res.status}): ${imageUrl}`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const mimeType = res.headers.get('content-type') ?? 'image/png';

    // Bluesky blob size limit is 1MB
    if (buffer.length > 1_000_000) {
      console.warn(`[bluesky] Image too large (${(buffer.length / 1024).toFixed(0)}KB), skipping`);
      return null;
    }

    const uploaded = await agent.uploadBlob(buffer, { encoding: mimeType });
    return { blob: uploaded.data.blob, mimeType };
  } catch (err) {
    console.warn(`[bluesky] Image upload failed:`, err);
    return null;
  }
}

/**
 * Create an external embed card (link preview with optional thumbnail).
 */
async function createExternalEmbed(
  agent: BskyAgent,
  url: string,
  title: string,
  description: string,
  imageUrl?: string | null,
): Promise<any> {
  let thumb: any = undefined;
  if (imageUrl) {
    const result = await uploadImageBlob(agent, imageUrl);
    if (result) thumb = result.blob;
  }

  return {
    $type: 'app.bsky.embed.external',
    external: {
      uri: url,
      title: title.slice(0, 300),
      description: description.slice(0, 300),
      ...(thumb ? { thumb } : {}),
    },
  };
}

/**
 * Post a single skeet to Bluesky.
 * Returns the URI and CID of the created post (needed for threading).
 */
async function postSkeet(
  agent: BskyAgent,
  text: string,
  options?: {
    root?: { uri: string; cid: string };
    parent?: { uri: string; cid: string };
    embed?: any;
  },
): Promise<{ uri: string; cid: string } | null> {
  try {
    const rt = await createRichText(agent, text);
    const record: Record<string, unknown> = {
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
    };
    if (options?.parent) {
      record.reply = {
        root: options.root ?? options.parent,
        parent: options.parent,
      };
    }
    if (options?.embed) {
      record.embed = options.embed;
    }
    const result = await agent.post(record);
    return { uri: result.uri, cid: result.cid };
  } catch (err) {
    console.error('[bluesky] Post failed:', err);
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Video posting ────────────────────────────────────────────────────────────

const VIDEO_MAX_BYTES = 50 * 1024 * 1024; // 50MB
const VIDEO_POLL_INTERVAL_MS = 3000;
const VIDEO_POLL_MAX_ATTEMPTS = 60;

/**
 * Upload and post a video to Bluesky using service auth for video.bsky.app.
 * Handles: service auth token → upload → job polling → post creation.
 */
export async function postWithVideo(
  agent: BskyAgent,
  videoPath: string,
  text: string,
  altText?: string,
): Promise<{ uri: string; cid: string } | null> {
  const fileSize = statSync(videoPath).size;
  if (fileSize > VIDEO_MAX_BYTES) {
    console.warn(`[bluesky] Video too large (${(fileSize / 1024 / 1024).toFixed(1)}MB > 50MB)`);
    return null;
  }

  const did = agent.session?.did;
  if (!did) {
    console.warn('[bluesky] No active session — cannot upload video');
    return null;
  }

  // Service auth token (session accessJwt is rejected by video.bsky.app)
  const serviceAuth = await agent.com.atproto.server.getServiceAuth({
    aud: 'did:web:video.bsky.app',
    lxm: 'app.bsky.video.uploadVideo',
    exp: Math.floor(Date.now() / 1000) + 60 * 30,
  });
  const videoToken = serviceAuth.data.token;

  const videoBuffer = readFileSync(videoPath);
  const filename = basename(videoPath);
  const uploadUrl = `https://video.bsky.app/xrpc/app.bsky.video.uploadVideo?did=${encodeURIComponent(did)}&name=${encodeURIComponent(filename)}`;

  console.log(`[bluesky] Uploading video (${(fileSize / 1024 / 1024).toFixed(1)}MB)...`);
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${videoToken}`,
      'Content-Type': 'video/mp4',
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok) {
    const body = await uploadRes.text().catch(() => '');
    console.warn(`[bluesky] Video upload failed (${uploadRes.status}): ${body}`);
    return null;
  }

  const uploadData = await uploadRes.json() as { jobId: string };
  if (!uploadData.jobId) {
    console.warn('[bluesky] Video upload response missing jobId');
    return null;
  }

  console.log(`[bluesky] Video uploaded, polling job ${uploadData.jobId}...`);

  // Poll for processing completion
  let blobRef: unknown = null;
  for (let attempt = 0; attempt < VIDEO_POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(VIDEO_POLL_INTERVAL_MS);
    try {
      const statusUrl = `https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(uploadData.jobId)}`;
      const statusRes = await fetch(statusUrl, {
        headers: { 'Authorization': `Bearer ${videoToken}` },
      });
      if (!statusRes.ok) continue;

      const statusData = await statusRes.json() as { jobStatus: { state: string; blob?: unknown; error?: string; message?: string } };
      const state = statusData.jobStatus?.state;

      if (state === 'JOB_STATE_COMPLETED') {
        blobRef = statusData.jobStatus.blob;
        break;
      }
      if (state === 'JOB_STATE_FAILED') {
        console.warn(`[bluesky] Video processing failed: ${statusData.jobStatus.error || statusData.jobStatus.message}`);
        return null;
      }
      if (attempt % 5 === 0) {
        console.log(`[bluesky] Processing... (${attempt + 1}/${VIDEO_POLL_MAX_ATTEMPTS}, state: ${state})`);
      }
    } catch (err) {
      console.warn(`[bluesky] Poll error (attempt ${attempt + 1}):`, err);
    }
  }

  if (!blobRef) {
    console.warn('[bluesky] Video processing timed out');
    return null;
  }

  const embed = {
    $type: 'app.bsky.embed.video',
    video: blobRef,
    alt: altText ?? '',
    aspectRatio: { width: 1920, height: 1080 },
  };

  return postSkeet(agent, truncateToGraphemes(text, BLUESKY_MAX_GRAPHEMES), { embed });
}

// ── RSS parsing (for --from-rss mode) ─────────────────────────────────────────

function parseRSSItems(xmlText: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemXml = match[1];
    const getTag = (tag: string): string => {
      const tagMatch = itemXml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, 's'));
      return tagMatch ? tagMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    };

    const link = getTag('link');
    const category = getTag('category') as 'breaking' | 'daily';

    // Decode XML entities
    const decodeEntities = (s: string): string =>
      s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
       .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

    items.push({
      title: decodeEntities(getTag('title')),
      link,
      description: decodeEntities(getTag('description')),
      category,
      pubDate: getTag('pubDate'),
      slug: extractSlug(link),
    });
  }

  return items;
}

// ── Queue mode (main) ─────────────────────────────────────────────────────────

async function postFromQueue(dryRun: boolean): Promise<void> {
  const today = todayDateString();
  const now = new Date();
  const config = loadConfig();
  const budget = loadBudget();
  const history = loadHistory();
  const queue = loadQueue(today);

  if (queue.length === 0) {
    console.log(`[bluesky] No queue for ${today}`);
    return;
  }

  if (budget.remaining <= 0) {
    console.log(`[bluesky] Monthly budget exhausted ($${budget.spent.toFixed(2)}/$${budget.monthlyTarget.toFixed(2)}) — skipping`);
    return;
  }

  // Normalize legacy field names
  for (const entry of queue) {
    const raw = entry as unknown as Record<string, unknown>;
    if (!raw.tracker && raw.trackerSlug) {
      raw.tracker = raw.trackerSlug;
      delete raw.trackerSlug;
    }
    delete raw.platform;
    delete raw.trackerName;
  }

  // Find due posts
  const due = queue.filter(entry =>
    (entry.status === 'approved' || entry.status === 'auto_approved') &&
    new Date(entry.publishAt) <= now &&
    !entry.tweetId  // reuse tweetId field for bluesky post URI
  );

  console.log(`[bluesky] ${due.length} posts due (${queue.length} total in queue)`);
  if (due.length === 0) return;

  if (dryRun) {
    console.log('\n[DRY RUN] Would post:');
    for (const entry of due) {
      const emoji = getTrackerEmoji(entry.tracker);
      const formatted = formatBlueskyPost(
        entry.text.split('\n')[0],
        entry.text,
        entry.link,
        emoji,
      );
      console.log(`\n  [${entry.type}/${entry.lang}] ${entry.tracker}:`);
      console.log(`  ${formatted.replace(/\n/g, '\n  ')}`);
      console.log(`  (${graphemeLength(formatted)} graphemes)`);
    }
    return;
  }

  const agent = await getBlueskyAgent();
  if (!agent) return;

  let posted = 0;

  for (const entry of due) {
    try {
      const emoji = getTrackerEmoji(entry.tracker);
      const imageUrl = entry.image || entry.memegenUrl;

      if (entry.threadTweets && entry.threadTweets.length > 0) {
        // Post thread
        let parentRef: { uri: string; cid: string } | undefined;
        let rootRef: { uri: string; cid: string } | undefined;
        let threadPosted = 0;

        for (let i = 0; i < entry.threadTweets.length; i++) {
          const isLast = i === entry.threadTweets.length - 1;
          const tweetText = isLast
            ? `${entry.threadTweets[i]}\n\n🔗 ${entry.link}`
            : entry.threadTweets[i];

          // Truncate each thread post to max length
          const postText = truncateToGraphemes(tweetText, BLUESKY_MAX_GRAPHEMES);

          // Add embed card to first post if image available
          let embed: any = undefined;
          if (i === 0 && imageUrl) {
            embed = await createExternalEmbed(
              agent, entry.link, entry.text.split('\n')[0],
              entry.text.slice(0, 200), imageUrl,
            );
          }

          const result = await postSkeet(agent, postText, {
            root: rootRef,
            parent: parentRef,
            embed,
          });

          if (result) {
            if (!rootRef) {
              rootRef = result;
              entry.tweetId = result.uri; // store Bluesky URI in tweetId field
            }
            parentRef = result;
            threadPosted++;
          }
          await sleep(THREAD_DELAY_MS);
        }

        if (threadPosted === 0) {
          console.error(`[bluesky] Thread failed entirely: ${entry.tracker}/${entry.type}`);
        } else if (threadPosted < entry.threadTweets.length) {
          console.warn(`[bluesky] Thread partial: ${entry.tracker}/${entry.type} (${threadPosted}/${entry.threadTweets.length})`);
        } else {
          console.log(`[bluesky] Thread posted: ${entry.tracker}/${entry.type} (${entry.threadTweets.length} posts)`);
        }

        // Only mark as posted if at least one thread post succeeded
        if (threadPosted > 0) {
          entry.status = 'posted';
          entry.postedAt = new Date().toISOString();

          budget.spent = Math.round((budget.spent + entry.estimatedCost) * 100) / 100;
          budget.remaining = Math.round((budget.monthlyTarget - budget.spent) * 100) / 100;
          budget.tweetsPosted++;

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
        }
      } else {
        // Single post
        const formatted = formatBlueskyPost(
          entry.text.split('\n')[0],
          entry.text,
          entry.link,
          emoji,
        );

        // Create embed card with link preview
        let embed: any = undefined;
        try {
          embed = await createExternalEmbed(
            agent, entry.link,
            entry.text.split('\n')[0],
            entry.text.slice(0, 200),
            imageUrl,
          );
        } catch (err) {
          console.warn(`[bluesky] Embed creation failed, posting without:`, err);
        }

        const result = await postSkeet(agent, formatted, { embed });
        entry.tweetId = result?.uri ?? null;
        console.log(`[bluesky] Posted: ${entry.tracker}/${entry.type}/${entry.lang} → ${result?.uri ?? 'FAILED'}${imageUrl ? ' (with image)' : ''}`);

        // Only mark as posted if the post succeeded
        if (entry.tweetId) {
          entry.status = 'posted';
          entry.postedAt = new Date().toISOString();

          budget.spent = Math.round((budget.spent + entry.estimatedCost) * 100) / 100;
          budget.remaining = Math.round((budget.monthlyTarget - budget.spent) * 100) / 100;
          budget.tweetsPosted++;

          history.push({
            tweetId: entry.tweetId,
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
        }
      }
      await sleep(POST_DELAY_MS);
    } catch (err) {
      console.error(`[bluesky] Failed: ${entry.tracker}/${entry.type}:`, err);
    }
  }

  // Save all state
  saveQueue(today, queue);
  saveBudget(budget);
  saveHistory(history);

  console.log(`[bluesky] Done. ${posted}/${due.length} posted. Budget: $${budget.spent.toFixed(2)}/$${budget.monthlyTarget.toFixed(2)}`);
}

// ── RSS mode ──────────────────────────────────────────────────────────────────

async function postFromRSS(dryRun: boolean): Promise<void> {
  const rssPath = join(process.cwd(), 'dist', 'rss.xml');
  if (!existsSync(rssPath)) {
    console.log('[bluesky] No RSS feed found at dist/rss.xml — run a build first');
    return;
  }

  const xml = readFileSync(rssPath, 'utf8');
  const items = parseRSSItems(xml);
  const today = todayDateString();

  // Filter to today's items only
  const todayItems = items.filter(item => {
    const itemDate = new Date(item.pubDate).toISOString().slice(0, 10);
    return itemDate === today;
  });

  if (todayItems.length === 0) {
    console.log(`[bluesky] No RSS items for ${today}`);
    return;
  }

  console.log(`[bluesky] Found ${todayItems.length} RSS items for ${today}`);

  // Breaking news gets individual posts; daily digests could be threaded
  const breaking = todayItems.filter(i => i.category === 'breaking');
  const daily = todayItems.filter(i => i.category === 'daily');

  if (dryRun) {
    console.log('\n[DRY RUN] Would post from RSS:');
    for (const item of breaking) {
      const emoji = getTrackerEmoji(item.slug);
      const post = formatBlueskyPost(item.title, item.description, item.link, emoji);
      console.log(`\n  [BREAKING] ${item.slug}:`);
      console.log(`  ${post.replace(/\n/g, '\n  ')}`);
      console.log(`  (${graphemeLength(post)} graphemes)`);
    }
    if (daily.length > 0) {
      console.log(`\n  [DAILY DIGEST THREAD] ${daily.length} tracker updates`);
      for (const item of daily) {
        const emoji = getTrackerEmoji(item.slug);
        const post = formatBlueskyPost(item.title, item.description, item.link, emoji);
        console.log(`\n  ${item.slug}:`);
        console.log(`  ${post.replace(/\n/g, '\n  ')}`);
        console.log(`  (${graphemeLength(post)} graphemes)`);
      }
    }
    return;
  }

  const agent = await getBlueskyAgent();
  if (!agent) return;

  let posted = 0;

  // Post breaking news as individual posts
  for (const item of breaking) {
    const emoji = getTrackerEmoji(item.slug);
    const text = formatBlueskyPost(item.title, item.description, item.link, emoji);

    let embed: any = undefined;
    try {
      embed = await createExternalEmbed(agent, item.link, item.title, item.description.slice(0, 200));
    } catch { /* post without embed */ }

    const result = await postSkeet(agent, text, { embed });
    if (result) {
      console.log(`[bluesky] Breaking: ${item.slug} → ${result.uri}`);
      posted++;
    }
    await sleep(POST_DELAY_MS);
  }

  // Post daily digests as a thread
  if (daily.length > 0) {
    const headerText = `📊 Watchboard Daily Digest — ${today}\n\n${daily.length} tracker updates today.\n\n🔗 watchboard.dev`;
    let parentRef: { uri: string; cid: string } | undefined;
    let rootRef: { uri: string; cid: string } | undefined;

    const headerResult = await postSkeet(agent, headerText);
    if (headerResult) {
      rootRef = headerResult;
      parentRef = headerResult;
      console.log(`[bluesky] Digest thread header → ${headerResult.uri}`);
      posted++;
    }

    for (const item of daily) {
      if (!parentRef) break;
      const emoji = getTrackerEmoji(item.slug);
      const text = formatBlueskyPost(item.title, item.description, item.link, emoji);

      const result = await postSkeet(agent, text, { root: rootRef, parent: parentRef });
      if (result) {
        parentRef = result;
        posted++;
      }
      await sleep(THREAD_DELAY_MS);
    }
    console.log(`[bluesky] Digest thread: ${daily.length} updates posted`);
  }

  console.log(`[bluesky] Done. ${posted} posts from RSS.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const fromRSS = process.argv.includes('--from-rss');

  if (fromRSS) {
    await postFromRSS(dryRun);
  } else {
    await postFromQueue(dryRun);
  }
}

main().catch(err => {
  console.error('[bluesky] Fatal error:', err);
  process.exit(1);
});
