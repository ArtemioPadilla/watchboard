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
    .replace(/[^a-z0-9\s\u00C0-\u017F]/g, ' ')
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
 * Formula: keyword strength * 0.7 + phrase bonus * 0.1 + tier weight * 0.2
 *  - keyword strength: hits / min(titleTokens.length, 2)
 *  - phrase bonus: 1.0 if any registered phrase appears as a substring; else 0
 *  - tier weight: TIER_WEIGHTS lookup
 *
 * Empty indexes (no keywords AND no searchContext) score 0 unconditionally.
 */
export function scoreCandidate(candidate: Candidate, index: KeywordIndex): number {
  if (index.tokens.size === 0 && index.phrases.length === 0) return 0;
  const titleTokens = tokenize(candidate.title);
  if (titleTokens.length === 0) return 0;

  const hits = titleTokens.filter((t) => index.tokens.has(t)).length;
  // Divisor of 2 — the light scan should reward titles with at least two
  // tracker keywords as a high-confidence signal, regardless of overall
  // title length.
  const keywordStrength = Math.min(1, hits / Math.min(titleTokens.length, 2));

  const titleLower = candidate.title.toLowerCase();
  const phraseHit = index.phrases.some((p) => titleLower.includes(p));
  const phraseBonus = phraseHit ? 1 : 0;

  const tierKey = candidate.sourceTier ?? 'unknown';
  const tierWeight = TIER_WEIGHTS[tierKey];

  // Weighting: keyword hits dominate (0.7) since the light scan's job is
  // detecting tracker-relevant headlines fast; phrase match (0.1) is a
  // mild bonus for matching the full searchContext string; tier (0.2)
  // breaks ties between similar candidates from different sources.
  return Math.min(1, keywordStrength * 0.7 + phraseBonus * 0.1 + tierWeight * 0.2);
}
