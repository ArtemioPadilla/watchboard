import { test, expect } from '@playwright/test';

test.describe('Homepage ?tracker= selection', () => {
  test('selects the tracker named in the URL and keeps the hash', async ({ page }) => {
    await page.goto('./?tracker=iran-conflict#geo', { waitUntil: 'networkidle' });
    await expect(page.locator('.cc-search-input')).toBeVisible();
    // Selection actually happened: the sidebar expands the selected tracker.
    await expect(page.locator('.cc-tracker-expanded').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    const url = new URL(page.url());
    expect(url.searchParams.get('tracker')).toBe('iran-conflict');
    expect(url.hash).toBe('#geo');

    // Deselecting removes the parameter (round trip in the other direction).
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !new URLSearchParams(location.search).has('tracker'), null, { timeout: 5_000 });
  });

  test('ignores an unknown tracker slug', async ({ page }) => {
    await page.goto('./?tracker=does-not-exist', { waitUntil: 'networkidle' });
    await expect(page.locator('.cc-search-input')).toBeVisible();
    await page.waitForTimeout(800);
    expect(new URL(page.url()).searchParams.get('tracker')).toBeNull();
  });
});
