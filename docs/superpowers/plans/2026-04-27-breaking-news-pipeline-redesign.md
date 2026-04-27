# Breaking News Pipeline Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 15-min light scan + per-tracker dynamic feeds + realtime (Bluesky/Telegram) sources + persistent triage audit log + a public `/breaking-news-audit/` page, on top of the existing 6h heavy scan.

**Architecture:** Two-tier scan cadence with the same `Candidate` interface across all source types (RSS, GDELT, Bluesky, Telegram). Light scan = keyword match + Telegram on HIGH score. Heavy scan = current Sonnet pipeline + per-tracker dynamic feed resolution + audit-log persistence. Audit page reads `triage-log.json` at runtime.

**Tech Stack:** Node.js (tsx), TypeScript strict, Vitest for tests, Astro 5 for the page, React island for interactivity, GitHub Actions for cron, `@atproto/api` for Bluesky, native fetch for Telegram public-channel scraping.

**Spec:** `docs/superpowers/specs/2026-04-27-breaking-news-pipeline-redesign-design.md`

---

## File Map

**Create:**
- `src/lib/tracker-feeds.ts` — region/domain → feeds registry + `resolveFeedsForActiveTrackers()`
- `src/lib/tracker-feeds.test.ts` — unit tests
- `src/lib/keyword-match.ts` — pure scoring function `scoreCandidate(candidate, tracker)`
- `src/lib/keyword-match.test.ts` — unit tests
- `src/lib/triage-log.ts` — append + prune helpers
- `src/lib/triage-log.test.ts` — unit tests
- `src/lib/realtime-sources.ts` — Bluesky + Telegram pollers (shared `Candidate` interface)
- `scripts/hourly-light-scan.ts` — keyword-only scanner, posts to Telegram on HIGH score
- `.github/workflows/light-scan.yml` — 15-min cron
- `src/pages/breaking-news-audit.astro` — public audit page
- `src/components/islands/TriageLogBoard.tsx` — interactive board

**Modify:**
- `scripts/hourly-types.ts` — extend `Candidate.feedOrigin` to include `'bluesky' | 'telegram'`, add `PendingCandidate` types and a `TriageLogEntry` type
- `scripts/hourly-scan.ts` — call `resolveFeedsForActiveTrackers()` and union with static list, call realtime pollers, read `pending-candidates.json`
- `scripts/hourly-triage.ts` — write to `triage-log.json` after every decision
- `src/pages/about.astro` — link to the audit page in the Roadmap section + footer
- `package.json` — add `@atproto/api` dep

**Delete:**
- None.

---

## Task 1: Extend hourly-types.ts with new candidate sources, pending candidates, and triage-log entry types

**Files:**
- Modify: `scripts/hourly-types.ts`

- [ ] **Step 1: Read the current `Candidate` interface and confirm it has `feedOrigin: 'rss' | 'gdelt'`** (line 40-41).

- [ ] **Step 2: Replace the `Candidate` interface to widen `feedOrigin` and add `language`**

```ts
export interface Candidate {
  title: string;
  url: string;
  source: string;
  timestamp: string;
  matchedTracker: string | null;
  feedOrigin: 'rss' | 'gdelt' | 'bluesky' | 'telegram';
  /** Source-tier hint propagated from the feed registry; 1 = official, 2 = major outlet, 3 = institutional. */
  sourceTier?: 1 | 2 | 3;
  /** ISO 639-1 language code from the source feed (informational; matching is language-agnostic). */
  language?: 'en' | 'es' | 'fr' | 'pt' | 'ar' | 'zh' | 'ja' | 'hi';
}
```

- [ ] **Step 3: Append `PendingCandidate` and `TriageLogEntry` types at the bottom of the types section (before `// --- Paths ---`)**

```ts
/** A candidate the light scan saw with moderate confidence. The next heavy
 *  scan reads this file, merges with its own poll, and runs full triage. */
export interface PendingCandidate {
  candidate: Candidate;
  /** Multi-signal score from the light scan: keyword + liveness + tier. 0-1. */
  score: number;
  /** When the light scan recorded it. */
  recordedAt: string;
}

export interface PendingCandidates {
  version: 1;
  entries: PendingCandidate[];
}

/** One row in the audit log. Append-only; pruned at 14 days. */
export interface TriageLogEntry {
  timestamp: string;
  candidate: Candidate;
  decision: 'update' | 'new_tracker' | 'defer' | 'discard';
  reason: string;
  confidence: number;
  model: string | null;       // null for keyword-only decisions
  scanType: 'light' | 'heavy';
}

export interface TriageLog {
  version: 1;
  lastPruned: string;
  entries: TriageLogEntry[];
}
```

- [ ] **Step 4: Add new entries to `PATHS`** — find the existing `PATHS = { ... }` block (line 80) and add three keys before the closing brace:

```ts
  pendingCandidates: join(ROOT, 'public', '_hourly', 'pending-candidates.json'),
  triageLog:         join(ROOT, 'public', '_hourly', 'triage-log.json'),
  realtimeState:     join(ROOT, 'public', '_hourly', 'realtime-state.json'),
```

- [ ] **Step 5: Update `normalizeCandidate` signature to accept the wider `feedOrigin`**

Find the function at line 148 and replace its signature parameter:

```ts
export function normalizeCandidate(
  raw: { title: string; url: string; source: string; timestamp: string },
  matchedTracker: string | null,
  feedOrigin: Candidate['feedOrigin'],
  extra: Pick<Candidate, 'sourceTier' | 'language'> = {},
): Candidate {
  return {
    title: raw.title,
    url: raw.url,
    source: raw.source,
    timestamp: raw.timestamp,
    matchedTracker,
    feedOrigin,
    ...extra,
  };
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -E "hourly-types|hourly-scan|hourly-triage|hourly-post"`
Expected: no errors in any of these files. The widened `feedOrigin` is a superset, so existing call sites stay valid.

- [ ] **Step 7: Commit**

```bash
git add scripts/hourly-types.ts
git commit -m "feat(types): extend Candidate sources + add pending-candidates and triage-log types"
```

---

## Task 2: Build the per-tracker feeds registry

