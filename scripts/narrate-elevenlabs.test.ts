import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  composeNarration,
  buildRequest,
  looksLikeMp3,
  synthesize,
  parseArgs,
  dataPathForMode,
  countActiveTrackers,
  DEFAULT_MODEL_ID,
  DEFAULT_VOICES,
  MIN_BYTES,
  type FetchLike,
  SPEECH_BUDGET,
  CHARS_PER_SECOND,
  SPEECH_HEADROOM,
  budgetForSeconds,
} from './narrate-elevenlabs';

const trackers = [
  { slug: 'yemen-conflict', name: 'Yemen Conflict', headline: "Saudi Coalition Airstrikes Hit Four Provinces; Riyadh Says It Won't Stop" },
  { slug: 'moldova-transnistria', name: 'Moldova-Transnistria', headline: 'First Gerbera Drone Crashes Near Cernița' },
  { slug: 'united-states', name: 'United States', headline: 'FBI Confirms Cybersecurity Incident' },
];

describe('composeNarration', () => {
  const brandAt = (t: string) => t.toLowerCase().indexOf('watchboard');

  it('leads with the news and gives every tracker its own headline', () => {
    const t = composeNarration({ mode: 'breaking', lang: 'en', trackers, totalTrackers: 125 });
    expect(t.startsWith('Saudi Coalition Airstrikes Hit Four Provinces.')).toBe(true); // clause after ";" dropped
    // The old script named the other two trackers instead of saying what
    // happened to them. Each one now gets its actual headline.
    expect(t).toContain('First Gerbera Drone Crashes Near Cernița.');
    expect(t).toContain('FBI Confirms Cybersecurity Incident.');
    expect(t).not.toContain('Also tracking today');
  });

  it('says the brand once, and only after the news', () => {
    const t = composeNarration({ mode: 'breaking', lang: 'en', trackers, totalTrackers: 125 });
    expect(t.match(/watchboard/gi)).toHaveLength(1);
    // Every headline is spoken before the call to action.
    for (const h of ['Saudi Coalition', 'Gerbera Drone', 'FBI Confirms']) {
      expect(t.indexOf(h)).toBeLessThan(brandAt(t));
    }
    expect(t.trimEnd().endsWith('at watchboard dot dev.')).toBe(true);
  });

  it('progress mode briefs the news too, instead of listing names', () => {
    const t = composeNarration({ mode: 'progress', lang: 'en', trackers, totalTrackers: 125 });
    // It used to open "Good news from Watchboard today" and then read out
    // tracker names, so a listener heard the pitch and never heard the brief.
    expect(t).not.toContain('Good news from Watchboard today');
    expect(t).not.toContain('Yemen Conflict, Moldova-Transnistria and United States');
    expect(t).toContain('Saudi Coalition Airstrikes Hit Four Provinces.');
    expect(t.indexOf('Saudi Coalition')).toBeLessThan(brandAt(t));
  });

  it('closes in Spanish, with the count', () => {
    const t = composeNarration({ mode: 'breaking', lang: 'es', trackers, totalTrackers: 125 });
    expect(t).toContain('Estas y 122 más, con cronologías y fuentes, en watchboard punto dev.');
    expect(t.match(/watchboard/gi)).toHaveLength(1);
  });

  it('drops the count rather than saying "and 0 more"', () => {
    const t = composeNarration({ mode: 'breaking', lang: 'en', trackers, totalTrackers: 3 });
    expect(t).not.toMatch(/\d+ more/);
    expect(t).toContain('Full timelines and sources at watchboard dot dev.');
  });

  it('says plainly that there is nothing, rather than running an advert', () => {
    const t = composeNarration({ mode: 'breaking', lang: 'en', trackers: [], totalTrackers: 10 });
    expect(t).toContain('No major developments across the trackers today.');
    // The old empty case was the product pitch and nothing else.
    expect(t).not.toContain('Free, open source intelligence dashboards');
  });

  it('a single tracker still gets its headline and one closing line', () => {
    const t = composeNarration({ mode: 'breaking', lang: 'en', trackers: trackers.slice(0, 1), totalTrackers: 5 });
    expect(t).toContain('Saudi Coalition Airstrikes Hit Four Provinces.');
    expect(t).toContain('and 4 more');
    expect(t.match(/watchboard/gi)).toHaveLength(1);
  });

  it('stays inside the speech budget by dropping items, never mid-sentence', () => {
    // A clipped headline is a half-told fact; one fewer item is honest.
    const long = Array.from({ length: 12 }, (_, i) => ({
      slug: `t${i}`, name: `T${i}`, headline: `${'Headline number ' + i} ${'x'.repeat(70)}`,
    }));
    const t = composeNarration({ mode: 'breaking', lang: 'en', trackers: long, totalTrackers: 99 });
    expect(t.length).toBeLessThanOrEqual(SPEECH_BUDGET + 120); // + the break markup
    expect(t).toContain('Headline number 0');
    expect(t.trimEnd().endsWith('at watchboard dot dev.')).toBe(true);
    expect(t).not.toMatch(/x{70}\.?\s*<break[^>]*>\s*$/); // nothing truncated at the tail
  });

  it('skips a tracker with no headline rather than speaking its bare name', () => {
    const t = composeNarration({
      mode: 'breaking', lang: 'en',
      trackers: [{ slug: 'a', name: 'A', headline: '' }, trackers[0]],
      totalTrackers: 9,
    });
    expect(t).not.toContain('. .');
    expect(t).not.toContain('A.');
    expect(t.startsWith('Saudi Coalition')).toBe(true);
  });

  it('names the trackers only when not one has a headline, rather than claiming nothing happened', () => {
    const t = composeNarration({
      mode: 'breaking', lang: 'en',
      trackers: [{ slug: 'a', name: 'Alpha', headline: '' }, { slug: 'b', name: 'Beta' }],
      totalTrackers: 9,
    });
    expect(t).toContain('Tracking today: Alpha and Beta.');
    expect(t).not.toContain('No major developments'); // would be false — there are trackers
  });

  it('is deterministic', () => {
    const a = composeNarration({ mode: 'breaking', lang: 'en', trackers, totalTrackers: 125 });
    const b = composeNarration({ mode: 'breaking', lang: 'en', trackers, totalTrackers: 125 });
    expect(a).toBe(b);
  });

  it('emits no SSML — ElevenLabs takes plain text with break tags', () => {
    const t = composeNarration({ mode: 'breaking', lang: 'en', trackers, totalTrackers: 125 });
    expect(t).not.toContain('<speak>');
    expect(t).not.toContain('<prosody');
    expect(t).toMatch(/<break time="0\.\ds" \/>/);
  });
});

