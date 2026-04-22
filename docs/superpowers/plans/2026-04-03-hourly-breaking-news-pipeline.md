# Hourly Breaking News Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an hourly workflow that detects breaking news via RSS/GDELT, triages with AI, updates tracker data, posts to X immediately, and auto-creates new trackers for out-of-scope events.

**Architecture:** Two-job GitHub Actions workflow. Job 1 (Scan) does deterministic RSS/GDELT polling + URL dedup + 1-2 turn Claude Sonnet triage. Job 2 (Act) is a matrix job that runs per affected tracker: Claude Code action updates data (10-15 turns), validates, posts to X, and writes to an hourly manifest that the nightly pipeline reads for dedup.

**Tech Stack:** TypeScript scripts (tsx), fast-xml-parser (RSS), GDELT v2 API (fetch), twitter-api-v2 (X posting), Zod (validation), Claude Sonnet (triage), Claude Code action (data updates), GitHub Actions

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `scripts/hourly-types.ts` | Types, paths, state I/O utilities for the hourly pipeline |
| `scripts/hourly-scan.ts` | RSS feed parsing + GDELT API polling + URL dedup + candidate output |
| `scripts/hourly-triage.ts` | Builds AI triage prompt, calls Claude Sonnet, parses response, assembles action plan |
| `scripts/hourly-post.ts` | Direct X posting for breaking news (reuses twitter-api-v2 pattern from post-social-queue.ts) |
| `public/_hourly/state.json` | Rolling URL/headline cache (48h) — bootstrapped empty |
| `public/_hourly/today-updates.json` | Daily manifest for nightly dedup — bootstrapped empty |
| `.github/workflows/hourly-scan.yml` | Two-job workflow: Scan + Act |
| `tests/hourly-scan.test.ts` | Tests for polling, URL dedup, keyword matching |
| `tests/hourly-triage.test.ts` | Tests for prompt building, response parsing, action plan assembly |
| `tests/hourly-types.test.ts` | Tests for state I/O, manifest operations, date rollover |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/tracker-config.ts:65-78` | Add `rssFeeds` to AiConfigSchema |
| `.github/workflows/update-data.yml` | Resolve phase reads hourly manifest; update phase injects hourly event IDs |
| `social-config.json` | Add `hourly` cost category |

---

### Task 1: Add `rssFeeds` to Tracker Config Schema

**Files:**
- Modify: `src/lib/tracker-config.ts:65-78`

- [ ] **Step 1: Add rssFeeds field to AiConfigSchema**

In `src/lib/tracker-config.ts`, the `AiConfigSchema` at line 65 currently ends with `backfillTargets`. Add `rssFeeds`:

```typescript
const AiConfigSchema = z.object({
  systemPrompt: z.string(),
  searchContext: z.string(),
  enabledSections: z.array(z.string()),
  coordValidation: z.object({
    lonMin: z.number(),
    lonMax: z.number(),
    latMin: z.number(),
    latMax: z.number(),
  }).optional(),
  updateIntervalDays: z.number().int().positive().default(1),
  updatePolicy: UpdatePolicySchema.optional(),
  backfillTargets: z.record(z.string(), z.number().int().positive()).optional(),
  rssFeeds: z.array(z.string().url()).optional(),
});
```

- [ ] **Step 2: Verify build still passes**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds (optional field, no existing tracker.json breaks)

- [ ] **Step 3: Commit**

```bash
git add src/lib/tracker-config.ts
git commit -m "feat(config): add optional rssFeeds to AiConfigSchema"
```

---

### Task 2: Create Hourly Types Module

**Files:**
- Create: `scripts/hourly-types.ts`
- Create: `tests/hourly-types.test.ts`

- [ ] **Step 1: Write tests for state I/O and manifest operations**

Create `tests/hourly-types.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

// We'll test against a temp directory
const TMP = join(__dirname, '__hourly_test_tmp__');

describe('hourly-types', () => {
  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });
  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  describe('loadState', () => {
    it('returns empty state when file does not exist', async () => {
      const { loadState } = await import('../scripts/hourly-types.js');
      const state = loadState(join(TMP, 'state.json'));
      expect(state.seen).toEqual([]);
      expect(state.lastScan).toBe('');
    });

    it('loads existing state and prunes entries older than 48h', async () => {
      const { loadState } = await import('../scripts/hourly-types.js');
      const now = new Date();
      const old = new Date(now.getTime() - 49 * 60 * 60 * 1000).toISOString();
      const recent = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();
      writeFileSync(join(TMP, 'state.json'), JSON.stringify({
        lastScan: old,
        seen: [
          { url: 'https://old.com', tracker: 'a', eventId: 'e1', ts: old },
          { url: 'https://new.com', tracker: 'b', eventId: 'e2', ts: recent },
        ],
      }));
      const state = loadState(join(TMP, 'state.json'));
      expect(state.seen).toHaveLength(1);
      expect(state.seen[0].url).toBe('https://new.com');
    });
  });

  describe('loadManifest', () => {
    it('returns empty manifest when file does not exist', async () => {
      const { loadManifest } = await import('../scripts/hourly-types.js');
      const manifest = loadManifest(join(TMP, 'today-updates.json'));
      expect(manifest.updates).toEqual([]);
    });

    it('archives old manifest and returns fresh one on date rollover', async () => {
      const { loadManifest } = await import('../scripts/hourly-types.js');
      mkdirSync(join(TMP, 'archive'), { recursive: true });
      writeFileSync(join(TMP, 'today-updates.json'), JSON.stringify({
        date: '2026-04-02',
        updates: [{ tracker: 'test', action: 'update' }],
      }));
      const manifest = loadManifest(join(TMP, 'today-updates.json'), join(TMP, 'archive'));
      expect(manifest.date).toBe(new Date().toISOString().slice(0, 10));
      expect(manifest.updates).toEqual([]);
      expect(existsSync(join(TMP, 'archive', '2026-04-02.json'))).toBe(true);
    });
  });

  describe('Candidate normalization', () => {
    it('normalizes RSS and GDELT candidates to common shape', async () => {
      const { normalizeCandidate } = await import('../scripts/hourly-types.js');
      const c = normalizeCandidate({
        title: 'Breaking: Test Event',
        url: 'https://reuters.com/article',
        source: 'Reuters',
        timestamp: '2026-04-03T15:00:00Z',
      }, 'iran-conflict', 'rss');
      expect(c.matchedTracker).toBe('iran-conflict');
      expect(c.feedOrigin).toBe('rss');
      expect(c.title).toBe('Breaking: Test Event');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/hourly-types.test.ts 2>&1 | tail -20`
Expected: FAIL — module not found

- [ ] **Step 3: Implement hourly-types.ts**

Create `scripts/hourly-types.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';

// --- Types ---

export interface SeenEntry {
  url: string;
  tracker: string;
  eventId: string;
  ts: string;
}

export interface HourlyState {
  lastScan: string;
  seen: SeenEntry[];
}

export interface ManifestUpdate {
  tracker: string;
  action: 'update' | 'new_tracker';
  eventIds: string[];
  sections: string[];
  tweetId: string | null;
  timestamp: string;
  seeded?: boolean;
}

export interface HourlyManifest {
  date: string;
  updates: ManifestUpdate[];
}

export interface Candidate {
  title: string;
  url: string;
  source: string;
  timestamp: string;
  matchedTracker: string | null;
  feedOrigin: 'rss' | 'gdelt';
}

export interface TriageResult {
  index: number;
  action: 'update' | 'new_tracker' | 'discard';
  tracker: string | null;
  confidence: number;
  summary: string;
  reason: string;
  suggestedSlug?: string;
  suggestedDomain?: string;
  suggestedRegion?: string;
  suggestedName?: string;
}

export interface ActionPlan {
  updates: ActionPlanUpdate[];
  newTrackers: ActionPlanNewTracker[];
  scannedAt: string;
  candidateCount: number;
  discardedCount: number;
}

export interface ActionPlanUpdate {
  tracker: string;
  events: { summary: string; sources: string[]; timestamp: string }[];
}

export interface ActionPlanNewTracker {
  suggestedSlug: string;
  suggestedDomain: string;
  suggestedRegion: string;
  suggestedName: string;
  triggerEvent: { summary: string; sources: string[]; timestamp: string };
}

// --- Paths ---

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..');
export const PATHS = {
  hourlyDir: join(ROOT, 'public', '_hourly'),
  state: join(ROOT, 'public', '_hourly', 'state.json'),
  manifest: join(ROOT, 'public', '_hourly', 'today-updates.json'),
  archiveDir: join(ROOT, 'public', '_hourly', 'archive'),
  trackersDir: join(ROOT, 'trackers'),
  socialBudget: join(ROOT, 'public', '_social', 'budget.json'),
  socialHistory: join(ROOT, 'public', '_social', 'history.json'),
};

// --- State I/O ---

const PRUNE_HOURS = 48;

export function loadState(path: string = PATHS.state): HourlyState {
  if (!existsSync(path)) {
    return { lastScan: '', seen: [] };
  }
  try {
    const raw: HourlyState = JSON.parse(readFileSync(path, 'utf8'));
    const cutoff = new Date(Date.now() - PRUNE_HOURS * 60 * 60 * 1000).toISOString();
    raw.seen = raw.seen.filter(e => e.ts > cutoff);
    return raw;
  } catch {
    return { lastScan: '', seen: [] };
  }
}

export function saveState(state: HourlyState, path: string = PATHS.state): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), 'utf8');
}

// --- Manifest I/O ---

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function loadManifest(
  path: string = PATHS.manifest,
  archiveDir: string = PATHS.archiveDir,
): HourlyManifest {
  const today = todayDate();
  if (!existsSync(path)) {
    return { date: today, updates: [] };
  }
  try {
    const raw: HourlyManifest = JSON.parse(readFileSync(path, 'utf8'));
    if (raw.date !== today) {
      // Archive yesterday's manifest
      mkdirSync(archiveDir, { recursive: true });
      renameSync(path, join(archiveDir, `${raw.date}.json`));
      return { date: today, updates: [] };
    }
    return raw;
  } catch {
    return { date: today, updates: [] };
  }
}

export function saveManifest(manifest: HourlyManifest, path: string = PATHS.manifest): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 2), 'utf8');
}

