# User Interests in Relevance Ranking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor declare topic (domain) and region interests. Trackers that match get +10 in the relevance score, which already drives the homepage sidebar, the hero card, the mobile stories and broadcast mode.

**Architecture:** Interests live only in the visitor's browser (`localStorage`), like follows. A pure module (`src/lib/interests.ts`) handles parsing, toggling and matching. A thin hook (`useInterests`) loads the state after mount and keeps every mount in sync through a window event, so a chip clicked in the onboarding tour immediately re-ranks the sidebar. `sortByRelevance` gains an optional `interests` argument, and all four call sites pass it. The UI is a shared `InterestChips` component. It is mounted in three places: the `?` help overlay, a collapsible block in the sidebar (which is also the mobile TRACKERS tab), and a new skippable desktop tour step.

**Tech Stack:** TypeScript, React 19 islands, Zod, Vitest (node environment; there is no DOM testing library, so the logic lives in pure functions and gets tested there).

**Spec:** `docs/superpowers/specs/2026-09-22-homepage-relevance-ranking-design.md`

## Deviations from the spec (decided while planning)

- **Spec §1 (rank `TrackerDirectory.tsx`) is dropped.** The component isn't mounted on any page: `grep -rln TrackerDirectory src` finds only the component and its utils. The homepage is `CommandCenter` only (`src/pages/index.astro`). Its tracker list, `SidebarPanel`, already ranks with `sortByRelevance` / `sortByActivity` (`SidebarPanel.tsx:525`). This covers desktop, and mobile via the TRACKERS tab. No work is needed there. Deleting the dead component is out of scope.
- **Hook name:** `useInterests` (`src/components/islands/shared/useInterests.ts`). The pure module is `src/lib/interests.ts`.
- **Onboarding step type:** `'interests'` (id `hero-interests`), matching the existing `hero-*` ids.
- **Mobile:** there is no mobile tour step (the spec leaves this out of scope). Mobile visitors still get the sidebar block, because the sidebar is the mobile TRACKERS tab.

## Global Constraints

- The interest bonus is exactly **+10** (`INTEREST_BONUS`). It applies when `tracker.domain` or `tracker.region` is among the declared interests. With no interests declared, or no match, it is 0.
- With no interests declared, every ranking must be **identical to today's**. Existing tests must keep passing unchanged.
- Storage key is `watchboard:interests-v1`. Every `localStorage` read and write is wrapped in `try/catch`. State is read **after mount** (`useEffect`), never during render, to avoid SSR hydration mismatch (React #418).
- Valid values come only from `DomainSchema` / `RegionSchema` in `src/lib/tracker-config.ts`. Unknown stored values are dropped when loading. No new vocabulary.
- Every click persists immediately. There are no save or cancel buttons.
- i18n: every new key goes into all four locale objects in `src/i18n/translations.ts` (en, es, fr, pt). `TranslationKeys` is `Record<keyof typeof en, string>`, so `tsc` fails if a locale is missing a key.
- Chips offer only domains and regions that at least one tracker actually has, each with its count.
- No new dependencies. No backend.
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/interests.ts` (new) | `Interests` type, parse/serialize, `toggleInterest`, `matchesInterests`, `interestOptions`, storage helpers + change event |
| `src/lib/interests.test.ts` (new) | Unit tests for the above |
| `src/lib/relevance.ts` | `matchesInterest` input, `INTEREST_BONUS`, `sortByRelevance(…, interests?)` |
| `src/lib/relevance.test.ts` | New cases |
| `src/lib/hero-selection.ts` (+ its test if present) | Pass `interests` through |
| `src/components/islands/shared/useInterests.ts` (new) | React hook: load after mount, subscribe to the change event, `toggle` / `clear` |
| `src/components/islands/shared/InterestChips.tsx` (new) | Chip UI (domains + regions, counts, clear) |
| `src/components/islands/CommandCenter/CommandCenter.tsx` | Own the hook, thread `interests` down, mount chips in the `?` overlay, pass options to the tour |
| `SidebarPanel.tsx`, `useStoryState.ts`, `MobileStoryCarousel.tsx`, `useBroadcastMode.ts` | Accept and forward `interests` |
| `src/lib/onboarding-steps.ts` (+ test), `Onboarding/OnboardingTour.tsx`, `Onboarding/HeroStep.tsx` | New `interests` step |
| `src/i18n/translations.ts` | New keys ×4 locales |
| `src/styles/global.css` | `.interest-chip*` styles next to `.cc-sort-*` (~line 4114) |
| `CLAUDE.md` | Document interests under "Activity index (E7)" consumers |

---

### Task 1: Pure interests module + relevance term

**Files:**
- Create: `src/lib/interests.ts`, `src/lib/interests.test.ts`
- Modify: `src/lib/relevance.ts`, `src/lib/relevance.test.ts`, `src/lib/hero-selection.ts`

**Interfaces:**
- Produces (used by every later task):
  - `interface Interests { domains: Domain[]; regions: Region[] }`
  - `const EMPTY_INTERESTS: Interests`
  - `const INTERESTS_KEY = 'watchboard:interests-v1'`
  - `const INTERESTS_CHANGED_EVENT = 'watchboard:interests-changed'`
  - `parseInterests(raw: unknown): Interests`
  - `hasInterests(i: Interests): boolean`
  - `toggleInterest(i: Interests, kind: 'domains' | 'regions', value: string): Interests`
  - `matchesInterests(t: { domain?: string; region?: string }, i: Interests): boolean`
  - `interestOptions(trackers: { domain?: string; region?: string }[]): { domains: { value: Domain; count: number }[]; regions: { value: Region; count: number }[] }`
  - `loadInterests(): Interests`
  - `saveInterests(i: Interests): void` (persists, then dispatches `INTERESTS_CHANGED_EVENT` with `detail: Interests`)
  - relevance: `INTEREST_BONUS = 10`; `RelevanceInput.matchesInterest?: boolean`; `sortByRelevance<T>(trackers: T[], followedSlugs: string[], interests?: Interests): T[]`; `SortableTracker` gains `domain?: string; region?: string`
  - `selectHeroTracker(trackers, followedSlugs, interests?: Interests)`

- [ ] **Step 1: Write failing tests** — `src/lib/interests.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  EMPTY_INTERESTS, INTERESTS_KEY, INTERESTS_CHANGED_EVENT,
  parseInterests, hasInterests, toggleInterest, matchesInterests,
  interestOptions, loadInterests, saveInterests,
} from './interests';

