/**
 * Fetches the top 3 breaking trackers from the Watchboard data directory.
 * Falls back to sample data if the tracker files are unavailable.
 *
 * Supports two scoring modes via VIDEO_MODE env var:
 *   - "conflict" (default): prioritizes breaking news, recent updates, conflict trackers
 *   - "positive": prioritizes trackers with tone="progress"
 *
 * Diversity rules (conflict mode):
 *   - Trackers that appeared in the last 3 days receive a recency penalty (-40)
 *   - Max 2 trackers from the same domain in the final top 3 (domain diversity pick)
 *
 * Usage: npx tsx video/src/data/fetch-breaking.ts
 *        VIDEO_MODE=positive npx tsx video/src/data/fetch-breaking.ts
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SAMPLE_DATA, type BreakingData, type BreakingTracker } from './types.js';

const TRACKERS_DIR = resolve(import.meta.dirname ?? '.', '../../../trackers');
const OUTPUT_PATH = resolve(import.meta.dirname ?? '.', './breaking.json');
const SOCIAL_DIR = resolve(import.meta.dirname ?? '.', '../../../public/_social');

export type VideoMode = 'conflict' | 'positive';

interface TrackerConfig {
  slug: string;
  name: string;
  shortName?: string;
  icon: string;
  status: string;
  tone?: string;
  domain?: string;
  temporal?: string;
  tags?: string[];
  map?: { center?: { lat: number; lon: number } };
}

interface MetaData {
  heroHeadline?: string;
  breaking?: boolean;
  dayCount?: number;
  lastUpdated?: string;
}

interface KpiItem {
  id: string;
  label: string;
  value: string;
  source: string;
}

export interface ScoredCandidate {
  tracker: BreakingTracker;
  score: number;
  breaking: boolean;
  lastUpdated: string;
  tone?: string;
  domain?: string;
  temporal?: string;
  tags?: string[];
  dayCount: number;
}

function parseKpiNumericValue(raw: string): number {
  const cleaned = raw.replace(/[~,+><!]/g, '').trim();
  const match = cleaned.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

function findThumbnailUrls(slug: string): string[] {
  const eventsDir = join(TRACKERS_DIR, slug, 'data', 'events');
  if (!existsSync(eventsDir)) return [];

  const eventFiles = readdirSync(eventsDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, 5);

  const urls: string[] = [];
  for (const file of eventFiles) {
    try {
      const events = JSON.parse(readFileSync(join(eventsDir, file), 'utf-8'));
      if (!Array.isArray(events)) continue;
      for (const event of events) {
        if (Array.isArray(event.media)) {
          for (const item of event.media) {
            if (item.thumbnail) urls.push(item.thumbnail);
          }
        }
      }
    } catch {
      // skip malformed event files
    }
  }

  return [...new Set(urls)];
}

function daysSince(dateStr: string): number {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

/**
 * Reads the slugs that appeared in videos in the last N days.
 * Parses public/_social/video-post-YYYY-MM-DD.json (caption_en contains tracker names,
 * but we prefer to store slugs explicitly — if not present, we skip gracefully).
 *
 * Returns a Map<slug, daysAgo> for the most recent appearance of each slug.
 */
function loadRecentVideoSlugs(lookbackDays: number = 3): Map<string, number> {
  const result = new Map<string, number>();

  if (!existsSync(SOCIAL_DIR)) return result;

  const today = new Date();

  for (let i = 1; i <= lookbackDays; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    // Check both conflict and progress post files
    for (const prefix of ['video-post', 'video-post-progress']) {
      const path = join(SOCIAL_DIR, `${prefix}-${dateStr}.json`);
      if (!existsSync(path)) continue;

      try {
        const post = JSON.parse(readFileSync(path, 'utf-8'));

        // Prefer explicit slugs array (future-proof)
        if (Array.isArray(post.trackerSlugs)) {
          for (const slug of post.trackerSlugs) {
            if (!result.has(slug)) result.set(slug, i);
          }
          continue;
        }

        // Fallback: extract tracker names from caption and try to match slugs
        // We can't reliably reverse-engineer slugs from display names,
        // so we skip this and rely on explicit slugs when available.
        // (The render step will start writing trackerSlugs after this PR.)
      } catch {
        // skip malformed files
      }
    }
  }

  return result;
}

/**
 * Computes a numeric score for a tracker candidate based on the video mode.
 *
 * Returns null if the candidate should be excluded entirely (e.g., wrong domain
 * or excluded tags in positive mode).
 */
