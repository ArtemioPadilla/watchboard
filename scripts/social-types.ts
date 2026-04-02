/**
 * Shared types and utilities for the Social Command Center pipeline.
 */
import fs from 'fs';
import path from 'path';

// ── Types ──

export type TweetType = 'digest' | 'breaking' | 'hot_take' | 'thread' | 'data_viz' | 'meme';
export type Voice = 'analyst' | 'journalist' | 'edgy' | 'witty';
export type Verdict = 'PUBLISH' | 'REVIEW' | 'HOLD' | 'KILL';
export type FactCheckStatus = 'verified' | 'warning' | 'unverifiable' | 'failed';
export type QueueStatus = 'auto_approved' | 'pending_review' | 'held' | 'approved' | 'rejected' | 'posted';

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

// ── Loaders ──

export function loadConfig(): SocialConfig {
  return JSON.parse(fs.readFileSync(PATHS.config, 'utf8'));
}

export function loadBudget(): BudgetData {
  const budget: BudgetData = JSON.parse(fs.readFileSync(PATHS.budget, 'utf8'));
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (budget.currentMonth !== currentMonth) {
    budget.currentMonth = currentMonth;
    budget.spent = 0;
    budget.tweetsPosted = 0;
    budget.remaining = budget.monthlyTarget;
    saveBudget(budget);
  }
  return budget;
}

export function saveBudget(budget: BudgetData): void {
  fs.writeFileSync(PATHS.budget, JSON.stringify(budget, null, 2), 'utf8');
}

export function loadHistory(): HistoryEntry[] {
  if (!fs.existsSync(PATHS.history)) return [];
  return JSON.parse(fs.readFileSync(PATHS.history, 'utf8'));
}

export function saveHistory(history: HistoryEntry[]): void {
  fs.writeFileSync(PATHS.history, JSON.stringify(history, null, 2), 'utf8');
}

export function loadQueue(date: string): QueueEntry[] {
  const queuePath = path.join(PATHS.socialDir, `queue-${date}.json`);
  if (!fs.existsSync(queuePath)) return [];
  return JSON.parse(fs.readFileSync(queuePath, 'utf8'));
}

export function saveQueue(date: string, queue: QueueEntry[]): void {
  fs.mkdirSync(PATHS.socialDir, { recursive: true });
  const queuePath = path.join(PATHS.socialDir, `queue-${date}.json`);
  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2), 'utf8');
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
