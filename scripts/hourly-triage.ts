/**
 * hourly-triage.ts
 * AI triage layer for the hourly breaking-news pipeline.
 * Reads candidate headlines from hourly-scan.ts and sends them to Claude Sonnet
 * for classification into "update", "new_tracker", or "discard" actions.
 * Outputs an action plan to /tmp/hourly-action-plan.json.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  type Candidate,
  type TriageResult,
  type ActionPlan,
  type ActionPlanUpdate,
  type ActionPlanNewTracker,
  PATHS,
} from './hourly-types.js';
import { appendTriageEntries, pruneTriageLog } from '../src/lib/triage-log.js';

// --- Constants ---

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CANDIDATES_PATH = '/tmp/hourly-candidates.json';
const DEFAULT_ACTION_PLAN_PATH = '/tmp/hourly-action-plan.json';
const MODEL = 'claude-sonnet-4-6-20250514';
const MAX_TOKENS = 2048;
const TIMEOUT_MS = 60_000;

const UPDATE_CONFIDENCE_THRESHOLD = 0.6;
const NEW_TRACKER_CONFIDENCE_THRESHOLD = 0.8;

// --- Prompt Builder ---

/**
 * Builds the triage prompt for Claude Sonnet. Includes all candidate headlines
 * and recent event titles per tracker for context.
 */
export function buildTriagePrompt(
  candidates: Candidate[],
  trackerRecentEvents: Map<string, string[]>,
): string {
  const trackerContextLines: string[] = [];
  for (const [slug, titles] of trackerRecentEvents) {
    const preview = titles.slice(0, 5).join('; ');
    trackerContextLines.push(`  - ${slug}: ${preview || '(no recent events)'}`);
  }

  const candidateLines = candidates.map((c, i) => {
    const tracker = c.matchedTracker ? `matched: ${c.matchedTracker}` : 'unmatched';
    return `  [${i}] "${c.title}" | source: ${c.source} | ${tracker} | feed: ${c.feedOrigin} | url: ${c.url}`;
  });

  return `You are a news triage AI for Watchboard, an intelligence dashboard platform. Your job is to classify candidate headlines and decide what action to take.

## Active Trackers (with recent event context)
${trackerContextLines.length > 0 ? trackerContextLines.join('\n') : '  (none)'}

## Candidate Headlines
${candidateLines.join('\n')}

## Instructions

Classify each candidate with one of:
- "update": The headline contains new, significant information relevant to an existing tracker. Only use if confident this is genuinely new (not already covered by recent events).
- "new_tracker": The headline signals a major breaking event that warrants a new tracker entirely (large-scale disaster, war outbreak, major terror attack, etc.). High bar — use sparingly.
- "discard": Duplicate, opinion, minor update, unrelated, or already covered.

For each candidate, respond with:
- index: the candidate index number
- action: "update", "new_tracker", or "discard"
- tracker: the tracker slug (for "update") or null (for "new_tracker"/"discard")
- confidence: 0.0–1.0 score
- summary: one-sentence summary of the event
- reason: brief justification for your decision
- For "new_tracker" only: suggestedSlug, suggestedDomain, suggestedRegion, suggestedName

Respond with ONLY valid JSON (no markdown fences), in this exact format:
{
  "candidates": [
    { "index": 0, "action": "update", "tracker": "iran-conflict", "confidence": 0.9, "summary": "...", "reason": "..." },
    { "index": 1, "action": "discard", "tracker": null, "confidence": 0.2, "summary": "...", "reason": "..." }
  ]
}`;
}

// --- Response Parser ---

/**
 * Parses the Claude response into structured TriageResult objects.
 * Handles raw JSON, code fences, and brace extraction fallback.
 */
export function parseTriageResponse(response: string): TriageResult[] {
  let text = response.trim();

  // Strip code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Try to parse directly
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed?.candidates)) {
      return parsed.candidates as TriageResult[];
    }
  } catch {
    // fall through to brace extraction
  }

  // Brace extraction fallback: find outermost { ... }
  const braceStart = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    try {
      const extracted = text.slice(braceStart, braceEnd + 1);
      const parsed = JSON.parse(extracted);
      if (Array.isArray(parsed?.candidates)) {
        return parsed.candidates as TriageResult[];
      }
    } catch {
      // fall through
    }
  }

  return [];
}

// --- Action Plan Builder ---

/**
 * Assembles candidates and triage results into an ActionPlan.
 * Filters: update confidence >= 0.6, new_tracker confidence >= 0.8.
 * Groups "update" results by tracker slug.
 */
