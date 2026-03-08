import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import {
  KpiSchema,
  TimelineEventSchema,
  MapPointSchema,
  MapLineSchema,
  StrikeItemSchema,
  AssetSchema,
  CasualtyRowSchema,
  EconItemSchema,
  ClaimSchema,
  PolItemSchema,
} from '../src/lib/schemas.js';

// ─── Provider Configuration ───

type Provider = 'anthropic' | 'openai';

const PROVIDER: Provider = (process.env.AI_PROVIDER as Provider) || 'anthropic';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

const DATA_DIR = join(process.cwd(), 'src', 'data');
const EVENTS_DIR = join(DATA_DIR, 'events');
const today = new Date().toISOString().split('T')[0];
const now = new Date().toISOString();

// ─── Provider Clients ───

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic');
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
    openaiClient = new OpenAI();
  }
  return openaiClient;
}

// ─── JSON Utilities ───

interface SectionResult {
  status: 'updated' | 'skipped' | 'error';
  itemCount?: number;
  newEvents?: number;
  reason?: string;
}

function readJSON<T>(filename: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf8'));
}

function writeJSON(filename: string, data: unknown): void {
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2) + '\n');
}

function extractJSON(text: string): string {
  let json = text.trim();

  // 1. Strip code fences — try regex first, then manual fallback
  const codeBlock = json.match(/```\w*\s*\n([\s\S]*?)\n\s*```/);
  if (codeBlock) {
    json = codeBlock[1].trim();
  } else if (json.includes('```')) {
    json = json.replace(/^```\w*\s*\n?/, '').replace(/\n?\s*```\s*$/, '').trim();
  }

  // 2. Extract by matching brackets (string-aware)
  const start = json.search(/[\[{]/);
  if (start === -1) throw new Error('No JSON array or object found in response');

  const openChar = json[start];
  const closeChar = openChar === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;

  for (let i = start; i < json.length; i++) {
    const ch = json[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openChar) depth++;
    if (ch === closeChar) depth--;
    if (depth === 0) { end = i; break; }
  }

  if (end !== -1) {
    json = json.substring(start, end + 1);
  } else {
    // 2b. Truncated JSON — try to repair by closing open structures
    json = repairTruncatedJSON(json.substring(start));
  }

  // 3. Remove trailing commas before ] or }
  json = removeTrailingCommas(json);

  return json;
}

/** Attempt to repair truncated JSON by closing open brackets/braces and strings */
function repairTruncatedJSON(json: string): string {
  // Walk through and track open structures
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '[' || ch === '{') stack.push(ch === '[' ? ']' : '}');
    if (ch === ']' || ch === '}') {
      stack.pop();
    }
  }

  if (stack.length === 0) return json;

  // Truncate to last complete value boundary (after a comma, colon+value, or bracket)
  // Find the last comma or closing bracket outside a string
  let truncateAt = json.length;
  let inStr2 = false;
  let esc2 = false;
  let lastComma = -1;
  let lastCloseBracket = -1;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (esc2) { esc2 = false; continue; }
    if (ch === '\\' && inStr2) { esc2 = true; continue; }
    if (ch === '"') { inStr2 = !inStr2; continue; }
    if (inStr2) continue;
    if (ch === ',') lastComma = i;
    if (ch === ']' || ch === '}') lastCloseBracket = i;
  }

  // Prefer truncating at the last complete item (after closing bracket > after comma)
  if (lastCloseBracket > lastComma && lastCloseBracket > 0) {
    truncateAt = lastCloseBracket + 1;
  } else if (lastComma > 0) {
    truncateAt = lastComma;
  }

  let repaired = json.substring(0, truncateAt);

  // Recount what still needs closing
  const stack2: string[] = [];
  let inStr3 = false;
  let esc3 = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (esc3) { esc3 = false; continue; }
    if (ch === '\\' && inStr3) { esc3 = true; continue; }
    if (ch === '"') { inStr3 = !inStr3; continue; }
    if (inStr3) continue;
    if (ch === '[' || ch === '{') stack2.push(ch === '[' ? ']' : '}');
    if (ch === ']' || ch === '}') stack2.pop();
  }

  // Close all open structures
  repaired += stack2.reverse().join('');

  return repaired;
}

/** Remove trailing commas before ] or } */
function removeTrailingCommas(json: string): string {
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

// ─── Diff Guards ───

interface DiffGuardResult {
  ok: boolean;
  reason?: string;
}

/**
 * Reject updates that would catastrophically shrink or inflate the dataset.
 * - Shrink guard: incoming must be >= 50% of existing (prevents data loss)
 * - Growth guard: incoming must be <= 200% of existing (prevents hallucination floods)
 * - Minimum: always allow if existing is < 3 items (bootstrapping)
 */
function diffGuard(existingCount: number, incomingCount: number, label: string): DiffGuardResult {
  if (existingCount < 3) return { ok: true }; // bootstrapping
  const ratio = incomingCount / existingCount;
  if (ratio < 0.5) {
    return { ok: false, reason: `${label}: incoming (${incomingCount}) is <50% of existing (${existingCount}) — blocked to prevent data loss` };
  }
  if (ratio > 2.0) {
    return { ok: false, reason: `${label}: incoming (${incomingCount}) is >200% of existing (${existingCount}) — blocked to prevent hallucination flood` };
  }
  return { ok: true };
}

// ─── Semantic Validators ───

const VALID_YEAR_RE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}$/i;
const VALID_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_ABBRS: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

