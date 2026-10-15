import { describe, it, expect } from 'vitest';
import {
  dueDimensions, fingerprint, fingerprintMarker, extractFingerprint,
  filterFindings, retirableIssues, nextState, resolved, DAY_MS,
  type Registry, type Finding, type OpenIssue,
} from '../scripts/lib/self-review';
import { readFileSync } from 'fs';

const reg: Registry = {
  defaults: { intervalDays: 14, maxFindings: 3, maxTurns: 30 },
  dimensions: [
    { id: 'a', title: 'A', prompt: 'p', intervalDays: 7 },
    { id: 'b', title: 'B', prompt: 'p' },
    { id: 'c', title: 'C', prompt: 'p', enabled: false },
  ],
};
const NOW = new Date('2026-10-15T00:00:00Z');
const ago = (d: number) => new Date(NOW.getTime() - d * DAY_MS).toISOString();

describe('resolved', () => {
  it('falls back to registry defaults', () => {
    expect(resolved(reg.dimensions[1], reg)).toEqual({ intervalDays: 14, maxFindings: 3, maxTurns: 30 });
  });
  it('lets a dimension override', () => {
    expect(resolved(reg.dimensions[0], reg).intervalDays).toBe(7);
  });
});

describe('dueDimensions', () => {
  it('runs one at a time by default', () => {
    // Six agent runs in one cron would be a lot of spend and would land six
    // batches of issues at once.
    expect(dueDimensions(reg, {}, NOW)).toHaveLength(1);
  });

  it('treats a never-run dimension as most overdue', () => {
    expect(dueDimensions(reg, { a: ago(0) }, NOW, 5).map((d) => d.id)).toEqual(['b']);
  });

  it('skips dimensions that are not due yet', () => {
    expect(dueDimensions(reg, { a: ago(3), b: ago(3) }, NOW, 5)).toEqual([]);
  });

  it('orders by how overdue, not by registry order', () => {
    const ids = dueDimensions(reg, { a: ago(30), b: ago(100) }, NOW, 5).map((d) => d.id);
    expect(ids).toEqual(['b', 'a']);
  });

  it('never runs a disabled dimension', () => {
    expect(dueDimensions(reg, {}, NOW, 99).map((d) => d.id)).not.toContain('c');
  });

  it('honours the per-dimension interval', () => {
    // a is 7 days, b is the 14-day default; at 10 days only a is due.
    expect(dueDimensions(reg, { a: ago(10), b: ago(10) }, NOW, 5).map((d) => d.id)).toEqual(['a']);
  });
});

describe('fingerprint', () => {
  it('ignores line-number drift so a moved finding is not refiled', () => {
    expect(fingerprint({ dimension: 'd', file: 'a.ts', title: 'Step at line 42 is wrong' }))
      .toBe(fingerprint({ dimension: 'd', file: 'a.ts', title: 'Step at line 87 is wrong' }));
  });
  it('separates the same claim in different files', () => {
    expect(fingerprint({ dimension: 'd', file: 'a.ts', title: 'x' }))
      .not.toBe(fingerprint({ dimension: 'd', file: 'b.ts', title: 'x' }));
  });
  it('round-trips through the issue-body marker', () => {
    const fp = fingerprint({ dimension: 'd', file: 'a.ts', title: 'x' });
    expect(extractFingerprint(`body\n${fingerprintMarker(fp)}\nmore`)).toBe(fp);
  });
  it('returns null when there is no marker', () => {
    expect(extractFingerprint('an ordinary human issue')).toBeNull();
  });
});

