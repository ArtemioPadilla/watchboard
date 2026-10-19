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
  /** The tracker's own Spanish headline, when it has one (`data-es/meta.json`). */
  headlineEs?: string;
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
  /**
   * Length of the rendered video, so the script is written to fit the picture
   * rather than to a remembered duration. Omitted falls back to SPEECH_BUDGET.
   */
  videoSeconds?: number;
  /** Seconds of intro the voice stays out of. Defaults to DEFAULT_LEAD_IN. */
  leadIn?: number;
}

/** `<break time="0.7s" />` is the pause syntax eleven_multilingual_v2 honours in plain text. */
const pause = (seconds: number): string => `<break time="${seconds}s" />`;

/**
 * The two pauses in the script, as constants because the budget has to pay for
 * them. A `<break>` is silence the voice actually spends: three items and a
 * closing line cost 1.9 s of it, which the character count alone cannot see.
 */
export const BETWEEN_PAUSE = 0.6;
export const BEFORE_TAIL_PAUSE = 0.7;

/**
 * Seconds of picture before the first tracker slide, which the voice should
 * not talk over.
 *
 * This is not a new convention: `video/src/Video.tsx` already renders its
 * optional narration inside `<Sequence from={INTRO_FRAMES}>` — 90 frames at
 * 30 fps. That path only runs when a narration file exists at render time,
 * which in CI it never does (the render comes first), so the ffmpeg mix took
 * over and started the voice at frame 0. The two paths now agree.
 *
 * The hook cut opens on a headline after 60 frames instead (`HookVideo.tsx`).
 */
export const DEFAULT_LEAD_IN = 3;

/** `HOOK_FRAMES` in `video/src/HookVideo.tsx`: 60 frames at 30 fps. */
export const HOOK_LEAD_IN = 2;

/**
 * Which lead-in this run's picture has.
 *
 * Mirrors `selectCut()` in `video/src/select-cut.ts`, whose rule is
 * `mode !== 'positive' && asked === 'hook'`: the hook cut never applies to the
 * progress brief, which renders `Video.tsx` and keeps its 90-frame intro. Done
 * here rather than in the workflow because two `[ "$VIDEO_CUT" = hook ]` lines
 * in YAML is exactly how the progress job would quietly get the wrong one.
 */
export function leadInForCut(mode: NarrationMode, videoCut?: string): number {
  const asked = videoCut?.trim().toLowerCase();
  return mode === 'breaking' && asked === 'hook' ? HOOK_LEAD_IN : DEFAULT_LEAD_IN;
}

/**
 * The headline to speak, in the language being spoken.
 *
 * The Spanish track used to read the English headlines with a Spanish closing
 * line — the one register the listener could not place. 57 of the 133 trackers
 * carry their own `heroHeadline` in `data-es/meta.json`, which the homepage
 * has read since the /es/ cards landed and the video never did. The rest fall
 * back to English, and `composeNarration`'s caller is told how many did rather
 * than the fallback passing in silence.
 */
export function headlineFor(t: BreakingTracker, lang: NarrationLang): string {
  const raw = lang === 'es' ? (t.headlineEs?.trim() || t.headline) : t.headline;
  return (raw || '').split(';')[0].trim();
}

/** Trackers whose line will be spoken in English although the track is Spanish. */
export function untranslatedCount(trackers: BreakingTracker[], lang: NarrationLang): number {
  if (lang !== 'es') return 0;
  return trackers.filter(t => (t.headline || '').trim() && !(t.headlineEs || '').trim()).length;
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
/**
 * Measured on two production runs: 425 characters became 29.6 s and 418
 * became 30.3 s, so ElevenLabs reads this copy at about 14 characters a
 * second including the `<break>` pauses.
 */
export const CHARS_PER_SECOND = 14;

/**
 * Leave the last tenth of the video unspoken. The closing line should land
 * before the outro does, not over it, and a voice that finishes exactly on
 * the last frame sounds clipped even when it is not.
 */
export const SPEECH_HEADROOM = 0.9;

/**
 * Fallback only, for a caller that does not know the video length.
 *
 * This used to be the whole story, at 420 characters "because the brief is
 * ~30s". The brief is 23.06 s. Narration therefore ran about 6.5 s longer
 * than the picture every night: the voice drifted behind the slides it was
 * describing, and `amix duration=first` cut the closing line off entirely —
 * the brand mention that #333 had deliberately moved to the end. The comment
 * above this constant even predicted it: "a script that overruns gets mixed
 * under a video that has already ended."
 *
 * Callers should pass the real duration instead; daily-video.yml ffprobes the
 * rendered MP4, which exists by the time narration runs.
 */
export const SPEECH_BUDGET = Math.floor(23 * CHARS_PER_SECOND * SPEECH_HEADROOM);

/** Characters of speech that fit in `seconds` of video. */
export function budgetForSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return SPEECH_BUDGET;
  return Math.max(60, Math.floor(seconds * CHARS_PER_SECOND * SPEECH_HEADROOM));
}

