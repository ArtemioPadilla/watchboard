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
  // 1. Try code fences first
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  let json = codeBlock ? codeBlock[1].trim() : text.trim();

  // 2. If no code fence, extract by matching brackets (string-aware)
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

  // 3. Remove trailing commas before ] or }
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
      const prevJSON = JSON.stringify(prev);
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

// ─── System Prompt ───

const SYSTEM_PROMPT = `You are an intelligence analyst updating a conflict tracking dashboard.
Today's date is ${today}. You have access to web search to find the latest information.
You must respond with ONLY valid JSON matching the exact schema provided.
Do not include any commentary, markdown fences, or explanation outside the JSON.
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
Actively seek CONTRASTING perspectives from different poles when events are contested.`;

// ─── Section Updaters ───

async function updateKPIs(): Promise<SectionResult> {
  try {
    const current = readJSON<z.infer<typeof KpiSchema>[]>('kpis.json');
    const fields = describeFields(KpiSchema);
    const text = await callAI(SYSTEM_PROMPT, `Search for the latest data on the Iran-US/Israel conflict as of ${today}.
Return updated KPI metrics as a JSON array.

Each object must have these fields:
${fields}

Current data for reference:
${JSON.stringify(current, null, 2)}

Update the values and sources with the latest available data. Preserve existing IDs. Return the complete updated array.`);

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(KpiSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() })).safeParse(parsed);
    if (!result.success) {
      console.error('[kpis] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }
    const { merged, newCount, updatedCount } = mergeById(current, result.data);
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

    const text = await callAI(SYSTEM_PROMPT, `Search for new significant events in the Iran-US/Israel conflict since ${lastUpdated}.
Search across ALL media poles: Western (Reuters, AP, CNN), Middle Eastern (Al Jazeera, IRNA, Press TV), Eastern (Xinhua, CGTN), and International (UN, HRW, IAEA).
Return any new timeline entries as a JSON array. Return an empty array [] if nothing significant happened.

Each object must have these fields:
${fields}

IMPORTANT: Each event's "sources" array must include sources from MULTIPLE poles where available.
Each source object needs: { "name": string, "tier": 1|2|3|4, "url": string (optional), "pole": "western"|"middle_eastern"|"eastern"|"international" }

Existing event IDs (do NOT include these again): ${existingTitles}

Return ONLY genuinely new events as a JSON array.`);

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(TimelineEventSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() })).safeParse(parsed);
    if (!result.success) {
      console.error('[timeline] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }

    const existingIds = new Set(existingEvents.map(e => e.id));
    const newEvents = result.data.filter(e => !existingIds.has(e.id));

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
    const fields = describeFields(MapPointSchema);
    const text = await callAI(SYSTEM_PROMPT, `Search for new military locations, strike targets, or asset deployments in the Iran-US/Israel conflict as of ${today}.
Return an updated map points array as JSON.

Each object must have exactly these fields:
${fields}

Coordinate constraints: lon must be 25–65, lat must be 20–42.

Current map points:
${JSON.stringify(current, null, 2)}

Update existing points if their details have changed. Add new points for newly reported locations. Remove nothing. Return the complete updated array.`);

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(MapPointSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() })).safeParse(parsed);
    if (!result.success) {
      console.error('[map-points] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }
    const valid = result.data.filter(p => p.lon >= 25 && p.lon <= 65 && p.lat >= 20 && p.lat <= 42);
    if (valid.length !== result.data.length) {
      console.warn(`[map-points] Filtered ${result.data.length - valid.length} out-of-bounds points`);
    }
    const { merged } = mergeById(current, valid);
    writeJSON('map-points.json', merged);
    return { status: 'updated', itemCount: merged.length };
  } catch (err) {
    console.error('[map-points] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

async function updateMapLines(): Promise<SectionResult> {
  try {
    const current = readJSON<z.infer<typeof MapLineSchema>[]>('map-lines.json');
    const fields = describeFields(MapLineSchema);
    const text = await callAI(SYSTEM_PROMPT, `Search for new military strike routes, retaliation vectors, or front lines in the Iran-US/Israel conflict as of ${today}.
Return an updated map lines array as JSON.

Each object must have exactly these fields:
${fields}

Current map lines:
${JSON.stringify(current, null, 2)}

Update existing lines if their details have changed. Add new lines for newly reported attack vectors. Remove nothing. Return the complete updated array.`);

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(MapLineSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() })).safeParse(parsed);
    if (!result.success) {
      console.error('[map-lines] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }
    const { merged } = mergeById(current, result.data);
    writeJSON('map-lines.json', merged);
    return { status: 'updated', itemCount: merged.length };
  } catch (err) {
    console.error('[map-lines] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

async function updateCasualties(): Promise<SectionResult> {
  try {
    const current = readJSON<z.infer<typeof CasualtyRowSchema>[]>('casualties.json');
    const fields = describeFields(CasualtyRowSchema);
    const text = await callAI(SYSTEM_PROMPT, `Search for the latest casualty figures from the Iran-US/Israel conflict as of ${today}.
Return the updated casualty table as a JSON array.

Each object must have these fields:
${fields}

Current data:
${JSON.stringify(current, null, 2)}

Update figures that have changed. Add new rows if needed. Mark contested figures accurately. Return complete updated array.`);

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(CasualtyRowSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() })).safeParse(parsed);
    if (!result.success) {
      console.error('[casualties] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
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
    const text = await callAI(SYSTEM_PROMPT, `Search for current market prices related to the Iran conflict: crude oil (Brent, WTI), gold, S&P 500, VIX, Iranian rial.
Return updated economic indicators as a JSON array.

Each object must have these fields:
${fields}

Current data:
${JSON.stringify(current, null, 2)}

Update with the latest available market data. Return complete updated array.`);

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(EconItemSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() })).safeParse(parsed);
    if (!result.success) {
      console.error('[econ] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
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
    const text = await callAI(SYSTEM_PROMPT, `Search for the latest contested claims and information disputes in the Iran-US/Israel conflict as of ${today}.
Search across ALL media poles to find contrasting narratives: Western vs Middle Eastern vs Eastern vs International perspectives.
Return updated contested claims as a JSON array.

Each object must have these fields:
${fields}

For sideA and sideB, actively present the CONTRASTING viewpoints from different media poles.

Current claims:
${JSON.stringify(current, null, 2)}

Update existing claims if their resolution status has changed. Add new major contested claims if any. Return complete updated array.`);

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(ClaimSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() })).safeParse(parsed);
    if (!result.success) {
      console.error('[claims] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }
    const { merged } = mergeById(current, result.data);
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
    const text = await callAI(SYSTEM_PROMPT, `Search for the latest political statements and diplomatic developments in the Iran-US/Israel conflict as of ${today}.
Return updated political statements as a JSON array.

Each object must have these fields:
${fields}

Current data:
${JSON.stringify(current, null, 2)}

Update existing quotes if newer statements exist. Add new notable statements. Return complete updated array.`);

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(PolItemSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() })).safeParse(parsed);
    if (!result.success) {
      console.error('[political] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }
    const { merged } = mergeById(current, result.data);
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

    const text = await callAI(SYSTEM_PROMPT, `Search for the latest military operations in the Iran-US/Israel conflict as of ${today}.
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

Update with the latest information. Return the complete object with all three arrays.`);

    const parsed = JSON.parse(extractJSON(text));
    const StrikeLoose = StrikeItemSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() });
    const AssetLoose = AssetSchema.omit({ lastUpdated: true }).extend({ lastUpdated: z.string().optional() });
    const schema = z.object({
      strikes: z.array(StrikeLoose),
      retaliation: z.array(StrikeLoose),
      assets: z.array(AssetLoose),
    });
    const result = schema.safeParse(parsed);
    if (!result.success) {
      console.error('[military] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }
    const s = mergeById(strikes, result.data.strikes);
    const r = mergeById(retaliation, result.data.retaliation);
    const a = mergeById(assets, result.data.assets);
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
  if (runAll || sections.includes('kpis')) results.kpis = await updateKPIs();
  if (runAll || sections.includes('timeline')) results.timeline = await updateTimeline();
  if (runAll || sections.includes('map')) results.map = await updateMapPoints();
  if (runAll || sections.includes('map-lines')) results['map-lines'] = await updateMapLines();
  if (runAll || sections.includes('casualties')) results.casualties = await updateCasualties();
  if (runAll || sections.includes('econ')) results.econ = await updateEcon();
  if (runAll || sections.includes('claims')) results.claims = await updateClaims();
  if (runAll || sections.includes('political')) results.political = await updatePolitical();
  if (runAll || sections.includes('military')) results.military = await updateMilitary();

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
