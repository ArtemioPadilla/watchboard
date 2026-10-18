import { describe, it, expect } from 'vitest';
import {
  buildBaseline,
  compareToBaseline,
  normalizeMessage,
  parseTscOutput,
  signatureOf,
  type Baseline,
} from '../scripts/lib/type-baseline.js';

// Real `tsc --noEmit` output: two errors in one file, one with the indented
// continuation lines tsc emits for assignability failures.
const TSC_OUTPUT = [
  "scripts/update-data.ts(120,7): error TS2322: Type 'string' is not assignable to type 'number'.",
  "worker/web-push.ts(171,55): error TS2769: No overload matches this call.",
  '  The last overload gave the following error.',
  "    Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable to parameter of type 'BufferSource'.",
  "mcp/server.ts(8,24): error TS2307: Cannot find module './types.js' or its corresponding type declarations.",
  '',
].join('\n');

describe('parseTscOutput', () => {
  it('reads one entry per error line', () => {
    const errors = parseTscOutput(TSC_OUTPUT);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toEqual({
      file: 'scripts/update-data.ts',
      line: 120,
      col: 7,
      code: 'TS2322',
      message: "Type 'string' is not assignable to type 'number'.",
    });
  });

  it('skips the indented continuation lines', () => {
    // Those lines are detail for the error above, not separately fixable, and
    // tsc rewords them between releases.
    expect(parseTscOutput(TSC_OUTPUT).map(e => e.code)).toEqual(['TS2322', 'TS2769', 'TS2307']);
  });

  it('survives CRLF and a clean run', () => {
    expect(parseTscOutput(TSC_OUTPUT.replace(/\n/g, '\r\n'))).toHaveLength(3);
    expect(parseTscOutput('')).toEqual([]);
  });
});

describe('signatureOf', () => {
  it('ignores line and column, so moved code is not a new error', () => {
    const at = (line: number) => ({ file: 'a.ts', line, col: 1, code: 'TS1', message: 'm' });
    expect(signatureOf(at(42))).toBe(signatureOf(at(87)));
  });

  it('separates two different errors in the same file', () => {
    const base = { file: 'a.ts', line: 1, col: 1, code: 'TS1' };
    expect(signatureOf({ ...base, message: 'one' })).not.toBe(signatureOf({ ...base, message: 'two' }));
  });
});

describe('compareToBaseline', () => {
  const baseline = (): Baseline => buildBaseline(parseTscOutput(TSC_OUTPUT));

  it('passes when the run matches the baseline exactly', () => {
    const r = compareToBaseline(parseTscOutput(TSC_OUTPUT), baseline());
    expect(r.added).toEqual([]);
    expect(r.fixed.size).toBe(0);
    expect(r.currentTotal).toBe(3);
    expect(r.baselineTotal).toBe(3);
  });

  it('passes when a baselined error moved to another line', () => {
    const moved = TSC_OUTPUT.replace('(120,7)', '(305,7)');
    expect(compareToBaseline(parseTscOutput(moved), baseline()).added).toEqual([]);
  });

  it('reports a genuinely new error', () => {
    const extra = `${TSC_OUTPUT}src/lib/tier-utils.ts(42,14): error TS2322: Type 'string' is not assignable to type 'number'.\n`;
    const added = compareToBaseline(parseTscOutput(extra), baseline()).added;
    expect(added).toHaveLength(1);
    expect(added[0].file).toBe('src/lib/tier-utils.ts');
  });

  it('reports a SECOND copy of a baselined error in the same file', () => {
    // The count matters: without it, one baselined error would license any
    // number of identical ones, which is how a ratchet quietly stops holding.
    const twice = `${TSC_OUTPUT}scripts/update-data.ts(400,7): error TS2322: Type 'string' is not assignable to type 'number'.\n`;
    expect(compareToBaseline(parseTscOutput(twice), baseline()).added).toHaveLength(1);
  });

  it('names what no longer occurs, without failing', () => {
    const fewer = parseTscOutput(TSC_OUTPUT).filter(e => e.file !== 'mcp/server.ts');
    const r = compareToBaseline(fewer, baseline());
    expect(r.added).toEqual([]);
    expect([...r.fixed.keys()]).toEqual(["mcp/server.ts|TS2307|Cannot find module './types.js' or its corresponding type declarations."]);
  });

  it('treats an empty baseline as "every error is new"', () => {
    const empty: Baseline = { note: '', total: 0, entries: [] };
    expect(compareToBaseline(parseTscOutput(TSC_OUTPUT), empty).added).toHaveLength(3);
  });
});

describe('buildBaseline', () => {
  it('counts duplicates and sorts for a readable diff', () => {
    const dup = `${TSC_OUTPUT}scripts/update-data.ts(400,7): error TS2322: Type 'string' is not assignable to type 'number'.\n`;
    const b = buildBaseline(parseTscOutput(dup));
    expect(b.total).toBe(4);
    expect(b.entries).toHaveLength(3);
    expect(b.entries.map(e => e.file)).toEqual(['mcp/server.ts', 'scripts/update-data.ts', 'worker/web-push.ts']);
    expect(b.entries.find(e => e.file === 'scripts/update-data.ts')?.count).toBe(2);
  });
});

describe('the committed baseline', () => {
  it('is well formed and its total matches its entries', async () => {
    const { readFileSync } = await import('node:fs');
    const b = JSON.parse(readFileSync('types-baseline.json', 'utf8')) as Baseline;
    expect(b.entries.length).toBeGreaterThan(0);
    expect(b.entries.reduce((n, e) => n + e.count, 0)).toBe(b.total);
    // Every entry must be addressable: a baseline row whose file is gone is a
    // row nobody can ever clear.
    const { existsSync } = await import('node:fs');
    for (const e of b.entries) expect(existsSync(e.file), `${e.file} is in the baseline but does not exist`).toBe(true);
  });
});

// tsc prints the members of an anonymous type in whatever order it met them,
// and that order is not stable across machines: this exact error came out of
// CI with `change` and `direction` swapped relative to the local run, so the
// baseline failed to match its own entry and the gate reported one error
// "fixed" and one "new" for the same line of code.
describe('normalizeMessage', () => {
  const LOCAL =
    "Property 'indicator' does not exist on type '{ label: string; source: string; direction: \"down\" | \"up\"; change: string; }'.";
  const CI =
    "Property 'indicator' does not exist on type '{ label: string; source: string; change: string; direction: \"down\" | \"up\"; }'.";

  it('makes the same error match whatever order tsc printed its members in', () => {
    expect(normalizeMessage(LOCAL)).toBe(normalizeMessage(CI));
    const at = (message: string) => ({ file: 'a.ts', code: 'TS2339', message });
    expect(signatureOf(at(LOCAL))).toBe(signatureOf(at(CI)));
  });

  it('keeps what identifies the error', () => {
    expect(normalizeMessage(LOCAL)).toContain("Property 'indicator' does not exist");
    expect(normalizeMessage(LOCAL)).toContain('{…}');
  });

  it('collapses nested object types too', () => {
    expect(normalizeMessage("type '{ a: { b: string; }; }'")).toBe("type '{…}'");
  });

  it('leaves a message with no object type alone', () => {
    const m = "Cannot find module './types.js' or its corresponding type declarations.";
    expect(normalizeMessage(m)).toBe(m);
  });

  it('is what the baseline stores, so the file reads as what is compared', () => {
    const b = buildBaseline([{ file: 'a.ts', line: 1, col: 1, code: 'TS2339', message: LOCAL }]);
    expect(b.entries[0].message).toBe(normalizeMessage(LOCAL));
  });
});
