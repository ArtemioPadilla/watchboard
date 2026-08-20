#!/usr/bin/env tsx
/**
 * csp-hashes.ts — replaces 'unsafe-inline' with per-page SHA-256 hashes.
 *
 * `'unsafe-inline'` is the hole that makes the rest of the policy decorative:
 * an injected inline script executes regardless of every allowlist around it.
 *
 * Astro can do this itself, but not here. Its CSP support landed in **v6** and
 * covers only on-demand pages — "these features only exist for pages rendered
 * on demand using server mode, or pages that opt out of prerendering". This
 * site is Astro 5.18 with `output: 'static'` on GitHub Pages, which is static
 * by definition. Nonces are impossible for the same reason: a nonce must be
 * unique per request, and these pages are files.
 *
 * Hashes work on static output, which is what this does. Each page gets the
 * hashes of its own inline scripts, because pages differ.
 *
 * Run after `astro build`. Idempotent — a page already carrying hashes and no
 * 'unsafe-inline' is left alone.
 *
 * Usage:
 *   npx tsx scripts/csp-hashes.ts [dist] [--dry-run]
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Matches every <script> element and captures its attributes and body. */
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

export function sha256Base64(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('base64');
}

/**
 * Hashes of every inline script in the document.
 *
 * Scripts with a `src` are covered by the host allowlist and must NOT be
 * hashed — a hash on an external script is meaningless and CSP ignores it.
 * JSON-LD blocks ARE hashed: CSP treats `application/ld+json` as a script
 * element, so leaving them out breaks structured data the moment
 * 'unsafe-inline' goes away. That is easy to miss and silently costs SEO.
 */
export function collectHashes(html: string): string[] {
  const hashes = new Set<string>();
  for (const m of html.matchAll(SCRIPT_RE)) {
    const attrs = m[1] ?? '';
    const body = m[2] ?? '';
    if (/\bsrc\s*=/.test(attrs)) continue;
    if (body.trim().length === 0) continue;
    hashes.add(`'sha256-${sha256Base64(body)}'`);
  }
  return [...hashes];
}

/** Rewrites the page's CSP meta: drops 'unsafe-inline', adds the hashes. */
export function rewriteCsp(html: string, hashes: string[]): { html: string; changed: boolean } {
  const metaRe = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/i;
  const m = html.match(metaRe);
  if (!m) return { html, changed: false };

  const policy = m[2];
  const directives = policy.split(';').map((d) => d.trim()).filter(Boolean);
  let touched = false;

  const next = directives.map((d) => {
    if (!d.startsWith('script-src')) return d;
    const parts = d.split(/\s+/).filter((p) => p !== "'unsafe-inline'" && !p.startsWith("'sha256-"));
    touched = true;
    return [...parts, ...hashes].join(' ');
  });

  if (!touched) return { html, changed: false };
  return { html: html.replace(metaRe, `$1${next.join('; ')}$3`), changed: true };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dist = resolve(args.find((a) => !a.startsWith('--')) ?? join(ROOT, 'dist'));

  const files = walk(dist);
  let rewritten = 0;
  let totalHashes = 0;
  let noMeta = 0;

  for (const file of files) {
    const html = readFileSync(file, 'utf-8');
    const hashes = collectHashes(html);
    const { html: next, changed } = rewriteCsp(html, hashes);
    if (!changed) { noMeta++; continue; }
    totalHashes += hashes.length;
    rewritten++;
    if (!dryRun) writeFileSync(file, next);
  }

  console.log(`[csp] ${files.length} pages scanned`);
  console.log(`[csp] ${rewritten} rewritten, ${totalHashes} script hashes total`);
  if (noMeta) console.log(`[csp] ${noMeta} without a CSP meta tag (left alone)`);
  if (dryRun) console.log('[csp] dry run — nothing written');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
