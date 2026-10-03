#!/usr/bin/env tsx
/**
 * Post the daily video to the public Telegram channel at most once.
 *
 *   npx tsx scripts/telegram-video-post.ts <video> --record <path> [--caption-file <path>]
 *
 * Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID. Exit codes (see
 * runTelegramVideoPost in lib/telegram-video.ts):
 *   0  skipped / sent / unknown
 *   1  rejected ONLY (4xx: nothing went public, a re-run is safe)
 *   2  anything else: usage error, corrupt record, a throw after a confirmed
 *      send. The video MAY be public: do not re-run.
 * An unknown outcome (timeout, network, 5xx) is recorded as posted and never
 * retried; a one-line notice goes to the PRIVATE ops chat via
 * scripts/ci/ops-alert.sh (TELEGRAM_ALERT_CHAT_ID, never the public channel).
 */
import { spawnSync } from 'node:child_process';
import { runTelegramVideoPost, EXIT_MAY_BE_PUBLIC } from './lib/telegram-video.js';

const alert = (msg: string) => { spawnSync('bash', ['scripts/ci/ops-alert.sh', msg], { stdio: 'inherit' }); };

let code: number;
try {
  code = await runTelegramVideoPost(process.argv.slice(2), process.env, { alert });
} catch (err) {
  // runTelegramVideoPost catches its own throws; this is the last line of
  // defence so an unexpected crash never surfaces as exit 1 ("rejected").
  console.log(`::error::DO NOT RE-RUN — telegram-video-post crashed: ${String(err)}`);
  code = EXIT_MAY_BE_PUBLIC;
}
process.exit(code);
