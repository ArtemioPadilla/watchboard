# Desktop Home — Unified Broadcast Sync

**Date:** 2026-04-16
**Status:** Design
**Scope:** Homepage `CommandCenter` on desktop (≥ 768px viewport). Mobile layout unchanged.

## Problem

On desktop, the homepage has three surfaces that each display "the current story":

1. **BroadcastOverlay lower-third** — floats bottom-left over the globe (broadcast mode)
2. **DesktopStoryStrip** — icon column + small story card inside the 52px collapsed right rail (broadcast mode)
3. **SidebarPanel** — full tracker directory (OPS/GEO/DOMAIN tabs) shown when the rail is expanded or a tracker is clicked

The three surfaces are driven by two independent state machines:

- `useBroadcastMode` drives the globe camera, lower-third, and built-in ticker
- `useStoryState` (inside `DesktopStoryStrip`) drives the circle column and its own card on an independent 12s timer

Observed symptoms:

- The strip's active circle and card don't match the lower-third's featured tracker
- Clicking a tracker collapses the broadcast experience and swaps in the directory layout, so the two screenshots (broadcast view vs. directory view) feel like different apps
- The standalone breaking-news ticker at the bottom runs its own CSS marquee, unrelated to the broadcast cycle, so when broadcast is on there are two tickers with different motion

## Goal

One broadcast cycle drives every surface. When the cycle advances to tracker X:

- Globe flies to X
- Lower-third shows X
- Story strip circle for X is active, strip card shows X, strip progress bar ticks with broadcast progress
- Sidebar (when expanded) auto-scrolls to X's row and marks it with a "LIVE" pulse tied to broadcast progress
- The BroadcastOverlay's own ticker centers X (already works)

Any click on any surface calls into the same broadcast state (`jumpTo` / `userPause`). Nothing tears the experience down.

Not in scope: layout redesign, removing components, new features, mobile changes.

## Architecture

### Single source of truth

`useBroadcastMode` is the orchestrator. Verified exposed state (read from hook):

- `featuredTracker: TrackerForBroadcast | null`
- `currentIndex: number` — position in `trackerQueue`
- `progress: number` — 0..1 within the current dwell (advances only while `phase === 'dwelling'`)
- `phase: 'idle' | 'transitioning' | 'dwelling' | 'paused'`
- `trackerQueue: TrackerForBroadcast[]` (stable ref, contents refreshed when inputs change)
- `isUserPaused: boolean`
- `pauseCountdown: number`

The hook does **not** track a sub-slide index within a tracker. The lower-third uses a single progress bar tied to `progress`; the strip will do the same. No hook changes needed.

Callers:

- `jumpTo(slug)` — jump cycle to a specific tracker
- `userPause()` / `userResume()` — pause broadcast without disabling it
- `goToNext()` / `goToPrev()` — manual step
- `resetPauseTimer()` — keep pause alive on interaction

### Component wiring

```
useBroadcastMode (orchestrator)
   │
   ├─► GlobePanel (flyTo camera) ....................... already wired
   ├─► BroadcastOverlay (lower-third + own ticker) ..... already wired
   ├─► DesktopStoryStrip ............................... REWIRE: drop useStoryState; props-driven
   ├─► SidebarPanel .................................... REWIRE: add featuredSlug prop, auto-scroll + LIVE pulse
   └─► Bottom ticker (CommandCenter inline) ............ already gated off when broadcast on — no change
```

User actions that feed back in:

- Globe marker click → `handleSelect(slug)` → `broadcast.jumpTo(slug)` + `userPause()`
- Story strip circle click → `broadcast.jumpTo(slug)` + (resume if paused)
- Sidebar row click → `broadcast.jumpTo(slug)` + `userPause()` (today: disables broadcast entirely; new: keeps it running in paused state so resume puts user back in the stream)
- Sidebar row hover → `handleHover(slug)` (unchanged — sets `hoveredTracker`, drives hover highlight on globe; does not move cycle)
- Bottom ticker item click (when broadcast off) → same as today: navigate to tracker page

## Components

### DesktopStoryStrip — props-driven rewrite

Drop the internal `useStoryState` hook entirely. New props:

```ts
interface Props {
  basePath: string;
  // Broadcast-driven state
  trackerQueue: TrackerForBroadcast[];   // from broadcast.trackerQueue
  featuredTracker: TrackerForBroadcast | null;
  currentIndex: number;
  progress: number;            // 0..1
  isPaused: boolean;
  pauseCountdown: number;
  // Callbacks
  onCircleClick: (slug: string) => void;
  onCardClick: () => void;      // toggle pause
}
```