/** Fix common AI mistakes in the year field for daily events */
function normalizeEventYear(event: Record<string, unknown>): void {
  const year = event.year;
  if (typeof year !== 'string') return;

  // Already valid format
  if (VALID_YEAR_RE.test(year) || VALID_DATE_RE.test(year)) return;

  // Bare year like "2026" — use today's date
  if (/^\d{4}$/.test(year)) {
    const m = MONTH_ABBRS[today.slice(5, 7)];
    const d = String(Number(today.slice(8, 10)));
    event.year = `${m} ${d}`;
    console.warn(`[timeline] Fixed bare year "${year}" → "${event.year}"`);
    return;
  }

  // Full date like "March 5, 2026" or "March 5" → "Mar 5"
  const fullMonth = year.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i);
  if (fullMonth) {
    const abbr = fullMonth[1].slice(0, 3);
    event.year = `${abbr.charAt(0).toUpperCase() + abbr.slice(1).toLowerCase()} ${fullMonth[2]}`;
    console.warn(`[timeline] Fixed full month "${year}" → "${event.year}"`);
    return;
  }

  // ISO timestamp "2026-03-07T..." → "Mar 7"
  const isoMatch = year.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (isoMatch) {
    const m = MONTH_ABBRS[isoMatch[2]];
    const d = String(Number(isoMatch[3]));
    if (m) {
      event.year = `${m} ${d}`;
      console.warn(`[timeline] Fixed ISO timestamp "${year}" → "${event.year}"`);
    }
    return;
  }

  console.warn(`[timeline] Unrecognized year format: "${year}" — leaving as-is`);
}

/** Validate map line coordinates are within theater bounds */
function validateLineCoords(line: { from: [number, number]; to: [number, number] }): boolean {
  const inBounds = (lon: number, lat: number) => lon >= 20 && lon <= 70 && lat >= 10 && lat <= 50;
  return inBounds(line.from[0], line.from[1]) && inBounds(line.to[0], line.to[1]);
}

/** Normalize parsed JSON arrays — coerce dates, fill missing fields */
function normalizeItems(items: unknown[]): unknown[] {
  return items.map(item => {
    if (typeof item !== 'object' || item === null) return item;
    const obj = item as Record<string, unknown>;

    // Coerce date fields to YYYY-MM-DD strings
    if ('date' in obj) {
      const d = obj.date;
      if (d === null || d === undefined) {
        obj.date = today;
      } else if (typeof d === 'number') {
        obj.date = String(d);
      } else if (typeof d === 'string') {
        // Try to normalize common formats: "March 4, 2026", "2026/03/04", ISO timestamps
        const parsed = new Date(d);
        if (!isNaN(parsed.getTime())) {
          obj.date = parsed.toISOString().split('T')[0];
        }
        // Already YYYY-MM-DD? Leave it
      }
    }

    // Coerce tier to number
    if ('tier' in obj && typeof obj.tier === 'string') {
      const n = parseInt(obj.tier, 10);
      if (!isNaN(n)) obj.tier = n;
    }

    // Coerce lat/lon to numbers
    for (const key of ['lat', 'lon']) {
      if (key in obj && typeof obj[key] === 'string') {
        const n = parseFloat(obj[key] as string);
        if (!isNaN(n)) obj[key] = n;
      }
    }

    // Ensure base is boolean
    if ('base' in obj && typeof obj.base !== 'boolean') {
      obj.base = obj.base === 'true' || obj.base === true;
    }

    // Coerce launched/intercepted from string to number
    for (const key of ['launched', 'intercepted']) {
      if (key in obj && typeof obj[key] === 'string') {
        const match = (obj[key] as string).match(/(\d+)/);
        if (match) obj[key] = parseInt(match[1], 10);
        else delete obj[key];
      }
    }

    return obj;
  });
}

/** Validate array items individually, keeping valid ones and logging rejects */
function validateItemwise<T>(items: unknown[], schema: z.ZodType<T>, label: string): T[] {
  const valid: T[] = [];
  let rejected = 0;
  for (let i = 0; i < items.length; i++) {
    const result = schema.safeParse(items[i]);
    if (result.success) {
      valid.push(result.data);
    } else {
      rejected++;
      console.warn(`[${label}] Item ${i} rejected:`, JSON.stringify(result.error.format()));
    }
  }
  if (rejected > 0) {
    console.warn(`[${label}] ${rejected}/${items.length} items failed validation, keeping ${valid.length} valid items`);
  }
  return valid;
}

// ─── Schema-Driven Prompt Generation ───

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

