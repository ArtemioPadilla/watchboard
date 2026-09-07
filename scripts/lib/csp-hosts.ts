/**
 * csp-hosts.ts — reads the `connect-src` allowlist out of a CSP string and
 * answers "may the browser fetch this URL?".
 *
 * Two files carry the policy today: the `<meta http-equiv>` in
 * `src/layouts/BaseLayout.astro` (what GitHub Pages actually serves) and
 * `public/_headers` (Cloudflare/Netlify syntax, kept in sync by hand). A
 * live-data source added to the code but not to both lists dies in
 * production with no visible error. `src/lib/live-layers.test.ts` uses
 * this module to fail CI instead.
 *
 * Pure: no filesystem access here so it is trivially testable; callers
 * read the files.
 */

/**
 * The CSP `<meta>` tag as Astro emits it. Three capture groups (prefix,
 * policy, suffix) so `scripts/csp-hashes.ts` can rewrite the policy in
 * place with the same pattern this module uses to read it; two regexes
 * for one tag would drift.
 */
export const CSP_META_RE = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/i;

/** Extracts the `connect-src` directive's source list from a CSP string. */
export function extractConnectSrc(csp: string): string[] {
  const m = csp.match(/connect-src\s+([^;]+)/i);
  if (!m) return [];
  return m[1]
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Finds every CSP policy string in a file body. Handles the Astro meta
 * tag (`content="..."`) and the `_headers` line
 * (`Content-Security-Policy: ...`). Returns one string per policy found.
 */
export function extractPolicies(fileBody: string): string[] {
  const policies: string[] = [];
  for (const m of fileBody.matchAll(new RegExp(CSP_META_RE.source, 'gi'))) {
    if (m[2]) policies.push(m[2]);
  }
  for (const m of fileBody.matchAll(/Content-Security-Policy:\s*([^\n]+)/g)) {
    policies.push(m[1].trim());
  }
  return policies;
}

/**
 * CSP host-source matching, the subset we use: exact origin
 * (`https://api.example.com`), wildcard subdomain (`https://*.example.com`,
 * which also matches nested subdomains), and scheme-only entries. Keywords
 * like `'self'` are handled by the caller because they depend on the
 * deploying origin.
 */
const DEFAULT_PORTS: Record<string, string> = { https: '443', http: '80', wss: '443', ws: '80' };

/** Port a URL actually connects to: explicit port, else the scheme default. */
export function effectivePort(u: URL): string {
  return u.port || DEFAULT_PORTS[u.protocol.replace(':', '')] || '';
}

export function hostAllowed(url: string, allowlist: string[]): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  const scheme = target.protocol.replace(':', '');
  const host = target.hostname.toLowerCase();
  const port = effectivePort(target);

  for (const entry of allowlist) {
    if (entry.startsWith("'")) continue; // keywords
    // scheme-only source, e.g. `https:`
    if (/^[a-z][a-z0-9+.-]*:$/i.test(entry)) {
      if (entry.slice(0, -1).toLowerCase() === scheme) return true;
      continue;
    }
    let entryUrl: URL;
    try {
      entryUrl = new URL(entry.includes('://') ? entry : `${scheme}://${entry}`);
    } catch {
      continue;
    }
    const entryScheme = entryUrl.protocol.replace(':', '');
    if (entryScheme !== scheme) continue;
    // CSP host-sources match on port too: `https://api.example.com` means
    // 443 only, and `https://api.example.com:8443` only that port.
    if (effectivePort(entryUrl) !== port) continue;
    const entryHost = entryUrl.hostname.toLowerCase();
    if (entryHost.startsWith('*.')) {
      const suffix = entryHost.slice(1); // ".example.com"
      if (host.endsWith(suffix) && host.length > suffix.length) return true;
      continue;
    }
    if (entryHost === host) return true;
  }
  return false;
}
