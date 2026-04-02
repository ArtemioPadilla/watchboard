# Social Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current truncate-and-post social pipeline with an AI-curated, budget-aware, multi-type, multi-language tweet system with a review dashboard at `/social/`.

**Architecture:** Config file (`social-config.json`) drives the system. A queue generator script reads tracker data + budget + history, calls the LLM to produce curated drafts with judge assessments, writes to `public/_social/queue-*.json`. A poster script reads the queue and posts due tweets via X API. A React island dashboard at `/social/` reads queue/budget/history from GitHub API for review and approval. All serverless — GitHub Actions is the scheduler, GitHub repo is the database.

**Tech Stack:** TypeScript scripts (Node), twitter-api-v2 (existing dep), satori + resvg (existing deps for stat card images), React island (existing pattern), GitHub Actions cron, memegen.link API (free, external).

**Spec:** `docs/superpowers/specs/2026-04-01-social-command-center-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `social-config.json` | All social system configuration (budget, scheduling, judge thresholds, hashtags, languages) |
| `public/_social/budget.json` | Monthly spend tracking, auto-reset on month boundary |
| `public/_social/history.json` | Archive of posted tweets with IDs, cost, UTM clicks |
| `scripts/generate-social-queue.ts` | Reads tracker data + budget + history, builds LLM prompt, parses response into queue JSON |
| `scripts/post-social-queue.ts` | Reads queue, posts due tweets via X API, updates budget + history |
| `scripts/generate-stat-card.ts` | Generates branded stat card PNGs for breaking/data-viz tweets (satori + resvg) |
| `src/pages/social.astro` | Astro page shell for the Social Command Center dashboard |
| `src/components/islands/SocialCommandCenter.tsx` | React island: queue viewer, X preview, judge panel, batch approve, budget meter (single file, same pattern as MetricsDashboard.tsx) |
| `.github/workflows/post-social-queue.yml` | Cron workflow: runs 4x/day, posts due tweets from queue |

### Modified Files
| File | Change |
|------|--------|
| `.github/workflows/update-data.yml` | Replace "Generate social drafts" + "Post to social media" steps with queue generation |
| `.github/workflows/weekly-digest.yml` | Adapt to write a `thread` entry into the queue instead of standalone file |
| `src/styles/global.css` | Add `@import './social-command-center.css'` |

### Deleted Files (after migration verified)
| File | Reason |
|------|--------|
| `scripts/generate-social-drafts.ts` | Replaced by `generate-social-queue.ts` |
| `scripts/post-social.ts` | Replaced by `post-social-queue.ts` |

---

## Phase 1: Configuration + Data Layer

### Task 1: Create social-config.json

**Files:**
- Create: `social-config.json`

- [ ] **Step 1: Create the config file**

```json
{
  "baseUrl": "https://watchboard.dev",
  "handle": "@watchboard",
  "budget": {
    "monthlyTarget": 1.00,
    "currency": "USD"
  },
  "apiCosts": {
    "contentCreate": 0.01,
    "mediaCreate": 0.01
  },
  "scheduling": {
    "slots": ["08:00", "13:00", "18:00", "22:00"],
    "timezone": "UTC"
  },
  "judge": {
    "autoApproveThreshold": 0.85,
    "reviewThreshold": 0.50,
    "memesAlwaysReview": true
  },
  "hashtags": {
    "brandTag": "#Watchboard",
    "maxPerTweet": 2,
    "threadsLastOnly": true,
    "memesNone": true
  },
  "languages": ["en", "es", "fr", "pt"],
  "tweetTypes": ["digest", "breaking", "hot_take", "thread", "data_viz", "meme"]
}
```

- [ ] **Step 2: Create initial budget.json**

Write to `public/_social/budget.json`:

```json
{
  "monthlyTarget": 1.00,
  "currentMonth": "2026-04",
  "spent": 0.00,
  "tweetsPosted": 0,
  "remaining": 1.00
}
```

- [ ] **Step 3: Create initial history.json**

Write to `public/_social/history.json`:

```json
[]
```

- [ ] **Step 4: Commit**

```bash
git add social-config.json public/_social/budget.json public/_social/history.json
git commit -m "feat(social): add social config, budget, and history seed files"
```

---

### Task 2: Social queue types and utilities

**Files:**
- Create: `scripts/social-types.ts`

This module defines all shared types and utility functions used by both the generator and poster scripts.

- [ ] **Step 1: Create the types + utilities file**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add scripts/social-types.ts
git commit -m "feat(social): add shared types and utilities for social pipeline"
```

---

## Phase 2: Queue Generator Script

### Task 3: Build the social queue generator

**Files:**
- Create: `scripts/generate-social-queue.ts`

This is the core script. It reads all tracker data, budget, and history, then builds a prompt for the LLM. In the GitHub Actions context it will be called by `claude-code-action`, so the script's job is to **prepare the context and write the prompt + output schema** — the actual LLM call happens via the workflow. For local/legacy use, it can also call the Anthropic API directly.

- [ ] **Step 1: Create the queue generator script**

