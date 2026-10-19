// tests/e2e-workflow-coverage.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// A Playwright spec no workflow runs is a green check that proves nothing
// (docs/silent-failure-patterns.md: "225 tests no workflow ran").
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const E2E_DIR = join(ROOT, 'e2e');
const WORKFLOW = join(ROOT, '.github/workflows/e2e.yml');

/** Specs deliberately not run in CI, with the reason. Keep this short. */
const EXCLUDED: Record<string, string> = {
  // Branch-local probe for the astro 7 investigation; prints browser console
  // and failed requests and always fails on purpose. Goes with the branch.
  '_hydration-probe.spec.ts': 'astro 7 branch probe, deliberately failing — not a test',
  // Measured 2026-10-18: 7 of its 8 tests fail locally. It predates the command
  // center's current markup and needs rewriting, not a line fix.
  'command-center.spec.ts': 'pre-E1 spec, 7 of 8 tests fail against current markup — needs rewriting',
};

/**
 * Spec files named on a non-comment line that invokes `npx playwright test`.
 * A spec mentioned only in a YAML comment does not count as run.
 */
export function specsRunBy(workflowYaml: string): Set<string> {
  const run = new Set<string>();
  for (const raw of workflowYaml.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#') || !line.includes('npx playwright test')) continue;
    const code = line.split(' #')[0]; // drop a trailing comment
    for (const m of code.matchAll(/e2e\/([\w.-]+\.spec\.ts)/g)) run.add(m[1]);
  }
  return run;
}

describe('specsRunBy', () => {
  it('ignores comments and lines that do not run playwright', () => {
    const yaml = [
      '# run: npx playwright test e2e/commented.spec.ts',
      '      run: npx playwright test e2e/a.spec.ts e2e/b.spec.ts --reporter=list  # e2e/trailing.spec.ts',
      '      run: echo e2e/echoed.spec.ts',
    ].join('\n');
    expect([...specsRunBy(yaml)].sort()).toEqual(['a.spec.ts', 'b.spec.ts']);
  });
});

describe('e2e workflow coverage', () => {
  const specs = readdirSync(E2E_DIR).filter(f => f.endsWith('.spec.ts')).sort();
  const workflow = readFileSync(WORKFLOW, 'utf8');
  const run = specsRunBy(workflow);

  it('finds the spec directory and the workflow', () => {
    expect(specs.length).toBeGreaterThan(5);
    expect(run.size).toBeGreaterThan(5);
  });

  it('has no disabled step (`if: false` would make every spec a silent green)', () => {
    expect(workflow).not.toMatch(/^\s*if:\s*(false|\$\{\{\s*false\s*\}\})\s*$/m);
  });

  it('runs every spec that is not explicitly excluded', () => {
    const missing = specs.filter(f => !EXCLUDED[f] && !run.has(f));
    expect(missing, `add these to .github/workflows/e2e.yml or to EXCLUDED with a reason`).toEqual([]);
  });

  it('has no stale exclusions', () => {
    for (const f of Object.keys(EXCLUDED)) {
      expect(existsSync(join(E2E_DIR, f)), `${f} is excluded but no longer exists`).toBe(true);
      expect(run.has(f), `${f} is excluded but the workflow runs it`).toBe(false);
    }
  });
});