describe('filterFindings', () => {
  const f = (over: Partial<Finding> = {}): Finding =>
    ({ dimension: 'd', title: 't', file: 'exists.ts', detail: 'x', ...over });
  const exists = (p: string) => p.startsWith('exists');

  it('drops a finding whose cited file is not there', () => {
    // Hallucinated or already fixed; either way it costs a human to find out.
    const r = filterFindings([f({ file: 'gone.ts' })], [], exists, 5);
    expect(r.keep).toHaveLength(0);
    expect(r.dropped[0].reason).toMatch(/does not exist/);
  });

  it('requires a file at all', () => {
    const r = filterFindings([f({ file: '' })], [], exists, 5);
    expect(r.dropped[0].reason).toMatch(/no file cited/);
  });

  it('does not refile something already open', () => {
    const fp = fingerprint(f());
    const open: OpenIssue[] = [{ number: 1, title: 't', body: fingerprintMarker(fp) }];
    expect(filterFindings([f()], open, exists, 5).keep).toHaveLength(0);
  });

  it('collapses duplicates inside one run', () => {
    expect(filterFindings([f(), f()], [], exists, 5).keep).toHaveLength(1);
  });

  it('enforces the per-run cap and says so', () => {
    const many = [f({ title: 'commit with nothing staged' }), f({ title: 'guard always true' }), f({ title: 'swallowed fetch error' })];
    const r = filterFindings(many, [], exists, 2);
    expect(r.keep).toHaveLength(2);
    expect(r.dropped[0].reason).toMatch(/cap of 2/);
  });

  it('treats two findings differing only by a number as one claim', () => {
    // Intentional: the fingerprint strips digits so a finding that moves
    // from line 42 to line 87 is not filed a second time. The cost is that
    // "3 tests missing" and "40 tests missing" collapse too, which is the
    // behaviour we want — it is the same claim.
    const r = filterFindings(
      [f({ title: 'step 3 runs too early' }), f({ title: 'step 11 runs too early' })],
      [], exists, 5,
    );
    expect(r.keep).toHaveLength(1);
    expect(r.dropped[0].reason).toMatch(/duplicate/);
  });
});

describe('retirableIssues', () => {
  const mk = (n: number, file: string): OpenIssue =>
    ({ number: n, title: 't', body: fingerprintMarker(`dim|${file}|t`) });

  it('retires a finding whose file is gone', () => {
    expect(retirableIssues([mk(1, 'gone.ts')], (p) => p === 'here.ts').map((i) => i.number))
      .toEqual([1]);
  });

  it('leaves a finding alone while its file still exists', () => {
    // The file being present says nothing about whether the problem was
    // fixed; guessing would close real work.
    expect(retirableIssues([mk(1, 'here.ts')], (p) => p === 'here.ts')).toEqual([]);
  });

  it('never touches an issue a human filed', () => {
    const human: OpenIssue = { number: 9, title: 'real bug', body: 'no marker here' };
    expect(retirableIssues([human], () => false)).toEqual([]);
  });
});

describe('nextState', () => {
  it('stamps only the dimensions that ran', () => {
    const s = nextState({ a: ago(30), b: ago(30) }, [reg.dimensions[0]], NOW);
    expect(s.a).toBe(NOW.toISOString());
    expect(s.b).toBe(ago(30));
  });
});

describe('the shipped registry', () => {
  const real: Registry = JSON.parse(readFileSync('self-review/dimensions.json', 'utf8'));

  it('parses and every dimension has what the runner needs', () => {
    expect(real.dimensions.length).toBeGreaterThan(0);
    for (const d of real.dimensions) {
      expect(d.id, 'id').toBeTruthy();
      expect(d.prompt.length, `${d.id} prompt`).toBeGreaterThan(80);
      expect(d.why, `${d.id} must say why it earns a slot`).toBeTruthy();
    }
  });

  it('has unique ids, since they key the state file', () => {
    const ids = real.dimensions.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cannot file an unbounded number of issues in one run', () => {
    for (const d of real.dimensions) {
      expect(resolved(d, real).maxFindings).toBeLessThanOrEqual(6);
    }
  });

  it('rotates rather than firing everything at once', () => {
    // With empty state everything is due; the runner must still take one.
    expect(dueDimensions(real, {}, NOW)).toHaveLength(1);
  });
});
