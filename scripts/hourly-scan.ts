/**
 * hourly-scan.ts
 * RSS/GDELT polling + URL dedup for the hourly breaking-news pipeline.
 * Outputs candidate headlines to /tmp/hourly-candidates.json for hourly-triage.ts.
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import {
  type Candidate,
  type HourlyState,
  loadState,
  saveState,
  normalizeCandidate,
  PATHS,
} from './hourly-types.js';

// --- Constants ---

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const STOPWORDS = new Set([
  'that', 'this', 'with', 'from', 'have', 'been', 'were', 'they', 'their',
  'about', 'would', 'could', 'should', 'which', 'there', 'where', 'when',
  'what', 'will', 'into', 'also', 'than', 'them', 'then', 'some', 'other',
  'more', 'between', 'including', 'during', 'after', 'before', 'since',
  'under', 'over', 'such', 'each', 'through', 'most', 'same',
]);

const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GDELT_THEMES =
  'theme:TERROR OR theme:MILITARY OR theme:NATURAL_DISASTER OR theme:POLITICAL_VIOLENCE';

/** High-quality general RSS feeds for broad coverage */
const GENERAL_RSS_FEEDS = [
  // ── Tier 1: Major international wire services & broadsheets ──
  'https://feeds.reuters.com/reuters/worldNews',
  'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
  'https://www.theguardian.com/world/rss',
  'https://www.latimes.com/world-nation/rss2.0.xml',
  // ── Tier 1: Aggregators ──
  'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss?hl=es-419&gl=MX&ceid=MX:es-419',
  // ── Tier 2: Regional powerhouses ──
  'https://www.aljazeera.com/xml/rss/all.xml',               // Middle East & Global South
  'https://feeds.bbci.co.uk/news/world/rss.xml',              // UK/Global
  'https://feeds.bbci.co.uk/news/technology/rss.xml',         // Tech
  'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', // Science
  'https://www.bbc.co.uk/mundo/index.xml',                    // LatAm Spanish
  'https://www.france24.com/en/rss',                          // Africa & Francophone
  'https://www.rfi.fr/en/rss',                                // Africa & Francophone
  'https://rss.dw.com/xml/rss-en-world',                      // German perspective, global
  'https://www.middleeasteye.net/rss',                        // MENA region
  'https://www.scmp.com/rss/91/feed',                         // China & East Asia
  'https://www.japantimes.co.jp/feed/',                       // Japan & East Asia
  'https://www.thehindu.com/news/international/feeder/default.rss', // India & South Asia
  // ── Tier 2: Humanitarian & conflict-specific ──
  'https://reliefweb.int/updates/rss.xml',                    // UN humanitarian (Somalia, Sahel, etc.)
  'https://news.un.org/feed/subscribe/en/news/all/rss.xml',   // UN official
  'https://www.thenewhumanitarian.org/rss.xml',               // Crisis journalism
  // ── Tier 2: LatAm & security ──
  'https://elpais.com/rss/elpais/portada.xml',                // Spain & LatAm
  'https://aristeguinoticias.com/feed/',                      // Mexico investigative
  'https://www.insightcrime.org/feed/',                       // Organized crime LatAm
  'https://www.borderreport.com/feed/',                       // US-Mexico border
];

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

// --- Types ---

interface RssItem {
  title: string;
  url: string;
  source: string;
  timestamp: string;
}

interface TrackerInfo {
  slug: string;
  searchContext: string;
  rssFeeds: string[];
}

// --- Public exports ---

/**
 * Extracts 4+ character lowercase words from text, excluding stopwords and
 * pure numeric tokens.
 */
export function extractKeywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[\s\-\/,.:;!?()\[\]{}'"]+/)
    .filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !STOPWORDS.has(w));
  return new Set(words);
}

/**
 * Finds the best matching tracker for a headline based on keyword overlap.
 * Returns the slug of the tracker with the most hits (minimum 2), or null.
 */
export function matchTrackerByKeywords(
  headline: string,
  trackerKeywords: Map<string, Set<string>>,
): string | null {
  const headlineKw = extractKeywords(headline);
  let bestSlug: string | null = null;
  let bestScore = 1; // minimum threshold: must exceed 1 (i.e., >= 2)

  for (const [slug, kwSet] of trackerKeywords) {
    let hits = 0;
    for (const kw of headlineKw) {
      if (kwSet.has(kw)) hits++;
    }
    if (hits > bestScore) {
      bestScore = hits;
      bestSlug = slug;
    }
  }

  return bestSlug;
}

