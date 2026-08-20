import { describe, it, expect } from 'vitest';
import { collectHashes, rewriteCsp, sha256Base64 } from '../scripts/csp-hashes';

/**
 * `'unsafe-inline'` is the hole that makes the rest of the policy decorative:
 * an injected inline script executes regardless of every allowlist around it.
 *
 * Astro cannot do this here — its CSP support is v6 and covers only on-demand
 * pages, while this site is 5.18 with `output: 'static'` on GitHub Pages.
 * Nonces are impossible for the same reason: a nonce must be unique per
 * request, and these pages are files. Hashes are what works on static output.
 */
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.example; style-src 'self' 'unsafe-inline'">`;

describe('collectHashes', () => {
  it('hashes an inline script', () => {
    const html = `${CSP}<script>console.log(1)</script>`;
    expect(collectHashes(html)).toEqual([`'sha256-${sha256Base64('console.log(1)')}'`]);
  });

  it('skips scripts with src — a hash there is meaningless and CSP ignores it', () => {
    expect(collectHashes(`<script src="/app.js"></script>`)).toEqual([]);
  });

  it('DOES hash JSON-LD, which CSP treats as a script element', () => {
    // Missing this silently breaks structured data the moment 'unsafe-inline'
    // is removed, and costs SEO without any visible error.
    const html = `<script type="application/ld+json">{"a":1}</script>`;
    expect(collectHashes(html)).toEqual([`'sha256-${sha256Base64('{"a":1}')}'`]);
  });

  it('deduplicates identical scripts', () => {
    const html = `<script>x()</script><script>x()</script>`;
    expect(collectHashes(html)).toHaveLength(1);
  });

  it('ignores empty script tags', () => {
    expect(collectHashes(`<script></script><script>   </script>`)).toEqual([]);
  });

  it('is whitespace-exact, because the browser hashes the body verbatim', () => {
    expect(sha256Base64('a()')).not.toBe(sha256Base64('a() '));
  });
});

describe('rewriteCsp', () => {
  it('removes unsafe-inline and adds the hashes to script-src only', () => {
    const { html, changed } = rewriteCsp(CSP, ["'sha256-abc'"]);
    expect(changed).toBe(true);
    const policy = html.match(/content="([^"]*)"/)![1];
    const scriptSrc = policy.split(';').find((d) => d.trim().startsWith('script-src'))!;
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).toContain("'sha256-abc'");
    expect(scriptSrc).toContain('https://cdn.example');
    // style-src keeps its own unsafe-inline: this only governs scripts.
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('is idempotent — old hashes are replaced, not accumulated', () => {
    const once = rewriteCsp(CSP, ["'sha256-one'"]).html;
    const twice = rewriteCsp(once, ["'sha256-two'"]).html;
    const policy = twice.match(/content="([^"]*)"/)![1];
    expect(policy).toContain("'sha256-two'");
    expect(policy).not.toContain("'sha256-one'");
  });

  it('leaves a page with no CSP meta untouched', () => {
    const { html, changed } = rewriteCsp('<html><body>hi</body></html>', ["'sha256-x'"]);
    expect(changed).toBe(false);
    expect(html).toBe('<html><body>hi</body></html>');
  });

  it('does not touch a Report-Only meta, which is a different header', () => {
    const ro = `<meta http-equiv="Content-Security-Policy-Report-Only" content="script-src 'unsafe-inline'">`;
    expect(rewriteCsp(ro, ["'sha256-x'"]).changed).toBe(false);
  });
});
