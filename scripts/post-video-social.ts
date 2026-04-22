#!/usr/bin/env tsx
/**
 * post-video-social.ts
 *
 * Posts the daily Watchboard video brief to social platforms.
 * Extensible adapter architecture — currently auto-publishes to Bluesky,
 * with stubs for YouTube Shorts and Reddit. Always generates a manual
 * queue JSON for platforms that require human posting (TikTok, Instagram).
 *
 * Usage:
 *   npx tsx scripts/post-video-social.ts <video-path> [--dry-run]
 *
 * Environment:
 *   BLUESKY_HANDLE    — Bluesky handle (e.g. watchboard.bsky.social)
 *   BLUESKY_PASSWORD   — App password (not account password)
 */
import { BskyAgent, RichText } from '@atproto/api';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';
import { todayDateString, PATHS } from './social-types.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface VideoMeta {
  date: string;
  trackers: Array<{ name: string; slug: string; headline: string }>;
  duration: number;
  videoPath: string;
}

interface SocialPlatform {
  name: string;
  enabled: boolean;
  postVideo(videoPath: string, meta: VideoMeta): Promise<{ url: string } | null>;
}

interface VideoPostRecord {
  date: string;
  videoFile: string;
  narrationFile: string;
  caption_en: string;
  caption_es: string;
  hashtags: string[];
  trackerSlugs: string[];
  platforms: Record<string, 'auto' | 'manual' | 'stub'>;
  posted: Record<string, { url: string; postedAt: string }>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const BLUESKY_MAX_GRAPHEMES = 300;
const BLUESKY_VIDEO_MAX_BYTES = 50 * 1024 * 1024; // 50MB
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 60; // 3 minutes max
const PLATFORM_DELAY_MS = 2000;

const ROOT = process.cwd();
const BREAKING_JSON_PATH = join(ROOT, 'video', 'src', 'data', 'breaking.json');
const SOCIAL_DIR = PATHS.socialDir;

// ── Text utilities ───────────────────────────────────────────────────────────

function graphemeLength(text: string): number {
  const segmenter = new Intl.Segmenter();
  return [...segmenter.segment(text)].length;
}

function truncateToGraphemes(text: string, maxGraphemes: number): string {
  const segmenter = new Intl.Segmenter();
  const segments = [...segmenter.segment(text)];
  if (segments.length <= maxGraphemes) return text;
  return segments.slice(0, maxGraphemes - 1).map(s => s.segment).join('') + '\u2026';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Video metadata ───────────────────────────────────────────────────────────

function loadBreakingData(): { date: string; trackers: Array<{ slug: string; name: string; headline: string }> } {
  if (!existsSync(BREAKING_JSON_PATH)) {
    throw new Error(`Breaking data not found at ${BREAKING_JSON_PATH}`);
  }
  return JSON.parse(readFileSync(BREAKING_JSON_PATH, 'utf8'));
}

function getVideoDuration(videoPath: string): number {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
      { encoding: 'utf8', timeout: 15000 },
    );
    return Math.round(parseFloat(output.trim()));
  } catch {
    console.warn('[video-social] ffprobe not available or failed — using 0 for duration');
    return 0;
  }
}

function buildVideoMeta(videoPath: string): VideoMeta {
  const data = loadBreakingData();
  const duration = getVideoDuration(videoPath);
  return {
    date: data.date,
    trackers: data.trackers.map(t => ({ name: t.name, slug: t.slug, headline: t.headline })),
    duration,
    videoPath,
  };
}

// ── Caption generation ───────────────────────────────────────────────────────

const VIDEO_TYPE = (process.env.VIDEO_TYPE === 'progress') ? 'progress' : 'conflict';

function buildCaptionEn(meta: VideoMeta): string {
  const headlines = meta.trackers.map(t => `${t.headline}`).join('\n');
  if (VIDEO_TYPE === 'progress') {
    return `\uD83C\uDF31 Watchboard Progress Brief \u2014 ${meta.date}\n\n${headlines}\n\nhttps://watchboard.dev`;
  }
  return `Watchboard Daily Brief \u2014 ${meta.date}\n\n${headlines}\n\nhttps://watchboard.dev`;
}

