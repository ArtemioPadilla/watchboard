# Homepage UX Improvements — Design Spec

**Date:** 2026-04-02
**Scope:** Welcome onboarding, event relevance ordering, pause/spotlight interactions, ticker sync, drag scrubbing, image carousel

---

## 1. Welcome Experience (Hybrid: Overlay + Coach Marks)

### First Visit Overlay

A lightweight modal overlay appears on the user's first visit. Stored in `localStorage` key `watchboard-welcome-dismissed`.

**Content:**
- Watchboard logo/icon
- "Welcome to Watchboard" heading
- One-liner: "Real-time intelligence dashboards tracking world events"
- 3 key shortcut hints: `B` pause broadcast, `/` search, `?` all shortcuts
- "Don't show again" checkbox + "Got it" button

**Behavior:**
- Appears after globe loads (waits for `client:idle` hydration)
- Dismissing sets `watchboard-welcome-dismissed: true` in `localStorage`
- If checkbox unchecked, overlay reappears next session
- If checkbox checked, overlay never shows again
- `?` help overlay remains accessible at any time for returning users

### Return Visit Coach Marks

After the welcome overlay is dismissed (either temporarily or permanently), contextual hints appear on features the user hasn't used yet. Tracked via `localStorage` key `watchboard-features-discovered`.

**Features tracked:**
- `search` — discovered when user focuses the search input
- `broadcast-pause` — discovered when user pauses broadcast (click/hover/`B` key)
- `follow` — discovered when user follows a tracker
- `ticker-click` — discovered when user clicks a ticker item
- `drag-scrub` — discovered when user drags the ticker or card

**Coach mark design:**
- Small tooltip-style hint anchored near the relevant UI element
- Blue border (`rgba(31,111,235,0.25)`), subtle blue background (`rgba(31,111,235,0.08)`)
- Icon + short text (e.g., "💡 Hover the ticker to pause and explore")
- Dismisses on: (a) user performs the action, (b) user clicks the hint's × button
- Max 1 coach mark visible at a time to avoid clutter
- Hints cycle through undiscovered features, showing a new one each session
- Once all features discovered, no more hints appear

**Files to modify:**
- `src/components/islands/CommandCenter/CommandCenter.tsx` — add welcome overlay + coach mark rendering
- New: `src/components/islands/CommandCenter/WelcomeOverlay.tsx` — overlay component
- New: `src/components/islands/CommandCenter/CoachMark.tsx` — reusable coach mark component
- New: `src/lib/onboarding.ts` — `localStorage` helpers for welcome state + feature discovery tracking

---

## 2. Event Relevance Ordering

Replace the current `lastUpdated`-only sort with a layered priority system.

### Priority Layers (highest to lowest)

1. **Breaking / high-severity** — trackers with recent high-activity spikes surface first. Since the schema has no explicit `breaking` flag, derive heuristically: a tracker is "breaking" if it has 3+ events added in the last 24 hours with at least one T1 source
2. **Followed trackers** — trackers the user follows (already stored in `localStorage` via `watchboard-follows`) get a boost within their tier
3. **Editorial score** — computed from:
   - Event count in last 7 days (more activity = higher score)
   - Average source tier of recent events (lower tier number = more authoritative = higher score)
   - Volume of changes in last update (sections updated count from digest)
4. **Recency** — `lastUpdated` timestamp as final tiebreaker

### Implementation

**Scoring function** in `src/lib/relevance.ts` (new file):

```typescript
interface RelevanceInput {
  lastUpdated: string;
  headline?: string;
  isBreaking?: boolean;
  isFollowed: boolean;
  recentEventCount: number;     // events in last 7 days
  avgSourceTier: number;        // 1-4, lower = better
  sectionsUpdatedCount: number; // from latest digest
}

function computeRelevanceScore(input: RelevanceInput): number
```

Score breakdown (0-100 scale):
- Breaking: +40 points
- Followed: +15 points
- Editorial score: 0-30 points (weighted combination of event count, source tier, sections updated)
- Recency: 0-15 points (exponential decay over 7 days)