Internals simplified:

- Circles are `trackerQueue.slice(0, MAX_CIRCLES)` with the one at `currentIndex` marked active; "seen" is derived from indexes `< currentIndex` (simple local `useRef<Set<string>>` populated on `currentIndex` change)
- ONE progress bar tied to `progress` (removes the per-slide progress segments and the internal RAF)
- Card = render of `featuredTracker` passed in

**Ownership:** the eligible/queue list lives in `useBroadcastMode` and is exposed as `trackerQueue`; `DesktopStoryStrip` reads it from props, never recomputes. This ensures strip circles and globe focus always agree.

### SidebarPanel — LIVE row indicator + auto-scroll

Add one new prop:

```ts
featuredSlug?: string | null;  // current broadcast featured tracker
broadcastProgress?: number;     // 0..1, optional visual tie-in
```

Behavior when `featuredSlug` is set and broadcast is running:

- Find the row for `featuredSlug` and `scrollIntoView({ block: 'nearest', behavior: 'smooth' })` when `featuredSlug` changes
- Add a "● LIVE" badge on that row with a pulse animation
- Pulse CSS animation duration is independent of `broadcastProgress` (keeping it a simple CSS pulse keeps render cost zero). `broadcastProgress` is accepted but not required; we may skip wiring it for v1.

When `featuredSlug` is null (broadcast off) or equals `activeTracker`, skip the LIVE badge — user-selected active styling takes precedence.

Row auto-scroll must not fight the existing `TrackerRow` auto-scroll on `isActive || isHovered`. Decision: add one effect in the parent list that reacts to `featuredSlug` changes and scrolls; individual-row auto-scroll stays unchanged. The two effects can both run on the same slug without conflict (both call `scrollIntoView` with `nearest`).

### CommandCenter — glue changes

1. **`handleSelect` rewrite:**
   - Today: sets `activeTracker`, clears geo path, force-expands sidebar (side effect: `broadcastEnabled = !activeTracker && !broadcastOff` → broadcast turns off entirely).
   - New: calls `broadcast.jumpTo(slug)` + `broadcast.userPause()`; does NOT set `activeTracker` (or sets it but does not derive `broadcastEnabled` from it). Sidebar does not force-expand.
   - We still need the user-selected-tracker concept for the `O` hotkey (open dashboard) and `C` (compare). Keep `activeTracker` but change `broadcastEnabled = !broadcastOff` (independent of `activeTracker`). The previous "Esc clears active" still works.

2. **Remove bottom ticker when broadcast is on:**
   - Today: `{breakingTrackers.length > 0 && !broadcastEnabled && <Ticker />}` already gates on broadcast off. ✓ Already correct. No change.

3. **Pass broadcast state to `SidebarPanel` and `DesktopStoryStrip`:**
   - `featuredSlug={broadcast.featuredTracker?.slug ?? null}`
   - Full broadcast object for the strip

4. **`handleStoryTrackerChange` removal:** This callback exists only to let `DesktopStoryStrip`'s internal timer fly the globe. With the strip no longer owning a timer, this is dead code — delete.

## Data flow

```
useBroadcastMode.currentIndex ticks
       │
       ├──► featuredTracker updates
       │         │
       │         ├──► GlobePanel.flyTo  (already)
       │         ├──► BroadcastOverlay (already)
       │         ├──► DesktopStoryStrip.card / circles (NEW)
       │         └──► SidebarPanel auto-scroll + LIVE pulse (NEW)
       │
       └──► progress ticks (0..1)
                 │
                 ├──► BroadcastOverlay progress bar (already)
                 └──► DesktopStoryStrip single progress bar (NEW — was own RAF + multi-segment)
```

## Edge cases

- **User paused (`isUserPaused`):** `phase` becomes `paused`; `progress` stops updating (strip progress bar freezes); lower-third expands (existing behavior); sidebar LIVE pulse freezes (CSS `animation-play-state: paused` when we add a `.paused` class). No cycle advancement.
- **Broadcast disabled (`broadcastOff` true):** `featuredTracker` null; strip reverts to "not rendered" path (CommandCenter already renders icon column instead of strip). Sidebar LIVE badge hidden. Bottom ticker visible.
- **Active tracker set (user clicked):** broadcast paused on that tracker, lower-third shows it, sidebar row highlighted as active (not LIVE), strip circles show that index. Esc resumes broadcast.
- **No eligible trackers for broadcast:** existing guard in `useBroadcastMode` returns null `featuredTracker`; no surfaces show broadcast state. Safe.
- **Locale change mid-broadcast:** locale affects headline/text only; no sync concern.

