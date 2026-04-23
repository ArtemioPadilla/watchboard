# Right Panel — Hero + Minimal Feed

**Date:** 2026-04-22
**Status:** Design
**Scope:** Desktop sidebar panel (`SidebarPanel`) on the homepage, viewport ≥ 768px.

## Problem

The sidebar today is a flat list where every tracker row looks identical — same size, same typography, same decorations. On a wide screen, this produces a dense strip of roughly similar rows with no visual anchor and a lot of incidental ornament:

- Each row carries a tracker-colored left border, a freshness dot, a status pill, a follow star, a hover-revealed compare dot, and a dateline
- Groups use loud `★ FOLLOWING` / `● LATEST INTEL` monospace labels
- Two parallel sort/filter surfaces (OPS/GEO/DOMAIN tabs plus a search input plus implicit group-by) compete for attention at the top

The user's feedback: "looks like shit" and "lots of empty space + no tabs to search by geo etc." — the panel's real job (**efficient directory**) is obscured by ornament, while its secondary job (**editorial / activity signal**) has no dedicated surface.

## Goal

Give the panel a clear two-part structure:

1. **Hero card** (top, ~180 px) — the single most-significant tracker right now, rendered editorially (thumbnail + full headline + small meta). Static while the user browses; does not cycle with broadcast.
2. **Minimal feed** (rest) — every other tracker as a two-line row (name + truncated headline + time). No chips, no dots, no colored borders. Information density comes from the *content*, not from decoration.

Tabs (OPS / GEO / DOMAIN) stay inline and always visible but become text-only with a thin underline indicator. Group labels are replaced by faint 1 px dividers and opacity changes.

Not in scope: mobile layout (<768 px), globe, broadcast lower-third, story strip, command-center state machine.

## Architecture

The panel has five vertical regions:

```
┌──────────────────────────────────┐
│ HEADER                           │  brand + collapse/settings
│ SEARCH (underline input)         │
│ TABS (inline, text-only)         │
│ HERO CARD (hidden if empty)      │
│ FEED (scrolling rows)            │
└──────────────────────────────────┘
```

State that drives rendering:

- `trackers: TrackerCardData[]` — full directory (existing prop)
- `broadcast.featuredTracker` — drives per-row LIVE pulse (existing, from `useBroadcastMode`)
- `activeTracker` — user-selected tracker (existing)
- `searchQuery: string` — filters feed; when non-empty, hero + tabs hide
- `viewMode: 'operations' | 'geographic' | 'domain'` — tab state (existing)
- `activeDomain` (domain view) — existing
- `heroTracker`: derived — see selection rule below

All other existing state remains unchanged.

## Components

### `HeroCard` (new)

Single-tracker showcase component. Props:

```ts
interface HeroCardProps {
  tracker: TrackerCardData;
  isBroadcastFeatured: boolean;
  basePath: string;
  locale: Locale;
  onSelect: (slug: string) => void;
}
```

Layout: thumbnail on the left (96 × 96 px, rounded, covers `latestEventMedia.url` if present, domain gradient otherwise), text block on the right.

Text block:
- Top: `Day {dayCount} · {domain.toUpperCase()}` — small monospace, muted
- Middle: `tracker.shortName` in uppercase bold monospace + a `● LIVE` pulse badge when `isBroadcastFeatured` is true
- Below thumb row: headline (Inter, 0.82 rem, 3-line clamp)
- Footer: `T{tier} · {source}` on the left, `relativeTime(lastUpdated)` on the right

Click anywhere → `onSelect(slug)`. Hover → subtle border highlight.

### `FeedRow` (new, collapsed state only)

Replaces the existing `TrackerRow` collapsed branch. Props:

```ts
interface FeedRowProps {
  tracker: TrackerCardData;
  isActive: boolean;
  isHovered: boolean;
  isFollowed: boolean;
  isCompared: boolean;
  isLive: boolean;            // featured by broadcast
  isDimmed: boolean;          // older than 48h
  onSelect: (slug: string | null) => void;
  onHover: (slug: string | null) => void;
  onToggleFollow: (slug: string) => void;
  onToggleCompare: (slug: string) => void;
  locale: Locale;
}
```

Two-line layout:
- Top line: `{icon} {SHORTNAME}` on the left, `{relativeTime}` on the right
- Bottom line: truncated headline (single line, ellipsis), Inter small

