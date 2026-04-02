/**
 * Backfill media data for existing event files by fetching og:image tags
 * from source URLs.
 *
 * Usage:
 *   npx tsx scripts/backfill-media.ts
 *   npx tsx scripts/backfill-media.ts --tracker iran-conflict
 *   npx tsx scripts/backfill-media.ts --tracker iran-conflict --dry-run
 */
import fs from 'fs';
import path from 'path';

// ── CLI Flags ──

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const trackerFlagIdx = args.indexOf('--tracker');
const trackerFilter = trackerFlagIdx !== -1 ? args[trackerFlagIdx + 1] : null;

if (trackerFlagIdx !== -1 && !trackerFilter) {
  console.error('Error: --tracker flag requires a slug argument');
  process.exit(1);
}

const trackersDir = 'trackers';

// ── Rate Limiting ──

const RATE_LIMIT_MS = 200;
const FETCH_TIMEOUT_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── og:image Extraction ──

/**
 * Fetches a URL and extracts the og:image meta tag content.
 * Returns null on any failure (timeout, non-200, missing tag).
 */
async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Watchboard/1.0; +https://github.com)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    // Read only the first ~50KB to find the og:image in <head>
    const reader = response.body?.getReader();
    if (!reader) return null;

    let html = '';
    const decoder = new TextDecoder();
    const MAX_BYTES = 50 * 1024;

    while (html.length < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });

      // Early exit once we've passed </head>
      if (html.includes('</head>') || html.includes('</HEAD>')) break;
    }

    // Cancel the rest of the response body
    try {
      reader.cancel();
    } catch {
      // Ignore cancel errors
    }

    // Extract og:image — handles both property="og:image" and content="..." in any order
    // Pattern 1: <meta property="og:image" content="...">
    const pattern1 = /<meta\s[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*\/?>/i;
    // Pattern 2: <meta content="..." property="og:image">
    const pattern2 = /<meta\s[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*\/?>/i;

    const match = html.match(pattern1) || html.match(pattern2);
    if (match && match[1]) {
      const imageUrl = match[1].trim();
      // Basic validation: must look like a URL
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('//')) {
        return imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl;
      }
    }

    return null;
  } catch {
    // Timeout, network error, etc.
    return null;
  }
}

// ── Image Quality Filtering ──

/** Reject brand logos, generic social cards, and non-news images. */
function isNewsImage(imageUrl: string): boolean {
  const lower = imageUrl.toLowerCase();

  // Reject generic brand/logo patterns
  const brandPatterns = [
    /\/logo[s]?[\-_\.\/]/,
    /\/favicon/,
    /\/brand[\-_\.\/]/,
    /\/icon[\-_\.\/]/,
    /\/default[\-_]?(share|social|og|image|thumb)/,
    /\/placeholder/,
    /\/generic[\-_]/,
    /\/site[\-_]?(logo|image|default|og)/,
    /\/avatar[\-_\.\/]/,
    /\/badge[\-_\.\/]/,
    /social[\-_]?(card|preview|share|default)/,
    /\/fallback[\-_]?(image|og)/,
    /apple[\-_]touch[\-_]icon/,
  ];
  if (brandPatterns.some((p) => p.test(lower))) return false;

  // Reject tiny images (common URL dimension patterns)
  const dimMatch = lower.match(/[\?&\/](width|w|size)=(\d+)/);
  if (dimMatch && parseInt(dimMatch[2]) < 200) return false;

  // Reject common non-news file types in the URL
  if (/\.(ico|svg)(\?|$)/.test(lower)) return false;

  return true;
}

// ── Source URL Filtering ──