**Data pipeline changes:**
- `src/pages/index.astro` — collect `recentEventCount`, `avgSourceTier`, `sectionsUpdatedCount` per tracker during serialization (data already available from `loadTrackerData`)
- Add `isBreaking` field to `TrackerCardData` — derived heuristically: 3+ events in last 24 hours with at least one T1 source
- Pass scoring inputs to `CommandCenter`

**Consumer changes:**
- `useBroadcastMode.ts:69-74` — replace `sort by lastUpdated` with `sort by relevanceScore`
- `MobileStoryCarousel.tsx:64-67` — same replacement
- `SidebarPanel` — optionally sort sidebar by relevance too (with toggle for alphabetical)

**Files to modify:**
- New: `src/lib/relevance.ts` — scoring function
- `src/pages/index.astro` — enrich serialized tracker data with scoring inputs
- `src/lib/tracker-directory-utils.ts` — add `isBreaking`, `recentEventCount`, `avgSourceTier`, `sectionsUpdatedCount` to `TrackerCardData` type
- `src/components/islands/CommandCenter/useBroadcastMode.ts` — use relevance sort
- `src/components/islands/CommandCenter/MobileStoryCarousel.tsx` — use relevance sort

---

## 3. Pause + Spotlight Behavior

### Trigger Conditions

Pause activates when:
- User **hovers** the lower-third card (desktop: `mouseenter`)
- User **hovers** the ticker bar (desktop: `mouseenter`)
- User **clicks** a ticker item
- User **clicks** the lower-third card
- User **taps** the card or ticker (mobile: `touchstart`)

Pause deactivates when:
- Auto-resume timer expires (15 seconds for user-initiated pause)
- User **moves mouse away** from both card and ticker (`mouseleave`, with 500ms grace period to allow moving between card and ticker without resuming)
- User presses `B` to manually toggle broadcast back on

### Visual Treatment

**On pause:**
- Globe: `setAutoRotate(false)`, camera holds position
- Background dims: semi-transparent dark overlay on the globe area (`rgba(0,0,0,0.35)`)
- LIVE badge → PAUSED badge (dot turns gray, text changes)
- "Resuming in Xs" countdown appears top-right
- Ticker: `animation-play-state: paused`, active item gets highlighted border
- Lower-third card: expands (see Section 4)
- Progress bar freezes

**On resume:**
- Dim overlay fades out (0.3s transition)
- Card collapses back to compact form (0.3s transition)
- PAUSED → LIVE
- Broadcast advances to next tracker
- Ticker resumes scrolling

### Auto-Resume Timer

- Duration: 15 seconds
- Resets on any user interaction (drag, click another item, hover re-enter)
- Countdown visible in top-right badge: "▶ Resuming in Xs"
- Visual: text updates every second

**Files to modify:**
- `src/components/islands/CommandCenter/useBroadcastMode.ts` — add `userPause()` (distinct from existing `pause()`) with auto-resume timer, `resetPauseTimer()`, expose `pauseCountdown` state
- `src/components/islands/CommandCenter/BroadcastOverlay.tsx` — add hover/click handlers on lower-third and ticker, render dim overlay, PAUSED badge, countdown, pass expanded state
- `src/styles/broadcast.css` — dim overlay styles, paused state transitions, countdown badge

---

## 4. Expanded Card (Paused State)

When broadcast is user-paused, the lower-third card expands from compact to full preview.

### Compact State (existing, unchanged)
- Domain label, tracker name + icon, headline, 1 KPI, progress bar
- Max-width: 480px

### Expanded State (new)
- Max-width: 520px
- Two-column layout: text content (left) + image carousel (right, 140px wide)
- **Left column:**
  - Domain + day count label (e.g., "CONFLICT · DAY 412")
  - Tracker name + icon
  - Headline (full, not truncated)
  - Digest summary (2-3 lines)
  - 3 KPIs in a row with dividers
  - "Open Dashboard →" link button
