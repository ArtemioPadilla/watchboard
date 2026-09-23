import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  EMPTY_INTERESTS, INTERESTS_KEY, INTERESTS_CHANGED_EVENT,
  parseInterests, hasInterests, toggleInterest, matchesInterests,
  interestOptions, loadInterests, saveInterests,
} from './interests';

describe('parseInterests', () => {
  it('keeps only known domains and regions, deduped', () => {
    expect(parseInterests({ domains: ['conflict', 'bogus', 'conflict'], regions: ['europe', 7] }))
      .toEqual({ domains: ['conflict'], regions: ['europe'] });
  });
  it('returns empty for garbage', () => {
    expect(parseInterests(null)).toEqual(EMPTY_INTERESTS);
    expect(parseInterests('x')).toEqual(EMPTY_INTERESTS);
    expect(parseInterests({ domains: 'conflict' })).toEqual(EMPTY_INTERESTS);
  });
});

describe('toggleInterest', () => {
  it('adds then removes without mutating', () => {
    const a = toggleInterest(EMPTY_INTERESTS, 'domains', 'science');
    expect(a.domains).toEqual(['science']);
    expect(EMPTY_INTERESTS.domains).toEqual([]);
    expect(toggleInterest(a, 'domains', 'science').domains).toEqual([]);
  });
  it('ignores unknown values', () => {
    expect(toggleInterest(EMPTY_INTERESTS, 'regions', 'atlantis')).toEqual(EMPTY_INTERESTS);
  });
});

describe('matchesInterests', () => {
  const i = { domains: ['science' as const], regions: ['europe' as const] };
  it('matches on domain or region', () => {
    expect(matchesInterests({ domain: 'science' }, i)).toBe(true);
    expect(matchesInterests({ domain: 'conflict', region: 'europe' }, i)).toBe(true);
    expect(matchesInterests({ domain: 'conflict', region: 'africa' }, i)).toBe(false);
    expect(matchesInterests({}, i)).toBe(false);
  });
  it('never matches with no interests', () => {
    expect(matchesInterests({ domain: 'science' }, EMPTY_INTERESTS)).toBe(false);
    expect(hasInterests(EMPTY_INTERESTS)).toBe(false);
    expect(hasInterests(i)).toBe(true);
  });
});

describe('interestOptions', () => {
  it('lists only values present, with counts, in schema order', () => {
    const opts = interestOptions([
      { domain: 'science', region: 'europe' },
      { domain: 'conflict', region: 'europe' },
      { domain: 'conflict' },
      { domain: 'not-a-domain' },
    ]);
    expect(opts.domains).toEqual([{ value: 'conflict', count: 2 }, { value: 'science', count: 1 }]);
    expect(opts.regions).toEqual([{ value: 'europe', count: 2 }]);
  });
});

describe('storage', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('round-trips and dispatches the change event', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    });
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('CustomEvent', class { type: string; detail: unknown; constructor(t: string, init: { detail: unknown }) { this.type = t; this.detail = init.detail; } });
    const i = { domains: ['science' as const], regions: [] };
    saveInterests(i);
    expect(JSON.parse(store.get(INTERESTS_KEY)!)).toEqual(i);
    expect(loadInterests()).toEqual(i);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(INTERESTS_CHANGED_EVENT);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual(i);
  });

  it('degrades to empty when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    vi.stubGlobal('CustomEvent', class { constructor(public type: string, public init: unknown) {} });
    expect(loadInterests()).toEqual(EMPTY_INTERESTS);
    expect(() => saveInterests({ domains: ['science'], regions: [] })).not.toThrow();
  });
});
