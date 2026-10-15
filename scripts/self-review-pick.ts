#!/usr/bin/env tsx
/**
 * self-review-pick.ts — chooses which dimension runs, and emits its prompt.
 *
 * Split from the workflow so the choice is testable and so the prompt lives
 * in self-review/dimensions.json rather than inside YAML, where adding a
 * dimension would mean editing a workflow.
 *
 * Usage:
 *   tsx scripts/self-review-pick.ts            # writes GITHUB_OUTPUT
 *   tsx scripts/self-review-pick.ts --dry-run  # prints the choice
 *   tsx scripts/self-review-pick.ts --force silent-failure
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { dueDimensions, resolved, type Registry, type ReviewState } from './lib/self-review.js';

const REGISTRY = 'self-review/dimensions.json';
const STATE = 'self-review/state.json';

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const forced = args[args.indexOf('--force') + 1];

  const reg: Registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const state: ReviewState = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};

  const picked = args.includes('--force')
    ? reg.dimensions.filter((d) => d.id === forced)
    : dueDimensions(reg, state, new Date(), 1);

  if (!picked.length) {
    console.log('[self-review] nothing due');
    if (!dryRun && process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, 'due=false\n');
    }
    return;
  }

  const d = picked[0];
  const r = resolved(d, reg);
  console.log(`[self-review] ${d.id} — ${d.title} (max ${r.maxFindings} findings, ${r.maxTurns} turns)`);

  if (dryRun) {
    console.log('\n--- prompt ---\n' + d.prompt);
    return;
  }
  if (process.env.GITHUB_OUTPUT) {
    // Multi-line values need the heredoc form or the prompt truncates at the
    // first newline — a silent half-prompt the agent would still answer.
    const out = process.env.GITHUB_OUTPUT;
    appendFileSync(out, `due=true\nid=${d.id}\ntitle=${d.title}\nmax_findings=${r.maxFindings}\nmax_turns=${r.maxTurns}\n`);
    appendFileSync(out, `prompt<<SELFREVIEW_EOF\n${d.prompt}\nSELFREVIEW_EOF\n`);
  }
  writeFileSync('/tmp/self-review-dimension.txt', d.id);
}

main();