describe('fitting the script to the picture', () => {
  /** Spoken length of a composed script: the break markup is not read aloud. */
  const spokenSeconds = (t: string) =>
    t.replace(/<break[^>]*>/g, '').length / CHARS_PER_SECOND;

  it('scales the budget with the measured duration', () => {
    expect(budgetForSeconds(23)).toBe(Math.floor(23 * CHARS_PER_SECOND * SPEECH_HEADROOM));
    expect(budgetForSeconds(60)).toBeGreaterThan(budgetForSeconds(23));
  });

  it('falls back to SPEECH_BUDGET for a duration it cannot use', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(budgetForSeconds(bad)).toBe(SPEECH_BUDGET);
    }
  });

  it('never goes under a floor that would leave the brief wordless', () => {
    expect(budgetForSeconds(0.5)).toBe(60);
  });

  it('writes a script that fits the 23 s brief instead of overrunning it', () => {
    // The bug this covers: the budget was a fixed 420 characters "because the
    // brief is ~30s" while the render is 23.06 s, so the voice ran ~6.5 s long,
    // drifted behind the slides, and lost its closing line to `amix
    // duration=first`.
    const t = composeNarration({
      mode: 'breaking', lang: 'en', trackers, totalTrackers: 125, videoSeconds: 23.06,
    });
    expect(spokenSeconds(t)).toBeLessThanOrEqual(23.06);
    expect(t.trimEnd().endsWith('at watchboard dot dev.')).toBe(true);
  });

  it('spends a longer video on more of the news', () => {
    // Production headlines run near 100 characters each; the three fixtures
    // above are short enough to fit any budget, which is why this uses its own.
    const wordy = [
      { slug: 'a', name: 'A', headline: `Lead item ${'a'.repeat(90)}` },
      { slug: 'b', name: 'B', headline: `Second item ${'b'.repeat(90)}` },
      { slug: 'c', name: 'C', headline: `Third item ${'c'.repeat(90)}` },
    ];
    const short = composeNarration({ mode: 'breaking', lang: 'en', trackers: wordy, totalTrackers: 125, videoSeconds: 23.06 });
    const long = composeNarration({ mode: 'breaking', lang: 'en', trackers: wordy, totalTrackers: 125, videoSeconds: 60 });
    expect(long.length).toBeGreaterThan(short.length);
    expect(long).toContain('Third item');
    expect(short).not.toContain('Third item');
    expect(spokenSeconds(short)).toBeLessThanOrEqual(23.06);
    expect(spokenSeconds(long)).toBeLessThanOrEqual(60);
  });

  it('fits whatever duration it is handed, in both languages', () => {
    for (const lang of ['en', 'es'] as const) {
      for (const seconds of [18.05, 23.06, 30, 45]) {
        const t = composeNarration({ mode: 'breaking', lang, trackers, totalTrackers: 125, videoSeconds: seconds });
        expect(spokenSeconds(t)).toBeLessThanOrEqual(seconds);
      }
    }
  });

  it('keeps the closing line even when one headline alone overruns the video', () => {
    // The first item is never dropped (a brief with no news is not a brief),
    // but the brand line must still survive: it is the whole call to action.
    const t = composeNarration({
      mode: 'breaking', lang: 'en', videoSeconds: 23.06, totalTrackers: 125,
      trackers: [{ slug: 'a', name: 'A', headline: 'Headline '.repeat(60).trim() }],
    });
    expect(t.trimEnd().endsWith('at watchboard dot dev.')).toBe(true);
  });
});

