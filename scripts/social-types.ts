/**
 * Shared types and utilities for the Social Command Center pipeline.
 */
import fs from 'fs';
import path from 'path';

// ── Types ──

/**
 * Tweet types.
 *
 * `hot_take` and `meme` were removed after the account was suspended for
 * "inauthentic behavior". Both generated provocative or comedic content at
 * volume, which is the pattern anti-spam systems look for, and neither drew on
 * anything a competitor could not reproduce with a prompt.
 *
 * The four types that replaced them can only be written by something that has
 * actually tracked the data: 2,299 recorded contested claims across 110
 * trackers, 685 casualty figures flagged as disputed, and a 14-day escalation
 * baseline per tracker. That is the differentiator — what the account knows,
 * not how many personas it performs.
 */
export type TweetType =
  | 'digest'
  | 'breaking'
  | 'thread'
  | 'data_viz'
  | 'contested'      // two sourced sides of a disputed figure
  | 'stale_data'     // an official number frozen while reality moved
  | 'escalation'     // a tracker spiking above its own baseline
  | 'cross_tracker'; // a pattern only visible across many trackers

/**
 * One voice.
 *
 * A single automated account rotating through analyst / journalist / edgy /
 * witty produces the appearance of several people writing, which is close to
 * what X's authenticity policy describes. Authority here comes from the data,
 * not from the register.
 */
export type Voice = 'analyst';
export type Verdict = 'PUBLISH' | 'REVIEW' | 'HOLD' | 'KILL';
export type FactCheckStatus = 'verified' | 'warning' | 'unverifiable' | 'failed';
export type QueueStatus = 'auto_approved' | 'pending_review' | 'held' | 'approved' | 'rejected' | 'posted' | 'expired';

export interface FactCheck {
  claim: string;
  status: FactCheckStatus;
  source: string;
}

export interface JudgeAssessment {
  score: number;
  verdict: Verdict;
  comment: string;
  factChecks: FactCheck[];
}

export interface QueueEntry {
  id: string;
  type: TweetType;
  voice: Voice;
  tracker: string;
  lang: string;
  text: string;
  hashtags: string[];
  link: string;
  image: string | null;
  memegenUrl: string | null;
  publishAt: string;
  status: QueueStatus;
  estimatedCost: number;
  judge: JudgeAssessment;
  threadTweets: string[] | null;
  tweetId: string | null;
  postedAt: string | null;
}

export interface BudgetData {
  monthlyTarget: number;
  currentMonth: string;
  spent: number;
  tweetsPosted: number;
  remaining: number;
}

export interface HistoryEntry {
  tweetId: string;
  date: string;
  tracker: string;
  type: TweetType;
  voice: Voice;
  lang: string;
  text: string;
  cost: number;
  utmClicks: number;
  publishedAt: string;
}

export interface SocialConfig {
  baseUrl: string;
  handle: string;
  budget: { monthlyTarget: number; currency: string };
  apiCosts: { contentCreate: number; mediaCreate: number };
  scheduling: { slots: string[]; timezone: string };
  judge: { autoApproveThreshold: number; reviewThreshold: number; memesAlwaysReview: boolean };
  hashtags: { brandTag: string; maxPerTweet: number; threadsLastOnly: boolean; memesNone: boolean };
  languages: string[];
  tweetTypes: TweetType[];
}

// ── Paths ──

const ROOT = process.cwd();
export const PATHS = {
  config: path.join(ROOT, 'social-config.json'),
  budget: path.join(ROOT, 'public', '_social', 'budget.json'),
  history: path.join(ROOT, 'public', '_social', 'history.json'),
  socialDir: path.join(ROOT, 'public', '_social'),
  trackersDir: path.join(ROOT, 'trackers'),
};

// ── Atomic writes ──

/**
 * Atomic write: write to a temp file then rename (rename is atomic on POSIX).
 * Prevents corrupted/truncated JSON if the process is killed mid-write
 * (e.g. a CI runner SIGTERM).
 */
export function atomicWriteFile(filePath: string, content: string): void {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

// ── Loaders ──

export function loadConfig(): SocialConfig {
  return JSON.parse(fs.readFileSync(PATHS.config, 'utf8'));
}

export function loadBudget({ autoSave = true } = {}): BudgetData {
  const budget: BudgetData = JSON.parse(fs.readFileSync(PATHS.budget, 'utf8'));
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (budget.currentMonth !== currentMonth) {
    // Only reset when monthlyTarget is a sane positive number — a malformed
    // budget file would otherwise wipe spend tracking and set remaining=NaN.
    if (typeof budget.monthlyTarget === 'number' && Number.isFinite(budget.monthlyTarget) && budget.monthlyTarget > 0) {
      console.warn(
        `[social] ⚠️  MONTHLY BUDGET RESET: ${budget.currentMonth} → ${currentMonth} ` +
        `(spent $${Number(budget.spent ?? 0).toFixed(2)} / ${budget.tweetsPosted ?? 0} tweets last month; ` +
        `remaining reset to $${budget.monthlyTarget.toFixed(2)})`,
      );
      budget.currentMonth = currentMonth;
      budget.spent = 0;
      budget.tweetsPosted = 0;
      budget.remaining = budget.monthlyTarget;
      if (autoSave) saveBudget(budget);
    } else {
      console.warn(
        `[social] ⚠️  Month rolled over (${budget.currentMonth} → ${currentMonth}) but monthlyTarget ` +
        `is invalid (${JSON.stringify(budget.monthlyTarget)}) — SKIPPING budget reset. Fix public/_social/budget.json.`,
      );
    }
  }
  return budget;
}

export function saveBudget(budget: BudgetData): void {
  atomicWriteFile(PATHS.budget, JSON.stringify(budget, null, 2));
}

export function loadHistory(): HistoryEntry[] {
  if (!fs.existsSync(PATHS.history)) return [];
  return JSON.parse(fs.readFileSync(PATHS.history, 'utf8'));
}

export function saveHistory(history: HistoryEntry[]): void {
  atomicWriteFile(PATHS.history, JSON.stringify(history, null, 2));
}

export function loadQueue(date: string): QueueEntry[] {
  const queuePath = path.join(PATHS.socialDir, `queue-${date}.json`);
  if (!fs.existsSync(queuePath)) return [];
  return JSON.parse(fs.readFileSync(queuePath, 'utf8'));
}

export function saveQueue(date: string, queue: QueueEntry[]): void {
  fs.mkdirSync(PATHS.socialDir, { recursive: true });
  const queuePath = path.join(PATHS.socialDir, `queue-${date}.json`);
  atomicWriteFile(queuePath, JSON.stringify(queue, null, 2));
}

// ── Character counting ──

const TCO_LINK_LENGTH = 23;
const URL_REGEX = /https?:\/\/\S+/g;

/**
 * Computes the character count X would use for a post.
 * X wraps every URL to t.co (23 chars), regardless of actual length.
 */
export function twitterWeightedLength(text: string): number {
  let length = text.length;
  const urls = text.match(URL_REGEX);
  if (urls) {
    for (const url of urls) {
      length += TCO_LINK_LENGTH - url.length;
    }
  }
  return length;
}

/**
 * Compute the estimated cost of a queue entry.
 */
export function estimateCost(entry: Pick<QueueEntry, 'image' | 'threadTweets'>, config: SocialConfig): number {
  const { contentCreate, mediaCreate } = config.apiCosts;
  if (entry.threadTweets) {
    const threadCost = entry.threadTweets.length * contentCreate;
    return entry.image ? threadCost + mediaCreate : threadCost;
  }
  return entry.image ? contentCreate + mediaCreate : contentCreate;
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}
