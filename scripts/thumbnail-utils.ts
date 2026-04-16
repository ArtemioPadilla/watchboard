/**
 * thumbnail-utils.ts
 *
 * Shared thumbnail validation and sanitization for Watchboard.
 *
 * Provides:
 * - Pre-extraction URL resolution (Google News blob → real article)
 * - Post-extraction quality validation (blocklist, HEAD check, dedup)
 * - Centralized rules so local-hourly.ts and backfill-media.ts share the same logic
 *
 * Design: each validation is a standalone function that returns
 * { valid: boolean; reason?: string } so we can log rejections clearly
 * and add new rules without touching existing ones.
 */

import { execSync } from 'child_process';

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

// ─── Pre-extraction: URL Resolution ─────────────────────────────────────────

/**
 * Resolve Google News opaque blob URLs to the real article URL.
 * Google News RSS items use base64-encoded redirect URLs like:
 *   https://news.google.com/rss/articles/CBMi...
 *
 * Strategy:
 * 1. Try to decode the base64 payload (fast, no network)
 * 2. Fall back to GET with follow-redirect (slower, needs network)
 * 3. Return original URL if both fail
 */
export function resolveGoogleNewsUrl(url: string): string {
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

  // Method 2: Follow redirects with a GET request
  try {
    const result = execSync(
      `curl -sL --max-time 6 --max-redirs 8 -o /dev/null -w "%{url_effective}" -H "User-Agent: ${BROWSER_UA}" ${JSON.stringify(url)}`,
      { encoding: 'utf-8', timeout: 10_000 }
    ).trim();
    if (result && result !== url && !result.includes('news.google.com')) {
      return result;
    }
  } catch {
    // Network failed
  }

  return url;
}

/**
 * Pre-process a source URL before attempting thumbnail extraction.
 * Resolves redirects, normalizes domains, etc.
 */
export function resolveSourceUrl(url: string): string {
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
 */
export function checkIsImageUrl(thumbnailUrl: string): ValidationResult {
  try {
    const url = new URL(thumbnailUrl);
    const path = url.pathname.toLowerCase();

    // If it looks like a news article (has slug-like path), reject
    if (path.match(/\/\d{4}\/\d{2}\//) && !path.match(/\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/)) {
      // Could be a news URL like /2026/04/15/article-title
      // Only reject if it doesn't end in an image extension
      return { valid: false, reason: 'article_url_not_image' };
    }

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
export function checkHeadRequest(thumbnailUrl: string): ValidationResult {
  try {
    const result = execSync(
      `curl -sI --max-time 5 --max-redirs 3 -H "User-Agent: ${BROWSER_UA}" -o /dev/null -w "%{http_code} %{content_type}" ${JSON.stringify(thumbnailUrl)}`,
      { encoding: 'utf-8', timeout: 8_000 }
    ).trim();
    const [code, contentType] = result.split(' ');
    const httpCode = parseInt(code || '0');

    if (httpCode === 403) {
      return { valid: false, reason: `http_403_forbidden` };
    }
    if (httpCode >= 400) {
      return { valid: false, reason: `http_${httpCode}` };
    }
    if (contentType && !contentType.startsWith('image/')) {
      return { valid: false, reason: `content_type:${contentType}` };
    }
  } catch {
    // Network error — don't reject, the image might work in browser
    return { valid: true };
  }
  return { valid: true };
}

// ─── Composite Validator ────────────────────────────────────────────────────

/**
 * Run all fast (no-network) validation checks on a thumbnail URL.
 * Returns null if the thumbnail is trash, or the cleaned URL if valid.
 *
 * Fast checks (always run):
 * - Blocked domain
 * - Blocked path pattern
 * - Hotlink-blocked domain
 * - Is-image check (not an article URL)
 *
 * This is the function that local-hourly.ts and backfill-media.ts should call
 * after extracting a thumbnail URL.
 */
export function validateThumbnail(
  thumbnailUrl: string,
  opts?: { enableHeadCheck?: boolean }
): ValidatedThumbnail {
  if (!thumbnailUrl || !thumbnailUrl.startsWith('http')) {
    return { url: null, rejectedUrl: thumbnailUrl, rejectedReason: 'not_a_url' };
  }

  // Fast checks (no network)
  const checks = [
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
    const headResult = checkHeadRequest(thumbnailUrl);
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
