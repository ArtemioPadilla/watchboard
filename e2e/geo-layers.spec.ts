import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GDACS = {
  version: 1, generated: new Date().toISOString(), source: 'GDACS', license: 'CC BY 4.0', attribution: 'GDACS', windowDays: 7,
  alerts: [{ id: 'EQ1', eventId: '1', eventType: 'EQ', level: 'Red', title: 'Fixture quake near Lviv', url: 'https://www.gdacs.org/report.aspx?eventid=1', country: 'Ukraine', iso3: 'UKR', lat: 49.84, lon: 24.03, severity: 'Magnitude 6.5M', severityValue: 6.5, severityUnit: 'M', population: null, fromDate: new Date().toISOString(), toDate: new Date().toISOString(), published: new Date().toISOString(), modified: new Date().toISOString(), isCurrent: true }],
};

const DEEPSTATE = JSON.parse(readFileSync(resolve(__dirname, '../tests/fixtures/deepstate-sample.json'), 'utf8'));
const TOUR_DONE = () => {
  const done = JSON.stringify({ completed: true, completedAt: '2026-01-01T00:00:00.000Z', replayCount: 0 });
  localStorage.setItem('watchboard-tour-desktop-v1', done);
  localStorage.setItem('watchboard-tour-mobile-v1', done);
};

test.describe('E5 geo layers on the 2D map', () => {
  test.beforeEach(async ({ page }) => { await page.addInitScript(TOUR_DONE); });
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

  test('the DeepState frontline renders as polygons on the Ukraine map and rides in the share URL', async ({ page }) => {
    await page.route('https://deepstatemap.live/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DEEPSTATE) }));
    await page.goto('./ukraine-war/?lat=48.5&lon=37&zoom=7');
    const map = page.locator('.leaflet-container:visible').first();
    await expect(map).toBeVisible({ timeout: 30_000 });
    await map.scrollIntoViewIfNeeded();
    // The frontline is on by default for the Ukraine tracker: polygons in their own pane.
    await expect(page.locator('.leaflet-frontline-pane path').first()).toBeAttached({ timeout: 20_000 });
    const n = await page.locator('.leaflet-frontline-pane path').count();
    expect(n).toBeGreaterThan(5);
    await page.waitForFunction(() => (new URLSearchParams(location.search).get('layers') ?? '').includes('deepstate-frontline'), null, { timeout: 5_000 });
    // Toggling it off empties the pane and drops it from the URL.
    await page.locator('.map-layers-toggle:visible').first().click();
    const panel = page.locator('.map-layers-panel:visible').first();
    await panel.locator('[data-layer="deepstate-frontline"]').click();
    await expect(page.locator('.leaflet-frontline-pane path')).toHaveCount(0);
    await page.waitForFunction(() => !(new URLSearchParams(location.search).get('layers') ?? '').includes('deepstate-frontline'), null, { timeout: 5_000 });
  });
});

test.describe('E5 geo layers on the Cesium globe', () => {
  test('GDACS alerts toggle on the Ukraine globe with a count', async ({ page }) => {
    await page.addInitScript(TOUR_DONE);
    await page.route('**/_hourly/gdacs.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GDACS) }));
    await page.goto('./ukraine-war/globe/?lat=49&lon=31&alt=1500000');
    await expect(page.locator('.globe-toolbar')).toBeVisible({ timeout: 60_000 });
    await page.locator('.globe-toolbar-icon').first().click(); // filters section
    const toggle = page.locator('[data-layer="gdacs-alerts"]').first();
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle.locator('.globe-filter-count')).toHaveText('1', { timeout: 15_000 });
    await page.waitForFunction(() => (new URLSearchParams(location.search).get('layers') ?? '').includes('gdacs-alerts'), null, { timeout: 5_000 });
  });
});