/** Generate a JSON field description from a Zod object schema, excluding lastUpdated */
function describeFields(schema: z.ZodObject<z.ZodRawShape>): string {
  const lines: string[] = [];
  for (const [key, type] of Object.entries(schema.shape)) {
    if (key === 'lastUpdated') continue;
    lines.push(`  "${key}": ${describeType(type as z.ZodType)}`);
  }
  return `{\n${lines.join(',\n')}\n}`;
}

// ─── Merge by ID ───

function mergeById<T extends { id: string }>(
  existing: T[],
  incoming: T[],
): { merged: T[]; newCount: number; updatedCount: number } {
  const map = new Map(existing.map(item => [item.id, { ...item }]));
  let newCount = 0;
  let updatedCount = 0;

  for (const item of incoming) {
    if (!item.id) continue;
    const prev = map.get(item.id);
    if (prev) {
      // Only stamp lastUpdated if something changed
      const merged = { ...prev, ...item, lastUpdated: now };
      if (JSON.stringify({ ...prev, lastUpdated: now }) !== JSON.stringify(merged)) {
        updatedCount++;
      }
      map.set(item.id, merged as T);
    } else {
      map.set(item.id, { ...item, lastUpdated: now } as T);
      newCount++;
    }
  }

  // Preserve original order, append new items at end
  const result: T[] = [];
  const seen = new Set<string>();
  for (const item of existing) {
    result.push(map.get(item.id)!);
    seen.add(item.id);
  }
  for (const [id, item] of map) {
    if (!seen.has(id)) result.push(item);
  }

  return { merged: result, newCount, updatedCount };
}

// ─── AI Providers ───

async function callAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 16384,
    system: systemPrompt,
    tools: [{ type: 'web_search_20250305' as const, name: 'web_search', max_uses: 5 }],
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

/** Call AI with retry — on first failure, retry once with a simplified prompt */
async function callAIWithRetry(
  systemPrompt: string,
  userPrompt: string,
  label: string,
  retryPrompt?: string,
): Promise<string> {
  try {
    const text = await callAI(systemPrompt, userPrompt);
    console.log(`[${label}] Raw response length: ${text.length} chars`);
    return text;
  } catch (err) {
    console.warn(`[${label}] First attempt failed: ${err}`);
    if (retryPrompt) {
      console.log(`[${label}] Retrying with simplified prompt...`);
      const text = await callAI(systemPrompt, retryPrompt);
      console.log(`[${label}] Retry response length: ${text.length} chars`);
      return text;
    }
    throw err;
  }
}

// ─── System Prompt ───

const SYSTEM_PROMPT = `You are an intelligence analyst updating a conflict tracking dashboard.
Today's date is ${today}. You have access to web search to find the latest information.
CRITICAL: Your entire response must be ONLY a raw JSON array or object — no markdown, no code fences, no prose, no explanation before or after.
Do NOT wrap in \`\`\`json blocks. Do NOT add any text before [ or {. Just output the JSON directly.
Every item must have an "id" field (lowercase_snake_case, e.g. "brent_crude", "tehran_strike").

MULTI-POLE SOURCING — gather information from all four media poles:
1. WESTERN: White House, CENTCOM, IDF, State Dept, Pentagon, Reuters, AP, BBC, CNN, NYT, WaPo, Bloomberg
2. MIDDLE EASTERN: Al Jazeera, IRNA, Press TV, Tehran Times, Al Arabiya, Al Mayadeen, Fars News
3. EASTERN: Xinhua, CGTN, Global Times, TASS, RT (note bias), Kyodo News, Yonhap
4. INTERNATIONAL: UN, IAEA, ICRC, HRW, Amnesty, WHO, OPCW, CSIS, ICG, Oxford Economics

When providing sources (especially in the "sources" array), tag each with a "pole" field:
- "western" for US/European/allied sources
- "middle_eastern" for Middle Eastern/Iranian sources
- "eastern" for Chinese/Russian/Asian sources
- "international" for UN/NGO/multilateral sources

Source tier classification:
- Tier 1: Official/primary (CENTCOM, IDF, White House, UN, IAEA, IRNA, Xinhua official)
- Tier 2: Major outlet (Reuters, AP, CNN, BBC, Al Jazeera, Xinhua, CGTN, Bloomberg, WaPo, NYT)
- Tier 3: Institutional (CSIS, HRW, HRANA, Hengaw, Oxford Economics, NetBlocks, ICG)
- Tier 4: Unverified (social media, unattributed military claims, unattributed video)

Only include information you can verify through search results. Do not fabricate data.
Actively seek CONTRASTING perspectives from different poles when events are contested.

CONFIRMATION RULES:
- Only report a military event as confirmed if it has at least 1 Tier 1 source OR 2 Tier 2+ sources from different poles.
- Single-source Tier 3/4 reports should use confidence: "low".

DEDUPLICATION:
- Same target within ±2 hours = same event — merge, do not create duplicates.
- When attacker and defender report different numbers: use defender counts for interceptions, attacker counts for launches. Note discrepancies.`;

// ─── Section Updaters ───