- **Right column:**
  - Image carousel (see Section 6)
- Transition: 0.3s ease-out expand animation

### Double-Click Navigation
- Double-clicking the expanded card navigates to `{basePath}{slug}/`
- "Open Dashboard →" link does the same on single click

**Files to modify:**
- `src/components/islands/CommandCenter/BroadcastOverlay.tsx` — add expanded card layout, toggle between compact/expanded based on pause state
- `src/styles/broadcast.css` — expanded card styles, transition animations

---

## 5. Ticker ↔ Card Sync + Drag Scrubbing

### Sync Model

The ticker and card share a single source of truth: `currentIndex` from `useBroadcastMode`. When either element changes the index, both update:

- Ticker active highlight follows `currentIndex`
- Card content follows `currentIndex`
- Globe camera follows `currentIndex`

### Ticker Scroll Position Sync

Currently the ticker scrolls via CSS animation independently. Change to:
- When `currentIndex` changes (auto or manual), scroll the ticker so the active item is visible/centered
- Use `scrollIntoView({ behavior: 'smooth', inline: 'center' })` on the active ticker item
- This requires changing from CSS `translateX(-50%)` animation to JS-controlled scroll position for better sync control

### Drag Scrubbing

**Ticker drag:**
- `mousedown` / `touchstart` on ticker → enter drag mode, pause broadcast
- `mousemove` / `touchmove` → track horizontal delta
- When drag distance exceeds one ticker item width → advance/retreat `currentIndex`
- `mouseup` / `touchend` → exit drag mode, start 15s auto-resume timer
- Visual: cursor changes to `grab`/`grabbing`

**Card drag:**
- Same gesture on the lower-third card body
- Swipe/drag left = next tracker, right = previous tracker
- Threshold: 50px horizontal movement

**Implementation approach:**
- New hook: `useDragScrub(onPrev, onNext)` — returns `{ onMouseDown, onTouchStart, isDragging }` handlers
- Attach to both ticker track and card body
- On scrub, call existing `jumpTo` with the new index

**Files to modify:**
- New: `src/components/islands/CommandCenter/useDragScrub.ts` — drag gesture hook
- `src/components/islands/CommandCenter/BroadcastOverlay.tsx` — attach drag handlers, refactor ticker from CSS animation to JS-controlled scroll
- `src/components/islands/CommandCenter/useBroadcastMode.ts` — expose `goToPrev()` and `goToNext()` methods
- `src/styles/broadcast.css` — cursor styles for drag, remove infinite CSS animation

---

## 6. Image Carousel

### Data Collection

Currently `index.astro:41-53` collects only the first event image. Change to collect up to 5:

```typescript
// Collect up to 5 recent event images from T1-T2 sources
const eventImages: Array<{ url: string; source: string; tier: number }> = [];
for (const evt of allEvents) {
  if (eventImages.length >= 5) break;
  if (!evt.media?.length) continue;
  const bestSource = evt.sources.filter(s => s.tier <= 2).sort((a, b) => a.tier - b.tier)[0];
  if (!bestSource) continue;
  const image = evt.media.find(m => m.type === 'image');
  if (image) {
    eventImages.push({ url: image.url, source: image.source || bestSource.name, tier: bestSource.tier });
  }
}
```

### Carousel Component

In the expanded card's right column:
- Shows images in a vertical-format container (140px wide, 3:4 aspect ratio)
- Dot indicators at the bottom (one per image)
- Click arrows or swipe to cycle through images
- Auto-advances every 4 seconds while card is paused
- First image shown by default
- If only 1 image: no arrows/dots, static display
- If 0 images: fallback to domain gradient + emoji (existing behavior)

### Image Attribution
- Small attribution label below carousel: "Source · T{tier}"
- Updates as carousel advances

