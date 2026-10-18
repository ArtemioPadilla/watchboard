#!/usr/bin/env tsx
/**
 * sync-roadmap-doc.ts — regenerate the roadmap tables in
 * docs/product-roadmap.md from src/data/roadmap-items.ts.
 *
 * The markdown used to be a hand-maintained "narrative mirror" of the data
 * file, and on 2026-10-18 the two had drifted so far apart that both were
 * wrong: the canonical file still stopped at PR #135 while 204 PRs had
 * merged, and 21 of its 39 items described work that had shipped months
 * earlier. A mirror nobody can forget to update is the only kind that stays
 * true, so the tables are generated and CI checks them — the same contract
 * scripts/list-env-vars.ts has with docs/self-hosting.md.
 *
 * Usage:
 *   npx tsx scripts/sync-roadmap-doc.ts --check docs/product-roadmap.md
 *   npx tsx scripts/sync-roadmap-doc.ts --write docs/product-roadmap.md
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  MILESTONES,
  MILESTONE_ORDER,
  ROADMAP_ITEMS,
  ROADMAP_LAST_REVIEWED,
  STATUS_META,
  AREA_META,
  type RoadmapItem,
} from '../src/data/roadmap-items.js';

export const DOC_START = '<!-- roadmap:start -->';
export const DOC_END = '<!-- roadmap:end -->';

const STATUS_EMOJI: Record<RoadmapItem['status'], string> = {
  shipped: '✅',
  'in-progress': '🚧',
  planned: '📋',
  idea: '💡',
};

function prLinks(item: RoadmapItem): string {
  if (!item.prs?.length) return '—';
  return item.prs.map((n) => `#${n}`).join(', ');
}

function row(item: RoadmapItem): string {
  const cells = [
    STATUS_EMOJI[item.status],
    `**${item.title}**`,
    AREA_META[item.area].label,
    item.priority,
    item.effort,
    prLinks(item),
  ];
  return `| ${cells.join(' | ')} |`;
}

/** The generated block: one table per milestone, plus the item detail list. */
export function renderBlock(): string {
  const out: string[] = [];
  out.push(`_Generated from \`src/data/roadmap-items.ts\` by \`scripts/sync-roadmap-doc.ts\`. Do not edit between the markers._`);
  out.push('');
  out.push(`Last reviewed: **${ROADMAP_LAST_REVIEWED}** · ${ROADMAP_ITEMS.length} items`);
  out.push('');

  const byStatus = new Map<string, number>();
  for (const i of ROADMAP_ITEMS) byStatus.set(i.status, (byStatus.get(i.status) ?? 0) + 1);
  out.push(
    [...byStatus.entries()]
      .map(([s, n]) => `${STATUS_EMOJI[s as RoadmapItem['status']]} ${n} ${STATUS_META[s as RoadmapItem['status']].label.toLowerCase()}`)
      .join(' · '),
  );
  out.push('');

  for (const m of MILESTONE_ORDER) {
    const items = ROADMAP_ITEMS.filter((i) => i.milestone === m);
    if (items.length === 0) continue;
    const meta = MILESTONES[m];
    out.push(`## ${meta.label} — ${meta.theme}`);
    out.push('');
    out.push(`${items.length} item${items.length === 1 ? '' : 's'}. ${meta.window}`);
    out.push('');
    out.push('| | Title | Area | Priority | Effort | PRs |');
    out.push('| --- | --- | --- | --- | --- | --- |');
    for (const item of items) out.push(row(item));
    out.push('');
    for (const item of items) {
      if (!item.outcome) continue;
      out.push(`- **${item.title}** — ${item.outcome}`);
    }
    if (items.some((i) => i.outcome)) out.push('');
  }
  return out.join('\n');
}

const mode = process.argv.includes('--write') ? 'write' : 'check';
const docPath = process.argv.find((a) => a.endsWith('.md')) ?? 'docs/product-roadmap.md';
const doc = readFileSync(docPath, 'utf8');
const a = doc.indexOf(DOC_START);
const b = doc.indexOf(DOC_END);
if (a === -1 || b === -1) {
  console.error(`${docPath}: markers ${DOC_START} / ${DOC_END} not found`);
  process.exit(1);
}
const next = `${doc.slice(0, a + DOC_START.length)}\n\n${renderBlock()}\n${doc.slice(b)}`;

if (mode === 'write') {
  writeFileSync(docPath, next);
  console.log(`${docPath}: roadmap tables written (${ROADMAP_ITEMS.length} items)`);
} else if (next !== doc) {
  console.error(`${docPath} is stale. Regenerate with: npx tsx scripts/sync-roadmap-doc.ts --write ${docPath}`);
  process.exit(1);
} else {
  console.log(`${docPath}: roadmap tables up to date (${ROADMAP_ITEMS.length} items)`);
}
