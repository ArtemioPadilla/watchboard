#!/usr/bin/env tsx
/**
 * self-review-retire.ts — closes self-review findings that stopped being true.
 *
 * This is the step that keeps the system from becoming the problem it is
 * meant to catch. #237 and #238 both asserted things that were true when
 * written and quietly stopped being true; nobody re-checked, and acting on
 * either would have burned roughly sixteen agent runs to add nothing.
 *
 * Conservative on purpose: only retires a finding whose cited file no longer
 * exists, which is the one signal that cannot mean "still broken". A file
 * that still exists says nothing about whether the problem was fixed, so
 * those are left for a human.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { retirableIssues, extractFingerprint, type OpenIssue } from './lib/self-review.js';

function listOpen(): OpenIssue[] {
  const raw = execFileSync('gh',
    ['issue', 'list', '--label', 'self-review', '--state', 'open', '--limit', '200',
     '--json', 'number,title,body'], { encoding: 'utf8' });
  return JSON.parse(raw);
}

function main(): void {
  const open = listOpen();
  console.log(`[retire] ${open.length} open self-review findings`);
  const gone = retirableIssues(open, (p) => existsSync(p));
  if (!gone.length) {
    console.log('[retire] none to retire');
    return;
  }
  for (const issue of gone) {
    const file = (extractFingerprint(issue.body) ?? '').split('|')[1];
    const note = `Retiring automatically: the file this finding cites, \`${file}\`, no longer exists in the repository, so the finding cannot still be describing the code.

If the problem moved rather than went away, reopen and the next run will pick it up again under a new location.`;
    try {
      execFileSync('gh', ['issue', 'comment', String(issue.number), '--body', note], { stdio: 'inherit' });
      execFileSync('gh', ['issue', 'close', String(issue.number), '--reason', 'not planned'], { stdio: 'inherit' });
      console.log(`[retire] closed #${issue.number} (${file} gone)`);
    } catch (err) {
      // Never fail the run over one issue: the analysis below is the point.
      console.log(`::warning::could not retire #${issue.number}: ${String(err).slice(0, 120)}`);
    }
  }
}

main();
