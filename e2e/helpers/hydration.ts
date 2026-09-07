import { expect, type Page } from '@playwright/test';

/**
 * The homepage CommandCenter is a `client:idle` island: its HTML (including
 * the alerts toggle) is server-rendered, so a click right after `load` can
 * land before React attaches any handler and silently do nothing. On a
 * loaded CI runner that race is lost every time. Astro removes the `ssr`
 * attribute from `<astro-island>` once the component has hydrated, which is
 * the one signal that the handlers exist.
 */
export async function waitForCommandCenter(page: Page, timeout = 90_000): Promise<void> {
  await expect(page.locator('astro-island:not([ssr]) .cc-search-input').first()).toBeVisible({ timeout });
}

// The first-visit tour is a modal that intercepts every click; mark it done
// before the page scripts run (same keys as src/lib/onboarding.ts).
export const TOUR_DONE = () => {
  const done = JSON.stringify({ completed: true, completedAt: '2026-01-01T00:00:00.000Z', replayCount: 0 });
  localStorage.setItem('watchboard-tour-desktop-v1', done);
  localStorage.setItem('watchboard-tour-mobile-v1', done);
};
