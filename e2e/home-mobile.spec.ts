// e2e/home-mobile.spec.ts
import { test, expect, type Page, type Locator } from '@playwright/test';
import { TOUR_DONE } from './helpers/hydration';
import { RADIO_GLOBAL_PATH, RADIO_LAYER_PREF_KEY } from '../src/lib/radio-global';

// Spec 2026-09-23 §3: tap targets ≥ 32×24 px on phones (WCAG 2.5.8 floor is 24),
// no horizontal overflow, radio + lights toggles reachable (≥ 44 px, topmost at
// their centre) and the radio pill clear of both. Screenshots are uploaded by
// e2e.yml with if-no-files-found: error, so a spec that took none cannot pass.
const VIEWPORTS = [{ width: 360, height: 740 }, { width: 390, height: 844 }];
const LOCALES = [
  { tag: 'en', path: './', browserLocale: 'en-US', interests: /^Interests/, live: /LIVE/ },
  { tag: 'fr', path: './fr/', browserLocale: 'fr-FR', interests: /^Intérêts/, live: /DIRECT/ },
];
const FIXTURE = JSON.stringify({
  type: 'FeatureCollection',
  features: [{
    type: 'Feature', geometry: { type: 'Point', coordinates: [-99.13, 19.43] },
    properties: { stationUuid: 'fx-1', name: 'Fixture FM', country: 'Fixture', countryCode: 'FX', language: 'english',
      freqLabel: null, streamUrl: 'https://example.test/stream.mp3', codec: 'MP3', votes: 1 },
  }],
});

async function hydrated(page: Page) {
  // On phones the sidebar (and its search input) is display:none in the LIVE tab,
  // so wait on the hydrated island root instead of waitForCommandCenter.
  await expect(page.locator('astro-island:not([ssr]) .command-center-root')).toBeAttached({ timeout: 90_000 });
}

