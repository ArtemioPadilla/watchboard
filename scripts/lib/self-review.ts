/**
 * self-review.ts — pure logic behind the periodic repo self-review.
 *
 * A bot that files suggestions without re-checking them makes the backlog
 * worse, not better. This repo has the evidence: #237 listed six trackers as
 * "verified uncovered" that all exist with 35-98 events each, and #238
 * asserted a tracker had "zero coverage" of an event it had carried since
 * July. Both were true when written and quietly stopped being true. Acting
 * on either would have burned roughly sixteen seed runs to add nothing.
 *
 * So the design is: rotate through dimensions so cost stays bounded, require
 * evidence that can be checked mechanically, dedupe against what is already
 * open, and — the part that matters — re-verify previously filed findings
 * every run and retire the ones that no longer hold.
 *
 * Everything here is pure. The clock, the filesystem check and the issue
 * list are injected, so the whole decision path is testable offline.
 */

export interface Dimension {
  id: string;
  title: string;
  enabled?: boolean;
  intervalDays?: number;
  maxFindings?: number;
  maxTurns?: number;
  why?: string;
  prompt: string;
}

export interface Registry {
  defaults?: { intervalDays?: number; maxFindings?: number; maxTurns?: number };
  dimensions: Dimension[];
}

/** Last run per dimension id, ISO timestamps. */
export type ReviewState = Record<string, string>;

export interface Finding {
  dimension: string;
  title: string;
  /** Repo-relative path the finding is about. Required: a finding with no
   *  checkable location cannot be re-verified later, and an unverifiable
   *  finding is exactly what this system exists to avoid producing. */
  file: string;
  line?: number;
  detail: string;
}

export const DAY_MS = 86_400_000;

export function resolved(d: Dimension, reg: Registry): Required<Pick<Dimension, 'intervalDays' | 'maxFindings' | 'maxTurns'>> {
  return {
    intervalDays: d.intervalDays ?? reg.defaults?.intervalDays ?? 14,
    maxFindings: d.maxFindings ?? reg.defaults?.maxFindings ?? 3,
    maxTurns: d.maxTurns ?? reg.defaults?.maxTurns ?? 30,
  };
}

/**
 * Which dimensions are due, oldest-overdue first.
 *
 * `limit` caps how many run in one invocation. One at a time by default:
 * each is a full agent run against the whole repo, and six of those in
 * parallel is a lot of spend for a weekly cron — and would land six batches
 * of issues at once, which is how a helpful bot becomes noise.
 */
export function dueDimensions(reg: Registry, state: ReviewState, now: Date, limit = 1): Dimension[] {
  const t = now.getTime();
  return reg.dimensions
    .filter((d) => d.enabled !== false)
    .map((d) => {
      const last = state[d.id] ? Date.parse(state[d.id]) : NaN;
      const { intervalDays } = resolved(d, reg);
      // Never run: due immediately, and sorts ahead of everything else.
      const overdueBy = Number.isNaN(last) ? Infinity : t - last - intervalDays * DAY_MS;
      return { d, overdueBy };
    })
    .filter((x) => x.overdueBy >= 0)
    .sort((a, b) => b.overdueBy - a.overdueBy)
    .slice(0, limit)
    .map((x) => x.d);
}

/** Stable identity for a finding, used to recognise one already filed. */
export function fingerprint(f: Pick<Finding, 'dimension' | 'file' | 'title'>): string {
  const title = f.title
    .toLowerCase()
    .replace(/[`'"]/g, '')
    .replace(/\b\d+\b/g, '#')   // line numbers and counts drift; the claim does not
    .replace(/\s+/g, ' ')
    .trim();
  return `${f.dimension}|${f.file}|${title}`;
}

/** The marker written into an issue body so a later run can recognise it. */
export function fingerprintMarker(fp: string): string {
  return `<!-- self-review-fp: ${fp} -->`;
}

export function extractFingerprint(body: string): string | null {
  return body.match(/<!-- self-review-fp: (.+?) -->/)?.[1] ?? null;
}

export interface OpenIssue {
  number: number;
  title: string;
  body: string;
}

/**
 * Drops findings already open, and findings whose cited file does not exist.
 *
 * The file check is deliberately strict. A finding pointing at a path that
 * is not there is either hallucinated or already fixed, and either way
 * filing it costs a human the time to discover that.
 */
export function filterFindings(
  findings: Finding[],
  open: OpenIssue[],
  exists: (path: string) => boolean,
  max: number,
): { keep: Finding[]; dropped: Array<{ finding: Finding; reason: string }> } {
  const already = new Set(open.map((i) => extractFingerprint(i.body)).filter(Boolean) as string[]);
  const keep: Finding[] = [];
  const dropped: Array<{ finding: Finding; reason: string }> = [];
  const seen = new Set<string>();

  for (const f of findings) {
    const fp = fingerprint(f);
    if (!f.file || !f.file.trim()) {
      dropped.push({ finding: f, reason: 'no file cited — cannot be re-verified later' });
    } else if (!exists(f.file)) {
      dropped.push({ finding: f, reason: `cited file does not exist: ${f.file}` });
    } else if (already.has(fp)) {
      dropped.push({ finding: f, reason: 'already filed and still open' });
    } else if (seen.has(fp)) {
      dropped.push({ finding: f, reason: 'duplicate within this run' });
    } else if (keep.length >= max) {
      dropped.push({ finding: f, reason: `over the per-run cap of ${max}` });
    } else {
      seen.add(fp);
      keep.push(f);
    }
  }
  return { keep, dropped };
}

/**
 * Previously filed findings whose cited file has since disappeared.
 *
 * These are retired automatically: the thing they point at is gone, so the
 * finding cannot still be describing reality. Findings whose file still
 * exists are left alone — the file being present says nothing about whether
 * the problem was fixed, and guessing would close real work.
 */
export function retirableIssues(open: OpenIssue[], exists: (path: string) => boolean): OpenIssue[] {
  return open.filter((i) => {
    const fp = extractFingerprint(i.body);
    if (!fp) return false;
    const file = fp.split('|')[1];
    return Boolean(file) && !exists(file);
  });
}

export function nextState(state: ReviewState, ran: Dimension[], now: Date): ReviewState {
  const out = { ...state };
  for (const d of ran) out[d.id] = now.toISOString();
  return out;
}