/**
 * Parses RSS 2.0 or Atom XML and returns normalized items.
 */
export function parseRssFeed(xml: string): RssItem[] {
  const parsed = XML_PARSER.parse(xml);
  const items: RssItem[] = [];

  // RSS 2.0 format
  if (parsed.rss?.channel) {
    const channel = parsed.rss.channel;
    const rawItems = Array.isArray(channel.item)
      ? channel.item
      : channel.item
        ? [channel.item]
        : [];

    for (const item of rawItems) {
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const url =
        typeof item.link === 'string'
          ? item.link.trim()
          : typeof item.guid === 'string'
            ? item.guid.trim()
            : '';
      const timestamp =
        typeof item.pubDate === 'string'
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString();
      const source =
        typeof item.source === 'string'
          ? item.source.trim()
          : typeof item['dc:creator'] === 'string'
            ? item['dc:creator'].trim()
            : '';

      if (title && url) {
        items.push({ title, url, source, timestamp });
      }
    }
    return items;
  }

  // Atom format
  if (parsed.feed) {
    const feed = parsed.feed;
    const rawEntries = Array.isArray(feed.entry)
      ? feed.entry
      : feed.entry
        ? [feed.entry]
        : [];

    for (const entry of rawEntries) {
      const title =
        typeof entry.title === 'string'
          ? entry.title.trim()
          : typeof entry.title === 'object' && entry.title?.['#text']
            ? String(entry.title['#text']).trim()
            : '';

      // Atom link can be an object with @_href attribute or a string
      let url = '';
      if (Array.isArray(entry.link)) {
        const altLink = entry.link.find(
          (l: { '@_rel'?: string; '@_href'?: string }) =>
            !l['@_rel'] || l['@_rel'] === 'alternate',
        );
        url = altLink?.['@_href'] ?? entry.link[0]?.['@_href'] ?? '';
      } else if (typeof entry.link === 'object' && entry.link?.['@_href']) {
        url = String(entry.link['@_href']);
      } else if (typeof entry.link === 'string') {
        url = entry.link.trim();
      }

      const timestamp =
        typeof entry.updated === 'string'
          ? new Date(entry.updated).toISOString()
          : typeof entry.published === 'string'
            ? new Date(entry.published).toISOString()
            : new Date().toISOString();

      const source =
        typeof entry.author?.name === 'string' ? entry.author.name.trim() : '';

      if (title && url) {
        items.push({ title, url, source, timestamp });
      }
    }
    return items;
  }

  return items;
}

/**
 * Removes candidates whose URLs are already in the seen set.
 */
export function dedup(candidates: Candidate[], seenUrls: Set<string>): Candidate[] {
  return candidates.filter((c) => !seenUrls.has(c.url));
}

// --- Internal helpers ---

/**
 * Loads all active (non-draft) tracker configs and extracts slug, searchContext,
 * and any rssFeeds.
 */
function loadActiveTrackers(): TrackerInfo[] {
  const trackersDir = PATHS.trackersDir;
  const trackers: TrackerInfo[] = [];

  if (!existsSync(trackersDir)) return trackers;

  const slugs = readdirSync(trackersDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const slug of slugs) {
    const configPath = join(trackersDir, slug, 'tracker.json');
    if (!existsSync(configPath)) continue;
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      if (config.status !== 'active') continue;
      trackers.push({
        slug,
        searchContext: config.ai?.searchContext ?? config.name ?? slug,
        rssFeeds: config.ai?.rssFeeds ?? [],
      });
    } catch {
      // skip malformed configs
    }
  }

  return trackers;
}

/**
 * Builds a keyword set for each tracker from its searchContext.
 */
function buildTrackerKeywordMap(trackers: TrackerInfo[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const t of trackers) {
    map.set(t.slug, extractKeywords(t.searchContext));
  }
  return map;
}

/**
 * Collects source URLs from recent event files for a tracker (for dedup).
 */
