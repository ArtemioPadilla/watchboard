import { test, expect } from '@playwright/test';

// The first-visit tour is a modal that intercepts every click; mark it done
// before the page scripts run (same keys as src/lib/onboarding.ts).
const TOUR_DONE = () => {
  const done = JSON.stringify({ completed: true, completedAt: '2026-01-01T00:00:00.000Z', replayCount: 0 });
  localStorage.setItem('watchboard-tour-desktop-v1', done);
  localStorage.setItem('watchboard-tour-mobile-v1', done);
};

// The homepage polls live layers, so it never reaches 'networkidle'; wait for
// 'load' and then for the island to render.
test.describe('Homepage ?tracker= selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(TOUR_DONE);
  });

  test('selects the tracker named in the URL', async ({ page }) => {
    await page.goto('./?tracker=iran-conflict', { waitUntil: 'load' });
    await expect(page.locator('.cc-search-input')).toBeVisible();
    // Selection actually happened: the sidebar expands the selected tracker
    // (operations view; the geographic view renders an accordion instead).
    await expect(page.locator('.cc-tracker-expanded').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    expect(new URL(page.url()).searchParams.get('tracker')).toBe('iran-conflict');

    // Deselecting removes the parameter (round trip in the other direction).
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !new URLSearchParams(location.search).has('tracker'), null, { timeout: 5_000 });
  });

  test('keeps the view hash next to the tracker parameter', async ({ page }) => {
    await page.goto('./?tracker=iran-conflict#geo', { waitUntil: 'load' });
    await expect(page.locator('.cc-search-input')).toBeVisible();
    await page.waitForTimeout(800);
    const url = new URL(page.url());
    expect(url.searchParams.get('tracker')).toBe('iran-conflict');
    expect(url.hash).toBe('#geo');
  });

  test('ignores an unknown tracker slug', async ({ page }) => {
    await page.goto('./?tracker=does-not-exist', { waitUntil: 'load' });
    await expect(page.locator('.cc-search-input')).toBeVisible();
    await page.waitForTimeout(800);
    expect(new URL(page.url()).searchParams.get('tracker')).toBeNull();
  });
});
