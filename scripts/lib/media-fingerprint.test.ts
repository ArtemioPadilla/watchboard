import { describe, it, expect } from 'vitest';
import { compareFingerprint, fingerprintUrl, normalizeEtag, observeHeaders, parseContentLength, sha1Prefix, FINGERPRINT_BYTES } from './media-fingerprint';

describe('normalizeEtag', () => {
  it('drops weak prefix and quotes', () => {
    expect(normalizeEtag('W/"abc"')).toBe('abc');
    expect(normalizeEtag('"abc"')).toBe('abc');
    expect(normalizeEtag('abc')).toBe('abc');
    expect(normalizeEtag('')).toBeUndefined();
    expect(normalizeEtag(null)).toBeUndefined();
  });
});

describe('compareFingerprint', () => {
  it('is inconclusive without a saved record or a usable probe', () => {
    expect(compareFingerprint(undefined, { status: 200, etag: 'a' })).toMatchObject({ suspect: false, inconclusive: true });
    expect(compareFingerprint({ etag: 'a' }, { status: 0 })).toMatchObject({ suspect: false, inconclusive: true });
    expect(compareFingerprint({ etag: 'a' }, { status: 404, etag: 'b' })).toMatchObject({ suspect: false, inconclusive: true });
    expect(compareFingerprint({}, { status: 200, etag: 'b', contentLength: 5 })).toMatchObject({ suspect: false, inconclusive: true });
  });
  it('prefers etag and treats weak/strong as equal', () => {
    expect(compareFingerprint({ etag: 'abc', contentLength: 1 }, { status: 200, etag: 'W/"abc"', contentLength: 999 })).toEqual({ suspect: false, inconclusive: false });
    expect(compareFingerprint({ etag: 'abc' }, { status: 200, etag: '"xyz"' })).toEqual({ suspect: true, reason: 'etag', inconclusive: false });
  });
  it('falls back to content-length when one side lacks an etag', () => {
    expect(compareFingerprint({ contentLength: 100 }, { status: 200, etag: 'x', contentLength: 100 })).toEqual({ suspect: false, inconclusive: false });
    expect(compareFingerprint({ etag: 'a', contentLength: 100 }, { status: 200, contentLength: 101 })).toEqual({ suspect: true, reason: 'content-length', inconclusive: false });
  });
});

describe('parseContentLength', () => {
  it('parses non-negative integers only', () => {
    expect(parseContentLength('123')).toBe(123);
    expect(parseContentLength('-1')).toBeUndefined();
    expect(parseContentLength('x')).toBeUndefined();
    expect(parseContentLength(null)).toBeUndefined();
  });
});

function fakeResponse(body: Uint8Array, headers: Record<string, string>, status = 200): Response {
  return new Response(new Blob([body as BlobPart]), { status, headers });
}

describe('fingerprintUrl', () => {
  it('hashes at most the first 64 KB and records validators', async () => {
    const body = new Uint8Array(FINGERPRINT_BYTES + 10).fill(7);
    const fetchImpl = async () => ({ response: fakeResponse(body, { etag: 'W/"e1"', 'content-length': String(body.length) }), finalUrl: 'u' });
    const fp = await fingerprintUrl('https://x/img.jpg', { fetchImpl: fetchImpl as never, now: () => new Date('2026-09-07T00:00:00Z') });
    expect(fp).toEqual({ fetchedAt: '2026-09-07T00:00:00.000Z', hash: sha1Prefix(body), etag: 'e1', contentLength: body.length });
    expect(sha1Prefix(body)).toBe(sha1Prefix(body.subarray(0, FINGERPRINT_BYTES)));
  });
  it('uses Content-Range for the full size on a 206', async () => {
    const body = new Uint8Array(10);
    const fetchImpl = async () => ({ response: fakeResponse(body, { 'content-range': 'bytes 0-9/5000', 'content-length': '10' }, 206), finalUrl: 'u' });
    const fp = await fingerprintUrl('https://x/img.jpg', { fetchImpl: fetchImpl as never });
    expect(fp?.contentLength).toBe(5000);
  });
  it('returns undefined on failure', async () => {
    const fetchImpl = async () => ({ response: fakeResponse(new Uint8Array(0), {}, 403), finalUrl: 'u' });
    expect(await fingerprintUrl('https://x/img.jpg', { fetchImpl: fetchImpl as never })).toBeUndefined();
    const throwing = async () => { throw new Error('boom'); };
    expect(await fingerprintUrl('https://x/img.jpg', { fetchImpl: throwing as never })).toBeUndefined();
  });
});

describe('observeHeaders', () => {
  it('reports status and validators, status 0 on network failure', async () => {
    const fetchImpl = async () => ({ response: fakeResponse(new Uint8Array(0), { etag: '"z"', 'content-length': '42' }), finalUrl: 'u' });
    expect(await observeHeaders('https://x/i.jpg', { fetchImpl: fetchImpl as never })).toEqual({ status: 200, etag: '"z"', contentLength: 42 });
    const throwing = async () => { throw new Error('nope'); };
    expect(await observeHeaders('https://x/i.jpg', { fetchImpl: throwing as never })).toEqual({ status: 0 });
  });
});
