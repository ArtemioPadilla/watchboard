import { describe, it, expect } from 'vitest';
import {
  stripQuery,
  normalizeViolation,
  isReportable,
  dedupeKey,
  drainQueue,
  createReporter,
  MAX_REPORTS_PER_PAGE,
  type RawViolation,
  type ViolationReport,
} from '../src/lib/csp-report';

const raw = (over: Partial<RawViolation> = {}): RawViolation => ({
  effectiveDirective: 'script-src-elem',
  blockedURI: 'inline',
  documentURI: 'https://watchboard.dev/iran-conflict/',
  sourceFile: 'https://watchboard.dev/iran-conflict/',
  lineNumber: 42,
  columnNumber: 7,
  sample: 'console.log(1)',
  disposition: 'enforce',
  ...over,
});

describe('stripQuery', () => {
  it('drops the query string and the fragment', () => {
    expect(stripQuery('https://x.test/a?b=1#c')).toBe('https://x.test/a');
    expect(stripQuery('https://x.test/a#c')).toBe('https://x.test/a');
  });

  it('leaves keyword tokens and bare paths alone', () => {
    expect(stripQuery('inline')).toBe('inline');
    expect(stripQuery('eval')).toBe('eval');
    expect(stripQuery('https://x.test/a')).toBe('https://x.test/a');
  });

  it('is total on missing input', () => {
    expect(stripQuery(undefined)).toBe('');
  });
});

describe('normalizeViolation', () => {
  it('never carries a query string off the page', () => {
    // This site puts shareable view state in the query (view-state.ts); a
    // report must not become a channel for it.
    const r = normalizeViolation(
      raw({ documentURI: 'https://watchboard.dev/x/?lat=1&lon=2&event=abc' }),
    );
    expect(r.document_path).toBe('https://watchboard.dev/x/');
    expect(JSON.stringify(r)).not.toContain('lat=');
  });

  it('falls back to violatedDirective, then to unknown', () => {
    expect(
      normalizeViolation(raw({ effectiveDirective: undefined, violatedDirective: 'img-src' }))
        .directive,
    ).toBe('img-src');
    expect(
      normalizeViolation(raw({ effectiveDirective: undefined, violatedDirective: undefined }))
        .directive,
    ).toBe('unknown');
  });

  it('truncates the sample and tolerates missing numbers', () => {
    const r = normalizeViolation(
      raw({ sample: 'x'.repeat(500), lineNumber: undefined, columnNumber: undefined }),
    );
    expect(r.sample.length).toBe(80);
    expect(r.line).toBe(0);
    expect(r.column).toBe(0);
  });
});

describe('isReportable', () => {
  it('ignores browser-extension noise from either field', () => {
    const fromExt = normalizeViolation(raw({ blockedURI: 'chrome-extension://abc/inject.js' }));
    expect(isReportable(fromExt)).toBe(false);
    const extSource = normalizeViolation(raw({ sourceFile: 'moz-extension://abc/x.js' }));
    expect(isReportable(extSource)).toBe(false);
  });

  it('keeps real violations', () => {
    expect(isReportable(normalizeViolation(raw()))).toBe(true);
    expect(isReportable(normalizeViolation(raw({ blockedURI: 'https://evil.test/x.js' })))).toBe(
      true,
    );
  });
});

describe('dedupeKey', () => {
  it('separates two different inline scripts on one page', () => {
    // Both report blocked_uri "inline"; collapsing them would hide a cause.
    const a = normalizeViolation(raw({ lineNumber: 10 }));
    const b = normalizeViolation(raw({ lineNumber: 99 }));
    expect(dedupeKey(a)).not.toBe(dedupeKey(b));
  });
});

describe('drainQueue', () => {
  it('empties the array in place so the inline buffer regains capacity', () => {
    const q = [raw(), raw()];
    expect(drainQueue(q)).toHaveLength(2);
    expect(q).toHaveLength(0);
  });
});

describe('createReporter', () => {
  const sink = () => {
    const sent: ViolationReport[] = [];
    return { sent, capture: (_e: string, p: ViolationReport) => void sent.push(p) };
  };

  it('reports each distinct violation once across repeated flushes', () => {
    const q: RawViolation[] = [raw(), raw(), raw({ lineNumber: 2 })];
    const s = sink();
    const r = createReporter({ queue: q, capture: s.capture });
    expect(r.flush()).toBe(2);
    q.push(raw());
    expect(r.flush()).toBe(0);
    expect(s.sent).toHaveLength(2);
  });

  it('holds events until the sink is ready instead of dropping them', () => {
    // PostHog initialises inside requestIdleCallback, so the first
    // violations of a page load arrive with nowhere to go.
    const q: RawViolation[] = [raw()];
    const s = sink();
    let ready = false;
    const r = createReporter({ queue: q, capture: s.capture, ready: () => ready });
    expect(r.flush()).toBe(0);
    expect(r.pendingCount).toBe(1);
    ready = true;
    expect(r.flush()).toBe(1);
    expect(s.sent).toHaveLength(1);
  });

  it('caps reports per page load', () => {
    const q = Array.from({ length: 50 }, (_, i) => raw({ lineNumber: i }));
    const s = sink();
    const r = createReporter({ queue: q, capture: s.capture });
    r.flush();
    r.flush();
    expect(s.sent).toHaveLength(MAX_REPORTS_PER_PAGE);
    expect(r.sentCount).toBe(MAX_REPORTS_PER_PAGE);
  });

  it('retains a report whose send threw', () => {
    const q: RawViolation[] = [raw()];
    let fail = true;
    const r = createReporter({
      queue: q,
      capture: () => {
        if (fail) throw new Error('beacon blocked');
      },
    });
    expect(r.flush()).toBe(0);
    expect(r.pendingCount).toBe(1);
    fail = false;
    expect(r.flush()).toBe(1);
    expect(r.pendingCount).toBe(0);
  });
});