```typescript
#!/usr/bin/env tsx
/**
 * generate-social-queue.ts
 *
 * Reads all tracker digests, budget, and history to produce a curated
 * social media queue for today. Writes to public/_social/queue-YYYY-MM-DD.json.
 *
 * In GitHub Actions: called by claude-code-action which handles the LLM call.
 * Locally: can use ANTHROPIC_API_KEY for direct API calls.
 *
 * Usage: npx tsx scripts/generate-social-queue.ts [--dry-run]
 */
import fs from 'fs';
import path from 'path';
import {
  loadConfig, loadBudget, loadHistory, saveQueue,
  todayDateString, twitterWeightedLength, estimateCost,
  PATHS,
  type QueueEntry, type SocialConfig, type BudgetData, type HistoryEntry,
} from './social-types.js';

// ── Tracker data collection ──

interface DigestEntry {
  date: string;
  title: string;
  summary: string;
  sectionsUpdated: string[];
}

interface TrackerContext {
  slug: string;
  name: string;
  shortName: string;
  domain: string;
  digest: DigestEntry | null;
  kpiSnapshot: string;
  recentEvents: string;
}

function collectTrackerContexts(today: string): TrackerContext[] {
  const slugs = fs.readdirSync(PATHS.trackersDir).filter(entry => {
    const configPath = path.join(PATHS.trackersDir, entry, 'tracker.json');
    return fs.existsSync(configPath);
  });

  const contexts: TrackerContext[] = [];

  for (const slug of slugs) {
    const configPath = path.join(PATHS.trackersDir, slug, 'tracker.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.status === 'draft') continue;

    // Load today's digest
    const digestPath = path.join(PATHS.trackersDir, slug, 'data', 'digests.json');
    let digest: DigestEntry | null = null;
    if (fs.existsSync(digestPath)) {
      const digests: DigestEntry[] = JSON.parse(fs.readFileSync(digestPath, 'utf8'));
      digest = digests.find(d => d.date === today) ?? null;
    }

    // KPI snapshot (compact summary)
    const kpiPath = path.join(PATHS.trackersDir, slug, 'data', 'kpis.json');
    let kpiSnapshot = '';
    if (fs.existsSync(kpiPath)) {
      try {
        const kpis = JSON.parse(fs.readFileSync(kpiPath, 'utf8'));
        kpiSnapshot = kpis
          .slice(0, 6)
          .map((k: { label: string; value: string }) => `${k.label}: ${k.value}`)
          .join('; ');
      } catch { /* skip */ }
    }

    // Recent events (last 3 days)
    const eventsDir = path.join(PATHS.trackersDir, slug, 'data', 'events');
    let recentEvents = '';
    if (fs.existsSync(eventsDir)) {
      const eventFiles = fs.readdirSync(eventsDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .slice(-3);
      const events: string[] = [];
      for (const file of eventFiles) {
        try {
          const dayEvents = JSON.parse(fs.readFileSync(path.join(eventsDir, file), 'utf8'));
          for (const evt of dayEvents.slice(0, 3)) {
            events.push(`[${file.replace('.json', '')}] ${evt.title || evt.headline || ''}`);
          }
        } catch { /* skip */ }
      }
      recentEvents = events.join('\n');
    }

    contexts.push({
      slug,
      name: config.name,
      shortName: config.shortName ?? config.name,
      domain: config.domain ?? 'general',
      digest,
      kpiSnapshot,
      recentEvents,
    });
  }

  return contexts;
}

// ── Prompt builder ──

function buildPrompt(
  contexts: TrackerContext[],
  budget: BudgetData,
  history: HistoryEntry[],
  config: SocialConfig,
  today: string,
): string {
  const trackersWithDigests = contexts.filter(c => c.digest);
  const recentHistory = history.slice(-50);
  const recentByTracker: Record<string, number> = {};
  for (const h of recentHistory.filter(h => h.date >= today.slice(0, 8))) {
    recentByTracker[h.tracker] = (recentByTracker[h.tracker] ?? 0) + 1;
  }

  // Performance summary from history
  const topPerformers = [...recentHistory]
    .filter(h => h.utmClicks > 0)
    .sort((a, b) => b.utmClicks - a.utmClicks)
    .slice(0, 10);

  const performanceSummary = topPerformers.length > 0
    ? topPerformers.map(h => `- ${h.type}/${h.voice} on ${h.tracker}: ${h.utmClicks} clicks`).join('\n')
    : 'No performance data yet. Prioritize variety and coverage.';

  return `You are the Social Media Content Strategist for Watchboard, an AI-powered OSINT intelligence dashboard platform at ${config.baseUrl}.

Your X/Twitter handle is ${config.handle}.

TODAY: ${today}

## YOUR TASK
Review all tracker updates below and decide what is WORTH tweeting today. You are a curator, not a factory. Quality over volume. Every tweet costs real money.

## BUDGET
- Monthly target: $${budget.monthlyTarget.toFixed(2)}
- Spent this month: $${budget.spent.toFixed(2)}
- Remaining: $${budget.remaining.toFixed(2)}
- Tweets posted this month: ${budget.tweetsPosted}
- Cost per text tweet: $${config.apiCosts.contentCreate}
- Cost per image tweet: $${config.apiCosts.contentCreate + config.apiCosts.mediaCreate}
- Cost per thread tweet: $${config.apiCosts.contentCreate} × number of tweets in thread
- PRIORITIZE impact-per-dollar. If budget is tight, post fewer but better tweets.

## ALREADY POSTED (avoid duplication)
${Object.entries(recentByTracker).map(([t, n]) => `- ${t}: ${n} tweet(s) today`).join('\n') || 'Nothing posted today yet.'}

## HISTORIC PERFORMANCE (what gets clicks)
${performanceSummary}

## CHARACTER LIMITS — CRITICAL
- Twitter max: 280 characters per tweet
- URLs are wrapped to 23 characters by t.co regardless of actual length
- Hashtags count toward the 280 limit
- Line breaks count as 1 character each
- You MUST write text that fits within 280 characters. DO NOT exceed this. DO NOT truncate with "…"
- Calculate: 280 - 23 (link) - (hashtag chars) - 4 (spacing) = available body text
- For threads: each tweet has its own 280-char budget

