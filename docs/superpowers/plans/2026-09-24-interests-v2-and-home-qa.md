# Interests v2 + homepage QA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make declared interests visibly lift matching trackers across the OPS recency buckets (bounded band), let returning visitors discover interests through a one-time inline nudge, fix sub-24 px tap targets and the radio toggle/pill overlap on phones, and guard all of it (plus the radio toggle) with Playwright specs that a workflow actually runs.

**Architecture:** The OPS bucketing that is today duplicated in `FeedList` (`src/components/islands/CommandCenter/SidebarPanel.tsx:454-482`) and `flatSlugs` (`SidebarPanel.tsx:553-570`) moves into a pure module `src/lib/feed-buckets.ts` (`bucketFeed`, `feedSegments`, `feedOrder`, `feedLayout`). `FeedList` renders `feedSegments(...)`; `flatSlugs` uses `feedOrder(...)`, so arrow keys follow the visible order in OPS, Activity (flat) and DOMAIN. The nudge is a pure eligibility function (`shouldShowInterestsNudge` in `src/lib/onboarding.ts`) evaluated after mount in `CommandCenter` and rendered as one row in `SidebarPanel`. Mobile fixes are CSS only (`src/styles/global.css`). Guards: three new Playwright specs plus a vitest that fails when an `e2e/*.spec.ts` is not run by `.github/workflows/e2e.yml`.

**Tech Stack:** Astro 5 (static), React 18 islands, TypeScript, Vitest (node environment, no DOM library), Playwright (`playwright.config.ts`, Chromium + SwiftShader, `webServer: npm run dev`), plain CSS.

**Spec:** `docs/superpowers/specs/2026-09-23-interests-v2-and-home-qa-design.md`

---

## Global Constraints

