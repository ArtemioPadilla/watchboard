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
  type QueueEntry, type QueueStatus, type SocialConfig, type BudgetData, type HistoryEntry,
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

    const digestPath = path.join(PATHS.trackersDir, slug, 'data', 'digests.json');
    let digest: DigestEntry | null = null;
    if (fs.existsSync(digestPath)) {
      try {
        const digests: DigestEntry[] = JSON.parse(fs.readFileSync(digestPath, 'utf8'));
        digest = digests.find(d => d.date === today) ?? null;
      } catch { /* skip malformed digest files */ }
    }

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
          const fileDate = file.replace('.json', '');
          for (const evt of dayEvents.slice(0, 3)) {
            const evtId = evt.id || '';
            const evtTitle = evt.title || evt.headline || '';
            // Include event ID so LLM can construct permalink URLs for breaking tweets
            events.push(`[${fileDate}] (id: ${evtId}) ${evtTitle}`);
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
  for (const h of recentHistory.filter(h => h.date >= today)) {
    recentByTracker[h.tracker] = (recentByTracker[h.tracker] ?? 0) + 1;
  }

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

## PLATFORM
You are generating content for X/Twitter ONLY. Do NOT generate posts for LinkedIn, Facebook, Instagram, or any other platform. Every entry must be a tweet.

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
- For threads: each tweet in the thread has its own 280-char budget

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
Respond with a JSON array of tweet objects. Each object MUST have ALL these fields:
{
  "type": "digest|breaking|hot_take|thread|data_viz|meme",
  "voice": "analyst|journalist|edgy|witty",
  "tracker": "tracker-slug",
  "lang": "en|es|fr|pt",
  "text": "the tweet body text ONLY — do NOT include the link or hashtags in this field, they are appended automatically by the poster",
  "hashtags": ["#TopicTag", "#Watchboard"],
  "link": "(see LINK RULES below)",
  "image": "(see LINK RULES below — OG image URL for breaking tweets, null otherwise)",
  "memegenUrl": "https://api.memegen.link/images/..." or null,
  "publishAt": "${today}T08:00:00Z",
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

LINK RULES:
- For "breaking" tweets: link to the specific event permalink. Format the event ID as a slug (lowercase, replace non-alphanumeric with hyphens). URL: https://watchboard.dev/{tracker}/events/{date}-{event-id-slug}?utm_source=x&utm_medium=breaking&utm_campaign=${today}
  Also set "image" to the per-event OG card: https://watchboard.dev/og/{tracker}/{date}-{event-id-slug}.png
- For ALL other tweet types: link to the tracker dashboard: https://watchboard.dev/{tracker}/?utm_source=x&utm_medium={type}&utm_campaign=${today}
  Set "image" to null (or a memegen URL for memes).
- The event IDs are shown in the "Recent events" data as (id: ...) — use them to build slugs.

CRITICAL RULES:
- "text" must NOT contain the link URL or hashtags — the poster appends those automatically. Including them causes duplication.
- "publishAt" is REQUIRED and MUST be a full ISO 8601 datetime using one of today's time slots (${config.scheduling.slots.map(s => today + 'T' + s + ':00Z').join(', ')}).
- "judge" is REQUIRED with score, verdict, comment, and factChecks.
- Do NOT include a "platform" field. All entries are Twitter/X tweets.

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

  const promptPath = path.join(PATHS.socialDir, 'prompt-latest.txt');
  fs.mkdirSync(PATHS.socialDir, { recursive: true });
  fs.writeFileSync(promptPath, prompt, 'utf8');
  console.log(`[social-queue] Prompt written to ${promptPath} (${prompt.length} chars)`);

  if (dryRun) {
    console.log('\n[DRY RUN] Prompt written. No LLM call made.');
    return;
  }

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
      model: 'claude-sonnet-4-6',
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

    if (entry.threadTweets && entry.threadTweets.length > 0) {
      for (let i = 0; i < entry.threadTweets.length; i++) {
        const weighted = twitterWeightedLength(entry.threadTweets[i]);
        if (weighted > 280) {
          console.warn(`[social-queue] OVER LIMIT thread[${i}] (${weighted}/280): ${entry.tracker}/${entry.type} — rejecting`);
          entry.status = 'rejected';
          entry.judge.comment += ` [AUTO-REJECTED: thread tweet ${i} is ${weighted}/280 chars]`;
          rejected++;
          break;
        }
      }
    } else {
      const fullText = `${entry.text}\n\n${entry.link}\n\n${entry.hashtags.join(' ')}`;
      const weighted = twitterWeightedLength(fullText);
      if (weighted > 280) {
        console.warn(`[social-queue] OVER LIMIT (${weighted}/280): ${entry.tracker}/${entry.type} — rejecting`);
        entry.status = 'rejected';
        entry.judge.comment += ` [AUTO-REJECTED: ${weighted}/280 chars]`;
        rejected++;
      }
    }

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
