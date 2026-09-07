/**
 * media-fingerprint.ts — detect recycled thumbnails.
 *
 * Publishers reuse image URLs; the same `og:image` URL can serve a different
 * photo months later. We remember what the body looked like when we captioned
 * it (sha1 of the first 64 KB plus the ETag / Content-Length the server
 * reported) and the nightly check compares a fresh HEAD against that record.
 * A mismatch marks the item `suspect`; surfaces then fall back rather than
 * pairing a confident caption with a picture nobody has seen (plan E9.H3).
 */
import { createHash } from 'node:crypto';
import { safeFetch } from '../thumbnail-utils.js';

export const FINGERPRINT_BYTES = 64 * 1024;
const UA = 'Mozilla/5.0 (compatible; Watchboard/1.0; +https://github.com/ArtemioPadilla/watchboard)';

export interface MediaFingerprint {
  hash?: string;
  etag?: string;
  contentLength?: number;
  fetchedAt: string;
}

export interface ObservedHeaders {
  etag?: string | null;
  contentLength?: number | null;
  /** HTTP status of the probe; ≥400 or 0 means we could not observe. */
  status: number;
}

export interface FingerprintVerdict {
  suspect: boolean;
  /** Which signal disagreed; undefined when not suspect. */
  reason?: 'etag' | 'content-length';
  /** True when neither side had a comparable signal. */
  inconclusive: boolean;
}

/** Strip the weak-validator prefix and quotes so W/"abc" equals "abc". */
export function normalizeEtag(etag: string | null | undefined): string | undefined {
  if (!etag) return undefined;
  const t = etag.trim().replace(/^W\//i, '').replace(/^"(.*)"$/, '$1');
  return t || undefined;
}

export function parseContentLength(v: string | null | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Compare the saved record with what the server reports now. Only a
 * definite disagreement makes an item suspect: a missing header on either
 * side is inconclusive, and a probe that failed (status 0 / ≥400) says
 * nothing about the body, so it never flips the flag.
 */
export function compareFingerprint(
  saved: Pick<MediaFingerprint, 'etag' | 'contentLength'> | undefined,
  observed: ObservedHeaders,
): FingerprintVerdict {
  if (!saved || observed.status === 0 || observed.status >= 400) return { suspect: false, inconclusive: true };
  const savedEtag = normalizeEtag(saved.etag);
  const nowEtag = normalizeEtag(observed.etag);
  if (savedEtag && nowEtag) {
    return savedEtag === nowEtag
      ? { suspect: false, inconclusive: false }
      : { suspect: true, reason: 'etag', inconclusive: false };
  }
  const savedLen = saved.contentLength;
  const nowLen = observed.contentLength ?? undefined;
  if (typeof savedLen === 'number' && typeof nowLen === 'number') {
    return savedLen === nowLen
      ? { suspect: false, inconclusive: false }
      : { suspect: true, reason: 'content-length', inconclusive: false };
  }
  return { suspect: false, inconclusive: true };
}

export function sha1Prefix(bytes: Uint8Array): string {
  return createHash('sha1').update(bytes.subarray(0, FINGERPRINT_BYTES)).digest('hex');
}

/**
 * GET the first 64 KB of an image and record hash + validators. Returns
 * undefined on any failure so callers store nothing rather than a lie.
 */
export async function fingerprintUrl(
  url: string,
  opts: { fetchImpl?: typeof safeFetch; now?: () => Date; timeoutMs?: number } = {},
): Promise<MediaFingerprint | undefined> {
  const doFetch = opts.fetchImpl ?? safeFetch;
  try {
    const { response } = await doFetch(url, {
      method: 'GET',
      timeoutMs: opts.timeoutMs ?? 8_000,
      headers: { 'User-Agent': UA, Range: `bytes=0-${FINGERPRINT_BYTES - 1}` },
    });
    if (response.status >= 400) {
      try { await response.body?.cancel(); } catch { /* ignore */ }
      return undefined;
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = response.body?.getReader();
    if (reader) {
      while (total < FINGERPRINT_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.byteLength;
      }
      try { await reader.cancel(); } catch { /* ignore */ }
    }
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
    const fp: MediaFingerprint = { fetchedAt: (opts.now ?? (() => new Date()))().toISOString() };
    if (total > 0) fp.hash = sha1Prefix(buf);
    const etag = normalizeEtag(response.headers.get('etag'));
    if (etag) fp.etag = etag;
    // A 206 reports the range length; Content-Range carries the full size.
    const range = response.headers.get('content-range');
    const full = range ? parseContentLength(range.split('/')[1]) : undefined;
    const len = response.status === 206 ? full : parseContentLength(response.headers.get('content-length'));
    if (typeof len === 'number') fp.contentLength = len;
    return fp;
  } catch {
    return undefined;
  }
}

/** HEAD probe returning only the validators the nightly check compares. */
export async function observeHeaders(
  url: string,
  opts: { fetchImpl?: typeof safeFetch; timeoutMs?: number } = {},
): Promise<ObservedHeaders> {
  const doFetch = opts.fetchImpl ?? safeFetch;
  try {
    const { response } = await doFetch(url, {
      method: 'HEAD',
      timeoutMs: opts.timeoutMs ?? 5_000,
      headers: { 'User-Agent': UA },
    });
    try { await response.body?.cancel(); } catch { /* ignore */ }
    return {
      status: response.status,
      etag: response.headers.get('etag'),
      contentLength: parseContentLength(response.headers.get('content-length')) ?? null,
    };
  } catch {
    return { status: 0 };
  }
}