async function updateKPIs(): Promise<SectionResult> {
  try {
    const current = readJSON<z.infer<typeof KpiSchema>[]>('kpis.json');
    const fields = describeFields(KpiSchema);
    const text = await callAIWithRetry(SYSTEM_PROMPT, `Search for the latest data on the Iran-US/Israel conflict as of ${today}.
Return updated KPI metrics as a JSON array.

Each object must have these fields:
${fields}

Current data for reference:
${JSON.stringify(current, null, 2)}

Update the values and sources with the latest available data. Preserve existing IDs. Return the complete updated array.`,
      'kpis');

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(KpiSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() })).safeParse(parsed);
    if (!result.success) {
      console.error('[kpis] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }
    const guard = diffGuard(current.length, result.data.length, 'kpis');
    if (!guard.ok) {
      console.warn(`[kpis] ${guard.reason}`);
      return { status: 'skipped', reason: 'diff_guard' };
    }
    const { merged } = mergeById(current, result.data);
    writeJSON('kpis.json', merged);
    return { status: 'updated', itemCount: merged.length };
  } catch (err) {
    console.error('[kpis] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

async function updateTimeline(): Promise<SectionResult> {
  try {
    // Read all existing event files to get known event IDs
    if (!existsSync(EVENTS_DIR)) mkdirSync(EVENTS_DIR, { recursive: true });
    const eventFiles = readdirSync(EVENTS_DIR).filter(f => f.endsWith('.json')).sort();
    const existingEvents: z.infer<typeof TimelineEventSchema>[] = [];
    for (const file of eventFiles) {
      const data = JSON.parse(readFileSync(join(EVENTS_DIR, file), 'utf8'));
      existingEvents.push(...data);
    }

    const existingTitles = existingEvents.map(e => `${e.id}: "${e.title}"`).join(', ');
    const lastUpdated = readJSON<{ lastRun: string | null }>('update-log.json').lastRun || '2026-03-02';
    const fields = describeFields(TimelineEventSchema);

    const text = await callAIWithRetry(SYSTEM_PROMPT, `Search for new significant events in the Iran-US/Israel conflict since ${lastUpdated}.
Search across ALL media poles: Western (Reuters, AP, CNN), Middle Eastern (Al Jazeera, IRNA, Press TV), Eastern (Xinhua, CGTN), and International (UN, HRW, IAEA).
Return any new timeline entries as a JSON array. Return an empty array [] if nothing significant happened.

Each object must have these fields:
${fields}

CRITICAL FORMAT RULES:
- "year" MUST be in "Mon DD" format, e.g. "Mar 7", "Feb 28", "Jan 13". NOT "2026", NOT "March 7", NOT "2026-03-07".
- "type" MUST be one of: "military", "diplomatic", "humanitarian", "economic"
- "id" must be lowercase_snake_case, unique, descriptive (e.g. "iran_strikes_us_base_qatar_mar7")

For military events, optionally include:
- "weaponTypes": array of weapon types involved, e.g. ["ballistic", "cruise"]
- "confidence": "high"|"medium"|"low" based on source verification

IMPORTANT: Each event's "sources" array must include sources from MULTIPLE poles where available.
Each source object needs: { "name": string, "tier": 1|2|3|4, "url": string (optional), "pole": "western"|"middle_eastern"|"eastern"|"international" }

Existing event IDs (do NOT include these again): ${existingTitles}

Return ONLY genuinely new events as a JSON array.`,
      'timeline');

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(TimelineEventSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() })).safeParse(parsed);
    if (!result.success) {
      console.error('[timeline] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }

    // Normalize year field for all incoming events
    for (const event of result.data) {
      normalizeEventYear(event as unknown as Record<string, unknown>);
    }

    const existingIds = new Set(existingEvents.map(e => e.id));
    const newEvents = result.data.filter(e => !existingIds.has(e.id));

    // Cap new events per day to prevent hallucination floods
    const MAX_NEW_PER_DAY = 50;
    if (newEvents.length > MAX_NEW_PER_DAY) {
      console.warn(`[timeline] ${newEvents.length} new events exceeds cap of ${MAX_NEW_PER_DAY} — keeping first ${MAX_NEW_PER_DAY}`);
      newEvents.splice(MAX_NEW_PER_DAY);
    }

    if (newEvents.length > 0) {
      // Append to today's event file
      const todayFile = join(EVENTS_DIR, `${today}.json`);
      let todayEvents: z.infer<typeof TimelineEventSchema>[] = [];
      if (existsSync(todayFile)) {
        todayEvents = JSON.parse(readFileSync(todayFile, 'utf8'));
      }
      const todayIds = new Set(todayEvents.map(e => e.id));
      for (const event of newEvents) {
        if (!todayIds.has(event.id)) {
          todayEvents.push({ ...event, lastUpdated: now });
        }
      }
      writeFileSync(todayFile, JSON.stringify(todayEvents, null, 2) + '\n');
    }
    return { status: 'updated', newEvents: newEvents.length };
  } catch (err) {
    console.error('[timeline] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

async function updateMapPoints(): Promise<SectionResult> {
  try {
    const current = readJSON<z.infer<typeof MapPointSchema>[]>('map-points.json');
    const strikes = readJSON<unknown[]>('strike-targets.json');
    const retaliation = readJSON<unknown[]>('retaliation.json');

    const existingIds = new Set(current.map(p => p.id));
    const maxDate = [...current.map(p => p.date)].sort().pop() || '';

    // Show only recent points as context (not the full 100+ array)
    const recentPoints = current.filter(p => p.date >= maxDate).slice(0, 10);

    const example = JSON.stringify({
      id: 'natanz_strike_mar7',
      lon: 51.73,
      lat: 33.51,
      cat: 'strike',
      label: 'Natanz Nuclear Facility',
      sub: 'US/Israeli airstrike on uranium enrichment plant',
      tier: 1,
      date: today,
      base: false,
    }, null, 2);

    const text = await callAIWithRetry(SYSTEM_PROMPT, `Search for NEW military locations, strike targets, or asset deployments in the Iran-US/Israel conflict since ${maxDate}.
Return ONLY NEW points as a JSON array. Return [] if nothing new.
Do NOT return existing points — I will merge them server-side.

EXACT FORMAT — each object must look like this example:
${example}

Field rules:
- "id": lowercase_snake_case, unique (e.g. "tehran_strike_mar7")
- "lon": number, range 25–65
- "lat": number, range 20–42
- "cat": one of "strike", "retaliation", "asset", "front"
- "label": short name of the location
- "sub": description of what happened
- "tier": 1 (official), 2 (major outlet), 3 (institutional), 4 (unverified)
- "date": YYYY-MM-DD string
- "base": true only for permanent military bases

Recent existing points for reference (do NOT repeat these):
${JSON.stringify(recentPoints, null, 2)}

Cross-reference these strike/retaliation events — add map points for any missing locations:
Strikes: ${JSON.stringify(strikes.slice(-10), null, 2)}
Retaliation: ${JSON.stringify(retaliation.slice(-10), null, 2)}

Existing IDs (do NOT reuse): ${[...existingIds].slice(-30).join(', ')}

Return ONLY new points as a JSON array.`,
      'map-points',
      // Retry prompt — even simpler
      `Search for new military events in the Iran-US/Israel conflict on ${today}.
Return new map points as a JSON array. Each point needs: id (string), lon (number 25-65), lat (number 20-42), cat ("strike"|"retaliation"|"asset"|"front"), label (string), sub (string), tier (1|2|3|4), date ("${today}").
Example: ${example}
Return [] if nothing new.`,
    );

    const parsed = normalizeItems(JSON.parse(extractJSON(text)));
    const PointSchema = MapPointSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() });
    const validItems = validateItemwise(parsed, PointSchema, 'map-points');

    // Filter duplicates and out-of-bounds
    const newPoints = validItems
      .filter(p => !existingIds.has(p.id))
      .filter(p => {
        if (p.lon < 25 || p.lon > 65 || p.lat < 20 || p.lat > 42) {
          console.warn(`[map-points] Out-of-bounds: ${p.id} (${p.lon}, ${p.lat})`);
          return false;
        }
        return true;
      });

    if (newPoints.length === 0) {
      console.log('[map-points] No new valid points');
      return { status: 'updated', itemCount: current.length, newEvents: 0 };
    }

    // Cap new points per run
    const MAX_NEW = 20;
    if (newPoints.length > MAX_NEW) {
      console.warn(`[map-points] ${newPoints.length} new points exceeds cap of ${MAX_NEW}`);
      newPoints.splice(MAX_NEW);
    }

    for (const p of newPoints) {
      (p as any).lastUpdated = now;
    }
    const merged = [...current, ...newPoints];
    writeJSON('map-points.json', merged);
    console.log(`[map-points] Added ${newPoints.length} new points`);
    return { status: 'updated', itemCount: merged.length, newEvents: newPoints.length };
  } catch (err) {
    console.error('[map-points] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

async function updateMapLines(): Promise<SectionResult> {
  try {
    const current = readJSON<z.infer<typeof MapLineSchema>[]>('map-lines.json');
    const mapPoints = readJSON<z.infer<typeof MapPointSchema>[]>('map-points.json');

    const existingIds = new Set(current.map(l => l.id));
    const maxDate = [...current.map(l => l.date)].sort().pop() || '';

    // Compact coordinate lookup for the AI (recent points only)
    const recentPoints = mapPoints.filter(p => p.date >= maxDate || p.base);
    const coordLookup = recentPoints.map(p => `${p.id}: [${p.lon}, ${p.lat}] (${p.label})`).join('\n');

    // Show recent lines as examples
    const recentLines = current.filter(l => l.date >= maxDate).slice(0, 5);

    const example = JSON.stringify({
      id: 'ford_tehran_mar7',
      from: [33.5, 34.5],
      to: [51.39, 35.69],
      cat: 'strike',
      label: 'Ford CSG → Tehran',
      date: today,
      weaponType: 'cruise',
      launched: 12,
      intercepted: 3,
      confidence: 'high',
      time: '08:30',
      platform: 'USS Gerald R. Ford CSG',
      status: 'partial',
      damage: 'Multiple impacts on military compound',
      casualties: '~15 IRGC personnel killed',
      notes: 'CENTCOM reports 12 Tomahawks; IRNA claims only 4 reached target',
    }, null, 2);

    const text = await callAIWithRetry(SYSTEM_PROMPT, `Search for NEW military strike routes, retaliation vectors, or front lines in the Iran-US/Israel conflict since ${maxDate}.
Return ONLY NEW lines as a JSON array. Return [] if nothing new.
Do NOT return existing lines — I will merge them server-side.

EXACT FORMAT — each object must look like this example:
${example}

Field rules:
- "id": lowercase_snake_case, unique (e.g. "lincoln_isfahan_mar7")
- "from": [lon, lat] — origin coordinates as numbers
- "to": [lon, lat] — target coordinates as numbers
- "cat": one of "strike", "retaliation", "asset", "front"
- "label": "Origin → Target" description
- "date": YYYY-MM-DD string
- "weaponType": (optional) "ballistic"|"cruise"|"drone"|"rocket"|"mixed"|"unknown"
- "launched": (optional) integer — munitions launched
- "intercepted": (optional) integer — munitions intercepted
- "confidence": (optional) "high"|"medium"|"low"
- "time": (optional) "HH:MM" UTC — when the strike occurred
- "platform": (optional) launch platform name
- "status": (optional) "hit"|"intercepted"|"partial"|"unknown"
- "damage": (optional) brief damage description
- "casualties": (optional) per-strike casualty summary
- "notes": (optional) source discrepancies

Available coordinates (use these for "from" and "to"):
${coordLookup}

Recent existing lines for reference (do NOT repeat):
${JSON.stringify(recentLines, null, 2)}

Existing IDs (do NOT reuse): ${[...existingIds].slice(-30).join(', ')}

Return ONLY new lines as a JSON array.`,
      'map-lines',
      // Retry prompt
      `Search for new military strikes or retaliations in the Iran-US/Israel conflict on ${today}.
Return new arc lines as a JSON array. Each needs: id (string), from ([lon,lat]), to ([lon,lat]), cat ("strike"|"retaliation"|"asset"|"front"), label (string), date ("${today}").
Optional OSINT fields: weaponType ("ballistic"|"cruise"|"drone"|"rocket"|"mixed"|"unknown"), launched (int), intercepted (int), confidence ("high"|"medium"|"low"), time ("HH:MM"), platform (string), status ("hit"|"intercepted"|"partial"|"unknown"), damage (string), casualties (string), notes (string).
Example: ${example}
Return [] if nothing new.`,
    );

    const parsed = normalizeItems(JSON.parse(extractJSON(text)));
    const LineSchema = MapLineSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() });
    const validItems = validateItemwise(parsed, LineSchema, 'map-lines');

    // Filter duplicates and out-of-bounds
    const newLines = validItems
      .filter(l => !existingIds.has(l.id))
      .filter(l => {
        if (!validateLineCoords(l)) {
          console.warn(`[map-lines] Out-of-bounds: ${l.id} from=[${l.from}] to=[${l.to}]`);
          return false;
        }
        return true;
      });

    if (newLines.length === 0) {
      console.log('[map-lines] No new valid lines');
      return { status: 'updated', itemCount: current.length, newEvents: 0 };
    }

    // Cap new lines per run
    const MAX_NEW = 15;
    if (newLines.length > MAX_NEW) {
      console.warn(`[map-lines] ${newLines.length} new lines exceeds cap of ${MAX_NEW}`);
      newLines.splice(MAX_NEW);
    }

    for (const l of newLines) {
      (l as any).lastUpdated = now;
    }
    const merged = [...current, ...newLines];
    writeJSON('map-lines.json', merged);
    console.log(`[map-lines] Added ${newLines.length} new lines`);
    return { status: 'updated', itemCount: merged.length, newEvents: newLines.length };
  } catch (err) {
    console.error('[map-lines] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

async function updateCasualties(): Promise<SectionResult> {
  try {
    const current = readJSON<z.infer<typeof CasualtyRowSchema>[]>('casualties.json');
    const fields = describeFields(CasualtyRowSchema);
    const text = await callAIWithRetry(SYSTEM_PROMPT, `Search for the latest casualty figures from the Iran-US/Israel conflict as of ${today}.
Return the updated casualty table as a JSON array.

Each object must have these fields:
${fields}

Current data:
${JSON.stringify(current, null, 2)}

Update figures that have changed. Add new rows if needed. Mark contested figures accurately. Return complete updated array.`,
      'casualties');

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(CasualtyRowSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() })).safeParse(parsed);
    if (!result.success) {
      console.error('[casualties] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }
    const guard = diffGuard(current.length, result.data.length, 'casualties');
    if (!guard.ok) {
      console.warn(`[casualties] ${guard.reason}`);
      return { status: 'skipped', reason: 'diff_guard' };
    }
    const { merged } = mergeById(current, result.data);
    writeJSON('casualties.json', merged);
    return { status: 'updated', itemCount: merged.length };
  } catch (err) {
    console.error('[casualties] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

async function updateEcon(): Promise<SectionResult> {
  try {
    const current = readJSON<z.infer<typeof EconItemSchema>[]>('econ.json');
    const fields = describeFields(EconItemSchema);
    const text = await callAIWithRetry(SYSTEM_PROMPT, `Search for current market prices related to the Iran conflict: crude oil (Brent, WTI), gold, S&P 500, VIX, Iranian rial.
Return updated economic indicators as a JSON array.

Each object must have these fields:
${fields}

Current data:
${JSON.stringify(current, null, 2)}

Update with the latest available market data. Return complete updated array.`, 'econ');

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(EconItemSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() })).safeParse(parsed);
    if (!result.success) {
      console.error('[econ] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }
    const guard = diffGuard(current.length, result.data.length, 'econ');
    if (!guard.ok) {
      console.warn(`[econ] ${guard.reason}`);
      return { status: 'skipped', reason: 'diff_guard' };
    }
    const { merged } = mergeById(current, result.data);
    writeJSON('econ.json', merged);
    return { status: 'updated', itemCount: merged.length };
  } catch (err) {
    console.error('[econ] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

async function updateClaims(): Promise<SectionResult> {
  try {
    const current = readJSON<z.infer<typeof ClaimSchema>[]>('claims.json');
    const fields = describeFields(ClaimSchema);
    const text = await callAIWithRetry(SYSTEM_PROMPT, `Search for the latest contested claims and information disputes in the Iran-US/Israel conflict as of ${today}.
Search across ALL media poles to find contrasting narratives: Western vs Middle Eastern vs Eastern vs International perspectives.
Return updated contested claims as a JSON array.

Each object must have these fields:
${fields}

For sideA and sideB, actively present the CONTRASTING viewpoints from different media poles.

Current claims:
${JSON.stringify(current, null, 2)}

Update existing claims if their resolution status has changed. Add new major contested claims if any. Return complete updated array.`, 'claims');

    const parsed = JSON.parse(extractJSON(text));
    const ClaimLoose = ClaimSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() });
    const validItems = validateItemwise(parsed, ClaimLoose, 'claims');
    if (validItems.length === 0) {
      return { status: 'skipped', reason: 'all_items_invalid' };
    }
    const guard = diffGuard(current.length, validItems.length, 'claims');
    if (!guard.ok) {
      console.warn(`[claims] ${guard.reason}`);
      return { status: 'skipped', reason: 'diff_guard' };
    }
    const { merged } = mergeById(current, validItems);
    writeJSON('claims.json', merged);
    return { status: 'updated', itemCount: merged.length };
  } catch (err) {
    console.error('[claims] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

async function updatePolitical(): Promise<SectionResult> {
  try {
    const current = readJSON<z.infer<typeof PolItemSchema>[]>('political.json');
    const fields = describeFields(PolItemSchema);
    const text = await callAIWithRetry(SYSTEM_PROMPT, `Search for the latest political statements and diplomatic developments in the Iran-US/Israel conflict as of ${today}.
Return updated political statements as a JSON array.

Each object must have these fields:
${fields}

Current data:
${JSON.stringify(current, null, 2)}

Update existing quotes if newer statements exist. Add new notable statements. Return complete updated array.`, 'political');

    const parsed = JSON.parse(extractJSON(text));
    const PolLoose = PolItemSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() });
    const validItems = validateItemwise(parsed, PolLoose, 'political');
    if (validItems.length === 0) {
      return { status: 'skipped', reason: 'all_items_invalid' };
    }
    const guard = diffGuard(current.length, validItems.length, 'political');
    if (!guard.ok) {
      console.warn(`[political] ${guard.reason}`);
      return { status: 'skipped', reason: 'diff_guard' };
    }
    const { merged } = mergeById(current, validItems);
    writeJSON('political.json', merged);
    return { status: 'updated', itemCount: merged.length };
  } catch (err) {
    console.error('[political] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

async function updateMilitary(): Promise<SectionResult> {
  try {
    const strikes = readJSON<z.infer<typeof StrikeItemSchema>[]>('strike-targets.json');
    const retaliation = readJSON<z.infer<typeof StrikeItemSchema>[]>('retaliation.json');
    const assets = readJSON<z.infer<typeof AssetSchema>[]>('assets.json');
    const strikeFields = describeFields(StrikeItemSchema);
    const assetFields = describeFields(AssetSchema);

    const text = await callAIWithRetry(SYSTEM_PROMPT, `Search for the latest military operations in the Iran-US/Israel conflict as of ${today}.
Return a JSON object with three arrays:

{
  "strikes": [ ${strikeFields} ],
  "retaliation": [ ${strikeFields} ],
  "assets": [ ${assetFields} ]
}

Current data:
Strikes: ${JSON.stringify(strikes, null, 2)}
Retaliation: ${JSON.stringify(retaliation, null, 2)}
Assets: ${JSON.stringify(assets, null, 2)}

Update with the latest information. Return the complete object with all three arrays.`, 'military');

    const rawParsed = JSON.parse(extractJSON(text));
    // Normalize inner arrays if present
    const parsed = typeof rawParsed === 'object' && rawParsed !== null && !Array.isArray(rawParsed)
      ? Object.fromEntries(Object.entries(rawParsed).map(([k, v]) => [k, Array.isArray(v) ? normalizeItems(v) : v]))
      : rawParsed;
    const StrikeLoose = StrikeItemSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() });
    const AssetLoose = AssetSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() });

    // Validate each array independently — don't fail everything if one is missing
    const validStrikes = Array.isArray(parsed?.strikes) ? validateItemwise(parsed.strikes, StrikeLoose, 'military.strikes') : [];
    const validRetaliation = Array.isArray(parsed?.retaliation) ? validateItemwise(parsed.retaliation, StrikeLoose, 'military.retaliation') : [];
    const validAssets = Array.isArray(parsed?.assets) ? validateItemwise(parsed.assets, AssetLoose, 'military.assets') : [];

    if (validStrikes.length === 0 && validRetaliation.length === 0 && validAssets.length === 0) {
      console.error('[military] No valid items in any array');
      return { status: 'skipped', reason: 'all_items_invalid' };
    }

    const s = validStrikes.length > 0 ? mergeById(strikes, validStrikes) : { merged: strikes };
    const r = validRetaliation.length > 0 ? mergeById(retaliation, validRetaliation) : { merged: retaliation };
    const a = validAssets.length > 0 ? mergeById(assets, validAssets) : { merged: assets };
    writeJSON('strike-targets.json', s.merged);
    writeJSON('retaliation.json', r.merged);
    writeJSON('assets.json', a.merged);
    return { status: 'updated', itemCount: s.merged.length + r.merged.length + a.merged.length };
  } catch (err) {
    console.error('[military] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

async function updateMeta(): Promise<SectionResult> {
  try {
    const current = readJSON<{ dayCount: number; lastUpdated: string; [key: string]: unknown }>('meta.json');
    const start = new Date('2026-02-28T00:00:00Z');
    const days = Math.ceil((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
    current.dayCount = days;
    current.dateline = `DAY ${days} \u2014 ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()} \u2014 SITUATION REPORT`;
    current.lastUpdated = now;
    writeJSON('meta.json', current);
    return { status: 'updated' };
  } catch (err) {
    console.error('[meta] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

// ─── Main ───

async function main() {
  const sections = (process.env.UPDATE_SECTIONS || 'all').split(',').map(s => s.trim());
  const runAll = sections.includes('all');

  console.log(`[update-data] Starting update at ${now}`);
  console.log(`[update-data] Provider: ${PROVIDER} (${PROVIDER === 'openai' ? OPENAI_MODEL : ANTHROPIC_MODEL})`);
  console.log(`[update-data] Sections: ${runAll ? 'all' : sections.join(', ')}`);

  // Ensure events directory exists
  if (!existsSync(EVENTS_DIR)) mkdirSync(EVENTS_DIR, { recursive: true });

  const results: Record<string, SectionResult> = {};

  // Always update meta (no API call needed)
  results.meta = await updateMeta();

  // Run API-dependent sections sequentially to avoid rate limits
  // Order matters: military → map-points → map-lines (each feeds into the next)
  if (runAll || sections.includes('kpis')) results.kpis = await updateKPIs();
  if (runAll || sections.includes('timeline')) results.timeline = await updateTimeline();
  if (runAll || sections.includes('casualties')) results.casualties = await updateCasualties();
  if (runAll || sections.includes('econ')) results.econ = await updateEcon();
  if (runAll || sections.includes('claims')) results.claims = await updateClaims();
  if (runAll || sections.includes('political')) results.political = await updatePolitical();
  if (runAll || sections.includes('military')) results.military = await updateMilitary();
  if (runAll || sections.includes('map')) results.map = await updateMapPoints();
  if (runAll || sections.includes('map-lines')) results['map-lines'] = await updateMapLines();

  // Write update log
  const log = {
    lastRun: now,
    provider: PROVIDER,
    model: PROVIDER === 'openai' ? OPENAI_MODEL : ANTHROPIC_MODEL,
    sections: results,
  };
  writeJSON('update-log.json', log);

  // Summary
  console.log('\n[update-data] Results:');
  let hasUpdates = false;
  let hasErrors = false;
  for (const [section, result] of Object.entries(results)) {
    const icon = result.status === 'updated' ? '\u2713' : result.status === 'skipped' ? '\u2298' : '\u2717';
    const details = [
      result.reason ? `(${result.reason})` : '',
      result.itemCount ? `${result.itemCount} items` : '',
      result.newEvents !== undefined ? `${result.newEvents} new events` : '',
    ].filter(Boolean).join(' \u2014 ');
    console.log(`  ${icon} ${section}: ${result.status}${details ? ` \u2014 ${details}` : ''}`);
    if (result.status === 'updated') hasUpdates = true;
    if (result.status === 'error') hasErrors = true;
  }

  // Exit 0 if any section succeeded (partial success is OK)
  if (hasUpdates) {
    console.log('\n[update-data] Done. Some sections updated successfully.');
    if (hasErrors) {
      console.warn('[update-data] Warning: some sections had errors (see above).');
    }
  } else if (hasErrors) {
    console.error('\n[update-data] All sections failed.');
    process.exit(1);
  } else {
    console.log('\n[update-data] Done. No changes needed.');
  }
}

main();