function collectEventUrls(slug: string, daysBack: number): Set<string> {
  const urls = new Set<string>();
  const eventsDir = join(PATHS.trackersDir, slug, 'data', 'events');
  if (!existsSync(eventsDir)) return urls;

  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const files = readdirSync(eventsDir)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => {
      const dateStr = f.replace('.json', '');
      return new Date(dateStr) >= cutoff;
    });

  for (const file of files) {
    try {
      const events = JSON.parse(readFileSync(join(eventsDir, file), 'utf8'));
      if (!Array.isArray(events)) continue;
      for (const event of events) {
        if (Array.isArray(event.media)) {
          for (const m of event.media) {
            if (m.url) urls.add(m.url);
          }
        }
        if (Array.isArray(event.sources)) {
          for (const s of event.sources) {
            if (s.url) urls.add(s.url);
          }
        }
      }
    } catch {
      // skip malformed files
    }
  }

  return urls;
}

/**
 * Fetches a GDELT query and returns raw article data.
 */
async function queryGdelt(
  query: string,
  maxRecords: number = 25,
): Promise<RssItem[]> {
  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    maxrecords: String(maxRecords),
    timespan: '120',
    sort: 'DateDesc',
    format: 'json',
  });

  const url = `${GDELT_ENDPOINT}?${params.toString()}`;

  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': 'Watchboard/1.0 hourly-scan' },
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const articles = data?.articles ?? [];
    return articles.map(
      (a: { title?: string; url?: string; domain?: string; seendate?: string }) => ({
        title: a.title ?? '',
        url: a.url ?? '',
        source: a.domain ?? '',
        timestamp: a.seendate
          ? new Date(
              a.seendate.replace(
                /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
                '$1-$2-$3T$4:$5:$6Z',
              ),
            ).toISOString()
          : new Date().toISOString(),
      }),
    );
  } catch {
    return [];
  }
}

/**
 * Resolves a Google News RSS redirect URL to the actual article URL.
 * Returns the original URL if not a Google News URL or on failure.
 */
async function resolveGoogleNewsUrl(url: string): Promise<string> {
  if (!url.startsWith('https://news.google.com/rss/articles/')) return url;
  try {
    const resp = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(5_000),
      headers: { 'User-Agent': 'Watchboard/1.0 hourly-scan' },
    });
    // The final URL after redirects
    if (resp.url && resp.url !== url) return resp.url;
    return url;
  } catch {
    return url;
  }
}

/**
 * Processes an array of items in parallel batches of a given size.
 */
async function processBatched<T, R>(
  items: T[],
  batchSize: number,
  label: string,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const totalBatches = Math.ceil(items.length / batchSize);

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    console.log(`[hourly-scan] ${label}: batch ${batchNum}/${totalBatches} (${batch.length} items)`);
    const settled = await Promise.allSettled(batch.map(fn));
    for (const r of settled) {
      if (r.status === 'fulfilled') results.push(r.value);
    }
  }

  return results;
}

/**
 * Fetches and parses RSS feeds for each tracker, returning raw items with
 * their tracker slug tagged. Processes feeds in parallel batches of 10.
 */
async function fetchRssFeeds(
  feeds: { slug: string; url: string }[],
): Promise<{ item: RssItem; slug: string }[]> {
  const results: { item: RssItem; slug: string }[] = [];
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  await processBatched(feeds, 10, 'Fetching RSS', async ({ slug, url }) => {
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': 'Watchboard/1.0 hourly-scan' },
      });
      if (!resp.ok) return;
      const xml = await resp.text();
      const items = parseRssFeed(xml);
      for (const item of items) {
        // Filter out items older than 2 hours
        if (item.timestamp) {
          const itemDate = new Date(item.timestamp);
          if (!isNaN(itemDate.getTime()) && itemDate < twoHoursAgo) continue;
        }
        results.push({ item, slug });
      }
    } catch {
      // network errors are non-fatal
    }
  });

  // Resolve Google News redirect URLs in batches
  const googleNewsIndices: number[] = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].item.url.startsWith('https://news.google.com/rss/articles/')) {
      googleNewsIndices.push(i);
    }
  }

  if (googleNewsIndices.length > 0) {
    console.log(`[hourly-scan] Resolving ${googleNewsIndices.length} Google News URL(s)...`);
    const resolved = await processBatched(
      googleNewsIndices,
      10,
      'Resolving Google News URLs',
      async (idx) => {
        const resolvedUrl = await resolveGoogleNewsUrl(results[idx].item.url);
        return { idx, resolvedUrl };
      },
    );
    for (const { idx, resolvedUrl } of resolved) {
      results[idx].item.url = resolvedUrl;
    }
  }

  return results;
}

