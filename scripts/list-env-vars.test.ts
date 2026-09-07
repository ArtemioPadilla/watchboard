import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanEnvVars, renderMarkdown } from './list-env-vars';

describe('list-env-vars', () => {
  it('finds process.env and import.meta.env reads, dedupes, sorts, skips test files and framework vars', () => {
    const root = mkdtempSync(join(tmpdir(), 'envscan-'));
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'scripts', 'a.ts'), 'const k = process.env.ZETA_KEY; const m = process.env.NODE_ENV; process.env.ALPHA;');
    writeFileSync(join(root, 'src', 'b.astro'), '---\nconst x = import.meta.env.PUBLIC_THING; const y = import.meta.env.BASE_URL;\n---');
    writeFileSync(join(root, 'src', 'c.test.ts'), 'process.env.SHOULD_NOT_APPEAR');
    const uses = scanEnvVars(root);
    expect(uses.map(u => u.name)).toEqual(['ALPHA', 'PUBLIC_THING', 'ZETA_KEY']);
    const md = renderMarkdown(uses);
    expect(md).toContain('| `PUBLIC_THING` | site build |');
    expect(md).toContain('| `ZETA_KEY` | CI scripts |');
    expect(md).not.toContain('NODE_ENV');
  });

  it('the real repo exposes no required variable to the site build beyond analytics and SITE', () => {
    const siteVars = scanEnvVars().filter(u => u.files.some(f => f.startsWith('src/'))).map(u => u.name);
    for (const v of siteVars) expect(v === 'SITE' || v.startsWith('PUBLIC_'), `unexpected build-time env var ${v}`).toBe(true);
  });
});
