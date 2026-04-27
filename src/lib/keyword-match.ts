import type { TrackerConfig } from './tracker-config';
import type { Candidate } from '../../scripts/hourly-types';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'as', 'by', 'is', 'was', 'are', 'be', 'been', 'has', 'have',
]);

/** Tokens this common across the active corpus are stripped from indices —
 *  they're tracker-name boilerplate ("history", "tracker", "war", "2025") and
 *  match almost any headline. Tuned against the actual tracker corpus. */
const COMMON_DF_RATIO = 0.05;

/** Tokens appearing in more trackers than this fraction (but still kept) are
 *  treated as "common" hits at scoring time — they contribute marginally,
 *  preventing geographic boilerplate from manufacturing high scores. */
const SPECIFIC_DF_RATIO = 0.025;

/** Minimum corpus size before df ratios apply. Below this, every kept token
 *  is treated as specific (the matcher behaves like single-tracker mode). */
const MIN_CORPUS_FOR_DF = 4;

/** Phrases under this token count are too short to be discriminative on their
 *  own ("United States", "Elon Musk", "Mexico City") and produce false
 *  positives on geographic mentions. They still seed token hits, but don't
 *  trigger the phrase bonus. */
const MIN_PHRASE_TOKENS = 3;

const TIER_MULT: Record<NonNullable<Candidate['sourceTier']> | 'unknown', number> = {
  1: 1.0,
  2: 0.95,
  3: 0.85,
  unknown: 0.75,
};

export interface KeywordIndex {
  trackerSlug: string;
  /** All tokens drawn from keywords + searchContext. */
  tokens: Set<string>;
  /** Multi-word phrases (>= MIN_PHRASE_TOKENS tokens). */
  phrases: string[];
}

