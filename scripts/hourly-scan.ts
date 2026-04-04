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
      if (config.status === 'draft') continue;
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
 * Fetches and parses RSS feeds for each tracker, returning raw items with
 * their tracker slug tagged.
 */
async function fetchRssFeeds(
  feeds: { slug: string; url: string }[],
): Promise<{ item: RssItem; slug: string }[]> {
  const results: { item: RssItem; slug: string }[] = [];

  await Promise.allSettled(
    feeds.map(async ({ slug, url }) => {
      try {
        const resp = await fetch(url, {
          signal: AbortSignal.timeout(10_000),
          headers: { 'User-Agent': 'Watchboard/1.0 hourly-scan' },
        });
        if (!resp.ok) return;
        const xml = await resp.text();
        const items = parseRssFeed(xml);
        for (const item of items) {
          results.push({ item, slug });
        }
      } catch {
        // network errors are non-fatal
      }
    }),
  );

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

  // 2. GDELT global sweep
  const gdeltItems = await queryGdelt(GDELT_THEMES, 50);
  for (const item of gdeltItems) {
    if (!item.title || !item.url) continue;
    const matched = matchTrackerByKeywords(item.title, trackerKeywordMap);
    const c = normalizeCandidate(item, matched, 'gdelt');
    candidates.push(c);
  }

  // 3. Dedup
  const fresh = dedup(candidates, seenUrls);

  // 4. Update state with new URLs (use a placeholder tracker for unseen)
  const newSeen = fresh.map((c) => ({
    url: c.url,
    tracker: c.matchedTracker ?? 'unknown',
    eventId: '',
    ts: new Date().toISOString(),
  }));

  const updatedState: HourlyState = {
    lastScan: new Date().toISOString(),
    seen: [...state.seen, ...newSeen],
  };

  return { candidates: fresh, state: updatedState };
}

// --- CLI entry point ---

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  const { candidates, state } = await scan();
  writeFileSync('/tmp/hourly-candidates.json', JSON.stringify(candidates, null, 2), 'utf8');
  saveState(state);
  console.log(`Scan complete: ${candidates.length} fresh candidates written to /tmp/hourly-candidates.json`);
}
