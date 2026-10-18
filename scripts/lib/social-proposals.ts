/**
 * social-proposals.ts — tell the private ops chat which queue entries are
 * waiting for a human, and say enough about each one to decide without
 * opening anything.
 *
 * Why this exists: X posting is on (`X_POSTING_ENABLED=true`) but
 * `post-social-queue.ts` only sends entries a human approved in /social/, and
 * across 49 queue files there has never been one. Measured over the last 14
 * days: 0 posts a day would reach X, while 1–5 proposals a day sat in
 * `pending_review` with nothing telling anyone they were there. A queue nobody
 * is told about is the same as no queue.
 *
 * Pure: the message is composed from data, the sending and the state live in
 * scripts/notify-social-proposals.ts.
 */
import type { QueueEntry, QueueStatus } from '../social-types.js';

/** Statuses that are waiting on a person, with how to say so. */
const WAITING: Partial<Record<QueueStatus, string>> = {
  pending_review: 'needs review',
  held: 'held by the judge',
};

export interface NotifiedState {
  /** Entry id → ISO timestamp it was announced. */
  notified: Record<string, string>;
}

export const EMPTY_STATE: NotifiedState = { notified: {} };

/**
 * Entries waiting on a person that have not been announced yet.
 *
 * Order is the queue's own, so the message reads in publish order rather than
 * in whatever order the model emitted.
 */
export function selectProposals(queue: readonly QueueEntry[], state: NotifiedState): QueueEntry[] {
  return queue.filter((e) => WAITING[e.status] !== undefined && !state.notified[e.id]);
}

export function waitingLabel(status: QueueStatus): string {
  return WAITING[status] ?? status;
}

/** Record ids as announced. Returns a new state; never drops existing ids. */
export function markNotified(state: NotifiedState, ids: readonly string[], at: Date): NotifiedState {
  const notified = { ...state.notified };
  for (const id of ids) notified[id] = at.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return { notified };
}

/**
 * Forget ids older than `days` so the file cannot grow without bound. An entry
 * that old is long expired, so re-announcing it is not a risk.
 */
export function pruneNotified(state: NotifiedState, now: Date, days = 30): NotifiedState {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  const notified: Record<string, string> = {};
  for (const [id, at] of Object.entries(state.notified)) {
    const t = new Date(at).getTime();
    if (Number.isNaN(t) || t >= cutoff) notified[id] = at;
  }
  return { notified };
}

/**
 * Where an announcement may go.
 *
 * `refuse` exists because these messages carry internal drafts, judge comments
 * and rejected copy, and TELEGRAM_CHANNEL_ID is a public channel with outside
 * subscribers. The same equality guard is in ops-alert.sh and push-state.sh;
 * it is in the pure module here so a test can hold it.
 */
export type AlertTarget =
  | { kind: 'send'; chatId: string }
  | { kind: 'skip'; reason: string }
  | { kind: 'refuse'; reason: string };

export function resolveAlertTarget(env: {
  botToken?: string;
  alertChatId?: string;
  channelId?: string;
}): AlertTarget {
  if (!env.botToken || !env.alertChatId) {
    return { kind: 'skip', reason: 'TELEGRAM_BOT_TOKEN / TELEGRAM_ALERT_CHAT_ID not set' };
  }
  if (env.alertChatId === env.channelId) {
    return {
      kind: 'refuse',
      reason: 'TELEGRAM_ALERT_CHAT_ID equals TELEGRAM_CHANNEL_ID — refusing to post internal proposals to the public channel',
    };
  }
  return { kind: 'send', chatId: env.alertChatId };
}

export interface MessageOptions {
  /** Site root, from social-config.json (`baseUrl`). */
  baseUrl: string;
  /** Repo slug for the queue-file link, e.g. `ArtemioPadilla/watchboard`. */
  repo?: string;
  /** The queue file these came from, for the raw link. */
  queueFile?: string;
  /** Telegram rejects a sendMessage body over 4096 characters. */
  maxChars?: number;
}

export const TELEGRAM_MAX_CHARS = 4096;
const TEXT_PREVIEW = 220;

function preview(text: string, max = TEXT_PREVIEW): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

function factCheckSummary(entry: QueueEntry): string | null {
  const checks = entry.judge?.factChecks ?? [];
  if (checks.length === 0) return null;
  const counts = new Map<string, number>();
  for (const c of checks) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
  return [...counts.entries()].map(([status, n]) => `${n} ${status}`).join(', ');
}

/** One proposal, as plain text. */
export function describeProposal(entry: QueueEntry, index: number, opts: MessageOptions): string {
  const lines: string[] = [];
  const judge = entry.judge;
  const head = [
    `${index}. ${entry.type} · ${entry.tracker} · ${entry.lang}`,
    judge ? `judge ${judge.score.toFixed(2)} ${judge.verdict}` : 'no judge assessment',
    waitingLabel(entry.status),
  ].join(' · ');
  lines.push(head);
  lines.push(`   “${preview(entry.text)}”`);
  if (entry.threadTweets && entry.threadTweets.length > 0) {
    lines.push(`   thread, ${entry.threadTweets.length + 1} parts`);
  }
  if (judge?.comment) lines.push(`   judge: ${preview(judge.comment, 180)}`);
  const facts = factCheckSummary(entry);
  if (facts) lines.push(`   fact checks: ${facts}`);
  if (entry.image || entry.memegenUrl) lines.push('   has an image');
  lines.push(`   slot ${entry.publishAt}`);
  lines.push(`   ${opts.baseUrl}/${entry.tracker}/`);
  return lines.join('\n');
}

/**
 * The whole message. Plain text on purpose: a tweet containing `<` or `&`
 * would make Telegram reject an HTML-parsed body, and a lost alert is worse
 * than an unstyled one. Telegram links bare URLs by itself.
 *
 * Over the character limit it drops whole proposals and says how many, rather
 * than truncating mid-proposal into something that reads like the whole thing.
 */
export function composeProposalMessage(proposals: readonly QueueEntry[], opts: MessageOptions): string {
  if (proposals.length === 0) return '';
  const max = opts.maxChars ?? TELEGRAM_MAX_CHARS;
  const n = proposals.length;
  const header = `📝 ${n} social ${n === 1 ? 'proposal' : 'proposals'} waiting for you`;
  const why = 'X posts only what a human approves in /social/, so these go nowhere until you decide.';
  const footer: string[] = [`Approve or reject: ${opts.baseUrl}/social/`];
  if (opts.repo && opts.queueFile) {
    footer.push(`Queue file: https://github.com/${opts.repo}/blob/main/${opts.queueFile}`);
  }

  const fixed = `${header}\n${why}\n\n`;
  const tail = `\n\n${footer.join('\n')}`;
  const bodies: string[] = [];
  let used = fixed.length + tail.length;

  for (const [i, entry] of proposals.entries()) {
    const body = describeProposal(entry, i + 1, opts);
    const dropped = n - bodies.length;
    // Keep room for the "+N more" line we would have to add if this is the last
    // one that fits, so adding it can never push the message over the limit.
    const roomNeeded = body.length + 2 + `\n… and ${dropped} more in /social/`.length;
    if (used + roomNeeded > max && bodies.length > 0) break;
    bodies.push(body);
    used += body.length + 2;
  }

  const omitted = n - bodies.length;
  const more = omitted > 0 ? `\n… and ${omitted} more in /social/` : '';
  return `${fixed}${bodies.join('\n\n')}${more}${tail}`;
}
