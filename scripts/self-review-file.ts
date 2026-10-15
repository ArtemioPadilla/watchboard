#!/usr/bin/env tsx
/**
 * self-review-file.ts — turns verified findings into GitHub issues.
 *
 * Filters before filing: a finding whose cited file does not exist is
 * dropped (hallucinated, or already fixed — either way it costs a human the
 * time to discover that), duplicates of still-open findings are dropped, and
 * the per-dimension cap is enforced here rather than trusted to the prompt.
 *
 * Every dropped finding is printed with its reason, so a run that files
 * nothing still explains itself instead of looking like it did nothing.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import {
  filterFindings, fingerprint, fingerprintMarker,
  type Finding, type OpenIssue,
} from './lib/self-review.js';

const DIM = process.env.DIMENSION ?? '';
const DRY = process.env.DRY_RUN === 'true';
const MAX = Number(process.env.MAX_FINDINGS ?? '3');

function parseFindings(): Finding[] {
  const raw = (process.env.FINDINGS ?? '').trim();
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.log('::warning::structured output was not JSON — filing nothing');
    return [];
  }
  const list = (parsed as { findings?: unknown[] })?.findings;
  if (!Array.isArray(list)) return [];
  return list
    .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === 'object')
    .map((f) => ({
      dimension: DIM,
      title: String(f.title ?? '').trim(),
      file: String(f.file ?? '').trim(),
      line: typeof f.line === 'number' ? f.line : undefined,
      detail: String(f.detail ?? '').trim(),
    }))
    .filter((f) => f.title && f.detail);
}

function listOpen(): OpenIssue[] {
  try {
    return JSON.parse(execFileSync('gh',
      ['issue', 'list', '--label', 'self-review', '--state', 'open', '--limit', '200',
       '--json', 'number,title,body'], { encoding: 'utf8' }));
  } catch {
    return [];
  }
}

function ensureLabels(names: string[]): void {
  for (const n of names) {
    try {
      execFileSync('gh', ['label', 'create', n, '--force'], { stdio: 'ignore' });
    } catch {
      // Non-fatal. gh refuses the whole issue-create call if a label is
      // missing, which once left four issues completely unlabelled; creating
      // each one first and tolerating failure is the safe order.
    }
  }
}

function main(): void {
  if (process.env.AGENT_RESULT && process.env.AGENT_RESULT !== 'success') {
    console.log(`::warning::analysis step reported ${process.env.AGENT_RESULT} — filing only what it returned`);
  }
  const findings = parseFindings();
  console.log(`[file] dimension=${DIM} findings returned=${findings.length}`);

  const { keep, dropped } = filterFindings(findings, listOpen(), (p) => existsSync(p), MAX);
  for (const d of dropped) console.log(`  dropped "${d.finding.title.slice(0, 60)}" — ${d.reason}`);

  if (!keep.length) {
    console.log('[file] nothing to file');
    writeSummary(findings.length, [], dropped.length);
    return;
  }

  const labels = ['self-review', `dimension:${DIM}`];
  if (!DRY) ensureLabels(labels);

  for (const f of keep) {
    const loc = f.line ? `${f.file}:${f.line}` : f.file;
    const body = [
      f.detail,
      '',
      `**Location:** \`${loc}\``,
      '',
      '---',
      `Filed by the \`${DIM}\` dimension of the weekly self-review (\`self-review/dimensions.json\`).`,
      'The cited file was confirmed to exist before filing. If it is later deleted, this issue is retired automatically.',
      '',
      fingerprintMarker(fingerprint(f)),
    ].join('\n');

    if (DRY) {
      console.log(`\n[dry-run] would file: ${f.title}\n  ${loc}\n  ${f.detail.slice(0, 160)}`);
      continue;
    }
    try {
      execFileSync('gh', ['issue', 'create', '--title', `[${DIM}] ${f.title}`,
        '--body', body, '--label', labels.join(',')], { stdio: 'inherit' });
    } catch {
      // Last resort: losing a verified finding over a label is worse than an
      // unlabelled issue.
      execFileSync('gh', ['issue', 'create', '--title', `[${DIM}] ${f.title}`,
        '--body', body], { stdio: 'inherit' });
    }
  }
  writeSummary(findings.length, keep, dropped.length);
}

function writeSummary(returned: number, filed: Finding[], droppedCount: number): void {
  const lines = [
    `## Self review — \`${DIM}\``,
    '',
    `| | |`, `| --- | --- |`,
    `| returned by the agent | ${returned} |`,
    `| filed | ${filed.length} |`,
    `| dropped (unverifiable, duplicate or over cap) | ${droppedCount} |`,
    '',
    ...filed.map((f) => `- **${f.title}** — \`${f.file}${f.line ? ':' + f.line : ''}\``),
  ];
  if (!filed.length) lines.push('_Nothing filed. Zero findings is a valid result for a dimension._');
  const out = lines.join('\n') + '\n';
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { execFileSync('bash', ['-c', `cat >> "$GITHUB_STEP_SUMMARY"`], { input: out }); } catch { /* summary is best-effort */ }
  }
  mkdirSync('self-review/reports', { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  writeFileSync(`self-review/reports/${stamp}-${DIM}.md`, out);
  console.log(out);
}

main();
