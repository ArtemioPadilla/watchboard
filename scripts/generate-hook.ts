#!/usr/bin/env tsx
/**
 * generate-hook.ts — writes hook headline candidates for the daily video.
 *
 * #157: "Videos open with 'Daily Intelligence Brief - Date' which is an index,
 * not a cliffhanger." The hook composition (#228) opens on a headline instead,
 * but tracker headlines are dashboard copy — several developments joined with
 * semicolons — so the deterministic fallback can only trim, never rewrite.
 * This produces actual hooks.
 *
 * Follows the same shape as generate-social-queue.ts: write a prompt, call the
 * API directly if ANTHROPIC_API_KEY is present, otherwise leave the prompt for
 * claude-code-action to pick up in CI.
 *
 * Usage:
 *   npx tsx scripts/generate-hook.ts [--dry-run]
 *
 * Writes video/src/data/hook.json:
 *   { generatedAt, tracker, candidates: [{ pattern, text }], chosen }
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deriveHookHeadline } from '../video/src/data/hook-headline.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BREAKING = join(ROOT, 'video', 'src', 'data', 'breaking.json');
const OUT = join(ROOT, 'video', 'src', 'data', 'hook.json');
const PROMPT_OUT = join(ROOT, 'video', 'src', 'data', 'hook-prompt.txt');

/** The four openings #157 specifies, with the reason each one works. */
export const HOOK_PATTERNS = [
  { id: 'threat',      shape: '[Actor] just [action]. Here is why that matters.' },
  { id: 'countdown',   shape: '[Entity] has [N days] to [decision]. The clock is ticking.' },
  { id: 'contrarian',  shape: 'Everyone thinks [common take]. The data says otherwise.' },
  { id: 'stakes',      shape: 'This one [event] could [big consequence].' },
] as const;

export interface HookCandidate { pattern: string; text: string }
export interface HookFile {
  generatedAt: string;
  tracker: string;
  candidates: HookCandidate[];
  chosen: string;
  source: 'llm' | 'derived';
}

export function buildPrompt(tracker: { name?: string; headline?: string; kpis?: unknown }): string {
  return [
    'You write opening lines for a 18-second vertical news video. The line is on',
    'screen for two seconds and decides whether anyone watches the rest.',
    '',
    `Tracker: ${tracker.name ?? 'unknown'}`,
    `Current headline: ${tracker.headline ?? '(none)'}`,
    tracker.kpis ? `Key figures: ${JSON.stringify(tracker.kpis).slice(0, 600)}` : '',
    '',
    'Write one candidate for each of these four patterns:',
    ...HOOK_PATTERNS.map((p) => `  ${p.id}: ${p.shape}`),
    '',
    'Rules:',
    '  - Maximum 72 characters. It renders at display size; longer will not fit.',
    '  - Use only facts present above. Do not invent numbers, dates or claims.',
    '  - If a pattern does not fit the facts, return an empty string for it',
    '    rather than forcing it. A dishonest hook is worse than a dull one.',
    '  - No hashtags, no emoji, no trailing punctuation.',
    '',
    'Return ONLY a JSON array: [{"pattern":"threat","text":"..."}, ...]',
  ].filter(Boolean).join('\n');
}

/** Rejects candidates that break the rules, so a bad generation cannot ship. */
export function validateCandidates(raw: unknown): HookCandidate[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set(HOOK_PATTERNS.map((p) => p.id as string));
  const out: HookCandidate[] = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const pattern = (c as HookCandidate).pattern;
    const text = (c as HookCandidate).text;
    if (typeof pattern !== 'string' || typeof text !== 'string') continue;
    if (!valid.has(pattern)) continue;
    const trimmed = text.trim();
    if (trimmed.length === 0) continue;          // pattern declined — expected
    if (trimmed.length > 72) continue;           // will not render
    if (/[#@]|[\u{1F300}-\u{1FAFF}]/u.test(trimmed)) continue;
    out.push({ pattern, text: trimmed.replace(/[.,;:]$/, '') });
  }
  return out;
}

/**
 * Pick order is deliberate, not arbitrary: threat and countdown carry a
 * concrete fact and a reason to keep watching, contrarian needs the viewer to
 * hold a prior, and stakes is the vaguest. Ties go to the shorter line.
 */
export function chooseHook(candidates: HookCandidate[], fallback: string): string {
  const order = ['threat', 'countdown', 'stakes', 'contrarian'];
  const ranked = [...candidates].sort((a, b) => {
    const d = order.indexOf(a.pattern) - order.indexOf(b.pattern);
    return d !== 0 ? d : a.text.length - b.text.length;
  });
  return ranked[0]?.text ?? fallback;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  if (!existsSync(BREAKING)) {
    console.error(`[hook] ${BREAKING} not found — run the video data fetch first`);
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(BREAKING, 'utf-8')) as {
    trackers?: Array<{ name?: string; slug?: string; headline?: string; kpis?: unknown }>;
  };
  const lead = data.trackers?.[0];
  if (!lead) {
    console.error('[hook] breaking.json has no trackers');
    process.exit(1);
  }

  const fallback = deriveHookHeadline(lead.headline, lead.name ?? 'Breaking');
  const prompt = buildPrompt(lead);
  mkdirSync(dirname(PROMPT_OUT), { recursive: true });
  writeFileSync(PROMPT_OUT, prompt);

  const write = (candidates: HookCandidate[], source: HookFile['source']) => {
    const file: HookFile = {
      generatedAt: new Date().toISOString(),
      tracker: lead.slug ?? lead.name ?? 'unknown',
      candidates,
      chosen: chooseHook(candidates, fallback),
      source,
    };
    writeFileSync(OUT, JSON.stringify(file, null, 2) + '\n');
    console.log(`[hook] ${source}: "${file.chosen}"`);
  };

  if (dryRun) {
    console.log('[hook] dry run — prompt written, no LLM call');
    write([], 'derived');
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Same contract as generate-social-queue.ts: leave the prompt for
    // claude-code-action, and still write a usable hook so the render never
    // blocks on the LLM being reachable.
    console.log('[hook] No ANTHROPIC_API_KEY — wrote prompt, falling back to derived headline');
    write([], 'derived');
    return;
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const body = await res.json() as { content?: Array<{ text?: string }> };
    const text = body.content?.[0]?.text?.trim() ?? '';
    const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
    write(validateCandidates(JSON.parse(json)), 'llm');
  } catch (err) {
    // A failed hook must never fail the video. The derived headline is worse
    // copy but it is always correct, and a missing video is worse than a dull
    // opening line.
    console.warn(`[hook] generation failed, using derived headline: ${(err as Error).message}`);
    write([], 'derived');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