// --- Candidate Normalization ---

export function normalizeCandidate(
  raw: { title: string; url: string; source: string; timestamp: string },
  matchedTracker: string | null,
  feedOrigin: 'rss' | 'gdelt',
): Candidate {
  return {
    title: raw.title,
    url: raw.url,
    source: raw.source,
    timestamp: raw.timestamp,
    matchedTracker,
    feedOrigin,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/hourly-types.test.ts 2>&1 | tail -30`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/hourly-types.ts tests/hourly-types.test.ts
git commit -m "feat(hourly): add types, state I/O, and manifest utilities"
```

---

### Task 3: Create RSS/GDELT Polling Script

**Files:**
- Create: `scripts/hourly-scan.ts`
- Create: `tests/hourly-scan.test.ts`

- [ ] **Step 1: Write tests for keyword matching and URL dedup**

Create `tests/hourly-scan.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('hourly-scan', () => {
  describe('extractKeywords', () => {
    it('extracts 4+ char words, lowercased, without stopwords', async () => {
      const { extractKeywords } = await import('../scripts/hourly-scan.js');
      const kw = extractKeywords('Iran-US/Israel conflict 2024 military strikes');
      expect(kw).toContain('iran');
      expect(kw).toContain('israel');
      expect(kw).toContain('conflict');
      expect(kw).toContain('military');
      expect(kw).toContain('strikes');
      expect(kw).not.toContain('2024'); // only digits
    });
  });

  describe('matchTrackerByKeywords', () => {
    it('returns tracker slug when >= 2 keyword hits', async () => {
      const { matchTrackerByKeywords } = await import('../scripts/hourly-scan.js');
      const trackerKeywords = new Map([
        ['iran-conflict', new Set(['iran', 'israel', 'conflict', 'military', 'strikes'])],
        ['gaza-war', new Set(['gaza', 'hamas', 'israel', 'ceasefire'])],
      ]);
      const result = matchTrackerByKeywords('Iran military operation near Israel border', trackerKeywords);
      expect(result).toBe('iran-conflict');
    });

    it('returns null when no tracker matches >= 2 keywords', async () => {
      const { matchTrackerByKeywords } = await import('../scripts/hourly-scan.js');
      const trackerKeywords = new Map([
        ['iran-conflict', new Set(['iran', 'israel', 'conflict'])],
      ]);
      const result = matchTrackerByKeywords('SpaceX launches Starship rocket', trackerKeywords);
      expect(result).toBeNull();
    });
  });

  describe('dedup', () => {
    it('removes candidates with URLs already in state', async () => {
      const { dedup } = await import('../scripts/hourly-scan.js');
      const candidates = [
        { title: 'A', url: 'https://a.com', source: 'A', timestamp: '', matchedTracker: 'x', feedOrigin: 'rss' as const },
        { title: 'B', url: 'https://b.com', source: 'B', timestamp: '', matchedTracker: 'x', feedOrigin: 'rss' as const },
      ];
      const seenUrls = new Set(['https://a.com']);
      const result = dedup(candidates, seenUrls);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('B');
    });
  });

  describe('parseRssFeed', () => {
    it('extracts items from RSS XML', async () => {
      const { parseRssFeed } = await import('../scripts/hourly-scan.js');
      const xml = `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <item>
              <title>Test Article</title>
              <link>https://example.com/article</link>
              <pubDate>Thu, 03 Apr 2026 15:00:00 GMT</pubDate>
              <source>Reuters</source>
            </item>
          </channel>
        </rss>`;
      const items = parseRssFeed(xml);
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Test Article');
      expect(items[0].url).toBe('https://example.com/article');
    });

    it('handles Atom feeds', async () => {
      const { parseRssFeed } = await import('../scripts/hourly-scan.js');
      const xml = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Atom Article</title>
            <link href="https://example.com/atom"/>
            <updated>2026-04-03T15:00:00Z</updated>
          </entry>
        </feed>`;
      const items = parseRssFeed(xml);
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Atom Article');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/hourly-scan.test.ts 2>&1 | tail -20`
Expected: FAIL — module not found

- [ ] **Step 3: Implement hourly-scan.ts**

Create `scripts/hourly-scan.ts`:

```typescript
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { loadState, saveState, normalizeCandidate, PATHS } from './hourly-types.js';
import type { Candidate, HourlyState } from './hourly-types.js';

// --- Stopwords (same set as generate-sibling-brief.ts) ---

const STOP_WORDS = new Set([
  'that', 'this', 'with', 'from', 'have', 'been', 'were', 'they',
  'their', 'about', 'would', 'could', 'should', 'which', 'there',
  'where', 'when', 'what', 'will', 'into', 'also', 'than', 'them',
  'then', 'some', 'other', 'more', 'between', 'including', 'during',
  'after', 'before', 'since', 'under', 'over', 'such', 'each',
  'through', 'most', 'same',
]);

// --- Keyword Extraction ---

export function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
  );
}

// --- Tracker Keyword Matching ---

export function matchTrackerByKeywords(
  headline: string,
  trackerKeywords: Map<string, Set<string>>,
): string | null {
  const words = extractKeywords(headline);
  let bestSlug: string | null = null;
  let bestCount = 0;
  for (const [slug, kws] of trackerKeywords) {
    let count = 0;
    for (const w of words) {
      if (kws.has(w)) count++;
    }
    if (count >= 2 && count > bestCount) {
      bestSlug = slug;
      bestCount = count;
    }
  }
  return bestSlug;
}

// --- RSS Feed Parsing ---

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

interface RssItem {
  title: string;
  url: string;
  source: string;
  timestamp: string;
}

export function parseRssFeed(xml: string): RssItem[] {
  const parsed = xmlParser.parse(xml);
  const items: RssItem[] = [];

  // RSS 2.0
  const rssItems = parsed?.rss?.channel?.item;
  if (rssItems) {
    const arr = Array.isArray(rssItems) ? rssItems : [rssItems];
    for (const item of arr) {
      items.push({
        title: item.title || '',
        url: item.link || '',
        source: item.source || item['dc:creator'] || '',
        timestamp: item.pubDate || item['dc:date'] || '',
      });
    }
    return items;
  }

  // Atom
  const atomEntries = parsed?.feed?.entry;
  if (atomEntries) {
    const arr = Array.isArray(atomEntries) ? atomEntries : [atomEntries];
    for (const entry of arr) {
      items.push({
        title: entry.title || '',
        url: entry.link?.['@_href'] || entry.link || '',
        source: entry.author?.name || '',
        timestamp: entry.updated || entry.published || '',
      });
    }
  }
  return items;
}

// --- URL Dedup ---

export function dedup(candidates: Candidate[], seenUrls: Set<string>): Candidate[] {
  return candidates.filter(c => !seenUrls.has(c.url));
}

// --- Collect Seen URLs from Tracker Events ---

function collectEventUrls(slug: string, daysBack: number = 3): Set<string> {
  const urls = new Set<string>();
  const eventsDir = join(PATHS.trackersDir, slug, 'data', 'events');
  if (!existsSync(eventsDir)) return urls;

  const now = new Date();
  const files = readdirSync(eventsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const dateStr = file.replace('.json', '');
    const fileDate = new Date(dateStr);
    const daysDiff = (now.getTime() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > daysBack) continue;
    try {
      const events = JSON.parse(readFileSync(join(eventsDir, file), 'utf8'));
      for (const event of Array.isArray(events) ? events : []) {
        for (const src of event.sources || []) {
          if (src.url) urls.add(src.url);
        }
      }
    } catch { /* skip unparseable */ }
  }
  return urls;
}

// --- GDELT API ---

const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GDELT_THEMES = 'theme:TERROR OR theme:MILITARY OR theme:NATURAL_DISASTER OR theme:POLITICAL_VIOLENCE';

async function queryGdelt(query: string, maxRecords: number = 50): Promise<RssItem[]> {
  const params = new URLSearchParams({
    query: query,
    mode: 'ArtList',
    maxrecords: String(maxRecords),
    timespan: '120',
    format: 'json',
    sort: 'ToneDesc',
  });
  try {
    const res = await fetch(`${GDELT_ENDPOINT}?${params}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const data = await res.json() as { articles?: { title: string; url: string; source: string; seendate: string }[] };
    return (data.articles || []).map(a => ({
      title: a.title || '',
      url: a.url || '',
      source: a.source || '',
      timestamp: a.seendate || '',
    }));
  } catch {
    console.warn('[hourly-scan] GDELT query failed for:', query);
    return [];
  }
}

