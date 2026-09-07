import { test, expect } from '@playwright/test';

const FIXTURE = {
  version: 1,
  generated: new Date(Date.now() - 5 * 60_000).toISOString(),
  windowHours: 72,
  entries: [
    {
      id: 'a1', timestamp: new Date(Date.now() - 10 * 60_000).toISOString(), tracker: 'iran-conflict',
      title: 'Fixture: strike reported near Isfahan', url: 'https://example.test/a1', source: 'reuters',
      sourceTier: 2, score: 0.95, severity: 'critical', decision: 'update', feedOrigin: 'rss', scanType: 'light',
    },
    {
      id: 'a2', timestamp: new Date(Date.now() - 40 * 60_000).toISOString(), tracker: null,
      title: 'Fixture: something entirely new happened', url: 'https://example.test/a2', source: 'bsky:apnews.com',
      sourceTier: 2, score: 0.88, severity: 'critical', decision: 'new_tracker', feedOrigin: 'bluesky', scanType: 'heavy',
    },
    {
      id: 'a3', timestamp: new Date(Date.now() - 3 * 3_600_000).toISOString(), tracker: 'mexico-history',
      title: 'Fixture: a lower-confidence update', url: 'https://example.test/a3', source: 'eluniversal',
      sourceTier: 3, score: 0.86, severity: 'high', decision: 'update', feedOrigin: 'rss', scanType: 'light',
    },
  ],
};

test.describe('Alerts panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/_hourly/alerts.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE) }));
    await page.goto('./', { waitUntil: 'networkidle' });
    await expect(page.locator('.cc-search-input')).toBeVisible();
  });

  test('nav button shows the count and opens the panel with severities and filters', async ({ page }) => {
    await expect(page.getByTestId('alerts-count')).toHaveText('3');
    await page.getByTestId('alerts-toggle').click();
    const panel = page.getByTestId('alerts-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.alerts-item')).toHaveCount(3);
    await expect(panel.locator('.alerts-item').first()).toHaveAttribute('data-severity', 'critical');
    await expect(panel.locator('.alerts-item').first()).toContainText('Isfahan');

    await panel.getByRole('tab', { name: /Critical|Críticas/ }).click();
    await expect(panel.locator('.alerts-item')).toHaveCount(2);
    await panel.getByRole('tab', { name: /New topics|Temas nuevos/ }).click();
    await expect(panel.locator('.alerts-item')).toHaveCount(1);
    await expect(panel.locator('.alerts-item')).toContainText('entirely new');
  });

  test('A toggles the panel and Escape closes it', async ({ page }) => {
    await page.keyboard.press('a');
    await expect(page.getByTestId('alerts-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('alerts-panel')).toHaveCount(0);
  });

  test('clicking an alert selects its tracker', async ({ page }) => {
    await page.getByTestId('alerts-toggle').click();
    await page.getByTestId('alerts-panel').locator('.alerts-item-main').first().click();
    await page.waitForTimeout(600);
    expect(new URL(page.url()).searchParams.get('tracker')).toBe('iran-conflict');
  });

  test('a broken feed shows an honest error instead of an empty panel', async ({ page }) => {
    await page.route('**/_hourly/alerts.json', route => route.fulfill({ status: 503, body: 'nope' }));
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByTestId('alerts-toggle').click();
    await expect(page.getByTestId('alerts-error')).toBeVisible();
  });
});
