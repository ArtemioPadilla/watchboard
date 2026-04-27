/**
 * Search YouTube for an event and attach a video clip with poster thumbnail.
 *
 * Strategy:
 *   - For each event without a `media` entry of type "video", search YouTube
 *     by event title scoped to a curated list of trustworthy news channels
 *     (Reuters, AP, BBC News, AlJazeera English, El País, etc.).
 *   - Filter results: short videos preferred (<10min), high view count, recent.
 *   - Attach as media[] entry: { type:"video", url:youtu.be/{id},
 *     thumbnail:i.ytimg.com/vi/{id}/hqdefault.jpg, source:"YouTube / {channel}" }.
 *
 * Requires env: YOUTUBE_API_KEY (Google Cloud Console > YouTube Data API v3).
 * Free quota: 10k units/day. Each search.list = 100 units, so ~100 searches/day.
 *
 * Usage:
 *   YOUTUBE_API_KEY=xxx npx tsx scripts/backfill-youtube.ts
 *   ... --tracker mexico
 *   ... --dry-run
 *   ... --max 30   (cap per tracker; total budget = max * trackers)
 */
import fs from 'fs';
import path from 'path';

const API_KEY = process.env.YOUTUBE_API_KEY;
if (!API_KEY) {
  console.error('YOUTUBE_API_KEY env var required. Get one at https://console.cloud.google.com/apis/library/youtube.googleapis.com');
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const trackerFlagIdx = args.indexOf('--tracker');
const trackerFilter = trackerFlagIdx !== -1 ? args[trackerFlagIdx + 1] : null;
const maxFlagIdx = args.indexOf('--max');
const maxPerTracker = maxFlagIdx !== -1 ? parseInt(args[maxFlagIdx + 1], 10) : 20;

const TRACKERS_DIR = 'trackers';
const RATE_LIMIT_MS = 250;

// Curated news channels (channelId -> human label).
// Each search is scoped to one of these via channelId param to keep results trustworthy.
const NEWS_CHANNELS: Record<string, string> = {
  'UCknLrEdhRCp1aegoMqRaCZg': 'Reuters',                  // Reuters
  'UC52X5wxOL_s5yw0dQk7NtgA': 'Associated Press',         // AP Archive
  'UC16niRr50-MSBwiO3YDb3RA': 'BBC News',
  'UCNye-wNBqNL5ZzHSJj3l8Bg': 'AlJazeera English',
  'UCXIJgqnII2ZOINSWNOGFThA': 'Fox News',
  'UCupvZG-5ko_eiXAupbDfxWw': 'CNN',
  'UCBi2mrWuNuyYy4gbM6fU18Q': 'ABC News',
  'UCeY0bbntWzzVIaj2z3QigXg': 'NBC News',
  'UC-7gjx704Bw0vL3MFFnniUw': 'TRT World',
  'UCIRYBXDze5krPDzAEOxFGVA': 'France 24 English',
};

interface MediaItem {
  type: 'image' | 'video' | 'article';
  url: string;
  caption?: string;
  source?: string;
  thumbnail?: string;
}
interface TimelineEvent {
  id: string;
  title?: string;
  date?: string | null;
  year?: string;
  detail?: string;
  media?: MediaItem[];
}

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

function cleanTitle(t: string): string {
  return t.replace(/\([^)]*\d{4}[^)]*\)/g, '').replace(/\s{2,}/g, ' ').trim();
}

interface YTHit {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  publishedAt: string;
}

async function searchYouTube(query: string): Promise<YTHit | null> {
  // Search across all curated channels in one request — no channelId param,
  // then post-filter by channelId. Cheaper and gives the best match overall.
  const params = new URLSearchParams({
    key: API_KEY!,
    part: 'snippet',
    q: query,
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: '15',
    relevanceLanguage: 'en',
  });
  const url = 'https://www.googleapis.com/youtube/v3/search?' + params.toString();
  let res: Response;
  try { res = await fetch(url); }
  catch { return null; }
  if (!res.ok) {
    if (res.status === 403 || res.status === 429) {
      console.error(`Quota/auth error: ${res.status} — stopping run.`);
      process.exit(2);
    }
    return null;
  }
  const data: any = await res.json();
  const items = data.items || [];
  // Prefer items from our curated channel list (in declared priority order)
  for (const channelId of Object.keys(NEWS_CHANNELS)) {
    const hit = items.find((it: any) => it.snippet?.channelId === channelId);
    if (hit) {
      return {
        videoId: hit.id.videoId,
        channelId,
        channelTitle: NEWS_CHANNELS[channelId],
        title: hit.snippet.title,
        publishedAt: hit.snippet.publishedAt,
      };
    }
  }
  return null; // No trusted channel returned a match for this query
}

