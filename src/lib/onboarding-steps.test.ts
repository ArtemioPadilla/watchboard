import { describe, it, expect } from 'vitest';
import { DESKTOP_STEPS, MOBILE_STEPS } from './onboarding-steps';

describe('onboarding step configs', () => {
  it('has 6 desktop steps in spec order', () => {
    expect(DESKTOP_STEPS).toHaveLength(6);
    expect(DESKTOP_STEPS.map((s) => s.id)).toEqual([
      'hero-intro',
      'spotlight-globe',
      'spotlight-sidebar',
      'spotlight-ticker',
      'hero-tiers',
      'hero-closing',
    ]);
  });

  it('has 3 mobile steps in spec order', () => {
    expect(MOBILE_STEPS).toHaveLength(3);
    expect(MOBILE_STEPS.map((s) => s.id)).toEqual([
      'mobile-welcome',
      'mobile-stories',
      'mobile-dive-in',
    ]);
  });

  it('every spotlight step has a non-empty CSS-selector anchor', () => {
    for (const step of DESKTOP_STEPS) {
      if (step.type === 'spotlight') {
        expect(step.anchor).toBeTruthy();
        expect(step.anchor!.startsWith('#')).toBe(true);
      }
    }
  });

  it('all desktop step ids are unique', () => {
    const ids = DESKTOP_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all mobile step ids are unique', () => {
    const ids = MOBILE_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