/**
 * How long a composed script takes to play: the words at CHARS_PER_SECOND plus
 * the silence its `<break>` tags ask for. Three items and a closing line spend
 * 1.9 s on pauses — a tenth of the brief, and invisible to a character count.
 */
export function playSeconds(text: string): number {
  const pauses = [...text.matchAll(/<break time="([\d.]+)s"\s*\/>/g)]
    .reduce((sum, m) => sum + Number(m[1]), 0);
  return text.replace(/<break[^>]*>/g, '').length / CHARS_PER_SECOND + pauses;
}

/**
 * Where to start the voice in the mix, so the first headline lands on the
 * first slide instead of over the intro.
 *
 * The lead-in, unless the script is too long to afford it — then as much of it
 * as fits. A voice that starts late and gets cut off by `amix duration=first`
 * would be worse than one that starts early, so the slack decides.
 */
export function narrationDelaySeconds(
  text: string,
  videoSeconds?: number,
  leadIn = DEFAULT_LEAD_IN,
): number {
  if (!Number.isFinite(leadIn) || leadIn <= 0) return 0;
  if (videoSeconds === undefined || !Number.isFinite(videoSeconds) || videoSeconds <= 0) return 0;
  const slack = videoSeconds - playSeconds(text);
  return Math.max(0, Math.min(leadIn, slack));
}

/** The closing call to action. Spoken once, last, after the news. */
function closing(lang: NarrationLang, more: number): string {
  if (lang === 'es') {
    return more > 0
      ? `Estas y ${more} más, con cronologías y fuentes, en watchboard punto dev.`
      : `Cronologías y fuentes en watchboard punto dev.`;
  }
  return more > 0
    ? `These and ${more} more, with full timelines and sources, at watchboard dot dev.`
    : `Full timelines and sources at watchboard dot dev.`;
}

/**
 * The spoken script. Pure: same input, same text. Kept out of the workflow
 * YAML so it can be unit-tested and so shell quoting cannot mangle a headline
 * with an apostrophe (which is exactly what broke the old `node -e` inline).
 *
 * News first, brand last. The earlier version opened `progress` with "Good
 * news from Watchboard today", then read out tracker NAMES rather than what
 * had happened, and spent its last two sentences on the product — so a
 * listener heard the pitch and never heard the brief. `breaking` spoke one
 * real headline and named the other two trackers.
 *
 * Every selected tracker now gets its own headline, and the call to action is
 * one sentence at the end. The headlines are also what the slides show, so
 * the voice and the screen say the same thing.
 *
 * KPI values are deliberately NOT spoken. The data carries them, but the
 * labels are display strings ("TOTAL ARTEMIS INVESTMENT" = 100 with the unit
 * in a separate suffix field), and a number read without its unit is worse
 * than no number.
 */