describe('parseInterests', () => {
  it('keeps only known domains and regions, deduped', () => {
    expect(parseInterests({ domains: ['conflict', 'bogus', 'conflict'], regions: ['europe', 7] }))
      .toEqual({ domains: ['conflict'], regions: ['europe'] });
  });
  it('returns empty for garbage', () => {
    expect(parseInterests(null)).toEqual(EMPTY_INTERESTS);
    expect(parseInterests('x')).toEqual(EMPTY_INTERESTS);
    expect(parseInterests({ domains: 'conflict' })).toEqual(EMPTY_INTERESTS);
  });
});

describe('toggleInterest', () => {
  it('adds then removes without mutating', () => {
    const a = toggleInterest(EMPTY_INTERESTS, 'domains', 'science');
    expect(a.domains).toEqual(['science']);
    expect(EMPTY_INTERESTS.domains).toEqual([]);
    expect(toggleInterest(a, 'domains', 'science').domains).toEqual([]);
  });
  it('ignores unknown values', () => {
    expect(toggleInterest(EMPTY_INTERESTS, 'regions', 'atlantis')).toEqual(EMPTY_INTERESTS);
  });
});

describe('matchesInterests', () => {
  const i = { domains: ['science' as const], regions: ['europe' as const] };
  it('matches on domain or region', () => {
    expect(matchesInterests({ domain: 'science' }, i)).toBe(true);
    expect(matchesInterests({ domain: 'conflict', region: 'europe' }, i)).toBe(true);
    expect(matchesInterests({ domain: 'conflict', region: 'africa' }, i)).toBe(false);
    expect(matchesInterests({}, i)).toBe(false);
  });
  it('never matches with no interests', () => {
    expect(matchesInterests({ domain: 'science' }, EMPTY_INTERESTS)).toBe(false);
    expect(hasInterests(EMPTY_INTERESTS)).toBe(false);
    expect(hasInterests(i)).toBe(true);
  });
});

