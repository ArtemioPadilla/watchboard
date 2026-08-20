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
  type QueueEntry, type QueueStatus, type SocialConfig, type BudgetData, type HistoryEntry, type TweetType } from './social-types.js';

// ── Prompt-injection hardening ──

/**
 * Sanitize tracker-supplied strings (event titles, digest summaries, KPI
 * values) before interpolating them into the LLM prompt. Strips markdown
 * header markers and code fences that could fake prompt structure, drops
 * lines that look like instruction injection, and truncates each item.
 */
function sanitizeForPrompt(input: unknown, maxLen = 300): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/```/g, '')
    .split('\n')
    .filter(line => !/^(system|assistant|ignore previous)/i.test(line.trim()))
    .map(line => line.replace(/^#+\s*/, ''))
    .join('\n')
    .slice(0, maxLen);
}

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
  /** Unresolved sourced disagreements — the material for `contested` tweets. */
  contestedClaims: string;
  /** Figures flagged as disputed or frozen — the material for `stale_data`. */
  staleFigures: string;
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
          .map((k: { label: string; value: string }) =>
            `${sanitizeForPrompt(k.label, 80)}: ${sanitizeForPrompt(k.value, 80)}`)
          .join('; ');
      } catch { /* skip */ }
    }

    // Contested claims and frozen figures — the material the four
    // data-derived tweet types are built from. Asking the model for a
    // `contested` tweet without giving it the disputes would just invite it to
    // invent one, which is the failure mode that matters most here.
    const claimsPath = path.join(PATHS.trackersDir, slug, 'data', 'claims.json');
    let contestedClaims = '';
    if (fs.existsSync(claimsPath)) {
      try {
        const claims = JSON.parse(fs.readFileSync(claimsPath, 'utf8'));
        contestedClaims = claims
          .filter((c: { resolution?: string }) =>
            // Unresolved disputes only. A settled question is not a story.
            !c.resolution || /unresolved|contested|disputed|no official/i.test(c.resolution))
          .slice(0, 3)
          .map((c: { question?: string; sideA?: { label?: string; text?: string }; sideB?: { label?: string; text?: string } }) =>
            `Q: ${sanitizeForPrompt(c.question, 140)} | ${sanitizeForPrompt(c.sideA?.label, 40)}: ${sanitizeForPrompt(c.sideA?.text, 160)} | ${sanitizeForPrompt(c.sideB?.label, 40)}: ${sanitizeForPrompt(c.sideB?.text, 160)}`)
          .join(' || ');
      } catch { /* skip malformed claims */ }
    }

    const casualtiesPath = path.join(PATHS.trackersDir, slug, 'data', 'casualties.json');
    let staleFigures = '';
    if (fs.existsSync(casualtiesPath)) {
      try {
        const rows = JSON.parse(fs.readFileSync(casualtiesPath, 'utf8'));
        staleFigures = rows
          .filter((r: { contested?: string }) =>
            r.contested && r.contested !== 'no' && r.contested !== 'evolving')
          .slice(0, 3)
          .map((r: { category?: string; killed?: string; source?: string; note?: string }) =>
            `${sanitizeForPrompt(r.category, 80)}: ${sanitizeForPrompt(r.killed, 40)} (${sanitizeForPrompt(r.source, 60)}) ${sanitizeForPrompt(r.note, 120)}`)
          .join(' || ');
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
            const evtId = sanitizeForPrompt(evt.id || '', 80);
            const evtTitle = sanitizeForPrompt(evt.title || evt.headline || '');
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
      contestedClaims,
      staleFigures,
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

## VOICE
One voice: analyst. Sober, precise, data-first. Authority comes from the figures
and their provenance, not from tone. Never adopt a persona, never perform wit,
never write provocatively for its own sake.

## TWEET TYPES
Choose the best type for each piece of content:
- digest — daily summary, data-first
- breaking — significant development, impact-focused
- thread — complex story, 3-7 tweets, narrative arc
- data_viz — trend spotting, week-over-week, let data tell the story

These four are the differentiated ones. They can only be written by something
that has actually tracked the data, which is the whole point — a competitor can
copy a tone with a prompt, not a year of dated figures:

- contested — a figure where sourced authorities genuinely disagree. State BOTH
  sides with attribution. Do not adjudicate, do not average. The disagreement
  IS the story.
    e.g. "Two UN agencies put the Venezuela quake damage at $37bn and $6.7bn.
          Same OCHA report, same paragraph."
- stale_data — an official figure frozen while the situation moved. Give the
  freeze date and what changed around it.
    e.g. "Venezuela's official injured count hasn't moved since 5 July.
          The death toll rose 89% in that time."
- escalation — a tracker spiking above its OWN 14-day baseline. Give both
  numbers; a big ratio on a tiny baseline is noise, not news.
- cross_tracker — a pattern visible only across many trackers at once.

RULES FOR THESE FOUR
- Every figure needs a source and an as-of date. No figure without provenance.
- Never present an extrapolation as an observation.
- If the data does not support a clean claim, do not write the tweet. Returning
  fewer tweets is correct; inventing a pattern is not.

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

${trackersWithDigests.map(c => `### ${sanitizeForPrompt(c.shortName, 80)} (${c.slug}) [domain: ${c.domain}]
Digest: ${sanitizeForPrompt(c.digest?.summary, 600) || 'No update today'}
Sections updated: ${sanitizeForPrompt(c.digest?.sectionsUpdated?.join(', '), 200) || 'none'}
KPIs: ${c.kpiSnapshot || 'none'}
Recent events:
${c.recentEvents || 'none'}
Unresolved disputes: ${c.contestedClaims || 'none'}
Disputed or frozen figures: ${c.staleFigures || 'none'}
`).join('\n')}

## OUTPUT FORMAT
Respond with a JSON array of tweet objects. Each object MUST have ALL these fields:
{
  "type": "digest|breaking|thread|data_viz|contested|stale_data|escalation|cross_tracker",
  "voice": "analyst",
  "tracker": "tracker-slug",
  "lang": "en|es|fr|pt",
  "text": "the tweet body text ONLY — do NOT include the link or hashtags in this field, they are appended automatically by the poster",
  "hashtags": ["#TopicTag", "#Watchboard"],
  "link": "(see LINK RULES below)",
  "image": "(see LINK RULES below — OG image URL for breaking tweets, null otherwise)",
  "memegenUrl": null,
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
  Set "image" to null unless a stat card applies.
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
  // The four data-derived types make a factual claim about a disputed or
  // frozen figure, so a wrong one is worse than a dull one — they never
  // auto-approve, whatever the judge scores.
  const NEEDS_REVIEW: TweetType[] = ['contested', 'stale_data', 'escalation', 'cross_tracker'];
  if (NEEDS_REVIEW.includes(entry.type)) return 'pending_review';
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

  const result = await response.json() as { content?: Array<{ text?: string }> };
  const rawText = result.content?.[0]?.text?.trim();
  if (!rawText) {
    console.error('[social-queue] API response had no text content:', JSON.stringify(result).slice(0, 500));
    process.exit(1);
  }

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
        // The poster appends "\n\n{link}" to the LAST thread tweet — validate
        // the final posted text, not just the raw draft.
        const isLast = i === entry.threadTweets.length - 1;
        const postedText = isLast
          ? `${entry.threadTweets[i]}\n\n${entry.link}`
          : entry.threadTweets[i];
        const weighted = twitterWeightedLength(postedText);
        if (weighted > 280) {
          console.warn(`[social-queue] OVER LIMIT thread[${i}]${isLast ? ' (incl. link)' : ''} (${weighted}/280): ${entry.tracker}/${entry.type} — rejecting`);
          entry.status = 'rejected';
          entry.judge.comment += ` [AUTO-REJECTED: thread tweet ${i}${isLast ? ' (incl. appended link)' : ''} is ${weighted}/280 chars]`;
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
