import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractPolicies } from '../../scripts/lib/csp-hosts';

const ROOT = resolve(__dirname, '../..');

describe('CSP allows direct-to-broadcaster audio playback', () => {
  for (const file of ['src/layouts/BaseLayout.astro', 'public/_headers']) {
    it(`${file} declares media-src covering https:`, () => {
      const body = readFileSync(resolve(ROOT, file), 'utf8');
      const [policy] = extractPolicies(body);
      expect(policy, `${file} has no CSP`).toBeTruthy();
      const m = /media-src\s+([^;]+)/i.exec(policy);
      expect(m, `${file} has no media-src directive`).toBeTruthy();
      expect(m![1]).toMatch(/https:/);
    });
  }
});