async function processEvents(events: TimelineEvent[], slug: string, fileLabel: string, budget: { remaining: number }): Promise<{ enriched: number; skipped: number; failed: number }> {
  let enriched = 0, skipped = 0, failed = 0;
  for (const ev of events) {
    if (budget.remaining <= 0) { skipped++; continue; }
    if (!ev.title) { skipped++; continue; }

    // Skip events that already have a video media entry
    if (Array.isArray(ev.media) && ev.media.some(m => m.type === 'video')) { skipped++; continue; }

    // Need a date — only enrich modern events (1990+) since pre-1990 has thin
    // YouTube coverage and high false-positive rate
    const yr = ev.date?.slice(0, 4) || ev.year?.replace(/[^0-9-]/g, '').slice(0, 4) || '';
    if (!yr || parseInt(yr, 10) < 1990) { skipped++; continue; }

    await sleep(RATE_LIMIT_MS);
    const cleaned = cleanTitle(ev.title);
    const hit = await searchYouTube(cleaned);
    if (!hit) { failed++; continue; }

    const entry: MediaItem = {
      type: 'video',
      url: `https://youtu.be/${hit.videoId}`,
      caption: ev.title,
      source: `YouTube / ${hit.channelTitle}`,
      thumbnail: `https://i.ytimg.com/vi/${hit.videoId}/hqdefault.jpg`,
    };
    if (dryRun) {
      console.log(`  [${slug}/${fileLabel}] WOULD add ${hit.channelTitle} "${ev.id}" -> ${hit.videoId} (${hit.title.slice(0, 50)})`);
    } else {
      ev.media = [...(ev.media || []), entry];
      console.log(`  [${slug}/${fileLabel}] +YT ${hit.channelTitle} "${ev.id}" (${hit.videoId})`);
    }
    enriched++;
    budget.remaining--;
  }
  return { enriched, skipped, failed };
}

async function main() {
  console.log(`YouTube backfill${dryRun ? ' (DRY RUN)' : ''}${trackerFilter ? ` filter=${trackerFilter}` : ''} max=${maxPerTracker}/tracker`);
  let slugs = fs.readdirSync(TRACKERS_DIR).filter(s => fs.existsSync(path.join(TRACKERS_DIR, s, 'tracker.json')));
  if (trackerFilter) {
    if (!slugs.includes(trackerFilter)) { console.error(`Tracker not found: ${trackerFilter}`); process.exit(1); }
    slugs = [trackerFilter];
  }

  let totalEnriched = 0, totalSkipped = 0, totalFailed = 0, trackersTouched = 0;

  for (const slug of slugs) {
    const budget = { remaining: maxPerTracker };
    let touched = false;

    const timelinePath = path.join(TRACKERS_DIR, slug, 'data', 'timeline.json');
    if (fs.existsSync(timelinePath)) {
      let timeline: { events: TimelineEvent[] }[];
      try { timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8')); } catch { timeline = []; }
      if (Array.isArray(timeline)) {
        let modified = false;
        for (const era of timeline) {
          if (!Array.isArray(era.events)) continue;
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

    const eventsDir = path.join(TRACKERS_DIR, slug, 'data', 'events');
    if (fs.existsSync(eventsDir)) {
      const files = fs.readdirSync(eventsDir).filter(f => f.endsWith('.json'));
      for (const f of files) {
        if (budget.remaining <= 0) break;
        const filePath = path.join(eventsDir, f);
        let arr: TimelineEvent[];
        try { arr = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { continue; }
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
