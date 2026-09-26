// e2e/radio-layer.spec.ts
import { test, expect, type Page } from '@playwright/test';
import { TOUR_DONE, waitForCommandCenter } from './helpers/hydration';
import { RADIO_GLOBAL_PATH } from '../src/lib/radio-global';

// #293: the homepage radio layer is off by default, fetches its GeoJSON only
// when turned on, and shows a failed fetch as an error with Retry, never as an
// empty globe (docs/silent-failure-patterns.md).
const station = (uuid: string, name: string, lon: number, lat: number, votes: number) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: {
    stationUuid: uuid, name, country: 'Fixture', countryCode: 'FX', language: 'english',
    freqLabel: null, streamUrl: 'https://example.test/stream.mp3', codec: 'MP3', votes,
  },
});
// Both stations sit near the globe's initial view (GlobePanel pointOfView
// lat 20, lng 30): globe.gl only attaches an html pin to the DOM once it has
// faced the camera, so a far-side station would never be counted.
const FIXTURE = JSON.stringify({
  type: 'FeatureCollection',
  features: [station('fx-1', 'Fixture FM', 31.24, 30.04, 500), station('fx-2', 'Fixture AM', 23.73, 37.98, 300)],
});

/** Serves the fixture (or `statuses` in order, then the fixture) and counts requests. */
async function routeRadio(page: Page, statuses: number[] = []) {
  const counter = { n: 0 };
  await page.route(`**/${RADIO_GLOBAL_PATH}`, route => {
    const status = statuses[counter.n] ?? 200;
    counter.n += 1;
    return status === 200
      ? route.fulfill({ status: 200, contentType: 'application/geo+json', body: FIXTURE })
      : route.fulfill({ status, contentType: 'text/plain', body: 'fixture failure' });
  });
  return counter;
}

async function openHome(page: Page) {
  await page.goto('./', { waitUntil: 'load' });
  await waitForCommandCenter(page);
  // The globe island is deferred (defer-load.ts); the toggle only exists once it mounted.
  await expect(page.getByTestId('radio-layer-toggle')).toBeVisible({ timeout: 90_000 });
}

test.describe('Homepage radio layer', () => {
  test.beforeEach(async ({ page }) => { await page.addInitScript(TOUR_DONE); });

  test('off by default: no fetch until turned on, then exactly one; the choice persists', async ({ page }) => {
    const calls = await routeRadio(page);
    await openHome(page);
    const toggle = page.getByTestId('radio-layer-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('radio-layer-status')).toHaveCount(0);
    // A negative needs time to be wrong: give a mis-wired effect every chance to fetch.
    await page.waitForTimeout(3_000);
    expect(calls.n).toBe(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    const pill = page.getByTestId('radio-layer-status');
    await expect(pill).toHaveClass(/cc-radio-layer-ready/);
    await expect(pill).toContainText('radio-browser.info');
    await expect(page.locator('[data-testid="radio-pin"]')).toHaveCount(2, { timeout: 60_000 });
    expect(calls.n).toBe(1);

    calls.n = 0;
    await page.reload({ waitUntil: 'load' });
    await waitForCommandCenter(page);
    await expect(page.getByTestId('radio-layer-toggle')).toHaveAttribute('aria-pressed', 'true', { timeout: 90_000 });
    await expect(page.getByTestId('radio-layer-status')).toHaveClass(/cc-radio-layer-ready/);
    expect(calls.n).toBe(1);
  });

  test('a 500 shows the error with Retry; Retry against a healthy file recovers', async ({ page }) => {
    const calls = await routeRadio(page, [500]);
    await openHome(page);
    await page.getByTestId('radio-layer-toggle').click();
    const pill = page.getByTestId('radio-layer-status');
    await expect(pill).toHaveClass(/cc-radio-layer-error/);
    await expect(page.locator('[data-testid="radio-pin"]')).toHaveCount(0);
    expect(calls.n).toBe(1);

    await pill.getByRole('button').click();
    await expect(pill).toHaveClass(/cc-radio-layer-ready/);
    await expect(page.locator('[data-testid="radio-pin"]')).toHaveCount(2, { timeout: 60_000 });
    expect(calls.n).toBe(2);
  });
});
