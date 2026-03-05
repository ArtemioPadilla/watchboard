import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { TimelineEventSchema, SourceSchema } from '../src/lib/schemas.js';

// ─── Configuration ───

type Provider = 'anthropic' | 'openai';

const PROVIDER: Provider = (process.env.AI_PROVIDER as Provider) || 'anthropic';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

const DATA_DIR = join(process.cwd(), 'src', 'data');
const EVENTS_DIR = join(DATA_DIR, 'events');
const now = new Date().toISOString();

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

// ─── Utilities ───

function extractJSON(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  let json = codeBlock ? codeBlock[1].trim() : text.trim();

  if (!codeBlock) {
    const start = json.search(/[\[{]/);
    if (start === -1) return json;

    const openChar = json[start];
    const closeChar = openChar === '[' ? ']' : '}';
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < json.length; i++) {
      const ch = json[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === openChar) depth++;
      if (ch === closeChar) depth--;
      if (depth === 0) {
        json = json.substring(start, i + 1);
        break;
      }
    }
  }

  // Remove trailing commas
  let result = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (esc) { esc = false; result += ch; continue; }
    if (ch === '\\' && inStr) { esc = true; result += ch; continue; }
    if (ch === '"') { inStr = !inStr; result += ch; continue; }
    if (inStr) { result += ch; continue; }
    if (ch === ',') {
      const rest = json.substring(i + 1).match(/^\s*([\]}])/);
      if (rest) continue;
    }
    result += ch;
  }

  return result;
}

function describeType(type: z.ZodType): string {
  if (type instanceof z.ZodString) return 'string';
  if (type instanceof z.ZodNumber) return 'number';
  if (type instanceof z.ZodBoolean) return 'boolean';
  if (type instanceof z.ZodEnum) return (type as z.ZodEnum<[string, ...string[]]>).options.map((o: string) => `"${o}"`).join(' | ');
  if (type instanceof z.ZodOptional) return describeType((type as z.ZodOptional<z.ZodType>).unwrap()) + ' (optional)';
  if (type instanceof z.ZodArray) return describeType((type as z.ZodArray<z.ZodType>).element) + '[]';
  if (type instanceof z.ZodUnion) return (type as z.ZodUnion<[z.ZodType, ...z.ZodType[]]>).options.map((o: z.ZodType) => describeType(o)).join(' | ');
  if (type instanceof z.ZodLiteral) return JSON.stringify((type as z.ZodLiteral<unknown>).value);
  if (type instanceof z.ZodTuple) {
    const items = (type as z.ZodTuple<[z.ZodType, ...z.ZodType[]]>).items.map((i: z.ZodType) => describeType(i));
    return `[${items.join(', ')}]`;
  }
  if (type instanceof z.ZodObject) {
    const shape = (type as z.ZodObject<z.ZodRawShape>).shape;
    const fields = Object.entries(shape).map(([k, v]) => `"${k}": ${describeType(v as z.ZodType)}`);
    return `{ ${fields.join(', ')} }`;
  }
  return 'any';
}