export function composeNarration(input: NarrationInput): string {
  const { lang, trackers } = input;
  const more = Math.max(0, input.totalTrackers - trackers.length);
  // The window the voice actually has: the video minus the intro it stays out
  // of. Budgeting the whole 23 s and then delaying by 3 s would put the
  // closing line past the last frame, where amix drops it.
  const leadIn = input.leadIn ?? DEFAULT_LEAD_IN;
  const budget = input.videoSeconds !== undefined
    ? budgetForSeconds(Math.max(0, input.videoSeconds - leadIn))
    : SPEECH_BUDGET;

  if (trackers.length === 0) {
    // Nothing to brief. Say that plainly rather than running an advert.
    return lang === 'es'
      ? `Hoy no hay novedades importantes en los paneles. ${pause(0.5)}${closing(lang, 0)}`
      : `No major developments across the trackers today. ${pause(0.5)}${closing(lang, 0)}`;
  }

  const tail = closing(lang, more);
  const lines: string[] = [];
  // Silence is part of the length. The closing pause is always paid; each item
  // after the first adds one more. Counted in characters so the whole budget
  // stays one unit.
  const asChars = (seconds: number) => seconds * CHARS_PER_SECOND;
  let spent = tail.length + asChars(BEFORE_TAIL_PAUSE);

  for (const t of trackers) {
    // Headline only — no fallback to the tracker name. A bare name spoken in
    // a brief ("Yemen Conflict.") is the thing this change exists to remove.
    const headline = headlineFor(t, lang);
    if (!headline) continue;
    const line = /[.!?]$/.test(headline) ? headline : `${headline}.`;
    const cost = line.length + (lines.length > 0 ? asChars(BETWEEN_PAUSE) : 0);
    // Drop a trailing item rather than truncate one mid-sentence: a clipped
    // headline is a half-told fact, which is worse than one fewer item.
    if (spent + cost > budget && lines.length > 0) break;
    lines.push(line);
    spent += cost;
  }

  // No tracker carried a headline. Saying "no developments" would be false
  // when there are trackers to brief, so name them — worse copy, still true.
  if (lines.length === 0) {
    const names = joinNames(trackers, lang);
    return lang === 'es'
      ? `Hoy seguimos: ${names}. ${pause(BETWEEN_PAUSE)}${tail}`
      : `Tracking today: ${names}. ${pause(BETWEEN_PAUSE)}${tail}`;
  }

  return `${lines.join(` ${pause(BETWEEN_PAUSE)}`)} ${pause(BEFORE_TAIL_PAUSE)}${tail}`;
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

interface Args { mode: NarrationMode; lang: NarrationLang; out?: string; print: boolean; videoSeconds?: number; leadIn?: number }

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
  // The rendered MP4's duration, so the script is written to fit the picture.
  // A bad value is ignored rather than fatal: shipping a slightly long script
  // beats failing the night's narration over a malformed number.
  const rawSeconds = get('--video-seconds');
  const parsed = rawSeconds === undefined ? undefined : Number(rawSeconds);
  const videoSeconds = parsed !== undefined && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  if (rawSeconds !== undefined && videoSeconds === undefined) {
    console.warn(`[narrate] ignoring --video-seconds ${rawSeconds}: not a positive number`);
  }
  // Seconds of intro before the first slide — 2 for the hook cut, 3 for the
  // daily brief. Same leniency: a bad value takes the default.
  const rawLead = get('--lead-in');
  // `Number('')` is 0, and a 0 lead-in is exactly the misalignment this flag
  // exists to remove — so an empty value is rejected, not read as zero.
  const parsedLead = rawLead === undefined || rawLead.trim() === '' ? undefined : Number(rawLead);
  const leadIn = parsedLead !== undefined && Number.isFinite(parsedLead) && parsedLead >= 0 ? parsedLead : undefined;
  if (rawLead !== undefined && leadIn === undefined) {
    console.warn(`[narrate] ignoring --lead-in ${rawLead}: not a non-negative number`);
  }
  return { mode, lang, out, print, videoSeconds, leadIn };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const data = loadBreakingData(dataPathForMode(args.mode));
  // An explicit --lead-in wins; otherwise the cut decides.
  const leadIn = args.leadIn ?? leadInForCut(args.mode, process.env.VIDEO_CUT);
  const text = composeNarration({
    mode: args.mode,
    lang: args.lang,
    trackers: data.trackers,
    totalTrackers: countActiveTrackers(),
    videoSeconds: args.videoSeconds,
    leadIn,
  });
  const delay = narrationDelaySeconds(text, args.videoSeconds, leadIn);
  const untranslated = untranslatedCount(data.trackers, args.lang);
  if (untranslated > 0) {
    console.warn(
      `[narrate] ${untranslated} of ${data.trackers.length} trackers have no Spanish headline ` +
        `(data-es/meta.json) — those lines are spoken in English`,
    );
  }
  console.log(
    `[narrate] ${args.mode}/${args.lang}: ${text.length} chars, ` +
      `${playSeconds(text).toFixed(1)}s of speech starting at ${delay.toFixed(2)}s` +
      (args.videoSeconds ? ` of ${args.videoSeconds.toFixed(2)}s of video` : ' (duration unknown)'),
  );
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
  // Where the mix should start the voice, for the ffmpeg step to read. A
  // sidecar rather than a stdout value because the two run in different shell
  // steps, and rather than recomputing it there because that would be the same
  // arithmetic written twice in two languages.
  writeFileSync(`${out}.delay-ms`, `${Math.round(delay * 1000)}\n`);
  console.log(`[narrate] wrote ${out} (${(bytes.length / 1024).toFixed(0)} KB, voice ${voiceId}), delay ${Math.round(delay * 1000)}ms`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((e: unknown) => {
    console.error(`::error::narrate-elevenlabs: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