## HASHTAG RULES
- Standard tweets: exactly 2 hashtags — 1 relevant topic tag (e.g., #Iran, #Gaza, #Ukraine, #Sudan) + ${config.hashtags.brandTag}
- Threads: hashtags on the LAST tweet only
- Memes: NO hashtags
- Never use generic tags like #ConflictTracking or #IntelDashboard

## TWEET TYPES & VOICES
Choose the best type for each piece of content:
- digest (voice: analyst) — daily summary, data-first, authoritative
- breaking (voice: journalist) — significant development, narrative, impact-focused
- hot_take (voice: edgy) — provocative, contrarian, data-backed commentary
- thread (voice: journalist) — complex story, 3-7 tweets, narrative arc
- data_viz (voice: analyst) — trend spotting, week-over-week, let data tell the story
- meme (voice: witty) — humor, absurd contradictions, relatable. Use memegen.link template.

## MEME FORMAT
For meme tweets, pick a template from memegen.link and provide top/bottom text.
Available templates: drake, distracted-boyfriend, expanding-brain, two-buttons, change-my-mind, always-has-been, is-this-a-pigeon, uno-draw-25, woman-yelling-at-cat, disaster-girl, roll-safe, trump-bill-signing, batman-slapping
URL format: https://api.memegen.link/images/{template}/{top_text}/{bottom_text}.png
Use underscores for spaces, hyphens for new lines in the text.

## LANGUAGES
Available: ${config.languages.join(', ')}
Each language version is a SEPARATE tweet (separate cost). Only translate high-impact tweets.
Spanish: use Latin American Spanish. Keep proper nouns, org names, acronyms untranslated.

## SCHEDULING
Assign each tweet to a time slot: ${config.scheduling.slots.join(', ')} UTC.
Spread content across slots. Put breaking news in the earliest available slot.

## JUDGE ASSESSMENT
For EACH tweet you generate, also provide a self-assessment:
- score (0.0-1.0): quality/appropriateness
- verdict: PUBLISH (auto-approve), REVIEW (needs human eyes), HOLD (good but defer), KILL (reject)
- comment: 1-2 sentence explanation
- factChecks: for EVERY number, claim, and quote in the tweet, verify against the tracker data provided below. Status: verified/warning/unverifiable/failed.

If any factCheck has status "failed", the verdict MUST be KILL.
Meme tweets MUST have verdict REVIEW (never PUBLISH).

## TRACKER DATA FOR TODAY

${trackersWithDigests.map(c => `### ${c.shortName} (${c.slug}) [domain: ${c.domain}]
Digest: ${c.digest?.summary ?? 'No update today'}
Sections updated: ${c.digest?.sectionsUpdated?.join(', ') ?? 'none'}
KPIs: ${c.kpiSnapshot || 'none'}
Recent events:
${c.recentEvents || 'none'}
`).join('\n')}

## OUTPUT FORMAT
Respond with a JSON array of tweet objects. Each object:
{
  "type": "digest|breaking|hot_take|thread|data_viz|meme",
  "voice": "analyst|journalist|edgy|witty",
  "tracker": "tracker-slug",
  "lang": "en|es|fr|pt",
  "text": "the tweet text (MUST be ≤280 chars with link+hashtags counted)",
  "hashtags": ["#TopicTag", "#Watchboard"],
  "link": "https://watchboard.dev/{tracker}/?utm_source=x&utm_medium={type}&utm_campaign=${today}",
  "image": null,
  "memegenUrl": "https://api.memegen.link/images/..." or null,
  "publishAt": "2026-04-01T08:00:00Z",
  "estimatedCost": 0.01,
  "threadTweets": ["tweet 1", "tweet 2", ...] or null,
  "judge": {
    "score": 0.92,
    "verdict": "PUBLISH",
    "comment": "explanation",
    "factChecks": [
      { "claim": "quoted claim", "status": "verified", "source": "data source" }
    ]
  }
}

Only output the JSON array. No markdown, no explanation, no code fences.`;
}

// ── Status assignment ──

function assignStatus(entry: QueueEntry, config: SocialConfig): QueueStatus {
  if (entry.judge.factChecks.some(fc => fc.status === 'failed')) return 'rejected';
  if (entry.judge.verdict === 'KILL') return 'rejected';
  if (entry.judge.verdict === 'HOLD') return 'held';
  if (entry.judge.verdict === 'REVIEW') return 'pending_review';
  if (config.judge.memesAlwaysReview && entry.type === 'meme') return 'pending_review';
  if (entry.judge.verdict === 'PUBLISH' && entry.judge.score >= config.judge.autoApproveThreshold) return 'auto_approved';
  if (entry.judge.score >= config.judge.reviewThreshold) return 'pending_review';
  return 'rejected';
}

// ── Main ──

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const today = todayDateString();
  const config = loadConfig();
  const budget = loadBudget();
  const history = loadHistory();

  console.log(`[social-queue] Generating queue for ${today}`);
  console.log(`[social-queue] Budget: $${budget.remaining.toFixed(2)} remaining of $${budget.monthlyTarget.toFixed(2)}`);

  const contexts = collectTrackerContexts(today);
  const withDigests = contexts.filter(c => c.digest);
  console.log(`[social-queue] ${withDigests.length} trackers updated today out of ${contexts.length} total`);

  if (withDigests.length === 0) {
    console.log('[social-queue] No tracker updates today. Skipping queue generation.');
    return;
  }

  const prompt = buildPrompt(contexts, budget, history, config, today);

  // Write prompt to a file so claude-code-action can read it,
  // or so the user can inspect it with --dry-run
  const promptPath = path.join(PATHS.socialDir, 'prompt-latest.txt');
  fs.mkdirSync(PATHS.socialDir, { recursive: true });
  fs.writeFileSync(promptPath, prompt, 'utf8');
  console.log(`[social-queue] Prompt written to ${promptPath} (${prompt.length} chars)`);

  if (dryRun) {
    console.log('\n[DRY RUN] Prompt written. No LLM call made.');
    return;
  }

  // If ANTHROPIC_API_KEY is set, make a direct API call (legacy/local mode)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('[social-queue] No ANTHROPIC_API_KEY. Prompt written for claude-code-action to use.');
    return;
  }

  console.log('[social-queue] Calling Anthropic API...');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`[social-queue] API error: ${response.status} ${err}`);
    process.exit(1);
  }

  const result = await response.json() as { content: Array<{ text: string }> };
  const rawText = result.content[0].text.trim();

  let entries: QueueEntry[];
  try {
    entries = JSON.parse(rawText);
  } catch {
    // Try extracting JSON from markdown code fences
    const match = rawText.match(/\[[\s\S]*\]/);
    if (!match) {
      console.error('[social-queue] Failed to parse LLM response as JSON');
      console.error(rawText.slice(0, 500));
      process.exit(1);
    }
    entries = JSON.parse(match[0]);
  }

  // Post-process: assign IDs, statuses, validate char counts
  let rejected = 0;
  for (const entry of entries) {
    entry.id = crypto.randomUUID();
    entry.status = assignStatus(entry, config);
    entry.tweetId = null;
    entry.postedAt = null;

    // Validate character count
    const fullText = entry.threadTweets
      ? entry.threadTweets[0]
      : `${entry.text}\n\n${entry.link}\n\n${entry.hashtags.join(' ')}`;
    const weighted = twitterWeightedLength(fullText);
    if (weighted > 280) {
      console.warn(`[social-queue] OVER LIMIT (${weighted}/280): ${entry.tracker}/${entry.type} — rejecting`);
      entry.status = 'rejected';
      entry.judge.comment += ` [AUTO-REJECTED: ${weighted}/280 chars]`;
      rejected++;
    }

    // Recalculate cost
    entry.estimatedCost = estimateCost(entry, config);
  }

  const approved = entries.filter(e => e.status === 'auto_approved').length;
  const review = entries.filter(e => e.status === 'pending_review').length;
  const held = entries.filter(e => e.status === 'held').length;
  console.log(`[social-queue] Generated ${entries.length} drafts: ${approved} auto, ${review} review, ${held} held, ${rejected} rejected`);

  saveQueue(today, entries);
  console.log(`[social-queue] Queue written to public/_social/queue-${today}.json`);
}

main().catch(err => {
  console.error('[social-queue] Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Test locally with --dry-run**

Run: `npx tsx scripts/generate-social-queue.ts --dry-run`
Expected: prints tracker count, writes prompt to `public/_social/prompt-latest.txt`, exits without LLM call.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-social-queue.ts
git commit -m "feat(social): add AI-curated queue generator with budget awareness and LLM judge"
```

---

## Phase 3: Queue Poster Script

### Task 4: Build the queue poster

**Files:**
- Create: `scripts/post-social-queue.ts`

- [ ] **Step 1: Create the poster script**

```typescript
#!/usr/bin/env tsx
/**
 * post-social-queue.ts
 *
 * Reads today's queue, posts due tweets (status approved/auto_approved + publishAt <= now),
 * updates budget and history.
 *
 * Usage: npx tsx scripts/post-social-queue.ts [--dry-run]
 */
import {
  loadConfig, loadBudget, saveBudget, loadHistory, saveHistory,
  loadQueue, saveQueue, todayDateString,
  type QueueEntry, type HistoryEntry,
} from './social-types.js';
import { TwitterApi } from 'twitter-api-v2';

function getTwitterClient(): TwitterApi | null {
  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    console.log('[poster] Missing X API credentials — skipping');
    return null;
  }
  return new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
}

async function postTweet(
  client: TwitterApi,
  text: string,
  replyToId?: string,
): Promise<string | null> {
  const payload: { text: string; reply?: { in_reply_to_tweet_id: string } } = { text };
  if (replyToId) {
    payload.reply = { in_reply_to_tweet_id: replyToId };
  }
  const result = await client.v2.tweet(payload);
  return result.data.id;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const today = todayDateString();
  const now = new Date();
  const config = loadConfig();
  const budget = loadBudget();
  const history = loadHistory();
  const queue = loadQueue(today);

  if (queue.length === 0) {
    console.log(`[poster] No queue for ${today}`);
    return;
  }

  // Find due tweets
  const due = queue.filter(entry =>
    (entry.status === 'approved' || entry.status === 'auto_approved') &&
    new Date(entry.publishAt) <= now &&
    !entry.tweetId
  );

  console.log(`[poster] ${due.length} tweets due for posting (${queue.length} total in queue)`);

  if (due.length === 0) return;

  if (dryRun) {
    console.log('\n[DRY RUN] Would post:');
    for (const entry of due) {
      console.log(`  [${entry.type}/${entry.lang}] ${entry.tracker}: ${entry.text.slice(0, 80)}...`);
    }
    return;
  }

  const client = getTwitterClient();
  if (!client) return;

  let posted = 0;

  for (const entry of due) {
    try {
      if (entry.threadTweets && entry.threadTweets.length > 0) {
        // Post thread
        let lastId: string | undefined;
        for (const tweetText of entry.threadTweets) {
          const id = await postTweet(client, tweetText, lastId);
          if (id) {
            if (!lastId) entry.tweetId = id; // store first tweet ID
            lastId = id;
          }
          await sleep(2000);
        }
        console.log(`[poster] Thread posted: ${entry.tracker}/${entry.type} (${entry.threadTweets.length} tweets)`);
      } else {
        // Post single tweet
        const fullText = `${entry.text}\n\n${entry.link}\n\n${entry.hashtags.join(' ')}`;
        const id = await postTweet(client, fullText);
        entry.tweetId = id;
        console.log(`[poster] Posted: ${entry.tracker}/${entry.type}/${entry.lang} → ${id}`);
      }

      entry.status = 'posted';
      entry.postedAt = new Date().toISOString();

      // Update budget
      budget.spent += entry.estimatedCost;
      budget.remaining = budget.monthlyTarget - budget.spent;
      budget.tweetsPosted++;

      // Add to history
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
      await sleep(2000);
    } catch (err) {
      console.error(`[poster] Failed: ${entry.tracker}/${entry.type}:`, err);
    }
  }

  // Save all state
  saveQueue(today, queue);
  saveBudget(budget);
  saveHistory(history);

  console.log(`[poster] Done. ${posted}/${due.length} posted. Budget: $${budget.spent.toFixed(2)}/$${budget.monthlyTarget.toFixed(2)}`);
}

main().catch(err => {
  console.error('[poster] Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Test with --dry-run**

Run: `npx tsx scripts/post-social-queue.ts --dry-run`
Expected: prints "No queue for YYYY-MM-DD" (since no queue exists yet).

- [ ] **Step 3: Commit**

```bash
git add scripts/post-social-queue.ts
git commit -m "feat(social): add queue poster with budget tracking and thread support"
```

---

## Phase 4: Stat Card Image Generator

### Task 5: Build stat card generator

**Files:**
- Create: `scripts/generate-stat-card.ts`

- [ ] **Step 1: Create the stat card generator**

Uses the same satori + resvg stack as `generate-social-preview.ts`.

```typescript
#!/usr/bin/env tsx
/**
 * generate-stat-card.ts
 *
 * Generates a branded 1200x628 stat card PNG for a tweet.
 * Used for breaking news and data viz tweet types.
 *
 * Usage: npx tsx scripts/generate-stat-card.ts --tracker gaza-war --label "DEATH TOLL" --value "72,285" --delta "+5 today" --out public/_social/cards/gaza-stat.png
 */
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import * as fs from 'fs';
import * as path from 'path';

const WIDTH = 1200;
const HEIGHT = 628;

interface CardOptions {
  tracker: string;
  label: string;
  value: string;
  delta: string;
  outPath: string;
}

function parseArgs(): CardOptions {
  const args = process.argv.slice(2);
  const get = (flag: string): string => {
    const idx = args.indexOf(flag);
    if (idx === -1 || !args[idx + 1]) throw new Error(`Missing ${flag}`);
    return args[idx + 1];
  };
  return {
    tracker: get('--tracker'),
    label: get('--label'),
    value: get('--value'),
    delta: get('--delta'),
    outPath: get('--out'),
  };
}

async function main(): Promise<void> {
  const opts = parseArgs();
  const fontPath = path.resolve('public/fonts/JetBrainsMono-Regular.ttf');
  const fontData = fs.readFileSync(fontPath);

  const trackerUpper = opts.tracker.replace(/-/g, ' ').toUpperCase();

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: WIDTH, height: HEIGHT,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(160deg, #0d1117, #161b22)',
          fontFamily: 'JetBrains Mono', color: '#e6edf3',
          position: 'relative', gap: 8,
        },
        children: [
          { type: 'div', props: { style: { position: 'absolute', top: 16, left: 20, fontSize: 14, fontWeight: 600, color: 'rgba(88,166,255,0.5)', letterSpacing: '0.1em' }, children: 'WATCHBOARD' } },
          { type: 'div', props: { style: { fontSize: 14, color: '#8b949e', letterSpacing: '0.08em' }, children: `${trackerUpper} — ${opts.label}` } },
          { type: 'div', props: { style: { fontSize: 72, fontWeight: 700, color: '#f85149', textShadow: '0 0 40px rgba(248,81,73,0.3)' }, children: opts.value } },
          { type: 'div', props: { style: { fontSize: 18, color: '#e6edf3', fontWeight: 500 }, children: opts.label } },
          { type: 'div', props: { style: { fontSize: 14, color: '#d29922' }, children: opts.delta } },
          { type: 'div', props: { style: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #f85149, #d29922)' } } },
        ],
      },
    },
    {
      width: WIDTH, height: HEIGHT,
      fonts: [
        { name: 'JetBrains Mono', data: fontData, weight: 400, style: 'normal' as const },
        { name: 'JetBrains Mono', data: fontData, weight: 700, style: 'normal' as const },
      ],
    },
  );

  const resvg = new Resvg(svg, { fitTo: { mode: 'width' as const, value: WIDTH } });
  const png = resvg.render().asPng();

  const dir = path.dirname(opts.outPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(opts.outPath, png);
  console.log(`Stat card written to ${opts.outPath} (${png.length} bytes)`);
}

main().catch(console.error);
```

- [ ] **Step 2: Test the generator**

Run: `npx tsx scripts/generate-stat-card.ts --tracker gaza-war --label "DEATH TOLL" --value "72,285" --delta "+5 today · Day 543" --out /tmp/test-stat-card.png`
Expected: PNG file created at `/tmp/test-stat-card.png`.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-stat-card.ts
git commit -m "feat(social): add branded stat card image generator (satori + resvg)"
```

---

## Phase 5: GitHub Actions Workflows

### Task 6: Create the posting cron workflow

**Files:**
- Create: `.github/workflows/post-social-queue.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: Post Social Queue

on:
  schedule:
    - cron: '0 8,13,18,22 * * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  post:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Post due tweets from queue
        env:
          X_API_KEY: ${{ secrets.X_API_KEY }}
          X_API_SECRET: ${{ secrets.X_API_SECRET }}
          X_ACCESS_TOKEN: ${{ secrets.X_ACCESS_TOKEN }}
          X_ACCESS_TOKEN_SECRET: ${{ secrets.X_ACCESS_TOKEN_SECRET }}
        run: npx tsx scripts/post-social-queue.ts

      - name: Commit and push
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${{ github.repository }}.git"
          git config --local user.email "github-actions[bot]@users.noreply.github.com"
          git config --local user.name "github-actions[bot]"
          git add public/_social/
          if git diff --cached --quiet public/_social/; then
            echo "No social changes"
            exit 0
          fi
          git commit -m "chore(social): post queue $(date -u +%Y-%m-%dT%H:%M:%SZ)"
          for i in 1 2 3; do
            git pull --rebase origin main && git push && break
            echo "Push attempt $i failed, retrying..."
            sleep 2
          done
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/post-social-queue.yml
git commit -m "feat(social): add 4x/day cron workflow for queue posting"
```

---

### Task 7: Update update-data.yml to use new queue generator

**Files:**
- Modify: `.github/workflows/update-data.yml:665-684`

- [ ] **Step 1: Replace the social drafts + posting steps**

Replace the two steps ("Generate social drafts" and "Post to social media") with one step that generates the queue:

Find the block starting at line 665 (`- name: Generate social drafts`) through line 684 (`run: npx tsx scripts/post-social.ts`) and replace with:

```yaml
      - name: Generate social queue
        id: social
        if: steps.validate.outputs.valid == 'true' || steps.revalidate.outputs.valid == 'true'
        run: |
          npx tsx scripts/generate-social-queue.ts
          if [ -d "public/_social" ]; then
            echo "Social queue generated"
            ls -la public/_social/queue-*.json 2>/dev/null || echo "No queue files"
          fi
```

- [ ] **Step 2: Update the commit step to only add _social queue files**

In the "Commit and push metrics" step (around line 694), ensure `public/_social/` is still in the git add:

The existing `git add public/_metrics/ public/_social/` line already covers this — no change needed.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/update-data.yml
git commit -m "refactor(social): replace social drafts+post steps with queue generator in update-data workflow"
```

---

## Phase 6: Social Command Center Dashboard

### Task 8: Create the Astro page shell

**Files:**
- Create: `src/pages/social.astro`

- [ ] **Step 1: Create the page**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import SocialCommandCenter from '../components/islands/SocialCommandCenter';

const base = import.meta.env.BASE_URL;
const basePath = base.endsWith('/') ? base : `${base}/`;
---

<BaseLayout
  title="Social Command Center — Watchboard"
  description="AI-curated social media queue with LLM judge, budget tracking, and batch approval"
>
  <main id="main-content" class="social-page">
    <SocialCommandCenter client:load basePath={basePath} />
    <footer class="platform-footer">
      <a href={basePath}>Watchboard</a>
      <span>&middot;</span>
      <a href={`${basePath}metrics/`}>Metrics</a>
      <span>&middot;</span>
      <a href={`${basePath}rss.xml`}>RSS</a>
      <span>&middot;</span>
      <a href="https://github.com/ArtemioPadilla/watchboard" target="_blank" rel="noopener noreferrer">GitHub</a>
    </footer>
  </main>
</BaseLayout>

<style>
  .social-page {
    min-height: 100vh;
    background: var(--bg-primary, #0d1117);
  }
  .platform-footer {
    text-align: center;
    padding: 24px;
    font-size: 12px;
    color: var(--text-muted, #484f58);
  }
  .platform-footer a {
    color: var(--text-muted, #484f58);
    text-decoration: none;
  }
  .platform-footer a:hover {
    color: var(--accent-blue, #58a6ff);
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/social.astro
git commit -m "feat(social): add /social/ page shell"
```

---

### Task 9: Build the SocialCommandCenter React island

This is the largest task. It will be implemented as a single component file that imports subcomponents. Given the complexity, I'm keeping it as one file following the MetricsDashboard pattern already in the codebase (single large island file).

**Files:**
- Create: `src/components/islands/SocialCommandCenter.tsx`
- Create: `src/styles/social-command-center.css`

- [ ] **Step 1: Create the CSS file**

Create `src/styles/social-command-center.css` with all the styles from the brainstorming mockup (v7). This is a long file — extract from the mockup's `<style>` block, adapting class names to use `scc-` prefix to avoid conflicts. Key sections:

- Header + cost bar
- Filter bar + language toggle
- Card grid (50/50 split)
- Left panel (judge box, fact checks, controls)
- Right panel (X tweet preview using actual X CSS values)
- Bottom bar (batch selection + budget meter)
- Thread expand/collapse
- Checkbox states

```css
/* Social Command Center */
.scc-bar { height: 3px; background: linear-gradient(90deg, #58a6ff, #a371f7, #f778ba, #58a6ff); position: fixed; top: 0; left: 0; right: 0; z-index: 100; }

.scc-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 32px 14px; margin-top: 3px; border-bottom: 1px solid rgba(88,166,255,.15); }
.scc-header h1 { font-size: 18px; font-weight: 600; letter-spacing: .08em; color: #58a6ff; font-family: 'JetBrains Mono', monospace; }
.scc-badge { font-size: 10px; padding: 3px 8px; border-radius: 3px; background: rgba(88,166,255,.15); color: #58a6ff; letter-spacing: .1em; font-weight: 600; margin-left: 16px; font-family: 'JetBrains Mono', monospace; }

.scc-cost-bar { display: flex; align-items: center; gap: 16px; padding: 8px 32px; background: rgba(22,27,34,.6); border-bottom: 1px solid rgba(88,166,255,.08); font-size: 10px; font-family: 'JetBrains Mono', monospace; color: #8b949e; }
.scc-cost-bar b { color: #e6edf3; }
.scc-cost-meter { width: 120px; height: 6px; background: rgba(139,148,158,.15); border-radius: 3px; overflow: hidden; }
.scc-cost-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #3fb950, #58a6ff); transition: width .3s; }

.scc-filters { display: flex; align-items: center; gap: 8px; padding: 10px 32px; border-bottom: 1px solid rgba(88,166,255,.08); flex-wrap: wrap; font-family: 'JetBrains Mono', monospace; }
.scc-fbtn { font-size: 11px; padding: 5px 12px; border-radius: 14px; border: 1px solid rgba(139,148,158,.25); background: transparent; color: #8b949e; cursor: pointer; font-family: inherit; }
.scc-fbtn.active { background: rgba(88,166,255,.15); border-color: #58a6ff; color: #58a6ff; }

.scc-card { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid rgba(88,166,255,.1); border-radius: 10px; overflow: hidden; margin-bottom: 14px; position: relative; }
.scc-card:hover { border-color: rgba(88,166,255,.25); }
.scc-card[data-verdict="PUBLISH"] { border-left: 3px solid #3fb950; }
.scc-card[data-verdict="REVIEW"] { border-left: 3px solid #d29922; }
.scc-card[data-verdict="HOLD"] { border-left: 3px solid #8b949e; }
.scc-card[data-verdict="KILL"] { border-left: 3px solid #f85149; opacity: 0.5; }

/* Left panel */
.scc-ctrl { background: rgba(13,17,23,.95); padding: 14px 16px 14px 36px; display: flex; flex-direction: column; gap: 7px; border-right: 1px solid rgba(88,166,255,.08); font-size: 10px; font-family: 'JetBrains Mono', monospace; }

/* Judge box */
.scc-judge { background: rgba(88,166,255,.04); border: 1px solid rgba(88,166,255,.1); border-radius: 8px; padding: 12px 14px; font-size: 11px; line-height: 1.6; flex: 1; }
.scc-judge-label { font-size: 9px; letter-spacing: .12em; color: #58a6ff; font-weight: 600; margin-bottom: 6px; }
.scc-judge-comment { color: #c9d1d9; margin-bottom: 10px; }
.scc-fc-item { display: flex; align-items: flex-start; gap: 6px; font-size: 10px; line-height: 1.5; margin-bottom: 5px; }
.scc-fc-ok { color: #3fb950; }
.scc-fc-warn { color: #d29922; }
.scc-fc-unk { color: #8b949e; }
.scc-fc-fail { color: #f85149; }

/* Right panel — X preview */
.scc-x-preview { background: #000; padding: 16px 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.scc-x-tweet { display: flex; gap: 12px; }
.scc-x-name { font-size: 15px; font-weight: 700; color: #e7e9ea; }
.scc-x-handle { font-size: 15px; color: #71767b; }
.scc-x-text { font-size: 15px; line-height: 20px; color: #e7e9ea; white-space: pre-wrap; word-wrap: break-word; }
.scc-x-hashtag { color: #1d9bf0; }
.scc-x-link { color: #1d9bf0; }

/* Bottom bar */
.scc-bottom { position: fixed; bottom: 0; left: 0; right: 0; background: rgba(13,17,23,.97); backdrop-filter: blur(8px); border-top: 1px solid rgba(88,166,255,.15); padding: 10px 32px; display: flex; align-items: center; justify-content: space-between; z-index: 50; font-family: 'JetBrains Mono', monospace; }
```

- [ ] **Step 2: Add CSS import to global.css**

Add at the top of `src/styles/global.css`:

```css
@import './social-command-center.css';
```

- [ ] **Step 3: Create the SocialCommandCenter.tsx island**

Create `src/components/islands/SocialCommandCenter.tsx`. This follows the same pattern as `MetricsDashboard.tsx` — a single large island that fetches data at runtime from static JSON files.

The component:
1. On mount, fetches `public/_social/queue-YYYY-MM-DD.json`, `public/_social/budget.json`, `public/_social/history.json` from the deployed site (relative URLs)
2. Renders the header, cost bar, filters, card list, and bottom bar
3. For auth'd users (PAT in localStorage), enables approve/reject via GitHub API
4. Cards use the 50/50 split layout with judge panel left, X preview right
5. Checkboxes track batch selection with live cost calculation

Due to file length, this component follows the MetricsDashboard pattern — all rendering logic in one file (~600-800 lines). The key sections:

- State: queue entries, budget, history, filters, selected IDs, auth token
- Fetch logic: load today's queue + budget from relative paths
- GitHub API helpers: read/write files for approve/reject actions
- Rendering: header, cost bar, filters, card list (map over entries), bottom bar
- TweetPreview sub-component (inline): renders the X dark-mode preview
- JudgePanel sub-component (inline): renders score, verdict badge, comment, fact checks
- ThreadPreview sub-component (inline): collapsible thread view

```tsx
import { useState, useEffect, useCallback } from 'react';

/* ── Types (mirror scripts/social-types.ts) ── */

type TweetType = 'digest' | 'breaking' | 'hot_take' | 'thread' | 'data_viz' | 'meme';
type Voice = 'analyst' | 'journalist' | 'edgy' | 'witty';
type Verdict = 'PUBLISH' | 'REVIEW' | 'HOLD' | 'KILL';
type FactCheckStatus = 'verified' | 'warning' | 'unverifiable' | 'failed';
type QueueStatus = 'auto_approved' | 'pending_review' | 'held' | 'approved' | 'rejected' | 'posted';

interface FactCheck { claim: string; status: FactCheckStatus; source: string; }
interface JudgeAssessment { score: number; verdict: Verdict; comment: string; factChecks: FactCheck[]; }
interface QueueEntry {
  id: string; type: TweetType; voice: Voice; tracker: string; lang: string;
  text: string; hashtags: string[]; link: string; image: string | null;
  memegenUrl: string | null; publishAt: string; status: QueueStatus;
  estimatedCost: number; judge: JudgeAssessment;
  threadTweets: string[] | null; tweetId: string | null; postedAt: string | null;
}
interface BudgetData { monthlyTarget: number; currentMonth: string; spent: number; tweetsPosted: number; remaining: number; }
interface HistoryEntry { tweetId: string; date: string; tracker: string; type: TweetType; voice: Voice; lang: string; text: string; cost: number; utmClicks: number; publishedAt: string; }

/* ── Constants ── */

const VERDICT_COLORS: Record<Verdict, string> = { PUBLISH: '#3fb950', REVIEW: '#d29922', HOLD: '#8b949e', KILL: '#f85149' };
const TYPE_COLORS: Record<TweetType, string> = { digest: '#58a6ff', breaking: '#f85149', hot_take: '#d29922', thread: '#a371f7', data_viz: '#3fb950', meme: '#f778ba' };
const FC_ICONS: Record<FactCheckStatus, { icon: string; color: string }> = {
  verified: { icon: '✓', color: '#3fb950' }, warning: { icon: '!', color: '#d29922' },
  unverifiable: { icon: '?', color: '#8b949e' }, failed: { icon: '✗', color: '#f85149' },
};

/* ── Helpers ── */

function todayStr(): string { return new Date().toISOString().slice(0, 10); }

/* ── Component ── */

interface Props { basePath: string; }

export default function SocialCommandCenter({ basePath }: Props) {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<TweetType | null>(null);
  const [langFilter, setLangFilter] = useState<string>('en');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());

  // Load data
  useEffect(() => {
    const today = todayStr();
    Promise.all([
      fetch(`${basePath}_social/queue-${today}.json`).then(r => r.ok ? r.json() : []),
      fetch(`${basePath}_social/budget.json`).then(r => r.ok ? r.json() : null),
      fetch(`${basePath}_social/history.json`).then(r => r.ok ? r.json() : []),
    ]).then(([q, b, h]) => {
      setQueue(q); setBudget(b); setHistory(h); setLoading(false);
    }).catch(err => { setError(err.message); setLoading(false); });
  }, [basePath]);

  // Filter logic
  const filtered = queue.filter(entry => {
    if (filter === 'pending' && entry.status !== 'pending_review') return false;
    if (filter === 'auto' && entry.status !== 'auto_approved') return false;
    if (filter === 'posted' && entry.status !== 'posted') return false;
    if (typeFilter && entry.type !== typeFilter) return false;
    if (entry.lang !== langFilter) return false;
    return true;
  });

  // Selection
  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectedCost = Array.from(selected).reduce((sum, id) => {
    const entry = queue.find(e => e.id === id);
    return sum + (entry?.estimatedCost ?? 0);
  }, 0);

  const toggleThread = useCallback((id: string) => {
    setExpandedThreads(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  if (loading) return <div style={{ color: '#8b949e', textAlign: 'center', padding: 60, fontFamily: "'JetBrains Mono', monospace" }}>Loading queue...</div>;
  if (error) return <div style={{ color: '#f85149', textAlign: 'center', padding: 60, fontFamily: "'JetBrains Mono', monospace" }}>Error: {error}</div>;

  const today = todayStr();
  const langs = ['en', 'es', 'fr', 'pt'];
  const types: TweetType[] = ['digest', 'breaking', 'hot_take', 'thread', 'data_viz', 'meme'];
  const statusFilters = ['all', 'pending', 'auto', 'posted'];

  return (
    <div>
      {/* Accent bar */}
      <div className="scc-bar" />

      {/* Header */}
      <div className="scc-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h1>SOCIAL COMMAND CENTER</h1>
          <span className="scc-badge">{today}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontFamily: "'JetBrains Mono', monospace" }}>
          <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, border: '1px solid rgba(139,148,158,.3)', color: '#8b949e' }}><b style={{ color: '#e6edf3' }}>{queue.length}</b> queued</span>
          <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, border: '1px solid rgba(139,148,158,.3)', color: '#8b949e' }}><b style={{ color: '#e6edf3' }}>{queue.filter(e => e.status === 'auto_approved').length}</b> auto</span>
          <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, border: '1px solid rgba(139,148,158,.3)', color: '#8b949e' }}><b style={{ color: '#e6edf3' }}>{queue.filter(e => e.status === 'pending_review').length}</b> review</span>
          <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, border: '1px solid rgba(139,148,158,.3)', color: '#8b949e' }}><b style={{ color: '#e6edf3' }}>{queue.filter(e => e.status === 'posted').length}</b> posted</span>
        </div>
      </div>

      {/* Cost bar */}
      {budget && (
        <div className="scc-cost-bar">
          <span>Monthly: <b>${budget.spent.toFixed(2)} / ${budget.monthlyTarget.toFixed(2)}</b></span>
          <div className="scc-cost-meter"><div className="scc-cost-fill" style={{ width: `${Math.min(100, (budget.spent / budget.monthlyTarget) * 100)}%` }} /></div>
          <span>Remaining: <b>${budget.remaining.toFixed(2)}</b></span>
          <span>|</span>
          <span>Tweets: <b>{budget.tweetsPosted}</b></span>
        </div>
      )}

      {/* Filters */}
      <div className="scc-filters">
        {statusFilters.map(f => (
          <button key={f} className={`scc-fbtn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span style={{ width: 1, height: 20, background: 'rgba(139,148,158,.2)', margin: '0 4px' }} />
        {types.map(t => (
          <button key={t} className={`scc-fbtn ${typeFilter === t ? 'active' : ''}`}
            onClick={() => setTypeFilter(typeFilter === t ? null : t)}>
            {t.replace('_', ' ')}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {langs.map(l => (
            <button key={l} onClick={() => setLangFilter(l)}
              style={{ fontSize: 10, padding: '3px 8px', borderRadius: 3, border: `1px solid ${langFilter === l ? '#a371f7' : 'rgba(139,148,158,.2)'}`, background: langFilter === l ? 'rgba(163,113,247,.15)' : 'transparent', color: langFilter === l ? '#a371f7' : '#484f58', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Queue cards */}
      <div style={{ padding: '16px 32px', paddingBottom: 80 }}>
        {filtered.length === 0 && (
          <div style={{ color: '#484f58', textAlign: 'center', padding: 40, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
            No tweets match the current filters.
          </div>
        )}
        {filtered.map(entry => (
          <div key={entry.id} className="scc-card" data-verdict={entry.judge.verdict}>
            {/* Checkbox */}
            <div onClick={() => toggleSelect(entry.id)} style={{
              position: 'absolute', top: 12, left: 12, zIndex: 10, width: 18, height: 18,
              borderRadius: 4, border: `2px solid ${selected.has(entry.id) ? '#58a6ff' : 'rgba(139,148,158,.4)'}`,
              background: selected.has(entry.id) ? '#58a6ff' : 'rgba(13,17,23,.9)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#fff',
            }}>
              {selected.has(entry.id) && '✓'}
            </div>

            {/* Left: Judge panel */}
            <div className="scc-ctrl">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ padding: '3px 8px', borderRadius: 3, fontSize: 9, fontWeight: 600, letterSpacing: '.08em', background: `${TYPE_COLORS[entry.type]}22`, color: TYPE_COLORS[entry.type] }}>
                    {entry.type.toUpperCase().replace('_', ' ')}{entry.threadTweets ? ` (${entry.threadTweets.length})` : ''}
                  </span>
                  <span style={{ color: '#8b949e', fontSize: 10 }}>{entry.tracker.toUpperCase()}</span>
                </div>
                <span style={{ color: '#484f58', fontStyle: 'italic', fontSize: 9 }}>{entry.voice}</span>
              </div>

              {/* Score + verdict */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#484f58', fontSize: 10 }}>Judge:</span>
                <div style={{ width: 60, height: 5, background: 'rgba(139,148,158,.2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${entry.judge.score * 100}%`, height: '100%', borderRadius: 3, background: VERDICT_COLORS[entry.judge.verdict] }} />
                </div>
                <span style={{ fontWeight: 600, fontSize: 12, color: VERDICT_COLORS[entry.judge.verdict] }}>{entry.judge.score.toFixed(2)}</span>
                <span style={{ padding: '3px 8px', borderRadius: 3, fontSize: 9, fontWeight: 600, letterSpacing: '.05em', background: `${VERDICT_COLORS[entry.judge.verdict]}22`, color: VERDICT_COLORS[entry.judge.verdict] }}>
                  {entry.judge.verdict}
                </span>
              </div>

              {/* Judge box */}
              <div className="scc-judge">
                <div className="scc-judge-label">LLM JUDGE</div>
                <div className="scc-judge-comment">{entry.judge.comment}</div>
                {entry.judge.factChecks.map((fc, i) => (
                  <div key={i} className="scc-fc-item">
                    <span style={{ color: FC_ICONS[fc.status].color, fontWeight: 700, flexShrink: 0 }}>{FC_ICONS[fc.status].icon}</span>
                    <span style={{ color: '#8b949e' }}><b style={{ color: '#c9d1d9' }}>"{fc.claim}"</b> — {fc.source}</span>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 6, borderTop: '1px solid rgba(88,166,255,.06)' }}>
                <span style={{ color: '#484f58', fontSize: 10 }}>~${entry.estimatedCost.toFixed(2)}</span>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button style={{ fontSize: 10, padding: '6px 12px', borderRadius: 5, border: '1px solid rgba(63,185,80,.4)', background: 'transparent', color: '#3fb950', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}>Approve</button>
                  <button style={{ fontSize: 10, padding: '6px 12px', borderRadius: 5, border: '1px solid rgba(88,166,255,.3)', background: 'transparent', color: '#58a6ff', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}>Edit</button>
                  <button style={{ fontSize: 10, padding: '6px 12px', borderRadius: 5, border: '1px solid rgba(248,81,73,.3)', background: 'transparent', color: '#f85149', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace" }}>Reject</button>
                </div>
              </div>
            </div>

            {/* Right: X preview */}
            <div className="scc-x-preview">
              <div className="scc-x-tweet">
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#16181c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="#e7e9ea"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    <span className="scc-x-name">Watchboard</span>
                    <svg viewBox="0 0 22 22" width="18" height="18"><path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.607-.274 1.264-.144 1.897.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.706 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" fill="#1d9bf0" /></svg>
                    <span className="scc-x-handle">@watchboard</span>
                    <span style={{ color: '#71767b', fontSize: 15 }}>·</span>
                    <span style={{ color: '#71767b', fontSize: 15 }}>{new Date(entry.publishAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="scc-x-text">
                    {entry.text.split(/(#\w+)/g).map((part, i) =>
                      part.startsWith('#') ? <span key={i} className="scc-x-hashtag">{part}</span> : part
                    )}
                    {'\n\n'}
                    <span className="scc-x-link">{entry.link.replace('https://', '').slice(0, 35)}…</span>
                    {entry.hashtags.length > 0 && (
                      <>{'\n\n'}{entry.hashtags.map((h, i) => <span key={i} className="scc-x-hashtag">{h} </span>)}</>
                    )}
                  </div>
                  {/* Meme image */}
                  {entry.memegenUrl && (
                    <div style={{ border: '1px solid #2f3336', borderRadius: 16, overflow: 'hidden', marginBottom: 12 }}>
                      <img src={entry.memegenUrl} alt="meme" style={{ width: '100%', maxHeight: 300, objectFit: 'contain', background: '#000' }} />
                    </div>
                  )}
                  {/* Thread preview */}
                  {entry.threadTweets && entry.threadTweets.length > 1 && (
                    <div>
                      {!expandedThreads.has(entry.id) ? (
                        <div>
                          <div style={{ borderLeft: '2px solid #333639', marginLeft: 19, paddingLeft: 16, opacity: 0.6, maxHeight: 40, overflow: 'hidden' }}>
                            <span style={{ fontSize: 13, color: '#71767b' }}>2/{entry.threadTweets.length}</span>
                            <div style={{ fontSize: 15, color: '#e7e9ea' }}>{entry.threadTweets[1]?.slice(0, 60)}...</div>
                          </div>
                          <div onClick={() => toggleThread(entry.id)} style={{ fontSize: 12, color: '#1d9bf0', cursor: 'pointer', marginTop: 8 }}>
                            Show all {entry.threadTweets.length} tweets ↓
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ borderLeft: '2px solid #333639', marginLeft: 19, paddingLeft: 16 }}>
                            {entry.threadTweets.slice(1).map((t, i) => (
                              <div key={i} style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 13, color: '#71767b', marginBottom: 2 }}>{i + 2}/{entry.threadTweets!.length}</div>
                                <div style={{ fontSize: 15, color: '#e7e9ea', lineHeight: '20px' }}>{t}</div>
                              </div>
                            ))}
                          </div>
                          <div onClick={() => toggleThread(entry.id)} style={{ fontSize: 12, color: '#1d9bf0', cursor: 'pointer', marginTop: 8 }}>
                            Collapse thread ↑
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Engagement bar placeholder */}
                  <div style={{ display: 'flex', gap: 40, marginTop: 12, color: '#71767b', fontSize: 13 }}>
                    <span>💬 —</span><span>🔁 —</span><span>❤️ —</span><span>📊 —</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="scc-bottom">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: '#8b949e' }}>
          {selected.size > 0 && (
            <>
              <span style={{ color: '#58a6ff', fontWeight: 600 }}>Selected: {selected.size}</span>
              <span>|</span>
              <span>Est. cost: <b style={{ color: '#e6edf3' }}>${selectedCost.toFixed(2)}</b></span>
              <span>|</span>
              <span>Budget remaining: <b style={{ color: '#e6edf3' }}>${((budget?.remaining ?? 0) - selectedCost).toFixed(2)}</b></span>
            </>
          )}
          {selected.size === 0 && <span>Select tweets to approve</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button disabled={selected.size === 0} style={{ fontSize: 10, padding: '6px 16px', borderRadius: 5, border: 'none', background: 'rgba(63,185,80,.2)', color: '#3fb950', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, opacity: selected.size === 0 ? 0.4 : 1 }}>
            Approve Selected
          </button>
          <button disabled={selected.size === 0} style={{ fontSize: 10, padding: '6px 16px', borderRadius: 5, border: 'none', background: '#58a6ff', color: '#0d1117', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, opacity: selected.size === 0 ? 0.4 : 1 }}>
            Publish Selected
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build to verify no type errors**

Run: `npm run build`
Expected: Build succeeds. The `/social/` page is generated.

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/SocialCommandCenter.tsx src/styles/social-command-center.css src/pages/social.astro src/styles/global.css
git commit -m "feat(social): add Social Command Center dashboard page with X preview, judge panel, and batch approve"
```

---

## Phase 7: Cleanup + Migration

### Task 10: Remove old social scripts from update-data workflow

**Files:**
- Modify: `.github/workflows/weekly-digest.yml`

- [ ] **Step 1: Update weekly-digest.yml to write queue format**

Replace the inline Node.js digest generator to output a `thread` entry in the queue format instead of the old `weekly-*.json` format. The key change is the output structure — instead of `{ type: 'weekly', twitterThread: [...] }`, it writes a single `QueueEntry` with `type: 'thread'` and `threadTweets: [...]` into `queue-YYYY-MM-DD.json`.

Update the "Generate weekly digest" step's Node script to output:

```javascript
const output = [{
  id: crypto.randomUUID(),
  type: 'thread',
  voice: 'journalist',
  tracker: 'watchboard',
  lang: 'en',
  text: header,
  hashtags: ['#OSINT', '#Watchboard'],
  link: baseUrl,
  image: null,
  memegenUrl: null,
  publishAt: new Date().toISOString(),
  status: 'pending_review',
  estimatedCost: twitterThread.length * 0.01,
  judge: { score: 0.75, verdict: 'REVIEW', comment: 'Weekly digest thread — auto-generated, needs review.', factChecks: [] },
  threadTweets: twitterThread,
  tweetId: null,
  postedAt: null,
}];
```

And change the "Post to social media" step to use `npx tsx scripts/post-social-queue.ts`.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/weekly-digest.yml
git commit -m "refactor(social): migrate weekly digest to queue format"
```

---

### Task 11: Mark old scripts as deprecated

**Files:**
- Modify: `scripts/generate-social-drafts.ts`
- Modify: `scripts/post-social.ts`

- [ ] **Step 1: Add deprecation notice to old scripts**

Add to the top of each file, after the existing doc comment:

```typescript
console.warn('[DEPRECATED] This script is replaced by generate-social-queue.ts / post-social-queue.ts. See docs/superpowers/specs/2026-04-01-social-command-center-design.md');
```

- [ ] **Step 2: Commit**

```bash
git add scripts/generate-social-drafts.ts scripts/post-social.ts
git commit -m "chore(social): mark old social scripts as deprecated"
```

---

## Phase 8: Verification

### Task 12: End-to-end dry run

- [ ] **Step 1: Generate a queue locally**

Run: `npx tsx scripts/generate-social-queue.ts --dry-run`
Expected: Prompt file created at `public/_social/prompt-latest.txt` with all tracker context, budget info, and detailed instructions.

- [ ] **Step 2: Verify the prompt quality**

Read the prompt and verify:
- All active trackers with today's digests are included
- Budget section shows correct numbers
- Character limit instructions are present
- Hashtag rules are correct (2 max, topic + #Watchboard)
- Output format matches QueueEntry schema

- [ ] **Step 3: Build the site**

Run: `npm run build`
Expected: Build succeeds. `/social/` page is generated in `dist/`.

- [ ] **Step 4: Preview and verify dashboard loads**

Run: `npm run preview`
Navigate to `/social/`. Expected: page loads, shows "No tweets match" (empty queue), header/filters/bottom bar render correctly.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(social): e2e verification fixes"
```