function buildCaptionEs(meta: VideoMeta): string {
  if (VIDEO_TYPE === 'progress') {
    return `\uD83C\uDF31 Resumen de Progreso Watchboard \u2014 ${meta.date}\n\nhttps://watchboard.dev`;
  }
  return `Resumen Diario Watchboard \u2014 ${meta.date}\n\nhttps://watchboard.dev`;
}

// ── Post record (idempotency file) ───────────────────────────────────────────

function postRecordPath(date: string): string {
  if (VIDEO_TYPE === 'progress') {
    return join(SOCIAL_DIR, `video-post-progress-${date}.json`);
  }
  return join(SOCIAL_DIR, `video-post-${date}.json`);
}

function loadPostRecord(date: string): VideoPostRecord | null {
  const p = postRecordPath(date);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function savePostRecord(record: VideoPostRecord): void {
  mkdirSync(SOCIAL_DIR, { recursive: true });
  writeFileSync(postRecordPath(record.date), JSON.stringify(record, null, 2), 'utf8');
}

function buildInitialRecord(meta: VideoMeta, platforms: SocialPlatform[]): VideoPostRecord {
  const platformMap: Record<string, 'auto' | 'manual' | 'stub'> = {
    tiktok: 'manual',
    instagram: 'manual',
  };
  for (const p of platforms) {
    if (p.enabled) {
      platformMap[p.name] = 'auto';
    } else {
      platformMap[p.name] = 'stub';
    }
  }

  const videoFile = basename(meta.videoPath);
  const narrationFile = videoFile.replace(/\.mp4$/, '-narrated-en.mp4');

  return {
    date: meta.date,
    videoFile,
    narrationFile,
    caption_en: buildCaptionEn(meta),
    caption_es: buildCaptionEs(meta),
    hashtags: VIDEO_TYPE === 'progress'
      ? ['#science', '#progress', '#breakthroughs', '#Watchboard']
      : ['#OSINT', '#geopolitics', '#Watchboard'],
    trackerSlugs: meta.trackers.map((t) => t.slug),
    platforms: platformMap,
    posted: {},
  };
}

// ── Bluesky adapter ─────────────────────────────────────────────────────────

function createBlueskyAdapter(): SocialPlatform {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_PASSWORD;
  const enabled = Boolean(handle && password);

  return {
    name: 'bluesky',
    enabled,

    async postVideo(videoPath: string, meta: VideoMeta): Promise<{ url: string } | null> {
      if (!handle || !password) {
        console.warn('[bluesky] Missing BLUESKY_HANDLE or BLUESKY_PASSWORD — skipping');
        return null;
      }

      const agent = new BskyAgent({ service: 'https://bsky.social' });
      await agent.login({ identifier: handle, password });
      console.log(`[bluesky] Logged in as ${handle}`);

      const postText = buildBlueskyPostText(meta);
      const altText = `Watchboard Daily Intelligence Brief for ${meta.date}. Covers: ${meta.trackers.map(t => t.name).join(', ')}.`;

      // Attempt video upload, fall back to text-only
      const videoEmbed = await uploadAndProcessVideo(agent, videoPath, altText);

      if (videoEmbed) {
        return createBlueskyPost(agent, handle, postText, videoEmbed);
      }

      // Fallback: post with external link card
      console.warn('[bluesky] Video upload failed — falling back to link card');
      const linkEmbed = await createLinkCardEmbed(agent, meta);
      return createBlueskyPost(agent, handle, postText, linkEmbed);
    },
  };
}

function buildBlueskyPostText(meta: VideoMeta): string {
  const header = `\ud83d\udcca ${meta.date}`;
  const footer = `\ud83d\udd17 watchboard.dev`;
  const skeleton = `${header}\n\n\n\n${footer}`;
  const skeletonLen = graphemeLength(skeleton);

  // Budget for headlines: total limit minus skeleton
  let headlineBudget = BLUESKY_MAX_GRAPHEMES - skeletonLen;
  const lines: string[] = [];

  for (const t of meta.trackers) {
    const line = `\u2022 ${t.name}: ${t.headline}`;
    const lineLen = graphemeLength(line) + 1; // +1 for newline
    if (lineLen > headlineBudget) {
      // Try to fit a truncated version
      if (headlineBudget > 10) {
        lines.push(truncateToGraphemes(line, headlineBudget - 1));
      }
      break;
    }
    lines.push(line);
    headlineBudget -= lineLen;
  }

  return `${header}\n\n${lines.join('\n')}\n\n${footer}`;
}

async function uploadAndProcessVideo(
  agent: BskyAgent,
  videoPath: string,
  altText: string,
): Promise<Record<string, unknown> | null> {
  try {
    const fileSize = statSync(videoPath).size;
    if (fileSize > BLUESKY_VIDEO_MAX_BYTES) {
      console.warn(`[bluesky] Video too large (${(fileSize / 1024 / 1024).toFixed(1)}MB > 50MB limit) — skipping video upload`);
      return null;
    }

    const videoBuffer = readFileSync(videoPath);
    const did = agent.session?.did;
    const accessJwt = agent.session?.accessJwt;
    if (!did || !accessJwt) {
      console.warn('[bluesky] No active session — cannot upload video');
      return null;
    }

    const filename = basename(videoPath);
    console.log(`[bluesky] Uploading video (${(fileSize / 1024 / 1024).toFixed(1)}MB)...`);

    // Get the PDS service endpoint DID for service auth
    // Error said: aud should be the user's PDS DID (e.g. did:web:jellybaby.us-east.host.bsky.network)
    // We get it from the session's serviceUrl or didDoc
    const pdsUrl = agent.pdsUrl ?? agent.service.toString();
    const pdsHost = new URL(pdsUrl).hostname;
    const pdsAud = `did:web:${pdsHost}`;
    console.log(`[bluesky] Service auth aud: ${pdsAud}`);

    // Get service auth token for video upload
    const serviceAuth = await agent.com.atproto.server.getServiceAuth({
      aud: pdsAud,
      lxm: 'com.atproto.repo.uploadBlob',
      exp: Math.floor(Date.now() / 1000) + 60 * 30,
    });
    const videoToken = serviceAuth.data.token;

    const uploadUrl = `https://video.bsky.app/xrpc/app.bsky.video.uploadVideo?did=${encodeURIComponent(did)}&name=${encodeURIComponent(filename)}`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${videoToken}`,
        'Content-Type': 'video/mp4',
      },
      body: videoBuffer,
    });

    if (!uploadRes.ok) {
      const errorBody = await uploadRes.text().catch(() => '');
      console.warn(`[bluesky] Video upload failed (${uploadRes.status}): ${errorBody}`);
      return null;
    }

    const uploadData = await uploadRes.json() as { jobId: string };
    const jobId = uploadData.jobId;
    if (!jobId) {
      console.warn('[bluesky] Video upload response missing jobId');
      return null;
    }

    console.log(`[bluesky] Video uploaded, processing job ${jobId}...`);

    // Poll for processing completion (use service auth token, not session JWT)
    const blobRef = await pollVideoJob(videoToken, jobId);
    if (!blobRef) return null;

    return {
      $type: 'app.bsky.embed.video',
      video: blobRef,
      alt: altText,
      aspectRatio: { width: 1920, height: 1080 },
    };
  } catch (err) {
    console.warn('[bluesky] Video upload error:', err);
    return null;
  }
}

async function pollVideoJob(
  videoToken: string,
  jobId: string,
): Promise<unknown | null> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    try {
      const statusUrl = `https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(jobId)}`;
      const statusRes = await fetch(statusUrl, {
        headers: { 'Authorization': `Bearer ${videoToken}` },
      });

      if (!statusRes.ok) {
        console.warn(`[bluesky] Job status check failed (${statusRes.status})`);
        continue;
      }

      const statusData = await statusRes.json() as { jobStatus: { state: string; blob?: unknown; error?: string; message?: string } };
      const state = statusData.jobStatus?.state;

      if (state === 'JOB_STATE_COMPLETED') {
        console.log('[bluesky] Video processing complete');
        return statusData.jobStatus.blob;
      }

      if (state === 'JOB_STATE_FAILED') {
        const errMsg = statusData.jobStatus.error || statusData.jobStatus.message || 'unknown';
        console.warn(`[bluesky] Video processing failed: ${errMsg}`);
        return null;
      }

      // Still processing
      if (attempt % 5 === 0) {
        console.log(`[bluesky] Video processing... (attempt ${attempt + 1}/${POLL_MAX_ATTEMPTS}, state: ${state})`);
      }
    } catch (err) {
      console.warn(`[bluesky] Job status poll error (attempt ${attempt + 1}):`, err);
    }
  }

  console.warn('[bluesky] Video processing timed out');
  return null;
}

async function createLinkCardEmbed(
  agent: BskyAgent,
  meta: VideoMeta,
): Promise<Record<string, unknown>> {
  const firstTracker = meta.trackers[0];
  const embed: Record<string, unknown> = {
    $type: 'app.bsky.embed.external',
    external: {
      uri: 'https://watchboard.dev',
      title: `Watchboard Daily Brief \u2014 ${meta.date}`,
      description: firstTracker
        ? firstTracker.headline.slice(0, 300)
        : 'Daily intelligence brief from Watchboard',
    },
  };

  // Attempt to fetch a thumbnail from breaking data
  try {
    const data = loadBreakingData();
    const trackerWithThumb = data.trackers.find(
      (t: Record<string, unknown>) => t.thumbnailUrl && typeof t.thumbnailUrl === 'string',
    );
    if (trackerWithThumb) {
      const thumbUrl = (trackerWithThumb as Record<string, unknown>).thumbnailUrl as string;
      const thumbRes = await fetch(thumbUrl);
      if (thumbRes.ok) {
        const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
        if (thumbBuffer.length <= 1_000_000) {
          const mimeType = thumbRes.headers.get('content-type') ?? 'image/jpeg';
          const uploaded = await agent.uploadBlob(thumbBuffer, { encoding: mimeType });
          (embed.external as Record<string, unknown>).thumb = uploaded.data.blob;
        }
      }
    }
  } catch (err) {
    console.warn('[bluesky] Thumbnail upload for fallback failed:', err);
  }

  return embed;
}

async function createBlueskyPost(
  agent: BskyAgent,
  handle: string,
  text: string,
  embed: Record<string, unknown> | null,
): Promise<{ url: string } | null> {
  try {
    const rt = new RichText({ text });
    await rt.detectFacets(agent);

    const record: Record<string, unknown> = {
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
    };
    if (embed) {
      record.embed = embed;
    }

    const result = await agent.post(record);
    // Convert AT URI to web URL: at://did/app.bsky.feed.post/rkey -> https://bsky.app/profile/handle/post/rkey
    const rkey = result.uri.split('/').pop();
    const url = `https://bsky.app/profile/${handle}/post/${rkey}`;
    console.log(`[bluesky] Video post created: ${url}`);
    return { url };
  } catch (err) {
    console.error('[bluesky] Post creation failed:', err);
    return null;
  }
}