describe('buildRequest', () => {
  it('targets the voice endpoint with the key header and multilingual model', () => {
    const r = buildRequest({ text: 'hola', voiceId: DEFAULT_VOICES.es, apiKey: 'k' });
    expect(r.url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICES.es}?output_format=mp3_44100_128`);
    expect(r.headers['xi-api-key']).toBe('k');
    expect(r.headers.Accept).toBe('audio/mpeg');
    const body = JSON.parse(r.body);
    expect(body.text).toBe('hola');
    expect(body.model_id).toBe(DEFAULT_MODEL_ID);
  });

  it('rejects oversized text and malformed voice ids before spending a request', () => {
    expect(() => buildRequest({ text: 'x'.repeat(5001), voiceId: DEFAULT_VOICES.en, apiKey: 'k' })).toThrow(/limit/);
    expect(() => buildRequest({ text: 'x', voiceId: '../admin', apiKey: 'k' })).toThrow(/voice id/);
  });
});

describe('looksLikeMp3', () => {
  const big = (head: number[]): Uint8Array => {
    const b = new Uint8Array(MIN_BYTES + 10);
    b.set(head);
    return b;
  };
  it('accepts ID3-tagged and raw-frame MP3s of usable size', () => {
    expect(looksLikeMp3(big([0x49, 0x44, 0x33]))).toBe(true);
    expect(looksLikeMp3(big([0xff, 0xfb]))).toBe(true);
  });
  it('rejects JSON error bodies and tiny files', () => {
    expect(looksLikeMp3(big([0x7b, 0x22]))).toBe(false); // '{"'
    expect(looksLikeMp3(new Uint8Array([0x49, 0x44, 0x33]))).toBe(false);
  });
});

describe('synthesize', () => {
  const req = buildRequest({ text: 'hi', voiceId: DEFAULT_VOICES.en, apiKey: 'k' });
  const fake = (status: number, payload: Uint8Array | string): FetchLike => async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof payload === 'string' ? payload : ''),
    arrayBuffer: async () => (typeof payload === 'string' ? new TextEncoder().encode(payload).buffer : payload.buffer) as ArrayBuffer,
  });

  it('returns the bytes for a real audio response', async () => {
    const mp3 = new Uint8Array(MIN_BYTES + 1);
    mp3.set([0x49, 0x44, 0x33]);
    await expect(synthesize(req, fake(200, mp3))).resolves.toHaveLength(MIN_BYTES + 1);
  });

  it('surfaces the API error body on a non-2xx', async () => {
    await expect(synthesize(req, fake(401, '{"detail":{"status":"invalid_api_key"}}'))).rejects.toThrow(/HTTP 401.*invalid_api_key/);
  });

  it('refuses a 200 whose body is not audio', async () => {
    await expect(synthesize(req, fake(200, '{"detail":"quota_exceeded"}'))).rejects.toThrow(/not MPEG audio/);
  });
});

describe('parseArgs / paths', () => {
  it('parses mode, lang and out; requires --out unless --print', () => {
    expect(parseArgs(['--mode', 'progress', '--lang', 'es', '--out', 'x.mp3'])).toEqual({ mode: 'progress', lang: 'es', out: 'x.mp3', print: false });
    expect(parseArgs(['--print'])).toMatchObject({ mode: 'breaking', lang: 'en', print: true });
    expect(() => parseArgs(['--mode', 'happy', '--out', 'x'])).toThrow(/--mode/);
    expect(() => parseArgs(['--lang', 'fr', '--out', 'x'])).toThrow(/--lang/);
    expect(() => parseArgs([])).toThrow(/--out/);
  });

  it('takes the measured video duration, and ignores one it cannot use', () => {
    expect(parseArgs(['--print', '--video-seconds', '23.06'])).toMatchObject({ videoSeconds: 23.06 });
    // ffprobe prints nothing for a missing file, so the flag arrives empty on a
    // bad night. Narrate with the fallback budget rather than exiting.
    for (const bad of ['', 'N/A', '0', '-3']) {
      expect(parseArgs(['--print', '--video-seconds', bad]).videoSeconds).toBeUndefined();
    }
    expect(parseArgs(['--print']).videoSeconds).toBeUndefined();
  });

  it('prefers the per-mode snapshot and falls back to breaking.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'narr-'));
    mkdirSync(join(root, 'video/src/data'), { recursive: true });
    writeFileSync(join(root, 'video/src/data/breaking.json'), '{"trackers":[]}');
    expect(dataPathForMode('progress', root)).toMatch(/breaking\.json$/);
    writeFileSync(join(root, 'video/src/data/breaking-data-progress.json'), '{"trackers":[]}');
    expect(dataPathForMode('progress', root)).toMatch(/breaking-data-progress\.json$/);
    expect(dataPathForMode('breaking', root)).toMatch(/breaking\.json$/);
  });

  it('counts only active trackers', () => {
    const root = mkdtempSync(join(tmpdir(), 'narr-'));
    for (const [slug, status] of [['a', 'active'], ['b', 'archived'], ['c', 'active']]) {
      mkdirSync(join(root, 'trackers', slug), { recursive: true });
      writeFileSync(join(root, 'trackers', slug, 'tracker.json'), JSON.stringify({ status }));
    }
    mkdirSync(join(root, 'trackers', 'junk'));
    expect(countActiveTrackers(root)).toBe(2);
  });
});
