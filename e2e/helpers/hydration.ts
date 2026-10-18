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

/**
 * Turns the homepage broadcast mode off and confirms it went off.
 *
 * Broadcast auto-cycles through trackers with camera fly-tos and keeps the
 * globe auto-rotating, so anything that clicks a fixed point on the canvas is
 * racing the camera: by the time the click lands, the sphere may no longer be
 * under that point and the handler never fires. That is what made
 * `dossier.spec.ts` right-click flaky — three failures and three passing
 * re-runs of identical code in one day.
 *
 * A user pause is not enough: clicking the UI pauses for USER_PAUSE_DURATION_S
 * (15s) and then resumes on its own, which is the "Resuming in 3s" badge seen
 * in the failure snapshots. The `b` shortcut unmounts the overlay outright.
 *
 * Verifies rather than assumes — it waits for the LIVE badge to disappear, so
 * a silently-changed shortcut fails the helper instead of producing a flake
 * somewhere else.
 */
export async function disableBroadcast(page: Page): Promise<void> {
  const liveBadge = page.locator('.broadcast-live-badge');
  if ((await liveBadge.count()) === 0) return; // already off, or no broadcast here
  await page.keyboard.press('b');
  await expect(liveBadge).toHaveCount(0, { timeout: 10_000 });
}
