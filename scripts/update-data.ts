import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import {
  KpiSchema,
  TimelineEraSchema,
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
const today = new Date().toISOString().split('T')[0];

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

// ─── Shared Utilities ───

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
  // Extract from code fences or bare JSON
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  let json = codeBlock ? codeBlock[1].trim() : text.trim();

  if (!codeBlock) {
    const jsonMatch = json.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (jsonMatch) json = jsonMatch[1];
  }

  // Sanitize common LLM JSON issues:
  // 1. Remove single-line comments (// ...)
  json = json.replace(/\/\/[^\n]*/g, '');
  // 2. Remove multi-line comments (/* ... */)
  json = json.replace(/\/\*[\s\S]*?\*\//g, '');
  // 3. Remove trailing commas before ] or }
  json = json.replace(/,\s*([\]}])/g, '$1');

  return json;
}

// ─── Anthropic Provider ───

async function callAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 16384,
    system: systemPrompt,
    tools: [{ type: 'web_search_20250305' as const, name: 'web_search', max_uses: 5 }],
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlocks = response.content.filter(
    (b): b is Anthropic.TextBlock => b.type === 'text'
  );
  return textBlocks.map(b => b.text).join('');
}

// ─── OpenAI Provider ───

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: OPENAI_MODEL,
    instructions: systemPrompt,
    tools: [{ type: 'web_search_preview' as const }],
    input: userPrompt,
  });

  // Extract text from the response output items
  const textItems = response.output.filter(
    (item): item is OpenAI.Responses.ResponseOutputMessage => item.type === 'message'
  );
  return textItems
    .flatMap(item => item.content)
    .filter((c): c is OpenAI.Responses.ResponseOutputText => c.type === 'output_text')
    .map(c => c.text)
    .join('');
}

// ─── Unified Call ───

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  if (PROVIDER === 'openai') return callOpenAI(systemPrompt, userPrompt);
  return callAnthropic(systemPrompt, userPrompt);
}

// ─── System Prompt ───

const SYSTEM_PROMPT = `You are an intelligence analyst updating a conflict tracking dashboard.
Today's date is ${today}. You have access to web search to find the latest information.
You must respond with ONLY valid JSON matching the exact schema provided.
Do not include any commentary, markdown fences, or explanation outside the JSON.
Source every claim with its tier:
- Tier 1: Official/primary (CENTCOM, IDF, White House, UN, IAEA, government statements)
- Tier 2: Major outlet (Reuters, AP, CNN, BBC, Al Jazeera, Bloomberg, WaPo, NYT)
- Tier 3: Institutional (CSIS, HRW, HRANA, Hengaw, Oxford Economics, NetBlocks)
- Tier 4: Unverified (social media, IRGC military claims, unattributed video)
Only include information you can verify through search results. Do not fabricate data.`;

// ─── Section Updaters ───

