import { test, expect } from '@playwright/test';

// Plan E9: generated copy is labelled, claims carry an epistemic status,
// degraded sources are listed (or the block is absent when all is well).
test.describe('Provenance and honesty UI', () => {
  test('hero headline carries a provenance badge, missing provenance is shown not hidden', async ({ page }) => {
    await page.goto('./iran-conflict/');
    const badge = page.locator('.hero-kpi-headline .provenance-badge');
    await expect(badge).toBeVisible();
    const kind = await badge.getAttribute('data-provenance');
    expect(['ai', 'heuristic', 'editorial', 'unknown']).toContain(kind);
    const text = (await badge.textContent())?.trim() ?? '';
    expect(text.length).toBeGreaterThan(0);
    if (kind === 'unknown') expect(text).toMatch(/no provenance recorded/i);
    if (kind === 'ai') expect(text).toMatch(/^AI/);
    await expect(badge).toHaveAttribute('title', /Provenance/);
  });

  test('every claim shows a status, inferred as contested when the data has none', async ({ page }) => {
    await page.goto('./iran-conflict/');
    const claims = page.locator('#sec-contested .claim-card-collapsible');
    const n = await claims.count();
    test.skip(n === 0, 'tracker has no claims section');
    for (let i = 0; i < Math.min(n, 5); i++) {
      const card = claims.nth(i);
      const status = await card.getAttribute('data-claim-status');
      expect(['confirmed', 'contested', 'unverifiable', 'retracted']).toContain(status);
      await expect(card.locator('.claim-status')).toHaveText(new RegExp(status!, 'i'));
    }
  });

  test('degraded-sources block is absent or lists at least one item', async ({ page }) => {
    await page.goto('./iran-conflict/');
    // Let live layers settle enough for the island to render its first tick.
    await page.waitForTimeout(1500);
    const block = page.getByTestId('degraded-sources');
    if (await block.count()) {
      await expect(block.locator('.degraded-item').first()).toBeAttached();
      await expect(block.locator('.degraded-summary')).toContainText(/degraded sources/i);
    } else {
      expect(await block.count()).toBe(0);
    }
  });

  test('daily briefing shows provenance next to each digest summary', async ({ page }) => {
    const res = await page.goto('./briefing/');
    test.skip(!res || res.status() >= 400, 'no briefing index');
    const first = page.locator('a[href*="/briefing/20"]').first();
    test.skip(!(await first.count()), 'no briefing days');
    await first.click();
    const digest = page.locator('.group-digest');
    test.skip(!(await digest.count()), 'no digest on this day');
    await expect(digest.first().locator('.provenance-badge')).toBeVisible();
  });
});
