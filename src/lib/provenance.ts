/**
 * provenance.ts — label generated text by how it was produced.
 *
 * Pure helpers shared by the static ProvenanceBadge, the briefing page and
 * the scripts that stamp `provenance` on digests/meta. Never hides a missing
 * value: "no provenance recorded" is itself a state the reader should see.
 */
import type { Provenance, ProvenanceMethod } from './schemas';

export type ProvenanceKind = 'ai' | 'heuristic' | 'editorial' | 'unknown';

export interface ProvenanceLabel {
  kind: ProvenanceKind;
  /** i18n key for the short badge text. */
  labelKey: 'provenance.ai' | 'provenance.heuristic' | 'provenance.editorial' | 'provenance.unknown';
  /** Model family shown after the label for `ai` (e.g. "Claude"). */
  model?: string;
  /** Short date (e.g. "6 Sep") when known. */
  date?: string;
  /** Full ISO timestamp for the tooltip. */
  generatedAt?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "6 Sep" from an ISO timestamp; undefined for anything unparseable. */
export function shortDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Title-case a model family id: "claude" → "Claude", "claude-sonnet-4" → "Claude Sonnet 4". */
export function displayModel(model: string | undefined): string | undefined {
  if (!model) return undefined;
  const trimmed = model.trim();
  if (!trimmed) return undefined;
  return trimmed
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

export function kindOf(method: ProvenanceMethod | undefined): ProvenanceKind {
  switch (method) {
    case 'llm': return 'ai';
    case 'heuristic': return 'heuristic';
    case 'human': return 'editorial';
    default: return 'unknown';
  }
}

export function describeProvenance(p: Provenance | undefined | null): ProvenanceLabel {
  const kind = kindOf(p?.method);
  const labelKey = (`provenance.${kind}`) as ProvenanceLabel['labelKey'];
  return {
    kind,
    labelKey,
    model: kind === 'ai' ? displayModel(p?.model) : undefined,
    date: shortDate(p?.generatedAt),
    generatedAt: p?.generatedAt,
  };
}

/** Build a provenance stamp for a pipeline write. */
export function makeProvenance(
  method: ProvenanceMethod,
  opts: { model?: string; pipeline?: string; now?: Date } = {},
): Provenance {
  const p: Provenance = { method, generatedAt: (opts.now ?? new Date()).toISOString() };
  if (method === 'llm') p.model = opts.model ?? 'claude';
  if (opts.pipeline) p.pipeline = opts.pipeline;
  return p;
}