export function buildActionPlan(
  candidates: Candidate[],
  triageResults: TriageResult[],
): ActionPlan {
  const updatesByTracker = new Map<string, ActionPlanUpdate>();
  const newTrackers: ActionPlanNewTracker[] = [];
  let discardedCount = 0;

  for (const result of triageResults) {
    const candidate = candidates[result.index];
    if (!candidate) continue;

    if (result.action === 'discard') {
      discardedCount++;
      continue;
    }

    if (result.action === 'update') {
      if (result.confidence < UPDATE_CONFIDENCE_THRESHOLD) {
        discardedCount++;
        continue;
      }
      const tracker = result.tracker;
      if (!tracker) {
        discardedCount++;
        continue;
      }
      if (!updatesByTracker.has(tracker)) {
        updatesByTracker.set(tracker, { tracker, events: [] });
      }
      updatesByTracker.get(tracker)!.events.push({
        summary: result.summary,
        sources: [candidate.url],
        timestamp: candidate.timestamp,
      });
      continue;
    }

    if (result.action === 'new_tracker') {
      if (result.confidence < NEW_TRACKER_CONFIDENCE_THRESHOLD) {
        discardedCount++;
        continue;
      }
      if (
        !result.suggestedSlug ||
        !result.suggestedDomain ||
        !result.suggestedRegion ||
        !result.suggestedName
      ) {
        discardedCount++;
        continue;
      }
      newTrackers.push({
        suggestedSlug: result.suggestedSlug,
        suggestedDomain: result.suggestedDomain,
        suggestedRegion: result.suggestedRegion,
        suggestedName: result.suggestedName,
        triggerEvent: {
          summary: result.summary,
          sources: [candidate.url],
          timestamp: candidate.timestamp,
        },
      });
    }
  }

  return {
    updates: Array.from(updatesByTracker.values()),
    newTrackers,
    scannedAt: new Date().toISOString(),
    candidateCount: candidates.length,
    discardedCount,
  };
}

// --- Recent Event Collector ---

/**
 * Reads recent event files from all trackers and returns a map of
 * tracker slug → array of event titles (for triage context).
 */
export function collectRecentEventTitles(daysBack: number = 3): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const trackersDir = PATHS.trackersDir;

  if (!existsSync(trackersDir)) return result;

  const slugs = readdirSync(trackersDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  for (const slug of slugs) {
    const eventsDir = join(trackersDir, slug, 'data', 'events');
    if (!existsSync(eventsDir)) continue;

    const titles: string[] = [];

    const files = readdirSync(eventsDir)
      .filter((f) => f.endsWith('.json'))
      .filter((f) => {
        const dateStr = f.replace('.json', '');
        return new Date(dateStr) >= cutoff;
      })
      .sort()
      .reverse(); // most recent first

    for (const file of files) {
      try {
        const events = JSON.parse(readFileSync(join(eventsDir, file), 'utf8'));
        if (!Array.isArray(events)) continue;
        for (const event of events) {
          if (typeof event.title === 'string' && event.title) {
            titles.push(event.title);
          }
        }
        if (titles.length >= 10) break; // cap per tracker
      } catch {
        // skip malformed
      }
    }

    if (titles.length > 0) {
      result.set(slug, titles);
    }
  }

  return result;
}

// --- Claude API Call ---

/**
 * Calls Claude Sonnet via raw fetch to classify triage candidates.
 */
async function callTriage(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Anthropic API error ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  const content = data?.content?.[0]?.text;
  if (typeof content !== 'string') {
    throw new Error('Unexpected API response shape');
  }
  return content;
}

// --- Main Orchestrator ---

/**
 * Main triage function: reads candidates, calls Claude, writes action plan.
 */
export async function triage(
  candidatesPath: string = DEFAULT_CANDIDATES_PATH,
): Promise<ActionPlan | null> {
  // Read candidates
  let candidates: Candidate[];
  try {
    candidates = JSON.parse(readFileSync(candidatesPath, 'utf8'));
  } catch (err) {
    console.error(`Failed to read candidates from ${candidatesPath}:`, err);
    return null;
  }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    console.log('No candidates to triage.');
    const emptyPlan: ActionPlan = {
      updates: [],
      newTrackers: [],
      scannedAt: new Date().toISOString(),
      candidateCount: 0,
      discardedCount: 0,
    };
    writeFileSync(DEFAULT_ACTION_PLAN_PATH, JSON.stringify(emptyPlan, null, 2), 'utf8');
    return emptyPlan;
  }

  // Collect recent events for context
  const trackerRecentEvents = collectRecentEventTitles(3);

  // Build prompt
  const prompt = buildTriagePrompt(candidates, trackerRecentEvents);

  // Call Claude
  let rawResponse: string;
  try {
    rawResponse = await callTriage(prompt);
  } catch (err) {
    console.error('Triage API call failed:', err);
    return null;
  }

  // Parse response
  const triageResults = parseTriageResponse(rawResponse);
  if (triageResults.length === 0) {
    console.warn('Triage returned no parseable results. Raw response:', rawResponse);
  }

  // Build action plan
  const plan = buildActionPlan(candidates, triageResults);

  // Persist every decision to the audit log so /breaking-news-audit/ can show
  // what was discarded vs accepted.
  const logEntries = triageResults.map((r) => ({
    timestamp: new Date().toISOString(),
    candidate: candidates[r.index],
    decision: r.action as 'update' | 'new_tracker' | 'discard',
    reason: r.reason,
    confidence: r.confidence,
    model: MODEL,
    scanType: 'heavy' as const,
  }));
  appendTriageEntries(logEntries, PATHS.triageLog);
  const removed = pruneTriageLog(PATHS.triageLog, 14);
  if (removed > 0) console.log(`[triage] pruned ${removed} log entries older than 14 days`);

  // Write to disk
  writeFileSync(DEFAULT_ACTION_PLAN_PATH, JSON.stringify(plan, null, 2), 'utf8');
  console.log(
    `Triage complete: ${plan.updates.length} tracker updates, ${plan.newTrackers.length} new tracker suggestions, ${plan.discardedCount} discarded.`,
  );
  console.log(`Action plan written to ${DEFAULT_ACTION_PLAN_PATH}`);

  return plan;
}

// --- CLI Entry Point ---

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  const candidatesPath = process.argv[2] ?? DEFAULT_CANDIDATES_PATH;
  const plan = await triage(candidatesPath);
  if (!plan) {
    process.exit(1);
  }
}
