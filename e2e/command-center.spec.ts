import { test, expect } from '@playwright/test';

test.describe('Command Center', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    // Wait for React hydration — sidebar search input appears after hydration
    await page.locator('.cc-search-input').waitFor({ state: 'visible' });
  });

  test('page loads with globe and sidebar visible', async ({ page }) => {
    const globe = page.locator('.cc-globe');
    await expect(globe).toBeVisible();

    const sidebar = page.locator('.cc-sidebar');
    await expect(sidebar).toBeVisible();

    // The page has the correct application role
    const root = page.locator('.command-center-root');
    await expect(root).toHaveAttribute('role', 'application');
  });

  test('search input filters tracker list', async ({ page }) => {
    const searchInput = page.locator('.cc-search-input');
    await expect(searchInput).toBeVisible();

    // Count initial tracker rows
    const initialRows = page.locator('.cc-tracker-row');
    const initialCount = await initialRows.count();
    expect(initialCount).toBeGreaterThan(0);

    // Type a search query that should narrow results
    await searchInput.fill('iran');
    await page.waitForTimeout(300); // debounce

    const filteredRows = page.locator('.cc-tracker-row');
    const filteredCount = await filteredRows.count();
    expect(filteredCount).toBeLessThan(initialCount);
    expect(filteredCount).toBeGreaterThan(0);

    // Clear search restores all rows
    await searchInput.fill('');
    await page.waitForTimeout(300);

    const restoredRows = page.locator('.cc-tracker-row');
    const restoredCount = await restoredRows.count();
    expect(restoredCount).toBe(initialCount);
  });

  test('clicking a tracker in sidebar expands it', async ({ page }) => {
    // Click the first tracker row
    const firstRow = page.locator('.cc-tracker-row').first();
    await expect(firstRow).toBeVisible();

    const trackerName = await firstRow.locator('.cc-tracker-name').textContent();
    await firstRow.click();

    // An expanded row should appear
    const expandedRow = page.locator('.cc-tracker-expanded');
    await expect(expandedRow).toBeVisible();

    // The expanded row should contain the same tracker name
    await expect(expandedRow).toContainText(trackerName!);
  });

  test('clicking expanded tracker shows OPEN DASHBOARD link', async ({ page }) => {
    // Click the first tracker row to expand it
    const firstRow = page.locator('.cc-tracker-row').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();

    const expandedRow = page.locator('.cc-tracker-expanded');
    await expect(expandedRow).toBeVisible();

    // The expanded row should have an "OPEN DASHBOARD" link
    const openLink = expandedRow.locator('.cc-open-link');
    await expect(openLink).toBeVisible();
    await expect(openLink).toContainText('OPEN DASHBOARD');

    // The link should point to a valid tracker URL
    const href = await openLink.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toMatch(/\/watchboard\/.*\//);
  });

  test('keyboard shortcut ? opens help overlay', async ({ page }) => {
    // Click on the page heading to ensure focus is on the page, not an input
    await page.locator('h1').click();

    // Ensure help overlay is not visible initially
    const helpTitle = page.getByText('KEYBOARD SHORTCUTS');
    await expect(helpTitle).not.toBeVisible();

    // Press ? using dispatchEvent to bypass keyboard layout issues
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    });
    await expect(helpTitle).toBeVisible();

    // Verify shortcut keys are listed
    await expect(page.getByText('Focus search')).toBeVisible();
  });

  test('keyboard shortcut Escape closes help overlay', async ({ page }) => {
    // Click on the page heading to ensure focus is on the page, not an input
    await page.locator('h1').click();

    // Open help overlay first
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    });

    const helpTitle = page.getByText('KEYBOARD SHORTCUTS');
    await expect(helpTitle).toBeVisible();

    // Press Escape to close
    await page.keyboard.press('Escape');
    await expect(helpTitle).not.toBeVisible();
  });

  test('EN/ES toggle switches UI text', async ({ page }) => {
    // The search placeholder should be in English by default
    const searchInput = page.locator('.cc-search-input');
    await expect(searchInput).toHaveAttribute('placeholder', /Search trackers/);

    // Find the language toggle button by its title attribute
    const langToggle = page.locator('button[title="Change language"]');
    await expect(langToggle).toBeVisible();
    await langToggle.click();

    // After one click, locale cycles to ES — search placeholder should be in Spanish
    await expect(searchInput).toHaveAttribute('placeholder', /Buscar/);

    // Click 3 more times to cycle back to EN (ES -> FR -> PT -> EN)
    await langToggle.click(); // FR
    await langToggle.click(); // PT
    await langToggle.click(); // EN

    await expect(searchInput).toHaveAttribute('placeholder', /Search trackers/);
  });

  test('follow button toggles star icon', async ({ page }) => {
    // Click a tracker to expand it
    const firstRow = page.locator('.cc-tracker-row').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();

    const expandedRow = page.locator('.cc-tracker-expanded');
    await expect(expandedRow).toBeVisible();

    // Find the follow button (shows hollow star when not followed)
    const followBtn = expandedRow.getByText(/FOLLOW/i).first();
    await expect(followBtn).toBeVisible();

    // Verify it shows the unfollowed state (hollow star)
    await expect(followBtn).toContainText('\u2606'); // ☆

    // Click to follow
    await followBtn.click();

    // Should now show filled star
    const followedBtn = expandedRow.getByText(/FOLLOWING/i).first();
    await expect(followedBtn).toBeVisible();
    await expect(followedBtn).toContainText('\u2605'); // ★

    // Click again to unfollow
    await followedBtn.click();

    const unfollowedBtn = expandedRow.getByText(/FOLLOW/i).first();
    await expect(unfollowedBtn).toContainText('\u2606'); // ☆
  });
});
