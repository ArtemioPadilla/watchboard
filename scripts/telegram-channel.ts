#!/usr/bin/env tsx
/**
 * telegram-channel.ts
 *
 * Posts breaking news updates to a Telegram channel via Bot API.
 * Reads from the hourly manifest (today-updates.json), cross-references
 * tracker data (meta, kpis, digests) to format rich messages.
 *
 * Deduplication: maintains a sent-log at public/_hourly/telegram-sent.json
 * to avoid re-posting the same manifest entries.
 *
 * Env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  type HourlyManifest,
  type ManifestUpdate,
  PATHS,
} from './hourly-types.js';

// ── Constants ────────────────────────────────────────────────────────────────

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TELEGRAM_SENT_PATH = join(PATHS.hourlyDir, 'telegram-sent.json');
const BASE_URL = 'https://watchboard.dev';
const TELEGRAM_API = 'https://api.telegram.org';
const MAX_MESSAGE_LENGTH = 4096; // Telegram HTML message limit
const DAILY_CAP = 10; // Max Telegram posts per day

// ── Types ────────────────────────────────────────────────────────────────────

interface TelegramSentLog {
  entries: TelegramSentEntry[];
}

interface TelegramSentEntry {
  /** Unique key: tracker + timestamp from manifest */
  key: string;
  telegramMessageId: number | null;
  sentAt: string;
}

interface TrackerMeta {
  heroHeadline?: string;
  heroSubtitle?: string;
  lastUpdated?: string;
  breaking?: boolean;
  [key: string]: unknown;
}

interface TrackerKpi {
  id: string;
  label: string;
  value: string;
  color?: string;
  trend?: string;
  [key: string]: unknown;
}

interface DigestEntry {
  date: string;
  title: string;
  summary: string;
  sectionsUpdated?: string[];
  source?: string;
}

interface TrackerConfig {
  slug: string;
  name: string;
  domain: string;
  region?: string;
  [key: string]: unknown;
}

// ── Telegram API helpers ─────────────────────────────────────────────────────

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN env var is required');
  return token;
}

function getChannelId(): string {
  const id = process.env.TELEGRAM_CHANNEL_ID;
  if (!id) throw new Error('TELEGRAM_CHANNEL_ID env var is required');
  return id;
}