**Files:**
- Create: `src/lib/tracker-feeds.ts`
- Create: `src/lib/tracker-feeds.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tracker-feeds.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  resolveFeedsForTracker,
  resolveFeedsForActiveTrackers,
  REGION_FEEDS,
  DOMAIN_FEEDS,
  type FeedSpec,
} from './tracker-feeds';
import type { TrackerConfig } from './tracker-config';

const mkTracker = (overrides: Partial<TrackerConfig>): TrackerConfig => ({
  slug: 'x', name: 'X', shortName: 'X', icon: '?', status: 'active',
  domain: 'conflict', region: 'middle-east', sections: [],
  meta: { startDate: '2024-01-01' } as any,
  ...overrides,
});

describe('tracker-feeds', () => {
  it('returns combined region + domain feeds for a tracker', () => {
    const tr = mkTracker({ region: 'mexico', domain: 'governance' });
    const feeds = resolveFeedsForTracker(tr);
    const urls = feeds.map((f) => f.url);
    // mexico region feeds expected
    expect(urls.some((u) => u.includes('animalpolitico'))).toBe(true);
    // every entry conforms to FeedSpec
    for (const f of feeds) {
      expect(f.url).toMatch(/^https?:\/\//);
      expect([1, 2, 3]).toContain(f.tier);
    }
  });

  it('returns empty array when tracker has no region or domain', () => {
    const tr = mkTracker({ region: undefined, domain: undefined });
    expect(resolveFeedsForTracker(tr)).toEqual([]);
  });

  it('dedupes by URL when region and domain share a feed', () => {
    // Construct a synthetic case if any feed appears in both
    const dup = REGION_FEEDS['mexico']?.[0];
    if (!dup) return; // nothing to dedupe in this dataset
    const tr = mkTracker({ region: 'mexico', domain: 'governance' });
    const feeds = resolveFeedsForTracker(tr);
    const urls = feeds.map((f) => f.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('resolveFeedsForActiveTrackers dedupes union across many trackers', () => {
    const trs = [
      mkTracker({ slug: 'a', region: 'mexico' }),
      mkTracker({ slug: 'b', region: 'mexico', domain: 'governance' }),
    ];
    const feeds = resolveFeedsForActiveTrackers(trs);
    const urls = feeds.map((f) => f.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('skips inactive trackers', () => {
    const trs = [
      mkTracker({ slug: 'a', region: 'mexico', status: 'archived' }),
    ];
    const feeds = resolveFeedsForActiveTrackers(trs);
    expect(feeds).toEqual([]);
  });

  it('REGION_FEEDS has well-formed entries', () => {
    for (const [region, feeds] of Object.entries(REGION_FEEDS)) {
      expect(typeof region).toBe('string');
      expect(Array.isArray(feeds)).toBe(true);
      for (const f of feeds) {
        expect(f.url).toMatch(/^https?:\/\//);
        expect([1, 2, 3]).toContain(f.tier);
      }
    }
  });
});
```

- [ ] **Step 2: Run tests — expect fail (module not found)**

Run: `npx vitest run src/lib/tracker-feeds.test.ts`
Expected: FAIL — Cannot find module './tracker-feeds'.

- [ ] **Step 3: Create `src/lib/tracker-feeds.ts`**

```ts
import type { TrackerConfig } from './tracker-config';

export type FeedLanguage = 'en' | 'es' | 'fr' | 'pt' | 'ar' | 'zh' | 'ja' | 'hi';

export interface FeedSpec {
  url: string;
  tier: 1 | 2 | 3;
  lang: FeedLanguage;
  /** Reserved for v2 auto-disable behavior; not used in v1. */
  toleranceDays?: number;
}

/**
 * Region → native-language outlets covering that region. Adding a tracker
 * with one of these regions auto-extends the scan's source list.
 *
 * All entries must be:
 *  - Public RSS feeds (no auth, no rate-limit signed URLs)
 *  - Generally well-known publishers (tier 1-3 per Watchboard's source-tier system)
 */
export const REGION_FEEDS: Record<string, FeedSpec[]> = {
  mexico: [
    { url: 'https://www.animalpolitico.com/feed/',            tier: 2, lang: 'es' },
    { url: 'https://www.jornada.com.mx/rss/edicion.xml',      tier: 2, lang: 'es' },
    { url: 'https://aristeguinoticias.com/feed/',             tier: 2, lang: 'es' },
    { url: 'https://www.eluniversal.com.mx/rss.xml',          tier: 2, lang: 'es' },
  ],
  india: [
    { url: 'https://www.thehindu.com/news/national/feeder/default.rss', tier: 2, lang: 'en' },
    { url: 'https://indianexpress.com/section/india/feed/',             tier: 2, lang: 'en' },
    { url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',tier: 2, lang: 'en' },
  ],
  'middle-east': [
    { url: 'https://www.aljazeera.com/xml/rss/all.xml',          tier: 2, lang: 'en' },
    { url: 'https://english.alarabiya.net/.mrss/en/all.xml',     tier: 2, lang: 'en' },
    { url: 'https://www.timesofisrael.com/feed/',                tier: 2, lang: 'en' },
  ],
  latam: [
    { url: 'https://www.clarin.com/rss/lo-ultimo/',              tier: 2, lang: 'es' },
    { url: 'https://feeds.folha.uol.com.br/folha/rss091.xml',    tier: 2, lang: 'pt' },
    { url: 'https://g1.globo.com/rss/g1/',                       tier: 2, lang: 'pt' },
  ],
  africa: [
    { url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf', tier: 2, lang: 'en' },
    { url: 'https://www.news24.com/rss/Section/News24Wire',      tier: 2, lang: 'en' },
  ],
  'east-asia': [
    { url: 'https://www.scmp.com/rss/91/feed',                   tier: 2, lang: 'en' },
    { url: 'https://www.japantimes.co.jp/feed/',                 tier: 2, lang: 'en' },
  ],
};

/**
 * Domain → topic-specific outlets. Same auto-extension behavior as REGION_FEEDS.
 */
export const DOMAIN_FEEDS: Record<string, FeedSpec[]> = {
  space: [
    { url: 'https://www.nasa.gov/news/all/feed/',                tier: 1, lang: 'en' },
    { url: 'https://spacenews.com/feed/',                        tier: 2, lang: 'en' },
    { url: 'https://www.esa.int/Newsroom/Highlights_RSS',        tier: 1, lang: 'en' },
  ],
  science: [
    { url: 'https://www.nature.com/nature.rss',                  tier: 1, lang: 'en' },
    { url: 'https://www.science.org/blogs/news-from-science/feed', tier: 1, lang: 'en' },
  ],
  economy: [
    { url: 'https://feeds.reuters.com/reuters/businessNews',     tier: 2, lang: 'en' },
  ],
  disaster: [
    { url: 'https://reliefweb.int/updates/rss.xml',              tier: 1, lang: 'en' },
  ],
};

/** Resolve all feeds (region + domain) that apply to a single tracker. */
export function resolveFeedsForTracker(tracker: Pick<TrackerConfig, 'region' | 'domain' | 'status'>): FeedSpec[] {
  const out: FeedSpec[] = [];
  if (tracker.region && REGION_FEEDS[tracker.region]) out.push(...REGION_FEEDS[tracker.region]);
  if (tracker.domain && DOMAIN_FEEDS[tracker.domain]) out.push(...DOMAIN_FEEDS[tracker.domain]);
  return out;
}

/** Walk all active trackers, union + dedupe their resolved feeds. */
export function resolveFeedsForActiveTrackers(
  trackers: Pick<TrackerConfig, 'region' | 'domain' | 'status'>[],
): FeedSpec[] {
  const seen = new Set<string>();
  const out: FeedSpec[] = [];
  for (const tr of trackers) {
    if (tr.status !== 'active') continue;
    for (const f of resolveFeedsForTracker(tr)) {
      if (seen.has(f.url)) continue;
      seen.add(f.url);
      out.push(f);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/tracker-feeds.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tracker-feeds.ts src/lib/tracker-feeds.test.ts
git commit -m "feat(scan): per-tracker dynamic feed registry (region + domain)"
```

