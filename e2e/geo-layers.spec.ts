import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const GDACS = {
  version: 1, generated: new Date().toISOString(), source: 'GDACS', license: 'CC BY 4.0', attribution: 'GDACS', windowDays: 7,
  alerts: [{ id: 'EQ1', eventId: '1', eventType: 'EQ', level: 'Red', title: 'Fixture quake near Lviv', url: 'https://www.gdacs.org/report.aspx?eventid=1', country: 'Ukraine', iso3: 'UKR', lat: 49.84, lon: 24.03, severity: 'Magnitude 6.5M', severityValue: 6.5, severityUnit: 'M', population: null, fromDate: new Date().toISOString(), toDate: new Date().toISOString(), published: new Date().toISOString(), modified: new Date().toISOString(), isCurrent: true }],
};

const DEEPSTATE = JSON.parse(readFileSync(new URL('../tests/fixtures/deepstate-sample.json', import.meta.url), 'utf8'));
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
    // Wikidata-derived plants render as circle markers inside the static pane
    // of the visible map (the hidden mobile instance has its own pane).
    await expect.poll(() => page.locator('.leaflet-container:visible .leaflet-static-nuclear-plants-pane path:visible').count(), { timeout: 20_000 }).toBeGreaterThan(0);
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
    const frontPaths = page.locator('.leaflet-container:visible .leaflet-frontline-pane path');
    await expect(frontPaths.first()).toBeAttached({ timeout: 20_000 });
    // Leaflet only draws paths inside the padded viewport; the trimmed fixture has a few there.
    expect(await frontPaths.count()).toBeGreaterThan(0);
    await page.waitForFunction(() => (new URLSearchParams(location.search).get('layers') ?? '').includes('deepstate-frontline'), null, { timeout: 5_000 });
    // Toggling it off empties the pane and drops it from the URL.
    await page.locator('.map-layers-toggle:visible').first().click();
    const panel = page.locator('.map-layers-panel:visible').first();
    await panel.locator('[data-layer="deepstate-frontline"]').click();
    await expect(frontPaths).toHaveCount(0);
    await page.waitForFunction(() => !(new URLSearchParams(location.search).get('layers') ?? '').includes('deepstate-frontline'), null, { timeout: 5_000 });
  });

  test('radio towers on gaza-war say "none tagged" (none mapped), readable without hover, with country names', async ({ page }) => {
    await routeEmptyTowers(page);
    const toggle = await openRadioTowersToggle(page, './gaza-war/');
    await toggle.click(); // runtime path: the fetched (fixture) layer decides
    await expect(toggle.locator('.map-layer-empty')).toHaveText('none tagged', { timeout: 20_000 });
    await expect(toggle).toHaveAccessibleDescription(GAZA_EMPTY);
    await expect(toggle.locator('.map-layer-count')).toHaveCount(0);
  });

  test('radio towers on sahel-insurgency hint at the countries with none mapped (BF, NE) while Mali draws', async ({ page }) => {
    await routeEmptyTowers(page);
    const toggle = await openRadioTowersToggle(page, './sahel-insurgency/');
    await toggle.click();
    await expect(toggle.locator('.map-layer-count')).toHaveText('1', { timeout: 20_000 });
    await expect(toggle.locator('.map-layer-empty')).toHaveText('none tagged: BF, NE');
    await expect(toggle).toHaveAccessibleDescription('No radio-tagged towers in OpenStreetMap for Burkina Faso, Niger');
  });
});

