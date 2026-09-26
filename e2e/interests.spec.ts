import { test, expect, type Page } from '@playwright/test';
import { TOUR_DONE, waitForCommandCenter } from './helpers/hydration';
import { INTEREST_BAND_MAX } from '../src/lib/feed-buckets';
import { INTERESTS_KEY } from '../src/lib/interests';

// Spec 2026-09-23 §1/§4: a declared interest lifts up to INTEREST_BAND_MAX
// matching trackers above the recency buckets, survives a reload, and Clear
// restores the original order. Live tracker data changes daily, so the chip
// is chosen from the DOM, never hard-coded.
//
// Do NOT predict band members from the DOM order: the DOM is bucketed
// (followed → recent → older) while the band takes matches in relevance
// order (activity + breaking + recency), and the two disagree whenever a
// stale active match outranks a fresh quiet one. Instead pick a chip whose
// matches ALL fit in the band, so the expected set is order-independent.
const FEED = '[data-testid="sidebar-feed"]';
const ROWS = `${FEED} [data-tracker-slug]`;
const BAND = (page: Page) => page.getByTestId('feed-interest-band');

type Row = { slug: string; region: string; domain: string; dim: boolean };
const toRows = (els: Element[]) => els.map(e => {
  const h = e as HTMLElement;
  return { slug: h.dataset.trackerSlug ?? '', region: h.dataset.region ?? '', domain: h.dataset.domain ?? '', dim: h.classList.contains('cc-feed-row-dim') };
});
const readRows = (page: Page): Promise<Row[]> => page.locator(ROWS).evaluateAll(toRows);
const bandRows = (page: Page): Promise<Row[]> => BAND(page).locator('[data-tracker-slug]').evaluateAll(toRows);

