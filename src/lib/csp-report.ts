/**
 * csp-report.ts — turns CSP violations into PostHog events.
 *
 * Why this exists: `report-uri` and `report-to` are *ignored* in a `<meta>`
 * element, and GitHub Pages serves no CSP header (verified: `server:
 * GitHub.com`, no CDN in front). So the standard reporting channel is not
 * available to this site at all. Until a CDN fronts Pages, the only way to
 * learn about a violation in production is to listen for it in the page and
 * send it to a sink we already have — PostHog, which is already in
 * `connect-src`. See #241.
 *
 * This matters because `scripts/csp-hashes.ts` now strips 'unsafe-inline'
 * and pins each page's inline scripts by hash. That is strictly stronger,
 * and it also means a build change can silently *break* a page: a rewritten
 * inline script whose hash was not recomputed is refused by the browser and
 * nothing in CI notices. A violation feed is what makes that visible.
 *
 * Split in two on purpose. The listener must be registered during initial
 * parse, because the violations most likely to matter are inline-script
 * refusals that happen before any module script has run — so a minimal
 * inline buffer in BaseLayout collects raw events, and this module (bundled,
 * deferred) drains it. Keeping the logic here rather than in the inline
 * string is what makes it testable.
 *
 * Pure except for `installCspReporter`; clock, queue and sink are injected.
 */

/** A raw event as the inline buffer in BaseLayout records it. */
export interface RawViolation {
  effectiveDirective?: string;
  violatedDirective?: string;
  blockedURI?: string;
  documentURI?: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
  sample?: string;
  disposition?: string;
}

/** The flattened, privacy-reviewed shape sent to the sink. */
export interface ViolationReport {
  directive: string;
  blocked_uri: string;
  document_path: string;
  source_file: string;
  line: number;
  column: number;
  sample: string;
  disposition: string;
}

/** Distinct violations reported per page load. A single bad script can fire
 *  hundreds of identical events; this site's analytics budget is ~$1/month. */
export const MAX_REPORTS_PER_PAGE = 10;

/** How often the drainer empties the inline buffer. */
export const DRAIN_INTERVAL_MS = 2000;

/**
 * When the periodic drain gives up. A self-hosted build with no PostHog key
 * has no sink at all, and polling forever would leave a timer on every page
 * for the whole visit to no purpose. The `pagehide` flush stays armed after
 * this, so a late violation is still reported if a sink does exist.
 */
export const DRAIN_WINDOW_MS = 120_000;

const SAMPLE_MAX = 80;

/**
 * Browser-extension schemes. An extension injecting a script into the page
 * trips our policy, but it is the reader's extension, not our bug — and
 * which extensions a reader runs is not ours to collect either.
 */
const EXTENSION_SCHEME_RE = /^(chrome|moz|safari-web|safari|webkit|ms-browser)-extension:/i;

/**
 * Drops query string and fragment from a URI, keeping scheme/host/path.
 *
 * Keyword tokens like `inline`, `eval` and `data` are not URLs and are
 * returned untouched. Query strings are dropped because a blocked URL can
 * carry whatever the page put in it, and personal data must never leave in
 * a query parameter.
 */