---

## Task 3: Pure keyword-match scoring

**Files:**
- Create: `src/lib/keyword-match.ts`
- Create: `src/lib/keyword-match.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/keyword-match.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildKeywordIndex, scoreCandidate } from './keyword-match';
import type { TrackerConfig } from './tracker-config';
import type { Candidate } from '../../scripts/hourly-types';

const mkTracker = (over: Partial<TrackerConfig> & { searchContext?: string; keywords?: string[] }): TrackerConfig => ({
  slug: 'iran-conflict', name: 'Iran Conflict', shortName: 'Iran', icon: '🇮🇷',
  status: 'active', domain: 'conflict', region: 'middle-east', sections: [],
  searchContext: 'Iran-US/Israel conflict',
  keywords: ['Iran', 'Tehran', 'Khamenei', 'IRGC'],
  meta: { startDate: '2024-01-01' } as any,
  ...over,
});

const mkCandidate = (title: string, source = 'reuters'): Candidate => ({
  title, url: `https://x.com/${encodeURIComponent(title)}`, source,
  timestamp: new Date().toISOString(), matchedTracker: null, feedOrigin: 'rss',
  sourceTier: 2,
});

describe('keyword-match', () => {
  it('high score for clear keyword match in title from a tier-2 source', () => {
    const tr = mkTracker({});
    const idx = buildKeywordIndex(tr);
    const c = mkCandidate('Iran says it will respond to Israel strike on Tehran');
    const s = scoreCandidate(c, idx);
    expect(s).toBeGreaterThanOrEqual(0.85);
  });

  it('low score for unrelated headline', () => {
    const tr = mkTracker({});
    const idx = buildKeywordIndex(tr);
    const c = mkCandidate('Local bake sale raises money for school library');
    const s = scoreCandidate(c, idx);
    expect(s).toBeLessThan(0.3);
  });

  it('moderate score for partial / single-keyword hits', () => {
    const tr = mkTracker({});
    const idx = buildKeywordIndex(tr);
    const c = mkCandidate('Tehran weather: hot and dry');
    const s = scoreCandidate(c, idx);
    expect(s).toBeGreaterThan(0.3);
    expect(s).toBeLessThan(0.85);
  });

  it('case insensitive and tolerant to punctuation', () => {
    const tr = mkTracker({});
    const idx = buildKeywordIndex(tr);
    const c = mkCandidate('TEHRAN: Khamenei addresses parliament.');
    const s = scoreCandidate(c, idx);
    expect(s).toBeGreaterThanOrEqual(0.85);
  });

  it('boosts higher source tiers', () => {
    const tr = mkTracker({});
    const idx = buildKeywordIndex(tr);
    const tier1 = { ...mkCandidate('Iran statement'), sourceTier: 1 as const };
    const tier3 = { ...mkCandidate('Iran statement'), sourceTier: 3 as const };
    expect(scoreCandidate(tier1, idx)).toBeGreaterThan(scoreCandidate(tier3, idx));
  });

  it('handles tracker with no keywords (uses searchContext words)', () => {
    const tr = mkTracker({ keywords: undefined, searchContext: 'Mexico City protests AMLO' });
    const idx = buildKeywordIndex(tr);
    const c = mkCandidate('Mexico City protests turn violent');
    expect(scoreCandidate(c, idx)).toBeGreaterThanOrEqual(0.6);
  });

  it('returns 0 when both keywords and searchContext are empty', () => {
    const tr = mkTracker({ keywords: [], searchContext: '' });
    const idx = buildKeywordIndex(tr);
    const c = mkCandidate('Anything at all');
    expect(scoreCandidate(c, idx)).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run src/lib/keyword-match.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `src/lib/keyword-match.ts`**

```ts
import type { TrackerConfig } from './tracker-config';
import type { Candidate } from '../../scripts/hourly-types';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'as', 'by', 'is', 'was', 'are', 'be', 'been', 'has', 'have',
]);

/**
 * A pre-tokenized lookup index for one tracker. Keyword-matching is the
 * deterministic path used by the light scan; no LLM call.
 */
export interface KeywordIndex {
  trackerSlug: string;
  /** Normalized (lowercased, deduped) tokens. Empty when tracker has no signal. */
  tokens: Set<string>;
  /** Multi-token phrases (e.g. "Mexico City") for higher-confidence matches. */
  phrases: string[];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s\u00C0-\u017F]/g, ' ')   // keep letters incl. accented latin
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

export function buildKeywordIndex(
  tracker: Pick<TrackerConfig, 'slug'> & { keywords?: string[]; searchContext?: string },
): KeywordIndex {
  const sources: string[] = [];
  if (tracker.keywords && tracker.keywords.length > 0) sources.push(...tracker.keywords);
  if (tracker.searchContext) sources.push(tracker.searchContext);

  const tokens = new Set<string>();
  const phrases: string[] = [];

  for (const s of sources) {
    const toks = tokenize(s);
    toks.forEach((t) => tokens.add(t));
    // Treat multi-word source strings as candidate phrases (lowercased, trimmed)
    const norm = s.trim().toLowerCase();
    if (norm.includes(' ')) phrases.push(norm);
  }

  return { trackerSlug: tracker.slug, tokens, phrases };
}

const TIER_WEIGHTS: Record<NonNullable<Candidate['sourceTier']> | 'unknown', number> = {
  1: 1.0,
  2: 0.85,
  3: 0.65,
  unknown: 0.55,
};

/**
 * Score a candidate against a tracker's keyword index. Returns 0..1.
 * Formula: (keyword strength × 0.5) + (phrase bonus × 0.3) + (tier weight × 0.2)
 *  - keyword strength: fraction of the candidate's title tokens that hit the index, capped at 1.0
 *  - phrase bonus: 1.0 if any registered phrase appears as a substring in the title; else 0
 *  - tier weight: TIER_WEIGHTS lookup
 *
 * Empty indexes (no keywords AND no searchContext) score 0 unconditionally.
 */
export function scoreCandidate(candidate: Candidate, index: KeywordIndex): number {
  if (index.tokens.size === 0 && index.phrases.length === 0) return 0;
  const titleTokens = tokenize(candidate.title);
  if (titleTokens.length === 0) return 0;

  const hits = titleTokens.filter((t) => index.tokens.has(t)).length;
  const keywordStrength = Math.min(1, hits / Math.min(titleTokens.length, 4));

  const titleLower = candidate.title.toLowerCase();
  const phraseHit = index.phrases.some((p) => titleLower.includes(p));
  const phraseBonus = phraseHit ? 1 : 0;

  const tierKey = candidate.sourceTier ?? 'unknown';
  const tierWeight = TIER_WEIGHTS[tierKey];

  return Math.min(1, keywordStrength * 0.5 + phraseBonus * 0.3 + tierWeight * 0.2);
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/keyword-match.test.ts`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/keyword-match.ts src/lib/keyword-match.test.ts
git commit -m "feat(scan): pure keyword-match scoring for the light scan"
```

---

## Task 4: Triage-log persistence helpers

**Files:**
- Create: `src/lib/triage-log.ts`
- Create: `src/lib/triage-log.test.ts`

- [ ] **Step 1: Write tests**

Create `src/lib/triage-log.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendTriageEntries, pruneTriageLog, readTriageLog } from './triage-log';
import type { TriageLogEntry, Candidate } from '../../scripts/hourly-types';

const mkEntry = (daysAgo = 0): TriageLogEntry => ({
  timestamp: new Date(Date.now() - daysAgo * 24 * 3600_000).toISOString(),
  candidate: {
    title: `t-${daysAgo}`, url: `https://x/${daysAgo}`, source: 'r',
    timestamp: new Date().toISOString(), matchedTracker: null, feedOrigin: 'rss',
  } as Candidate,
  decision: 'discard', reason: 'noise', confidence: 0.1,
  model: null, scanType: 'light',
});

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'triage-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe('triage-log', () => {
  it('appendTriageEntries creates the file on first write', () => {
    const path = join(tmp, 'triage-log.json');
    appendTriageEntries([mkEntry()], path);
    expect(existsSync(path)).toBe(true);
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    expect(raw.version).toBe(1);
    expect(raw.entries).toHaveLength(1);
  });

  it('appendTriageEntries appends to existing file in order', () => {
    const path = join(tmp, 'triage-log.json');
    appendTriageEntries([mkEntry(0)], path);
    appendTriageEntries([mkEntry(1), mkEntry(2)], path);
    const log = readTriageLog(path);
    expect(log.entries).toHaveLength(3);
    expect(log.entries[0].candidate.title).toBe('t-0');
    expect(log.entries[2].candidate.title).toBe('t-2');
  });

  it('pruneTriageLog removes entries older than 14 days', () => {
    const path = join(tmp, 'triage-log.json');
    appendTriageEntries([mkEntry(0), mkEntry(7), mkEntry(14), mkEntry(20)], path);
    const removed = pruneTriageLog(path, 14);
    const log = readTriageLog(path);
    expect(log.entries.map((e) => e.candidate.title)).toEqual(['t-0', 't-7']);
    expect(removed).toBe(2);
    expect(log.lastPruned).toBeTruthy();
  });

  it('readTriageLog returns an empty log when the file is missing', () => {
    const log = readTriageLog(join(tmp, 'nope.json'));
    expect(log.entries).toEqual([]);
    expect(log.version).toBe(1);
  });

  it('handles a corrupt file by treating it as empty', () => {
    const path = join(tmp, 'bad.json');
    require('fs').writeFileSync(path, 'not json');
    const log = readTriageLog(path);
    expect(log.entries).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run src/lib/triage-log.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `src/lib/triage-log.ts`**

```ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { TriageLog, TriageLogEntry } from '../../scripts/hourly-types';

const EMPTY: TriageLog = { version: 1, lastPruned: '', entries: [] };

export function readTriageLog(path: string): TriageLog {
  if (!existsSync(path)) return { ...EMPTY };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as TriageLog;
    if (raw.version !== 1 || !Array.isArray(raw.entries)) return { ...EMPTY };
    return raw;
  } catch {
    return { ...EMPTY };
  }
}

function writeTriageLog(log: TriageLog, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(log, null, 2), 'utf8');
}

export function appendTriageEntries(entries: TriageLogEntry[], path: string): void {
  const current = readTriageLog(path);
  current.entries.push(...entries);
  writeTriageLog(current, path);
}

/** Prune entries older than `keepDays`. Returns number removed. */
export function pruneTriageLog(path: string, keepDays: number): number {
  const current = readTriageLog(path);
  const cutoffMs = Date.now() - keepDays * 24 * 3600_000;
  const before = current.entries.length;
  current.entries = current.entries.filter((e) => new Date(e.timestamp).getTime() >= cutoffMs);
  current.lastPruned = new Date().toISOString();
  writeTriageLog(current, path);
  return before - current.entries.length;
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/lib/triage-log.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/triage-log.ts src/lib/triage-log.test.ts
git commit -m "feat(scan): triage-log append + prune helpers"
```

---

## Task 5: Realtime sources (Bluesky + Telegram)

**Files:**
- Modify: `package.json` (add `@atproto/api`)
- Create: `src/lib/realtime-sources.ts`

This task has no unit tests because the implementations are thin network wrappers; we exercise them via the integration smoke in Task 11.

- [ ] **Step 1: Install `@atproto/api`**

```bash
npm install @atproto/api
```

- [ ] **Step 2: Create `src/lib/realtime-sources.ts`**

```ts
import type { Candidate } from '../../scripts/hourly-types';
import { normalizeCandidate } from '../../scripts/hourly-types';
import { AtpAgent } from '@atproto/api';

/** Hand-curated public OSINT / breaking-news Bluesky accounts.
 *  Adjust by editing this list — no other code changes required. */
const BLUESKY_ACCOUNTS: { handle: string; tier: 1 | 2 | 3 }[] = [
  { handle: 'bnonews.com',          tier: 2 },
  { handle: 'reuters.com',          tier: 2 },
  { handle: 'apnews.com',           tier: 2 },
  { handle: 'theintercept.com',     tier: 2 },
  { handle: 'aljazeera.com',        tier: 2 },
  { handle: 'osinttechnical.bsky.social', tier: 3 },
];

/** Hand-curated public Telegram channels (read via the public preview;
 *  no bot token required for read-only on public channels). */
const TELEGRAM_CHANNELS: { slug: string; tier: 1 | 2 | 3 }[] = [
  { slug: 'BNONews',          tier: 2 },
  { slug: 'reuters',          tier: 2 },
  { slug: 'insiderpaper',     tier: 3 },
  { slug: 'disclosetv',       tier: 3 },
  { slug: 'sentdefender',     tier: 3 },
];

/** Fetch the latest N posts from each Bluesky account and convert to Candidates.
 *  Errors are isolated per-account; a single failure does not abort the rest. */
export async function pollBluesky(perAccountLimit = 10): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const agent = new AtpAgent({ service: 'https://public.api.bsky.app' });
  for (const acct of BLUESKY_ACCOUNTS) {
    try {
      const res = await agent.app.bsky.feed.getAuthorFeed({ actor: acct.handle, limit: perAccountLimit });
      for (const item of res.data.feed) {
        const post = item.post;
        const text = (post.record as { text?: string }).text;
        if (!text) continue;
        const ts = (post.record as { createdAt?: string }).createdAt ?? new Date().toISOString();
        const url = `https://bsky.app/profile/${acct.handle}/post/${post.uri.split('/').pop()}`;
        out.push(normalizeCandidate(
          { title: text.slice(0, 280), url, source: `bsky:${acct.handle}`, timestamp: ts },
          null,
          'bluesky',
          { sourceTier: acct.tier },
        ));
      }
    } catch (err) {
      console.warn(`[realtime] bluesky fetch failed for ${acct.handle}:`, (err as Error).message);
    }
  }
  return out;
}

/** Fetch latest messages from each public Telegram channel via the
 *  t.me/s/{slug} preview page (no bot token, public channels only).
 *  Parse the inline message text by lightweight regex; not a full HTML parser. */
export async function pollTelegram(perChannelLimit = 10): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const ch of TELEGRAM_CHANNELS) {
    try {
      const res = await fetch(`https://t.me/s/${encodeURIComponent(ch.slug)}`, {
        headers: { 'User-Agent': 'WatchboardHourlyScan/1.0' },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const html = await res.text();
      // Parse <div class="tgme_widget_message_text"...>TEXT</div> — text-only excerpts
      const re = /<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/g;
      const idRe = /data-post="([^"]+)"/g;
      const ids: string[] = [];
      for (const m of html.matchAll(idRe)) ids.push(m[1]);
      let i = 0;
      for (const m of html.matchAll(re)) {
        if (i >= perChannelLimit) break;
        const raw = m[1].replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').trim();
        if (raw.length < 10) { i++; continue; }
        const id = ids[i] ?? `${ch.slug}-${i}`;
        const url = `https://t.me/${ch.slug}/${id.split('/').pop()}`;
        out.push(normalizeCandidate(
          { title: raw.slice(0, 280), url, source: `tg:${ch.slug}`, timestamp: new Date().toISOString() },
          null,
          'telegram',
          { sourceTier: ch.tier },
        ));
        i++;
      }
    } catch (err) {
      console.warn(`[realtime] telegram fetch failed for ${ch.slug}:`, (err as Error).message);
    }
  }
  return out;
}

