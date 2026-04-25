import { describe, it, expect, beforeEach } from 'vitest';

// Polyfill localStorage for the node test environment. This module-scope shim
// runs before the onboarding module is imported, so the persistence functions
// see a working Storage API. Each test resets state via localStorage.clear().
if (
  typeof globalThis.localStorage === 'undefined' ||
  typeof (globalThis.localStorage as Storage | undefined)?.clear !== 'function'
) {
  const store = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    configurable: true,
    writable: true,
  });
}

import {
  getTourState,
  markTourComplete,
  resetTour,
  isTourCompleted,
  TOUR_KEY_DESKTOP,
  TOUR_KEY_MOBILE,
  __resetMigrationForTests,
} from './onboarding';

describe('onboarding tour persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetMigrationForTests();
  });

  it('returns default state when no key is set', () => {
    const state = getTourState('desktop');
    expect(state.completed).toBe(false);
    expect(state.replayCount).toBe(0);
    expect(state.completedAt).toBeUndefined();
  });

  it('marks tour complete with timestamp', () => {
    markTourComplete('desktop');
    const state = getTourState('desktop');
    expect(state.completed).toBe(true);
    expect(state.replayCount).toBe(0);
    expect(typeof state.completedAt).toBe('string');
    expect(new Date(state.completedAt!).toString()).not.toBe('Invalid Date');
  });

  it('isTourCompleted reflects flag', () => {
    expect(isTourCompleted('desktop')).toBe(false);
    markTourComplete('desktop');
    expect(isTourCompleted('desktop')).toBe(true);
  });

  it('resetTour clears completion but preserves replayCount on next complete', () => {
    markTourComplete('desktop');
    resetTour('desktop');
    expect(isTourCompleted('desktop')).toBe(false);
    markTourComplete('desktop');
    const state = getTourState('desktop');
    expect(state.completed).toBe(true);
    expect(state.replayCount).toBe(1);
  });

  it('keeps desktop and mobile keys independent', () => {
    markTourComplete('desktop');
    expect(isTourCompleted('desktop')).toBe(true);
    expect(isTourCompleted('mobile')).toBe(false);
  });

  it('migrates legacy watchboard-welcomed flag once and removes it', () => {
    localStorage.setItem('watchboard-welcomed', '1');
    expect(isTourCompleted('desktop')).toBe(true);
    expect(isTourCompleted('mobile')).toBe(true);
    expect(localStorage.getItem('watchboard-welcomed')).toBeNull();
  });

  it('migrates legacy watchboard-welcome-dismissed flag', () => {
    localStorage.setItem('watchboard-welcome-dismissed', 'true');
    expect(isTourCompleted('desktop')).toBe(true);
    expect(isTourCompleted('mobile')).toBe(true);
    expect(localStorage.getItem('watchboard-welcome-dismissed')).toBeNull();
  });

  it('uses the correct localStorage keys', () => {
    expect(TOUR_KEY_DESKTOP).toBe('watchboard-tour-desktop-v1');
    expect(TOUR_KEY_MOBILE).toBe('watchboard-tour-mobile-v1');
  });
});
