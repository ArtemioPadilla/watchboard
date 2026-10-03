#!/usr/bin/env tsx
/**
 * Post the daily video to the public Telegram channel at most once.
 *
 *   npx tsx scripts/telegram-video-post.ts <video> --record <path> [--caption-file <path>]
 *
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID. Exit 0 on skipped / sent /
 * unknown, 1 on rejected (4xx: nothing went public, a re-run is safe).
 * An unknown outcome (timeout, network, 5xx) is recorded as posted and never
 * retried; a one-line notice goes to the PRIVATE ops chat via
 * scripts/ci/ops-alert.sh (TELEGRAM_ALERT_CHAT_ID, never the public channel).
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { postVideoOnce } from './lib/telegram-video.js';

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const video = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const recordPath = flag('--record');
const captionFile = flag('--caption-file');
const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
const chatId = process.env.TELEGRAM_CHANNEL_ID ?? '';
if (!token || !chatId) { console.log('Telegram secrets not configured — skipping'); process.exit(0); }
if (!video || !recordPath) { console.error('usage: telegram-video-post.ts <video> --record <path> [--caption-file <path>]'); process.exit(1); }
if (!existsSync(video)) { console.log(`No video file at ${video} — skipping Telegram`); process.exit(0); }

const date = new Date().toISOString().slice(0, 10);
const caption = captionFile && existsSync(captionFile)
  ? readFileSync(captionFile, 'utf8')
  : `Watchboard Daily Brief — ${date}\n\nwatchboard.dev\n\n#Watchboard`;

const r = await postVideoOnce({ recordPath, date, videoPath: video, caption, chatId, token });
if (r === 'skipped') console.log(`Telegram: already posted per ${recordPath} — skipping`);
if (r === 'sent') console.log('✅ Video posted to Telegram');
if (r === 'unknown') {
  console.log('::warning::Telegram video post outcome unknown — recorded as posted to avoid a duplicate; check the channel');
  spawnSync('bash', ['scripts/ci/ops-alert.sh',
    `⚠️ Daily video Telegram post outcome unknown (timeout/network/5xx) — recorded in ${recordPath} and NOT retried. Check the channel.`],
  { stdio: 'inherit' });
}
if (r === 'rejected') { console.log('::error::Telegram rejected the video post'); process.exit(1); }
