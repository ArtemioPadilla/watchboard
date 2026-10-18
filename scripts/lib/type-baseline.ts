/**
 * type-baseline.ts — a ratchet for `tsc --noEmit`.
 *
 * `npm run build` is `generate-api && copy-cesium && astro build`. It does not
 * type-check, no workflow ran `tsc`, and `npm run check` (`astro check`) dies
 * with "JavaScript heap out of memory" on a project this size — so nothing in
 * CI has ever looked at the types. CLAUDE.md said "Type-check + build" anyway.
 *
 * There are 57 pre-existing errors, most of them in `scripts/update-data.ts`
 * (the legacy updater) and `worker/web-push.ts` (a `Uint8Array<ArrayBufferLike>`
 * vs `BufferSource` lib variance). Fixing all 57 before gating anything would
 * mean the gate never ships; starting the check red means it gets switched off,
 * which is the reasoning already written into lint-workflows.yml for shellcheck.
 *
 * So: record what exists, fail on anything new. The baseline can only shrink.
 *
 * A signature deliberately drops the line and column: an error that moves from
 * line 42 to line 87 because something above it grew is the same error, and a
 * baseline that churns on every edit is a baseline nobody keeps current. Same
 * reason the self-review fingerprints ignore digits.
 */

export interface TypeError {
  file: string;
  line: number;
  col: number;
  code: string;
  message: string;
}

/** `file|TSxxxx|message` — no line or column, so moved code is not a new error. */
export function signatureOf(e: Pick<TypeError, 'file' | 'code' | 'message'>): string {
  return `${e.file}|${e.code}|${e.message}`;
}

const ERROR_LINE = /^(?<file>[^(]+)\((?<line>\d+),(?<col>\d+)\): error (?<code>TS\d+): (?<message>.*)$/;

/**
 * Parse `tsc --noEmit` output. Continuation lines (the indented "Type 'X' is
 * not assignable…" detail) belong to the error above and are skipped: they are
 * not separately addressable, and including them would make a signature depend
 * on wording tsc is free to change between patch releases.
 */
export function parseTscOutput(output: string): TypeError[] {
  const errors: TypeError[] = [];
  for (const raw of output.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line || /^\s/.test(line)) continue;
    const m = ERROR_LINE.exec(line);
    if (!m?.groups) continue;
    errors.push({
      file: m.groups.file,
      line: Number(m.groups.line),
      col: Number(m.groups.col),
      code: m.groups.code,
      message: m.groups.message,
    });
  }
  return errors;
}

export interface BaselineEntry {
  file: string;
  code: string;
  message: string;
  count: number;
}

export interface Baseline {
  /** Why this file exists, for whoever opens it next. */
  note: string;
  total: number;
  entries: BaselineEntry[];
}

export const BASELINE_NOTE =
  'Pre-existing `tsc --noEmit` errors, recorded so CI can fail on new ones. ' +
  'This list may shrink, never grow: fix an error and run `npm run check-types -- --update`.';

/** Group errors into a stable, diff-friendly baseline. */
export function buildBaseline(errors: readonly TypeError[]): Baseline {
  const counts = new Map<string, BaselineEntry>();
  for (const e of errors) {
    const sig = signatureOf(e);
    const existing = counts.get(sig);
    if (existing) existing.count += 1;
    else counts.set(sig, { file: e.file, code: e.code, message: e.message, count: 1 });
  }
  const entries = [...counts.values()].sort(
    (a, b) => a.file.localeCompare(b.file) || a.code.localeCompare(b.code) || a.message.localeCompare(b.message),
  );
  return { note: BASELINE_NOTE, total: errors.length, entries };
}

export interface Comparison {
  /** Errors beyond what the baseline allows — these fail the check. */
  added: TypeError[];
  /** Baseline entries that no longer occur, as `signature → how many fewer`. */
  fixed: Map<string, number>;
  currentTotal: number;
  baselineTotal: number;
}

/**
 * Compare a fresh run against the baseline. An error counts as added only once
 * the file's allowance for that signature is used up, so a second copy of a
 * baselined error in the same file is still caught.
 */
export function compareToBaseline(errors: readonly TypeError[], baseline: Baseline): Comparison {
  const allowance = new Map<string, number>();
  for (const entry of baseline.entries) allowance.set(signatureOf(entry), entry.count);

  const added: TypeError[] = [];
  for (const e of errors) {
    const sig = signatureOf(e);
    const left = allowance.get(sig) ?? 0;
    if (left > 0) allowance.set(sig, left - 1);
    else added.push(e);
  }

  const fixed = new Map<string, number>();
  for (const [sig, left] of allowance) if (left > 0) fixed.set(sig, left);

  return {
    added,
    fixed,
    currentTotal: errors.length,
    baselineTotal: baseline.entries.reduce((n, e) => n + e.count, 0),
  };
}