describe('interestOptions', () => {
  it('lists only values present, with counts, in schema order', () => {
    const opts = interestOptions([
      { domain: 'science', region: 'europe' },
      { domain: 'conflict', region: 'europe' },
      { domain: 'conflict' },
      { domain: 'not-a-domain' },
    ]);
    expect(opts.domains).toEqual([{ value: 'conflict', count: 2 }, { value: 'science', count: 1 }]);
    expect(opts.regions).toEqual([{ value: 'europe', count: 2 }]);
  });
});

describe('storage', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('round-trips and dispatches the change event', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    });
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('CustomEvent', class { type: string; detail: unknown; constructor(t: string, init: { detail: unknown }) { this.type = t; this.detail = init.detail; } });
    const i = { domains: ['science' as const], regions: [] };
    saveInterests(i);
    expect(JSON.parse(store.get(INTERESTS_KEY)!)).toEqual(i);
    expect(loadInterests()).toEqual(i);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(INTERESTS_CHANGED_EVENT);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual(i);
  });

  it('degrades to empty when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    vi.stubGlobal('CustomEvent', class { constructor(public type: string, public init: unknown) {} });
    expect(loadInterests()).toEqual(EMPTY_INTERESTS);
    expect(() => saveInterests({ domains: ['science'], regions: [] })).not.toThrow();
  });
});
```

Append to `src/lib/relevance.test.ts`. Also update the import line to add `INTEREST_BONUS`:

```ts
describe('interests', () => {
  const base = { lastUpdated: NOW, isFollowed: false, activityScore: 50 };
  it('adds INTEREST_BONUS only on a match', () => {
    expect(INTEREST_BONUS).toBe(10);
    expect(computeRelevanceScore({ ...base, matchesInterest: true }) - computeRelevanceScore(base))
      .toBeCloseTo(INTEREST_BONUS, 5);
    expect(computeRelevanceScore({ ...base, matchesInterest: false })).toBeCloseTo(computeRelevanceScore(base), 5);
  });
  it('ranks a matching tracker above an otherwise equal one', () => {
    const a = { slug: 'a', lastUpdated: NOW, activity: { score: 50 }, domain: 'conflict' };
    const b = { slug: 'b', lastUpdated: NOW, activity: { score: 50 }, domain: 'science' };
    expect(sortByRelevance([a, b], [], { domains: ['science'], regions: [] }).map(t => t.slug)).toEqual(['b', 'a']);
  });
  it('is identical to today without interests', () => {
    const list = [
      { slug: 'a', lastUpdated: NOW, activity: { score: 10 }, domain: 'science' },
      { slug: 'b', lastUpdated: NOW, activity: { score: 90 }, domain: 'conflict' },
    ];
    expect(sortByRelevance(list, [], { domains: [], regions: [] })).toEqual(sortByRelevance(list, []));
  });
  it('keeps follow (+15) above interest (+10)', () => {
    const followed = { slug: 'f', lastUpdated: NOW, activity: { score: 50 }, domain: 'conflict' };
    const interesting = { slug: 'i', lastUpdated: NOW, activity: { score: 50 }, domain: 'science' };
    expect(sortByRelevance([interesting, followed], ['f'], { domains: ['science'], regions: [] })[0].slug).toBe('f');
  });
});
```

- [ ] **Step 2: Run to confirm failure.** `npx vitest run src/lib/interests.test.ts src/lib/relevance.test.ts`. Expected: FAIL, cannot resolve `./interests` / `INTEREST_BONUS` undefined.

- [ ] **Step 3: Implement** `src/lib/interests.ts`:

```ts
/**
 * Visitor-declared topic/region interests (spec 2026-09-22). Browser-only,
 * like follows: no backend, every read/write guarded, read after mount.
 * A match adds INTEREST_BONUS in relevance.ts.
 */
import { DomainSchema, RegionSchema, type Domain, type Region } from './tracker-config';

export interface Interests {
  domains: Domain[];
  regions: Region[];
}

export const EMPTY_INTERESTS: Interests = Object.freeze({ domains: [], regions: [] }) as Interests;
export const INTERESTS_KEY = 'watchboard:interests-v1';
/** Fired on window after every save so all mounts (sidebar, tour, help overlay) stay in sync. */
export const INTERESTS_CHANGED_EVENT = 'watchboard:interests-changed';

const DOMAINS = DomainSchema.options as readonly Domain[];
const REGIONS = RegionSchema.options as readonly Region[];

function pick<T extends string>(raw: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(raw)) return [];
  return allowed.filter(v => raw.includes(v));
}