When `isLive`: a 3 px green accent bar on the left edge, a small pulsing dot next to the name. No other decoration.

When `isDimmed`: icon + name at 70 % opacity; headline at 60 %.

When `isActive`: row does NOT render — `TrackerRowExpanded` takes over (see below).

On hover: background tint (`#0e1015`); a follow star (★) and compare icon (◇) fade in at the far right; both are 0.6 rem muted mono, accent color when active.

### `TrackerRowExpanded` (reused)

Keep the existing expanded-row markup from `SidebarPanel.TrackerRow` (the `if (isActive)` branch). No visual changes to the expanded state — it already has a KPI strip, follow/compare buttons, and an "Open Dashboard" link.

### `SidebarPanel` (modified)

The main component gains:

1. A `heroTracker` selection memo (see rule below)
2. A search-active branch that hides hero + tabs and renders only filtered `FeedRow`s
3. In OPS view: a two-divider layout (followed / recent / older) with no text labels
4. In GEO view: the existing `GeoAccordion` renders **below** the hero card
5. In DOMAIN view: existing `DOMAIN_COLORS` grouping, hero above

Remove: the existing `groupTrackers` → `groupHeader(type)` rendering, the per-row colored left border, the freshness dot, and the collapsed status pill.

Keep: search input (styled as underline), the existing `ViewModeToggle` (restyled as inline underline tabs), keyboard nav (↑/↓/Enter/`/`), `handleToggleFollow`, `handleToggleCompare`, `featuredSlug` auto-scroll effect from PR #106.

## Data flow

### Hero selection rule

Compute `heroTracker` via `useMemo` whenever `trackers`, `followedSlugs`, or `broadcast.featuredTracker` changes:

```ts
function selectHeroTracker(trackers, followedSlugs): TrackerCardData | null {
  const eligible = trackers.filter(t =>
    t.status === 'active' &&
    t.headline &&
    (t.latestEventMedia || t.eventImages?.length)
  );
  if (eligible.length === 0) return null;
  const sorted = sortByRelevance(eligible, followedSlugs);
  return sorted[0];
}
```

The hero is **static across a session** — it only changes when `trackers` mutates (rare) or `followedSlugs` changes (user follows/unfollows). Broadcast cycling does NOT change the hero — motion lives in the lower-third overlay and the LIVE-row pulse only.

### Feed ordering

OPS view:

```
[HERO]
─── (followed trackers, in sortByRelevance order) ───
(faint 1px divider)
─── (unfollowed trackers, recent ≤48h) ───
(faint 1px divider)
─── (unfollowed trackers, older >48h, dimmed) ───
```

If no trackers are followed: no first divider; feed starts with recent/older split only.

GEO and DOMAIN views: hero renders above; below, existing grouped markup (`GeoAccordion` / `groupTrackers`) with the new `FeedRow` used for leaf rows. The dim-older rule applies within each group.

### Search

When `searchQuery.trim().length > 0`:
- Hide hero card
- Hide tabs
- Replace feed with flat filtered list (`filterTrackers` existing util) using `FeedRow`
- Show a "Clear" button inside the search input if non-empty

## Error handling

- No eligible hero tracker (e.g. no headlines yet, freshly-seeded repo) → hero card silently omitted; feed still renders
- `latestEventMedia.url` fails to load → `onError` sets `display: none` on the `<img>`, gradient backdrop remains (matches existing behavior in `DesktopStoryStrip`)
- Search with zero results → feed shows a single muted row: "No trackers match `{query}`" + "Clear search" link (matches existing empty-state in `SidebarPanel`)
- `trackers` array empty → entire panel renders a skeleton (existing behavior)

## Testing

Automated (pure-function Vitest tests against `selectHeroTracker` in `src/lib/hero-selection.test.ts` — the project has no React Testing Library / jsdom setup today, so avoid component-level tests):

1. `selectHeroTracker` returns the highest-relevance eligible tracker
2. `selectHeroTracker` excludes trackers without a headline
3. `selectHeroTracker` excludes trackers without any `latestEventMedia` and empty `eventImages`
4. `selectHeroTracker` returns `null` when no tracker is eligible
5. With two equal-relevance trackers, followed wins
6. Changing `broadcast.featuredTracker` alone does NOT change `selectHeroTracker` output (stability)

Manual (Playwright, extending the existing `/tmp/verify_final.py` pattern):

