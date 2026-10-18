import { test, expect } from '@playwright/test';

/**
 * /search had no e2e coverage at all, which is how a change to it could reach
 * main with only a type check behind it.
 *
 * In dev there is no Pagefind index (it is built by the postbuild step), so the
 * script's failure path runs and the client-side tracker filter is exactly what
 * a visitor sees. That makes dev the right place to exercise it.
 */
test.describe('search page fallback filter', () => {
  test('lists trackers and filters them', async ({ page }) => {
    await page.goto('/search/');
    const box = page.locator('#search-fallback');
    await expect(box).toBeVisible({ timeout: 15_000 });

    const items = page.locator('#search-fallback-list li');
    const total = await items.count();
    expect(total).toBeGreaterThan(20);

    // The list is parsed from a data attribute; if that parse failed we would
    // see the box with an empty list and no working input.
    const input = page.locator('#search-fallback-input');
    await input.fill('iran');
    await expect.poll(async () => items.count()).toBeLessThan(total);
    await expect(items.first()).toContainText(/iran/i);

    await input.fill('zzzzzzzz');
    await expect(page.locator('.search-fallback-empty')).toBeVisible();
  });

  test('no tracker name is serialised into a script element', async ({ page }) => {
    // Astro 5.18 has an XSS in define:vars (incomplete `</script>`
    // sanitisation). Tracker names and tags are the only data-derived strings
    // this site would put in a script body, and they are written by an agent
    // from an operator-supplied topic. They ride in a data attribute instead,
    // where escaping is not script context. This test is the thing that would
    // notice if they moved back.
    await page.goto('/search/');
    await expect(page.locator('#search-fallback')).toBeVisible({ timeout: 15_000 });

    const names = await page.locator('#search-fallback-list li a').allTextContents();
    expect(names.length).toBeGreaterThan(20);

    const scripts = await page.locator('script').evaluateAll((els) =>
      els.map((el) => el.textContent ?? ''),
    );
    const inline = scripts.join('\n');
    const leaked = names.filter((n) => n.length > 6 && inline.includes(n));
    expect(leaked, `tracker names found inside a <script> element: ${leaked.slice(0, 3).join(', ')}`).toEqual([]);
  });
});
