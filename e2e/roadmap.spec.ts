import { test, expect } from '@playwright/test';
import { waitForRoadmapBoard } from './helpers/hydration';
import { ROADMAP_ITEMS, MILESTONES, MILESTONE_ORDER } from '../src/data/roadmap-items';

/**
 * /roadmap had no e2e coverage, and it is a public page that was wrong in
 * public for six weeks: the data file stopped at PR #135 while 204 PRs merged,
 * and the horizon cards advertised "M2 — May 2026 · next" in October with
 * shipped work inside it. The invariants of the data are covered in
 * tests/roadmap.test.ts; this covers that the page actually renders them.
 */
test.describe('roadmap page', () => {
  test('renders one card per horizon, server-side', async ({ page }) => {
    await page.goto('/roadmap/');
    for (const m of MILESTONE_ORDER) {
      await expect(page.locator(`.ms-card-${m}`)).toBeVisible();
      await expect(page.locator(`.ms-card-${m} h3`)).toHaveText(MILESTONES[m].label);
    }
    await expect(page.locator('.ms-note')).toContainText('Reconciled against the repository');
  });

  test('the timeline view groups every item under its horizon', async ({ page }) => {
    await page.goto('/roadmap/');
    // The tabs are server-rendered, so clicking before hydration is a silent
    // no-op — this test was flaky on CI for exactly that reason.
    await waitForRoadmapBoard(page);

    // Retry the whole interaction rather than trusting a hydration marker:
    // `astro-island:not([ssr])` says the island mounted, which is not the same
    // as React having attached the handler, and the gap between them differs
    // between Astro versions. On astro 7 this click landed inside that gap and
    // the tab stayed on Kanban — the failure snapshot showed it still selected.
    // Clicking until the tab reports selected is true for any framework
    // version and any machine speed.
    const timelineTab = page.getByRole('tab', { name: /timeline/i });
    await expect(async () => {
      await timelineTab.click();
      await expect(timelineTab).toHaveAttribute('aria-selected', 'true', { timeout: 2000 });
    }).toPass({ timeout: 30_000 });

    for (const m of MILESTONE_ORDER) {
      const expected = ROADMAP_ITEMS.filter((i) => i.milestone === m).length;
      if (expected === 0) continue;
      const section = page.locator('section.rm-mstone', { has: page.locator(`h3:text-is("${MILESTONES[m].label}")`) });
      await expect(section).toBeVisible();
      // No filter is applied, so the column holds exactly the data's items.
      await expect.poll(async () => section.locator('.rm-mstone-cards > *').count()).toBe(expected);
    }
  });
});
