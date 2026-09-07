#!/usr/bin/env tsx
/**
 * list-env-vars.ts — the environment variables the code actually reads.
 *
 * Written after reviewing a comparable project whose DOCKER.md said "only
 * two variables are read" while the code read seventeen, and documented
 * two more that nothing read at all. A hand-maintained list drifts; this
 * one is grepped from the source, so docs/self-hosting.md can embed it.
 *
 * Usage:
 *   npx tsx scripts/list-env-vars.ts            # markdown table to stdout
 *   npx tsx scripts/list-env-vars.ts --json
 *   npx tsx scripts/list-env-vars.ts --check docs/self-hosting.md   # exit 1 if the doc is stale
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['src', 'scripts', 'worker', 'functions', 'video/src', 'video/render.ts', 'mcp/server.ts'];
const EXT = /\.(ts|tsx|mjs|js|astro)$/;
const SKIP = /node_modules|\.test\.|dist\//;
const RE = /(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]+)/g;

export interface EnvVarUse { name: string; files: string[] }

function walk(p: string, out: string[]): void {
  if (SKIP.test(p)) return;
  const st = statSync(p, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isDirectory()) { for (const e of readdirSync(p)) walk(join(p, e), out); return; }
  if (EXT.test(p)) out.push(p);
}

export function scanEnvVars(root = ROOT): EnvVarUse[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(resolve(root, d), files);
  const uses = new Map<string, Set<string>>();
  for (const f of files) {
    const body = readFileSync(f, 'utf8');
    for (const m of body.matchAll(RE)) {
      const name = m[1];
      if (name === 'NODE_ENV' || name === 'CI' || name === 'BASE_URL' || name === 'DEV' || name === 'PROD' || name === 'SSR' || name === 'MODE') continue;
      if (!uses.has(name)) uses.set(name, new Set());
      uses.get(name)!.add(relative(root, f));
    }
  }
  return [...uses.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, fs]) => ({ name, files: [...fs].sort() }));
}

/** Where a variable is consumed, for the table. */
function context(files: string[]): string {
  const c = new Set<string>();
  for (const f of files) {
    if (f.startsWith('worker/') || f.startsWith('functions/')) c.add('edge worker');
    else if (f.startsWith('scripts/')) c.add('CI scripts');
    else if (f.startsWith('video/')) c.add('video render');
    else if (f.startsWith('mcp/')) c.add('MCP server');
    else c.add('site build');
  }
  return [...c].sort().join(', ');
}

export function renderMarkdown(uses: EnvVarUse[]): string {
  const lines = ['| Variable | Used by | Files |', '|---|---|---|'];
  for (const u of uses) lines.push(`| \`${u.name}\` | ${context(u.files)} | ${u.files.map(f => `\`${f}\``).join(', ')} |`);
  return lines.join('\n') + '\n';
}

export const DOC_START = '<!-- env-vars:start -->';
export const DOC_END = '<!-- env-vars:end -->';

function main(): void {
  const args = process.argv.slice(2);
  const uses = scanEnvVars();
  if (args.includes('--json')) { console.log(JSON.stringify(uses, null, 2)); return; }
  const md = renderMarkdown(uses);
  const checkIdx = args.indexOf('--check');
  if (checkIdx !== -1) {
    const docPath = resolve(ROOT, args[checkIdx + 1] ?? 'docs/self-hosting.md');
    const doc = readFileSync(docPath, 'utf8');
    const a = doc.indexOf(DOC_START), b = doc.indexOf(DOC_END);
    if (a === -1 || b === -1) { console.error(`${docPath}: markers ${DOC_START} / ${DOC_END} not found`); process.exit(1); }
    const embedded = doc.slice(a + DOC_START.length, b).trim();
    if (embedded !== md.trim()) {
      console.error(`${docPath} is stale. Regenerate with: npx tsx scripts/list-env-vars.ts --write ${args[checkIdx + 1] ?? 'docs/self-hosting.md'}`);
      process.exit(1);
    }
    console.log(`${docPath}: env var table up to date (${uses.length} variables)`);
    return;
  }
  const writeIdx = args.indexOf('--write');
  if (writeIdx !== -1) {
    const docPath = resolve(ROOT, args[writeIdx + 1] ?? 'docs/self-hosting.md');
    const doc = readFileSync(docPath, 'utf8');
    const a = doc.indexOf(DOC_START), b = doc.indexOf(DOC_END);
    if (a === -1 || b === -1) { console.error('markers not found'); process.exit(1); }
    const next = doc.slice(0, a + DOC_START.length) + '\n' + md + doc.slice(b);
    writeFileSync(docPath, next);
    console.log(`wrote ${uses.length} variables into ${docPath}`);
    return;
  }
  process.stdout.write(md);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