test.describe('E5 geo layers on the mobile 2D map', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(TOUR_DONE);
    // The first-visit coach mark covers the tab bar (MobileTabShell, mtab-coach-{slug}).
    await page.addInitScript(() => localStorage.setItem('mtab-coach-gaza-war', '1'));
  });
  test('radio towers on gaza-war say "none tagged" (none mapped) on the mobile MAP tab', async ({ page }) => {
    await routeEmptyTowers(page);
    await page.goto('./gaza-war/');
    // A tracker with fresh events opens on FEED; switch to the MAP tab (MobileMapTab → IntelMap).
    const mapTab = page.locator('#tab-map');
    await expect(mapTab).toBeVisible({ timeout: 30_000 });
    await expect(async () => {
      await mapTab.click();
      await expect(mapTab).toHaveAttribute('aria-selected', 'true', { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    const toggle = await openRadioTowersToggle(page, null);
    await toggle.click();
    await expect(toggle.locator('.map-layer-empty')).toHaveText('none tagged', { timeout: 20_000 });
    await expect(toggle).toHaveAccessibleDescription(GAZA_EMPTY);
  });
});

// Localized names, not ISO codes. The region name for PS depends on the
// browser's ICU ("Palestine" in Chromium, "Palestinian Territories" in some Node builds).
const GAZA_EMPTY = /^No radio-tagged towers in OpenStreetMap for Israel, Palestin/;

/** Serves the fixture layer (IL, PS, BF, NE fresh zeros; UA, ML one tower each), so the spec tests the UI contract, not live OSM data. */
async function routeEmptyTowers(page: Page) {
  await page.route('**/geo/layers/radio-towers.geojson', r => r.fulfill({ path: 'e2e/fixtures/radio-towers-empty.geojson', contentType: 'application/geo+json' }));
}

/** Opens the visible map's layer panel and returns the radio-towers toggle. */
async function openRadioTowersToggle(page: Page, url: string | null) {
  if (url) await page.goto(url);
  const map = page.locator('.leaflet-container:visible').first();
  await expect(map).toBeVisible({ timeout: 30_000 });
  await map.scrollIntoViewIfNeeded();
  await page.locator('.map-layers-toggle:visible').first().click();
  const panel = page.locator('.map-layers-panel:visible').first();
  return panel.locator('[data-layer="radio-towers"]');
}

test.describe('E5 geo layers on the Cesium globe', () => {
  test('GDACS alerts toggle on the Ukraine globe with a count', async ({ page }) => {
    await page.addInitScript(TOUR_DONE);
    await page.route('**/_hourly/gdacs.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GDACS) }));
    await page.goto('./ukraine-war/globe/?lat=49&lon=31&alt=1500000');
    await expect(page.locator('.globe-toolbar')).toBeVisible({ timeout: 60_000 });
    // Open the intel-layers section (closed by default) by its titled icon.
    await page.locator('.globe-toolbar-icon[title="Intel Layers"]').click();
    const toggle = page.locator('.globe-toolbar [data-layer="gdacs-alerts"]');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle.locator('.globe-filter-count')).toHaveText('1', { timeout: 15_000 });
    await page.waitForFunction(() => (new URLSearchParams(location.search).get('layers') ?? '').includes('gdacs-alerts'), null, { timeout: 5_000 });
  });
});

test.describe('E5 geo layers on the 3D globe', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(TOUR_DONE);
    await routeEmptyTowers(page);
  });

  test('radio towers on the gaza-war globe say "none tagged" (none mapped)', async ({ page }) => {
    // ?layers= turns the layer on at mount; it fetches once the viewer exists (slow under SwiftShader).
    await page.goto('./gaza-war/globe/?layers=radio-towers');
    await expect(page.locator('.globe-toolbar')).toBeVisible({ timeout: 60_000 });
    await page.locator('.globe-toolbar-icon[title="Intel Layers"]').click();
    const toggle = page.locator('.globe-toolbar .globe-filter[data-layer="radio-towers"]');
    await expect(toggle.locator('.globe-filter-empty')).toHaveText('none tagged', { timeout: 30_000 });
    await expect(toggle).toHaveAccessibleDescription(GAZA_EMPTY);
    await expect(toggle.locator('.globe-filter-count')).toHaveCount(0);
  });

  test('radio towers on the sahel-insurgency globe hint at BF, NE (none mapped) while Mali draws', async ({ page }) => {
    await page.goto('./sahel-insurgency/globe/?layers=radio-towers');
    await expect(page.locator('.globe-toolbar')).toBeVisible({ timeout: 60_000 });
    await page.locator('.globe-toolbar-icon[title="Intel Layers"]').click();
    const toggle = page.locator('.globe-toolbar .globe-filter[data-layer="radio-towers"]');
    await expect(toggle.locator('.globe-filter-count')).toHaveText('1', { timeout: 30_000 });
    await expect(toggle.locator('.globe-filter-empty')).toHaveText('none tagged: BF, NE');
    await expect(toggle).toHaveAccessibleDescription('No radio-tagged towers in OpenStreetMap for Burkina Faso, Niger');
  });
});

test.describe('E5 geo layers on the 3D globe — phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(TOUR_DONE);
    await routeEmptyTowers(page);
  });

  test('the mobile globe sheet shows the same "none tagged" (none mapped) state', async ({ page }) => {
    await page.goto('./gaza-war/globe/?layers=radio-towers');
    // On phones the globe renders GlobeMobileSheet, not CesiumControls; layers live on its Filters tab.
    const filtersTab = page.locator('.mobile-sheet-tab', { hasText: 'Filters' });
    await expect(filtersTab).toBeVisible({ timeout: 60_000 });
    await filtersTab.click();
    const btn = page.locator('.mobile-sheet-filter-btn[data-layer="radio-towers"]');
    await btn.scrollIntoViewIfNeeded({ timeout: 30_000 });
    await expect(btn.locator('.globe-filter-empty')).toHaveText('none tagged', { timeout: 30_000 });
    await expect(btn).toHaveAccessibleDescription(GAZA_EMPTY);
  });
});