export function scoreCandidate(
  candidate: ScoredCandidate,
  mode: VideoMode,
  recentSlugs: Map<string, number> = new Map(),
): number | null {
  const age = daysSince(candidate.lastUpdated);

  if (mode === 'positive') {
    // REQUIRED: tone must be 'progress'
    if (candidate.tone !== 'progress') {
      return null;
    }

    let score = 50; // tone match bonus (always awarded since we passed the check)
    if (age <= 7) score += 30;
    else if (age <= 30) score += 15;
    else if (age <= 90) score += 5;
    if (candidate.temporal === 'live') score += 20;
    if (candidate.breaking) score += 15;
    if (candidate.dayCount > 1000) score += 5;

    // Recency penalty: discourage repeating same tracker
    const daysAgo = recentSlugs.get(candidate.tracker.slug);
    if (daysAgo !== undefined) {
      score -= daysAgo === 1 ? 40 : daysAgo === 2 ? 25 : 10;
    }

    return score;
  }

  // conflict mode (default)
  let score = 0;
  if (candidate.breaking) score += 100;
  if (age <= 1) score += 30;
  else if (age <= 7) score += 15;
  else if (age <= 30) score += 5;
  if (candidate.domain === 'conflict') score += 10;
  if (candidate.temporal === 'live') score += 5;
  if (candidate.dayCount > 0) score += 3;

  // Recency penalty: discourage repeating same tracker within 3 days
  const daysAgo = recentSlugs.get(candidate.tracker.slug);
  if (daysAgo !== undefined) {
    score -= daysAgo === 1 ? 40 : daysAgo === 2 ? 25 : 10;
  }

  return score;
}

interface LoadedTrackerData {
  tracker: BreakingTracker;
  breaking: boolean;
  lastUpdated: string;
  tone?: string;
  domain?: string;
  temporal?: string;
  tags?: string[];
  dayCount: number;
}

function loadTrackerBreaking(slug: string): LoadedTrackerData | null {
  const trackerDir = join(TRACKERS_DIR, slug);
  const configPath = join(trackerDir, 'tracker.json');
  const metaPath = join(trackerDir, 'data', 'meta.json');
  const kpisPath = join(trackerDir, 'data', 'kpis.json');

  if (!existsSync(configPath) || !existsSync(metaPath)) return null;

  try {
    const config: TrackerConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    const meta: MetaData = JSON.parse(readFileSync(metaPath, 'utf-8'));

    if (config.status !== 'active') return null;

    const headline = meta.heroHeadline ?? `${config.shortName ?? config.name} — latest updates`;

    let kpiLabel = 'DAY';
    let kpiValue = meta.dayCount ?? 0;
    let kpiPrefix = '';
    let kpiSuffix = '';
    let sourceLabel = 'Multiple sources';
    let sourceTier: 1 | 2 | 3 | 4 = 2;

    if (existsSync(kpisPath)) {
      const kpis: KpiItem[] = JSON.parse(readFileSync(kpisPath, 'utf-8'));
      if (kpis.length > 0) {
        const topKpi = kpis[0];
        kpiLabel = topKpi.label.toUpperCase();
        kpiValue = parseKpiNumericValue(topKpi.value);
        sourceLabel = topKpi.source.split('/')[0].trim();
      }
    }

    const lat = config.map?.center?.lat ?? 0;
    const lng = config.map?.center?.lon ?? 0;

    const thumbnailUrls = findThumbnailUrls(slug);

    const tracker: BreakingTracker = {
      slug: config.slug,
      name: config.shortName ?? config.name,
      icon: config.icon,
      headline,
      kpiLabel,
      kpiValue,
      kpiPrefix,
      kpiSuffix,
      sourceTier,
      sourceLabel,
      mapCenter: [lat, lng],
      thumbnailUrls,
    };

    const tone = config.tone ?? 'neutral';

    return {
      tracker,
      breaking: meta.breaking === true,
      lastUpdated: meta.lastUpdated ?? '2000-01-01',
      tone,
      domain: config.domain,
      temporal: config.temporal,
      tags: config.tags,
      dayCount: meta.dayCount ?? 0,
    };
  } catch {
    console.warn(`Failed to load tracker: ${slug}`);
    return null;
  }
}

/**
 * Picks the top 3 trackers from a scored list enforcing domain diversity.
 * In conflict mode: max 2 trackers from the same domain.
 * This prevents 3x conflict trackers every single day.
 */
function pickWithDiversity(scored: ScoredCandidate[], mode: VideoMode): ScoredCandidate[] {
  if (mode === 'positive') {
    // Positive mode: tone='progress' already filters, no extra diversity needed
    return scored.slice(0, 3);
  }

  // conflict mode: domain diversity — max 2 from same domain
  const MAX_PER_DOMAIN = 2;
  const domainCount = new Map<string, number>();
  const selected: ScoredCandidate[] = [];

  for (const candidate of scored) {
    if (selected.length >= 3) break;
    const domain = candidate.domain ?? 'unknown';
    const count = domainCount.get(domain) ?? 0;
    if (count >= MAX_PER_DOMAIN) continue;
    domainCount.set(domain, count + 1);
    selected.push(candidate);
  }

  // If diversity reduced us below 3, fill from remaining (relax constraint)
  if (selected.length < 3) {
    const selectedSlugs = new Set(selected.map((c) => c.tracker.slug));
    for (const candidate of scored) {
      if (selected.length >= 3) break;
      if (!selectedSlugs.has(candidate.tracker.slug)) {
        selected.push(candidate);
        selectedSlugs.add(candidate.tracker.slug);
      }
    }
  }

  return selected;
}