- `INTEREST_BAND_MAX = 6`, `OLDER_THRESHOLD_MS = 48 * 3600 * 1000` — both exported from `src/lib/feed-buckets.ts`. No other file may re-declare either literal; e2e specs import them (see "Stale literals" in `docs/silent-failure-patterns.md`).
- Band membership: the first `INTEREST_BAND_MAX` non-followed matches **in the incoming relevance order** (not "freshest"; relevance = breaking 40 + activity×0.3 + recency 0-15, `relevance.ts:37-62`). A stale high-activity match may take a slot ahead of a fresh low-activity one; that is pinned by a unit test (spec §1.3, open question 4).
- No band while searching (`searchQuery.trim() !== ''`): pass `bandMax: 0` in both `FeedList` and `flatSlugs`.
- Band exists only when `viewMode === 'operations'` and `sortMode === 'relevance'`. With `hasInterests(interests) === false` the OPS output (rows, order, dim flags, dividers) must equal today's algorithm exactly; a test compares against a literal copy.
- A followed tracker that also matches stays in the followed group and does not count toward the band limit. Older rows inside the band keep `cc-feed-row-dim`.
- Nudge feature key: `'interests'` in the existing `watchboard-features-discovered` storage (`src/lib/onboarding.ts:7`). Never added to `COACH_HINTS`.
- Nudge state is tri-state `'pending' | 'show' | 'hide'`; SSR and first client render are always `'pending'` (renders nothing) to avoid React #418. Exposed as `data-interests-nudge` on `.cc-sidebar-inner` so tests can wait on it instead of sleeping.
- Tap targets: base `min-height: 24px`; under `@media (max-width: 767px)` only (no `(pointer: coarse)` branch — wide touch devices keep the 24 px base, spec §3.1): `min-height: 32px; padding: 4px 10px`, `gap: 6px`.
- Radio Retry button (`.cc-radio-layer-status button`): `min-height: 24px; padding: 0 6px` everywhere, `min-height: 32px` under `max-width: 767px`.
- Mobile radio (`max-width: 767px`): `.globe-radio-toggle` → `top: 100px; width: 44px; height: 44px; z-index: 60` (all `!important`, because `GlobePanel.tsx:785-790` sets inline styles). `.cc-radio-layer-status` → `top: 106px; right: 62px; height: auto; min-height: 32px; max-width: calc(100% - 80px); white-space: normal; flex-wrap: wrap; padding: 4px 8px; line-height: 1.3; z-index: 60`. Rules go in `global.css` once, not in the four `src/pages/{,es/,fr/,pt/}index.astro`.
- Nudge copy states where the effect is (OPS + Relevance); **Pick** switches to `operations` + `relevance` before opening the chips.
- Collapsed desktop rail (768-1279 px default): when the nudge is `show`, the expand button carries `[data-testid="sidebar-expand-nudge-dot"]`.
- Band group: `role="group"` + `aria-labelledby="cc-interest-band-label"` (the visible divider's id), never `aria-label` (no double announcement).
- New translation keys (all 4 locales, enforced by `TranslationKeys = Record<keyof typeof en, string>` at `src/i18n/translations.ts:6`): `interests.nudge`, `interests.nudgePick`, `interests.nudgeDismiss`. The band label reuses the existing `interests.title` (see "Spec deviations").
- Vitest runs in `environment: 'node'` (`vitest.config.ts`). No React rendering in unit tests; all logic under test is pure.
- Type check: the spec requires `npm run check` (`astro check`, `package.json:9`), which OOMs locally at the default heap. Per task: `npx tsc --noEmit -p . 2>&1 | grep -E '<touched files>'` must print nothing. Before the PR (Task 7 Step 3): `NODE_OPTIONS=--max-old-space-size=8192 npm run check`; if it still cannot finish, say so in the PR body (listed under "Spec deviations").
- Playwright: `npx playwright test <files> --reporter=list` (starts `npm run dev` itself, `reuseExistingServer: true`). Every new spec must be added to the `npx playwright test ...` line in `.github/workflows/e2e.yml:37`.
- Do not modify `main` directly; commits go on the feature branch. Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `tests/e2e-workflow-coverage.test.ts` | Create | Fails if an `e2e/*.spec.ts` is neither in `e2e.yml` nor in an explicit exclusion list |
| `src/lib/feed-buckets.ts` | Create | Pure OPS bucketing, interest band, divider segments, arrow-key order |
| `src/lib/feed-buckets.test.ts` | Create | Equivalence with today's algorithm, band limit/overflow/followed rules |
| `src/components/islands/CommandCenter/SidebarPanel.tsx` | Modify | Render segments + band, `flatSlugs` via `feedOrder`, nudge row, `data-*` hooks |
| `src/components/islands/CommandCenter/FeedRow.tsx` | Modify | `data-domain` / `data-region` on the row |
| `src/components/islands/shared/InterestChips.tsx` | Modify | `data-kind` / `data-value` on each chip |
| `src/lib/onboarding.ts` | Modify | `INTERESTS_FEATURE_KEY`, `shouldShowInterestsNudge` |
| `src/lib/onboarding.test.ts` | Modify | Truth table of `shouldShowInterestsNudge` |
| `src/components/islands/CommandCenter/CommandCenter.tsx` | Modify | Nudge state after mount, dismiss wiring, mobile tab `data-testid`s |
| `src/components/islands/Onboarding/OnboardingTour.tsx` | Modify | Mark `'interests'` discovered when the `hero-interests` step is shown |
| `src/i18n/translations.ts` | Modify | 3 new keys × 4 locales |
| `src/lib/radio-global.ts` | Modify | Export `RADIO_LAYER_PREF_KEY` for the mobile spec |
| `src/styles/global.css` | Modify | Tap targets, nudge row, mobile radio toggle + pill |
| `e2e/interests.spec.ts` | Create | Band, persistence, Clear, nudge |
| `e2e/radio-layer.spec.ts` | Create | Off by default, lazy fetch, 500 → error + Retry |
| `e2e/home-mobile.spec.ts` | Create | 360×740 / 390×844 × en / fr geometry + screenshots |
| `.github/workflows/e2e.yml` | Modify | Run the 3 new specs; upload `mobile-*.png` with `if-no-files-found: error` |
| `CLAUDE.md` | Modify | One bullet for `feed-buckets.ts` under Utilities |

## Task 1: E2E workflow-coverage guard

**Files:**
- Create: `tests/e2e-workflow-coverage.test.ts`

**Interfaces:**
- Consumes: `e2e/*.spec.ts` file names; text of `.github/workflows/e2e.yml`.
- Produces: `EXCLUDED: Record<string, string>` (spec file → reason) and `specsRunBy(workflowYaml: string): Set<string>` (spec basenames on non-comment `npx playwright test` lines), both local to the test file.

Today `e2e.yml:37` runs 9 of the 11 specs; `command-center.spec.ts` and `tracker-page.spec.ts` are the two not yet opted in (header comment `e2e.yml:3-5`).

- [ ] **Step 1: Write the test**

```ts
// tests/e2e-workflow-coverage.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// A Playwright spec no workflow runs is a green check that proves nothing
// (docs/silent-failure-patterns.md: "225 tests no workflow ran").
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const E2E_DIR = join(ROOT, 'e2e');
const WORKFLOW = join(ROOT, '.github/workflows/e2e.yml');

/** Specs deliberately not run in CI, with the reason. Keep this short. */
const EXCLUDED: Record<string, string> = {
  'command-center.spec.ts': 'pre-E1 spec, not yet known to pass in CI (e2e.yml header)',
  'tracker-page.spec.ts': 'pre-E1 spec, not yet known to pass in CI (e2e.yml header)',
};

/**
 * Spec files named on a non-comment line that invokes `npx playwright test`.
 * A spec mentioned only in a YAML comment does not count as run.
 */
export function specsRunBy(workflowYaml: string): Set<string> {
  const run = new Set<string>();
  for (const raw of workflowYaml.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#') || !line.includes('npx playwright test')) continue;
    const code = line.split(' #')[0]; // drop a trailing comment
    for (const m of code.matchAll(/e2e\/([\w.-]+\.spec\.ts)/g)) run.add(m[1]);
  }
  return run;
}

describe('specsRunBy', () => {
  it('ignores comments and lines that do not run playwright', () => {
    const yaml = [
      '# run: npx playwright test e2e/commented.spec.ts',
      '      run: npx playwright test e2e/a.spec.ts e2e/b.spec.ts --reporter=list  # e2e/trailing.spec.ts',
      '      run: echo e2e/echoed.spec.ts',
    ].join('\n');
    expect([...specsRunBy(yaml)].sort()).toEqual(['a.spec.ts', 'b.spec.ts']);
  });
});

describe('e2e workflow coverage', () => {
  const specs = readdirSync(E2E_DIR).filter(f => f.endsWith('.spec.ts')).sort();
  const workflow = readFileSync(WORKFLOW, 'utf8');
  const run = specsRunBy(workflow);

  it('finds the spec directory and the workflow', () => {
    expect(specs.length).toBeGreaterThan(5);
    expect(run.size).toBeGreaterThan(5);
  });

  it('has no disabled step (`if: false` would make every spec a silent green)', () => {
    expect(workflow).not.toMatch(/^\s*if:\s*(false|\$\{\{\s*false\s*\}\})\s*$/m);
  });

  it('runs every spec that is not explicitly excluded', () => {
    const missing = specs.filter(f => !EXCLUDED[f] && !run.has(f));
    expect(missing, `add these to .github/workflows/e2e.yml or to EXCLUDED with a reason`).toEqual([]);
  });

  it('has no stale exclusions', () => {
    for (const f of Object.keys(EXCLUDED)) {
      expect(existsSync(join(E2E_DIR, f)), `${f} is excluded but no longer exists`).toBe(true);
      expect(run.has(f), `${f} is excluded but the workflow runs it`).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run it — expect PASS against today's tree**

Run: `npx vitest run tests/e2e-workflow-coverage.test.ts`
Expected: 5 passed.

- [ ] **Step 3: Prove it can fail**

```bash
printf "import { test } from '@playwright/test';\ntest('x', () => {});\n" > e2e/zz-coverage-probe.spec.ts
npx vitest run tests/e2e-workflow-coverage.test.ts   # Expected: FAIL, missing ['zz-coverage-probe.spec.ts']
# A comment naming it must not count as running it:
printf '\n# e2e/zz-coverage-probe.spec.ts\n' >> .github/workflows/e2e.yml
npx vitest run tests/e2e-workflow-coverage.test.ts   # Expected: still FAIL, same missing entry
git checkout -- .github/workflows/e2e.yml
rm e2e/zz-coverage-probe.spec.ts
npx vitest run tests/e2e-workflow-coverage.test.ts   # Expected: PASS
git status --short .github e2e                      # Expected: no output
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e-workflow-coverage.test.ts
git commit -m "test(e2e): fail when a Playwright spec is not run by e2e.yml"
```

## Task 2: Pure feed-bucket module (`src/lib/feed-buckets.ts`)

**Files:**
- Create: `src/lib/feed-buckets.ts`
- Create: `src/lib/feed-buckets.test.ts`

**Interfaces:**
- Consumes: `Interests`, `hasInterests`, `matchesInterests`, `EMPTY_INTERESTS` from `src/lib/interests.ts:8,32,46,13`.
- Produces:
  ```ts
  export const OLDER_THRESHOLD_MS: number;           // 48 * 3600 * 1000
  export const INTEREST_BAND_MAX: number;            // 6
  export interface BucketableTracker { slug: string; lastUpdated: string; domain?: string; region?: string }
  export interface FeedBuckets<T> { followed: T[]; interests: T[]; recent: T[]; older: T[] }
  export interface BucketOptions { followedSlugs: readonly string[]; interests: Interests; now: number; bandMax?: number }
  export type FeedSegment<T> =
    | { kind: 'rows'; bucket: 'followed' | 'recent' | 'older'; rows: T[] }
    | { kind: 'band'; rows: T[] }
    | { kind: 'divider' };
  export type FeedLayout = 'ops' | 'flat' | 'domain';
  export function isOlder(lastUpdated: string, now: number): boolean;
  export function bucketFeed<T extends BucketableTracker>(trackers: readonly T[], opts: BucketOptions): FeedBuckets<T>;
  export function feedSegments<T>(b: FeedBuckets<T>): FeedSegment<T>[];
  export function feedLayout(viewMode: 'operations' | 'geographic' | 'domain', sortMode: 'relevance' | 'activity'): FeedLayout;
  export function feedOrder<T extends BucketableTracker>(trackers: readonly T[], opts: BucketOptions & { layout: FeedLayout }): T[];
  ```

Divider rules reproduce `SidebarPanel.tsx:467-481` exactly when the band is empty: followed → divider if anything follows; recent rows; divider + older rows if older is non-empty. With a band: followed → divider → band (its own labelled header) → divider if recent is non-empty → recent → divider + older.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/feed-buckets.test.ts
import { describe, it, expect } from 'vitest';
import {
  OLDER_THRESHOLD_MS, INTEREST_BAND_MAX, isOlder, bucketFeed, feedSegments, feedLayout, feedOrder,
  type BucketableTracker, type FeedSegment,
} from './feed-buckets';
import { EMPTY_INTERESTS, type Interests } from './interests';

const NOW = Date.parse('2026-09-24T12:00:00Z');
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const tr = (slug: string, hoursAgo: number, domain = 'conflict', region = 'europe'): BucketableTracker =>
  ({ slug, lastUpdated: ago(hoursAgo), domain, region });

/** Literal copy of today's OPS algorithm (SidebarPanel.tsx:454-482), rows + dividers as tokens. */
function legacyTokens(trackers: BucketableTracker[], followedSlugs: string[], now: number): string[] {
  const followed = new Set(followedSlugs);
  const f: BucketableTracker[] = []; const recent: BucketableTracker[] = []; const older: BucketableTracker[] = [];
  for (const t of trackers) {
    if (followed.has(t.slug)) { f.push(t); continue; }
    const age = now - new Date(t.lastUpdated).getTime();
    if (age > 48 * 3600 * 1000) older.push(t); else recent.push(t);
  }
  const out: string[] = [];
  if (f.length > 0) { out.push(...f.map(t => t.slug)); if (recent.length > 0 || older.length > 0) out.push('|'); }
  out.push(...recent.map(t => t.slug));
  if (older.length > 0) out.push('|');
  out.push(...older.map(t => `~${t.slug}`));
  return out;
}

function tokens(segs: FeedSegment<BucketableTracker>[], now: number): string[] {
  return segs.flatMap(s => s.kind === 'divider' ? ['|']
    : s.kind === 'band' ? ['[', ...s.rows.map(t => (isOlder(t.lastUpdated, now) ? '~' : '') + t.slug)]
    : s.rows.map(t => (s.bucket === 'older' ? '~' : '') + t.slug));
}

const gov: Interests = { domains: ['governance'], regions: [] } as Interests;

describe('constants', () => {
  it('match the spec', () => {
    expect(OLDER_THRESHOLD_MS).toBe(48 * 3600 * 1000);
    expect(INTEREST_BAND_MAX).toBe(6);
  });
});

describe('without interests: identical to the legacy OPS algorithm', () => {
  const cases: [string, BucketableTracker[], string[]][] = [
    ['empty', [], []],
    ['only recent', [tr('a', 1), tr('b', 2)], []],
    ['only older', [tr('a', 50), tr('b', 60)], []],
    ['mixed + followed', [tr('a', 1), tr('b', 50), tr('c', 3), tr('d', 70)], ['d']],
    ['all followed', [tr('a', 1), tr('b', 50)], ['a', 'b']],
    ['exact 48 h edge stays recent', [tr('edge', 48), tr('past', 48.001)], []],
    ['invalid date stays recent', [{ slug: 'bad', lastUpdated: 'not-a-date' }, tr('old', 99)], []],
  ];
  for (const [name, list, followed] of cases) {
    it(name, () => {
      const b = bucketFeed(list, { followedSlugs: followed, interests: EMPTY_INTERESTS, now: NOW });
      expect(b.interests).toEqual([]);
      expect(tokens(feedSegments(b), NOW)).toEqual(legacyTokens(list, followed, NOW));
    });
  }
});

describe('interest band', () => {
  const list = [
    tr('r1', 1), tr('g-old1', 60, 'governance'), tr('r2', 2), tr('g1', 3, 'governance'),
    ...Array.from({ length: 7 }, (_, i) => tr(`g-more${i}`, 70 + i, 'governance')),
    tr('o1', 80),
  ];
  it('lifts at most INTEREST_BAND_MAX matches, in input order, above recent rows', () => {
    const b = bucketFeed(list, { followedSlugs: [], interests: gov, now: NOW });
    expect(b.interests.map(t => t.slug)).toEqual(['g-old1', 'g1', 'g-more0', 'g-more1', 'g-more2', 'g-more3']);
    expect(b.recent.map(t => t.slug)).toEqual(['r1', 'r2']);
    // Overflow matches stay in their recency bucket.
    expect(b.older.map(t => t.slug)).toEqual(['g-more4', 'g-more5', 'g-more6', 'o1']);
  });
  it('keeps a followed match in followed and does not count it toward the limit', () => {
    const b = bucketFeed(list, { followedSlugs: ['g1'], interests: gov, now: NOW, bandMax: 2 });
    expect(b.followed.map(t => t.slug)).toEqual(['g1']);
    expect(b.interests.map(t => t.slug)).toEqual(['g-old1', 'g-more0']);
  });
  it('membership follows the incoming relevance order, not freshness (spec §1.3, open question 4)', () => {
    // sortByRelevance puts a stale high-activity match (72 h, activity 63: 18.9 + 5.5 = 24.4)
    // ahead of a fresh low-activity one (1 h, activity 0: 14.8); both get the same +10. The band keeps
    // that order: the stale one takes the slot, the fresh one stays in `recent`.
    const input = [tr('stale-hot', 72, 'governance'), tr('fresh-cold', 1, 'governance'), tr('other', 2)];
    const b = bucketFeed(input, { followedSlugs: [], interests: gov, now: NOW, bandMax: 1 });
    expect(b.interests.map(t => t.slug)).toEqual(['stale-hot']);
    expect(b.recent.map(t => t.slug)).toEqual(['fresh-cold', 'other']);
    expect(tokens(feedSegments(b), NOW)).toEqual(['[', '~stale-hot', '|', 'fresh-cold', 'other']);
  });
  it('bandMax = 0 behaves like no interests (used while searching)', () => {
    const b = bucketFeed(list, { followedSlugs: [], interests: gov, now: NOW, bandMax: 0 });
    expect(tokens(feedSegments(b), NOW)).toEqual(legacyTokens(list, [], NOW));
  });
  it('loses and duplicates no row', () => {
    const order = feedOrder(list, { followedSlugs: ['r2'], interests: gov, now: NOW, layout: 'ops' });
    expect(order.map(t => t.slug).sort()).toEqual(list.map(t => t.slug).sort());
  });
  it('segments: followed | band | recent | older, band rows keep their older flag', () => {
    const b = bucketFeed([tr('f', 1), tr('g', 60, 'governance'), tr('r', 2), tr('o', 90)],
      { followedSlugs: ['f'], interests: gov, now: NOW });
    expect(tokens(feedSegments(b), NOW)).toEqual(['f', '|', '[', '~g', '|', 'r', '|', '~o']);
  });
  it('segments: band without recent goes straight to the older divider', () => {
    const b = bucketFeed([tr('g', 60, 'governance'), tr('o', 90)], { followedSlugs: [], interests: gov, now: NOW });
    expect(tokens(feedSegments(b), NOW)).toEqual(['[', '~g', '|', '~o']);
  });
});

describe('layout and order', () => {
  it('feedLayout: domain wins, then activity is flat, else ops', () => {
    expect(feedLayout('domain', 'activity')).toBe('domain');
    expect(feedLayout('operations', 'activity')).toBe('flat');
    expect(feedLayout('operations', 'relevance')).toBe('ops');
    expect(feedLayout('geographic', 'relevance')).toBe('ops');
  });
  it('flat keeps input order and ignores interests', () => {
    const list = [tr('a', 90), tr('g', 1, 'governance'), tr('b', 1)];
    expect(feedOrder(list, { followedSlugs: ['b'], interests: gov, now: NOW, layout: 'flat' }).map(t => t.slug))
      .toEqual(['a', 'g', 'b']);
  });
  it('domain groups by first appearance, keeping order inside a group', () => {
    const list = [tr('a', 1, 'science'), tr('b', 1, 'conflict'), tr('c', 1, 'science'), { slug: 'd', lastUpdated: ago(1) }];
    expect(feedOrder(list, { followedSlugs: [], interests: gov, now: NOW, layout: 'domain' }).map(t => t.slug))
      .toEqual(['a', 'c', 'b', 'd']);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/lib/feed-buckets.test.ts`
Expected: FAIL, `Failed to resolve import "./feed-buckets"`.

- [ ] **Step 3: Implement**

```ts
// src/lib/feed-buckets.ts
/**
 * Sidebar feed order (spec 2026-09-23 §1). One implementation for what the
 * list renders (FeedList) and what arrow keys walk (flatSlugs), so the two
 * can never diverge again.
 *
 * OPS + Relevance: followed → up to INTEREST_BAND_MAX interest matches (the
 * first ones in the incoming relevance order) → recent (≤ 48 h) → older.
 * Relevance is not freshness (breaking 40, activity 0-30, recency 0-15), so a
 * stale but active match can take a band slot ahead of a fresh quiet one;
 * that is how an old match crosses the recency buckets. The fresh one stays
 * in `recent`, right below the band.
 * With no interests (or bandMax 0, used while searching) the output is
 * exactly the pre-v2 algorithm.
 */
import { hasInterests, matchesInterests, type Interests } from './interests';

export const OLDER_THRESHOLD_MS = 48 * 3600 * 1000;
/** Rows the interest band may hold; overflow matches stay in their recency bucket. */
export const INTEREST_BAND_MAX = 6;

export interface BucketableTracker { slug: string; lastUpdated: string; domain?: string; region?: string }
export interface FeedBuckets<T> { followed: T[]; interests: T[]; recent: T[]; older: T[] }
export interface BucketOptions { followedSlugs: readonly string[]; interests: Interests; now: number; bandMax?: number }
export type FeedSegment<T> =
  | { kind: 'rows'; bucket: 'followed' | 'recent' | 'older'; rows: T[] }
  | { kind: 'band'; rows: T[] }
  | { kind: 'divider' };
export type FeedLayout = 'ops' | 'flat' | 'domain';

/** An unparseable date gives NaN, which is never older: same as before v2. */
export function isOlder(lastUpdated: string, now: number): boolean {
  return now - new Date(lastUpdated).getTime() > OLDER_THRESHOLD_MS;
}

export function bucketFeed<T extends BucketableTracker>(trackers: readonly T[], opts: BucketOptions): FeedBuckets<T> {
  const followed = new Set(opts.followedSlugs);
  const bandMax = opts.bandMax ?? INTEREST_BAND_MAX;
  const withInterests = hasInterests(opts.interests);
  const out: FeedBuckets<T> = { followed: [], interests: [], recent: [], older: [] };
  for (const t of trackers) {
    if (followed.has(t.slug)) { out.followed.push(t); continue; }
    if (withInterests && out.interests.length < bandMax && matchesInterests(t, opts.interests)) {
      out.interests.push(t);
      continue;
    }
    if (isOlder(t.lastUpdated, opts.now)) out.older.push(t); else out.recent.push(t);
  }
  return out;
}

export function feedSegments<T>(b: FeedBuckets<T>): FeedSegment<T>[] {
  const s: FeedSegment<T>[] = [];
  if (b.followed.length > 0) {
    s.push({ kind: 'rows', bucket: 'followed', rows: b.followed });
    if (b.interests.length > 0 || b.recent.length > 0 || b.older.length > 0) s.push({ kind: 'divider' });
  }
  if (b.interests.length > 0) {
    s.push({ kind: 'band', rows: b.interests });
    if (b.recent.length > 0) s.push({ kind: 'divider' });
  }
  if (b.recent.length > 0) s.push({ kind: 'rows', bucket: 'recent', rows: b.recent });
  if (b.older.length > 0) {
    s.push({ kind: 'divider' });
    s.push({ kind: 'rows', bucket: 'older', rows: b.older });
  }
  return s;
}

/** Mirrors FeedList's branch order: DOMAIN grouping first, then flat Activity, else OPS. */
export function feedLayout(
  viewMode: 'operations' | 'geographic' | 'domain',
  sortMode: 'relevance' | 'activity',
): FeedLayout {
  if (viewMode === 'domain') return 'domain';
  return sortMode === 'activity' ? 'flat' : 'ops';
}

export function feedOrder<T extends BucketableTracker>(
  trackers: readonly T[],
  opts: BucketOptions & { layout: FeedLayout },
): T[] {
  if (opts.layout === 'flat') return [...trackers];
  if (opts.layout === 'domain') {
    const groups = new Map<string, T[]>();
    for (const t of trackers) {
      const key = t.domain ?? 'other';
      const arr = groups.get(key) ?? [];
      arr.push(t);
      groups.set(key, arr);
    }
    return [...groups.values()].flat();
  }
  const b = bucketFeed(trackers, opts);
  return [...b.followed, ...b.interests, ...b.recent, ...b.older];
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/lib/feed-buckets.test.ts`
Expected: all tests pass (constants 1, legacy equivalence 7, band 7, layout 3).

- [ ] **Step 5: Prove the equivalence test bites**

Temporarily change `>` to `>=` in `isOlder`, run the test, expect the `exact 48 h edge stays recent` case to FAIL, revert, re-run to PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/feed-buckets.ts src/lib/feed-buckets.test.ts
git commit -m "feat(sidebar): pure feed-buckets module with bounded interest band"
```

## Task 3: Sidebar renders the interest band; arrow keys follow the visible order

**Files:**
- Create: `e2e/interests.spec.ts` (band part; the nudge part is appended in Task 4)
- Modify: `src/components/islands/CommandCenter/SidebarPanel.tsx` (imports `:1-20`, `OLDER_THRESHOLD_MS` `:330`, `FeedListProps` `:332-348`, OPS block `:454-482`, `flatSlugs` `:550-570`, list div `:750`, `<FeedList>` `:766-782`, `TrackerRow` root `:138-141`)
- Modify: `src/components/islands/CommandCenter/FeedRow.tsx:49-51`
- Modify: `src/components/islands/shared/InterestChips.tsx:34-40`
- Modify: `.github/workflows/e2e.yml:37`

**Interfaces:**
- Consumes: `bucketFeed`, `feedSegments`, `feedOrder`, `feedLayout`, `isOlder`, `INTEREST_BAND_MAX` (Task 2); translation key `interests.title` (exists, `translations.ts:40`) as the band label.
- Produces (DOM contract used by e2e):
  - `[data-testid="sidebar-feed"]` — the list container (`S.list` div).
  - `[data-testid="feed-interest-band"]` — `role="group"` with `aria-labelledby="cc-interest-band-label"`; first child `.cc-feed-group-divider#cc-interest-band-label` with the uppercased `interests.title`, then the band rows. Absent while searching.
  - Every feed row (`.cc-feed-row` and the expanded `.cc-tracker-expanded`) carries `data-tracker-slug`, `data-domain`, `data-region` (empty string when absent).
  - Every chip carries `data-kind="domains"|"regions"` and `data-value="<value>"`.
  - `FeedListProps` gains `interests: Interests`.

- [ ] **Step 1: Write the failing e2e**

```ts
// e2e/interests.spec.ts
import { test, expect, type Page } from '@playwright/test';
import { TOUR_DONE, waitForCommandCenter } from './helpers/hydration';
import { INTEREST_BAND_MAX } from '../src/lib/feed-buckets';

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
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx playwright test e2e/interests.spec.ts --reporter=list`
Expected: FAIL at `expect.poll(... readRows ...).toBeGreaterThan(20)` (received 0: `[data-testid="sidebar-feed"]` does not exist yet).

- [ ] **Step 3: Row and chip data hooks**

`FeedRow.tsx:49-51` — add two attributes next to `data-tracker-slug`:

```tsx
      data-tracker-slug={tracker.slug}
      data-domain={tracker.domain ?? ''}
      data-region={tracker.region ?? ''}
```

`SidebarPanel.tsx:140` (`TrackerRow`, expanded row) — same two lines after `data-tracker-slug={tracker.slug}`.

`InterestChips.tsx:34-40` — on the chip `<button>`, after `aria-pressed={selected}`:

```tsx
                  data-kind={g.kind}
                  data-value={value}
```

- [ ] **Step 4: Wire `feed-buckets` into `SidebarPanel.tsx`**

Imports (`:1`, `:17`):

```tsx
import { useState, useMemo, useCallback, useRef, useEffect, memo, Fragment } from 'react';
// …
import { sortByRelevance, sortByActivity } from '../../../lib/relevance';
import { bucketFeed, feedSegments, feedOrder, feedLayout, isOlder } from '../../../lib/feed-buckets';
```

Delete `const OLDER_THRESHOLD_MS = 48 * 3600 * 1000;` (`:330`). In `FeedListProps` add after `followedSlugs: string[];`:

```tsx
  /** Declared interests: in OPS + Relevance they form the bounded band (feed-buckets.ts). */
  interests: Interests;
```

and destructure `interests,` in the `FeedList` parameters after `followedSlugs,`. Replace the whole OPS block (`:454-482`, from the `// OPS view:` comment to the closing `);` of its return) with:

```tsx
  // OPS view: followed → interest band (≤ INTEREST_BAND_MAX) → recent → older
  // (dimmed). Same order flatSlugs walks (both come from feed-buckets.ts).
  // No band while searching (like the hero card): bandMax 0 = legacy layout.
  const segments = feedSegments(bucketFeed(trackers, {
    followedSlugs, interests, now, ...(isSearching ? { bandMax: 0 } : {}),
  }));
  const bandLabel = t('interests.title', locale).toUpperCase();
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === 'divider') return <div key={`divider-${i}`} className="cc-feed-divider" />;
        if (seg.kind === 'band') {
          return (
            // aria-labelledby, not aria-label: the visible divider is the name, announced once.
            <div key="interest-band" role="group" aria-labelledby="cc-interest-band-label" data-testid="feed-interest-band">
              <div id="cc-interest-band-label" className="cc-feed-group-divider">{bandLabel}</div>
              {/* Older rows stay dimmed: the band lifts them, it does not make them fresh. */}
              {seg.rows.map(tr => renderOne(tr, isOlder(tr.lastUpdated, now)))}
            </div>
          );
        }
        return <Fragment key={seg.bucket}>{seg.rows.map(tr => renderOne(tr, seg.bucket === 'older'))}</Fragment>;
      })}
    </>
  );
```

Replace `flatSlugs` (`:550-570`, comment included) with:

```tsx
  // Arrow-key order = FeedList's visible order in every layout (OPS with the
  // interest band, flat Activity, DOMAIN groups). Geographic view returns
  // early in handleKeyDown. `isSearching` is declared further down (:610), so
  // derive it from searchQuery here with the same expression.
  const searching = searchQuery.trim().length > 0;
  const flatSlugs = useMemo(
    () => feedOrder(sortedFiltered, {
      followedSlugs,
      interests,
      now: Date.now(),
      layout: feedLayout(viewMode || 'operations', sortMode),
      ...(searching ? { bandMax: 0 } : {}),
    }).map(t => t.slug),
    [sortedFiltered, followedSlugs, interests, viewMode, sortMode, searching],
  );
```

List container (`:750`): `<div style={S.list} data-testid="sidebar-feed">`. In `<FeedList …>` (`:766-782`) add `interests={interests}` after `followedSlugs={followedSlugs}`.

- [ ] **Step 5: Type check touched files**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E 'SidebarPanel|FeedRow|InterestChips|feed-buckets'`
Expected: no output.

- [ ] **Step 6: Run the e2e — expect PASS**

Run: `npx playwright test e2e/interests.spec.ts e2e/activity-sort.spec.ts --reporter=list`
Expected: all pass (`activity-sort` guards that Relevance still renders `.cc-feed-divider` and Activity renders none).

- [ ] **Step 7: Register the spec in CI**

In `.github/workflows/e2e.yml:37`, append ` e2e/interests.spec.ts` right after `e2e/activity-sort.spec.ts` on the `npx playwright test` line. Then:

Run: `npx vitest run tests/e2e-workflow-coverage.test.ts`
Expected: PASS (it FAILS if you skip this step — that is the point of Task 1).

- [ ] **Step 8: Commit**

```bash
git add e2e/interests.spec.ts .github/workflows/e2e.yml src/components/islands/CommandCenter/SidebarPanel.tsx \
  src/components/islands/CommandCenter/FeedRow.tsx src/components/islands/shared/InterestChips.tsx
git commit -m "feat(sidebar): declared interests form a bounded band above the recency buckets"
```

## Task 4: Interests nudge for returning visitors

**Files:**
- Modify: `src/lib/onboarding.ts` (append after `getNextCoachHint`, `:58-65`)
- Modify: `src/lib/onboarding.test.ts` (import list `:38-46`, new `describe` at the end)
- Modify: `src/i18n/translations.ts` (after `'interests.active'` at `:46`, `:769`, `:1468`, `:2167`)
- Modify: `src/components/islands/CommandCenter/SidebarPanel.tsx` (`Props` `:32-60`, sort toggle `:700-715`, root `:612`)
- Modify: `src/components/islands/CommandCenter/CommandCenter.tsx` (imports `:26`, `:32`; state near `:229`; mount effect `:299-304`; `<SidebarPanel>` `:975-1004`; `?` panel chips `:1109-1115`; collapsed-rail expand button `:884-897`)
- Modify: `src/components/islands/Onboarding/OnboardingTour.tsx` (imports `:1-9`, hook after `:21`)
- Modify: `e2e/interests.spec.ts` (append a `describe`)

**Interfaces:**
- Produces:
  ```ts
  // src/lib/onboarding.ts
  export const INTERESTS_FEATURE_KEY = 'interests';
  export interface InterestsNudgeInput {
    discovered: ReadonlySet<string>;
    hasInterests: boolean;
    isMobile: boolean;
    desktopTourCompleted: boolean;
  }
  export function shouldShowInterestsNudge(input: InterestsNudgeInput): boolean;
  // SidebarPanel Props (new, optional)
  interestsNudge?: 'pending' | 'show' | 'hide';
  onDismissInterestsNudge?: () => void;
  ```
- DOM: `.cc-sidebar-inner[data-interests-nudge="pending|show|hide"]`; the collapsed rail's "Expand sidebar" button carries the same `data-interests-nudge` and, when `show`, `[data-testid="sidebar-expand-nudge-dot"]`; `[data-testid="interests-nudge"]` row with `[data-testid="interests-nudge-pick"]` and `[data-testid="interests-nudge-dismiss"]` (both `.cc-sort-option`, so Task 6's tap-target rule covers them).
- Consumes: `getDiscoveredFeatures`, `markFeatureDiscovered`, `isTourCompleted` (`onboarding.ts:41-56`, `:130`); `hasInterests`, `loadInterests`, `INTERESTS_KEY` (`interests.ts:32,58,14`).

Marked discovered on: **Pick**, **×**, opening the INTERESTS toggle, toggling any chip in the sidebar or the `?` panel, and reaching the `hero-interests` tour step.

- [ ] **Step 1: Write the failing unit test**

Add `shouldShowInterestsNudge, INTERESTS_FEATURE_KEY, getNextCoachHint,` to the import list at `onboarding.test.ts:38-46`, then append:

```ts
describe('shouldShowInterestsNudge', () => {
  const base = { discovered: new Set<string>(), hasInterests: false, isMobile: false, desktopTourCompleted: true };
  it.each([
    ['desktop, tour completed, nothing declared', base, true],
    ['desktop, tour not completed (the tour shows the step)', { ...base, desktopTourCompleted: false }, false],
    ['mobile ignores the desktop tour (no mobile interests step)', { ...base, isMobile: true, desktopTourCompleted: false }, true],
    ['already discovered', { ...base, discovered: new Set([INTERESTS_FEATURE_KEY]) }, false],
    ['already discovered, mobile', { ...base, isMobile: true, discovered: new Set([INTERESTS_FEATURE_KEY]) }, false],
    ['interests already declared', { ...base, hasInterests: true }, false],
    ['interests already declared, mobile', { ...base, isMobile: true, hasInterests: true }, false],
    ['other discovered features do not count', { ...base, discovered: new Set(['search', 'follow']) }, true],
  ] as const)('%s', (_name, input, expected) => {
    expect(shouldShowInterestsNudge(input)).toBe(expected);
  });

  it('is never queued as a floating coach hint', () => {
    const seen = new Set<string>();
    for (let h = getNextCoachHint(seen); h; h = getNextCoachHint(seen)) {
      expect(h.featureKey).not.toBe(INTERESTS_FEATURE_KEY);
      seen.add(h.featureKey);
    }
    expect(seen.size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/lib/onboarding.test.ts`
Expected: FAIL, `shouldShowInterestsNudge is not a function` (export missing).

- [ ] **Step 3: Implement the pure function**

Append to `src/lib/onboarding.ts` after `getNextCoachHint`:

```ts
// ─── Interests nudge (spec 2026-09-23 §2) ───

/** Stored in FEATURES_KEY like the coach hints, but never part of COACH_HINTS. */
export const INTERESTS_FEATURE_KEY = 'interests';

export interface InterestsNudgeInput {
  discovered: ReadonlySet<string>;
  hasInterests: boolean;
  isMobile: boolean;
  /** Read at mount: a first-time desktop visitor sees the tour's interests step instead. */
  desktopTourCompleted: boolean;
}

export function shouldShowInterestsNudge(i: InterestsNudgeInput): boolean {
  if (i.discovered.has(INTERESTS_FEATURE_KEY) || i.hasInterests) return false;
  return i.isMobile || i.desktopTourCompleted;
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/lib/onboarding.test.ts`
Expected: all pass (existing tour tests + 9 new).

- [ ] **Step 5: Translations (3 keys × 4 locales)**

After `'interests.active': 'active: {n}',` (`:46`):

```ts
  'interests.nudge': 'New: pick topics or regions and the most relevant matches get their own section at the top of the Relevance feed.',
  'interests.nudgePick': 'Pick',
  'interests.nudgeDismiss': 'Dismiss',
```

After `'interests.active': 'activos: {n}',` (`:769`, es):

```ts
  'interests.nudge': 'Nuevo: elige temas o regiones y las coincidencias más relevantes tendrán su propia sección arriba del feed por Relevancia.',
  'interests.nudgePick': 'Elegir',
  'interests.nudgeDismiss': 'Descartar',
```

After `'interests.active': 'actifs : {n}',` (`:1468`, fr):

```ts
  'interests.nudge': 'Nouveau : choisissez des thèmes ou des régions et les correspondances les plus pertinentes auront leur propre section en haut du fil par pertinence.',
  'interests.nudgePick': 'Choisir',
  'interests.nudgeDismiss': 'Ignorer',
```

After `'interests.active': 'ativos: {n}',` (`:2167`, pt):

```ts
  'interests.nudge': 'Novo: escolha temas ou regiões e as correspondências mais relevantes terão uma seção própria no topo do feed por Relevância.',
  'interests.nudgePick': 'Escolher',
  'interests.nudgeDismiss': 'Dispensar',
```

Run: `npx vitest run src/i18n/translations.test.ts && npx tsc --noEmit -p . 2>&1 | grep translations.ts`
Expected: tests pass; no tsc output (a missing key in es/fr/pt is a `TranslationKeys` error).

- [ ] **Step 6: Write the failing e2e (append to `e2e/interests.spec.ts`)**

Add `import { INTERESTS_KEY } from '../src/lib/interests';` to the imports, then append:

```ts
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
```

Run: `npx playwright test e2e/interests.spec.ts --reporter=list`
Expected: the 6 nudge tests FAIL (`data-interests-nudge` attribute missing, no `interests-nudge-pick`, no rail dot); the band test still passes.

- [ ] **Step 7: Sidebar nudge row**

`SidebarPanel.tsx` `Props` — after `onClearInterests?: () => void;` (`:42`):

```tsx
  /** 'pending' until CommandCenter reads storage after mount (SSR renders nothing). */
  interestsNudge?: 'pending' | 'show' | 'hide';
  onDismissInterestsNudge?: () => void;
```

Destructure both after `onClearInterests,`. Root (`:613`):

```tsx
    <div className="cc-sidebar-inner" style={S.sidebar} onKeyDown={handleKeyDown} tabIndex={-1} data-interests-nudge={interestsNudge ?? 'hide'}>
```

INTERESTS toggle `onClick` (`:715`):

```tsx
            onClick={() => {
              if (!showInterests) onDismissInterestsNudge?.();
              setShowInterests(v => !v);
            }}
```

Between the closing `</div>` of `.cc-sort-toggle` and the `{onToggleInterest && interestOptions && (<div id="cc-interest-chips" …` block:

```tsx
      {interestsNudge === 'show' && onToggleInterest && interestOptions && (
        <div className="cc-interests-nudge" role="note" data-testid="interests-nudge">
          <span className="cc-interests-nudge-text">{t('interests.nudge', locale)}</span>
          <button
            type="button"
            className="cc-sort-option"
            data-testid="interests-nudge-pick"
            onClick={() => {
              // The band only exists in OPS + Relevance (feedLayout); a visitor whose
              // saved view is Activity/DOMAIN/GEOGRAPHIC would otherwise see no effect.
              if (sortMode !== 'relevance') changeSort('relevance');
              if ((viewMode || 'operations') !== 'operations') onChangeViewMode?.('operations');
              setShowInterests(true);
              onDismissInterestsNudge?.();
            }}
          >
            {t('interests.nudgePick', locale)}
          </button>
          <button
            type="button"
            className="cc-sort-option"
            data-testid="interests-nudge-dismiss"
            aria-label={t('interests.nudgeDismiss', locale)}
            title={t('interests.nudgeDismiss', locale)}
            onClick={() => onDismissInterestsNudge?.()}
          >
            ×
          </button>
        </div>
      )}
```

- [ ] **Step 8: CommandCenter state and wiring**

Imports: `:26` → `import { interestOptions, hasInterests, loadInterests } from '../../../lib/interests';`; `:32` → add `isTourCompleted, shouldShowInterestsNudge, INTERESTS_FEATURE_KEY` to the `../../../lib/onboarding` import.

State, next to `discoveredFeatures` (`:230`):

```tsx
  // Interests nudge (spec 2026-09-23 §2): resolved after mount so SSR and the first render match.
  const [interestsNudge, setInterestsNudge] = useState<'pending' | 'show' | 'hide'>('pending');
  const dismissInterestsNudge = useCallback(() => {
    markFeatureDiscovered(INTERESTS_FEATURE_KEY);
    setInterestsNudge('hide');
  }, []);
  // Any chip toggle counts as discovery, so clearing interests later never brings the nudge back.
  const handleToggleInterest = useCallback((kind: 'domains' | 'regions', value: string) => {
    dismissInterestsNudge();
    toggleInterestChip(kind, value);
  }, [dismissInterestsNudge, toggleInterestChip]);
```

Mount effect, right after `setCoachHint(getNextCoachHint(discovered));` (`:304`):

```tsx
    setInterestsNudge(shouldShowInterestsNudge({
      discovered,
      hasInterests: hasInterests(loadInterests()),
      isMobile: window.innerWidth < 768,
      desktopTourCompleted: isTourCompleted('desktop'),
    }) ? 'show' : 'hide');
```

`<SidebarPanel>` (`:984`): replace `onToggleInterest={toggleInterestChip}` with

```tsx
              onToggleInterest={handleToggleInterest}
              interestsNudge={interestsNudge === 'show' && hasInterests(interests) ? 'hide' : interestsNudge}
              onDismissInterestsNudge={dismissInterestsNudge}
```

`?` panel chips (`:1113`): `onToggle={handleToggleInterest}`.

Collapsed rail (`:884-897`, shown by default at 768-1279 px, where `SidebarPanel` is not mounted and the nudge row could never render). On the "Expand sidebar" `<button>`, add `position: 'relative'` to its style, extend the label, and render a dot:

```tsx
              style={{ ...styles.sidebarToggleBtn, position: 'relative' as const }}
              aria-label={interestsNudge === 'show' ? `Expand sidebar. ${t('interests.nudge', locale)}` : 'Expand sidebar'}
              title="Expand sidebar"
              data-interests-nudge={interestsNudge}
            >
              {/* …existing svg… */}
              {interestsNudge === 'show' && (
                <span
                  data-testid="sidebar-expand-nudge-dot"
                  aria-hidden="true"
                  style={{ position: 'absolute', top: 2, right: 2, width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-blue)' }}
                />
              )}
```

(Replace the existing `style={styles.sidebarToggleBtn}`, `aria-label="Expand sidebar"` lines; keep `title` and the svg.) `t` and `locale` are already in scope (`CommandCenter.tsx:6` imports `t`).

- [ ] **Step 9: The tour step counts as discovery**

`OnboardingTour.tsx`: add `import { useEffect } from 'react';` and `import { markFeatureDiscovered, INTERESTS_FEATURE_KEY } from '../../../lib/onboarding';`. Right after the `useOnboardingController(...)` call (`:20-21`), before any early return:

```tsx
  // Reaching the interests step is discovery: no sidebar nudge on the next visit.
  useEffect(() => {
    if (active && DESKTOP_STEPS[stepIdx]?.id === 'hero-interests') markFeatureDiscovered(INTERESTS_FEATURE_KEY);
  }, [active, stepIdx]);
```

- [ ] **Step 10: Nudge row CSS**

Append to `src/styles/global.css` after `.interest-chips-clear { margin-top: 8px; }` (`:4167`):

```css
/* Interests nudge (spec 2026-09-23 §2): one line under the sort bar, shown once. */
.cc-interests-nudge { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 6px 12px 0; font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; color: var(--text-secondary); }
.cc-interests-nudge-text { flex: 1 1 12rem; min-width: 0; line-height: 1.4; }
```

- [ ] **Step 11: Verify**

```bash
npx tsc --noEmit -p . 2>&1 | grep -E 'SidebarPanel|CommandCenter|OnboardingTour|onboarding.ts'   # Expected: no output
npx vitest run src/lib/onboarding.test.ts src/lib/onboarding-steps.test.ts                      # Expected: PASS
npx playwright test e2e/interests.spec.ts --reporter=list                                      # Expected: 7 passed
```

- [ ] **Step 12: Commit**

```bash
git add src/lib/onboarding.ts src/lib/onboarding.test.ts src/i18n/translations.ts src/styles/global.css \
  src/components/islands/CommandCenter/SidebarPanel.tsx src/components/islands/CommandCenter/CommandCenter.tsx \
  src/components/islands/Onboarding/OnboardingTour.tsx e2e/interests.spec.ts
git commit -m "feat(interests): one-time sidebar nudge for visitors who finished the tour"
```

## Task 5: `e2e/radio-layer.spec.ts`

**Files:**
- Create: `e2e/radio-layer.spec.ts`
- Modify: `.github/workflows/e2e.yml:37`

**Interfaces:**
- Consumes (existing, no code change): `RADIO_GLOBAL_PATH = 'geo/layers/radio-stations-global.geojson'` (`src/lib/radio-global.ts:22`), pref key `watchboard:home-radio-layer` (`radio-global.ts:51`, private until Task 6 — this spec only reads it through the UI), toggle `[data-testid="radio-layer-toggle"]` with `aria-pressed` (`GlobePanel.tsx:781-792`), pill `[data-testid="radio-layer-status"]` with class `cc-radio-layer-{idle|loading|ready|error}` and a Retry `<button>` in the error state (`GlobePanel.tsx:801-812`), pins `[data-testid="radio-pin"]` (`GlobePanel.tsx:626`), attribution text `radio.layerAttribution` (`translations.ts:211`, contains `radio-browser.info` in every locale).
- Behaviour under test: `radioLayerOn` starts `false` (`CommandCenter.tsx:194`), the fetch effect runs only when on (`:198-209`), Retry resets status and bumps `radioRetry` (`:220-223`).

This task adds a guard to shipped code, so "failing first" is proven by breaking the code on purpose (Step 3), not by a missing feature.

- [ ] **Step 1: Write the spec**

```ts
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
const FIXTURE = JSON.stringify({
  type: 'FeatureCollection',
  features: [station('fx-1', 'Fixture FM', -99.13, 19.43, 500), station('fx-2', 'Fixture AM', 2.35, 48.86, 300)],
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
```

- [ ] **Step 2: Run it — expect PASS**

Run: `npx playwright test e2e/radio-layer.spec.ts --reporter=list`
Expected: 2 passed.

- [ ] **Step 3: Prove it can fail**

In `CommandCenter.tsx:194` change `useState(false)` to `useState(true)`, re-run Step 2. Expected: the first test FAILS on `aria-pressed` `"false"` (or on `calls.n` `0`). Then in `CommandCenter.tsx:222` comment out `setRadioRetry(n => n + 1);`, restore `:194`, re-run. Expected: the second test FAILS — Retry sets status `idle` but nothing re-runs the fetch effect (`radioLayerStatus` is not one of its dependencies, `CommandCenter.tsx:209`), so the pill stays `cc-radio-layer-idle`, never `ready`, and `calls.n` stays 1. Revert both: `git diff --stat src/components/islands/CommandCenter/CommandCenter.tsx` must print nothing.

- [ ] **Step 4: Register the spec and check coverage**

Append ` e2e/radio-layer.spec.ts` to the `npx playwright test` line in `.github/workflows/e2e.yml:37`.

Run: `npx vitest run tests/e2e-workflow-coverage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/radio-layer.spec.ts .github/workflows/e2e.yml
git commit -m "test(e2e): guard the homepage radio toggle (off by default, lazy fetch, retry)"
```

## Task 6: Mobile QA — spec first, then CSS

**Files:**
- Create: `e2e/home-mobile.spec.ts`
- Modify: `src/lib/radio-global.ts:51` (export the pref key so the spec does not copy the literal)
- Modify: `src/components/islands/CommandCenter/CommandCenter.tsx:846-857` (tab `data-testid`s)
- Modify: `src/styles/global.css` (after the Task 4 nudge rules, i.e. after `:4167` block)
- Modify: `.github/workflows/e2e.yml` (spec on `:37`; new screenshot upload step)

**Interfaces:**
- Produces: `export const RADIO_LAYER_PREF_KEY = 'watchboard:home-radio-layer';` (replaces the private `PREF_KEY`; `readRadioLayerPref`/`writeRadioLayerPref` use it unchanged). Buttons `[data-testid="mobile-tab-live"]`, `[data-testid="mobile-tab-trackers"]`.
- Consumes: nudge + chips DOM (Tasks 3-4); `.cc-globe .globe-lights-toggle` (mobile rule `src/pages/index.astro:310-315`); radio toggle/pill (Task 5).

Prediction being tested (spec §3.2): on phones the radio toggle (inline `top:44`, 28×28, `z-index:15`, `GlobePanel.tsx:785-790` + `:885-899`) sits under the lights toggle (`top:48px`, 44×44, `z-index:60`), and the pill (`global.css:3437-3459`, `top:44px; right:44px`) overlaps the lights toggle. **If the radio test passes before the CSS in Step 5, stop: the reading was wrong. Inspect the `mobile-radio-*.png` screenshots and revise before touching CSS.**

- [ ] **Step 1: Test hooks**

`radio-global.ts:51`: rename `const PREF_KEY = …` to `export const RADIO_LAYER_PREF_KEY = 'watchboard:home-radio-layer';` and update its two uses (`:55`, `:59`).

`CommandCenter.tsx:846` and `:852`: add `data-testid="mobile-tab-live"` to the LIVE `<button>` and `data-testid="mobile-tab-trackers"` to the TRACKERS `<button>`.

Run: `npx vitest run src/lib/radio-global.test.ts` — Expected: PASS.

- [ ] **Step 2: Write the failing spec**

```ts
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
```

- [ ] **Step 3: Run it — expect FAIL**

Run: `npx playwright test e2e/home-mobile.spec.ts --reporter=list`
Expected: 14 tests; 13 FAIL and 1 passes. TRACKERS tests fail on `smallTargets` with entries of `h` ≈ 18; LIVE tests fail on radio toggle width 28 (< 44) or `radio toggle is covered`; the 5 error-state tests fail on Retry height ≈ 11 (< 32) or `error pill text is clipped`. The one that passes is the pinned `/fr/` + en-US case (it documents today's behaviour and must pass before and after). Open `test-results/**/mobile-radio-360-en.png` and confirm the radio toggle is hidden under the lights toggle. If the LIVE tests pass here, stop (see the prediction note above).

- [ ] **Step 4: Tap-target CSS**

Append to `src/styles/global.css` after the Task 4 `.cc-interests-nudge-text` rule:

```css
/* Tap targets (spec 2026-09-23 §3.1, WCAG 2.5.8): 24 px everywhere, 32 px on
   phones. 32 not 44: up to 23 chips must leave the feed on the first 740 px
   screen. Phones only (no `pointer: coarse` branch): wide touch devices keep
   the 24 px base, so there is no second, untested desktop layout.
   Covers the nudge buttons too (they are .cc-sort-option). */
.cc-sort-option, .interest-chip { min-height: 24px; display: inline-flex; align-items: center; }
/* Radio pill Retry: was padding 0 at 0.56rem (~11 px tall). */
.cc-radio-layer-status button { min-height: 24px; padding: 0 6px; display: inline-flex; align-items: center; }
@media (max-width: 767px) {
  .cc-sort-option, .interest-chip { min-height: 32px; padding: 4px 10px; }
  .cc-sort-toggle, .cc-sort-group, .interest-chips-row { gap: 6px; }
  .cc-radio-layer-status button { min-height: 32px; }
}
```

Run: `npx playwright test e2e/home-mobile.spec.ts -g "TRACKERS" --reporter=list`
Expected: 4 passed (LIVE and error-state tests still fail).

- [ ] **Step 5: Radio toggle + pill CSS**

Append right after the Step 4 block:

```css
/* Phones: the lights toggle moves to top:48px, 44×44, z 60 (src/pages/{,es/,fr/,pt/}index.astro:310-315).
   Stack the radio toggle under it and keep its status pill clear of both.
   !important only on the toggle: GlobePanel.tsx sets its geometry inline. */
@media (max-width: 767px) {
  .cc-globe .globe-radio-toggle {
    top: 100px !important;
    width: 44px !important;
    height: 44px !important;
    z-index: 60 !important;
  }
  /* May wrap to two lines: nowrap + overflow:hidden (global.css:3452-3454)
     clipped the attribution and the pt/fr error + Retry at 280 px. */
  .cc-globe .cc-radio-layer-status {
    top: 106px;
    right: 62px;
    height: auto;
    min-height: 32px;
    max-width: calc(100% - 80px);
    padding: 4px 8px;
    line-height: 1.3;
    white-space: normal;
    flex-wrap: wrap;
    z-index: 60;
  }
}
```

Run: `npx playwright test e2e/home-mobile.spec.ts --reporter=list`
Expected: 14 passed. Open the `mobile-radio-*.png`, `mobile-radio-error-*.png` and `mobile-chips-*.png` under `test-results/` and check by eye: fr/pt labels, no clipped chip or pill text, pill left of the toggles, Retry clearly tappable.

- [ ] **Step 6: Desktop regression**

Run: `npx playwright test e2e/interests.spec.ts e2e/radio-layer.spec.ts e2e/activity-sort.spec.ts --reporter=list`
Expected: all pass (desktop keeps the 28 px radio toggle; only the `min-height: 24px` rules for sort options, chips and the Retry button changed there).

- [ ] **Step 7: CI wiring**

In `.github/workflows/e2e.yml`, append ` e2e/home-mobile.spec.ts` to the `npx playwright test` line (`:37`), and insert this step between "Run shareable-view specs" and "Upload traces on failure":

```yaml
      # No `if:`: runs only when the specs passed, and fails the job if they
      # produced no screenshots (a mobile spec that silently skipped).
      - name: Upload mobile QA screenshots
        uses: actions/upload-artifact@v4
        with:
          name: mobile-qa-screenshots
          path: test-results/**/mobile-*.png
          if-no-files-found: error
          retention-days: 14
```

Run: `npx vitest run tests/e2e-workflow-coverage.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add e2e/home-mobile.spec.ts src/lib/radio-global.ts src/styles/global.css .github/workflows/e2e.yml \
  src/components/islands/CommandCenter/CommandCenter.tsx
git commit -m "fix(home-mobile): 32 px tap targets, reachable radio toggle, pill clear of the lights toggle"
```

## Task 7: Final verification and docs

**Files:**
- Modify: `CLAUDE.md` (Utilities list, after the `live-layers.ts` bullet)

- [ ] **Step 1: Document the module**

Add under `### Utilities (src/lib/)` in `CLAUDE.md`:

```md
- `feed-buckets.ts` — the sidebar feed order, shared by `FeedList` (what renders) and `flatSlugs` (what arrow keys walk). OPS + Relevance: followed → the first `INTEREST_BAND_MAX` (6) declared-interest matches *in relevance order* under a "Your interests" label → recent (≤ 48 h, `OLDER_THRESHOLD_MS`) → older (dimmed, also inside the band). Relevance is not freshness (activity and breaking outweigh recency), so a stale active match can hold a band slot while a fresh quiet match stays in `recent`; that is by design and pinned by a unit test. No interests, or a non-empty search, = the pre-v2 layout exactly (tested against a literal copy). Activity is flat, DOMAIN groups by domain; neither has a band. The one-time sidebar nudge for visitors who finished the desktop tour is `shouldShowInterestsNudge` in `onboarding.ts` (feature key `'interests'`, never a `COACH_HINTS` entry); with the sidebar collapsed it shows as a dot on the rail's expand button, and its Pick button switches to OPS + Relevance.
```

- [ ] **Step 2: Full unit suite**

Run: `npm test`
Expected: all pass, including `feed-buckets.test.ts`, `onboarding.test.ts`, `translations.test.ts`, `e2e-workflow-coverage.test.ts`.

- [ ] **Step 3: Type check (touched files only)**

```bash
npx tsc --noEmit -p . 2>&1 | grep -E 'feed-buckets|SidebarPanel|FeedRow|InterestChips|CommandCenter|OnboardingTour|onboarding\.ts|translations\.ts|radio-global|e2e/'
```

Expected: no output. Errors in files this plan did not touch are pre-existing and out of scope.

Then the check the spec asks for, with a larger heap (the default OOMs locally):

```bash
NODE_OPTIONS=--max-old-space-size=8192 npm run check
```

Expected: exit 0. If it OOMs even at 8 GB, record that in the PR body ("`astro check` could not complete locally; tsc on touched files clean") — this is the spec deviation listed below, not a silent skip.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exit 0. Do **not** grep `dist/index.html` for the sidebar list: the sidebar is collapsed on the server (`CommandCenter.tsx:166` `useState(true)`, `:884` renders the rail), so `SidebarPanel` and `data-testid="sidebar-feed"` are not in the SSR HTML (0 matches today for `cc-sidebar-inner`). The hydrated list is verified by the e2e specs in Step 5.

- [ ] **Step 5: Full CI e2e line, locally**

Run the exact command from `.github/workflows/e2e.yml:37` (after `npm run generate-api`, which `activity-sort.spec.ts` needs):

```bash
npm run generate-api
PUBLIC_ENABLE_DEEPSTATE=true npx playwright test $(grep -o 'e2e/[a-z-]*\.spec\.ts' .github/workflows/e2e.yml | tr '\n' ' ') --reporter=list
find test-results -name 'mobile-*.png' | wc -l   # Expected: 17 (4 per viewport×locale describe × 4, + 1 pt error)
```

Expected: every spec passes; 17 screenshots exist. Time the whole command (`time …`) and put the wall-clock in the PR body next to the current E2E job time (~6-7 min, `timeout-minutes: 25` in `e2e.yml`). If it exceeds 15 min, stop and raise it with the owner before merging (the job also runs on every bot push to `main`).

- [ ] **Step 6: Commit and open the PR**

```bash
git add CLAUDE.md
git commit -m "docs: feed-buckets and the interests nudge"
git push -u origin HEAD
gh pr create --title "feat(interests): v2 band + nudge; homepage mobile QA and e2e guards" --body "..."
```

PR body: summary of the four pieces (spec link), the three new Playwright specs and the coverage guard, and the open questions from the spec (band limit 6, `/fr/` hydrating to the browser locale — not fixed here, 24 px on desktop). End with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 7: Merge gate (CLAUDE.md "Merging")**

`main` has no required checks, so auto-merge fires instantly. Run `gh pr checks <n> --watch --fail-fast`, confirm the `mobile-qa-screenshots` artifact exists on the E2E run and contains 17 PNGs, confirm the owner answered open question 2 (`/fr/` locale) and 4 (band membership), then merge by hand.

## Spec deviations and open questions

- **Band label reuses `interests.title`** ("Your interests" / "Tus intereses" / "Vos centres d’intérêt" / "Seus interesses", `translations.ts:40,763,1462,2161`) instead of a new `feed.interestBand` key: same text in every locale, so 3 new keys instead of the spec's 4.
- **Nudge readiness is an attribute** (`data-interests-nudge`), not only an absent element, so tests can tell "not yet decided" from "decided to hide" without sleeping.
- **`flatSlugs` now also follows DOMAIN grouping**, not only Activity; the spec's §1.1 divergence exists there too (`SidebarPanel.tsx:419-443` groups, `flatSlugs` did not).
- **Type check:** the spec requires `npm run check`. Per task the plan uses `tsc --noEmit` filtered to touched files (astro check OOMs at the default heap); Task 7 Step 3 runs `npm run check` with an 8 GB heap, and if that still fails the PR says so explicitly.
- **Open (owner):** band limit 6; band membership (spec open question 4: relevance order vs recent-first vs reserved slots vs "show all"; the tests pin relevance order); whether Pick may override a saved Activity/DOMAIN/GEOGRAPHIC view (question 5); whether `/fr/` should switch to the browser locale on hydration (`CommandCenter.tsx:301`, not changed here; the mobile spec verifies fr with `fr-FR` and pins the current en-US behaviour in a separate test; **decide before merge**); 24 px targets on desktop and touch laptops/tablets.