export interface ScoreDetail {
  score: number;
  /** Distinct title tokens that hit a low-DF (specific) tracker token. */
  specificHits: number;
  /** Distinct title tokens that hit a higher-DF (common) tracker token. */
  commonHits: number;
  /** Number of long phrases from the index that appear in the title. */
  phraseHits: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\sÀ-ſ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

type TrackerLike = Pick<TrackerConfig, 'slug'> & { keywords?: string[]; searchContext?: string };

function rawIndex(tracker: TrackerLike): { tokens: Set<string>; phrases: string[] } {
  const tokens = new Set<string>();
  const phrases: string[] = [];
  const sources: string[] = [];
  if (tracker.keywords?.length) sources.push(...tracker.keywords);
  if (tracker.searchContext) sources.push(tracker.searchContext);
  for (const s of sources) {
    tokenize(s).forEach((t) => tokens.add(t));
    const norm = s.trim().toLowerCase();
    if (tokenize(norm).length >= MIN_PHRASE_TOKENS) phrases.push(norm);
  }
  return { tokens, phrases };
}

/**
 * Build per-tracker indices with corpus-aware document frequency. Tokens
 * appearing in > COMMON_DF_RATIO of trackers are stripped (they're noise);
 * tokens above SPECIFIC_DF_RATIO are kept but flagged "common" at scoring time.
 *
 * Use this in production. The single-tracker buildKeywordIndex() is kept for
 * tests and tools that don't have the full corpus.
 */
export function buildKeywordIndices(trackers: TrackerLike[]): Map<string, KeywordIndex> {
  const raws = new Map<string, { tokens: Set<string>; phrases: string[] }>();
  const df = new Map<string, number>();
  for (const t of trackers) {
    const r = rawIndex(t);
    raws.set(t.slug, r);
    for (const tok of r.tokens) df.set(tok, (df.get(tok) ?? 0) + 1);
  }
  const n = trackers.length || 1;
  // Floor at 1 so unique tokens are never stripped, regardless of corpus size.
  const stripAt = Math.max(1, n * COMMON_DF_RATIO);
  const out = new Map<string, KeywordIndex>();
  for (const t of trackers) {
    const r = raws.get(t.slug)!;
    const filtered = new Set<string>();
    for (const tok of r.tokens) {
      if ((df.get(tok) ?? 0) <= stripAt) filtered.add(tok);
    }
    out.set(t.slug, { trackerSlug: t.slug, tokens: filtered, phrases: r.phrases });
  }
  // Stash df on the map itself so scoreCandidate can resolve specific vs common
  (out as unknown as { __df: Map<string, number>; __n: number }).__df = df;
  (out as unknown as { __df: Map<string, number>; __n: number }).__n = n;
  return out;
}

/**
 * Build a single-tracker index. NO corpus awareness — every kept token is
 * treated as specific. Use buildKeywordIndices() in production.
 */
export function buildKeywordIndex(tracker: TrackerLike): KeywordIndex {
  const r = rawIndex(tracker);
  return { trackerSlug: tracker.slug, tokens: r.tokens, phrases: r.phrases };
}

/**
 * Score a candidate against a tracker index. Returns a ScoreDetail so callers
 * can route on substance (specificHits, phraseHits), not just the scalar
 * score. Empty indices return zero unconditionally.
 *
 * Formula (all components in [0, 1] before tier multiplier):
 *   match = clamp(specificHits / 3, 0, 1) * 0.55
 *         + clamp(phraseHits, 0, 1)      * 0.30
 *         + clamp(commonHits / 4, 0, 1)  * 0.10
 *   score = match * tierMult
 *
 * Tier weight is multiplicative: a candidate with no matched tokens scores 0,
 * not the tier floor. Common tokens (high DF) contribute marginally so that
 * long lists of generic terms can't manufacture a high score.
 */
export function scoreCandidateDetailed(
  candidate: Candidate,
  index: KeywordIndex,
  corpus?: Map<string, KeywordIndex>,
): ScoreDetail {
  if (index.tokens.size === 0 && index.phrases.length === 0) {
    return { score: 0, specificHits: 0, commonHits: 0, phraseHits: 0 };
  }
  const titleTokens = tokenize(candidate.title);
  if (titleTokens.length === 0) {
    return { score: 0, specificHits: 0, commonHits: 0, phraseHits: 0 };
  }
  const distinct = new Set(titleTokens);

  const cdf = (corpus as unknown as { __df?: Map<string, number>; __n?: number } | undefined);
  const df = cdf?.__df;
  const n = cdf?.__n ?? 0;
  const useDf = !!df && n >= MIN_CORPUS_FOR_DF;
  // Treat any token appearing in at most `specificCutoff` trackers as specific.
  // Floor at 1 so a unique token is always specific even in a tiny corpus.
  const specificCutoff = Math.max(1, Math.floor(n * SPECIFIC_DF_RATIO));

  let specificHits = 0;
  let commonHits = 0;
  for (const tok of distinct) {
    if (!index.tokens.has(tok)) continue;
    if (!useDf) { specificHits++; continue; }
    const tokDf = df!.get(tok) ?? 1;
    if (tokDf <= specificCutoff) specificHits++;
    else commonHits++;
  }

  const titleLower = candidate.title.toLowerCase();
  const phraseHits = index.phrases.reduce(
    (acc, p) => (titleLower.includes(p) ? acc + 1 : acc),
    0,
  );

  // Match in [0, 1]: 3 distinct specific hits saturates; phrases add up to
  // 0.3; common tokens contribute marginally (0.10 cap) so geo boilerplate
  // can't push past the threshold on its own.
  const match = Math.min(
    1,
    Math.min(1, specificHits / 3) +
      Math.min(1, phraseHits) * 0.3 +
      Math.min(1, commonHits / 4) * 0.1,
  );

  const tierKey = candidate.sourceTier ?? 'unknown';
  const tierMult = TIER_MULT[tierKey];

  return {
    score: Math.min(1, match * tierMult),
    specificHits,
    commonHits,
    phraseHits,
  };
}

/** Back-compat scalar score wrapper. */
export function scoreCandidate(
  candidate: Candidate,
  index: KeywordIndex,
  corpus?: Map<string, KeywordIndex>,
): number {
  return scoreCandidateDetailed(candidate, index, corpus).score;
}