// --- Main orchestrator ---

/**
 * Main scan function: polls RSS feeds and GDELT, deduplicates, and returns
 * candidates with updated state.
 */
export async function scan(): Promise<{ candidates: Candidate[]; state: HourlyState }> {
  const state = loadState();
  const seenUrls = new Set(state.seen.map((e) => e.url));

  const trackers = loadActiveTrackers();
  const trackerKeywordMap = buildTrackerKeywordMap(trackers);

  // Collect URLs from recent events across all trackers (last 7 days)
  for (const t of trackers) {
    const eventUrls = collectEventUrls(t.slug, 7);
    for (const u of eventUrls) seenUrls.add(u);
  }

  const candidates: Candidate[] = [];

  // 1. RSS feeds (per-tracker rssFeeds arrays)
  const rssFeedList: { slug: string; url: string }[] = [];
  for (const t of trackers) {
    for (const feedUrl of t.rssFeeds) {
      rssFeedList.push({ slug: t.slug, url: feedUrl });
    }
  }

  if (rssFeedList.length > 0) {
    const rssResults = await fetchRssFeeds(rssFeedList);
    for (const { item, slug } of rssResults) {
      if (!item.title || !item.url) continue;
      const c = normalizeCandidate(item, slug, 'rss');
      candidates.push(c);
    }
  }

  // 1b. General RSS feeds (broad coverage — matched by keywords)
  const generalFeedList = GENERAL_RSS_FEEDS.map((url) => ({ slug: '__general__', url }));
  if (generalFeedList.length > 0) {
    const generalResults = await fetchRssFeeds(generalFeedList);
    for (const { item } of generalResults) {
      if (!item.title || !item.url) continue;
      const matched = matchTrackerByKeywords(item.title, trackerKeywordMap);
      candidates.push(normalizeCandidate(item, matched, 'rss'));
    }
  }

  // 2. Per-tracker GDELT queries (using searchContext)
  for (const t of trackers) {
    if (!t.searchContext) continue;
    const items = await queryGdelt(t.searchContext, 10);
    for (const item of items) {
      if (!item.title || !item.url) continue;
      candidates.push(normalizeCandidate(item, t.slug, 'gdelt'));
    }
  }

  // 3. GDELT global sweep (catches out-of-scope events)
  const gdeltItems = await queryGdelt(GDELT_THEMES, 50);
  for (const item of gdeltItems) {
    if (!item.title || !item.url) continue;
    const matched = matchTrackerByKeywords(item.title, trackerKeywordMap);
    candidates.push(normalizeCandidate(item, matched, 'gdelt'));
  }

  // 4. Dedup against seen URLs
  const fresh = dedup(candidates, seenUrls);

  // 5. Intra-batch dedup (same URL from multiple sources → keep first)
  const uniqueByUrl = new Map<string, Candidate>();
  for (const c of fresh) {
    if (!uniqueByUrl.has(c.url)) uniqueByUrl.set(c.url, c);
  }
  const dedupedFresh = [...uniqueByUrl.values()];

  // 6. Update state with new URLs
  const newSeen = dedupedFresh.map((c) => ({
    url: c.url,
    tracker: c.matchedTracker ?? 'unknown',
    eventId: '',
    ts: new Date().toISOString(),
  }));

  const updatedState: HourlyState = {
    lastScan: new Date().toISOString(),
    seen: [...state.seen, ...newSeen],
  };

  return { candidates: dedupedFresh, state: updatedState };
}

// --- CLI entry point ---

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  const { candidates, state } = await scan();
  saveState(state);
  if (candidates.length === 0) {
    console.log('[hourly-scan] No new candidates. Exiting.');
  } else {
    writeFileSync('/tmp/hourly-candidates.json', JSON.stringify(candidates, null, 2), 'utf8');
    console.log(`[hourly-scan] ${candidates.length} candidate(s) written to /tmp/hourly-candidates.json`);
  }
}
