import { describe, it, expect } from 'vitest';
import { checkEntry, hasPrimaryCompanion, scanAll } from '../scripts/check-source-tiers';

/**
 * The tier scale is this project's core promise — Tier 1 official/primary,
 * Tier 2 major outlet. A Wikipedia citation carrying tier 1 misrepresents
 * exactly the thing readers are asked to trust, and Zod cannot catch it
 * because `tier` is a valid number either way.
 */
describe('hasPrimaryCompanion', () => {
  it('accepts a compound citation where something real is named', () => {
    // The tier reflects UNAMA; Wikipedia is a convenience link.
    expect(hasPrimaryCompanion('UNAMA Quarterly Report May 2026 / Pakistan ISPR / Wikipedia')).toBe(true);
  });

  it('rejects a citation that is only a tertiary source', () => {
    expect(hasPrimaryCompanion('Wikipedia — 2026 Flores earthquake')).toBe(false);
    expect(hasPrimaryCompanion('Wikipedia')).toBe(false);
  });
});

describe('checkEntry', () => {
  it('flags Wikipedia at tier 1', () => {
    const f = checkEntry({ id: 'x', tier: 1, source: 'Wikipedia' }, 'demo', 'casualties.json');
    expect(f).not.toBeNull();
    expect(f!.hasCompanion).toBe(false);
  });

  it('ignores Wikipedia at tier 3, which is where it belongs', () => {
    expect(checkEntry({ id: 'x', tier: 3, source: 'Wikipedia' }, 'demo', 'f.json')).toBeNull();
  });

  it('ignores a genuine primary source', () => {
    expect(checkEntry({ id: 'x', tier: 1, source: 'UN OCHA Situation Report #33' }, 'demo', 'f.json')).toBeNull();
  });

  it('flags social platforms too, not just Wikipedia', () => {
    expect(checkEntry({ id: 'x', tier: 2, source: 'a reddit thread' }, 'demo', 'f.json')).not.toBeNull();
    expect(checkEntry({ id: 'x', tier: 2, source: 'posted on x.com' }, 'demo', 'f.json')).not.toBeNull();
  });

  it('does not throw on entries with no source at all', () => {
    expect(checkEntry({ id: 'x', tier: 1 }, 'demo', 'f.json')).toBeNull();
  });
});

describe('the repo itself', () => {
  it('has no tier 1-2 entry sourced ONLY to a tertiary source', () => {
    const bare = scanAll().filter((f) => !f.hasCompanion);
    const detail = bare.map((f) => `${f.tracker}/${f.file}:${f.id} — ${f.source}`).join('\n');
    expect(bare, `entries claiming tier 1-2 on a tertiary source alone:\n${detail}`).toEqual([]);
  });
});
