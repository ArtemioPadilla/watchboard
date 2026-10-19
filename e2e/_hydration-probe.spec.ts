import { test, expect } from '@playwright/test';

/**
 * Not a test — a probe, for the astro 7 branch only.
 *
 * The suite's failures all reduce to one fact: islands never hydrate in dev
 * under astro 7. The page serves complete SSR HTML, but no stylesheet applies,
 * no effect runs, and `astro-island` keeps its `ssr` attribute, so every
 * hydration wait times out at 90 s with "element(s) not found".
 *
 * What no artifact so far has carried is the browser's own complaint. This
 * loads the homepage, records every console message, page error and failed
 * request, and prints them. Delete it with the branch.
 */
test('what the browser says while failing to hydrate', async ({ page }) => {
  const console_: string[] = [];
  const errors: string[] = [];
  const failed: string[] = [];

  page.on('console', (m) => console_.push(`${m.type()}: ${m.text()}`.slice(0, 300)));
  page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`.slice(0, 500)));
  page.on('requestfailed', (r) => failed.push(`${r.failure()?.errorText ?? '?'} ${r.url()}`.slice(0, 200)));

  await page.goto('/', { waitUntil: 'load' });
  await page.waitForTimeout(20_000); // generous: hydration is what we are watching for

  const islands = await page.locator('astro-island').count();
  const unhydrated = await page.locator('astro-island[ssr]').count();
  const hydrated = await page.locator('astro-island:not([ssr])').count();
  const stylesheets = await page.locator('link[rel="stylesheet"]').count();
  const scripts = await page.locator('script[type="module"]').count();

  console.log('\n──────── hydration probe ────────');
  console.log(`astro-island: ${islands} total, ${unhydrated} still ssr, ${hydrated} hydrated`);
  console.log(`link[rel=stylesheet]: ${stylesheets}   script[type=module]: ${scripts}`);
  console.log(`\npage errors (${errors.length}):`);
  for (const e of errors.slice(0, 10)) console.log(`  ${e}`);
  console.log(`\nfailed requests (${failed.length}):`);
  for (const f of failed.slice(0, 15)) console.log(`  ${f}`);
  console.log(`\nconsole (${console_.length}, first 25):`);
  for (const c of console_.slice(0, 25)) console.log(`  ${c}`);
  console.log('─────────────────────────────────\n');

  // Always fail, so the log is printed and the context is uploaded.
  expect(hydrated, 'islands hydrated — if this is nonzero the premise changed').toBe(-1);
});