export interface FetchBreakingOptions {
  mode?: VideoMode;
  dryRun?: boolean;
}

export function fetchBreakingData(options: FetchBreakingOptions = {}): BreakingData {
  const mode = options.mode ?? 'conflict';
  const dryRun = options.dryRun ?? false;

  if (!existsSync(TRACKERS_DIR)) {
    console.warn('Trackers directory not found, using sample data.');
    return SAMPLE_DATA;
  }

  // Load recent video history for deduplication
  const recentSlugs = loadRecentVideoSlugs(3);
  if (recentSlugs.size > 0) {
    const slugList = [...recentSlugs.entries()].map(([s, d]) => `${s}(${d}d ago)`).join(', ');
    console.log(`[diversity] Recent slugs (last 3 days): ${slugList}`);
  }

  const slugs = readdirSync(TRACKERS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const scored: ScoredCandidate[] = [];

  for (const slug of slugs) {
    const loaded = loadTrackerBreaking(slug);
    if (!loaded) continue;

    const candidate: ScoredCandidate = {
      tracker: loaded.tracker,
      score: 0,
      breaking: loaded.breaking,
      lastUpdated: loaded.lastUpdated,
      tone: loaded.tone,
      domain: loaded.domain,
      temporal: loaded.temporal,
      tags: loaded.tags,
      dayCount: loaded.dayCount,
    };

    const calculatedScore = scoreCandidate(candidate, mode, recentSlugs);
    if (calculatedScore === null) continue; // excluded by mode filter

    candidate.score = calculatedScore;
    scored.push(candidate);
  }

  // Sort by score descending, then by lastUpdated descending as tiebreaker
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return b.lastUpdated.localeCompare(a.lastUpdated);
  });

  if (dryRun) {
    const today = new Date().toISOString().split('T')[0];
    const modeLabel = mode.toUpperCase();
    console.log(`\n=== ${modeLabel} mode (${today}) — top 10 before diversity pick ===`);
    for (let i = 0; i < Math.min(scored.length, 10); i++) {
      const c = scored[i];
      const recentFlag = recentSlugs.has(c.tracker.slug)
        ? ` ⚠️ seen ${recentSlugs.get(c.tracker.slug)}d ago`
        : '';
      console.log(`${i + 1}. ${c.tracker.icon} ${c.tracker.name} — score: ${c.score}${recentFlag}`);
      console.log(`   Domain: ${c.domain ?? 'n/a'} | Updated: ${c.lastUpdated} | Breaking: ${c.breaking}`);
      console.log(`   Headline: ${c.tracker.headline}`);
      console.log('');
    }
    if (scored.length === 0) {
      console.log('  No trackers matched this mode.\n');
    }
  }

  const top3candidates = pickWithDiversity(scored, mode);
  const top3 = top3candidates.map((c) => c.tracker);

  if (dryRun) {
    console.log('=== SELECTED (after diversity pick) ===');
    for (const c of top3candidates) {
      console.log(`  ✅ ${c.tracker.icon} ${c.tracker.name} (domain: ${c.domain ?? 'n/a'}, score: ${c.score})`);
    }
    console.log('');
  }

  if (top3.length === 0) {
    console.warn('No active trackers found, using sample data.');
    return SAMPLE_DATA;
  }

  const today = new Date().toISOString().split('T')[0];
  return { date: today, trackers: top3, totalTrackers: scored.length };
}

// Main execution — only when run directly
const isMain = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('fetch-breaking.ts');

if (isMain) {
  const envMode = (process.env.VIDEO_MODE ?? 'conflict') as VideoMode;
  const mode: VideoMode = envMode === 'positive' ? 'positive' : 'conflict';
  const dryRun = process.argv.includes('--dry-run');

  const data = fetchBreakingData({ mode, dryRun });

  if (!dryRun) {
    const outputDir = resolve(OUTPUT_PATH, '..');
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

    writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2));
    console.log(`Breaking data written to ${OUTPUT_PATH}`);
    console.log(`Date: ${data.date}`);
    console.log(`Mode: ${mode}`);
    console.log(`Trackers: ${data.trackers.map((t) => `${t.icon} ${t.name}`).join(', ')}`);
  }
}