/** Skip non-article URLs (APIs, data feeds, PDFs, images). */
function isArticleUrl(url: string): boolean {
  const lower = url.toLowerCase();
  // Skip direct media/data URLs
  if (/\.(pdf|jpg|jpeg|png|gif|svg|mp4|mp3|json|xml|csv)(\?|$)/i.test(lower)) return false;
  // Skip API endpoints
  if (/\/api\//i.test(lower)) return false;
  // Must be http(s)
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return false;
  return true;
}

// ── Types ──

interface EventSource {
  name: string;
  tier: number;
  url?: string;
  pole?: string;
}

interface MediaItem {
  type: string;
  url: string;
  caption?: string;
  source?: string;
  thumbnail?: string;
}

interface TimelineEvent {
  id: string;
  year: string;
  title: string;
  type: string;
  detail: string;
  sources: EventSource[];
  media?: MediaItem[];
  [key: string]: unknown;
}

// ── Main ──

async function main() {
  console.log(`Backfill media script started${dryRun ? ' (DRY RUN)' : ''}`);
  if (trackerFilter) {
    console.log(`Filtering to tracker: ${trackerFilter}`);
  }
  console.log('');

  // Discover tracker directories
  let slugs: string[];
  try {
    slugs = fs.readdirSync(trackersDir).filter((slug) => {
      const eventsDir = path.join(trackersDir, slug, 'data', 'events');
      return fs.existsSync(eventsDir) && fs.statSync(eventsDir).isDirectory();
    });
  } catch {
    console.error(`Error: could not read ${trackersDir} directory`);
    process.exit(1);
  }

  if (trackerFilter) {
    if (!slugs.includes(trackerFilter)) {
      console.error(`Error: tracker "${trackerFilter}" not found or has no events directory`);
      process.exit(1);
    }
    slugs = [trackerFilter];
  }

  let totalEnriched = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let trackersProcessed = 0;

  for (const slug of slugs) {
    const eventsDir = path.join(trackersDir, slug, 'data', 'events');
    const eventFiles = fs.readdirSync(eventsDir).filter((f) => f.endsWith('.json'));

    if (eventFiles.length === 0) continue;
    trackersProcessed++;

    for (const file of eventFiles) {
      const filePath = path.join(eventsDir, file);
      let events: TimelineEvent[];

      try {
        events = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch {
        console.warn(`  [${slug}/${file}] Skipping — invalid JSON`);
        totalFailed++;
        continue;
      }

      if (!Array.isArray(events)) {
        console.warn(`  [${slug}/${file}] Skipping — not an array`);
        totalFailed++;
        continue;
      }

      let fileModified = false;

      for (const event of events) {
        // Try to fill missing thumbnails on existing media entries
        if (event.media && Array.isArray(event.media) && event.media.length > 0) {
          const needsThumb = event.media.filter((m: MediaItem) => m.url && !m.thumbnail && isArticleUrl(m.url));
          if (needsThumb.length > 0) {
            for (const m of needsThumb) {
              await sleep(RATE_LIMIT_MS);
              const ogImage = await fetchOgImage(m.url);
              if (ogImage && isNewsImage(ogImage)) {
                if (dryRun) {
                  console.log(`  [${slug}/${file}] Would add thumbnail for "${event.id}" from ${m.url.substring(0, 60)}`);
                  console.log(`    og:image: ${ogImage}`);
                } else {
                  m.thumbnail = ogImage;
                  console.log(`  [${slug}/${file}] Filled thumbnail for "${event.id}"`);
                }
                totalEnriched++;
                fileModified = true;
              }
            }
          }
          totalSkipped++;
          continue;
        }

        // Find first source with a usable article URL
        const sourcesWithUrls = (event.sources || []).filter(
          (s: EventSource) => s.url && isArticleUrl(s.url)
        );

        if (sourcesWithUrls.length === 0) {
          totalSkipped++;
          continue;
        }

        // Try each source URL until we find an og:image
        let foundMedia = false;

        for (const source of sourcesWithUrls) {
          await sleep(RATE_LIMIT_MS);

          const ogImage = await fetchOgImage(source.url!);

          if (ogImage && isNewsImage(ogImage)) {
            const mediaEntry: MediaItem = {
              type: 'image',
              url: source.url!,
              caption: event.title,
              source: source.name,
              thumbnail: ogImage,
            };

            if (dryRun) {
              console.log(`  [${slug}/${file}] Would add media for "${event.id}" from ${source.name}`);
              console.log(`    og:image: ${ogImage}`);
            } else {
              event.media = [mediaEntry];
              console.log(`  [${slug}/${file}] Fetched og:image from ${source.url} for event "${event.id}"`);
            }

            totalEnriched++;
            foundMedia = true;
            fileModified = true;
            break; // Use the first successful source
          }
        }

        if (!foundMedia) {
          totalFailed++;
        }
      }

      // Write back if modified and not dry run
      if (fileModified && !dryRun) {
        fs.writeFileSync(filePath, JSON.stringify(events, null, 2) + '\n');
      }
    }
  }

  // Summary
  console.log('');
  console.log('─'.repeat(60));
  console.log(`Enriched ${totalEnriched} events across ${trackersProcessed} trackers (${totalSkipped} skipped, ${totalFailed} failed)`);
  if (dryRun) {
    console.log('(dry run — no files were modified)');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
