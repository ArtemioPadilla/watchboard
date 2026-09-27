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
} from './narrate-elevenlabs';

const trackers = [
  { slug: 'yemen-conflict', name: 'Yemen Conflict', headline: "Saudi Coalition Airstrikes Hit Four Provinces; Riyadh Says It Won't Stop" },
  { slug: 'moldova-transnistria', name: 'Moldova-Transnistria', headline: 'First Gerbera Drone Crashes Near Cernița' },
  { slug: 'united-states', name: 'United States', headline: 'FBI Confirms Cybersecurity Incident' },
];

describe('composeNarration', () => {
  it('breaking/en: lead headline first, then the other names, then a counted total', () => {
    const t = composeNarration({ mode: 'breaking', lang: 'en', trackers, totalTrackers: 125 });
    expect(t.startsWith("Saudi Coalition Airstrikes Hit Four Provinces.")).toBe(true); // clause after ";" dropped
    expect(t).toContain('Also tracking today: Moldova-Transnistria and United States.');
    expect(t).toContain('These and 122 more at watchboard dot dev.');
    expect(t).toMatch(/<break time="0\.7s" \/>/);
    expect(t).not.toContain('<speak>'); // no SSML: ElevenLabs takes plain text
    expect(t).not.toContain('<prosody');
  });

  it('breaking/es mirrors the structure in Spanish', () => {
    const t = composeNarration({ mode: 'breaking', lang: 'es', trackers, totalTrackers: 125 });
    expect(t).toContain('También seguimos hoy: Moldova-Transnistria y United States.');
    expect(t).toContain('Estas y 122 más en watchboard punto dev.');
  });

  it('progress mode lists names only and never says "more"', () => {
    const t = composeNarration({ mode: 'progress', lang: 'en', trackers, totalTrackers: 125 });
    expect(t).toContain('Good news from Watchboard today.');
    expect(t).toContain('Yemen Conflict, Moldova-Transnistria and United States.');
    expect(t).not.toMatch(/\d+ more/);
  });

  it('never goes negative on the count and survives an empty selection', () => {
    expect(composeNarration({ mode: 'breaking', lang: 'en', trackers, totalTrackers: 2 })).toContain('These and 0 more');
    expect(composeNarration({ mode: 'breaking', lang: 'en', trackers: [], totalTrackers: 10 })).toContain('Watchboard today.');
  });

  it('a single tracker has no "also tracking" line', () => {
    const t = composeNarration({ mode: 'breaking', lang: 'en', trackers: trackers.slice(0, 1), totalTrackers: 5 });
    expect(t).not.toContain('Also tracking');
    expect(t).toContain('These and 4 more');
  });

  it('is deterministic', () => {
    const a = composeNarration({ mode: 'breaking', lang: 'en', trackers, totalTrackers: 125 });
    const b = composeNarration({ mode: 'breaking', lang: 'en', trackers, totalTrackers: 125 });
    expect(a).toBe(b);
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