/** Visible elements under `selector` that are below 32 px tall or 24 px wide. */
async function smallTargets(page: Page, selector: string) {
  return page.locator(selector).evaluateAll(els => els
    .filter(e => (e as HTMLElement).offsetParent !== null)
    .map(e => { const r = e.getBoundingClientRect(); return { text: (e.textContent ?? '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter(t => t.h < 32 || t.w < 24));
}

const isTopmost = (loc: Locator) => loc.evaluate(el => {
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!hit && (hit === el || el.contains(hit));
});

type Box = { x: number; y: number; width: number; height: number };
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Text cut by overflow: `toContainText` still passes on clipped text, this does not. */
const isClipped = (loc: Locator) => loc.evaluate(el =>
  el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);

/** Error state: Retry visible, ≥ 32×24, topmost at its centre, pill not clipped. */
async function assertRetryReachable(page: Page, vpWidth: number, shot: string) {
  const pill = page.getByTestId('radio-layer-status');
  await expect(pill).toHaveClass(/cc-radio-layer-error/, { timeout: 90_000 });
  const retry = pill.getByRole('button');
  await expect(retry).toBeVisible();
  await page.screenshot({ path: shot });
  const b = await retry.boundingBox();
  expect(b, 'Retry has no box').toBeTruthy();
  expect(b!.height).toBeGreaterThanOrEqual(32);
  expect(b!.width).toBeGreaterThanOrEqual(24);
  expect(b!.x + b!.width).toBeLessThanOrEqual(vpWidth);
  expect(await isTopmost(retry), 'Retry is covered').toBe(true);
  expect(await isClipped(pill), 'error pill text is clipped').toBe(false);
}

for (const vp of VIEWPORTS) {
  for (const loc of LOCALES) {
    test.describe(`home mobile ${vp.width}x${vp.height} ${loc.tag}`, () => {
      test.use({ viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: loc.browserLocale });
      test.beforeEach(async ({ page }) => { await page.addInitScript(TOUR_DONE); });

      test('TRACKERS tab: tap targets and no horizontal overflow', async ({ page }, testInfo) => {
        await page.goto(loc.path, { waitUntil: 'load' });
        await hydrated(page);
        await expect(page.getByTestId('mobile-tab-live')).toHaveText(loc.live);
        await page.getByTestId('mobile-tab-trackers').click();
        await expect(page.getByTestId('sidebar-interests-toggle')).toHaveText(loc.interests);
        // Mobile has no interests tour step, so the nudge must show here.
        await expect(page.locator('.cc-sidebar-inner')).toHaveAttribute('data-interests-nudge', 'show');
        expect(await smallTargets(page, '.cc-sidebar-inner .cc-sort-option')).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath(`mobile-trackers-${vp.width}-${loc.tag}.png`) });

        await page.getByTestId('sidebar-interests-toggle').click();
        await expect(page.locator('#cc-interest-chips .interest-chip').first()).toBeVisible();
        expect(await smallTargets(page, '.cc-sidebar-inner .cc-sort-option, .cc-sidebar-inner .interest-chip')).toEqual([]);
        const overflow = await page.evaluate(() => {
          const inner = document.querySelector<HTMLElement>('.cc-sidebar-inner');
          return { doc: document.documentElement.scrollWidth - window.innerWidth, sidebar: inner ? inner.scrollWidth - inner.clientWidth : null };
        });
        expect(overflow.sidebar, '.cc-sidebar-inner not found').not.toBeNull();
        expect(overflow.doc).toBeLessThanOrEqual(0);
        expect(overflow.sidebar!).toBeLessThanOrEqual(0);
        await page.screenshot({ path: testInfo.outputPath(`mobile-chips-${vp.width}-${loc.tag}.png`), fullPage: true });
      });

      test('LIVE tab: radio and lights toggles reachable, pill clear of both', async ({ page }, testInfo) => {
        await page.route(`**/${RADIO_GLOBAL_PATH}`, r => r.fulfill({ status: 200, contentType: 'application/geo+json', body: FIXTURE }));
        await page.addInitScript(key => localStorage.setItem(key, 'on'), RADIO_LAYER_PREF_KEY);
        await page.goto(loc.path, { waitUntil: 'load' });
        await hydrated(page);
        await expect(page.getByTestId('mobile-tab-live')).toHaveText(loc.live);
        const radio = page.getByTestId('radio-layer-toggle');
        const lights = page.locator('.cc-globe .globe-lights-toggle');
        const pill = page.getByTestId('radio-layer-status');
        await expect(pill).toHaveClass(/cc-radio-layer-ready/, { timeout: 90_000 });
        await page.screenshot({ path: testInfo.outputPath(`mobile-radio-${vp.width}-${loc.tag}.png`) });

        const [rb, lb, pb] = [await radio.boundingBox(), await lights.boundingBox(), await pill.boundingBox()];
        expect(rb && lb && pb, 'toggle or pill has no box').toBeTruthy();
        for (const b of [rb!, lb!]) { expect(b.width).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44); }
        expect(await isTopmost(radio), 'radio toggle is covered').toBe(true);
        expect(await isTopmost(lights), 'lights toggle is covered').toBe(true);
        expect(pb!.x).toBeGreaterThanOrEqual(0);
        expect(pb!.x + pb!.width).toBeLessThanOrEqual(vp.width);
        expect(intersects(pb!, rb!), 'pill overlaps the radio toggle').toBe(false);
        expect(intersects(pb!, lb!), 'pill overlaps the lights toggle').toBe(false);
        expect(await isClipped(pill), 'attribution text is clipped').toBe(false);
      });

      test('LIVE tab, radio file 500: Retry reachable and not clipped', async ({ page }, testInfo) => {
        await page.route(`**/${RADIO_GLOBAL_PATH}`, r => r.fulfill({ status: 500, contentType: 'text/plain', body: 'fixture failure' }));
        await page.addInitScript(key => localStorage.setItem(key, 'on'), RADIO_LAYER_PREF_KEY);
        await page.goto(loc.path, { waitUntil: 'load' });
        await hydrated(page);
        await assertRetryReachable(page, vp.width, testInfo.outputPath(`mobile-radio-error-${vp.width}-${loc.tag}.png`));
      });
    });
  }
}

// Longest strings: "Estações de rádio indisponíveis" + "Tentar novamente" (translations.ts:2324-2325).
test.describe('home mobile 360x740 pt error pill', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'pt-BR' });
  test('Retry reachable and not clipped', async ({ page }, testInfo) => {
    await page.addInitScript(TOUR_DONE);
    await page.route(`**/${RADIO_GLOBAL_PATH}`, r => r.fulfill({ status: 500, contentType: 'text/plain', body: 'fixture failure' }));
    await page.addInitScript(key => localStorage.setItem(key, 'on'), RADIO_LAYER_PREF_KEY);
    await page.goto('./pt/', { waitUntil: 'load' });
    await hydrated(page);
    await expect(page.getByTestId('mobile-tab-live')).toHaveText(/AO VIVO/);
    await assertRetryReachable(page, 360, testInfo.outputPath('mobile-radio-error-360-pt.png'));
  });
});

// Spec open question 2, pinned so fr-FR above cannot hide it: /fr/ with an
// English browser and no saved preference hydrates to English today
// (CommandCenter.tsx:301 ignores initialLocale). If the owner decides to fix
// it, this test fails; invert it (expect /DIRECT/) in the same PR.
test.describe('home mobile /fr/ with an en-US browser (current behaviour)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-US' });
  test('hydrates to English', async ({ page }) => {
    await page.addInitScript(TOUR_DONE);
    await page.goto('./fr/', { waitUntil: 'load' });
    await hydrated(page);
    await expect(page.getByTestId('mobile-tab-live')).toHaveText(/LIVE/);
  });
});
