import { test, expect } from '@playwright/test';

test.describe('Homepage ?tracker= selection', () => {
  test('selects the tracker named in the URL and keeps the hash', async ({ page }) => {
    await page.goto('./?tracker=iran-conflict#geo', { waitUntil: 'networkidle' });
    await expect(page.locator('.cc-search-input')).toBeVisible();
    await page.waitForTimeout(800);
    const url = new URL(page.url());
    expect(url.searchParams.get('tracker')).toBe('iran-conflict');
    expect(url.hash).toBe('#geo');
  });

  test('ignores an unknown tracker slug', async ({ page }) => {
    await page.goto('./?tracker=does-not-exist', { waitUntil: 'networkidle' });
    await expect(page.locator('.cc-search-input')).toBeVisible();
    await page.waitForTimeout(800);
    expect(new URL(page.url()).searchParams.get('tracker')).toBeNull();
  });
});
