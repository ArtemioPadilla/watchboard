import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';

export interface PostedEntry { url: string; postedAt: string; uncertain?: true }
export interface VideoRecordLike { date: string; posted: Record<string, PostedEntry>; [k: string]: unknown }

export type TelegramOutcome =
  | { status: 'sent'; messageId: number }
  | { status: 'rejected'; httpStatus: number }
  | { status: 'unknown'; reason: string };

/**
 * Tri-state reading of a Telegram Bot API reply.
 *  - `sent`: 2xx, `ok: true` and a numeric `result.message_id`.
 *  - `rejected`: 4xx — Telegram refused it, nothing was published.
 *  - `unknown`: anything else (5xx, 2xx without a confirmed id). It may be
 *    public, so the caller must never retry it (owner ruling Q7).
 *
 * Local to the daily video for now: the shared `telegram-send-loop.ts` from
 * plan Task 3 is held on owner question Q6.
 */
export function classifyTelegramResponse(httpStatus: number, body: unknown): TelegramOutcome {
  if (httpStatus >= 400 && httpStatus < 500) return { status: 'rejected', httpStatus };
  if (httpStatus >= 200 && httpStatus < 300) {
    const b = body as { ok?: unknown; result?: { message_id?: unknown } } | null;
    const id = b?.result?.message_id;
    if (b?.ok === true && typeof id === 'number') return { status: 'sent', messageId: id };
    return { status: 'unknown', reason: `HTTP ${httpStatus} without ok:true and a message_id` };
  }
  return { status: 'unknown', reason: `HTTP ${httpStatus}` };
}

const defaultLoad = (p: string): VideoRecordLike | null => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
const defaultSave = (p: string, r: VideoRecordLike) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(r, null, 2), 'utf8');
};

/**
 * Posts the daily video to the public channel at most once per record (the
 * same `public/_social/video-post-*.json` file post-video-social.ts uses for
 * Bluesky). A `sent` or `unknown` outcome is written to `posted.telegram`
 * before returning, so a re-run skips; only a `rejected` post (never public)
 * stays unrecorded and may be retried.
 */
export async function postVideoOnce(deps: {
  recordPath: string; date: string; videoPath: string; caption: string; chatId: string; token: string;
  fetchFn?: typeof fetch; readFile?: (p: string) => Buffer; now?: () => Date;
  loadRecord?: (p: string) => VideoRecordLike | null; saveRecord?: (p: string, r: VideoRecordLike) => void;
}): Promise<'skipped' | 'sent' | 'rejected' | 'unknown'> {
  const {
    recordPath, date, videoPath, caption, chatId, token,
    fetchFn = fetch, readFile = (p: string) => readFileSync(p), now = () => new Date(),
    loadRecord = defaultLoad, saveRecord = defaultSave,
  } = deps;
  const record: VideoRecordLike = loadRecord(recordPath) ?? { date, posted: {} };
  record.posted ??= {};
  if (record.posted.telegram) return 'skipped';

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  form.append('supports_streaming', 'true');
  form.append('video', new Blob([new Uint8Array(readFile(videoPath))]), basename(videoPath));

  let outcome: TelegramOutcome;
  try {
    const res = await fetchFn(`https://api.telegram.org/bot${token}/sendVideo`, { method: 'POST', body: form });
    outcome = classifyTelegramResponse(res.status, await res.json().catch(() => null));
  } catch (err) {
    outcome = { status: 'unknown', reason: String(err) };
  }
  if (outcome.status === 'rejected') return 'rejected';
  record.posted.telegram = outcome.status === 'sent'
    ? { url: `telegram:message/${outcome.messageId}`, postedAt: now().toISOString() }
    : { url: 'telegram:unknown', postedAt: now().toISOString(), uncertain: true };
  saveRecord(recordPath, record);
  return outcome.status;
}

/**
 * Exit codes of scripts/telegram-video-post.ts. The daily-video gate reads
 * them to decide what to tell the operator, so they must stay distinct:
 *  - 0: skipped / sent / unknown (recorded, never retried)
 *  - 1: REJECTED only (Telegram returned 4xx: nothing went public)
 *  - 2: anything else (usage error, corrupt record, saveRecord throwing after
 *       a confirmed send...). The video MAY be public: do not re-run.
 */
export const EXIT_OK = 0;
export const EXIT_REJECTED = 1;
export const EXIT_MAY_BE_PUBLIC = 2;

export async function runTelegramVideoPost(
  args: string[],
  env: Record<string, string | undefined>,
  deps: {
    post?: typeof postVideoOnce;
    fileExists?: (p: string) => boolean;
    readText?: (p: string) => string;
    /** One line to the PRIVATE ops chat (scripts/ci/ops-alert.sh). */
    alert?: (msg: string) => void;
    log?: (msg: string) => void;
    today?: () => string;
  } = {},
): Promise<number> {
  const {
    post = postVideoOnce, fileExists = existsSync, readText = (p: string) => readFileSync(p, 'utf8'),
    alert = () => {}, log = console.log, today = () => new Date().toISOString().slice(0, 10),
  } = deps;
  const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const video = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
  const recordPath = flag('--record');
  const captionFile = flag('--caption-file');
  const token = env.TELEGRAM_BOT_TOKEN ?? '';
  const chatId = env.TELEGRAM_CHANNEL_ID ?? '';
  if (!token || !chatId) { log('Telegram secrets not configured — skipping'); return EXIT_OK; }
  if (!video || !recordPath) {
    log('::error::usage: telegram-video-post.ts <video> --record <path> [--caption-file <path>]');
    return EXIT_MAY_BE_PUBLIC;
  }
  if (!fileExists(video)) { log(`No video file at ${video} — skipping Telegram`); return EXIT_OK; }

  try {
    const date = today();
    const caption = captionFile && fileExists(captionFile)
      ? readText(captionFile)
      : `Watchboard Daily Brief — ${date}\n\nwatchboard.dev\n\n#Watchboard`;
    const r = await post({ recordPath, date, videoPath: video, caption, chatId, token });
    if (r === 'skipped') log(`Telegram: already posted per ${recordPath} — skipping`);
    if (r === 'sent') log('✅ Video posted to Telegram');
    if (r === 'unknown') {
      log('::warning::Telegram video post outcome unknown — recorded as posted to avoid a duplicate; check the channel');
      alert(`⚠️ Daily video Telegram post outcome unknown (timeout/network/5xx) — recorded in ${recordPath} and NOT retried. Check the channel.`);
    }
    if (r === 'rejected') { log('::error::Telegram rejected the video post'); return EXIT_REJECTED; }
    return EXIT_OK;
  } catch (err) {
    log(`::error::DO NOT RE-RUN — telegram-video-post failed (${String(err)}); the video may already be public on Telegram and ${recordPath} may not record it`);
    alert(`⚠️ Daily video Telegram step crashed (${String(err)}) — it may be public but unrecorded in ${recordPath}. Do NOT re-run; check the channel.`);
    return EXIT_MAY_BE_PUBLIC;
  }
}