export function parseInterests(raw: unknown): Interests {
  if (!raw || typeof raw !== 'object') return { domains: [], regions: [] };
  const o = raw as Record<string, unknown>;
  return { domains: pick(o.domains, DOMAINS), regions: pick(o.regions, REGIONS) };
}

export function hasInterests(i: Interests): boolean {
  return i.domains.length > 0 || i.regions.length > 0;
}

export function toggleInterest(i: Interests, kind: 'domains' | 'regions', value: string): Interests {
  const allowed: readonly string[] = kind === 'domains' ? DOMAINS : REGIONS;
  if (!allowed.includes(value)) return i;
  const list = i[kind] as string[];
  const next = list.includes(value) ? list.filter(v => v !== value) : [...list, value];
  // Keep schema order so storage and chip order are stable.
  return { ...i, [kind]: allowed.filter(v => next.includes(v)) };
}

export function matchesInterests(t: { domain?: string; region?: string }, i: Interests): boolean {
  return (!!t.domain && (i.domains as string[]).includes(t.domain))
    || (!!t.region && (i.regions as string[]).includes(t.region));
}

export function interestOptions(trackers: { domain?: string; region?: string }[]) {
  const count = <T extends string>(allowed: readonly T[], key: 'domain' | 'region') =>
    allowed
      .map(value => ({ value, count: trackers.filter(t => t[key] === value).length }))
      .filter(o => o.count > 0);
  return { domains: count(DOMAINS, 'domain'), regions: count(REGIONS, 'region') };
}

export function loadInterests(): Interests {
  try {
    const raw = localStorage.getItem(INTERESTS_KEY);
    return raw ? parseInterests(JSON.parse(raw)) : { domains: [], regions: [] };
  } catch { return { domains: [], regions: [] }; }
}

export function saveInterests(i: Interests): void {
  try { localStorage.setItem(INTERESTS_KEY, JSON.stringify(i)); } catch {}
  try { window.dispatchEvent(new CustomEvent(INTERESTS_CHANGED_EVENT, { detail: i })); } catch {}
}
```

The `interestOptions` test expects schema order: `conflict` comes before `science` in `DomainSchema`. Keep that.

In `src/lib/relevance.ts`:
- Header comment: add a line `2b. Declared interests (+10): domain or region match (src/lib/interests.ts)`.
- `export const INTEREST_BONUS = 10;` next to `ACTIVITY_WEIGHT`.
- `RelevanceInput`: add `/** Tracker domain/region matches a declared interest. */ matchesInterest?: boolean;`
- In `computeRelevanceScore`, after the followed line: `if (input.matchesInterest) score += INTEREST_BONUS;`
- `SortableTracker`: add `domain?: string; region?: string;`
- `sortByRelevance(trackers, followedSlugs, interests: Interests = EMPTY_INTERESTS)`: pass `matchesInterest: matchesInterests(a, interests)` (and the same for `b`) in both score calls. Import `EMPTY_INTERESTS, matchesInterests, type Interests` from `./interests`.

In `src/lib/hero-selection.ts`: add a third parameter `interests?: Interests`, pass it to `sortByRelevance`, and update the doc comment ("Stable for a given (trackers, followedSlugs, interests)").

- [ ] **Step 4: Run.** `npx vitest run src/lib/interests.test.ts src/lib/relevance.test.ts src/lib/hero-selection.test.ts`. All PASS (the hero test may not exist; skip it if absent). Then `npx tsc --noEmit -p .`. If the repo's type check is `astro check`, use `npx astro check` instead; `package.json` has the `build` script, so check what it runs.

- [ ] **Step 5: Commit.** `git add src/lib/interests.ts src/lib/interests.test.ts src/lib/relevance.ts src/lib/relevance.test.ts src/lib/hero-selection.ts && git commit -m "feat(ranking): declared interests add +10 to relevance"`

---

### Task 2: `useInterests` hook + thread interests to every ranking consumer

**Files:**
- Create: `src/components/islands/shared/useInterests.ts`
- Modify: `CommandCenter/CommandCenter.tsx`, `CommandCenter/SidebarPanel.tsx`, `CommandCenter/useStoryState.ts`, `CommandCenter/MobileStoryCarousel.tsx`, `CommandCenter/useBroadcastMode.ts`

**Interfaces:**
- Consumes (Task 1): `Interests`, `EMPTY_INTERESTS`, `loadInterests`, `saveInterests`, `toggleInterest`, `INTERESTS_CHANGED_EVENT`, `sortByRelevance(…, interests)`, `selectHeroTracker(…, interests)`.
- Produces: `useInterests(): { interests: Interests; toggle: (kind: 'domains' | 'regions', value: string) => void; clear: () => void }`. It is used in Tasks 3 and 4.

- [ ] **Step 1: Write the hook:**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EMPTY_INTERESTS, INTERESTS_CHANGED_EVENT, loadInterests, saveInterests, toggleInterest,
  type Interests,
} from '../../../lib/interests';

/**
 * Declared interests, loaded after mount (SSR renders EMPTY so hydration
 * matches) and kept in sync across mounts via INTERESTS_CHANGED_EVENT.
 */
export function useInterests() {
  const [interests, setInterests] = useState<Interests>(EMPTY_INTERESTS);

  useEffect(() => {
    setInterests(loadInterests());
    const onChange = (e: Event) => setInterests((e as CustomEvent<Interests>).detail);
    window.addEventListener(INTERESTS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(INTERESTS_CHANGED_EVENT, onChange);
  }, []);

  // Every mount receives the change event, so this ref is always current,
  // and it keeps working in a browser where localStorage throws.
  const ref = useRef(interests);
  ref.current = interests;

  const toggle = useCallback((kind: 'domains' | 'regions', value: string) => {
    // saveInterests broadcasts; every mount's listener (ours included) applies it.
    saveInterests(toggleInterest(ref.current, kind, value));
  }, []);

  const clear = useCallback(() => saveInterests({ domains: [], regions: [] }), []);

  return { interests, toggle, clear };
}
```