async function openChips(page: Page) {
  const toggle = page.getByTestId('sidebar-interests-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(page.locator('#cc-interest-chips .interest-chip').first()).toBeVisible();
}

type Chip = { kind: 'regions' | 'domains'; value: string };
const matchesChip = (r: Row, c: Chip) => (c.kind === 'regions' ? r.region : r.domain) === c.value;

/**
 * First chip with 1..INTEREST_BAND_MAX matches, at least one of them older
 * than 48 h (dimmed), and at least one recent row that does not match. Then:
 * the band holds every match (set known without knowing relevance order),
 * and a dimmed match must move above a recent non-match (order changes).
 * On 2026-09-24 `south-asia` qualifies (5 matches, 2 older).
 */
function pickChip(rows: Row[], chips: Chip[]) {
  for (const chip of chips) {
    const matches = rows.filter(r => matchesChip(r, chip));
    if (matches.length < 1 || matches.length > INTEREST_BAND_MAX) continue;
    if (!matches.some(m => m.dim)) continue;
    if (!rows.some(r => !r.dim && !matchesChip(r, chip))) continue;
    return { chip, slugs: matches.map(m => m.slug) };
  }
  return null;
}

test.describe('Declared interests in the sidebar feed', () => {
  test.beforeEach(async ({ page }) => { await page.addInitScript(TOUR_DONE); });

  test('a region chip lifts a bounded band, persists across reload, and Clear restores the order', async ({ page }) => {
    await page.goto('./', { waitUntil: 'load' });
    await waitForCommandCenter(page);
    await expect.poll(async () => (await readRows(page)).length).toBeGreaterThan(20);
    const before = await readRows(page);
    await expect(BAND(page)).toHaveCount(0);

    await openChips(page);
    const chips: Chip[] = await page.locator('#cc-interest-chips .interest-chip[data-kind]')
      .evaluateAll(els => els.map(e => ({
        kind: (e as HTMLElement).dataset.kind as 'regions' | 'domains',
        value: (e as HTMLElement).dataset.value ?? '',
      })));
    const pick = pickChip(before, chips);
    // Fails loudly (never skips) if today's data has no qualifying chip.
    expect(pick, `no chip has 1..${INTEREST_BAND_MAX} matches incl. an older one — data drift or missing data-* hooks`).not.toBeNull();
    const { chip, slugs } = pick!;
    const chipLocator = page.locator(`#cc-interest-chips .interest-chip[data-kind="${chip.kind}"][data-value="${chip.value}"]`);

    await test.step(`select ${chip.kind}:${chip.value}`, async () => {
      await chipLocator.click();
      await expect(BAND(page).locator('[data-tracker-slug]')).toHaveCount(slugs.length);
      const band = await bandRows(page);
      expect(band.map(r => r.slug).sort()).toEqual([...slugs].sort());
      // The point of §1: an older (dimmed) match crossed above the recent bucket.
      expect(band.some(r => r.dim), 'no older row inside the band').toBe(true);
      const after = await readRows(page);
      expect(after.filter(r => matchesChip(r, chip)).length, 'a match was left outside the band').toBe(slugs.length);
      expect(after.map(r => r.slug)).not.toEqual(before.map(r => r.slug));
      expect(after.map(r => r.slug).sort()).toEqual(before.map(r => r.slug).sort());
    });

    await test.step('no band while searching', async () => {
      // matchesSearch (tracker-directory-utils.ts:134-147) covers domain/region,
      // so the chip value itself returns at least every match.
      await page.locator('.cc-search-input').fill(chip.value);
      await expect.poll(async () => (await readRows(page)).length).toBeGreaterThanOrEqual(slugs.length);
      await expect(BAND(page)).toHaveCount(0);
      await page.locator('.cc-search-input').fill('');
      await expect(BAND(page).locator('[data-tracker-slug]')).toHaveCount(slugs.length);
    });

    await test.step('reload keeps the chip and the band', async () => {
      await page.reload({ waitUntil: 'load' });
      await waitForCommandCenter(page);
      await expect(BAND(page).locator('[data-tracker-slug]')).toHaveCount(slugs.length);
      await openChips(page);
      await expect(chipLocator).toHaveAttribute('aria-pressed', 'true');
    });

    await test.step('Clear removes the band and restores the original order', async () => {
      await page.locator('#cc-interest-chips .interest-chips-clear').click();
      await expect(BAND(page)).toHaveCount(0);
      await expect.poll(async () => (await readRows(page)).map(r => r.slug)).toEqual(before.map(r => r.slug));
    });
  });
});

test.describe('Interests nudge for returning visitors', () => {
  const nudgeState = (page: Page) => page.locator('.cc-sidebar-inner');
  const saveInterests = (page: Page) => page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [INTERESTS_KEY, JSON.stringify({ domains: ['governance'], regions: [] })] as const,
  );

  test('shows after a completed tour; × hides it for good', async ({ page }) => {
    await page.addInitScript(TOUR_DONE);
    await page.goto('./', { waitUntil: 'load' });
    await waitForCommandCenter(page);
    await expect(nudgeState(page)).toHaveAttribute('data-interests-nudge', 'show');
    await expect(page.getByTestId('interests-nudge')).toBeVisible();
    await page.getByTestId('interests-nudge-dismiss').click();
    await expect(page.getByTestId('interests-nudge')).toHaveCount(0);
    await page.reload({ waitUntil: 'load' });
    await waitForCommandCenter(page);
    // Wait on the resolved state, not a sleep: 'pending' also renders nothing.
    await expect(nudgeState(page)).toHaveAttribute('data-interests-nudge', 'hide');
    await expect(page.getByTestId('interests-nudge')).toHaveCount(0);
  });

  test('Pick opens the chips and retires the nudge', async ({ page }) => {
    await page.addInitScript(TOUR_DONE);
    await page.goto('./', { waitUntil: 'load' });
    await waitForCommandCenter(page);
    await page.getByTestId('interests-nudge-pick').click();
    await expect(page.getByTestId('sidebar-interests-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#cc-interest-chips .interest-chip').first()).toBeVisible();
    await expect(page.getByTestId('interests-nudge')).toHaveCount(0);
  });

  test('stays hidden when interests are already saved', async ({ page }) => {
    await page.addInitScript(TOUR_DONE);
    await saveInterests(page);
    await page.goto('./', { waitUntil: 'load' });
    await waitForCommandCenter(page);
    await expect(nudgeState(page)).toHaveAttribute('data-interests-nudge', 'hide');
  });

  test('stays hidden on a first desktop visit (the tour covers it)', async ({ page }) => {
    await page.goto('./', { waitUntil: 'load' });
    await waitForCommandCenter(page);
    await expect(nudgeState(page)).toHaveAttribute('data-interests-nudge', 'hide');
  });

  test('Pick from a saved Activity sort switches back to Relevance, where the band lives', async ({ page }) => {
    await page.addInitScript(TOUR_DONE);
    await page.addInitScript(() => localStorage.setItem('watchboard:sidebar-sort', 'activity'));
    await page.goto('./', { waitUntil: 'load' });
    await waitForCommandCenter(page);
    // Activity is flat: no recency dividers (activity-sort.spec.ts relies on the same signal).
    await expect(page.locator(`${FEED} .cc-feed-divider`)).toHaveCount(0);
    await page.getByTestId('interests-nudge-pick').click();
    await expect(page.locator(`${FEED} .cc-feed-divider`).first()).toBeAttached();
    expect(await page.evaluate(() => localStorage.getItem('watchboard:sidebar-sort'))).toBe('relevance');
  });
});

test.describe('Interests nudge with the sidebar collapsed (768-1279 px)', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('the rail shows a dot; expanding reveals the nudge', async ({ page }) => {
    await page.addInitScript(TOUR_DONE);
    await page.goto('./', { waitUntil: 'load' });
    // The search input lives in the (unmounted) sidebar, so wait on the island root.
    await expect(page.locator('astro-island:not([ssr]) .command-center-root')).toBeAttached({ timeout: 90_000 });
    const expand = page.getByRole('button', { name: /^Expand sidebar/ });
    await expect(expand).toHaveAttribute('data-interests-nudge', 'show');
    await expect(page.getByTestId('sidebar-expand-nudge-dot')).toBeVisible();
    await expand.click();
    await expect(page.getByTestId('interests-nudge')).toBeVisible();
  });
});
