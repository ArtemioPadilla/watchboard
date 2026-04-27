/**
 * Backfill thumbnails for events that have no media[].
 * Falls back to Wikipedia REST API and Wikidata image (P18) when an event
 * has no usable og:image source. Useful for historical/pre-internet events
 * whose sources are academic citations without URLs.
 *
 * Usage:
 *   npx tsx scripts/backfill-wikimedia.ts
 *   npx tsx scripts/backfill-wikimedia.ts --tracker mexico
 *   npx tsx scripts/backfill-wikimedia.ts --tracker mexico --dry-run
 *   npx tsx scripts/backfill-wikimedia.ts --max 50          (cap per-tracker)
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const videosOnly = args.includes('--videos');
const trackerFlagIdx = args.indexOf('--tracker');
const trackerFilter = trackerFlagIdx !== -1 ? args[trackerFlagIdx + 1] : null;
const maxFlagIdx = args.indexOf('--max');
const maxPerTracker = maxFlagIdx !== -1 ? parseInt(args[maxFlagIdx + 1], 10) : Infinity;

const trackersDir = 'trackers';
const RATE_LIMIT_MS = 200; // 5 req/s — well under Wikipedia's 200 RPS allowance
const FETCH_TIMEOUT_MS = 6000;
const USER_AGENT = 'Watchboard/1.0 (https://watchboard.dev; tracker thumbnail backfill)';

interface MediaItem {
  type: 'image' | 'video' | 'article';
  url: string;
  caption?: string;
  source?: string;
  thumbnail?: string;
}

interface EventSource {
  name: string;
  tier: number;
  url?: string;
  pole?: string;
}

interface TimelineEvent {
  id: string;
  title?: string;
  date?: string | null;
  year?: string;
  detail?: string;
  sources?: EventSource[];
  media?: MediaItem[];
}

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

async function fetchJSON(url: string): Promise<any | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function rejectImage(url: string): string | null {
  if (!url || typeof url !== 'string') return 'no-url';
  if (!/^https?:\/\//i.test(url)) return 'not-http';
  // Reject SVGs (logos, charts) — usually not what we want for an event hero
  if (/\.svg(\?|$)/i.test(url)) return 'svg';
  // Reject generic flags/coats of arms (small, non-illustrative for an event)
  if (/\/(flag_of_|coat_of_arms_|coat-of-arms-)/i.test(url)) return 'flag/coa';
  // Reject obvious icons / logos
  if (/(logo|favicon|sprite|placeholder)/i.test(url)) return 'logo';
  return null;
}

/**
 * Strip noise from event titles to make them search-friendly:
 *  "Battle of Hastings (1066)" → "Battle of Hastings"
 *  "Maduro inaugurated for third term — Jan 2025" → "Maduro inaugurated for third term"
 */
function cleanTitle(title: string): string {
  return title
    .replace(/\([^)]*\d{4}[^)]*\)/g, '') // (1066), (Jan 2025)
    .replace(/[—–-]\s*\w{3,}\.?\s*\d{4}.*/g, '') // — Jan 2025 ...
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Try to find a Wikipedia article matching this event title and return its
 * REST `page/summary` thumbnail. Best-quality, single API call.
 */
async function wikipediaSummary(query: string): Promise<{ pageUrl: string; thumbnail: string } | null> {
  const slug = encodeURIComponent(query.replace(/\s+/g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}?redirect=true`;
  const data = await fetchJSON(url);
  if (!data) return null;
  if (data.type === 'disambiguation') return null;
  const thumb = data.thumbnail?.source || data.originalimage?.source;
  if (!thumb) return null;
  if (rejectImage(thumb)) return null;
  return {
    pageUrl: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${slug}`,
    thumbnail: thumb,
  };
}

/**
 * Wikipedia full-text search → take top result → fetch its summary → return thumbnail.
 * Used when the verbatim title isn't an article name.
 */
