import { test, expect } from '@playwright/test';

const GDACS = {
  version: 1, generated: new Date().toISOString(), source: 'GDACS', license: 'CC BY 4.0', attribution: 'GDACS', windowDays: 7,
  alerts: [{ id: 'EQ1', eventId: '1', eventType: 'EQ', level: 'Red', title: 'Fixture quake near Lviv', url: 'https://www.gdacs.org/report.aspx?eventid=1', country: 'Ukraine', iso3: 'UKR', lat: 49.84, lon: 24.03, severity: 'Magnitude 6.5M', severityValue: 6.5, severityUnit: 'M', population: null, fromDate: new Date().toISOString(), toDate: new Date().toISOString(), published: new Date().toISOString(), modified: new Date().toISOString(), isCurrent: true }],
};

test.describe('E5 geo layers on the 2D map', () => {
  test('static nuclear-plants layer and GDACS alerts toggle on the Ukraine map', async ({ page }) => {
    await page.route('**/_hourly/gdacs.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GDACS) }));
    await page.goto('./ukraine-war/?lat=49&lon=31&zoom=5');
    const map = page.locator('.leaflet-container:visible').first();
    await expect(map).toBeVisible({ timeout: 30_000 });
    await map.scrollIntoViewIfNeeded();
    await page.locator('.map-layers-toggle:visible').first().click();
    const panel = page.locator('.map-layers-panel:visible').first();

    await panel.locator('[data-layer="nuclear-plants"]').click();
    // Wikidata-derived plants render as circle markers inside the static pane.
    await expect(page.locator('.leaflet-static-nuclear-plants-pane path').first()).toBeVisible({ timeout: 15_000 });
    await expect(panel.locator('[data-layer="nuclear-plants"] .map-layer-count')).toBeVisible();

    await panel.locator('[data-layer="gdacs-alerts"]').click();
    await expect(panel.locator('[data-layer="gdacs-alerts"] .map-layer-count')).toHaveText('1');
    // The layer ids are written to the shareable URL.
    await page.waitForFunction(() => (new URLSearchParams(location.search).get('layers') ?? '').includes('gdacs-alerts'), null, { timeout: 5_000 });
  });

  test('the sources page lists every registered layer', async ({ page }) => {
    await page.goto('./sources/');
    await expect(page.locator('.sources-table').first()).toBeVisible();
    await expect(page.locator('.sources-table').first()).toContainText('gdacs-alerts');
    await expect(page.locator('.sources-table').nth(1)).toContainText('nuclear-plants');
  });
});
