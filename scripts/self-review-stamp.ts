#!/usr/bin/env tsx
/** Records that a dimension ran, so rotation advances. Split out so the
 *  workflow can verify the file actually changed before committing — a
 *  commit step with nothing staged is the repo's signature failure. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { nextState, type Registry, type ReviewState } from './lib/self-review.js';

const id = existsSync('/tmp/self-review-dimension.txt')
  ? readFileSync('/tmp/self-review-dimension.txt', 'utf8').trim()
  : '';
if (!id) {
  console.log('::warning::no dimension recorded — rotation will not advance');
  process.exit(0);
}
const reg: Registry = JSON.parse(readFileSync('self-review/dimensions.json', 'utf8'));
const dim = reg.dimensions.find((d) => d.id === id);
if (!dim) {
  console.log(`::warning::unknown dimension ${id}`);
  process.exit(0);
}
const state: ReviewState = existsSync('self-review/state.json')
  ? JSON.parse(readFileSync('self-review/state.json', 'utf8'))
  : {};
writeFileSync('self-review/state.json', JSON.stringify(nextState(state, [dim], new Date()), null, 2) + '\n');
console.log(`[stamp] ${id}`);
