import { test, expect } from '@playwright/test';

test.describe('Tracker Page', () => {
  test('iran-conflict page loads with hero headline', async ({ page }) => {
    await page.goto('./iran-conflict/');

    // The page should have a hero headline
    const headline = page.locator('.hero-kpi-headline');
    await expect(headline).toBeVisible();
    await expect(headline).not.toBeEmpty();

    // The header should show the operation name
    const header = page.locator('.site-header');
    await expect(header).toBeVisible();
  });

  test('KPI strip shows values', async ({ page }) => {
    await page.goto('./iran-conflict/');

    // KPI items should be visible in the hero section
    const kpiItems = page.locator('.hero-kpi-item');
    const count = await kpiItems.count();
    expect(count).toBeGreaterThan(0);

    // Each KPI should have a label and a value
    const firstKpi = kpiItems.first();
    const label = firstKpi.locator('.hero-kpi-label');
    const value = firstKpi.locator('.hero-kpi-value');
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
    // Base-agnostic on purpose: these were pinned to '/watchboard/...' from the
    // days of a GitHub Pages subpath, and astro.config.mjs has had `base: '/'`
    // for long enough that this spec was parked as "not known to pass" rather
    // than fixed. Matching the tail survives the next base change too.
    expect(aboutHref).toMatch(/\/iran-conflict\/about\/$/);

    const globeHref = await globeLink.getAttribute('href');
    expect(globeHref).toMatch(/\/iran-conflict\/globe\/$/);
  });

  test('/es/iran-conflict/ loads Spanish version', async ({ page }) => {
    await page.goto('./es/iran-conflict/');

    // The page should load successfully with a hero headline
    const headline = page.locator('.hero-kpi-headline');
    await expect(headline).toBeVisible();
    await expect(headline).not.toBeEmpty();

    // The header should still be present
    const header = page.locator('.site-header');
    await expect(header).toBeVisible();
  });
});
