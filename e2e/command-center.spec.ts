import { test, expect } from '@playwright/test';

/**
 * The homepage command center.
 *
 * This spec sat outside the CI list as "not yet known to pass" from before the
 * E1 work. Measured on 2026-10-19: 7 of its 8 tests failed, all for the same
 * reason — the sidebar rows were renamed `.cc-tracker-row` → `.cc-feed-row`
 * (and `.cc-tracker-name` → `.cc-feed-name`) when the feed buckets landed, so
 * every test that began by clicking a row found nothing. Two assertions were
 * wrong in their own right: the open-dashboard href was still pinned to the
 * `/watchboard/` base the site stopped using, and the language toggle was
 * located by `title="Change language"`, which is neither its text nor stable —
 * the title is localised, so it changes under the test that clicks it.
 */
test.describe('Command Center', () => {
  /** The sidebar rows. Renamed once already; named once here. */
  const ROW = '.cc-feed-row';
  const EXPANDED = '.cc-tracker-expanded';

  test.beforeEach(async ({ page }) => {
    await page.goto('./', { waitUntil: 'networkidle' });
    // Hydration: the search input is interactive once React has attached.
    const searchInput = page.locator('.cc-search-input');
    await expect(searchInput).toBeVisible();
    await searchInput.focus();
    await searchInput.blur();
    // A tour overlay on first visit would swallow every click below.
    await page.evaluate(() => {
      try {
        localStorage.setItem('watchboard-tour-desktop-v1', JSON.stringify({ completed: true }));
        localStorage.setItem('watchboard-tour-mobile-v1', JSON.stringify({ completed: true }));
      } catch { /* private mode */ }
    });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator(ROW).first()).toBeVisible();
  });

  test('page loads with globe and sidebar visible', async ({ page }) => {
    await expect(page.locator('.cc-globe')).toBeVisible();
    await expect(page.locator('.cc-sidebar')).toBeVisible();
    await expect(page.locator('.command-center-root')).toHaveAttribute('role', 'application');
  });

  test('search input filters tracker list', async ({ page }) => {
    const searchInput = page.locator('.cc-search-input');
    const initialCount = await page.locator(ROW).count();
    expect(initialCount).toBeGreaterThan(0);

    await searchInput.fill('iran');
    await expect.poll(() => page.locator(ROW).count()).toBeLessThan(initialCount);
    expect(await page.locator(ROW).count()).toBeGreaterThan(0);

    await searchInput.fill('');
    await expect.poll(() => page.locator(ROW).count()).toBe(initialCount);
  });

  test('clicking a tracker in sidebar expands it', async ({ page }) => {
    const firstRow = page.locator(ROW).first();
    const trackerName = (await firstRow.locator('.cc-feed-name').textContent())?.trim();
    expect(trackerName).toBeTruthy();
    await firstRow.click();

    const expanded = page.locator(EXPANDED);
    await expect(expanded).toBeVisible();
    await expect(expanded).toContainText(trackerName!);
  });

  test('expanded tracker offers a link to its dashboard', async ({ page }) => {
    await page.locator(ROW).first().click();
    const expanded = page.locator(EXPANDED);
    await expect(expanded).toBeVisible();

    const openLink = expanded.locator('.cc-open-link');
    await expect(openLink).toBeVisible();
    await expect(openLink).toContainText('OPEN DASHBOARD');

    // `base` is '/' — this used to assert the `/watchboard/` prefix the site
    // served from GitHub Pages' project path before the custom domain.
    const href = await openLink.getAttribute('href');
    expect(href).toMatch(/^\/[^/]+\/$/);
  });

  test('keyboard shortcut ? opens the help overlay, Escape closes it', async ({ page }) => {
    const helpTitle = page.getByText('KEYBOARD SHORTCUTS');
    await expect(helpTitle).not.toBeVisible();

    // Focus has to leave the search input, or `?` is just a character.
    await page.locator(ROW).first().click();
    await expect(page.locator(EXPANDED)).toBeVisible();

    await page.keyboard.press('?');
    await expect(helpTitle).toBeVisible();
    await expect(page.getByText('Focus search')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(helpTitle).not.toBeVisible();
  });

  test('the language toggle cycles en → es → fr → pt → en', async ({ page }) => {
    const searchInput = page.locator('.cc-search-input');
    await expect(searchInput).toHaveAttribute('placeholder', /Search trackers/);

    const langToggle = page.getByTestId('language-toggle');
    await expect(langToggle).toBeVisible();

    await langToggle.click();
    await expect(searchInput).toHaveAttribute('placeholder', /Buscar rastreadores/);
    await langToggle.click();
    await expect(searchInput).toHaveAttribute('placeholder', /Rechercher/);
    await langToggle.click();
    await expect(searchInput).toHaveAttribute('placeholder', /Buscar trackers/);
    await langToggle.click();
    await expect(searchInput).toHaveAttribute('placeholder', /Search trackers/);
  });

  test('follow button toggles star icon', async ({ page }) => {
    await page.locator(ROW).first().click();
    const expanded = page.locator(EXPANDED);
    await expect(expanded).toBeVisible();

    const followBtn = expanded.getByText(/FOLLOW$/i).first();
    await expect(followBtn).toBeVisible();
    await expect(followBtn).toContainText('☆'); // ☆

    await followBtn.click();

    const followedBtn = expanded.getByText(/FOLLOWING/i).first();
    await expect(followedBtn).toBeVisible();
    await expect(followedBtn).toContainText('★'); // ★
  });
});
