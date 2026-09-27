#!/usr/bin/env tsx
/**
 * narrate-elevenlabs.ts — voice-over for the daily brief video.
 *
 * Replaces the AWS Polly step in `.github/workflows/daily-video.yml`
 * (issue #244). Polly had been failing with `NoCredentials` on every run —
 * the workflow never configured AWS — and `continue-on-error` plus `|| echo`
 * hid it, so every video shipped silent while the run stayed green. This
 * script produces the same file at the same path the ffmpeg merge step
 * expects, and everything downstream is unchanged.
 *
 * Contract:
 *   exit 0  — the MP3 exists at --out, is ≥ MIN_BYTES and starts like MPEG audio
 *   exit 3  — ELEVENLABS_API_KEY is not set: nothing was attempted (the
 *             workflow treats this as "ship without narration" with a warning)
 *   exit 1  — the API refused, the network failed or the file is not usable.
 *             Nothing is written on failure, so the merge step cannot pick up
 *             a half-downloaded file.
 *
 * Usage:
 *   npx tsx scripts/narrate-elevenlabs.ts --mode breaking --lang en --out video/output/narration-en.mp3
 *   npx tsx scripts/narrate-elevenlabs.ts --mode progress --lang es --out video/output/narration-progress-es.mp3
 *   npx tsx scripts/narrate-elevenlabs.ts --mode breaking --lang en --print   # text only, no API call
 *
 * Environment:
 *   ELEVENLABS_API_KEY   required for a real call
 *   ELEVENLABS_VOICE_EN  optional voice id override (default: a public premade voice)
 *   ELEVENLABS_VOICE_ES  optional voice id override
 *   ELEVENLABS_MODEL_ID  optional, default eleven_multilingual_v2
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export type NarrationMode = 'breaking' | 'progress';
export type NarrationLang = 'en' | 'es';

export const DEFAULT_MODEL_ID = 'eleven_multilingual_v2';
export const API_BASE = 'https://api.elevenlabs.io';
/** A 15-second MP3 at 128 kbps is ~240 KB; anything under this is an error page, not audio. */
export const MIN_BYTES = 1024;
/** Hard ceiling from the API for a single request; we are far under it. */
export const MAX_CHARS = 5000;

/**
 * ElevenLabs premade voices, public to every account. Overridable through
 * ELEVENLABS_VOICE_EN / ELEVENLABS_VOICE_ES so the owner can pick a cloned or
 * library voice without touching the workflow.
 */
export const DEFAULT_VOICES: Record<NarrationLang, string> = {
  en: 'pNInz6obpgDQGcFmaJgB', // Adam — deep, newsreader register
  es: 'ErXwobaYiN019PkySvjV', // Antoni — multilingual v2 renders Spanish natively
};

export interface BreakingTracker {
  slug: string;
  name: string;
  headline?: string;
}

export interface BreakingData {
  date?: string;
  trackers: BreakingTracker[];
}

export interface NarrationInput {
  mode: NarrationMode;
  lang: NarrationLang;
  trackers: BreakingTracker[];
  /** Active trackers in the repo; spoken as "these and N more". */
  totalTrackers: number;
}

/** `<break time="0.7s" />` is the pause syntax eleven_multilingual_v2 honours in plain text. */
const pause = (seconds: number): string => `<break time="${seconds}s" />`;

function cleanHeadline(t: BreakingTracker): string {
  // The lead gets its real headline; a semicolon usually introduces a
  // secondary clause that reads badly aloud.
  return (t.headline || t.name || '').split(';')[0].trim();
}

function joinNames(trackers: BreakingTracker[], lang: NarrationLang): string {
  const names = trackers.map((t) => t.name.trim()).filter(Boolean);
  if (names.length <= 1) return names.join('');
  const last = names[names.length - 1];
  const and = lang === 'es' ? 'y' : 'and';
  return `${names.slice(0, -1).join(', ')} ${and} ${last}`;
}

/**
 * The spoken script. Pure: same input, same text. Kept out of the workflow
 * YAML so it can be unit-tested and so shell quoting cannot mangle a headline
 * with an apostrophe (which is exactly what broke the old `node -e` inline).
 */
export function composeNarration(input: NarrationInput): string {
  const { mode, lang, trackers } = input;
  const more = Math.max(0, input.totalTrackers - trackers.length);
  if (trackers.length === 0) {
    return lang === 'es'
      ? `Watchboard hoy. Paneles de inteligencia gratuitos y de código abierto en watchboard punto dev.`
      : `Watchboard today. Free, open source intelligence dashboards at watchboard dot dev.`;
  }

  if (mode === 'progress') {
    const names = joinNames(trackers, lang);
    return lang === 'es'
      ? `Buenas noticias en Watchboard hoy. ${pause(0.5)}${names}. ${pause(0.5)}Sigue los avances en ciencia, espacio y cultura en watchboard punto dev. Paneles de inteligencia gratuitos y de código abierto.`
      : `Good news from Watchboard today. ${pause(0.5)}${names}. ${pause(0.5)}Track breakthroughs across science, space, and culture at watchboard dot dev. Free, open source intelligence dashboards.`;
  }

  const lead = cleanHeadline(trackers[0]);
  const others = joinNames(trackers.slice(1), lang);
  const alsoLine = others
    ? lang === 'es'
      ? `También seguimos hoy: ${others}. ${pause(0.5)}`
      : `Also tracking today: ${others}. ${pause(0.5)}`
    : '';
  return lang === 'es'
    ? `${lead}. ${pause(0.7)}${alsoLine}Estas y ${more} más en watchboard punto dev. ${pause(0.3)}Paneles de inteligencia gratuitos y de código abierto, actualizados a diario.`
    : `${lead}. ${pause(0.7)}${alsoLine}These and ${more} more at watchboard dot dev. ${pause(0.3)}Free, open source intelligence dashboards, updated daily.`;
}