async function wikipediaSearch(query: string): Promise<{ pageUrl: string; thumbnail: string } | null> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`;
  const data = await fetchJSON(url);
  const top = data?.query?.search?.[0]?.title;
  if (!top) return null;
  return wikipediaSummary(top);
}

/**
 * Wikimedia Commons file search restricted to videos. Sparse coverage but
 * gives historical clips for emblematic events: parades, speeches, disasters.
 */
async function findCommonsVideo(event: TimelineEvent): Promise<{ url: string; thumbnail: string; title: string } | null> {
  if (!event.title) return null;
  const query = cleanTitle(event.title);
  await sleep(RATE_LIMIT_MS);
  const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}+filetype:video&srnamespace=6&srlimit=3&format=json&origin=*`;
  const data = await fetchJSON(url);
  const top = data?.query?.search?.[0]?.title;
  if (!top || !/^File:.+\.(webm|ogv|mp4)$/i.test(top)) return null;
  await sleep(RATE_LIMIT_MS);
  const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&prop=videoinfo|imageinfo&titles=${encodeURIComponent(top)}&viprop=url|size&iiprop=url&iiurlwidth=480&format=json&origin=*`;
  const info = await fetchJSON(infoUrl);
  const pages = info?.query?.pages;
  if (!pages) return null;
  const page: any = Object.values(pages)[0];
  const videoUrl = page?.videoinfo?.[0]?.url || page?.imageinfo?.[0]?.url;
  const thumb = page?.imageinfo?.[0]?.thumburl;
  if (!videoUrl) return null;
  return { url: videoUrl, thumbnail: thumb || videoUrl, title: top };
}

async function findThumbnail(event: TimelineEvent): Promise<{ pageUrl: string; thumbnail: string; via: string } | null> {
  if (!event.title) return null;
  const cleaned = cleanTitle(event.title);

  // 1. Try summary endpoint with the cleaned title verbatim
  await sleep(RATE_LIMIT_MS);
  let r = await wikipediaSummary(cleaned);
  if (r) return { ...r, via: 'wikipedia-summary' };

  // 2. Fall back to search
  await sleep(RATE_LIMIT_MS);
  r = await wikipediaSearch(cleaned);
  if (r) return { ...r, via: 'wikipedia-search' };

  return null;
}

async function processEvents(events: TimelineEvent[], slug: string, fileLabel: string, budget: { remaining: number }): Promise<{ enriched: number; skipped: number; failed: number }> {
  let enriched = 0, skipped = 0, failed = 0;
  for (const ev of events) {
    if (budget.remaining <= 0) { skipped++; continue; }
    if (!ev.title) { skipped++; continue; }

    if (videosOnly) {
      // In videos pass: skip events that already have a video media entry
      if (ev.media && ev.media.some(m => m.type === 'video')) { skipped++; continue; }
      const v = await findCommonsVideo(ev);
      if (!v) { failed++; continue; }
      const entry: MediaItem = {
        type: 'video',
        url: v.url,
        source: `Wikimedia Commons / ${v.title.replace(/^File:/, '')}`,
        thumbnail: v.thumbnail,
      };
      if (dryRun) {
        console.log(`  [${slug}/${fileLabel}] WOULD add commons-video "${ev.id}" -> ${v.title}`);
      } else {
        ev.media = [...(ev.media || []), entry];
        console.log(`  [${slug}/${fileLabel}] +commons-video "${ev.id}" (${v.title})`);
      }
      enriched++;
      budget.remaining--;
      continue;
    }

    if (ev.media && Array.isArray(ev.media) && ev.media.some(m => m.thumbnail)) { skipped++; continue; }

    const hit = await findThumbnail(ev);
    if (!hit) { failed++; continue; }

    const entry: MediaItem = {
      type: 'image',
      url: hit.pageUrl,
      source: `Wikipedia / ${hit.pageUrl.split('/wiki/')[1]?.replace(/_/g, ' ') || 'unknown'}`,
      thumbnail: hit.thumbnail,
    };
    if (dryRun) {
      console.log(`  [${slug}/${fileLabel}] WOULD add (${hit.via}) "${ev.id}" -> ${hit.thumbnail.slice(0, 80)}`);
    } else {
      ev.media = [entry, ...(ev.media || [])];
      console.log(`  [${slug}/${fileLabel}] +${hit.via} "${ev.id}"`);
    }
    enriched++;
    budget.remaining--;
  }
  return { enriched, skipped, failed };
}

async function main() {
  console.log(`Wikimedia backfill${dryRun ? ' (DRY RUN)' : ''}${trackerFilter ? ` filter=${trackerFilter}` : ''}`);
  let slugs = fs.readdirSync(trackersDir).filter(s => fs.existsSync(path.join(trackersDir, s, 'tracker.json')));
  if (trackerFilter) {
    if (!slugs.includes(trackerFilter)) { console.error(`Tracker not found: ${trackerFilter}`); process.exit(1); }
    slugs = [trackerFilter];
  }

  let totalEnriched = 0, totalSkipped = 0, totalFailed = 0, trackersTouched = 0;

  for (const slug of slugs) {
    const budget = { remaining: maxPerTracker };
    let touched = false;

    // 1. timeline.json
    const timelinePath = path.join(trackersDir, slug, 'data', 'timeline.json');
    if (fs.existsSync(timelinePath)) {
      let timeline: { era?: string | null; events: TimelineEvent[] }[];
      try {
        timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
      } catch {
        timeline = [];
      }
      if (Array.isArray(timeline)) {
        let modified = false;
        for (const era of timeline) {
          if (!Array.isArray(era.events)) continue;
          const before = era.events.filter(e => !e.media || !e.media.some(m => m.thumbnail)).length;
          const r = await processEvents(era.events, slug, 'timeline.json', budget);
          totalEnriched += r.enriched;
          totalSkipped += r.skipped;
          totalFailed += r.failed;
          if (r.enriched > 0) modified = true;
        }
        if (modified && !dryRun) {
          fs.writeFileSync(timelinePath, JSON.stringify(timeline, null, 2) + '\n');
          touched = true;
        }
      }
    }

    // 2. data/events/*.json
    const eventsDir = path.join(trackersDir, slug, 'data', 'events');
    if (fs.existsSync(eventsDir)) {
      const files = fs.readdirSync(eventsDir).filter(f => f.endsWith('.json'));
      for (const f of files) {
        if (budget.remaining <= 0) break;
        const filePath = path.join(eventsDir, f);
        let arr: TimelineEvent[];
        try {
          arr = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch { continue; }
        if (!Array.isArray(arr)) continue;
        const r = await processEvents(arr, slug, f, budget);
        totalEnriched += r.enriched;
        totalSkipped += r.skipped;
        totalFailed += r.failed;
        if (r.enriched > 0 && !dryRun) {
          fs.writeFileSync(filePath, JSON.stringify(arr, null, 2) + '\n');
          touched = true;
        }
      }
    }

    if (touched) trackersTouched++;
  }

  console.log('');
  console.log('─'.repeat(60));
  console.log(`${dryRun ? 'Would enrich' : 'Enriched'} ${totalEnriched} events across ${trackersTouched} trackers (${totalSkipped} skipped, ${totalFailed} failed)`);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