// ── YouTube Shorts stub ──────────────────────────────────────────────────────

function createYouTubeAdapter(): SocialPlatform {
  return {
    name: 'youtube',
    enabled: false,
    async postVideo(): Promise<{ url: string } | null> {
      return null;
    },
  };
}

// ── Reddit stub ──────────────────────────────────────────────────────────────

function createRedditAdapter(): SocialPlatform {
  return {
    name: 'reddit',
    enabled: false,
    async postVideo(): Promise<{ url: string } | null> {
      return null;
    },
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const videoPath = args.find(a => !a.startsWith('--'));

  if (!videoPath) {
    console.error('Usage: post-video-social.ts <video-path> [--dry-run]');
    process.exit(1);
  }

  if (!existsSync(videoPath)) {
    console.error(`[video-social] Video file not found: ${videoPath}`);
    process.exit(1);
  }

  console.log(`[video-social] Video: ${videoPath}`);
  console.log(`[video-social] Dry run: ${dryRun}`);

  const meta = buildVideoMeta(videoPath);
  console.log(`[video-social] Date: ${meta.date}, Trackers: ${meta.trackers.length}, Duration: ${meta.duration}s`);

  // Build platform adapters
  const platforms: SocialPlatform[] = [
    createBlueskyAdapter(),
    createYouTubeAdapter(),
    createRedditAdapter(),
  ];

  // Load or create the post record for idempotency
  const existingRecord = loadPostRecord(meta.date);
  const record = existingRecord ?? buildInitialRecord(meta, platforms);

  // Merge any existing posted entries
  if (existingRecord) {
    console.log(`[video-social] Found existing record for ${meta.date}`);
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Would post to:');
    for (const platform of platforms) {
      const alreadyPosted = record.posted[platform.name];
      if (alreadyPosted) {
        console.log(`  ${platform.name}: SKIP (already posted at ${alreadyPosted.postedAt} -> ${alreadyPosted.url})`);
      } else if (platform.enabled) {
        console.log(`  ${platform.name}: WOULD POST`);
      } else {
        console.log(`  ${platform.name}: DISABLED (stub)`);
      }
    }
    console.log(`\nPost text (Bluesky):`);
    console.log(`  ${buildBlueskyPostText(meta).replace(/\n/g, '\n  ')}`);
    console.log(`  (${graphemeLength(buildBlueskyPostText(meta))} graphemes)`);
    console.log(`\nCaption (EN):`);
    console.log(`  ${record.caption_en.replace(/\n/g, '\n  ')}`);

    // Still save the record so manual platforms have the queue file
    savePostRecord(record);
    console.log(`\n[video-social] Queue file saved: ${postRecordPath(meta.date)}`);
    return;
  }

  // Post to each enabled platform
  for (const platform of platforms) {
    if (!platform.enabled) {
      console.log(`[video-social] ${platform.name}: disabled — skipping`);
      continue;
    }

    // Idempotency: skip if already posted today
    if (record.posted[platform.name]) {
      console.log(`[video-social] ${platform.name}: already posted at ${record.posted[platform.name].postedAt} — skipping`);
      continue;
    }

    console.log(`[video-social] ${platform.name}: posting...`);
    try {
      const result = await platform.postVideo(videoPath, meta);
      if (result) {
        record.posted[platform.name] = {
          url: result.url,
          postedAt: new Date().toISOString(),
        };
        console.log(`[video-social] ${platform.name}: success -> ${result.url}`);
      } else {
        console.warn(`[video-social] ${platform.name}: returned null (no post created)`);
      }
    } catch (err) {
      console.warn(`[video-social] ${platform.name}: failed —`, err);
    }

    // Rate limit delay between platforms
    await sleep(PLATFORM_DELAY_MS);
  }

  // Always save the record (even on partial failure)
  savePostRecord(record);
  console.log(`\n[video-social] Record saved: ${postRecordPath(meta.date)}`);

  // Summary
  const postedCount = Object.keys(record.posted).length;
  const enabledCount = platforms.filter(p => p.enabled).length;
  console.log(`[video-social] Done. ${postedCount}/${enabledCount} platforms posted.`);
}

main().catch(err => {
  console.error('[video-social] Fatal error:', err);
  process.exit(1);
});
