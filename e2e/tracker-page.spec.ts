import { test, expect } from '@playwright/test';

test.describe('Tracker Page', () => {
  test('iran-conflict page loads with header headline', async ({ page }) => {
    await page.goto('./iran-conflict/');

    // The page should have a headline in the header bar
    const headline = page.locator('.header-headline-text');
    await expect(headline).toBeVisible();
    await expect(headline).not.toBeEmpty();

    // The header should show the operation name
    const header = page.locator('.site-header');
    await expect(header).toBeVisible();
  });

  test('KPI ticker shows values', async ({ page }) => {
    await page.goto('./iran-conflict/');

    // KPI items should be visible in the ticker strip
    const kpiItems = page.locator('.kpi-ticker-item');
    const count = await kpiItems.count();
    expect(count).toBeGreaterThan(0);

    // Each KPI should have a label and a value
    const firstKpi = kpiItems.first();
    const label = firstKpi.locator('.kpi-ticker-label');
    const value = firstKpi.locator('.kpi-ticker-value');
    await expect(label).toBeVisible();
    await expect(value).toBeVisible();
    await expect(value).not.toBeEmpty();
  });

  test('navigation links work (About, Globe)', async ({ page }) => {
    await page.goto('./iran-conflict/');

    // Header nav should have About and Globe links
    const aboutLink = page.locator('.about-nav-btn');
    await expect(aboutLink).toBeVisible();
    await expect(aboutLink).toContainText('About');

    const globeLink = page.locator('.globe-nav-btn');
    await expect(globeLink).toBeVisible();
    await expect(globeLink).toContainText('3D Globe');

    // Verify the href values are correct
    const aboutHref = await aboutLink.getAttribute('href');
    expect(aboutHref).toBe('/watchboard/iran-conflict/about/');

    const globeHref = await globeLink.getAttribute('href');
    expect(globeHref).toBe('/watchboard/iran-conflict/globe/');
  });

  test('/es/iran-conflict/ loads Spanish version', async ({ page }) => {
    await page.goto('./es/iran-conflict/');

    // The page should load successfully with a header headline
    const headline = page.locator('.header-headline-text');
    await expect(headline).toBeVisible();
    await expect(headline).not.toBeEmpty();

    // The header should still be present
    const header = page.locator('.site-header');
    await expect(header).toBeVisible();
  });
});
