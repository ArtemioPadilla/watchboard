#!/usr/bin/env tsx
/**
 * notify-social-proposals.ts — announce queue entries waiting for a human in
 * the PRIVATE ops chat, and never anywhere else.
 *
 * X posting is enabled but `post-social-queue.ts` sends only what a human
 * approved in /social/. Nothing ever told anyone there was something to
 * approve, so the measured output to X was zero a day while 1–5 proposals a
 * day sat in the queue. This closes that loop.
 *
 * Usage:
 *   npx tsx scripts/notify-social-proposals.ts                      # today's queue
 *   npx tsx scripts/notify-social-proposals.ts --queue <path>       # a specific file
 *   npx tsx scripts/notify-social-proposals.ts --dry-run            # print, send nothing, record nothing
 *   npx tsx scripts/notify-social-proposals.ts --api-base <url>     # test seam (see below)
 *
 * Exit 0 when there was nothing to say, when it sent, and when the credentials
 * are absent (a missing secret is a warning here, as everywhere in this repo).
 * Exit 1 only when a send was attempted and failed, or the public-channel
 * guard tripped.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadConfig, loadQueue, todayDateString, PATHS } from './social-types.js';
import type { QueueEntry } from './social-types.js';
import {
  EMPTY_STATE,
  composeProposalMessage,
  markNotified,
  pruneNotified,
  resolveAlertTarget,
  selectProposals,
  type NotifiedState,
} from './lib/social-proposals.js';

/**
 * `--api-base` is a test seam, deliberately a CLI argument and not an env var:
 * scripts/list-env-vars.ts embeds every `process.env.*` it finds into the
 * self-hosting guide, and internal plumbing does not belong in a document
 * aimed at someone running their own copy.
 */
const DEFAULT_TELEGRAM_API = 'https://api.telegram.org';
const STATE_PATH = `${PATHS.socialDir}/notified-proposals.json`;
/** PATHS.socialDir is absolute; a link into the repo needs the relative form. */
const SOCIAL_DIR_REL = 'public/_social';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readState(): NotifiedState {
  if (!existsSync(STATE_PATH)) return EMPTY_STATE;
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as Partial<NotifiedState>;
    return { notified: parsed.notified ?? {} };
  } catch {
    // A corrupt state file must not silence the notifier; the worst case of
    // starting empty is one duplicate message.
    console.warn(`[notify] ${STATE_PATH} is not readable JSON — starting from empty`);
    return EMPTY_STATE;
  }
}

async function send(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const target = resolveAlertTarget({
    botToken: token,
    alertChatId: process.env.TELEGRAM_ALERT_CHAT_ID,
    channelId: process.env.TELEGRAM_CHANNEL_ID,
  });
  if (target.kind === 'skip') {
    console.log(`::warning::notify-social-proposals: ${target.reason} — nothing sent`);
    return false;
  }
  if (target.kind === 'refuse') {
    console.error(`::error::notify-social-proposals: ${target.reason}`);
    process.exit(1);
  }
  const chat = target.chatId;
  const apiBase = arg('--api-base') ?? DEFAULT_TELEGRAM_API;
  const res = await fetch(`${apiBase}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
  });
  if (!res.ok) {
    console.error(`::error::notify-social-proposals: Telegram ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return false;
  }
  return true;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const queuePath = arg('--queue');
  const config = loadConfig();

  let queue: QueueEntry[];
  let queueFile: string;
  if (queuePath) {
    if (!existsSync(queuePath)) {
      console.log(`[notify] no queue at ${queuePath}`);
      return;
    }
    queue = JSON.parse(readFileSync(queuePath, 'utf8')) as QueueEntry[];
    queueFile = queuePath.replace(`${process.cwd()}/`, '');
  } else {
    const today = todayDateString();
    queue = loadQueue(today);
    queueFile = `${SOCIAL_DIR_REL}/queue-${today}.json`;
  }

  if (queue.length === 0) {
    console.log(`[notify] ${queueFile} is empty or absent — nothing to announce`);
    return;
  }

  const state = readState();
  const proposals = selectProposals(queue, state);
  console.log(`[notify] ${queue.length} in queue, ${proposals.length} new proposal(s) waiting for a human`);
  if (proposals.length === 0) return;

  const text = composeProposalMessage(proposals, {
    baseUrl: config.baseUrl.replace(/\/$/, ''),
    repo: process.env.GITHUB_REPOSITORY,
    queueFile,
  });

  if (dryRun) {
    console.log(`\n--- would send (${text.length} chars) ---\n${text}\n--- end ---`);
    return;
  }

  const sent = await send(text);
  if (!sent) {
    // Deliberately do NOT record these ids. An unsent announcement that is
    // marked as sent is this repo's signature defect: the step goes green and
    // the proposals are never mentioned again. Leaving them unrecorded means
    // the next run (the 4x/day poster) tries again.
    console.log('[notify] not recorded, so the next run will try these again');
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ALERT_CHAT_ID) process.exit(1);
    return;
  }

  const now = new Date();
  const next = pruneNotified(markNotified(state, proposals.map((p) => p.id), now), now);
  writeFileSync(STATE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`[notify] announced ${proposals.length} proposal(s); recorded in ${STATE_PATH}`);
}

main().catch((err) => {
  console.error(`::error::notify-social-proposals: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