**Files to modify:**
- `src/pages/index.astro` — collect up to 5 images per tracker instead of 1
- `src/lib/tracker-directory-utils.ts` — change `latestEventMedia` from single object to array `eventImages`
- New: `src/components/islands/CommandCenter/ImageCarousel.tsx` — small carousel component
- `src/components/islands/CommandCenter/BroadcastOverlay.tsx` — render `ImageCarousel` in expanded state

---

## 7. Mobile Considerations

### MobileStoryCarousel Updates
- Apply same relevance ordering (Section 2)
- Add tap-to-pause: tapping the story card pauses auto-advance, shows expanded content
- Tap again or wait 15s to resume
- Image carousel works via horizontal swipe within the image area
- Coach marks adapted for touch: tooltip positioned below the element, tap to dismiss

### Responsive Breakpoints
- Expanded card adapts at < 480px: stack layout (image above text instead of side-by-side)
- Drag scrubbing on ticker: uses `touchmove` events
- Coach marks: larger touch targets (min 44px)

---

## Files Summary

### New Files
| File | Purpose |
|------|---------|
| `src/lib/relevance.ts` | Relevance scoring function |
| `src/lib/onboarding.ts` | localStorage helpers for welcome + feature discovery |
| `src/components/islands/CommandCenter/WelcomeOverlay.tsx` | First-visit welcome modal |
| `src/components/islands/CommandCenter/CoachMark.tsx` | Contextual hint tooltip component |
| `src/components/islands/CommandCenter/ImageCarousel.tsx` | Small image carousel for expanded card |
| `src/components/islands/CommandCenter/useDragScrub.ts` | Drag gesture hook for ticker/card scrubbing |

### Modified Files
| File | Changes |
|------|---------|
| `src/pages/index.astro` | Collect 5 images per tracker, add scoring inputs |
| `src/lib/tracker-directory-utils.ts` | Extend `TrackerCardData` type with new fields |
| `src/components/islands/CommandCenter/CommandCenter.tsx` | Render WelcomeOverlay, CoachMark, wire up pause handlers |
| `src/components/islands/CommandCenter/useBroadcastMode.ts` | Add `userPause()`, auto-resume timer, `goToPrev/Next`, relevance sort |
| `src/components/islands/CommandCenter/BroadcastOverlay.tsx` | Expanded card, hover/click pause, drag scrub, dim overlay, ticker sync |
| `src/components/islands/CommandCenter/MobileStoryCarousel.tsx` | Relevance sort, tap-to-pause |
| `src/styles/broadcast.css` | Expanded card, dim overlay, paused state, drag cursor, ticker sync |

---

## Verification Plan

1. **Welcome overlay:** Clear `localStorage`, reload homepage → overlay appears. Dismiss without checkbox → reappears on refresh. Dismiss with checkbox → never appears again.
2. **Coach marks:** After dismissing welcome, verify hints appear near undiscovered features. Use each feature → hint for that feature disappears. After all discovered → no hints.
3. **Relevance ordering:** Create test scenario with a breaking tracker, a followed tracker, and a stale tracker. Verify broadcast cycles in correct priority order.
4. **Pause on hover:** Hover over lower-third card → broadcast pauses, card expands, globe stops, ticker freezes, dim overlay appears, countdown shows. Mouse leave → resumes after 15s.
5. **Pause on ticker hover/click:** Same behavior. Click ticker item → fly + pause. Verify card and ticker show same tracker.
6. **Drag scrubbing:** Drag ticker left → advances to next tracker. Drag right → goes to previous. Card updates in sync. Same for dragging the card.
7. **Image carousel:** Verify tracker with multiple event images shows carousel dots/arrows. Single image shows static. No images shows gradient fallback.
8. **Double-click navigation:** Double-click ticker item or card → navigates to tracker dashboard page.
9. **Auto-resume:** After user pause, wait 15s → broadcast resumes automatically. Interacting during pause resets the timer.
10. **Mobile:** Test MobileStoryCarousel with same relevance order. Tap-to-pause works. Touch drag works.
11. **Build gate:** `npm run build` passes with all changes.
