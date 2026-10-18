/**
 * `MapLineSchema` is `z.object({...}).superRefine(...)`, so it is a ZodEffects:
 * no `.omit()`, no `.extend()`, no `.shape`. Two scripts were written from each
 * other and both called `MapLineSchema.omit({ lastUpdated: true })`, which is
 * not a function — so the map-lines path of `npm run backfill` and of the
 * legacy `npm run update-data` threw the moment a payload carried lines.
 * Fourteen of the type baseline's errors were a single instance of it.
 *
 * `MapLineFieldsSchema` exists for the object operations. These tests pin both
 * halves: the constraint, and that nothing reaches for it on the wrong one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MapLineSchema, MapLineFieldsSchema } from '../src/lib/schemas.js';

describe('MapLineSchema and its field schema', () => {
  it('the refined schema has no object operations — this is the trap', () => {
    const refined = MapLineSchema as unknown as Record<string, unknown>;
    expect(typeof refined.omit).toBe('undefined');
    expect(typeof refined.extend).toBe('undefined');
    expect(refined.shape).toBeUndefined();
  });

  it('the field schema has them', () => {
    expect(typeof MapLineFieldsSchema.omit).toBe('function');
    expect(typeof MapLineFieldsSchema.extend).toBe('function');
    expect(Object.keys(MapLineFieldsSchema.shape).length).toBeGreaterThan(10);
    expect(Object.keys(MapLineFieldsSchema.omit({ lastUpdated: true }).shape)).not.toContain('lastUpdated');
  });

  it('still enforces the cross-field rule the refinement exists for', () => {
    const strike = { id: 'x', from: [0, 0], to: [1, 1], cat: 'strike', label: 'L', date: '2026-01-01' };
    const bad = MapLineSchema.safeParse(strike);
    expect(bad.success).toBe(false);
    expect(bad.success === false && bad.error.issues.map(i => i.path.join('.')).sort()).toEqual(['time', 'weaponType']);

    const good = MapLineSchema.safeParse({ ...strike, weaponType: 'drone', time: '12:00' });
    expect(good.success).toBe(true);
  });
});

/** Every .ts/.tsx file under the given roots. */
function sourceFiles(roots: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(p)) out.push(p);
    }
  };
  for (const r of roots) walk(r);
  return out;
}

describe('nothing calls an object operation on the refined line schema', () => {
  // The grep is the durable half: the constraint above can be satisfied while
  // a caller still reaches for `.omit` on the wrong export, which is exactly
  // what happened twice.
  const files = sourceFiles(['src', 'scripts', 'worker']);

  it('finds source files to check (a moved directory must not empty this test)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('has no MapLineSchema.omit / .extend / .shape anywhere', () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const line of readFileSync(f, 'utf8').split('\n')) {
        // Comment lines are skipped: schemas.ts documents the trap by naming
        // it, and a test that flags its own explanation is a test people turn
        // off. Real code never starts a line with // or *.
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
        const m = /MapLineSchema\s*\.\s*(omit|extend|shape|partial|pick|merge)\b/.exec(line);
        if (m) offenders.push(`${f}: MapLineSchema.${m[1]}`);
      }
    }
    expect(offenders, 'use MapLineFieldsSchema for object operations').toEqual([]);
  });
});