(Import `useRef` too.) The broadcast is the only path that updates state, so a toggle in the tour re-ranks the sidebar immediately, and a browser without storage still works for the session.

- [ ] **Step 2: Thread it.**
  - `CommandCenter.tsx`: `const { interests, toggle: toggleInterestChip, clear: clearInterests } = useInterests();` next to `followedSlugs`. Pass `interests` to `useBroadcastMode(…)`, to `<SidebarPanel interests={interests} …>` and to `<MobileStoryCarousel interests={interests} …>`. `useBroadcastMode` currently takes `followedSlugs` positionally (check the signature at `useBroadcastMode.ts:67`); add `interests: Interests = EMPTY_INTERESTS` as the **last** positional parameter.
  - `useBroadcastMode.ts`: `sortByRelevance(eligible, followedSlugs, interests)` and add `interests` to that effect's deps.
  - `SidebarPanel.tsx`: new optional prop `interests?: Interests`, defaulted to `EMPTY_INTERESTS`. Use it in `sortByRelevance(filtered, followedSlugs, interests)` (line ~526) and `selectHeroTracker(trackers, followedSlugs, interests)` (line ~533). Add it to both memo dep arrays.
  - `useStoryState.ts`: option `interests?: Interests`. Pass it through `filterAndSort(trackers, followedSlugs, seenSlugs, interests)` → `sortByRelevance(eligible, followedSlugs, interests)`, and add it to deps wherever `followedSlugs` appears.
  - `MobileStoryCarousel.tsx`: prop `interests?: Interests`, forwarded to `useStoryState`.
  - Grep to confirm there are no other callers: `grep -rn "sortByRelevance\|selectHeroTracker" src --include='*.ts' --include='*.tsx' | grep -v test`. Every hit must pass `interests`.

- [ ] **Step 3: Verify.** `npx vitest run` (the whole suite, about 30 s) is green. The type check is clean.

- [ ] **Step 4: Commit.** `feat(ranking): thread declared interests through sidebar, hero, stories, broadcast`

---

### Task 3: Interest chips UI (sidebar block + `?` overlay) and i18n

**Files:**
- Create: `src/components/islands/shared/InterestChips.tsx`
- Modify: `CommandCenter/SidebarPanel.tsx`, `CommandCenter/CommandCenter.tsx`, `src/i18n/translations.ts`, `src/styles/global.css`

**Interfaces:**
- Consumes: `useInterests` (Task 2), `interestOptions` (Task 1).
- Produces: `InterestChips` with the props below. Task 4 reuses it.

```ts
interface InterestChipsProps {
  interests: Interests;
  options: ReturnType<typeof interestOptions>;
  locale: Locale;
  onToggle: (kind: 'domains' | 'regions', value: string) => void;
  onClear?: () => void;
  compact?: boolean;
}
```

