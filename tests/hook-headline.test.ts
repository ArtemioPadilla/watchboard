import { describe, it, expect } from 'vitest';
import { deriveHookHeadline } from '../video/src/data/hook-headline';

/**
 * The case that motivated this: the first render of the hook composition put
 * a real tracker headline on screen at display size and it filled half the
 * frame with three unrelated stories.
 */
const REAL = 'Somalia: Israel Appoints First Ambassador to Somaliland, Deepening FGS Sovereignty Crisis; Honour 25 Crew Still Held Day 2; 19 Days to Presidential Term Expiry';

describe('deriveHookHeadline', () => {
  it('keeps only the lead story from a semicolon-joined headline', () => {
    const out = deriveHookHeadline(REAL);
    expect(out).not.toContain(';');
    expect(out).not.toContain('Honour 25 Crew');
    expect(out).not.toContain('Presidential Term Expiry');
    expect(out.startsWith('Somalia: Israel Appoints')).toBe(true);
  });

  it('fits the display-size budget', () => {
    expect(deriveHookHeadline(REAL).length).toBeLessThanOrEqual(72);
  });

  it('drops a trailing subordinate clause rather than truncating mid-thought', () => {
    const out = deriveHookHeadline(REAL);
    expect(out).not.toContain('Deepening');
    expect(out).not.toMatch(/[,;:]$/);
  });

  it('leaves a short headline untouched', () => {
    const short = 'Iran launches 47 sorties in a single day';
    expect(deriveHookHeadline(short)).toBe(short);
  });

  it('cuts at a word boundary when there is no punctuation to use', () => {
    const long = 'A '.repeat(60).trim();
    const out = deriveHookHeadline(long);
    expect(out.length).toBeLessThanOrEqual(72);
    expect(out.endsWith(' ')).toBe(false);
  });

  it('falls back when there is nothing usable', () => {
    expect(deriveHookHeadline(undefined)).toBe('Breaking');
    expect(deriveHookHeadline('')).toBe('Breaking');
    expect(deriveHookHeadline('   ')).toBe('Breaking');
    expect(deriveHookHeadline(undefined, 'Daily brief')).toBe('Daily brief');
  });
});
