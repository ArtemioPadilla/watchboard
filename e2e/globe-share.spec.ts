import { test, expect } from '@playwright/test';

/**
 * E1 acceptance: a globe URL with camera + layers reproduces that view, and
 * the URL is rewritten from the real camera after it settles. Because the
 * writer round-trips through Cesium's camera, the parameters coming back
 * prove the camera actually landed there (within rounding), which is the
 * regression the plan guards against: a share link that silently drops
 * its location.
 */
test.describe('Globe shareable view state', () => {
  test('restores camera and layers from the URL and keeps them in sync', async ({ page }) => {
    await page.goto('./iran-conflict/globe/?lat=33.3&lon=44.4&alt=250000&heading=90&pitch=-45&layers=flights,quakes');

    await expect(page.locator('.globe-toolbar')).toBeVisible({ timeout: 45_000 });

    // The writer only runs once the Cesium viewer exists, and it adds `date`,
    // which the navigation URL did not carry: that is the real readiness gate.
    await page.waitForFunction(() => new URLSearchParams(location.search).has('date'), null, { timeout: 45_000 });
    await page.waitForTimeout(800);

    const params = new URLSearchParams(new URL(page.url()).search);
    const lat = Number(params.get('lat'));
    const lon = Number(params.get('lon'));
    const alt = Number(params.get('alt'));
    expect(Math.abs(lat - 33.3)).toBeLessThan(0.34);   // 1 %
    expect(Math.abs(lon - 44.4)).toBeLessThan(0.45);
    expect(Math.abs(alt - 250_000) / 250_000).toBeLessThan(0.05);
    expect(params.get('layers')).toBe('flights,quakes');
    expect(params.get('date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('a broken parameter does not break the page', async ({ page }) => {
    await page.goto('./iran-conflict/globe/?lat=abc&lon=999&layers=bogus');
    await expect(page.locator('.globe-toolbar')).toBeVisible({ timeout: 45_000 });
    await page.waitForFunction(() => new URLSearchParams(location.search).has('date'), null, { timeout: 45_000 });
    await page.waitForTimeout(800);
    const params = new URLSearchParams(new URL(page.url()).search);
    // The writer replaced the junk with the real camera and dropped the unknown layer.
    expect(Number.isFinite(Number(params.get('lat')))).toBe(true);
    expect(params.get('layers') ?? '').not.toContain('bogus');
  });
});