- [ ] **Step 1: i18n keys.** Add them to `en` first, then the same keys to `es`, `fr` and `pt` with real translations (no English copies). `tsc` enforces completeness. Region labels are title case, not the uppercase used by `domain.*`, because they read as place names.

```
'interests.title': 'Your interests'
'interests.hint': 'Trackers matching a topic or region you pick rank higher. Stored only in this browser.'
'interests.topics': 'Topics'
'interests.regions': 'Regions'
'interests.clear': 'Clear'
'interests.button': 'Interests'
'interests.active': '{n} active'
'region.north-america': 'North America'
'region.central-america': 'Central America'
'region.south-america': 'South America'
'region.europe': 'Europe'
'region.central-europe': 'Central Europe'
'region.middle-east': 'Middle East'
'region.africa': 'Africa'
'region.central-asia': 'Central Asia'
'region.south-asia': 'South Asia'
'region.east-asia': 'East Asia'
'region.southeast-asia': 'Southeast Asia'
'region.oceania': 'Oceania'
'region.global': 'Global'
'tour.interests.title': 'What do you follow?'
'tour.interests.body': 'Pick topics or regions and the most relevant stories will rise to the top. Optional — change it any time from the sidebar or the ? panel.'
```

  First check whether `t()` supports `{n}` interpolation (`grep -n "replace" src/i18n/translations.ts`). If it doesn't, do the replacement at the call site: `t('interests.active', locale).replace('{n}', String(n))`. Domain labels reuse the existing `domain.*` keys, including `domain.history`.

- [ ] **Step 2: Component** `InterestChips.tsx`. Render two groups, "Topics" and "Regions". Each chip is a `<button type="button" aria-pressed={selected} className={'interest-chip' + (selected ? ' active' : '')}>`. The label is `t('domain.x')` or `t('region.x')`, followed by `<span className="interest-chip-count">{count}</span>`. Show the hint paragraph unless `compact`. Show a Clear button when `onClear` is given and `hasInterests(interests)`.

- [ ] **Step 3: CSS** in `global.css`, right after the `.cc-sort-*` rules (~line 4117). Reuse the same tokens:

```css
.interest-chips { padding: 6px 12px; font-family: 'JetBrains Mono', monospace; }
.interest-chips-group { margin-top: 6px; }
.interest-chips-label { font-size: 0.55rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
.interest-chips-row { display: flex; flex-wrap: wrap; gap: 4px; }
.interest-chip { background: none; border: 1px solid var(--border); border-radius: 3px; color: var(--text-muted); padding: 2px 7px; cursor: pointer; font: inherit; font-size: 0.6rem; }
.interest-chip.active { color: var(--accent-blue); border-color: var(--accent-blue); }
.interest-chip-count { opacity: 0.6; margin-left: 4px; }
.interest-chips-hint { font-size: 0.6rem; color: var(--text-muted); margin: 0 0 4px; line-height: 1.4; }
```

- [ ] **Step 4: Sidebar mount.** In `SidebarPanel.tsx`, append a button to the `cc-sort-toggle` row (after the sort options): `className="cc-sort-option"`, `aria-expanded`, label `t('interests.button')` plus the active count when there is one. It toggles a local `showInterests` state. When open, render `<InterestChips compact …>` right below the row. SidebarPanel needs `onToggleInterest` and `onClearInterests` props, passed from CommandCenter (`toggleInterestChip`, `clearInterests`). Compute `options` with `useMemo(() => interestOptions(trackers), [trackers])` in CommandCenter and pass it down as `interestOptions`. The sidebar is also the mobile TRACKERS tab, so this covers mobile.

- [ ] **Step 5: `?` overlay mount.** In `CommandCenter.tsx`'s help overlay (~line 1036), between the replay block and the shortcuts title, add `<div style={styles.helpTitle}>{t('interests.title', locale)}</div>` and `<InterestChips …/>` (not compact).

- [ ] **Step 6: Verify.** Type check clean; `npx vitest run` green. Then check manually. Run `npm run dev`, open `/`, open the sidebar and click INTERESTS. Pick a domain that lives at the bottom of the list (a history tracker, say) and confirm it moves up. The `?` overlay must show the same selection. Reload and confirm it persisted. Clear it and confirm the order matches the original. Take a screenshot if the browser tools are available.