export function stripQuery(uri: string | undefined): string {
  if (!uri) return '';
  const cut = uri.search(/[?#]/);
  return cut === -1 ? uri : uri.slice(0, cut);
}

/** Flattens a raw event, dropping everything not needed to fix the cause. */
export function normalizeViolation(raw: RawViolation): ViolationReport {
  return {
    directive: raw.effectiveDirective || raw.violatedDirective || 'unknown',
    blocked_uri: stripQuery(raw.blockedURI),
    // Path only: this site encodes shareable view state in the query string
    // (see view-state.ts), which has no diagnostic value and bloats events.
    document_path: stripQuery(raw.documentURI),
    source_file: stripQuery(raw.sourceFile),
    line: typeof raw.lineNumber === 'number' ? raw.lineNumber : 0,
    column: typeof raw.columnNumber === 'number' ? raw.columnNumber : 0,
    sample: (raw.sample || '').slice(0, SAMPLE_MAX),
    disposition: raw.disposition || 'enforce',
  };
}

/** True when the violation is ours to care about. */
export function isReportable(r: ViolationReport): boolean {
  if (EXTENSION_SCHEME_RE.test(r.blocked_uri)) return false;
  if (EXTENSION_SCHEME_RE.test(r.source_file)) return false;
  return true;
}

/**
 * Dedupe key. Line and column are included: two different inline scripts on
 * one page both report `blocked_uri: "inline"`, and collapsing them would
 * hide one of the two causes.
 */
export function dedupeKey(r: ViolationReport): string {
  return [r.directive, r.blocked_uri, r.source_file, r.line, r.column].join('|');
}

/** Empties the shared buffer and returns what was in it. */
export function drainQueue(queue: RawViolation[]): RawViolation[] {
  return queue.splice(0, queue.length);
}

export interface ReporterOptions {
  /** The buffer the inline script pushes into. */
  queue: RawViolation[];
  /** Where reports go. Returning nothing is fine. */
  capture: (event: string, props: ViolationReport) => void;
  /** Guard: skip the flush while the sink is not ready yet. */
  ready?: () => boolean;
  maxReports?: number;
}

/**
 * Stateful drainer. `flush()` is safe to call as often as you like: it
 * dedupes against everything already sent and stops at `maxReports`.
 *
 * Nothing is dropped while the sink is not ready — unflushed events stay in
 * `pending` and go out on the next flush. PostHog here initialises inside
 * `requestIdleCallback`, so the first violations of a page load routinely
 * arrive before there is anywhere to send them.
 */
export function createReporter(opts: ReporterOptions) {
  const { queue, capture, ready, maxReports = MAX_REPORTS_PER_PAGE } = opts;
  const seen = new Set<string>();
  let pending: ViolationReport[] = [];
  let sent = 0;

  function flush(): number {
    for (const raw of drainQueue(queue)) {
      const report = normalizeViolation(raw);
      if (!isReportable(report)) continue;
      const key = dedupeKey(report);
      if (seen.has(key)) continue;
      seen.add(key);
      pending.push(report);
    }
    if (ready && !ready()) return 0;

    let flushed = 0;
    const carry: ViolationReport[] = [];
    for (const report of pending) {
      if (sent >= maxReports) break;
      try {
        capture('csp_violation', report);
        sent++;
        flushed++;
      } catch {
        // Sink threw (offline, blocked beacon). Keep it for the next pass
        // rather than losing the only record of the violation.
        carry.push(report);
      }
    }
    pending = carry;
    return flushed;
  }

  return {
    flush,
    get sentCount() { return sent; },
    get pendingCount() { return pending.length; },
  };
}

/**
 * Wires the drainer to the live page: periodic flush plus a last flush on
 * `pagehide`, which is the only reliable end-of-page hook on mobile Safari.
 * No-ops outside the browser so SSR can import this module freely.
 */
export function installCspReporter(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const w = window as unknown as {
    __cspViolations?: RawViolation[];
    posthog?: { capture?: (e: string, p: unknown) => void };
  };
  const queue = w.__cspViolations;
  if (!Array.isArray(queue)) return;

  const hasPosthog = () => typeof w.posthog?.capture === 'function';
  const reporter = createReporter({
    queue,
    ready: () => hasPosthog() || import.meta.env.DEV,
    capture: (event, props) => {
      if (hasPosthog()) {
        w.posthog!.capture!(event, props);
        return;
      }
      // Local dev has no PostHog key. Before this, the only way to see a
      // violation was to drive the page with Playwright by hand.
      if (import.meta.env.DEV) console.warn('[csp] violation', props);
    },
  });

  const timer = setInterval(() => {
    reporter.flush();
    if (reporter.sentCount >= MAX_REPORTS_PER_PAGE) clearInterval(timer);
  }, DRAIN_INTERVAL_MS);
  setTimeout(() => clearInterval(timer), DRAIN_WINDOW_MS);

  window.addEventListener('pagehide', () => reporter.flush());
  reporter.flush();
}