async function updateKPIs(): Promise<SectionResult> {
  try {
    const current = readJSON<z.infer<typeof KpiSchema>[]>('kpis.json');
    const text = await callAI(SYSTEM_PROMPT, `Search for the latest data on the Iran-US/Israel conflict as of ${today}.
Return updated KPI metrics as a JSON array.

Each object must have: { "label": string, "value": string, "color": "red"|"amber"|"blue"|"green", "source": string, "contested": boolean, "contestNote"?: string }

Current data for reference:
${JSON.stringify(current, null, 2)}

Update the values and sources with the latest available data. Preserve the same metric labels unless a metric is no longer relevant. Return the complete updated array.`);

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(KpiSchema).safeParse(parsed);
    if (!result.success) {
      console.error('[kpis] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }
    writeJSON('kpis.json', result.data);
    return { status: 'updated', itemCount: result.data.length };
  } catch (err) {
    console.error('[kpis] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

async function updateTimeline(): Promise<SectionResult> {
  try {
    const current = readJSON<z.infer<typeof TimelineEraSchema>[]>('timeline.json');
    const crisis2026 = current.find(e => e.era === 'Crisis & War 2026');
    if (!crisis2026) return { status: 'skipped', reason: 'no_crisis_era_found' };

    const lastUpdated = readJSON<{ lastRun: string | null }>('update-log.json').lastRun || '2026-03-02';

    const text = await callAI(SYSTEM_PROMPT, `Search for new significant events in the Iran-US/Israel conflict since ${lastUpdated}.
Return any new timeline entries as a JSON array. Return an empty array [] if nothing significant happened.

Each object must have: { "year": string, "title": string, "type": "military"|"diplomatic"|"humanitarian"|"economic", "active"?: boolean, "detail": string, "sources": [{ "name": string, "tier": 1|2|3|4, "url"?: string }] }

Current "Crisis & War 2026" events for reference (do NOT include these again):
${JSON.stringify(crisis2026.events, null, 2)}

Return ONLY genuinely new events as a JSON array.`);

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(TimelineEventSchema).safeParse(parsed);
    if (!result.success) {
      console.error('[timeline] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }

    const existingTitles = new Set(crisis2026.events.map(e => e.title.toLowerCase()));
    const newEvents = result.data.filter(e => !existingTitles.has(e.title.toLowerCase()));

    if (newEvents.length > 0) {
      crisis2026.events.push(...newEvents);
      writeJSON('timeline.json', current);
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
    const text = await callAI(SYSTEM_PROMPT, `Search for new military locations, strike targets, or asset deployments in the Iran-US/Israel conflict as of ${today}.
Return an updated map points array as JSON.

Each object must have exactly these fields: { "id": string (lowercase_snake_case), "lon": number (25-65 range), "lat": number (20-42 range), "cat": "strike"|"retaliation"|"asset"|"front", "label": string, "sub": string (description), "tier": 1|2|3|4 }
Do NOT include any extra fields.

Current map points:
${JSON.stringify(current, null, 2)}

Update existing points if their details have changed. Add new points for newly reported locations. Remove nothing. Return the complete updated array.`);

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(MapPointSchema).safeParse(parsed);
    if (!result.success) {
      console.error('[map-points] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }
    const valid = result.data.filter(p => p.lon >= 25 && p.lon <= 65 && p.lat >= 20 && p.lat <= 42);
    if (valid.length !== result.data.length) {
      console.warn(`[map-points] Filtered ${result.data.length - valid.length} out-of-bounds points`);
    }
    writeJSON('map-points.json', valid);
    return { status: 'updated', itemCount: valid.length };
  } catch (err) {
    console.error('[map-points] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

async function updateMapLines(): Promise<SectionResult> {
  try {
    const current = readJSON<z.infer<typeof MapLineSchema>[]>('map-lines.json');
    const text = await callAI(SYSTEM_PROMPT, `Search for new military strike routes, retaliation vectors, or front lines in the Iran-US/Israel conflict as of ${today}.
Return an updated map lines array as JSON.

Each object must have exactly these fields: { "from": [lon, lat], "to": [lon, lat], "cat": "strike"|"retaliation"|"asset"|"front", "label": string (e.g. "Ford → Tehran") }
Do NOT include any extra fields.

Current map lines:
${JSON.stringify(current, null, 2)}

Update existing lines if their details have changed. Add new lines for newly reported attack vectors. Remove nothing. Return the complete updated array.`);

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(MapLineSchema).safeParse(parsed);
    if (!result.success) {
      console.error('[map-lines] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }
    writeJSON('map-lines.json', result.data);
    return { status: 'updated', itemCount: result.data.length };
  } catch (err) {
    console.error('[map-lines] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

async function updateCasualties(): Promise<SectionResult> {
  try {
    const current = readJSON<z.infer<typeof CasualtyRowSchema>[]>('casualties.json');
    const text = await callAI(SYSTEM_PROMPT, `Search for the latest casualty figures from the Iran-US/Israel conflict as of ${today}.
Return the updated casualty table as a JSON array.

Each object must have: { "category": string, "killed": string, "injured": string, "source": string, "tier": 1|2|3|4|"all", "contested": "yes"|"no"|"evolving"|"heavily"|"partial", "note": string }

Current data:
${JSON.stringify(current, null, 2)}

Update figures that have changed. Add new rows if needed. Mark contested figures accurately. Return complete updated array.`);

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(CasualtyRowSchema).safeParse(parsed);
    if (!result.success) {
      console.error('[casualties] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }
    writeJSON('casualties.json', result.data);
    return { status: 'updated', itemCount: result.data.length };
  } catch (err) {
    console.error('[casualties] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

async function updateEcon(): Promise<SectionResult> {
  try {
    const current = readJSON<z.infer<typeof EconItemSchema>[]>('econ.json');
    const text = await callAI(SYSTEM_PROMPT, `Search for current market prices related to the Iran conflict: crude oil (Brent, WTI), gold, S&P 500, VIX, Iranian rial.
Return updated economic indicators as a JSON array.

Each object must have: { "label": string, "value": string, "change": string, "direction": "up"|"down", "sparkData": number[] (7 recent data points), "color": string (hex like "#e74c3c"), "source": string }

Current data:
${JSON.stringify(current, null, 2)}

Update with the latest available market data. Return complete updated array.`);

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(EconItemSchema).safeParse(parsed);
    if (!result.success) {
      console.error('[econ] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }
    writeJSON('econ.json', result.data);
    return { status: 'updated', itemCount: result.data.length };
  } catch (err) {
    console.error('[econ] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

async function updateClaims(): Promise<SectionResult> {
  try {
    const current = readJSON<z.infer<typeof ClaimSchema>[]>('claims.json');
    const text = await callAI(SYSTEM_PROMPT, `Search for the latest contested claims and information disputes in the Iran-US/Israel conflict as of ${today}.
Return updated contested claims as a JSON array.

Each object must have: { "question": string, "sideA": { "label": string, "text": string }, "sideB": { "label": string, "text": string }, "resolution": string }

Current claims:
${JSON.stringify(current, null, 2)}

Update existing claims if their resolution status has changed. Add new major contested claims if any. Return complete updated array.`);

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(ClaimSchema).safeParse(parsed);
    if (!result.success) {
      console.error('[claims] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }
    writeJSON('claims.json', result.data);
    return { status: 'updated', itemCount: result.data.length };
  } catch (err) {
    console.error('[claims] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

async function updatePolitical(): Promise<SectionResult> {
  try {
    const current = readJSON<z.infer<typeof PolItemSchema>[]>('political.json');
    const text = await callAI(SYSTEM_PROMPT, `Search for the latest political statements and diplomatic developments in the Iran-US/Israel conflict as of ${today}.
Return updated political statements as a JSON array.

Each object must have: { "name": string, "role": string, "avatar": "us"|"ir"|"il"|"un"|"other", "initial": string (2-letter), "quote": string }

Current data:
${JSON.stringify(current, null, 2)}

Update existing quotes if newer statements exist. Add new notable statements. Return complete updated array.`);

    const parsed = JSON.parse(extractJSON(text));
    const result = z.array(PolItemSchema).safeParse(parsed);
    if (!result.success) {
      console.error('[political] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }
    writeJSON('political.json', result.data);
    return { status: 'updated', itemCount: result.data.length };
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

    const text = await callAI(SYSTEM_PROMPT, `Search for the latest military operations in the Iran-US/Israel conflict as of ${today}.
Return a JSON object with three arrays:

{
  "strikes": [{ "name": string, "detail": string, "icon": "target"|"retaliation"|"asset"|"casualty", "time": string, "tier": 1|2|3|4 }],
  "retaliation": [{ "name": string, "detail": string, "icon": "target"|"retaliation"|"asset"|"casualty", "time": string, "tier": 1|2|3|4 }],
  "assets": [{ "type": string, "name": string, "detail": string }]
}

Current data:
Strikes: ${JSON.stringify(strikes, null, 2)}
Retaliation: ${JSON.stringify(retaliation, null, 2)}
Assets: ${JSON.stringify(assets, null, 2)}

Update with the latest information. Return the complete object with all three arrays.`);

    const parsed = JSON.parse(extractJSON(text));
    const schema = z.object({
      strikes: z.array(StrikeItemSchema),
      retaliation: z.array(StrikeItemSchema),
      assets: z.array(AssetSchema),
    });
    const result = schema.safeParse(parsed);
    if (!result.success) {
      console.error('[military] Validation failed:', result.error.format());
      return { status: 'skipped', reason: 'validation_failed' };
    }
    writeJSON('strike-targets.json', result.data.strikes);
    writeJSON('retaliation.json', result.data.retaliation);
    writeJSON('assets.json', result.data.assets);
    return { status: 'updated', itemCount: result.data.strikes.length + result.data.retaliation.length + result.data.assets.length };
  } catch (err) {
    console.error('[military] Error:', err);
    return { status: 'error', reason: String(err) };
  }
}

async function updateMeta(): Promise<SectionResult> {
  try {
    const current = readJSON<{ dayCount: number; lastUpdated: string; [key: string]: unknown }>('meta.json');
    const start = new Date('2026-02-28T00:00:00Z');
    const now = new Date();
    const days = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    current.dayCount = days;
    current.dateline = `DAY ${days} \u2014 ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()} \u2014 SITUATION REPORT`;
    current.lastUpdated = now.toISOString();
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

  console.log(`[update-data] Starting update at ${new Date().toISOString()}`);
  console.log(`[update-data] Provider: ${PROVIDER} (${PROVIDER === 'openai' ? OPENAI_MODEL : ANTHROPIC_MODEL})`);
  console.log(`[update-data] Sections: ${runAll ? 'all' : sections.join(', ')}`);

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
    lastRun: new Date().toISOString(),
    provider: PROVIDER,
    model: PROVIDER === 'openai' ? OPENAI_MODEL : ANTHROPIC_MODEL,
    sections: results,
  };
  writeJSON('update-log.json', log);

  // Summary
  console.log('\n[update-data] Results:');
  for (const [section, result] of Object.entries(results)) {
    const emoji = result.status === 'updated' ? '✓' : result.status === 'skipped' ? '⊘' : '✗';
    console.log(`  ${emoji} ${section}: ${result.status}${result.reason ? ` (${result.reason})` : ''}${result.itemCount ? ` — ${result.itemCount} items` : ''}${result.newEvents !== undefined ? ` — ${result.newEvents} new events` : ''}`);
  }

  const hasErrors = Object.values(results).some(r => r.status === 'error');
  if (hasErrors) {
    console.error('\n[update-data] Some sections had errors. See log above.');
    process.exit(1);
  }

  console.log('\n[update-data] Done.');
}

main();
