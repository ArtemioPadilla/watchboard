import { test, expect } from '@playwright/test';

// E6.H2: geolocated light-scan candidates appear on the homepage globe as
// dotted, explicitly unverified pins; resolved ones (a tracker event cites
// the URL) do not.
const FIXTURE = {
  version: 1,
  generated: new Date(Date.now() - 5 * 60_000).toISOString(),
  windowHours: 72,
  entries: [
    {
      id: 'p1', timestamp: new Date(Date.now() - 10 * 60_000).toISOString(), tracker: 'ukraine-war',
      title: 'Fixture: explosion reported in Kharkiv', url: 'https://example.test/p1', source: 'reuters',
      sourceTier: 2, score: 0.9, severity: 'critical', decision: 'update', feedOrigin: 'rss', scanType: 'light',
      geo: { lat: 49.99, lon: 36.23, place: 'Kharkiv', method: 'gazetteer' },
    },
    {
      id: 'p2', timestamp: new Date(Date.now() - 20 * 60_000).toISOString(), tracker: 'iran-conflict',
      title: 'Fixture: already an event', url: 'https://example.test/p2', source: 'apnews',
      sourceTier: 2, score: 0.9, severity: 'critical', decision: 'update', feedOrigin: 'rss', scanType: 'light',
      geo: { lat: 35.69, lon: 51.39, place: 'Tehran', method: 'gazetteer' }, resolved: true,
    },
    {
      id: 'p3', timestamp: new Date(Date.now() - 30 * 60_000).toISOString(), tracker: null,
      title: 'Fixture: no place mentioned', url: 'https://example.test/p3', source: 'bbc',
      sourceTier: 2, score: 0.88, severity: 'critical', decision: 'new_tracker', feedOrigin: 'rss', scanType: 'heavy',
    },
  ],
};

test.describe('Pending candidate pins on the globe', () => {
  test('only unresolved geolocated alerts become dotted unverified pins', async ({ page }) => {
    await page.route('**/_hourly/alerts.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE) }));
    await page.goto('./', { waitUntil: 'networkidle' });
    await expect(page.locator('.cc-search-input')).toBeVisible();
    const pins = page.locator('.cc-pending-pin');
    await expect(pins).toHaveCount(1, { timeout: 60_000 });
    const pin = pins.first();
    await expect(pin).toHaveAttribute('data-alert-id', 'p1');
    await expect(pin).toHaveAttribute('title', /Unverified candidate|Candidato sin verificar/);
    await expect(pin).toHaveAttribute('title', /reuters/);
    await expect(pin).toHaveAttribute('title', /Kharkiv/);
    const border = await pin.evaluate(el => getComputedStyle(el).borderTopStyle);
    expect(border).toBe('dotted');
  });

  test('the alerts panel offers the pin fly-to for the same entry', async ({ page }) => {
    await page.route('**/_hourly/alerts.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE) }));
    await page.goto('./', { waitUntil: 'networkidle' });
    await page.getByTestId('alerts-toggle').click();
    const items = page.getByTestId('alerts-panel').locator('.alerts-item');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0).locator('.alerts-action', { hasText: '◎' })).toBeVisible();
    await expect(items.nth(2).locator('.alerts-action', { hasText: '◎' })).toHaveCount(0);
  });
});
