import { test, expect } from '@playwright/test';
import { TOUR_DONE, waitForCommandCenter } from './helpers/hydration';

const NOMINATIM = { display_name: 'Baghdad, Iraq', address: { city: 'Baghdad', country: 'Iraq', country_code: 'iq' } };
const WIKIDATA = { results: { bindings: [{ countryLabel: { value: 'Iraq' }, capitalLabel: { value: 'Baghdad' }, population: { value: '43533592' }, headOfStateLabel: { value: 'Test Head' }, article: { value: 'https://en.wikipedia.org/wiki/Iraq' } }] } };
const WIKI = { title: 'Iraq', extract: 'Fixture: Iraq is a country in West Asia.' };

test.describe('Place dossier (E4)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NOMINATIM) }));
    await page.route('https://query.wikidata.org/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(WIKIDATA) }));
    await page.route('https://en.wikipedia.org/api/rest_v1/page/summary/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(WIKI) }));
    await page.addInitScript(TOUR_DONE);
  });

  test('right-click on the 2D map opens a dossier with place, facts and trackers', async ({ page }) => {
    await page.goto('./iran-conflict/?lat=33.3&lon=44.4&zoom=6');
    const map = page.locator('.leaflet-container:visible').first();
    await expect(map).toBeVisible({ timeout: 30_000 });
    await map.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await map.click({ button: 'right', position: { x: 300, y: 200 } });

    const panel = page.getByTestId('dossier-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('dossier-title')).toContainText('Iraq', { timeout: 15_000 });
    await expect(panel).toContainText('Baghdad');
    await expect(page.getByTestId('dossier-extract')).toContainText('West Asia');
    await expect(panel).toContainText(/Trackers|trackers/i);
    await expect(panel.locator('.dossier-list a.dossier-link').first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
  });

  test('a failing geocoder degrades honestly instead of hiding the panel', async ({ page }) => {
    await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ status: 503, body: 'down' }));
    await page.goto('./iran-conflict/?lat=33.3&lon=44.4&zoom=6');
    const map = page.locator('.leaflet-container:visible').first();
    await expect(map).toBeVisible({ timeout: 30_000 });
    await map.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await map.click({ button: 'right', position: { x: 300, y: 200 } });
    const panel = page.getByTestId('dossier-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/geocoder|geocodificador/i, { timeout: 15_000 });
    await expect(panel).toContainText(/Nearby|cercanos/i);
  });

  test('right-click on the homepage globe opens the dossier and closes the alerts panel', async ({ page }) => {
    await page.goto('./', { waitUntil: 'load' });
    await waitForCommandCenter(page);
    const globe = page.getByTestId('globe-canvas-wrap').locator('canvas').first();
    await expect(globe).toBeVisible({ timeout: 120_000 });
    await page.getByTestId('alerts-toggle').click();
    await expect(page.getByTestId('alerts-panel')).toBeVisible();
    const box = (await globe.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    const panel = page.getByTestId('dossier-panel');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('alerts-panel')).toHaveCount(0);
    await expect(page.getByTestId('dossier-title')).not.toHaveText('', { timeout: 15_000 });
  });
});
