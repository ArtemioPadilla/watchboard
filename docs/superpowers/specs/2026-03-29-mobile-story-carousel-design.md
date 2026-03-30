# Mobile Story Carousel

**Date**: 2026-03-29
**Status**: Approved

## Problem

The TV news broadcast mode (globe fly-tos, lower-third, ticker) is hidden on mobile since the globe isn't full-width. Mobile users get no equivalent ambient news experience — only the static sidebar feed.

## Solution

An Instagram Stories-style carousel for mobile that auto-cycles through tracker briefs with verified images.

## Design

### Story Carousel (mobile only, `< 768px`)

**Trigger**: Replaces the current mobile feed header area. Always visible on homepage mobile view.

**Layout**:
1. **Circle row** at top — horizontally scrollable tracker avatars (emoji in colored ring). Active story has animated gradient border. Tapped-out stories have dimmed ring.
2. **Story card** below — full-width, expands when a circle is tapped or auto-advances.

### Story Card Contents

- **Progress bars** at top — one segment per tracker in queue, fills over 10s dwell
- **Header** — tracker emoji, name, day count, freshness badge (LIVE / Xh ago)
- **Image area** (3-tier fallback):
  1. Event media image (Tier 1-2 sources only) with `(c) Source` attribution
  2. Static map tile at `tracker.mapCenter` with strike markers from map-points
  3. Domain-colored gradient + tracker emoji (military=red, politics=blue, sports=green, crisis=amber)
- **Headline** — bold, 2 lines max
- **Digest summary** — 3 lines, muted color
- **KPI strip** — 3 top KPIs in compact cards
- **Swipe up hint** — "Swipe up to open dashboard"

### Interaction

- **Auto-advance**: 10s per story, loops continuously
- **Tap left/right edges**: skip to prev/next story
- **Tap center**: pause/resume
- **Swipe up**: navigate to tracker dashboard
- **Tap circle**: jump to that tracker's story

### Image Resolution

```
resolveStoryImage(tracker, latestEvent):
  1. if latestEvent?.media[0] && source.tier <= 2 → use image URL + attribution
  2. if tracker.mapCenter → OpenStreetMap static tile (dark theme) + map-points overlay
  3. else → domain gradient + emoji
```

For the static map tile, use: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` at zoom 5, centered on mapCenter, with a dark CSS filter (`brightness(0.3) saturate(0.5)`). Overlay map-point markers as absolute-positioned dots.

### Data Source

All data already available in `TrackerCardData`:
- `icon`, `shortName`, `headline`, `digestSummary`, `topKpis`
- `mapCenter` for map tiles
- New: `latestEventMedia?: { url: string; source: string; tier: number }` — populated from the most recent event file's `media[0]` at build time in `index.astro`

## Files

### New
- `src/components/islands/CommandCenter/MobileStoryCarousel.tsx` — the story carousel React island
- `src/styles/mobile-stories.css` — story-specific styles

### Modified
- `src/components/islands/mobile/MobileTabShell.tsx` — render MobileStoryCarousel at top
- `src/lib/tracker-directory-utils.ts` — add `latestEventMedia` to TrackerCardData
- `src/pages/index.astro` — populate `latestEventMedia` from latest event file

## Verification

1. `npm run build` — no type errors
2. `npm run dev` — open on mobile viewport (375px):
   - Circle row visible at top
   - Story auto-advances every 10s
   - Tap circles to jump between stories
   - Swipe up opens tracker dashboard
   - Image tiers resolve correctly (media → map → gradient)
3. Desktop — carousel should NOT appear (hidden via media query)
