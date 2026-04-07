# Floating Fact Cards with Carousel

**Date:** 2026-04-07
**Status:** Approved

## Summary

Replace the slot-based fact card rendering (currently in the right column) with floating panels anchored to clicked entities on the CesiumJS globe. Cards track entity screen position in real-time via a connecting line, fade when entities go behind the globe, and support a carousel to cycle through recently clicked entities.

## Motivation

Fact cards currently render in the right grid slot, displacing the Intel feed and Telemetry panels when open. On a spatial intelligence platform, info cards should be spatially anchored to the entity they describe — the user sees the red dot, follows the connecting line to the card, reads the details. No mental mapping required.

## Behavior

### Positioning

- Card floats near the clicked entity's screen-space position
- Screen position computed each frame via `scene.cartesianToCanvasCoordinates(entity.position)`
- A thin dashed SVG line connects the entity dot to the card's anchor point
- Card offset: 20px right, 20px up from the entity by default

### Edge collision avoidance

The card auto-repositions to stay fully on-screen:
- If card would extend past the **right edge** (overlapping the right column): flip to left side of entity
- If card would extend past the **bottom edge** (overlapping the timeline): shift up
- If card would extend past the **top edge**: shift down
- If card would extend past the **left edge** (overlapping the toolbar): flip to right side
- Minimum 8px margin from viewport edges and grid slot elements

### Entity visibility

- When the entity goes behind the globe or off-screen: card fades out (opacity transition to 0 over 300ms)
- When entity comes back into view: card fades back in (opacity transition to 1 over 200ms)
- Visibility check: `scene.cartesianToCanvasCoordinates()` returns `undefined` when occluded

### One card at a time + carousel

- Only one fact card is visible at a time
- Clicking a new entity adds it to the carousel and shows it
- Carousel stores up to 5 recently clicked entities (FIFO)
- Small ◀ ▶ arrows and dot indicators at the bottom of the card for navigation
- Switching carousel item updates the connecting line to point at the corresponding entity
- Clicking the same entity again or pressing Escape dismisses the card
- Clicking empty space on the globe dismisses the card

### Entity removal

If the tracked entity is removed from the viewer (e.g., category filter toggled off), the carousel entry is removed and the card navigates to the next item. If no items remain, the card dismisses.

### Card content

The card displays the same content as the current `CesiumInfoPanel` and generic entity panel:

**For map points (conflict data):**
- Type badge (colored: KINETIC, RETALIATION, INFRASTRUCTURE, etc.)
- Title (Cormorant Garamond, larger)
- Description body text
- Source chips with tier colors (T1-T4)
- Coordinates
- Date
- Media thumbnails (if present)

**For generic entities (flights, ships, satellites):**
- Entity name
- Description (pre-formatted)
- No source chips

### Z-index

