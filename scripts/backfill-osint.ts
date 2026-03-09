/**
 * OSINT Backfill Script
 *
 * Enriches existing map-lines.json strike/retaliation entries with real-world
 * data from OSINT sources via AI + web search:
 *   - time (HH:MM UTC) — actual strike timestamp
 *   - launched — munition count from official/media reports
 *   - intercepted — interception count
 *   - status — hit/intercepted/partial/unknown
 *   - weaponType — if missing
 *
 * Usage:
 *   npx tsx scripts/backfill-osint.ts [--dry-run] [--date YYYY-MM-DD]
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { MapLineSchema } from '../src/lib/schemas.js';

type Provider = 'anthropic' | 'openai';
type MapLine = z.infer<typeof MapLineSchema>;

const PROVIDER: Provider = (process.env.AI_PROVIDER as Provider) || 'anthropic';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const DATA_DIR = join(process.cwd(), 'src', 'data');

// ─── AI Callers ───

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

async function callAI(system: string, user: string): Promise<string> {
  if (PROVIDER === 'openai') {
    if (!openaiClient) openaiClient = new OpenAI();
    const res = await openaiClient.responses.create({
      model: OPENAI_MODEL,
      instructions: system,
      tools: [{ type: 'web_search_preview' as const }],
      input: user,
    });
    return res.output
      .filter((item): item is OpenAI.Responses.ResponseOutputMessage => item.type === 'message')
      .flatMap(item => item.content)
      .filter((c): c is OpenAI.Responses.ResponseOutputText => c.type === 'output_text')
      .map(c => c.text)
      .join('');
  }

  if (!anthropicClient) anthropicClient = new Anthropic();
  const res = await anthropicClient.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 16384,
    system,
    tools: [{ type: 'web_search_20250305' as const, name: 'web_search', max_uses: 15 }],
    messages: [{ role: 'user', content: user }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');
}

// ─── JSON Extraction ───

function extractJSON(text: string): string {
  let json = text.trim();
  const codeBlock = json.match(/```\w*\s*\n([\s\S]*?)\n\s*```/);
  if (codeBlock) json = codeBlock[1].trim();
  else if (json.includes('```')) {
    json = json.replace(/^```\w*\s*\n?/, '').replace(/\n?\s*```\s*$/, '').trim();
  }
  const start = json.search(/[\[{]/);
  if (start === -1) throw new Error('No JSON found');
  // Find matching close
  const openChar = json[start];
  const closeChar = openChar === '[' ? ']' : '}';
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < json.length; i++) {
    const ch = json[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === openChar) depth++;
    if (ch === closeChar) depth--;
    if (depth === 0) { end = i; break; }
  }
  if (end !== -1) json = json.substring(start, end + 1);
  // Remove trailing commas
  return json.replace(/,\s*([\]}])/g, '$1');
}

// ─── OSINT Prompt ───

const SYSTEM = `You are a military OSINT analyst with access to web search.
Your task is to find REAL timestamps and munition counts for military strikes
in the 2026 Iran-US/Israel conflict.

Search for each event using official sources:
- CENTCOM press releases, IDF statements, White House briefings
- IRNA, Fars News, IRGC statements (for Iranian retaliatory strikes)
- Reuters, AP, BBC, Al Jazeera breaking news reports
- Satellite imagery analysis (Maxar, Planet Labs)
- OSINT Twitter/X accounts (e.g., @Aurora_Intel, @IntelDoge)

For each line you MUST return:
- "id": the exact same ID from the input (DO NOT change IDs)
- "time": "HH:MM" in UTC. If exact time unknown, estimate from reports (e.g., "pre-dawn strikes" = "03:00", "morning retaliation" = "08:00"). Use null only if completely unknowable.
- "launched": integer count of munitions. Use official reports where available.
  - For "defender reports X intercepted out of Y", use Y for launched.
  - For "attacker claims X launched", use X.
  - If conflicting, note in "notes" and use the higher number.
- "intercepted": integer count intercepted. Prefer defender's count.
- "status": "hit" | "intercepted" | "partial" | "unknown"
  - "hit" = most/all reached target
  - "intercepted" = most/all shot down
  - "partial" = significant both hits and intercepts
  - "unknown" = insufficient data
- "weaponType": "ballistic" | "cruise" | "drone" | "rocket" | "mixed" | "unknown" — only if currently missing
- "notes": string with source discrepancies or key context (optional)

IMPORTANT: Return ONLY a JSON array of objects with these fields. Every object MUST have "id" matching the input.
Do NOT invent data — if you truly cannot find information for a line, return it with time: null and your best estimates marked in notes.`;

async function enrichDate(date: string, lines: MapLine[]): Promise<Record<string, Partial<MapLine>>> {
  const summary = lines.map(l => ({
    id: l.id,
    cat: l.cat,
    label: l.label,
    weaponType: l.weaponType || 'unknown',
    from_label: l.label.split('→')[0]?.trim() || '',
    to_label: l.label.split('→')[1]?.trim() || '',
  }));

  const prompt = `Find OSINT data for these ${lines.length} military events on ${date}:

${JSON.stringify(summary, null, 2)}

Search the web for each event. Use CENTCOM statements, IRNA, Reuters, AP, etc.
Return a JSON array with one object per line (same order, same IDs).

For context: This is the 2026 Iran-US/Israel conflict. On Feb 28, the US/Israel launched
a coordinated first strike on Iran's nuclear and military facilities. Iran retaliated
with ballistic missiles at US bases, Gulf states, and Israel.`;

  const text = await callAI(SYSTEM, prompt);
  const raw = JSON.parse(extractJSON(text)) as any[];

  const result: Record<string, Partial<MapLine>> = {};
  for (const item of raw) {
    if (!item.id) continue;
    const enrichment: Partial<MapLine> = {};
    if (item.time && typeof item.time === 'string' && /^\d{1,2}:\d{2}$/.test(item.time)) {
      (enrichment as any).time = item.time;
    }
    if (typeof item.launched === 'number' && item.launched > 0) {
      (enrichment as any).launched = item.launched;
    }
    if (typeof item.intercepted === 'number' && item.intercepted >= 0) {
      (enrichment as any).intercepted = item.intercepted;
    }
    if (['hit', 'intercepted', 'partial', 'unknown'].includes(item.status)) {
      (enrichment as any).status = item.status;
    }
    if (item.weaponType && ['ballistic', 'cruise', 'drone', 'rocket', 'mixed', 'unknown'].includes(item.weaponType)) {
      (enrichment as any).weaponType = item.weaponType;
    }
    if (item.notes && typeof item.notes === 'string') {
      (enrichment as any).notes = item.notes;
    }
    if (Object.keys(enrichment).length > 0) {
      result[item.id] = enrichment;
    }
  }
  return result;
}

// ─── Main ───

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dateIdx = args.indexOf('--date');
  const filterDate = dateIdx !== -1 ? args[dateIdx + 1] : null;

  const linesPath = join(DATA_DIR, 'map-lines.json');
  const allLines: MapLine[] = JSON.parse(readFileSync(linesPath, 'utf8'));

  // Group strike/retaliation lines by date
  const byDate = new Map<string, MapLine[]>();
  for (const line of allLines) {
    if (line.cat !== 'strike' && line.cat !== 'retaliation') continue;
    if (filterDate && line.date !== filterDate) continue;
    const arr = byDate.get(line.date) || [];
    arr.push(line);
    byDate.set(line.date, arr);
  }

  const dates = [...byDate.keys()].sort();
  console.log(`[osint] ${dates.length} dates, ${[...byDate.values()].flat().length} lines to enrich`);
  console.log(`[osint] Provider: ${PROVIDER} (${PROVIDER === 'openai' ? OPENAI_MODEL : ANTHROPIC_MODEL})`);

  if (dryRun) {
    for (const d of dates) {
      const lines = byDate.get(d)!;
      const missingTime = lines.filter(l => !l.time).length;
      const missingLaunched = lines.filter(l => !l.launched).length;
      console.log(`  ${d}: ${lines.length} lines (${missingTime} missing time, ${missingLaunched} missing launched)`);
    }
    return;
  }

  let totalEnriched = 0;

  for (const date of dates) {
    const lines = byDate.get(date)!;
    console.log(`\n[osint] ${date} — ${lines.length} lines`);

    try {
      const enrichments = await enrichDate(date, lines);
      let dateEnriched = 0;

      // Apply enrichments to allLines
      for (const line of allLines) {
        const e = enrichments[line.id];
        if (!e) continue;
        Object.assign(line, e);
        dateEnriched++;
      }

      console.log(`  [done] ${date} — enriched ${dateEnriched}/${lines.length} lines`);
      totalEnriched += dateEnriched;

      // Save after each date in case of interruption
      writeFileSync(linesPath, JSON.stringify(allLines, null, 2) + '\n');

      // Rate limit pause
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`  [error] ${date} — ${err}`);
    }
  }

  console.log(`\n[osint] Complete: ${totalEnriched} lines enriched`);
}

main();