function describeFields(schema: z.ZodObject<z.ZodRawShape>): string {
  const lines: string[] = [];
  for (const [key, type] of Object.entries(schema.shape)) {
    if (key === 'lastUpdated') continue;
    lines.push(`  "${key}": ${describeType(type as z.ZodType)}`);
  }
  return `{\n${lines.join(',\n')}\n}`;
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

// ─── Backfill Logic ───

const SYSTEM_PROMPT = `You are a historian and intelligence analyst. You research events from specific dates.
You have access to web search to verify historical events.
You must respond with ONLY valid JSON matching the exact schema provided.
Do not include any commentary, markdown fences, or explanation outside the JSON.

MULTI-POLE SOURCING — gather information from all four media poles:
1. WESTERN: White House, CENTCOM, IDF, State Dept, Pentagon, Reuters, AP, BBC, CNN, NYT, WaPo
2. MIDDLE EASTERN: Al Jazeera, IRNA, Press TV, Tehran Times, Al Arabiya, Al Mayadeen, Fars News
3. EASTERN: Xinhua, CGTN, Global Times, TASS, Kyodo News, Yonhap
4. INTERNATIONAL: UN, IAEA, ICRC, HRW, Amnesty, WHO, OPCW, CSIS, ICG

Tag each source with a "pole" field: "western", "middle_eastern", "eastern", or "international".

Source tier classification:
- Tier 1: Official/primary statements
- Tier 2: Major news outlets
- Tier 3: Institutional analysis / NGO reports
- Tier 4: Unverified / social media`;

async function backfillDate(date: string): Promise<{ events: number; skipped: boolean }> {
  const eventFile = join(EVENTS_DIR, `${date}.json`);
  if (existsSync(eventFile)) {
    console.log(`  [skip] ${date} — event file already exists`);
    return { events: 0, skipped: true };
  }

  const fields = describeFields(TimelineEventSchema);
  const humanDate = formatDateHuman(date);

  const prompt = `Search for significant events related to the Iran-US/Israel conflict that occurred on or around ${humanDate} (${date}).
This includes: the 2026 Iran crisis, US-Iran tensions, Israeli involvement, Gulf state reactions, UN responses, economic impacts, humanitarian situations.

Search across ALL media poles for contrasting perspectives.

If significant events happened on this date, return them as a JSON array.
If nothing significant happened on this date, return an empty array: []

Each event object must have these fields:
${fields}

The "year" field should be a short date label like "Feb 28" or "Mar 1".
The "id" field should be lowercase_snake_case describing the event, e.g. "un_ceasefire_vote_mar1".
The "sources" array must include sources from MULTIPLE poles:
  { "name": string, "tier": 1|2|3|4, "url": string (optional), "pole": "western"|"middle_eastern"|"eastern"|"international" }

Return ONLY the JSON array.`;

  try {
    const text = await callAI(SYSTEM_PROMPT, prompt);
    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(
      TimelineEventSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() })
    ).safeParse(parsed);

    if (!result.success) {
      console.error(`  [error] ${date} — validation failed:`, result.error.format());
      return { events: 0, skipped: false };
    }

    if (result.data.length === 0) {
      console.log(`  [none] ${date} — no significant events`);
      return { events: 0, skipped: false };
    }

    // Stamp lastUpdated
    const events = result.data.map(e => ({ ...e, lastUpdated: now }));
    writeFileSync(eventFile, JSON.stringify(events, null, 2) + '\n');
    console.log(`  [done] ${date} — ${events.length} event(s) written`);
    return { events: events.length, skipped: false };
  } catch (err) {
    console.error(`  [error] ${date} — ${err}`);
    return { events: 0, skipped: false };
  }
}

// ─── CLI ───

function parseArgs(): { from: string; to: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let from = '';
  let to = '';
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) { from = args[++i]; }
    else if (args[i] === '--to' && args[i + 1]) { to = args[++i]; }
    else if (args[i] === '--dry-run') { dryRun = true; }
  }

  if (!from || !to) {
    console.error('Usage: npm run backfill -- --from YYYY-MM-DD --to YYYY-MM-DD [--dry-run]');
    console.error('Example: npm run backfill -- --from 2025-12-01 --to 2026-02-27');
    process.exit(1);
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    console.error('Dates must be in YYYY-MM-DD format');
    process.exit(1);
  }

  if (from > to) {
    console.error('--from must be before or equal to --to');
    process.exit(1);
  }

  return { from, to, dryRun };
}

async function main() {
  const { from, to, dryRun } = parseArgs();
  const dates = dateRange(from, to);

  if (!existsSync(EVENTS_DIR)) mkdirSync(EVENTS_DIR, { recursive: true });

  console.log(`[backfill] Range: ${from} to ${to} (${dates.length} days)`);
  console.log(`[backfill] Provider: ${PROVIDER} (${PROVIDER === 'openai' ? OPENAI_MODEL : ANTHROPIC_MODEL})`);

  if (dryRun) {
    const existing = dates.filter(d => existsSync(join(EVENTS_DIR, `${d}.json`)));
    const missing = dates.filter(d => !existsSync(join(EVENTS_DIR, `${d}.json`)));
    console.log(`[backfill] Existing: ${existing.length} files`);
    console.log(`[backfill] To backfill: ${missing.length} dates`);
    missing.forEach(d => console.log(`  ${d}`));
    return;
  }

  let totalEvents = 0;
  let processed = 0;
  let skipped = 0;

  for (const date of dates) {
    const result = await backfillDate(date);
    totalEvents += result.events;
    if (result.skipped) skipped++;
    else processed++;

    // Brief pause between API calls to avoid rate limits
    if (!result.skipped && processed < dates.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n[backfill] Complete:`);
  console.log(`  Processed: ${processed} dates`);
  console.log(`  Skipped (existing): ${skipped} dates`);
  console.log(`  Total new events: ${totalEvents}`);
}

main();