The floating card renders inside `.globe-wrapper` (participates in the grid's stacking context via `display: contents`). Z-index:
- Canvas: -1
- Grid slots: auto (0)
- Floating card: 10 (above grid slots, below nothing — it's the topmost interactive element)

## Implementation

### New file: `src/components/islands/CesiumGlobe/FloatingFactCard.tsx`

A React component that:
- Accepts: `selectedEntity`, `carouselEntities[]`, `viewer` (CesiumJS viewer instance), `onClose`, `onCarouselNavigate`
- Uses a RAF loop to track entity screen position each frame
- Renders an absolutely-positioned div with the card content
- Renders an SVG overlay for the connecting line
- Handles edge collision with the viewport and grid elements
- Manages fade opacity based on entity visibility

### Props interface

```typescript
interface FloatingFactCardProps {
  viewer: CesiumViewer;
  entities: CarouselEntity[];       // up to 5 recently clicked
  activeIndex: number;              // which one is currently shown
  onClose: () => void;
  onNavigate: (index: number) => void;
}

interface CarouselEntity {
  id: string;
  type: 'map-point' | 'generic';
  position: Cartesian3;             // world position for tracking
  // For map points:
  point?: MapPoint;
  // For generic entities:
  name?: string;
  description?: string;
}
```

### Carousel state management

In `CesiumGlobe.tsx`, replace the current `selectedPoint` / `selectedEntity` state with:

```typescript
const [carouselEntities, setCarouselEntities] = useState<CarouselEntity[]>([]);
const [activeCardIndex, setActiveCardIndex] = useState(0);
```

When user clicks an entity:
1. Create a `CarouselEntity` from the clicked point/entity
2. Append to `carouselEntities` (cap at 5, FIFO)
3. Set `activeCardIndex` to the new item

### Connecting line

An SVG element rendered as a sibling to the card, covering the full viewport:

```tsx
<svg style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9 }}>
  <line
    x1={entityScreenX} y1={entityScreenY}
    x2={cardAnchorX} y2={cardAnchorY}
    stroke="rgba(255,255,255,0.2)"
    strokeWidth={1}
    strokeDasharray="4,3"
  />
</svg>
```

### Edge collision algorithm

```typescript
function computeCardPosition(
  entityX: number, entityY: number,
  cardWidth: number, cardHeight: number,
  viewportWidth: number, viewportHeight: number,
  rightColumnX: number,      // left edge of the right grid slot
  bottomTimelineY: number,   // top edge of the bottom timeline
): { x: number; y: number; side: 'left' | 'right' } {
  const OFFSET = 20;
  const MARGIN = 8;

  // Try right side first
  let x = entityX + OFFSET;
  let y = entityY - OFFSET;
  let side: 'left' | 'right' = 'right';

  // Flip left if overlapping right column
  if (x + cardWidth > rightColumnX - MARGIN) {
    x = entityX - OFFSET - cardWidth;
    side = 'left';
  }

  // Flip right if overlapping left edge
  if (x < MARGIN) {
    x = entityX + OFFSET;
    side = 'right';
  }

  // Shift up if overlapping timeline
  if (y + cardHeight > bottomTimelineY - MARGIN) {
    y = bottomTimelineY - MARGIN - cardHeight;
  }

  // Shift down if above viewport
  if (y < MARGIN) {
    y = MARGIN;
  }

  return { x, y, side };
}
```

## Changes to CesiumGlobe.tsx

### Remove from right column

Delete the `selectedPoint` and `selectedEntity` conditional blocks currently inside the right slot. The right column becomes only: Intel feed + Telemetry (mission preset).

### Add floating card

Render `FloatingFactCard` as a direct child of `.globe-wrapper` (not inside any slot):

```tsx
{carouselEntities.length > 0 && cesiumViewer && (
  <FloatingFactCard
    viewer={cesiumViewer}
    entities={carouselEntities}
    activeIndex={activeCardIndex}
    onClose={() => setCarouselEntities([])}
    onNavigate={setActiveCardIndex}
  />
)}
```

### Update click handlers

The existing `handlePointClick` and entity selection handlers need to push to the carousel instead of setting `selectedPoint`/`selectedEntity`.

## Files to create or modify

### New files
| File | Responsibility |
|---|---|
| `src/components/islands/CesiumGlobe/FloatingFactCard.tsx` | Floating card with tracking, connecting line, collision avoidance, carousel |

### Modified files
| File | Changes |
|---|---|
| `src/components/islands/CesiumGlobe/CesiumGlobe.tsx` | Replace selectedPoint/selectedEntity state with carousel state, remove fact cards from right slot, add FloatingFactCard render |

## Mobile

On mobile (≤768px), the floating card is not practical (small screen, touch interactions). Instead, the card renders as a bottom sheet that slides up from the bottom, covering ~40% of the screen. Same carousel navigation via swipe left/right.

This is the same pattern planned for the Phase B mobile bottom sheet — the fact card becomes one of its tabs. For now (this spec), on mobile the card falls back to the current behavior (renders in a fixed position at the bottom).
