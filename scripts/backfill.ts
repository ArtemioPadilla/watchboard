/**
 * backfill.ts — AI backfill of timeline events + map data for a date range.
 *
 * Parametrized per tracker (was previously hardcoded to the legacy src/data/
 * Iran layout). Data paths live under trackers/{slug}/data/.
 *
 * Usage:
 *   npm run backfill -- --from YYYY-MM-DD --to YYYY-MM-DD [--tracker <slug>] [--dry-run]
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { TimelineEventSchema, MapPointSchema, MapLineSchema } from '../src/lib/schemas.js';
import {
  atomicWriteFile,
  extractJSON,
  normalizeItems,
  validateItemwise,
  describeFields,
  mergeById,
} from './lib/ai-utils.js';

// ─── Configuration ───

type Provider = 'anthropic' | 'openai';

const PROVIDER: Provider = (process.env.AI_PROVIDER as Provider) || 'anthropic';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// Default kept for CLI/workflow compatibility — backfill.yml dispatches
// without a tracker input; the original script targeted the Iran theater.
const DEFAULT_TRACKER = 'iran-conflict';

const now = new Date().toISOString();

// Set in main() once the tracker slug is resolved
let DATA_DIR = '';
let EVENTS_DIR = '';

interface TrackerAiConfig {
  searchContext?: string;
  coordValidation?: { lonMin: number; lonMax: number; latMin: number; latMax: number };
}
interface TrackerConfigLite {
  slug: string;
  name?: string;
  ai?: TrackerAiConfig;
}

// Fallback theater bounds (original Iran/Middle East values)
const DEFAULT_BOUNDS = { lonMin: 25, lonMax: 65, latMin: 20, latMax: 42 };

let TRACKER: TrackerConfigLite = { slug: DEFAULT_TRACKER };
let BOUNDS = DEFAULT_BOUNDS;

// ─── Provider Clients ───

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY required');
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required');
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

// ─── AI Callers ───

async function callAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 16384,
    system: systemPrompt,
    tools: [{ type: 'web_search_20250305' as const, name: 'web_search', max_uses: 10 }],
    messages: [{ role: 'user', content: userPrompt }],
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');
}

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: OPENAI_MODEL,
    instructions: systemPrompt,
    tools: [{ type: 'web_search_preview' as const }],
    input: userPrompt,
  });
  return response.output
    .filter((item): item is OpenAI.Responses.ResponseOutputMessage => item.type === 'message')
    .flatMap(item => item.content)
    .filter((c): c is OpenAI.Responses.ResponseOutputText => c.type === 'output_text')
    .map(c => c.text)
    .join('');
}

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  if (PROVIDER === 'openai') return callOpenAI(systemPrompt, userPrompt);
  return callAnthropic(systemPrompt, userPrompt);
}

// ─── Date Utilities ───

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function formatDateHuman(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

// ─── Unified Backfill Logic ───

const SYSTEM_PROMPT = `You are a historian and intelligence analyst. You research events from specific dates.
You have access to web search to verify historical events.
You must respond with ONLY valid JSON matching the exact schema provided.
Do not include any commentary, markdown fences, or explanation outside the JSON.

MULTI-POLE SOURCING — gather information from all four media poles:
1. WESTERN: government/defense statements, Reuters, AP, BBC, CNN, NYT, WaPo
2. MIDDLE EASTERN: Al Jazeera, IRNA, Press TV, Al Arabiya, Al Mayadeen
3. EASTERN: Xinhua, CGTN, Global Times, TASS, Kyodo News, Yonhap
4. INTERNATIONAL: UN, IAEA, ICRC, HRW, Amnesty, WHO, OPCW, CSIS, ICG

Tag each source with a "pole" field: "western", "middle_eastern", "eastern", or "international".

Source tier classification:
- Tier 1: Official/primary statements
- Tier 2: Major news outlets
- Tier 3: Institutional analysis / NGO reports
- Tier 4: Unverified / social media`;

interface BackfillResult {
  events: number;
  points: number;
  lines: number;
  skipped: boolean;
}

function topicDescription(): string {
  const parts: string[] = [];
  if (TRACKER.name) parts.push(TRACKER.name);
  if (TRACKER.ai?.searchContext) parts.push(TRACKER.ai.searchContext);
  return parts.join(' — ') || TRACKER.slug;
}

async function backfillDate(date: string, existingPointIds: Set<string>, existingLineIds: Set<string>): Promise<BackfillResult> {
  const eventFile = join(EVENTS_DIR, `${date}.json`);
  const hasEvents = existsSync(eventFile);

  // Read current map data to check if this date already has coverage
  const currentPoints: z.infer<typeof MapPointSchema>[] = JSON.parse(readFileSync(join(DATA_DIR, 'map-points.json'), 'utf8'));
  const currentLines: z.infer<typeof MapLineSchema>[] = JSON.parse(readFileSync(join(DATA_DIR, 'map-lines.json'), 'utf8'));
  const hasPoints = currentPoints.some(p => p.date === date);
  const hasLines = currentLines.some(l => l.date === date);

  if (hasEvents && hasPoints && hasLines) {
    console.log(`  [skip] ${date} — already has events, points, and lines`);
    return { events: 0, points: 0, lines: 0, skipped: true };
  }

  const humanDate = formatDateHuman(date);
  const eventFields = describeFields(TimelineEventSchema);
  const pointFields = describeFields(MapPointSchema);
  const lineFields = describeFields(MapLineSchema);

  const needEvents = !hasEvents;
  const needPoints = !hasPoints;
  const needLines = !hasLines;

  const sections = [];
  if (needEvents) sections.push('events');
  if (needPoints) sections.push('points');
  if (needLines) sections.push('lines');
  console.log(`  [fetch] ${date} — need: ${sections.join(', ')}`);

  const prompt = `Search for significant events related to the following topic that occurred on or around ${humanDate} (${date}).

TOPIC: ${topicDescription()}

Search across ALL media poles for contrasting perspectives.

Return a JSON object with the following structure:
{
  ${needEvents ? `"events": [ ... ],  // timeline events for this date` : ''}
  ${needPoints ? `"points": [ ... ],  // map locations (strikes, bases, deployments) active on this date` : ''}
  ${needLines ? `"lines":  [ ... ]   // arc lines (strike routes, retaliation vectors) for this date` : ''}
}

${needEvents ? `EVENT SCHEMA — each event in the "events" array:
${eventFields}
- "year" should be a short label like "Feb 28" or "Mar 1"
- "id" must be lowercase_snake_case, e.g. "un_ceasefire_vote_mar1"
- "sources" must include sources from MULTIPLE poles
- If nothing significant happened, use an empty array []
` : ''}
${needPoints ? `MAP POINT SCHEMA — each point in the "points" array:
${pointFields}
- "date" MUST be "${date}"
- "lon" must be ${BOUNDS.lonMin} to ${BOUNDS.lonMax}, "lat" must be ${BOUNDS.latMin} to ${BOUNDS.latMax} (theater bounds)
- "tier" must be a number (1, 2, 3, or 4)
- Include: strike targets, retaliation sites, military bases, naval assets, front-line positions
- If no map-worthy locations, use an empty array []
` : ''}
${needLines ? `MAP LINE SCHEMA — each line in the "lines" array:
${lineFields}
- "date" MUST be "${date}"
- "from" and "to" are [longitude, latitude] tuples
- Include: strike routes, retaliation vectors, front lines, asset movement paths
- If no routes/vectors, use an empty array []
` : ''}
Return ONLY the JSON object with the requested arrays. No explanation or markdown.`;

  try {
    const text = await callAI(SYSTEM_PROMPT, prompt);
    const raw = JSON.parse(extractJSON(text));

    let eventCount = 0;
    let pointCount = 0;
    let lineCount = 0;

    // Process events
    if (needEvents && Array.isArray(raw.events)) {
      const EventLoose = TimelineEventSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() });
      const validEvents = validateItemwise(raw.events, EventLoose, `${date}/events`);
      if (validEvents.length > 0) {
        const stamped = validEvents.map(e => ({ ...e, lastUpdated: now }));
        atomicWriteFile(eventFile, JSON.stringify(stamped, null, 2) + '\n');
        eventCount = stamped.length;
      }
    }

    // Process points
    if (needPoints && Array.isArray(raw.points)) {
      const normalized = normalizeItems(raw.points);
      const PointLoose = MapPointSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() });
      const validPoints = validateItemwise(normalized, PointLoose, `${date}/points`)
        .filter(p => p.lon >= BOUNDS.lonMin && p.lon <= BOUNDS.lonMax && p.lat >= BOUNDS.latMin && p.lat <= BOUNDS.latMax)
        .filter(p => !existingPointIds.has(p.id)); // avoid ID conflicts
      if (validPoints.length > 0) {
        const allPoints = mergeById(currentPoints, validPoints).merged;
        atomicWriteFile(join(DATA_DIR, 'map-points.json'), JSON.stringify(allPoints, null, 2) + '\n');
        pointCount = validPoints.length;
        validPoints.forEach(p => existingPointIds.add(p.id));
      }
    }

    // Process lines
    if (needLines && Array.isArray(raw.lines)) {
      const normalized = normalizeItems(raw.lines);
      const LineLoose = MapLineSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() });
      const validLines = validateItemwise(normalized, LineLoose, `${date}/lines`)
        .filter(l => !existingLineIds.has(l.id)); // avoid ID conflicts
      if (validLines.length > 0) {
        // Re-read in case a previous date already wrote
        const freshLines: z.infer<typeof MapLineSchema>[] = JSON.parse(readFileSync(join(DATA_DIR, 'map-lines.json'), 'utf8'));
        const allLines = mergeById(freshLines, validLines).merged;
        atomicWriteFile(join(DATA_DIR, 'map-lines.json'), JSON.stringify(allLines, null, 2) + '\n');
        lineCount = validLines.length;
        validLines.forEach(l => existingLineIds.add(l.id));
      }
    }

    const parts = [];
    if (eventCount) parts.push(`${eventCount} events`);
    if (pointCount) parts.push(`${pointCount} points`);
    if (lineCount) parts.push(`${lineCount} lines`);
    console.log(`  [done] ${date} — ${parts.length > 0 ? parts.join(', ') : 'no data found'}`);

    return { events: eventCount, points: pointCount, lines: lineCount, skipped: false };
  } catch (err) {
    console.error(`  [error] ${date} — ${err}`);
    return { events: 0, points: 0, lines: 0, skipped: false };
  }
}

// ─── CLI ───

function parseArgs(): { from: string; to: string; tracker: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let from = '';
  let to = '';
  let tracker = DEFAULT_TRACKER;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) { from = args[++i]; }
    else if (args[i] === '--to' && args[i + 1]) { to = args[++i]; }
    else if (args[i] === '--tracker' && args[i + 1]) { tracker = args[++i]; }
    else if (args[i] === '--dry-run') { dryRun = true; }
  }

  if (!from || !to) {
    console.error('Usage: npm run backfill -- --from YYYY-MM-DD --to YYYY-MM-DD [--tracker <slug>] [--dry-run]');
    console.error('Example: npm run backfill -- --from 2025-12-01 --to 2026-02-27 --tracker iran-conflict');
    process.exit(1);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    console.error('Dates must be in YYYY-MM-DD format');
    process.exit(1);
  }

  if (from > to) {
    console.error('--from must be before or equal to --to');
    process.exit(1);
  }

  return { from, to, tracker, dryRun };
}

async function main() {
  const { from, to, tracker, dryRun } = parseArgs();

  // Resolve tracker paths + config
  const trackerDir = join(process.cwd(), 'trackers', tracker);
  const configPath = join(trackerDir, 'tracker.json');
  if (!existsSync(configPath)) {
    console.error(`Tracker "${tracker}" not found (expected ${configPath})`);
    process.exit(1);
  }
  TRACKER = JSON.parse(readFileSync(configPath, 'utf8'));
  BOUNDS = TRACKER.ai?.coordValidation ?? DEFAULT_BOUNDS;
  DATA_DIR = join(trackerDir, 'data');
  EVENTS_DIR = join(DATA_DIR, 'events');

  const dates = dateRange(from, to);

  if (!existsSync(EVENTS_DIR)) mkdirSync(EVENTS_DIR, { recursive: true });

  console.log(`[backfill] Tracker: ${tracker}`);
  console.log(`[backfill] Range: ${from} to ${to} (${dates.length} days)`);
  console.log(`[backfill] Provider: ${PROVIDER} (${PROVIDER === 'openai' ? OPENAI_MODEL : ANTHROPIC_MODEL})`);

  // Load existing IDs to prevent conflicts
  const existingPoints: z.infer<typeof MapPointSchema>[] = existsSync(join(DATA_DIR, 'map-points.json'))
    ? JSON.parse(readFileSync(join(DATA_DIR, 'map-points.json'), 'utf8'))
    : [];
  const existingLines: z.infer<typeof MapLineSchema>[] = existsSync(join(DATA_DIR, 'map-lines.json'))
    ? JSON.parse(readFileSync(join(DATA_DIR, 'map-lines.json'), 'utf8'))
    : [];
  if (!existsSync(join(DATA_DIR, 'map-points.json'))) atomicWriteFile(join(DATA_DIR, 'map-points.json'), '[]\n');
  if (!existsSync(join(DATA_DIR, 'map-lines.json'))) atomicWriteFile(join(DATA_DIR, 'map-lines.json'), '[]\n');
  const existingPointIds = new Set(existingPoints.map(p => p.id));
  const existingLineIds = new Set(existingLines.map(l => l.id));

  if (dryRun) {
    let gaps = 0;
    for (const d of dates) {
      const hasEvents = existsSync(join(EVENTS_DIR, `${d}.json`));
      const hasPoints = existingPoints.some(p => p.date === d);
      const hasLines = existingLines.some(l => l.date === d);
      const missing = [];
      if (!hasEvents) missing.push('events');
      if (!hasPoints) missing.push('points');
      if (!hasLines) missing.push('lines');
      if (missing.length > 0) {
        console.log(`  ${d}: missing ${missing.join(', ')}`);
        gaps++;
      }
    }
    console.log(`\n[backfill] ${gaps} dates need backfill out of ${dates.length}`);
    return;
  }

  let totalEvents = 0;
  let totalPoints = 0;
  let totalLines = 0;
  let processed = 0;
  let skipped = 0;

  for (const date of dates) {
    const result = await backfillDate(date, existingPointIds, existingLineIds);
    totalEvents += result.events;
    totalPoints += result.points;
    totalLines += result.lines;
    if (result.skipped) skipped++;
    else processed++;

    // Brief pause between API calls to avoid rate limits
    if (!result.skipped) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n[backfill] Complete:`);
  console.log(`  Processed: ${processed} dates`);
  console.log(`  Skipped (existing): ${skipped} dates`);
  console.log(`  New events: ${totalEvents}`);
  console.log(`  New points: ${totalPoints}`);
  console.log(`  New lines:  ${totalLines}`);
}

main();
