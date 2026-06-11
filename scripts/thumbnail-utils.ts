/**
 * thumbnail-utils.ts
 *
 * Shared thumbnail validation and sanitization for Watchboard.
 *
 * Provides:
 * - SSRF-hardened fetch helper (scheme allowlist, private/metadata IP blocklist,
 *   capped manual redirects, AbortSignal timeouts) — replaces the old
 *   `execSync('curl …')` calls that piped AI/RSS-supplied URLs through a shell
 * - Pre-extraction URL resolution (Google News blob → real article)
 * - Post-extraction quality validation (blocklist, HEAD check, dedup)
 * - Centralized rules so local-hourly.ts and backfill-media.ts share the same logic
 *
 * Design: each validation is a standalone function that returns
 * { valid: boolean; reason?: string } so we can log rejections clearly
 * and add new rules without touching existing ones.
 */

import { lookup } from 'dns/promises';
import { isIP } from 'net';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface ThumbnailCandidate {
  url: string;
  sourceUrl?: string;  // the article URL that produced this thumbnail
}

export interface ValidatedThumbnail {
  url: string | null;
  rejectedUrl?: string;
  rejectedReason?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * Domains whose og:image is NEVER a real article thumbnail.
 * These return generic site icons, logos, or tracking pixels.
 */
const BLOCKED_THUMBNAIL_DOMAINS = new Set([
  'lh3.googleusercontent.com',       // Google News generic icon (300×300)
  'news.google.com',                  // RSS blob URL used as thumbnail fallback
  'www.google.com',                   // AMP cache redirects
  'encrypted-tbn0.gstatic.com',       // Google image cache thumbnails
  'encrypted-tbn1.gstatic.com',
  'encrypted-tbn2.gstatic.com',
  'encrypted-tbn3.gstatic.com',
  'play-lh.googleusercontent.com',    // Google Play icons
  'feedburner.google.com',            // Dead feed proxy
  'feeds.feedburner.com',
]);

/**
 * URL path patterns that indicate generic/brand images, not article photos.
 * Shared with backfill-media.ts's isNewsImage() but centralized here.
 */
const BLOCKED_PATH_PATTERNS: RegExp[] = [
  /\/logo[s]?[\-_\.\/]/i,
  /\/favicon/i,
  /\/brand[\-_\.\/]/i,
  /\/icon[\-_\.\/]/i,
  /\/default[\-_]?(share|social|og|image|thumb)/i,
  /\/placeholder/i,
  /\/generic[\-_]/i,
  /\/site[\-_]?(logo|image|default|og)/i,
  /\/avatar[\-_\.\/]/i,
  /\/badge[\-_\.\/]/i,
  /social[\-_]?(card|preview|share|default)/i,
  /\/fallback[\-_]?(image|og)/i,
  /apple[\-_]touch[\-_]icon/i,
  /\/1x1\./i,                         // Tracking pixels
  /\/pixel\./i,
  /\/blank\./i,
];

/**
 * Domains that block hotlinking (return 403 for non-browser referrers).
 * Thumbnails from these are useless for display.
 */
const HOTLINK_BLOCKED_DOMAINS = new Set([
  'dims.apnews.com',                  // AP News image CDN — 403 on hotlink
]);

// ─── SSRF-safe fetch ─────────────────────────────────────────────────────────

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 8_000;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
]);

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;          // this-net, 10/8, loopback
  if (a === 169 && b === 254) return true;                     // link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true;            // 172.16/12
  if (a === 192 && b === 168) return true;                     // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true;           // 100.64/10 CGNAT
  return false;
}

function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedIpv4(ip);
  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;        // loopback / unspecified
    if (lower.startsWith('fe80:')) return true;                // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local fc00::/7
    const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isBlockedIpv4(mapped[1]);
    return false;
  }
  return true; // not an IP literal — handled separately
}

class UnsafeUrlError extends Error {}

/**
 * Synchronous (no-DNS) URL safety check: scheme allowlist + obvious private
 * hosts / IP literals. Used both as a fast validation rule and as the first
 * gate inside safeFetch().
 */
export function checkUrlSafety(rawUrl: string): ValidationResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { valid: false, reason: 'invalid_url' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { valid: false, reason: `blocked_scheme:${url.protocol}` };
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return { valid: false, reason: `blocked_host:${host}` };
  }
  if (isIP(host) && isBlockedIp(host)) {
    return { valid: false, reason: `blocked_ip:${host}` };
  }
  return { valid: true };
}

/** Validate scheme + host, resolving DNS to catch private IPs behind hostnames. */
async function assertSafeUrl(rawUrl: string): Promise<URL> {
  const staticCheck = checkUrlSafety(rawUrl);
  if (!staticCheck.valid) throw new UnsafeUrlError(staticCheck.reason);
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!isIP(host)) {
    // Resolve and verify the address isn't private/link-local/metadata.
    // (DNS failures propagate — the fetch would fail anyway.)
    const { address } = await lookup(host);
    if (isBlockedIp(address)) throw new UnsafeUrlError(`blocked_host_resolves_private:${host}`);
  }
  return url;
}