- [ ] **Step 7: Commit.** `feat(ranking): interest chips in sidebar and help overlay`

---

### Task 4: Skippable onboarding step + docs

**Files:**
- Modify: `src/lib/onboarding-steps.ts`, `src/lib/onboarding-steps.test.ts`, `Onboarding/OnboardingTour.tsx`, `Onboarding/HeroStep.tsx`, `CommandCenter/CommandCenter.tsx`, `CLAUDE.md`, `docs/superpowers/specs/2026-09-22-homepage-relevance-ranking-design.md`

**Interfaces:**
- Consumes: `useInterests`, `InterestChips`, `interestOptions`.
- Produces: `StepType = 'hero' | 'spotlight' | 'closing' | 'interests'`; `OnboardingTour` takes an optional `interestOptions` prop.

- [ ] **Step 1: Failing test.** In `onboarding-steps.test.ts`, change the desktop test to 7 steps. The order is `hero-intro, spotlight-globe, spotlight-sidebar, hero-interests, spotlight-ticker, hero-tiers, hero-closing` (it follows the sidebar step, which is what it re-ranks). Add:

```ts
it('the interests step is a non-final, typed step', () => {
  const idx = DESKTOP_STEPS.findIndex(s => s.id === 'hero-interests');
  expect(DESKTOP_STEPS[idx].type).toBe('interests');
  expect(idx).toBeLessThan(DESKTOP_STEPS.length - 1);
});
```

  Run `npx vitest run src/lib/onboarding-steps.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implement the step config.** Extend `StepType`, then insert `{ id: 'hero-interests', type: 'interests', titleKey: 'tour.interests.title', bodyKey: 'tour.interests.body' }` after `spotlight-sidebar`. Check `onboarding.ts` / `useOnboardingController.ts` for anything that hard-codes 6 steps or step indexes (`grep -n "6\|stepIdx" src/lib/onboarding.ts src/components/islands/Onboarding/*.ts*`) and fix what you find. Also check the Playwright e2e tests that walk the tour: `grep -rln "tour" tests e2e 2>/dev/null`. If one counts steps or asserts "1 / 6", update it to 7.

- [ ] **Step 3: HeroStep.** Add `'interests'` to `variant` and an optional `children?: React.ReactNode` rendered between `<p style={styles.body}>` and the footer. The primary button still reads "Next" and is never disabled, which is what makes the step skippable. The Skip link already exists for non-last steps.

- [ ] **Step 4: OnboardingTour.** Accept `{ interestOptions?: ReturnType<typeof interestOptions> }`. Call `useInterests()`. For `step.type === 'interests'`, render `HeroStep` with `variant="interests"` and `<InterestChips compact interests={…} options={props.interestOptions ?? { domains: [], regions: [] }} locale={locale} onToggle={toggle} />` as children. Place this branch before the hero/closing mapping. If the options are empty, auto-advance is **not** needed: the step just shows the body text. In `CommandCenter.tsx`, pass `interestOptions={options}` to `<OnboardingTour>`.

- [ ] **Step 5: Docs.**
  - `CLAUDE.md`, under "Activity index (E7)" consumers: add one bullet describing `src/lib/interests.ts`. Declared domain/region interests are stored in `localStorage` as `watchboard:interests-v1`, synced across mounts by `watchboard:interests-changed`, and add `INTEREST_BONUS` (+10) in `computeRelevanceScore`. Follow still ranks higher (+15). The UI is `InterestChips`, mounted in the sidebar sort row, the `?` overlay and the desktop tour step `hero-interests`.
  - Update the Onboarding island bullet: "6-step" becomes "7-step".
  - In the spec, set `**Estado:** Implementado` and add a note under §1: `TrackerDirectory.tsx` isn't mounted, and the sidebar already ranks, so §1 was dropped (see plan).

- [ ] **Step 6: Verify.** `npx vitest run` green; type check clean. Manual check with `npm run dev`: in the console run `localStorage.removeItem('watchboard-tour-desktop-v1')` and reload. Step 4/7 must show the chips. Pick one, press Next, finish the tour, open the sidebar and confirm the pick shows there and ranking changed. Replay the tour and press Skip on step 4. It must close without errors.

- [ ] **Step 7: Commit.** `feat(onboarding): optional interests step in the desktop tour`