async function sendTelegramMessage(
  text: string,
  imageUrl?: string,
): Promise<number | null> {
  const token = getBotToken();
  const chatId = getChannelId();

  try {
    if (imageUrl) {
      // Try sending with photo first
      const photoUrl = `${TELEGRAM_API}/bot${token}/sendPhoto`;
      const photoRes = await fetch(photoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: imageUrl,
          caption: stripHtmlAndTruncate(text, 1024), // Photo captions limited to 1024
          parse_mode: 'HTML',
          disable_web_page_preview: false,
        }),
      });

      if (photoRes.ok) {
        const data = await photoRes.json() as { result?: { message_id?: number } };
        return data.result?.message_id ?? null;
      }
      // If photo fails, fall back to text-only
      console.warn('[telegram] Photo send failed, falling back to text');
    }

    // Text-only message
    const msgUrl = `${TELEGRAM_API}/bot${token}/sendMessage`;
    const res = await fetch(msgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[telegram] Send failed (${res.status}):`, errBody);
      return null;
    }

    const data = await res.json() as { result?: { message_id?: number } };
    return data.result?.message_id ?? null;
  } catch (err) {
    console.error('[telegram] Request error:', err);
    return null;
  }
}

// ── Sent log I/O ─────────────────────────────────────────────────────────────

function loadSentLog(): TelegramSentLog {
  if (!existsSync(TELEGRAM_SENT_PATH)) {
    return { entries: [] };
  }
  try {
    return JSON.parse(readFileSync(TELEGRAM_SENT_PATH, 'utf8'));
  } catch {
    return { entries: [] };
  }
}

function saveSentLog(log: TelegramSentLog): void {
  mkdirSync(dirname(TELEGRAM_SENT_PATH), { recursive: true });
  // Prune entries older than 7 days
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  log.entries = log.entries.filter((e) => e.sentAt > cutoff);
  writeFileSync(TELEGRAM_SENT_PATH, JSON.stringify(log, null, 2), 'utf8');
}

function makeEntryKey(update: ManifestUpdate): string {
  return `${update.tracker}::${update.timestamp}`;
}

// ── Tracker data loaders ─────────────────────────────────────────────────────

function loadTrackerConfig(slug: string): TrackerConfig | null {
  const configPath = join(ROOT, 'trackers', slug, 'tracker.json');
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return null;
  }
}

function loadTrackerMeta(slug: string): TrackerMeta | null {
  const metaPath = join(ROOT, 'trackers', slug, 'data', 'meta.json');
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, 'utf8'));
  } catch {
    return null;
  }
}

function loadTrackerKpis(slug: string): TrackerKpi[] {
  const kpisPath = join(ROOT, 'trackers', slug, 'data', 'kpis.json');
  if (!existsSync(kpisPath)) return [];
  try {
    const data = JSON.parse(readFileSync(kpisPath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function loadTrackerDigests(slug: string): DigestEntry[] {
  const digestsPath = join(ROOT, 'trackers', slug, 'data', 'digests.json');
  if (!existsSync(digestsPath)) return [];
  try {
    const data = JSON.parse(readFileSync(digestsPath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function getTrackerThumbnail(slug: string): string | null {
  // Check for social preview or header image
  const candidates = [
    join(ROOT, 'public', 'social', `${slug}.png`),
    join(ROOT, 'public', 'social', `${slug}.jpg`),
    join(ROOT, 'public', 'images', 'trackers', `${slug}.png`),
    join(ROOT, 'public', 'images', 'trackers', `${slug}.jpg`),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      // Return the public URL for the image
      const rel = candidate.replace(join(ROOT, 'public'), '');
      return `${BASE_URL}${rel}`;
    }
  }

  // Fall back to OG image URL (generated by Astro)
  return `${BASE_URL}/${slug}/og.png`;
}

// ── HTML truncation helpers ──────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

function stripHtmlAndTruncate(html: string, maxLen: number): string {
  const plain = stripHtml(html);
  if (plain.length <= maxLen) return plain;
  return plain.slice(0, maxLen - 3) + '...';
}

function truncateHtmlMessage(html: string, maxLen: number): string {
  if (html.length <= maxLen) return html;
  // Find a safe cut point before maxLen that doesn't split a tag
  let cutPoint = maxLen - 3;
  // Walk back to avoid cutting inside a tag
  const lastOpenBracket = html.lastIndexOf('<', cutPoint);
  const lastCloseBracket = html.lastIndexOf('>', cutPoint);
  if (lastOpenBracket > lastCloseBracket) {
    // We're inside a tag, cut before it
    cutPoint = lastOpenBracket;
  }
  let truncated = html.slice(0, cutPoint) + '...';
  // Close any unclosed tags
  const openTags: string[] = [];
  const tagRegex = /<\/?(\w+)[^>]*>/g;
  let match;
  while ((match = tagRegex.exec(truncated)) !== null) {
    if (match[0].startsWith('</')) {
      openTags.pop();
    } else if (!match[0].endsWith('/>')) {
      openTags.push(match[1]);
    }
  }
  // Close remaining open tags in reverse order
  while (openTags.length > 0) {
    truncated += '</' + openTags.pop() + '>';
  }
  return truncated;
}

// ── Message formatting ───────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatKpiLine(kpis: TrackerKpi[]): string {
  if (kpis.length === 0) return '';

  // Pick top 3 most relevant KPIs (prefer those with trend or recent updates)
  const top = kpis
    .filter((k) => k.value && k.label)
    .slice(0, 3);

  if (top.length === 0) return '';

  const parts = top.map((k) => {
    const trendIcon =
      k.trend === 'up' ? '📈' : k.trend === 'down' ? '📉' : '';
    return `${k.label}: ${k.value}${trendIcon ? ' ' + trendIcon : ''}`;
  });

  return `📊 ${parts.join(' · ')}`;
}

function formatTelegramMessage(
  update: ManifestUpdate,
  config: TrackerConfig | null,
  meta: TrackerMeta | null,
  kpis: TrackerKpi[],
  digests: DigestEntry[],
): string {
  const slug = update.tracker;
  const trackerName = config?.name ?? slug;
  const domain = config?.domain ?? 'world';

  // Get headline: prefer today's digest, then meta heroHeadline
  const todayDigest = digests.find(
    (d) => d.source === 'breaking' && d.date === update.timestamp.slice(0, 10),
  );

  const title = todayDigest?.title?.replace(/^Breaking:\s*/i, '') ??
    meta?.heroHeadline ??
    `Update on ${trackerName}`;

  // Description: prefer digest summary, then meta heroSubtitle
  let description = todayDigest?.summary ?? meta?.heroSubtitle ?? '';
  if (description.length > 200) {
    description = description.slice(0, 197) + '...';
  }

  const link = `${BASE_URL}/${slug}/`;
  const kpiLine = formatKpiLine(kpis);

  // Build hashtags
  const slugTag = slug.replace(/-/g, '_');
  const domainTag = domain.replace(/-/g, '_');
  const hashtags = `#watchboard #${domainTag} #${slugTag}`;

  // Compose message in HTML
  const lines: string[] = [];

  if (update.action === 'new_tracker') {
    lines.push(`🆕 <b>NEW TRACKER: ${escapeHtml(title)}</b>`);
  } else {
    lines.push(`🔴 <b>BREAKING: ${escapeHtml(title)}</b>`);
  }

  lines.push('');

  if (description) {
    lines.push(escapeHtml(description));
    lines.push('');
  }

  if (kpiLine) {
    lines.push(escapeHtml(kpiLine));
  }

  lines.push(`🔗 <a href="${link}">Read more on Watchboard</a>`);
  lines.push('');
  lines.push(hashtags);

  let message = lines.join('\n');

  // Truncate if over limit (HTML-aware to avoid splitting tags)
  message = truncateHtmlMessage(message, MAX_MESSAGE_LENGTH);

  return message;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[telegram] Starting Telegram channel notification...');

  // Verify env
  try {
    getBotToken();
    getChannelId();
  } catch (err) {
    console.error('[telegram]', (err as Error).message);
    process.exit(1);
  }

  // Load manifest
  if (!existsSync(PATHS.manifest)) {
    console.log('[telegram] No manifest found — nothing to post');
    return;
  }

  const manifest: HourlyManifest = JSON.parse(
    readFileSync(PATHS.manifest, 'utf8'),
  );

  if (!manifest.updates || manifest.updates.length === 0) {
    console.log('[telegram] Manifest has no updates — nothing to post');
    return;
  }

  // Load sent log for deduplication
  const sentLog = loadSentLog();
  const sentKeys = new Set(sentLog.entries.map((e) => e.key));

  // Filter to only new updates
  const newUpdates = manifest.updates.filter(
    (u) => !sentKeys.has(makeEntryKey(u)),
  );

  if (newUpdates.length === 0) {
    console.log('[telegram] All manifest entries already sent — nothing new');
    return;
  }

  // Apply daily cap
  const today = new Date().toISOString().slice(0, 10);
  const sentToday = sentLog.entries.filter((e) =>
    e.sentAt.startsWith(today),
  ).length;

  const remaining = Math.max(0, DAILY_CAP - sentToday);
  if (remaining === 0) {
    console.log(
      `[telegram] Daily cap reached (${DAILY_CAP}) — skipping`,
    );
    return;
  }

  const toSend = newUpdates.slice(0, remaining);
  console.log(
    `[telegram] Sending ${toSend.length} new update(s) (${sentToday} already sent today)`,
  );

  let sentCount = 0;

  for (const update of toSend) {
    const slug = update.tracker;
    const config = loadTrackerConfig(slug);
    const meta = loadTrackerMeta(slug);
    const kpis = loadTrackerKpis(slug);
    const digests = loadTrackerDigests(slug);
    const thumbnail = getTrackerThumbnail(slug);

    const message = formatTelegramMessage(update, config, meta, kpis, digests);

    console.log(`[telegram] Posting for ${slug}...`);
    const messageId = await sendTelegramMessage(message, thumbnail ?? undefined);

    sentLog.entries.push({
      key: makeEntryKey(update),
      telegramMessageId: messageId,
      sentAt: new Date().toISOString(),
    });

    if (messageId) {
      sentCount++;
      console.log(
        `[telegram] ✓ Sent for ${slug} (message_id: ${messageId})`,
      );
    } else {
      console.warn(`[telegram] ✗ Failed to send for ${slug}`);
    }

    // Small delay between messages to avoid rate limiting
    if (toSend.indexOf(update) < toSend.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Save sent log
  saveSentLog(sentLog);

  console.log(
    `[telegram] Done — ${sentCount}/${toSend.length} messages sent successfully`,
  );
}

main().catch((err) => {
  console.error('[telegram] Fatal error:', err);
  process.exit(1);
});
