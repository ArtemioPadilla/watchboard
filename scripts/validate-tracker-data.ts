#!/usr/bin/env tsx
/**
 * Tracker data validator — single source of truth.
 *
 * Usage:
 *   tsx scripts/validate-tracker-data.ts             # JSON syntax + Zod schemas
 *   tsx scripts/validate-tracker-data.ts --syntax    # JSON syntax only (fast)
 *   tsx scripts/validate-tracker-data.ts --json      # machine-readable output
 *
 * Exit code:
 *   0 — all data files valid
 *   1 — at least one file invalid (full report on stderr)
 *
 * Called by:
 *   - `npm run validate-data`                              (local dev)
 *   - .github/workflows/deploy.yml                         (pre-build gate)
 *   - .github/workflows/validate-data.yml                  (per-push check)
 *   - .github/workflows/update-data.yml fix-agent loop     (re-check after fix)
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import * as S from '../src/lib/schemas.js';

type Issue = {
  tracker: string;
  file: string;
  kind: 'json' | 'schema';
  line?: number;
  field?: string;
  message: string;
};

const SCHEMA_MAP: Record<string, z.ZodTypeAny> = {
  'kpis.json': z.array(S.KpiSchema),
  'timeline.json': z.array(S.TimelineEraSchema),
  'map-points.json': z.array(S.MapPointSchema),
  'map-lines.json': z.array(S.MapLineSchema),
  'strike-targets.json': z.array(S.StrikeItemSchema),
  'retaliation.json': z.array(S.StrikeItemSchema),
  'assets.json': z.array(S.AssetSchema),
  'casualties.json': z.array(S.CasualtyRowSchema),
  'econ.json': z.array(S.EconItemSchema),
  'claims.json': z.array(S.ClaimSchema),
  'political.json': z.array(S.PolItemSchema),
  'meta.json': S.MetaSchema,
  'digests.json': z.array(S.DigestEntrySchema),
};
const EVENT_SCHEMA = z.array(S.TimelineEventSchema);

const SKIP_FILES = new Set(['review-manifest.json', 'update-log.json']);

function approxLineFromPosition(text: string, pos: number): number {
  return text.slice(0, pos).split('\n').length;
}

function parseJsonWithLine(file: string, raw: string): { ok: true; value: unknown } | { ok: false; line: number; message: string } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const match = message.match(/position (\d+)/);
    const line = match ? approxLineFromPosition(raw, Number(match[1])) : 1;
    return { ok: false, line, message };
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const syntaxOnly = args.has('--syntax') || args.has('--syntax-only');
  const jsonOutput = args.has('--json');

  const issues: Issue[] = [];
  const trackersDir = path.resolve('trackers');

  if (!fs.existsSync(trackersDir)) {
    console.error(`No trackers/ directory at ${trackersDir}`);
    process.exit(1);
  }

  const slugs = fs
    .readdirSync(trackersDir)
    .filter((s) => fs.statSync(path.join(trackersDir, s)).isDirectory())
    .sort();

  let filesChecked = 0;

  for (const slug of slugs) {
    const dataDir = path.join(trackersDir, slug, 'data');
    if (!fs.existsSync(dataDir)) continue;

    const visit = (filePath: string) => {
      const base = path.basename(filePath);
      if (SKIP_FILES.has(base)) return;
      filesChecked++;
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = parseJsonWithLine(filePath, raw);
      if (!parsed.ok) {
        issues.push({
          tracker: slug,
          file: path.relative(process.cwd(), filePath),
          kind: 'json',
          line: parsed.line,
          message: parsed.message,
        });
        return; // can't run Zod on unparseable JSON
      }

      if (syntaxOnly) return;

      const rel = path.relative(dataDir, filePath); // e.g. "events/2026-05-01.json" or "kpis.json"
      let schema: z.ZodTypeAny | undefined;
      if (rel.startsWith('events' + path.sep)) {
        schema = EVENT_SCHEMA;
      } else {
        schema = SCHEMA_MAP[base];
      }
      if (!schema) return; // no schema = ignore (e.g. tracker.json lives elsewhere)

      const result = schema.safeParse(parsed.value);
      if (!result.success) {
        for (const err of result.error.errors.slice(0, 5)) {
          issues.push({
            tracker: slug,
            file: path.relative(process.cwd(), filePath),
            kind: 'schema',
            field: err.path.join('.'),
            message: err.message,
          });
        }
      }
    };

    for (const f of fs.readdirSync(dataDir)) {
      const fp = path.join(dataDir, f);
      if (fs.statSync(fp).isFile() && f.endsWith('.json')) visit(fp);
    }
    const eventsDir = path.join(dataDir, 'events');
    if (fs.existsSync(eventsDir)) {
      for (const f of fs.readdirSync(eventsDir)) {
        if (f.endsWith('.json')) visit(path.join(eventsDir, f));
      }
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ ok: issues.length === 0, filesChecked, issues }, null, 2));
  } else {
    if (issues.length === 0) {
      console.log(`✓ ${filesChecked} tracker data file(s) valid${syntaxOnly ? ' (JSON syntax only)' : ''}`);
    } else {
      console.error(`✗ ${issues.length} issue(s) across ${filesChecked} file(s):\n`);
      for (const issue of issues) {
        const loc = issue.line !== undefined ? `:${issue.line}` : '';
        const field = issue.field ? ` [${issue.field}]` : '';
        // GitHub Actions annotation format — picked up automatically by Actions UI.
        console.error(`::error file=${issue.file},line=${issue.line ?? 1}::${issue.kind.toUpperCase()}${field}: ${issue.message}`);
        console.error(`  ${issue.file}${loc}${field}`);
        console.error(`    ${issue.message}\n`);
      }
    }
  }

  process.exit(issues.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Validator crashed:', err);
  process.exit(2);
});