1. Desktop 1440×900: hero card visible at top with correct tracker + LIVE badge when applicable
2. Expand sidebar for first time → hero + feed render in <1s
3. Click a feed row → expanded view takes over, hero still visible above
4. Type in search → hero + tabs hide, only filtered rows render
5. Clear search → hero + tabs return
6. Switch to GEO view → hero remains, accordion below, dim-older rule still applies
7. Broadcast cycle advances → LIVE row pulse moves, hero does NOT change
8. Viewport 800×800: panel at 320 px, hero thumb 64 px, feed tighter
9. Viewport 600×800: mobile carousel path unaffected

## Edge cases

- **Cycling hero could still make sense on a future "compact mode"**. Not this spec — design allows swapping `heroTracker` source later without component changes.
- **Active tracker === hero tracker**: hero shows the tracker, feed row for it is replaced by the expanded row. No duplication.
- **Active tracker exists but different from hero**: hero stays put, feed scrolls so the expanded row is visible (existing `TrackerRow` auto-scroll still applies).
- **Search hides tabs → active tab state preserved**. Clearing search restores the previous `viewMode`.
- **Follow a tracker that is currently the hero**: no immediate visual change (it was already top); followed-section divider simply appears below it when there's more than one followed tracker.
- **Locale switch**: all text is via existing `t()` function; headlines fall back to `tracker.headline` when the locale-specific one isn't available (existing behavior).

## File touch list

Modified:
- `src/components/islands/CommandCenter/SidebarPanel.tsx` — remove current group headers + row decoration, introduce `<HeroCard>` + `<FeedRow>` components, wire hero selection memo, rework view-mode rendering branches. This file is large (~1660 lines); as part of the work, pull `HeroCard` into its own file.
- `src/styles/global.css` — new classes for hero card, minimal feed row, inline underline tabs (`.cc-feed-tabs`, `.cc-feed-row`, `.cc-hero-card`). Update the PR #106 `.cc-tracker-live` pulse rule to also target `.cc-feed-row.cc-tracker-live` (the new row class). Remove the obsolete `.cc-tracker-row` base rule once no row uses it.

Created:
- `src/components/islands/CommandCenter/HeroCard.tsx` — new
- `src/components/islands/CommandCenter/FeedRow.tsx` — new
- `src/lib/hero-selection.ts` — `selectHeroTracker` pure function (for easy unit testing)
- `src/lib/hero-selection.test.ts` — Vitest tests against the pure function

Deleted:
- None — the expanded-row markup, `GeoAccordion`, `SeriesStrip`, and `ViewModeToggle` all stay, just restyled via CSS.

## Risks

- **Hero selection churn**: if the relevance algorithm produces unstable ordering under minor data changes, the hero will flicker between two trackers every time `lastUpdated` ticks. Mitigation: the selection is memoized on `trackers` identity; since `trackers` is built at build-time in Astro and only mutates on a page reload, flicker is impossible within a session.
- **Row redesign regresses `TrackerRow` memoization**: the current `TrackerRow` is `memo`'d and critical for broadcast-tick re-render cost. The new `FeedRow` must also be `memo`'d with the same prop shape to preserve the `broadcastRef` stabilization from #106. Verified in the component spec above (all primitive props, no closure captures).
- **Typography scale**: the new hero uses Inter 0.82 rem for the headline, which is larger than any current SidebarPanel text. On a 440 px panel this is right; on the 320 px mid-width panel, the clamp-to-3-lines may run short. Accept; easy to tune later.
- **GeoAccordion + hero stacking**: GEO view has always started scrolling from the top; adding a hero above it means the accordion's first expanded group has to scroll below the hero. Acceptable — user scrolls naturally; GeoAccordion's own auto-scroll behavior still works.

## Implementation order

1. Add `src/lib/hero-selection.ts` + test, confirm pure function behavior
2. Create `HeroCard.tsx` (styled, story-shot visual approval before wiring)
3. Create `FeedRow.tsx` matching the spec
4. Add CSS classes to `global.css`
5. Rewrite `SidebarPanel.tsx` rendering — OPS view first, verify manually
6. Port GEO and DOMAIN views, verify grouping still works
7. Wire search hide-hero-and-tabs branch
8. Manual verification via Playwright matrix (Sections 8.1–8.9)
9. Lighthouse before/after on `/` — expect no regression (1 heavier hero img + many fewer DOM nodes in the feed)