export interface SafeFetchResult {
  response: Response;
  /** URL of the final hop after redirects. */
  finalUrl: string;
}

/**
 * SSRF-hardened fetch for AI/RSS-supplied URLs:
 * - scheme allowlist (http/https only)
 * - blocklist of RFC1918 / link-local / metadata / localhost hosts,
 *   re-validated on EVERY redirect hop (manual redirect following, capped)
 * - timeout via AbortSignal.timeout
 */
export async function safeFetch(
  rawUrl: string,
  init: { method?: string; headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<SafeFetchResult> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertSafeUrl(current);
    const response = await fetch(url, {
      ...rest,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get('location');
      try { await response.body?.cancel(); } catch { /* ignore */ }
      if (!loc) return { response, finalUrl: url.toString() };
      current = new URL(loc, url).toString();
      continue;
    }
    return { response, finalUrl: url.toString() };
  }
  throw new UnsafeUrlError(`too_many_redirects:${rawUrl.slice(0, 80)}`);
}

/** Convenience: fetch a URL safely and return its body text (null on any failure). */
export async function safeFetchText(
  rawUrl: string,
  init: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<string | null> {
  try {
    const { response } = await safeFetch(rawUrl, init);
    if (!response.ok) {
      try { await response.body?.cancel(); } catch { /* ignore */ }
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

// ─── Pre-extraction: URL Resolution ─────────────────────────────────────────

/**
 * Resolve Google News opaque blob URLs to the real article URL.
 * Google News RSS items use base64-encoded redirect URLs like:
 *   https://news.google.com/rss/articles/CBMi...
 *
 * Strategy:
 * 1. Try to decode the base64 payload (fast, no network)
 * 2. Fall back to GET with capped redirect-following (slower, needs network)
 * 3. Return original URL if both fail
 */
export async function resolveGoogleNewsUrl(url: string): Promise<string> {
  if (!url.startsWith('https://news.google.com/rss/articles/')) return url;

  // Method 1: Decode the base64 blob directly
  // The URL format is: .../articles/CBMi<base64>?...
  // The base64 payload contains the real URL after a short binary prefix
  try {
    const articlePart = url.split('/articles/')[1]?.split('?')[0];
    if (articlePart) {
      // The payload starts with "CBMi" which is a protobuf varint prefix
      // Strip it and decode the rest
      const stripped = articlePart.startsWith('CBMi') ? articlePart.slice(4) : articlePart;
      const decoded = Buffer.from(stripped, 'base64').toString('utf-8');
      // Extract the first URL from the decoded content
      const urlMatch = decoded.match(/https?:\/\/[^\s"'\x00-\x1f]+/);
      if (urlMatch) {
        const resolved = urlMatch[0];
        // Validate it's a real article URL, not another Google URL
        if (!resolved.includes('google.com') && !resolved.includes('gstatic.com')) {
          return resolved;
        }
      }
    }
  } catch {
    // Base64 decode failed — try network approach
  }

  // Method 2: Follow redirects (validated per hop) and read the effective URL
  try {
    const { response, finalUrl } = await safeFetch(url, {
      timeoutMs: 6_000,
      headers: { 'User-Agent': BROWSER_UA },
    });
    try { await response.body?.cancel(); } catch { /* ignore */ }
    if (finalUrl && finalUrl !== url && !finalUrl.includes('news.google.com')) {
      return finalUrl;
    }
  } catch {
    // Network failed or unsafe URL
  }

  return url;
}

/**
 * Pre-process a source URL before attempting thumbnail extraction.
 * Resolves redirects, normalizes domains, etc.
 */
export async function resolveSourceUrl(url: string): Promise<string> {
  // Google News blob resolution
  if (url.startsWith('https://news.google.com/rss/articles/')) {
    return resolveGoogleNewsUrl(url);
  }
  return url;
}

// ─── Post-extraction: Thumbnail Validation ──────────────────────────────────

/**
 * Check if a thumbnail URL's domain is in the blocklist.
 */
export function checkBlockedDomain(thumbnailUrl: string): ValidationResult {
  try {
    const domain = new URL(thumbnailUrl).hostname;
    if (BLOCKED_THUMBNAIL_DOMAINS.has(domain)) {
      return { valid: false, reason: `blocked_domain:${domain}` };
    }
  } catch {
    return { valid: false, reason: 'invalid_url' };
  }
  return { valid: true };
}

/**
 * Check if a thumbnail URL's path matches known generic/brand patterns.
 */
export function checkBlockedPath(thumbnailUrl: string): ValidationResult {
  for (const pattern of BLOCKED_PATH_PATTERNS) {
    if (pattern.test(thumbnailUrl)) {
      return { valid: false, reason: `blocked_path:${pattern.source}` };
    }
  }
  return { valid: true };
}

/**
 * Check if the thumbnail domain blocks hotlinking.
 */
export function checkHotlinkBlocked(thumbnailUrl: string): ValidationResult {
  try {
    const domain = new URL(thumbnailUrl).hostname;
    if (HOTLINK_BLOCKED_DOMAINS.has(domain)) {
      return { valid: false, reason: `hotlink_blocked:${domain}` };
    }
  } catch {
    return { valid: false, reason: 'invalid_url' };
  }
  return { valid: true };
}

/**
 * Check if a thumbnail URL is actually an article/page URL (not an image).
 * This catches the fallback where extractThumbnail() returns the article URL itself.
 *
 * Note: the old `/\d{4}\/\d{2}\//` date-path heuristic was removed — major
 * CDNs (CNN, Reuters) legitimately put dates in image paths and were being
 * rejected wholesale.
 */
export function checkIsImageUrl(thumbnailUrl: string): ValidationResult {
  try {
    const url = new URL(thumbnailUrl);

    // RSS blob URLs
    if (url.hostname === 'news.google.com') {
      return { valid: false, reason: 'google_news_blob' };
    }
  } catch {
    return { valid: false, reason: 'invalid_url' };
  }
  return { valid: true };
}

/**
 * Optional: HEAD-request check for accessibility and content type.
 * Slower (makes a network request), use sparingly.
 * Returns valid=true if the URL returns 2xx with an image content-type.
 */
export async function checkHeadRequest(thumbnailUrl: string): Promise<ValidationResult> {
  try {
    const { response } = await safeFetch(thumbnailUrl, {
      method: 'HEAD',
      timeoutMs: 5_000,
      headers: { 'User-Agent': BROWSER_UA },
    });
    const httpCode = response.status;
    const contentType = response.headers.get('content-type') ?? '';
    try { await response.body?.cancel(); } catch { /* ignore */ }

    if (httpCode === 403) {
      return { valid: false, reason: `http_403_forbidden` };
    }
    if (httpCode >= 400) {
      return { valid: false, reason: `http_${httpCode}` };
    }
    if (contentType && !contentType.split(';')[0].trim().startsWith('image/')) {
      return { valid: false, reason: `content_type:${contentType}` };
    }
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      return { valid: false, reason: `unsafe_url:${(err as Error).message}` };
    }
    // Network error — don't reject, the image might work in browser
    return { valid: true };
  }
  return { valid: true };
}

// ─── Composite Validator ────────────────────────────────────────────────────

/**
 * Run all fast (no-network) validation checks on a thumbnail URL, plus the
 * optional HEAD check.
 * Returns null if the thumbnail is trash, or the cleaned URL if valid.
 *
 * Fast checks (always run):
 * - URL safety (scheme allowlist, private-IP / localhost hosts)
 * - Blocked domain
 * - Blocked path pattern
 * - Hotlink-blocked domain
 * - Is-image check (not a Google News blob)
 *
 * This is the function that local-hourly.ts and backfill-media.ts should call
 * after extracting a thumbnail URL.
 */
export async function validateThumbnail(
  thumbnailUrl: string,
  opts?: { enableHeadCheck?: boolean }
): Promise<ValidatedThumbnail> {
  if (!thumbnailUrl || !thumbnailUrl.startsWith('http')) {
    return { url: null, rejectedUrl: thumbnailUrl, rejectedReason: 'not_a_url' };
  }

  // Fast checks (no network)
  const checks = [
    checkUrlSafety,
    checkBlockedDomain,
    checkBlockedPath,
    checkHotlinkBlocked,
    checkIsImageUrl,
  ];

  for (const check of checks) {
    const result = check(thumbnailUrl);
    if (!result.valid) {
      return {
        url: null,
        rejectedUrl: thumbnailUrl,
        rejectedReason: result.reason,
      };
    }
  }

  // Optional slow check (network)
  if (opts?.enableHeadCheck) {
    const headResult = await checkHeadRequest(thumbnailUrl);
    if (!headResult.valid) {
      return {
        url: null,
        rejectedUrl: thumbnailUrl,
        rejectedReason: headResult.reason,
      };
    }
  }

  return { url: thumbnailUrl };
}

// ─── Dedup Tracker ──────────────────────────────────────────────────────────

/**
 * Tracks thumbnail URLs seen during a pipeline run.
 * If the same URL appears more than `threshold` times,
 * it's probably a generic icon — reject further uses.
 */
export class ThumbnailDeduplicator {
  private seen = new Map<string, number>();
  private threshold: number;

  constructor(threshold = 5) {
    this.threshold = threshold;
  }

  /**
   * Check if this URL has been seen too many times (generic image).
   * Call this AFTER validateThumbnail().
   */
  check(url: string): ValidationResult {
    const count = (this.seen.get(url) || 0) + 1;
    this.seen.set(url, count);
    if (count > this.threshold) {
      return { valid: false, reason: `duplicate_${count}x_exceeds_${this.threshold}` };
    }
    return { valid: true };
  }

  /** Get URLs that have been flagged as duplicates. */
  getDuplicates(): Map<string, number> {
    return new Map([...this.seen].filter(([, count]) => count > this.threshold));
  }
}