## Testing

Manual verification (webapp-testing skill or Playwright):

1. Load `/` on desktop. Wait for broadcast to start. Confirm globe, lower-third, and strip circle all point to same tracker.
2. Let cycle advance. Confirm all three update together; strip progress bar visually ticks in sync with lower-third progress bar.
3. Expand sidebar. Confirm the LIVE-pulsing row matches the current featured tracker. Let cycle advance. Confirm the pulsed row moves + auto-scrolls.
4. Click a tracker row in the expanded sidebar. Confirm: globe flies, lower-third updates to that tracker, strip circle updates, broadcast enters paused state with countdown badge, sidebar row shows LIVE pulse (broadcast still "on"). Press Esc; broadcast resumes from that tracker's position.
5. Click a strip circle. Confirm same behavior as #4.
6. Press `B` to toggle broadcast off. Confirm bottom ticker appears, strip disappears (icons column takes over), sidebar LIVE badge disappears, lower-third disappears.
7. Re-press `B`. Confirm broadcast resumes; everything syncs within one cycle step.
8. Mobile viewport (<768px): no regressions — story carousel behavior unchanged.

## File touch list

- `src/components/islands/CommandCenter/DesktopStoryStrip.tsx` — drop `useStoryState`, accept broadcast props, render from them
- `src/components/islands/CommandCenter/useStoryState.ts` — leave in place (MobileStoryCarousel still uses it), verify no shared-state leakage
- `src/components/islands/CommandCenter/SidebarPanel.tsx` — accept `featuredSlug`, add auto-scroll effect, add LIVE badge markup + CSS class
- `src/components/islands/CommandCenter/CommandCenter.tsx` — rewrite `handleSelect`, thread broadcast state into strip/sidebar, delete `handleStoryTrackerChange`
- `src/components/islands/CommandCenter/useBroadcastMode.ts` — verify `slideIndex` and `trackerQueue` are exposed as expected; add if missing
- `src/styles/desktop-stories.css` — minor (only if progress bar now driven by `progress` prop via inline style — may need `transition` tweak)
- One new CSS rule for `.cc-tracker-live-pulse` (can go in an existing global or command-center-mobile.css despite the name; prefer `src/styles/global.css` or a new small file — decision deferred to implementation)

## Risks

- **Eligibility mismatch:** `useStoryState` today computes its own eligibility (followedSlugs, has image, etc.). `useBroadcastMode`'s queue is `trackers.filter(t => t.mapCenter && t.headline)` sorted by relevance. These lists differ. After this change, the strip uses `broadcast.trackerQueue` as-is — this IS the behavior change, and it's what unifies the experience. Accept the tradeoff: the strip will only show trackers eligible for the broadcast cycle (need a map center + headline).
- **Re-render cost:** `DesktopStoryStrip` re-renders whenever broadcast `progress` updates (~60Hz). The strip is small (<30 DOM nodes) so acceptable. If profiling shows hot-spot, memoize static sub-trees.

## Implementation order

1. Rewrite `DesktopStoryStrip` to props-driven: accept `trackerQueue`, `featuredTracker`, `currentIndex`, `progress`, `isPaused`, `pauseCountdown`, `onCircleClick`, `onCardClick`. Remove import of `useStoryState`.
2. In `CommandCenter`: change `broadcastEnabled = !broadcastOff` (decouple from `activeTracker`). Thread broadcast state into the strip. Delete `handleStoryTrackerChange`.
3. Rewrite `handleSelect`: instead of setting `activeTracker` + force-expanding sidebar, call `broadcast.jumpTo(slug)` + `broadcast.userPause()`. Keep setting `activeTracker` for hotkey targets (O, C) and keep Esc's "clear active" behavior.
4. Add `featuredSlug` prop to `SidebarPanel`. In the list-rendering section, add an effect that scrolls the row matching `featuredSlug` into view on change, and add a `.cc-tracker-live` class + pulse animation CSS.
5. Manual verification via Playwright (steps 1–8 in Testing). Run Lighthouse before/after on `/` — expect no regression (one fewer RAF timer running, fewer independent animations).