/** Convenience: poll both, return unified Candidate[]. */
export async function pollRealtimeSources(): Promise<Candidate[]> {
  const [bsky, tg] = await Promise.all([pollBluesky(), pollTelegram()]);
  return [...bsky, ...tg];
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "realtime-sources"`
Expected: no output.

- [ ] **Step 4: Smoke check (manual; not blocking)**

Run a quick local probe (optional, requires network):
```bash
npx tsx -e "import('./src/lib/realtime-sources.js').then(m => m.pollRealtimeSources()).then(c => console.log(c.length, 'candidates'))"
```
Expect a number ≥ 0. If it errors, the per-source try/catch should still let the function return.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/realtime-sources.ts
git commit -m "feat(scan): bluesky + telegram realtime source pollers"
```

---

## Task 6: Light-scan script

**Files:**
- Create: `scripts/hourly-light-scan.ts`

- [ ] **Step 1: Create `scripts/hourly-light-scan.ts`**

```ts
/**
 * hourly-light-scan.ts
 *
 * Fast 15-min scan: polls a curated subset of high-signal feeds + Bluesky +
 * Telegram, scores each candidate against active trackers via deterministic
 * keyword matching, posts to Telegram on HIGH score (>= 0.85), defers
 * MODERATE (0.5..0.85) to pending-candidates.json for the next heavy scan,
 * and discards LOW (< 0.5) to the audit log.
 *
 * No LLM call — by design, this path is keyword-only.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { XMLParser } from 'fast-xml-parser';
import {
  type Candidate,
  type PendingCandidate,
  type PendingCandidates,
  type TriageLogEntry,
  PATHS,
  loadState,
  saveState,
  normalizeCandidate,
} from './hourly-types.js';
import { buildKeywordIndex, scoreCandidate } from '../src/lib/keyword-match.js';
import { resolveFeedsForActiveTrackers } from '../src/lib/tracker-feeds.js';
import { pollRealtimeSources } from '../src/lib/realtime-sources.js';
import { appendTriageEntries } from '../src/lib/triage-log.js';
import { loadAllTrackers } from '../src/lib/tracker-registry.js';

const HIGH_THRESHOLD     = 0.85;
const MODERATE_THRESHOLD = 0.50;

/** Curated high-signal RSS feeds for the light scan only. The heavy scan
 *  uses the wider list. */
const LIGHT_RSS_FEEDS = [
  { url: 'https://feeds.reuters.com/reuters/worldNews',                  tier: 2 as const, source: 'reuters' },
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                  tier: 2 as const, source: 'bbc' },
  { url: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',        tier: 2 as const, source: 'google-news-en' },
  { url: 'https://news.google.com/rss?hl=es-419&gl=MX&ceid=MX:es-419',   tier: 2 as const, source: 'google-news-mx' },
];

async function pollLightFeeds(): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const parser = new XMLParser({ ignoreAttributes: false });
  for (const f of LIGHT_RSS_FEEDS) {
    try {
      const res = await fetch(f.url, { headers: { 'User-Agent': 'WatchboardLightScan/1.0' } });
      if (!res.ok) continue;
      const xml = await res.text();
      const doc = parser.parse(xml);
      const items: any[] = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [];
      for (const item of items.slice(0, 25)) {
        const title = item.title?.['#text'] ?? item.title ?? '';
        const link  = item.link?.['#text'] ?? item.link ?? item.guid ?? '';
        if (!title || !link || typeof link !== 'string') continue;
        out.push(normalizeCandidate(
          { title: String(title), url: link, source: f.source, timestamp: new Date().toISOString() },
          null,
          'rss',
          { sourceTier: f.tier },
        ));
      }
    } catch (err) {
      console.warn(`[light-scan] rss fetch failed for ${f.url}:`, (err as Error).message);
    }
  }
  return out;
}

function dedup(cands: Candidate[], seenUrls: Set<string>): Candidate[] {
  const fresh: Candidate[] = [];
  for (const c of cands) {
    if (seenUrls.has(c.url)) continue;
    seenUrls.add(c.url);
    fresh.push(c);
  }
  return fresh;
}

function loadPending(path: string): PendingCandidates {
  if (!existsSync(path)) return { version: 1, entries: [] };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as PendingCandidates;
    if (raw.version !== 1 || !Array.isArray(raw.entries)) return { version: 1, entries: [] };
    return raw;
  } catch { return { version: 1, entries: [] }; }
}

function savePending(p: PendingCandidates, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(p, null, 2), 'utf8');
}

async function postTelegram(candidate: Candidate, score: number, trackerSlug: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[light-scan] TELEGRAM_BOT_TOKEN/CHAT_ID missing; skipping post');
    return;
  }
  const text = `⚡ *Breaking* (${trackerSlug}, score ${score.toFixed(2)})\n${candidate.title}\n${candidate.url}`;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: false }),
  });
  if (!res.ok) console.warn('[light-scan] telegram post failed:', await res.text());
}

async function main() {
  const state = loadState();
  const seenUrls = new Set(state.seen.map((s) => s.url));

  const trackers = loadAllTrackers().filter((t) => t.status === 'active');
  if (trackers.length === 0) { console.log('[light-scan] no active trackers'); return; }

  const indexes = trackers.map((t) => ({
    tracker: t,
    index: buildKeywordIndex({ slug: t.slug, keywords: (t as any).keywords, searchContext: (t as any).searchContext }),
  }));

  const [rss, realtime] = await Promise.all([pollLightFeeds(), pollRealtimeSources()]);
  const fresh = dedup([...rss, ...realtime], seenUrls);
  console.log(`[light-scan] ${fresh.length} fresh candidates after dedup`);

  const pending = loadPending(PATHS.pendingCandidates);
  const logEntries: TriageLogEntry[] = [];
  let posted = 0, deferred = 0, discarded = 0;

  for (const cand of fresh) {
    let bestScore = 0;
    let bestSlug = '';
    for (const { tracker, index } of indexes) {
      const s = scoreCandidate(cand, index);
      if (s > bestScore) { bestScore = s; bestSlug = tracker.slug; }
    }

    if (bestScore >= HIGH_THRESHOLD) {
      cand.matchedTracker = bestSlug;
      await postTelegram(cand, bestScore, bestSlug);
      posted++;
      logEntries.push({
        timestamp: new Date().toISOString(), candidate: cand,
        decision: 'update', reason: `light-scan posted directly (score ${bestScore.toFixed(2)})`,
        confidence: bestScore, model: null, scanType: 'light',
      });
    } else if (bestScore >= MODERATE_THRESHOLD) {
      cand.matchedTracker = bestSlug;
      pending.entries.push({ candidate: cand, score: bestScore, recordedAt: new Date().toISOString() });
      deferred++;
      logEntries.push({
        timestamp: new Date().toISOString(), candidate: cand,
        decision: 'defer', reason: `deferred to next heavy scan (score ${bestScore.toFixed(2)})`,
        confidence: bestScore, model: null, scanType: 'light',
      });
    } else {
      discarded++;
      logEntries.push({
        timestamp: new Date().toISOString(), candidate: cand,
        decision: 'discard', reason: `low score (${bestScore.toFixed(2)})`,
        confidence: bestScore, model: null, scanType: 'light',
      });
    }

    state.seen.push({ url: cand.url, tracker: bestSlug || '', eventId: '', ts: new Date().toISOString() });
  }

  savePending(pending, PATHS.pendingCandidates);
  appendTriageEntries(logEntries, PATHS.triageLog);
  state.lastScan = new Date().toISOString();
  saveState(state);

  console.log(`[light-scan] done: posted=${posted} deferred=${deferred} discarded=${discarded}`);
}

main().catch((err) => { console.error('[light-scan] fatal:', err); process.exit(1); });
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "hourly-light-scan"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add scripts/hourly-light-scan.ts
git commit -m "feat(scan): hourly light-scan script (15-min cadence, keyword-only)"
```

---

## Task 7: light-scan workflow

**Files:**
- Create: `.github/workflows/light-scan.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
name: Hourly Light Scan

on:
  schedule:
    - cron: '0,15,30,45 * * * *'   # every 15 minutes
  workflow_dispatch: {}

concurrency:
  group: hourly-light-scan
  cancel-in-progress: true   # if a previous run is still going, kill it

permissions:
  contents: write

jobs:
  scan:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
      - run: npm ci

      - name: Run light scan
        env:
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID:   ${{ secrets.TELEGRAM_CHAT_ID }}
        run: npx tsx scripts/hourly-light-scan.ts

      - name: Commit pending-candidates + triage-log + state
        run: |
          git config user.name  "watchboard-bot"
          git config user.email "bot@watchboard.dev"
          git add public/_hourly/pending-candidates.json public/_hourly/triage-log.json public/_hourly/state.json || true
          if ! git diff --cached --quiet; then
            git commit -m "chore(light-scan): update pending + audit + state $(date -u +%Y-%m-%dT%H:%M:%SZ)"
            # Pull-rebase to absorb concurrent commits before pushing
            for i in 1 2 3; do
              if git pull --rebase origin main && git push origin main; then break; fi
              echo "retry $i"; sleep 5
            done
          fi
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/light-scan.yml
git commit -m "ci: add 15-min light-scan workflow"
```

---

## Task 8: Wire heavy scan to use tracker-feeds + realtime + pending-candidates

**Files:**
- Modify: `scripts/hourly-scan.ts`

- [ ] **Step 1: Add imports at the top of `scripts/hourly-scan.ts` (after existing imports)**

Find the existing import block (around line 7-18) and add:

```ts
import { resolveFeedsForActiveTrackers } from '../src/lib/tracker-feeds.js';
import { pollRealtimeSources } from '../src/lib/realtime-sources.js';
import { loadAllTrackers } from '../src/lib/tracker-registry.js';
```

- [ ] **Step 2: Find the function that returns the RSS feed list**

Look for `GENERAL_RSS_FEEDS` (around line 38). After the `const GENERAL_RSS_FEEDS = [ ... ]` block, add a helper:

```ts
/** Union the static general feeds with dynamic per-tracker feeds. */
function buildFeedList(): string[] {
  const dynamic = resolveFeedsForActiveTrackers(loadAllTrackers());
  const all = new Set<string>([...GENERAL_RSS_FEEDS, ...dynamic.map((d) => d.url)]);
  return [...all];
}
```

- [ ] **Step 3: Replace the references to `GENERAL_RSS_FEEDS` inside the polling loop with `buildFeedList()`**

Find where `GENERAL_RSS_FEEDS` is iterated (look for `for (const feedUrl of GENERAL_RSS_FEEDS)` or similar). Replace with:

```ts
for (const feedUrl of buildFeedList()) {
```

- [ ] **Step 4: After the RSS poll completes, also poll realtime sources and merge in pending-candidates**

Find the location where the candidates are written to `/tmp/hourly-candidates.json`. Just before that write:

```ts
// Realtime: Bluesky + Telegram public channels.
const realtime = await pollRealtimeSources();
candidates.push(...realtime);

// Read deferred candidates the light scans accumulated since the last heavy run.
try {
  const pendingPath = PATHS.pendingCandidates;
  if (existsSync(pendingPath)) {
    const pending = JSON.parse(readFileSync(pendingPath, 'utf8'));
    if (pending?.entries?.length) {
      candidates.push(...pending.entries.map((e: any) => e.candidate));
      // Reset the pending file once consumed
      writeFileSync(pendingPath, JSON.stringify({ version: 1, entries: [] }, null, 2));
    }
  }
} catch (err) {
  console.warn('[hourly-scan] failed to read pending candidates:', (err as Error).message);
}
```

Make sure `existsSync`, `readFileSync`, `writeFileSync`, and `PATHS` are imported at the top of the file (they should already be).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "hourly-scan\.ts"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add scripts/hourly-scan.ts
git commit -m "feat(scan): heavy scan reads dynamic feeds + realtime + pending"
```

---

## Task 9: Make heavy triage write to triage-log

**Files:**
- Modify: `scripts/hourly-triage.ts`

- [ ] **Step 1: Add the import**

At the top of `scripts/hourly-triage.ts`:

```ts
import { appendTriageEntries, pruneTriageLog } from '../src/lib/triage-log.js';
```

- [ ] **Step 2: After the triage results are computed, write them to the audit log**

Find where `TriageResult[]` is finalized (after the LLM response is parsed, before writing the action plan). Add:

```ts
// Persist every decision to the audit log so /breaking-news-audit/ can show
// what was discarded vs accepted.
const logEntries = results.map((r) => ({
  timestamp: new Date().toISOString(),
  candidate: candidates[r.index],
  decision: r.action as 'update' | 'new_tracker' | 'discard',
  reason: r.reason,
  confidence: r.confidence,
  model: MODEL,
  scanType: 'heavy' as const,
}));
appendTriageEntries(logEntries, PATHS.triageLog);
const removed = pruneTriageLog(PATHS.triageLog, 14);
if (removed > 0) console.log(`[triage] pruned ${removed} log entries older than 14 days`);
```

(`MODEL` and `PATHS` already exist in this file; `candidates` and `results` are already in scope at this point.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "hourly-triage\.ts"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add scripts/hourly-triage.ts
git commit -m "feat(triage): persist every decision to triage-log.json"
```

---

## Task 10: Audit page + interactive board

**Files:**
- Create: `src/pages/breaking-news-audit.astro`
- Create: `src/components/islands/TriageLogBoard.tsx`

- [ ] **Step 1: Create the React island `src/components/islands/TriageLogBoard.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { TriageLog, TriageLogEntry } from '../../../scripts/hourly-types';

type Decision = TriageLogEntry['decision'];

interface Props { logUrl: string }

export default function TriageLogBoard({ logUrl }: Props) {
  const [log, setLog] = useState<TriageLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decisionFilter, setDecisionFilter] = useState<Decision | 'all'>('all');
  const [scanFilter, setScanFilter] = useState<'all' | 'light' | 'heavy'>('all');
  const [minScore, setMinScore] = useState(0);

  useEffect(() => {
    fetch(logUrl)
      .then((r) => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((j: TriageLog) => setLog(j))
      .catch((e) => setError(String(e)));
  }, [logUrl]);

  const entries = useMemo(() => {
    if (!log) return [];
    return log.entries
      .filter((e) => decisionFilter === 'all' || e.decision === decisionFilter)
      .filter((e) => scanFilter === 'all' || e.scanType === scanFilter)
      .filter((e) => e.confidence >= minScore)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [log, decisionFilter, scanFilter, minScore]);

  if (error) return <div style={{ color: 'var(--accent-red)' }}>Error loading audit log: {error}</div>;
  if (!log) return <div>Loading…</div>;

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--text-primary, #e6edf3)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <select value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value as Decision | 'all')} style={selectStyle}>
          <option value="all">All decisions</option>
          <option value="update">Update</option>
          <option value="new_tracker">New tracker</option>
          <option value="defer">Defer</option>
          <option value="discard">Discard</option>
        </select>
        <select value={scanFilter} onChange={(e) => setScanFilter(e.target.value as 'all' | 'light' | 'heavy')} style={selectStyle}>
          <option value="all">Both scans</option>
          <option value="light">Light scan only</option>
          <option value="heavy">Heavy scan only</option>
        </select>
        <label style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          Min score:
          <input
            type="range" min={0} max={1} step={0.05}
            value={minScore} onChange={(e) => setMinScore(parseFloat(e.target.value))}
          />
          <span style={{ fontFamily: 'JetBrains Mono, monospace', minWidth: 36 }}>{minScore.toFixed(2)}</span>
        </label>
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted, #8b949e)' }}>
          {entries.length} of {log.entries.length} entries
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entries.length === 0 && <div style={{ opacity: 0.6 }}>No entries match these filters.</div>}
        {entries.slice(0, 200).map((e, i) => (
          <article key={`${e.timestamp}-${i}`} style={{
            background: 'var(--bg-card, #161b22)',
            border: '1px solid var(--border, #30363d)',
            borderLeft: `3px solid ${decisionColor(e.decision)}`,
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: '0.78rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ ...badge, color: decisionColor(e.decision), borderColor: decisionColor(e.decision) }}>
                {e.decision}
              </span>
              <span style={badge}>{e.scanType}</span>
              <span style={{ ...badge, color: 'var(--accent-blue, #58a6ff)' }}>
                {e.confidence.toFixed(2)}
              </span>
              {e.candidate.matchedTracker && (
                <span style={{ ...badge, color: 'var(--text-muted, #8b949e)' }}>
                  → {e.candidate.matchedTracker}
                </span>
              )}
              <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6rem', color: 'var(--text-muted, #8b949e)' }}>
                {e.timestamp.replace('T', ' ').replace(/\..+/, '')}
              </span>
            </div>
            <div style={{ marginBottom: 2 }}>
              <a href={e.candidate.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-primary, #e6edf3)' }}>
                {e.candidate.title}
              </a>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #8b949e)' }}>
              {e.candidate.source} · {e.candidate.feedOrigin} · {e.reason}
            </div>
          </article>
        ))}
        {entries.length > 200 && (
          <div style={{ opacity: 0.6, padding: '8px', textAlign: 'center', fontSize: '0.7rem' }}>
            Showing 200 of {entries.length}. Tighten filters to narrow.
          </div>
        )}
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-secondary, #0d1117)',
  color: 'var(--text-primary, #e6edf3)',
  border: '1px solid var(--border, #30363d)',
  borderRadius: 6,
  padding: '4px 8px',
  fontFamily: 'inherit',
  fontSize: '0.75rem',
};

const badge: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: '0.6rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  border: '1px solid var(--border, #30363d)',
  borderRadius: 4,
  padding: '1px 6px',
  textTransform: 'uppercase',
  color: 'var(--text-muted, #8b949e)',
  background: 'transparent',
};

function decisionColor(d: Decision): string {
  switch (d) {
    case 'update':      return 'var(--accent-green,  #2ecc71)';
    case 'new_tracker': return 'var(--accent-blue,   #58a6ff)';
    case 'defer':       return 'var(--accent-amber,  #f39c12)';
    case 'discard':     return 'var(--text-muted,    #8b949e)';
  }
}
```

- [ ] **Step 2: Create the Astro page `src/pages/breaking-news-audit.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import TriageLogBoard from '../components/islands/TriageLogBoard.tsx';

const base = import.meta.env.BASE_URL;
const basePath = base.endsWith('/') ? base : `${base}/`;
const logUrl = `${basePath}_hourly/triage-log.json`;
---
<BaseLayout title="Breaking News Audit" description="Every triage decision the breaking-news pipeline made in the last 14 days">
  <main id="main-content">
    <div class="audit-page">
      <a class="audit-back" href={`${basePath}about/`}>&larr; About</a>
      <h1>Breaking News Audit</h1>
      <p class="audit-lede">
        Every triage decision the breaking-news pipeline made in the last 14 days. Use this to spot rejected candidates that look like they should have been accepted, and tune thresholds in <code>scripts/hourly-triage.ts</code>.
      </p>
      <TriageLogBoard logUrl={logUrl} client:load />
    </div>
  </main>
</BaseLayout>

<style>
  .audit-page { max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem 4rem; color: var(--text-primary, #e6edf3); }
  .audit-back {
    display: inline-block; margin-bottom: 2rem;
    color: var(--text-muted, #8b949e); text-decoration: none;
    font-size: 0.85rem; font-family: 'DM Sans', sans-serif;
    border: 1px solid var(--border, #30363d); padding: 0.4rem 0.8rem; border-radius: 6px;
    transition: all 0.2s;
  }
  .audit-back:hover { color: var(--text-primary); background: var(--bg-card); }
  h1 { font-family: 'Cormorant Garamond', serif; font-size: 2rem; margin: 0 0 0.5rem; }
  .audit-lede { color: var(--text-secondary, #8b949e); margin-bottom: 1.5rem; max-width: 640px; }
  code {
    font-family: 'JetBrains Mono', monospace; font-size: 0.85em;
    background: var(--bg-secondary, #0d1117);
    border: 1px solid var(--border, #30363d);
    padding: 1px 6px; border-radius: 3px;
  }
</style>
```

- [ ] **Step 3: Type-check + smoke build**

```bash
npx tsc --noEmit 2>&1 | grep -E "TriageLogBoard|breaking-news-audit" || echo "clean"
```
Expected: `clean` (or no output).

- [ ] **Step 4: Commit**

```bash
git add src/pages/breaking-news-audit.astro src/components/islands/TriageLogBoard.tsx
git commit -m "feat(audit): public /breaking-news-audit/ page + interactive board"
```

---

## Task 11: Add link from About + footer + update CLAUDE.md

**Files:**
- Modify: `src/pages/about.astro`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add audit link to the About Roadmap section**

In `src/pages/about.astro`, find the existing Roadmap section. Just below the existing roadmap link paragraph, add:

```astro
        <p>
          The <a href={`${basePath}breaking-news-audit/`}>breaking-news audit page</a> shows every triage decision the hourly + 6-hourly scans made in the last 14 days — useful when calibrating which headlines should reach Telegram.
        </p>
```

- [ ] **Step 2: Add Audit link to the About footer**

Find the footer block:
```astro
      <a href={`${basePath}roadmap/`}>Roadmap</a>
```
Add directly after it:
```astro
      <span>&middot;</span>
      <a href={`${basePath}breaking-news-audit/`}>Audit</a>
```

- [ ] **Step 3: Update CLAUDE.md to register the new pieces**

Find the `### Pages & Routing` section in `CLAUDE.md` and add a line:
```md
- `src/pages/breaking-news-audit.astro` — public audit page for the breaking-news pipeline (reads `public/_hourly/triage-log.json` at runtime)
```

Find the `### Utilities (`src/lib/`)` section and add:
```md
- `tracker-feeds.ts` — `REGION_FEEDS`/`DOMAIN_FEEDS` registry + `resolveFeedsForActiveTrackers()` so adding a tracker auto-extends the breaking-news source list.
- `keyword-match.ts` — `buildKeywordIndex(tracker)` + `scoreCandidate(candidate, index)`. Pure deterministic scoring used by the light scan.
- `triage-log.ts` — append + 14-day prune helpers backing the audit page.
- `realtime-sources.ts` — `pollBluesky()` + `pollTelegram()` returning the same `Candidate` shape as RSS.
```

Find the `### Scripts (`scripts/`)` section and add:
```md
- `hourly-light-scan.ts` — 15-min cron via `.github/workflows/light-scan.yml`. Polls a curated subset + realtime sources, scores via `keyword-match.ts`, posts to Telegram on score ≥ 0.85, defers 0.5–0.85 to `pending-candidates.json`, discards below 0.5. No LLM call.
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/about.astro CLAUDE.md
git commit -m "docs(audit): link audit page from About + update CLAUDE.md"
```

---

## Task 12: Final build gate + manual smoke

**Files:** none modified — verification only.

- [ ] **Step 1: Run all unit tests**

```bash
npx vitest run
```
Expected: previous tests pass + 6 (tracker-feeds) + 7 (keyword-match) + 5 (triage-log) = 18 new tests pass. Pre-existing French translation failures unchanged.

- [ ] **Step 2: Type-check the whole project**

```bash
npx tsc --noEmit 2>&1 | grep -E "(hourly|triage|tracker-feeds|keyword-match|realtime|breaking-news-audit|TriageLogBoard)" | head
```
Expected: no errors in any of the new/modified files. Pre-existing errors in `GlobePanel.tsx` and `SocialCommandCenter.tsx` are out of scope.

- [ ] **Step 3: Build**

```bash
npm run build
```
Expected: succeeds. The new page `dist/breaking-news-audit/index.html` exists.

- [ ] **Step 4: Verify the audit page route + JSON expectation**

```bash
test -f dist/breaking-news-audit/index.html && echo "audit page built"
```
Expected: `audit page built`.

- [ ] **Step 5: Manual workflow dispatch (after PR merge)**

Once merged, manually trigger the new light scan to confirm it runs:
```bash
gh workflow run light-scan.yml
gh run list --workflow=light-scan.yml --limit 1
```
Expect a run within 1 minute, completing in <5 minutes with exit 0.

- [ ] **Step 6: Final commit (only if smoke surfaced something)**

If the smoke pass surfaced a fixable issue, commit the fix. Otherwise this task produces no commit.

---

## Summary

| Task | Output | Tests |
|---|---|---|
| 1  | Extend `hourly-types.ts` (Candidate, Pending, TriageLog) | tsc only |
| 2  | `tracker-feeds.ts` registry + resolver | 6 unit tests |
| 3  | `keyword-match.ts` pure scoring | 7 unit tests |
| 4  | `triage-log.ts` append + prune | 5 unit tests |
| 5  | `realtime-sources.ts` Bluesky + Telegram | manual smoke |
| 6  | `hourly-light-scan.ts` script | manual smoke |
| 7  | `light-scan.yml` workflow | dispatched after merge |
| 8  | `hourly-scan.ts` uses dynamic feeds + realtime + pending | manual smoke |
| 9  | `hourly-triage.ts` writes to triage-log | manual smoke |
| 10 | Audit page + React island | manual smoke |
| 11 | About + CLAUDE.md links | review |
| 12 | Build gate + manual smoke | acceptance |

12 tasks, ~12 commits, 18 new unit tests, ~1500-2000 LOC across 11 files.
