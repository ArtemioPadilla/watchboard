import { test, expect } from '@playwright/test';

test.describe('2D map shareable view state', () => {
  test('restores centre, zoom and layers from the URL', async ({ page }) => {
    await page.goto('./iran-conflict/?lat=30&lon=50&zoom=6&layers=earthquakes,terminator');
    const map = page.locator('.leaflet-container:visible').first();
    await expect(map).toBeVisible({ timeout: 30_000 });
    await map.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);

    // Reading: the two layers named in the URL are the active ones.
    await page.locator('.map-layers-toggle:visible').first().click();
    await expect(page.locator('.map-layers-panel:visible .map-layer-item.active')).toHaveCount(2);
    await expect(page.locator('.map-layers-panel:visible .map-layer-item.active').nth(0)).toContainText(/Earthquakes/i);

    // Writing: a real zoom changes the URL to the new zoom (not the value we typed).
    await page.locator('.leaflet-control-zoom-in:visible').first().click();
    await page.waitForFunction(() => new URLSearchParams(location.search).get('zoom') === '7', null, { timeout: 5_000 });
    const params = new URLSearchParams(new URL(page.url()).search);
    expect(Number(params.get('zoom'))).toBe(7);
    expect(Math.abs(Number(params.get('lat')) - 30)).toBeLessThan(0.3);
    expect(Math.abs(Number(params.get('lon')) - 50)).toBeLessThan(0.5);
    expect(params.get('layers')).toBe('earthquakes,terminator');
  });

  test('the share button copies the current URL', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('./iran-conflict/?lat=30&lon=50&zoom=6');
    await expect(page.locator('.leaflet-container:visible').first()).toBeVisible({ timeout: 30_000 });
    await page.locator('.map-layers-toggle:visible').first().click();
    await page.locator('.map-layers-share:visible').first().click();
    await expect(page.locator('.map-layers-share:visible').first()).toHaveAttribute('data-status', 'copied');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('zoom=6');
    expect(clip).toContain('lat=');
  });
});