/** Which snapshot the render left for this mode. Falls back to breaking.json, as the workflow always has. */
export function dataPathForMode(mode: NarrationMode, root = ROOT): string {
  const progress = resolve(root, 'video/src/data/breaking-data-progress.json');
  const breaking = resolve(root, 'video/src/data/breaking-data-breaking.json');
  const fallback = resolve(root, 'video/src/data/breaking.json');
  if (mode === 'progress' && existsSync(progress)) return progress;
  if (mode === 'breaking' && existsSync(breaking)) return breaking;
  return fallback;
}

export function loadBreakingData(path: string): BreakingData {
  const d = JSON.parse(readFileSync(path, 'utf8')) as BreakingData;
  if (!Array.isArray(d.trackers)) throw new Error(`${path}: no trackers array`);
  return d;
}

/** Counted from the repo, never hard-coded — a fixed "48 more" was spoken aloud for months (#157). */
export function countActiveTrackers(root = ROOT): number {
  const dir = resolve(root, 'trackers');
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const d of readdirSync(dir)) {
    try {
      const cfg = JSON.parse(readFileSync(resolve(dir, d, 'tracker.json'), 'utf8'));
      if (cfg.status === 'active') n++;
    } catch {
      /* not a tracker dir */
    }
  }
  return n;
}

export interface TtsRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export function buildRequest(opts: { text: string; voiceId: string; apiKey: string; modelId?: string; apiBase?: string }): TtsRequest {
  if (opts.text.length > MAX_CHARS) throw new Error(`narration is ${opts.text.length} chars, API limit is ${MAX_CHARS}`);
  if (!/^[A-Za-z0-9]{10,40}$/.test(opts.voiceId)) throw new Error(`voice id "${opts.voiceId}" does not look like an ElevenLabs voice id`);
  const base = (opts.apiBase ?? API_BASE).replace(/\/$/, '');
  return {
    url: `${base}/v1/text-to-speech/${opts.voiceId}?output_format=mp3_44100_128`,
    headers: {
      'xi-api-key': opts.apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: opts.text,
      model_id: opts.modelId ?? DEFAULT_MODEL_ID,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true },
    }),
  };
}

/**
 * Verify the artefact, not the status code: an MP3 starts with an ID3 tag or
 * an MPEG frame sync (0xFF 0xFB / 0xF3 / 0xF2). A JSON error body with a 200
 * would otherwise be merged into the video as "audio".
 */
export function looksLikeMp3(bytes: Uint8Array): boolean {
  if (bytes.length < MIN_BYTES) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true; // "ID3"
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export async function synthesize(req: TtsRequest, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<Uint8Array> {
  const res = await fetchImpl(req.url, { method: 'POST', headers: req.headers, body: req.body });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`ElevenLabs HTTP ${res.status}: ${detail || 'no body'}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!looksLikeMp3(bytes)) throw new Error(`response is not MPEG audio (${bytes.length} bytes)`);
  return bytes;
}

interface Args { mode: NarrationMode; lang: NarrationLang; out?: string; print: boolean }

export function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const mode = get('--mode') ?? 'breaking';
  const lang = get('--lang') ?? 'en';
  if (mode !== 'breaking' && mode !== 'progress') throw new Error(`--mode must be breaking|progress, got ${mode}`);
  if (lang !== 'en' && lang !== 'es') throw new Error(`--lang must be en|es, got ${lang}`);
  const print = argv.includes('--print');
  const out = get('--out');
  if (!print && !out) throw new Error('--out <file.mp3> is required unless --print');
  return { mode, lang, out, print };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const data = loadBreakingData(dataPathForMode(args.mode));
  const text = composeNarration({ mode: args.mode, lang: args.lang, trackers: data.trackers, totalTrackers: countActiveTrackers() });
  console.log(`[narrate] ${args.mode}/${args.lang}: ${text.length} chars`);
  if (args.print) {
    console.log(text);
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.log('[narrate] ELEVENLABS_API_KEY not set — nothing attempted');
    process.exit(3);
  }
  const voiceId = (args.lang === 'es' ? process.env.ELEVENLABS_VOICE_ES : process.env.ELEVENLABS_VOICE_EN) || DEFAULT_VOICES[args.lang];
  const req = buildRequest({ text, voiceId, apiKey, modelId: process.env.ELEVENLABS_MODEL_ID });

  const out = resolve(args.out!);
  mkdirSync(dirname(out), { recursive: true });
  const bytes = await synthesize(req);
  // Write beside, then rename: the merge step must never see a partial file.
  const tmp = `${out}.part`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, out);
  console.log(`[narrate] wrote ${out} (${(bytes.length / 1024).toFixed(0)} KB, voice ${voiceId})`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((e: unknown) => {
    console.error(`::error::narrate-elevenlabs: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