// --- Load Tracker Configs ---

interface TrackerInfo {
  slug: string;
  searchContext: string;
  rssFeeds: string[];
  keywords: Set<string>;
}

function loadActiveTrackers(): TrackerInfo[] {
  const trackers: TrackerInfo[] = [];
  const dirs = readdirSync(PATHS.trackersDir);
  for (const slug of dirs) {
    const configPath = join(PATHS.trackersDir, slug, 'tracker.json');
    if (!existsSync(configPath)) continue;
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      if (config.status !== 'active') continue;
      const searchContext = config.ai?.searchContext || '';
      trackers.push({
        slug,
        searchContext,
        rssFeeds: config.ai?.rssFeeds || [],
        keywords: extractKeywords(searchContext),
      });
    } catch { /* skip */ }
  }
  return trackers;
}

// --- Fetch RSS Feeds ---

async function fetchRssFeeds(feeds: string[]): Promise<RssItem[]> {
  const items: RssItem[] = [];
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  for (const feedUrl of feeds) {
    try {
      const res = await fetch(feedUrl, { signal: AbortSignal.timeout(5_000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const parsed = parseRssFeed(xml);
      for (const item of parsed) {
        if (item.timestamp && new Date(item.timestamp) < twoHoursAgo) continue;
        items.push(item);
      }
    } catch {
      console.warn(`[hourly-scan] RSS feed failed: ${feedUrl}`);
    }
  }
  return items;
}

// --- Main ---

export async function scan(): Promise<{ candidates: Candidate[]; state: HourlyState }> {
  const state = loadState();
  const seenUrls = new Set(state.seen.map(s => s.url));
  const trackers = loadActiveTrackers();
  const trackerKeywords = new Map(trackers.map(t => [t.slug, t.keywords]));
  const allCandidates: Candidate[] = [];

  // Per-tracker: RSS feeds
  for (const tracker of trackers) {
    if (tracker.rssFeeds.length === 0) continue;
    const items = await fetchRssFeeds(tracker.rssFeeds);
    for (const item of items) {
      allCandidates.push(normalizeCandidate(item, tracker.slug, 'rss'));
    }
  }

  // Per-tracker: GDELT by searchContext
  for (const tracker of trackers) {
    if (!tracker.searchContext) continue;
    const items = await queryGdelt(tracker.searchContext, 10);
    for (const item of items) {
      allCandidates.push(normalizeCandidate(item, tracker.slug, 'gdelt'));
    }
  }

  // Global: GDELT sweep for out-of-scope events
  const globalItems = await queryGdelt(GDELT_THEMES, 50);
  for (const item of globalItems) {
    const matched = matchTrackerByKeywords(item.title, trackerKeywords);
    allCandidates.push(normalizeCandidate(item, matched, 'gdelt'));
  }

  // Collect event URLs from tracker data for deeper dedup
  for (const tracker of trackers) {
    const urls = collectEventUrls(tracker.slug);
    for (const url of urls) seenUrls.add(url);
  }

  // Dedup
  const fresh = dedup(allCandidates, seenUrls);

  // Deduplicate by URL within the batch (keep first seen)
  const uniqueByUrl = new Map<string, Candidate>();
  for (const c of fresh) {
    if (!uniqueByUrl.has(c.url)) uniqueByUrl.set(c.url, c);
  }

  const candidates = [...uniqueByUrl.values()];
  state.lastScan = new Date().toISOString();
  return { candidates, state };
}

// --- CLI Entry ---

if (process.argv[1]?.endsWith('hourly-scan.ts') || process.argv[1]?.endsWith('hourly-scan.js')) {
  scan().then(({ candidates, state }) => {
    if (candidates.length === 0) {
      console.log('[hourly-scan] No new candidates. Exiting.');
      saveState(state);
      process.exit(0);
    }
    console.log(`[hourly-scan] ${candidates.length} candidate(s) found.`);
    // Write candidates for triage step (writeFileSync already imported at top)
    writeFileSync('/tmp/hourly-candidates.json', JSON.stringify(candidates, null, 2));
    saveState(state);
  }).catch(err => {
    console.error('[hourly-scan] Fatal error:', err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/hourly-scan.test.ts 2>&1 | tail -30`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/hourly-scan.ts tests/hourly-scan.test.ts
git commit -m "feat(hourly): add RSS/GDELT polling with keyword matching and URL dedup"
```

---

### Task 4: Create AI Triage Script

**Files:**
- Create: `scripts/hourly-triage.ts`
- Create: `tests/hourly-triage.test.ts`

- [ ] **Step 1: Write tests for prompt building and response parsing**

Create `tests/hourly-triage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('hourly-triage', () => {
  describe('buildTriagePrompt', () => {
    it('includes tracker context and candidates', async () => {
      const { buildTriagePrompt } = await import('../scripts/hourly-triage.js');
      const prompt = buildTriagePrompt(
        [{ title: 'Iran strikes', url: 'https://a.com', source: 'Reuters', timestamp: '2026-04-03T15:00:00Z', matchedTracker: 'iran-conflict', feedOrigin: 'gdelt' as const }],
        new Map([['iran-conflict', ['IAEA inspection report', 'US deploys carrier']]]),
      );
      expect(prompt).toContain('iran-conflict');
      expect(prompt).toContain('Iran strikes');
      expect(prompt).toContain('IAEA inspection report');
    });
  });

  describe('parseTriageResponse', () => {
    it('parses valid JSON response', async () => {
      const { parseTriageResponse } = await import('../scripts/hourly-triage.js');
      const json = JSON.stringify({
        candidates: [
          { index: 0, action: 'update', tracker: 'iran-conflict', confidence: 0.9, summary: 'New strike', reason: 'Matches' },
          { index: 1, action: 'discard', tracker: null, confidence: 0.3, summary: 'Old news', reason: 'Dupe' },
        ],
      });
      const results = parseTriageResponse(json);
      expect(results).toHaveLength(2);
      expect(results[0].action).toBe('update');
      expect(results[1].action).toBe('discard');
    });

    it('extracts JSON from code fences', async () => {
      const { parseTriageResponse } = await import('../scripts/hourly-triage.js');
      const response = '```json\n{"candidates":[{"index":0,"action":"discard","tracker":null,"confidence":0.2,"summary":"x","reason":"y"}]}\n```';
      const results = parseTriageResponse(response);
      expect(results).toHaveLength(1);
    });

    it('returns empty array on unparseable response', async () => {
      const { parseTriageResponse } = await import('../scripts/hourly-triage.js');
      const results = parseTriageResponse('not json at all');
      expect(results).toEqual([]);
    });
  });

  describe('buildActionPlan', () => {
    it('groups updates by tracker and filters by confidence', async () => {
      const { buildActionPlan } = await import('../scripts/hourly-triage.js');
      const candidates = [
        { title: 'A', url: 'https://a.com', source: 'Reuters', timestamp: 'T1', matchedTracker: 'iran-conflict', feedOrigin: 'gdelt' as const },
        { title: 'B', url: 'https://b.com', source: 'AP', timestamp: 'T2', matchedTracker: 'iran-conflict', feedOrigin: 'gdelt' as const },
        { title: 'C', url: 'https://c.com', source: 'BBC', timestamp: 'T3', matchedTracker: null, feedOrigin: 'gdelt' as const },
      ];
      const triageResults = [
        { index: 0, action: 'update' as const, tracker: 'iran-conflict', confidence: 0.9, summary: 'Event A', reason: '' },
        { index: 1, action: 'update' as const, tracker: 'iran-conflict', confidence: 0.4, summary: 'Event B', reason: '' },
        { index: 2, action: 'new_tracker' as const, tracker: null, confidence: 0.85, summary: 'Event C', reason: '',
          suggestedSlug: 'new-thing', suggestedDomain: 'disaster', suggestedRegion: 'europe', suggestedName: 'New Thing' },
      ];
      const plan = buildActionPlan(candidates, triageResults);
      // Event B filtered out (confidence 0.4 < 0.6)
      expect(plan.updates).toHaveLength(1);
      expect(plan.updates[0].tracker).toBe('iran-conflict');
      expect(plan.updates[0].events).toHaveLength(1);
      // New tracker passes (0.85 >= 0.8)
      expect(plan.newTrackers).toHaveLength(1);
      expect(plan.newTrackers[0].suggestedSlug).toBe('new-thing');
      expect(plan.discardedCount).toBe(1);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/hourly-triage.test.ts 2>&1 | tail -20`
Expected: FAIL — module not found

- [ ] **Step 3: Implement hourly-triage.ts**

Create `scripts/hourly-triage.ts`:

```typescript
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { PATHS } from './hourly-types.js';
import type { Candidate, TriageResult, ActionPlan, ActionPlanUpdate, ActionPlanNewTracker } from './hourly-types.js';

// --- Build Triage Prompt ---

export function buildTriagePrompt(
  candidates: Candidate[],
  trackerRecentEvents: Map<string, string[]>,
): string {
  let prompt = `You are a breaking news triage analyst for Watchboard, a multi-topic intelligence dashboard.
Given candidate headlines and existing tracker context, classify each candidate.

EXISTING TRACKERS (last 48h event titles):\n`;

  for (const [slug, events] of trackerRecentEvents) {
    prompt += `- ${slug}: ${JSON.stringify(events.slice(0, 10))}\n`;
  }

  prompt += `\nCANDIDATES:\n`;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    prompt += `${i}. title: "${c.title}" | url: ${c.url} | source: ${c.source} | time: ${c.timestamp} | matchedTracker: ${c.matchedTracker || 'none'}\n`;
  }

  prompt += `
For each candidate, return a JSON object. Rules:
- "update": headline is a genuinely NEW development for an existing tracker. Not a rehash of old news.
- "new_tracker": headline describes a major event (conflict, disaster, crisis) NOT covered by any existing tracker. Must be significant enough to warrant its own dashboard.
- "discard": duplicate of existing event, minor update, opinion piece, or not significant enough.

Return ONLY valid JSON (no markdown fences):
{"candidates":[
  {"index":0,"action":"update","tracker":"slug","confidence":0.9,"summary":"one sentence","reason":"why"},
  {"index":1,"action":"new_tracker","tracker":null,"confidence":0.85,"summary":"one sentence","reason":"why",
   "suggestedSlug":"kebab-case","suggestedDomain":"conflict|security|disaster|...","suggestedRegion":"middle-east|europe|...","suggestedName":"Human Readable Name"},
  {"index":2,"action":"discard","tracker":null,"confidence":0.8,"summary":"","reason":"duplicate of existing event"}
]}`;

  return prompt;
}

// --- Parse Triage Response ---

export function parseTriageResponse(response: string): TriageResult[] {
  // Try direct parse
  try {
    const parsed = JSON.parse(response);
    return parsed.candidates || [];
  } catch { /* try code fence extraction */ }

  // Extract from code fences
  const fenceMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1]);
      return parsed.candidates || [];
    } catch { /* fall through */ }
  }

  // Try finding JSON object by braces
  const braceStart = response.indexOf('{');
  const braceEnd = response.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    try {
      const parsed = JSON.parse(response.slice(braceStart, braceEnd + 1));
      return parsed.candidates || [];
    } catch { /* give up */ }
  }

  console.warn('[hourly-triage] Could not parse triage response');
  return [];
}

// --- Build Action Plan ---

const UPDATE_CONFIDENCE_THRESHOLD = 0.6;
const NEW_TRACKER_CONFIDENCE_THRESHOLD = 0.8;

export function buildActionPlan(
  candidates: Candidate[],
  triageResults: TriageResult[],
): ActionPlan {
  const updates = new Map<string, ActionPlanUpdate>();
  const newTrackers: ActionPlanNewTracker[] = [];
  let discardedCount = 0;

  for (const result of triageResults) {
    const candidate = candidates[result.index];
    if (!candidate) continue;

    if (result.action === 'update' && result.tracker && result.confidence >= UPDATE_CONFIDENCE_THRESHOLD) {
      if (!updates.has(result.tracker)) {
        updates.set(result.tracker, { tracker: result.tracker, events: [] });
      }
      updates.get(result.tracker)!.events.push({
        summary: result.summary,
        sources: [candidate.url],
        timestamp: candidate.timestamp,
      });
    } else if (result.action === 'new_tracker' && result.confidence >= NEW_TRACKER_CONFIDENCE_THRESHOLD) {
      newTrackers.push({
        suggestedSlug: result.suggestedSlug || 'unknown',
        suggestedDomain: result.suggestedDomain || 'conflict',
        suggestedRegion: result.suggestedRegion || 'global',
        suggestedName: result.suggestedName || candidate.title,
        triggerEvent: {
          summary: result.summary,
          sources: [candidate.url],
          timestamp: candidate.timestamp,
        },
      });
    } else {
      discardedCount++;
    }
  }

  return {
    updates: [...updates.values()],
    newTrackers,
    scannedAt: new Date().toISOString(),
    candidateCount: candidates.length,
    discardedCount,
  };
}

// --- Collect Recent Event Titles ---

export function collectRecentEventTitles(daysBack: number = 2): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const dirs = readdirSync(PATHS.trackersDir);
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  for (const slug of dirs) {
    const eventsDir = join(PATHS.trackersDir, slug, 'data', 'events');
    if (!existsSync(eventsDir)) continue;
    const titles: string[] = [];
    const files = readdirSync(eventsDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const dateStr = file.replace('.json', '');
      if (new Date(dateStr) < cutoff) continue;
      try {
        const events = JSON.parse(readFileSync(join(eventsDir, file), 'utf8'));
        for (const event of Array.isArray(events) ? events : []) {
          if (event.title) titles.push(event.title);
        }
      } catch { /* skip */ }
    }
    if (titles.length > 0) result.set(slug, titles);
  }
  return result;
}

// --- Call Claude Sonnet ---

async function callTriage(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${text}`);
  }
  const data = await res.json() as { content: { type: string; text: string }[] };
  return data.content[0]?.text || '';
}

// --- CLI Entry ---

export async function triage(candidatesPath: string): Promise<ActionPlan | null> {
  const candidates: Candidate[] = JSON.parse(readFileSync(candidatesPath, 'utf8'));
  if (candidates.length === 0) return null;

  const recentEvents = collectRecentEventTitles();
  const prompt = buildTriagePrompt(candidates, recentEvents);
  console.log(`[hourly-triage] Sending ${candidates.length} candidate(s) to triage...`);

  const response = await callTriage(prompt);
  const results = parseTriageResponse(response);
  const plan = buildActionPlan(candidates, results);

  console.log(`[hourly-triage] Plan: ${plan.updates.length} update(s), ${plan.newTrackers.length} new tracker(s), ${plan.discardedCount} discarded`);
  return plan;
}

if (process.argv[1]?.endsWith('hourly-triage.ts') || process.argv[1]?.endsWith('hourly-triage.js')) {
  const candidatesPath = process.argv[2] || '/tmp/hourly-candidates.json';
  triage(candidatesPath).then(plan => {
    if (!plan || (plan.updates.length === 0 && plan.newTrackers.length === 0)) {
      console.log('[hourly-triage] No actions needed. Exiting.');
      process.exit(0);
    }
    writeFileSync('/tmp/hourly-action-plan.json', JSON.stringify(plan, null, 2));
    console.log('[hourly-triage] Action plan written to /tmp/hourly-action-plan.json');
  }).catch(err => {
    console.error('[hourly-triage] Fatal error:', err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/hourly-triage.test.ts 2>&1 | tail -30`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/hourly-triage.ts tests/hourly-triage.test.ts
git commit -m "feat(hourly): add AI triage prompt builder and action plan assembly"
```

---

### Task 5: Create Direct X Posting Script

**Files:**
- Create: `scripts/hourly-post.ts`

- [ ] **Step 1: Implement hourly-post.ts**

Create `scripts/hourly-post.ts` (reuses pattern from `scripts/post-social-queue.ts:17-61`):

```typescript
import { TwitterApi } from 'twitter-api-v2';
import { readFileSync, writeFileSync } from 'fs';
import { loadManifest, saveManifest, PATHS } from './hourly-types.js';
import type { ManifestUpdate } from './hourly-types.js';

// --- Twitter Client (same pattern as post-social-queue.ts) ---

function getTwitterClient(): TwitterApi | null {
  const appKey = process.env.X_API_KEY;
  const appSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    console.log('[hourly-post] Missing X API credentials — skipping');
    return null;
  }
  return new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
}

async function postTweet(client: TwitterApi, text: string): Promise<string | null> {
  try {
    const result = await client.v2.tweet({ text });
    return result.data.id;
  } catch (err) {
    console.error('[hourly-post] Tweet failed:', err);
    return null;
  }
}

// --- Budget & History Tracking ---

interface BudgetData {
  monthlyTarget: number;
  currentMonth: string;
  spent: number;
  tweetsPosted: number;
  remaining: number;
}

interface HistoryEntry {
  tweetId: string;
  date: string;
  tracker: string;
  type: string;
  voice: string;
  lang: string;
  text: string;
  cost: number;
  utmClicks: number;
  publishedAt: string;
}

function updateBudget(cost: number): void {
  try {
    const budget: BudgetData = JSON.parse(readFileSync(PATHS.socialBudget, 'utf8'));
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (budget.currentMonth !== currentMonth) {
      budget.currentMonth = currentMonth;
      budget.spent = 0;
      budget.tweetsPosted = 0;
      budget.remaining = budget.monthlyTarget;
    }
    budget.spent = Math.round((budget.spent + cost) * 100) / 100;
    budget.tweetsPosted += 1;
    budget.remaining = Math.round((budget.monthlyTarget - budget.spent) * 100) / 100;
    writeFileSync(PATHS.socialBudget, JSON.stringify(budget, null, 2), 'utf8');
  } catch (err) {
    console.warn('[hourly-post] Budget update failed:', err);
  }
}

function appendHistory(entry: HistoryEntry): void {
  try {
    const history: HistoryEntry[] = JSON.parse(readFileSync(PATHS.socialHistory, 'utf8'));
    history.push(entry);
    writeFileSync(PATHS.socialHistory, JSON.stringify(history, null, 2), 'utf8');
  } catch (err) {
    console.warn('[hourly-post] History append failed:', err);
  }
}

// --- Main ---

export async function postBreaking(
  tracker: string,
  tweetText: string,
  eventIds: string[],
  sections: string[],
): Promise<ManifestUpdate> {
  const now = new Date().toISOString();
  const update: ManifestUpdate = {
    tracker,
    action: 'update',
    eventIds,
    sections,
    tweetId: null,
    timestamp: now,
  };

  const client = getTwitterClient();
  if (client) {
    const tweetId = await postTweet(client, tweetText);
    update.tweetId = tweetId;
    if (tweetId) {
      updateBudget(0.01);
      appendHistory({
        tweetId,
        date: now.slice(0, 10),
        tracker,
        type: 'breaking',
        voice: 'journalist',
        lang: 'en',
        text: tweetText,
        cost: 0.01,
        utmClicks: 0,
        publishedAt: now,
      });
      console.log(`[hourly-post] Posted tweet ${tweetId} for ${tracker}`);
    }
  }

  // Append to manifest
  const manifest = loadManifest();
  manifest.updates.push(update);
  saveManifest(manifest);

  return update;
}

export async function postNewTracker(
  slug: string,
  name: string,
  summary: string,
  seeded: boolean,
): Promise<ManifestUpdate> {
  const now = new Date().toISOString();
  const baseUrl = 'https://watchboard.dev';
  const link = `${baseUrl}/${slug}/?utm_source=x&utm_medium=breaking_hourly&utm_campaign=${now.slice(0, 10)}`;
  const tweetText = `BREAKING: New tracker launched \u2014 ${name}. ${summary}\n\nFollow live: ${link}\n\n#Watchboard`;

  const update: ManifestUpdate = {
    tracker: slug,
    action: 'new_tracker',
    eventIds: ['initial-event'],
    sections: ['events', 'map-points', 'meta'],
    tweetId: null,
    timestamp: now,
    seeded,
  };

  const client = getTwitterClient();
  if (client) {
    // Trim to 280 chars
    const trimmed = tweetText.length > 280 ? tweetText.slice(0, 277) + '...' : tweetText;
    const tweetId = await postTweet(client, trimmed);
    update.tweetId = tweetId;
    if (tweetId) {
      updateBudget(0.01);
      appendHistory({
        tweetId,
        date: now.slice(0, 10),
        tracker: slug,
        type: 'breaking',
        voice: 'journalist',
        lang: 'en',
        text: trimmed,
        cost: 0.01,
        utmClicks: 0,
        publishedAt: now,
      });
    }
  }

  const manifest = loadManifest();
  manifest.updates.push(update);
  saveManifest(manifest);

  return update;
}
```

- [ ] **Step 2: Verify module compiles**

Run: `npx tsx --eval "import './scripts/hourly-post.js'" 2>&1`
Expected: No errors (module loads without executing)

- [ ] **Step 3: Commit**

```bash
git add scripts/hourly-post.ts
git commit -m "feat(hourly): add direct X posting for breaking news"
```

---

### Task 6: Bootstrap Initial Data Files

**Files:**
- Create: `public/_hourly/state.json`
- Create: `public/_hourly/today-updates.json`
- Modify: `social-config.json`

- [ ] **Step 1: Create _hourly directory and initial files**

Create `public/_hourly/state.json`:

```json
{
  "lastScan": "",
  "seen": []
}
```

Create `public/_hourly/today-updates.json`:

```json
{
  "date": "2026-04-03",
  "updates": []
}
```

- [ ] **Step 2: Add hourly cost category to social-config.json**

In `social-config.json`, add a `hourlyCosts` key after the existing `apiCosts`:

```json
"hourlyCosts": {
  "breakingTweet": 0.01,
  "newTrackerTweet": 0.01
},
```

- [ ] **Step 3: Commit**

```bash
git add public/_hourly/state.json public/_hourly/today-updates.json social-config.json
git commit -m "feat(hourly): bootstrap state files and update social config"
```

---

### Task 7: Create the Workflow File

**Files:**
- Create: `.github/workflows/hourly-scan.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/hourly-scan.yml`:

```yaml
name: Hourly Breaking News Scan

on:
  schedule:
    - cron: '0 * * * *' # Every hour
  workflow_dispatch: {}

concurrency:
  group: hourly-scan
  cancel-in-progress: true

permissions:
  contents: write
  actions: write

jobs:
  # ─── JOB 1: SCAN ──────────────────────────────────────────────
  scan:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    outputs:
      has_actions: ${{ steps.triage.outputs.has_actions }}
      plan_json: ${{ steps.triage.outputs.plan_json }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci

      # Step 1 + 2: RSS/GDELT poll + URL dedup
      - name: Poll news sources
        id: poll
        run: |
          npx tsx scripts/hourly-scan.ts
          if [ -f /tmp/hourly-candidates.json ]; then
            count=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/hourly-candidates.json','utf8')).length)")
            echo "candidates=$count" >> "$GITHUB_OUTPUT"
            echo "has_candidates=true" >> "$GITHUB_OUTPUT"
          else
            echo "candidates=0" >> "$GITHUB_OUTPUT"
            echo "has_candidates=false" >> "$GITHUB_OUTPUT"
          fi

      # Step 3 + 4: AI triage + action plan
      - name: AI triage
        id: triage
        if: steps.poll.outputs.has_candidates == 'true'
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          npx tsx scripts/hourly-triage.ts /tmp/hourly-candidates.json

          if [ -f /tmp/hourly-action-plan.json ]; then
            # Read plan and check if there are actions
            node -e "
              const plan = JSON.parse(require('fs').readFileSync('/tmp/hourly-action-plan.json','utf8'));
              const hasActions = plan.updates.length > 0 || plan.newTrackers.length > 0;
              console.log('has_actions=' + hasActions);

              // Build matrix entries
              const entries = [];
              for (const u of plan.updates) {
                entries.push({ type: 'update', tracker: u.tracker, data: JSON.stringify(u) });
              }
              for (const nt of plan.newTrackers) {
                entries.push({ type: 'new_tracker', tracker: nt.suggestedSlug, data: JSON.stringify(nt) });
              }
              console.log('plan_json=' + JSON.stringify(entries));
            " >> "$GITHUB_OUTPUT"
          else
            echo "has_actions=false" >> "$GITHUB_OUTPUT"
            echo "plan_json=[]" >> "$GITHUB_OUTPUT"
          fi

      # Commit state updates (seen URLs) even when no actions
      - name: Commit state
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add public/_hourly/state.json || true
          if git diff --cached --quiet; then
            echo "No state changes"
          else
            git commit -m "chore(hourly): update scan state $(date -u +%Y-%m-%dT%H:%M:%SZ)"
            for i in 1 2 3; do
              git pull --rebase origin main && git push && break
              sleep $((RANDOM % 5 + 2))
            done
          fi

      - name: Upload action plan
        if: steps.triage.outputs.has_actions == 'true'
        uses: actions/upload-artifact@v4
        with:
          name: hourly-action-plan
          path: /tmp/hourly-action-plan.json
          retention-days: 1

  # ─── JOB 2: ACT ───────────────────────────────────────────────
  act:
    needs: scan
    if: needs.scan.outputs.has_actions == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    strategy:
      fail-fast: false
      matrix:
        entry: ${{ fromJSON(needs.scan.outputs.plan_json) }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci

      - uses: actions/download-artifact@v4
        with:
          name: hourly-action-plan
          path: /tmp/

      # ── Existing tracker update ──
      - name: Update tracker data
        if: matrix.entry.type == 'update'
        uses: anthropics/claude-code-action@v1
        with:
          allowed_bots: "github-actions[bot]"
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          claude_args: "--max-turns 15 --dangerously-skip-permissions"
          prompt: |
            You are updating the Watchboard tracker "${{ matrix.entry.tracker }}" with a breaking news event.

            STEP 1: Read the schemas and tracker config:
            - Read src/lib/schemas.ts (focus on TimelineEventSchema, MapPointSchema, MapLineSchema, SourceSchema)
            - Read trackers/${{ matrix.entry.tracker }}/tracker.json

            STEP 2: Here is the triage data for this update:
            ${{ matrix.entry.data }}

            STEP 3: Update the tracker data files:
            - Create or append to trackers/${{ matrix.entry.tracker }}/data/events/$(date -u +%Y-%m-%d).json
            - Update trackers/${{ matrix.entry.tracker }}/data/map-points.json if event has a location
            - Update trackers/${{ matrix.entry.tracker }}/data/map-lines.json if event involves movement/strike
            - Update trackers/${{ matrix.entry.tracker }}/data/kpis.json if metrics changed
            - Update trackers/${{ matrix.entry.tracker }}/data/meta.json: set heroHeadline and lastUpdated

            VALIDATION RULES (MUST follow):
            - year field MUST be a string like "Apr 3, 2026" (NOT a number)
            - source.pole MUST be one of: "western", "middle_eastern", "eastern", "international"
            - All IDs must be unique kebab-case strings
            - NO future dates (today is $(date -u +%Y-%m-%d))
            - If adding map-lines with cat "strike" or "retaliation": weaponType AND time are REQUIRED
            - Map coordinates must be within tracker's coordValidation bounds
            - Merge by ID — never remove existing items, only append

            STEP 4: Generate a tweet for this event:
            - Write the tweet text to /tmp/tweet-text.txt
            - Max 280 characters (URLs count as 23 chars via t.co)
            - Include the tracker link: https://watchboard.dev/${{ matrix.entry.tracker }}/?utm_source=x&utm_medium=breaking_hourly&utm_campaign=$(date -u +%Y-%m-%d)
            - Add 1 topic hashtag + #Watchboard (2 max)
            - Tone: breaking news journalist, factual, concise

            STEP 5: Write the list of new event IDs (one per line) to /tmp/event-ids.txt
            Write the list of sections you modified (one per line) to /tmp/sections.txt

      # ── Post to X ──
      - name: Post breaking tweet
        if: matrix.entry.type == 'update'
        env:
          X_API_KEY: ${{ secrets.X_API_KEY }}
          X_API_SECRET: ${{ secrets.X_API_SECRET }}
          X_ACCESS_TOKEN: ${{ secrets.X_ACCESS_TOKEN }}
          X_ACCESS_TOKEN_SECRET: ${{ secrets.X_ACCESS_TOKEN_SECRET }}
        run: |
          if [ -f /tmp/tweet-text.txt ]; then
            TWEET_TEXT=$(cat /tmp/tweet-text.txt)
            EVENT_IDS=$(cat /tmp/event-ids.txt 2>/dev/null | tr '\n' ',' | sed 's/,$//')
            SECTIONS=$(cat /tmp/sections.txt 2>/dev/null | tr '\n' ',' | sed 's/,$//')

            npx tsx -e "
              import { postBreaking } from './scripts/hourly-post.js';
              postBreaking(
                '${{ matrix.entry.tracker }}',
                process.env.TWEET_TEXT!,
                process.env.EVENT_IDS!.split(',').filter(Boolean),
                process.env.SECTIONS!.split(',').filter(Boolean),
              ).then(u => console.log('[act] Posted:', JSON.stringify(u)))
               .catch(e => console.error('[act] Post failed:', e));
            "
          fi

      # ── New tracker creation ──
      - name: Create new tracker
        if: matrix.entry.type == 'new_tracker'
        uses: anthropics/claude-code-action@v1
        with:
          allowed_bots: "github-actions[bot]"
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          claude_args: "--max-turns 25 --dangerously-skip-permissions"
          prompt: |
            You are creating a new Watchboard tracker based on a breaking news event.

            STEP 1: Study the system:
            - Read src/lib/tracker-config.ts for TrackerConfigSchema
            - Read src/lib/schemas.ts for data schemas
            - Read one existing tracker as a template (pick one matching the domain below)

            STEP 2: Here is the new tracker specification:
            ${{ matrix.entry.data }}

            STEP 3: Create trackers/${{ matrix.entry.tracker }}/tracker.json with:
            - slug: "${{ matrix.entry.tracker }}"
            - status: "active", temporal: "live"
            - Appropriate domain, region, country from the spec
            - startDate: today $(date -u +%Y-%m-%d)
            - sections: [hero, kpis, timeline, map, claims, political]
            - Map bounds derived from the event's geographic region (use real coordinates)
            - 3-4 map categories relevant to the topic
            - Globe: enabled with 4-5 camera presets at real locations
            - AI config with searchContext from the trigger event
            - updateIntervalDays: 1
            - backfillTargets: {timeline: 10, mapPoints: 5, claims: 5, political: 5}

            STEP 4: Create trackers/${{ matrix.entry.tracker }}/data/ with:
            - meta.json: populated with trigger event info
            - events/$(date -u +%Y-%m-%d).json: the trigger event as first entry
            - map-points.json: event location (if known)
            - Empty arrays: kpis.json, timeline.json, map-lines.json, claims.json, political.json,
              casualties.json, econ.json, strike-targets.json, retaliation.json, assets.json, digests.json
            - update-log.json: {lastRun: "$(date -u +%Y-%m-%dT%H:%M:%SZ)", sections: {}}

            STEP 5: Validate:
            - Read back tracker.json and verify it's valid JSON
            - Run: npx tsx -e "import {TrackerConfigSchema} from './src/lib/tracker-config.js'; const c = JSON.parse(require('fs').readFileSync('trackers/${{ matrix.entry.tracker }}/tracker.json','utf8')); TrackerConfigSchema.parse(c); console.log('Config valid')"

            STEP 6: Decide if historical seeding is needed:
            - If this is a sudden event (earthquake, attack, etc.) write "false" to /tmp/should-seed.txt
            - If this is an ongoing situation with history write "true" to /tmp/should-seed.txt

      - name: Post new tracker tweet
        if: matrix.entry.type == 'new_tracker'
        env:
          X_API_KEY: ${{ secrets.X_API_KEY }}
          X_API_SECRET: ${{ secrets.X_API_SECRET }}
          X_ACCESS_TOKEN: ${{ secrets.X_ACCESS_TOKEN }}
          X_ACCESS_TOKEN_SECRET: ${{ secrets.X_ACCESS_TOKEN_SECRET }}
        run: |
          TRACKER="${{ matrix.entry.tracker }}"
          SHOULD_SEED=$(cat /tmp/should-seed.txt 2>/dev/null || echo "false")

          # Extract name and summary from the plan data
          npx tsx -e "
            const data = ${{ matrix.entry.data }};
            import { postNewTracker } from './scripts/hourly-post.js';
            postNewTracker(
              '${{ matrix.entry.tracker }}',
              data.suggestedName,
              data.triggerEvent.summary,
              '$SHOULD_SEED' === 'true',
            ).then(u => console.log('[act] Posted new tracker:', JSON.stringify(u)))
             .catch(e => console.error('[act] Post failed:', e));
          "

      - name: Trigger seed job
        if: matrix.entry.type == 'new_tracker'
        run: |
          SHOULD_SEED=$(cat /tmp/should-seed.txt 2>/dev/null || echo "false")
          if [ "$SHOULD_SEED" = "true" ]; then
            gh workflow run seed-tracker.yml \
              -f tracker_slug="${{ matrix.entry.tracker }}" \
              -f sections="all"
            echo "Seed job triggered for ${{ matrix.entry.tracker }}"
          fi
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      # ── Validate + Commit ──
      - name: Validate modified JSON
        run: |
          TRACKER="${{ matrix.entry.tracker }}"
          VALID=true
          for f in trackers/$TRACKER/data/*.json trackers/$TRACKER/data/events/*.json; do
            [ -f "$f" ] || continue
            node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" 2>/dev/null || {
              echo "INVALID JSON: $f"
              VALID=false
            }
          done
          if [ "$VALID" = "false" ]; then
            echo "::error::JSON validation failed for $TRACKER"
            exit 1
          fi

          # Zod validation on event files
          npx tsx -e "
            import {TimelineEventSchema} from './src/lib/schemas.js';
            import {readdirSync, readFileSync} from 'fs';
            const dir = 'trackers/$TRACKER/data/events';
            try {
              for (const f of readdirSync(dir)) {
                if (!f.endsWith('.json')) continue;
                const events = JSON.parse(readFileSync(dir+'/'+f,'utf8'));
                for (const e of Array.isArray(events) ? events : [events]) {
                  TimelineEventSchema.parse(e);
                }
              }
              console.log('Zod validation passed');
            } catch(e: any) { console.error('Zod error:', e.message); process.exit(1); }
          "

      - name: Update update-log
        run: |
          TRACKER="${{ matrix.entry.tracker }}"
          LOG_FILE="trackers/$TRACKER/data/update-log.json"
          node -e "
            const fs = require('fs');
            const log = fs.existsSync('$LOG_FILE')
              ? JSON.parse(fs.readFileSync('$LOG_FILE','utf8'))
              : {lastRun:'',sections:{}};
            log.lastRun = new Date().toISOString();
            const sections = (process.env.SECTIONS || '').split(',').filter(Boolean);
            for (const s of sections) log.sections[s] = {lastRun: log.lastRun, status: 'updated'};
            fs.writeFileSync('$LOG_FILE', JSON.stringify(log, null, 2));
          "
        env:
          SECTIONS: ${{ matrix.entry.type == 'update' && 'events,map-points,kpis,meta' || 'events,map-points,meta' }}

      - name: Commit and push
        run: |
          TRACKER="${{ matrix.entry.tracker }}"
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add "trackers/$TRACKER/" public/_hourly/ public/_social/ || true
          if git diff --cached --quiet; then
            echo "No changes to commit"
            exit 0
          fi
          TYPE="${{ matrix.entry.type }}"
          if [ "$TYPE" = "new_tracker" ]; then
            MSG="feat(hourly): create tracker $TRACKER $(date -u +%Y-%m-%dT%H:%M:%SZ)"
          else
            MSG="chore(hourly): update $TRACKER $(date -u +%Y-%m-%dT%H:%M:%SZ)"
          fi
          git commit -m "$MSG"
          for i in 1 2 3; do
            git pull --rebase origin main && git push && break
            sleep $((RANDOM % 8 + 2))
          done

      - name: Job summary
        if: always()
        run: |
          echo "## Hourly Pipeline — ${{ matrix.entry.tracker }}" >> "$GITHUB_STEP_SUMMARY"
          echo "- **Type:** ${{ matrix.entry.type }}" >> "$GITHUB_STEP_SUMMARY"
          echo "- **Timestamp:** $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$GITHUB_STEP_SUMMARY"
          if [ -f /tmp/tweet-text.txt ]; then
            echo "- **Tweet:** $(cat /tmp/tweet-text.txt)" >> "$GITHUB_STEP_SUMMARY"
          fi
```

- [ ] **Step 2: Validate YAML syntax**

Run: `node -e "const yaml = require('yaml'); yaml.parse(require('fs').readFileSync('.github/workflows/hourly-scan.yml','utf8')); console.log('Valid YAML')" 2>&1`

If `yaml` not available: `npx yaml-lint .github/workflows/hourly-scan.yml` or just check with `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/hourly-scan.yml'))"`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/hourly-scan.yml
git commit -m "feat(hourly): add hourly-scan workflow with scan + act jobs"
```

---

### Task 8: Modify Nightly Pipeline for Hourly Dedup

**Files:**
- Modify: `.github/workflows/update-data.yml`

- [ ] **Step 1: Add hourly manifest reading to the resolve phase**

In `update-data.yml`, in the resolve job after the eligible trackers step (around line 114), add a new step:

```yaml
      - name: Read hourly manifest for dedup
        id: hourly
        run: |
          MANIFEST="public/_hourly/today-updates.json"
          if [ -f "$MANIFEST" ]; then
            node -e "
              const manifest = JSON.parse(require('fs').readFileSync('$MANIFEST','utf8'));
              const today = new Date().toISOString().slice(0,10);
              if (manifest.date !== today) {
                console.log('hourly_updates={}');
                return;
              }
              const byTracker = {};
              for (const u of manifest.updates) {
                if (!byTracker[u.tracker]) byTracker[u.tracker] = { eventIds: [], sections: [] };
                byTracker[u.tracker].eventIds.push(...u.eventIds);
                for (const s of u.sections) {
                  if (!byTracker[u.tracker].sections.includes(s)) byTracker[u.tracker].sections.push(s);
                }
              }
              console.log('hourly_updates=' + JSON.stringify(byTracker));
            " >> "$GITHUB_OUTPUT"
          else
            echo "hourly_updates={}" >> "$GITHUB_OUTPUT"
          fi
```

- [ ] **Step 2: Inject hourly context into the update job prompt**

In the update job, in the step that builds the Claude Code prompt (around line 188 where sibling context is injected), add the hourly dedup block. Find the prompt section and add after the sibling context:

```yaml
            HOURLY DEDUP — The following events were already ingested today by the hourly pipeline. Do NOT re-add them:
            ${{ steps.hourly.outputs.hourly_updates }}
            If sections listed were already updated hourly, focus your effort on OTHER sections not listed.
```

- [ ] **Step 3: Add manifest cleanup to finalize phase**

In the finalize job, after the metrics commit step (around line 795), add:

```yaml
      - name: Clean up old hourly manifests
        run: |
          ARCHIVE_DIR="public/_hourly/archive"
          if [ -d "$ARCHIVE_DIR" ]; then
            find "$ARCHIVE_DIR" -name "*.json" -mtime +3 -delete 2>/dev/null || true
            echo "Pruned hourly archives older than 3 days"
          fi
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/update-data.yml
git commit -m "feat(hourly): integrate hourly manifest dedup into nightly pipeline"
```

---

### Task 9: Add RSS Feeds to Key Trackers

**Files:**
- Modify: `trackers/iran-conflict/tracker.json`
- Modify: `trackers/gaza-war/tracker.json`
- Modify: `trackers/ukraine-war/tracker.json`

- [ ] **Step 1: Add rssFeeds to iran-conflict**

In `trackers/iran-conflict/tracker.json`, inside the `ai` object, add after `backfillTargets`:

```json
"rssFeeds": [
  "https://news.google.com/rss/search?q=Iran+conflict+military&hl=en-US&gl=US&ceid=US:en",
  "https://www.aljazeera.com/xml/rss/all.xml"
]
```

- [ ] **Step 2: Add rssFeeds to gaza-war**

In `trackers/gaza-war/tracker.json`, inside the `ai` object, add after `backfillTargets`:

```json
"rssFeeds": [
  "https://news.google.com/rss/search?q=Gaza+war+Israel+Hamas&hl=en-US&gl=US&ceid=US:en",
  "https://www.aljazeera.com/xml/rss/all.xml"
]
```

- [ ] **Step 3: Add rssFeeds to ukraine-war**

In `trackers/ukraine-war/tracker.json`, inside the `ai` object, add after `backfillTargets`:

```json
"rssFeeds": [
  "https://news.google.com/rss/search?q=Ukraine+war+Russia&hl=en-US&gl=US&ceid=US:en"
]
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds (rssFeeds is optional, valid URL arrays)

- [ ] **Step 5: Commit**

```bash
git add trackers/iran-conflict/tracker.json trackers/gaza-war/tracker.json trackers/ukraine-war/tracker.json
git commit -m "feat(hourly): add RSS feeds to key conflict trackers"
```

---

### Task 10: Run Full Test Suite and Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all hourly tests**

Run: `npx vitest run tests/hourly-*.test.ts 2>&1`
Expected: All tests PASS

- [ ] **Step 2: Verify build passes with all changes**

Run: `npm run build 2>&1 | tail -30`
Expected: Build succeeds

- [ ] **Step 3: Verify workflow YAML is valid**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/hourly-scan.yml')); print('Valid')" 2>&1`
Expected: "Valid"

- [ ] **Step 4: Dry-run the scan script locally (will fail on GDELT network call, but verifies imports)**

Run: `npx tsx -e "import { extractKeywords, matchTrackerByKeywords, dedup, parseRssFeed } from './scripts/hourly-scan.js'; console.log('All exports OK')" 2>&1`
Expected: "All exports OK"

- [ ] **Step 5: Verify hourly-types exports**

Run: `npx tsx -e "import { loadState, loadManifest, saveState, saveManifest, PATHS } from './scripts/hourly-types.js'; console.log('Paths:', Object.keys(PATHS).join(', '))" 2>&1`
Expected: Lists all path keys

- [ ] **Step 6: Final commit with any fixups**

Only if previous steps revealed issues. Otherwise, skip.
