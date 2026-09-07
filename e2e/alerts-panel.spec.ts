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
      geo: { lat: 32.65, lon: 51.67, place: 'Isfahan' },
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

// The first-visit tour is a modal that intercepts every click; mark it done
// before the page scripts run (same keys as src/lib/onboarding.ts).
const TOUR_DONE = () => {
  const done = JSON.stringify({ completed: true, completedAt: '2026-01-01T00:00:00.000Z', replayCount: 0 });
  localStorage.setItem('watchboard-tour-desktop-v1', done);
  localStorage.setItem('watchboard-tour-mobile-v1', done);
};

test.describe('Alerts panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(TOUR_DONE);
    await page.route('**/_hourly/alerts.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE) }));
    await page.goto('./', { waitUntil: 'load' });
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
    // The URL writer is debounced; poll instead of sleeping a fixed time.
    await expect.poll(() => new URL(page.url()).searchParams.get('tracker'), { timeout: 5_000 }).toBe('iran-conflict');
  });

  test('the link icon opens the source in a new tab and refuses non-http URLs', async ({ page }) => {
    const bad = { ...FIXTURE, entries: [{ ...FIXTURE.entries[0], id: 'js', url: 'javascript:alert(1)' }, FIXTURE.entries[1]] };
    await page.route('**/_hourly/alerts.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bad) }));
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('alerts-toggle').click();
    const items = page.getByTestId('alerts-panel').locator('.alerts-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0).getByTestId('alert-open-source')).toHaveCount(0);
    const link = items.nth(1).getByTestId('alert-open-source');
    await expect(link).toHaveAttribute('href', 'https://example.test/a2');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });

  test('an alert with geo shows a pin and clicking it does not navigate away', async ({ page }) => {
    await page.getByTestId('alerts-toggle').click();
    const first = page.getByTestId('alerts-panel').locator('.alerts-item').first();
    const pin = first.locator('.alerts-action', { hasText: '◎' });
    await expect(pin).toBeVisible();
    await expect(page.getByTestId('alerts-panel').locator('.alerts-item').nth(1).locator('.alerts-action', { hasText: '◎' })).toHaveCount(0);
    const before = page.url();
    await pin.click();
    await page.waitForTimeout(300);
    expect(page.url().split('?')[0]).toBe(before.split('?')[0]);
    await expect(page.getByTestId('alerts-panel')).toBeVisible();
  });

  test('Earthquakes filter lists M≥4.5 quakes from USGS with a live count', async ({ page }) => {
    const usgs = {
      type: 'FeatureCollection',
      features: [
        { id: 'q1', properties: { mag: 6.1, place: '120 km S of Fixture Island', time: Date.now() - 30 * 60_000, url: 'https://earthquake.usgs.gov/q1' }, geometry: { type: 'Point', coordinates: [140.1, 35.6, 10] } },
        { id: 'q2', properties: { mag: 4.7, place: 'Fixture Trench', time: Date.now() - 2 * 3_600_000, url: 'https://earthquake.usgs.gov/q2' }, geometry: { type: 'Point', coordinates: [-70.2, -33.4, 40] } },
      ],
    };
    await page.route('**/earthquake.usgs.gov/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(usgs) }));
    await page.getByTestId('alerts-toggle').click();
    const panel = page.getByTestId('alerts-panel');
    const quakesTab = panel.getByRole('tab', { name: /Earthquakes|Sismos/ });
    // Count is fetched as soon as the panel opens, before the tab is chosen.
    await expect(quakesTab.locator('.alerts-filter-count')).toHaveText('2');
    await quakesTab.click();
    const rows = panel.locator('.alerts-item');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('M6.1');
    await expect(rows.first()).toContainText('USGS');
  });

  test('a new alert arriving on the next poll appears highlighted and bumps the counter', async ({ page }) => {
    let calls = 0;
    const extra = {
      id: 'a4', timestamp: new Date().toISOString(), tracker: 'iran-conflict',
      title: 'Fixture: brand new alert from the next scan', url: 'https://example.test/a4', source: 'reuters',
      sourceTier: 2, score: 0.9, severity: 'critical', decision: 'update', feedOrigin: 'rss', scanType: 'light',
    };
    await page.clock.install();
    await page.route('**/_hourly/alerts.json', route => {
      calls++;
      const body = calls === 1 ? FIXTURE : { ...FIXTURE, generated: new Date().toISOString(), entries: [extra, ...FIXTURE.entries] };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('alerts-toggle').click();
    await expect(page.getByTestId('alerts-panel').locator('.alerts-item')).toHaveCount(3);
    await expect(page.getByTestId('alerts-count')).toHaveText('3');
    // useLiveSource polls at the 5-minute TTL; jump past it. fastForward fires
    // each pending timer once — runFor would replay five minutes of globe
    // animation frames and never return.
    await page.clock.fastForward(5 * 60_000 + 1_000);
    await expect(page.getByTestId('alerts-count')).toHaveText('4');
    const first = page.getByTestId('alerts-panel').locator('.alerts-item').first();
    await expect(first).toContainText('brand new alert');
    await expect(first).toHaveAttribute('data-new', 'true');
  });

  test('a broken feed shows an honest error instead of an empty panel', async ({ page }) => {
    await page.route('**/_hourly/alerts.json', route => route.fulfill({ status: 503, body: 'nope' }));
    await page.reload({ waitUntil: 'load' });
    await page.getByTestId('alerts-toggle').click();
    await expect(page.getByTestId('alerts-error')).toBeVisible();
  });
});

test.describe('Alerts on the mobile tracker feed', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the feed tab lists alerts for this tracker only', async ({ page }) => {
    await page.addInitScript(TOUR_DONE);
    await page.route('**/_hourly/alerts.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE) }));
    await page.goto('./iran-conflict/', { waitUntil: 'load' });
    const section = page.locator('.mtab-alerts');
    await expect(section).toBeVisible();
    await expect(section.locator('.mtab-alerts-title')).toContainText('1');
    await expect(section.locator('.alerts-item')).toHaveCount(1);
    await expect(section.locator('.alerts-item')).toContainText('Isfahan');
    // Compact mode: no filter row on mobile.
    await expect(section.locator('.alerts-filters')).toHaveCount(0);
  });
});
