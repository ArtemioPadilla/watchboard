# Floating Fact Cards with Carousel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace slot-based fact cards with floating panels anchored to clicked globe entities, with a carousel to cycle through recently clicked items.

**Architecture:** A new `FloatingFactCard` component renders as a direct child of `.globe-wrapper`, positioned absolutely based on entity screen coordinates computed each frame via CesiumJS `SceneTransforms.worldToWindowCoordinates`. An SVG overlay draws the connecting line. CesiumGlobe replaces `selectedPoint`/`selectedEntity` state with a `carouselEntities` array + `activeCardIndex`.

**Tech Stack:** React, CesiumJS (SceneTransforms, Cartesian3), SVG

**Spec:** `docs/superpowers/specs/2026-04-07-floating-fact-cards-design.md`

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `src/components/islands/CesiumGlobe/FloatingFactCard.tsx` | Floating card with entity tracking, connecting line, edge collision, carousel navigation |
| `src/components/islands/CesiumGlobe/useEntityScreenPosition.ts` | Hook that tracks a Cartesian3 position to screen coordinates via RAF |

### Modified files

| File | Changes |
|---|---|
| `src/components/islands/CesiumGlobe/CesiumGlobe.tsx` | Replace selectedPoint/selectedEntity with carousel state, remove fact cards from right slot, render FloatingFactCard |
| `src/components/islands/CesiumGlobe/useConflictData.ts` | Export the clicked entity's Cartesian3 position alongside MapPoint/GenericEntityInfo |

---

## Task 1: useEntityScreenPosition hook

**Files:**
- Create: `src/components/islands/CesiumGlobe/useEntityScreenPosition.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useState, useEffect, useRef } from 'react';
import {
  Cartesian3,
  Cartesian2,
  SceneTransforms,
  type Viewer as CesiumViewer,
} from 'cesium';

interface ScreenPosition {
  x: number;
  y: number;
  visible: boolean;
}

/**
 * Tracks a world-space Cartesian3 position to screen coordinates.
 * Updates every animation frame. Returns { x, y, visible }.
 * `visible` is false when the position is behind the globe or off-screen.
 */
export function useEntityScreenPosition(
  viewer: CesiumViewer | null,
  worldPosition: Cartesian3 | null,
): ScreenPosition {
  const [pos, setPos] = useState<ScreenPosition>({ x: 0, y: 0, visible: false });
  const rafRef = useRef<number>(0);
  const scratchCartesian2 = useRef(new Cartesian2());

  useEffect(() => {
    if (!viewer || !worldPosition) {
      setPos({ x: 0, y: 0, visible: false });
      return;
    }

    let prevX = 0;
    let prevY = 0;
    let prevVisible = false;

    const update = () => {
      if (viewer.isDestroyed()) return;

      const result = SceneTransforms.worldToWindowCoordinates(
        viewer.scene,
        worldPosition,
        scratchCartesian2.current,
      );

      if (result) {
        const x = Math.round(result.x);
        const y = Math.round(result.y);
        const canvas = viewer.canvas;
        const visible =
          x >= -50 && x <= canvas.clientWidth + 50 &&
          y >= -50 && y <= canvas.clientHeight + 50;

        // Only update state when values actually change (avoid re-renders every frame)
        if (x !== prevX || y !== prevY || visible !== prevVisible) {
          prevX = x;
          prevY = y;
          prevVisible = visible;
          setPos({ x, y, visible });
        }
      } else {
        // Position is behind the globe
        if (prevVisible) {
          prevVisible = false;
          setPos(p => p.visible ? { ...p, visible: false } : p);
        }
      }

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [viewer, worldPosition]);

  return pos;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/islands/CesiumGlobe/useEntityScreenPosition.ts
git commit -m "feat(globe): add useEntityScreenPosition hook for tracking entities to screen coords"
```

---

## Task 2: FloatingFactCard component

**Files:**
- Create: `src/components/islands/CesiumGlobe/FloatingFactCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useMemo, useCallback } from 'react';
import { Cartesian3, type Viewer as CesiumViewer } from 'cesium';
import type { MapPoint } from '../../../lib/schemas';
import { MAP_CATEGORIES } from '../../../lib/map-utils';
import { tierLabelFull, tierClass } from './cesium-helpers';
import { useEntityScreenPosition } from './useEntityScreenPosition';

// ── Types ──

export interface CarouselEntity {
  id: string;
  type: 'map-point' | 'generic';
  position: Cartesian3;
  point?: MapPoint;
  name?: string;
  description?: string;
}

interface Props {
  viewer: CesiumViewer;
  entities: CarouselEntity[];
  activeIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

const CARD_WIDTH = 280;
const CARD_HEIGHT_ESTIMATE = 200;
const OFFSET = 24;
const MARGIN = 12;

// ── Component ──

export default function FloatingFactCard({
  viewer,
  entities,
  activeIndex,
  onClose,
  onNavigate,
}: Props) {
  const active = entities[activeIndex];
  if (!active) return null;

  const screenPos = useEntityScreenPosition(viewer, active.position);

  const cardPos = useMemo(() => {
    if (!screenPos.visible) return null;
    const canvas = viewer.canvas;
    return computeCardPosition(
      screenPos.x,
      screenPos.y,
      CARD_WIDTH,
      CARD_HEIGHT_ESTIMATE,
      canvas.clientWidth,
      canvas.clientHeight,
    );
  }, [screenPos.x, screenPos.y, screenPos.visible, viewer]);

  const handlePrev = useCallback(() => {
    const prev = activeIndex > 0 ? activeIndex - 1 : entities.length - 1;
    onNavigate(prev);
  }, [activeIndex, entities.length, onNavigate]);

  const handleNext = useCallback(() => {
    const next = activeIndex < entities.length - 1 ? activeIndex + 1 : 0;
    onNavigate(next);
  }, [activeIndex, entities.length, onNavigate]);

  return (
    <>
      {/* Connecting line */}
      {cardPos && (
        <svg
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            zIndex: 9,
          }}
        >
          <line
            x1={screenPos.x}
            y1={screenPos.y}
            x2={cardPos.side === 'right' ? cardPos.x : cardPos.x + CARD_WIDTH}
            y2={cardPos.y + 20}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={1}
            strokeDasharray="4,3"
          />
          <circle
            cx={screenPos.x}
            cy={screenPos.y}
            r={4}
            fill="none"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth={1}
          />
        </svg>
      )}

      {/* Card */}
      <div
        style={{
          position: 'fixed',
          left: cardPos?.x ?? 0,
          top: cardPos?.y ?? 0,
          width: CARD_WIDTH,
          opacity: screenPos.visible && cardPos ? 1 : 0,
          transition: 'opacity 0.25s ease, left 0.15s ease, top 0.15s ease',
          pointerEvents: screenPos.visible && cardPos ? 'auto' : 'none',
          zIndex: 10,
        }}
      >
        <div style={S.card}>
          {/* Header */}
          <div style={S.header}>
            {active.type === 'map-point' && active.point ? (
              <MapPointHeader point={active.point} />
            ) : (
              <span style={S.genericName}>{active.name || 'Entity'}</span>
            )}
            <button onClick={onClose} style={S.closeBtn} aria-label="Close">
              &times;
            </button>
          </div>

          {/* Body */}
          <div style={S.body}>
            {active.type === 'map-point' && active.point ? (
              <MapPointBody point={active.point} />
            ) : (
              active.description && (
                <pre style={S.genericDesc}>{active.description}</pre>
              )
            )}
          </div>

          {/* Carousel navigation */}
          {entities.length > 1 && (
            <div style={S.carousel}>
              <button onClick={handlePrev} style={S.carouselBtn}>◀</button>
              <div style={S.dots}>
                {entities.map((_, i) => (
                  <span
                    key={i}
                    style={{
                      ...S.dot,
                      background: i === activeIndex ? '#e8e9ed' : 'rgba(255,255,255,0.2)',
                    }}
                    onClick={() => onNavigate(i)}
                  />
                ))}
              </div>
              <button onClick={handleNext} style={S.carouselBtn}>▶</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Map point sub-components ──

function MapPointHeader({ point }: { point: MapPoint }) {
  const category = MAP_CATEGORIES.find(c => c.id === point.cat);
  return (
    <div>
      <div style={{ ...S.typeBadge, color: category?.color || '#e74c3c' }}>
        {category?.label || point.cat}
      </div>
      <div style={S.title}>{point.label}</div>
    </div>
  );
}

function MapPointBody({ point }: { point: MapPoint }) {
  return (
    <>
      {point.sub && <div style={S.desc}>{point.sub}</div>}
      <div style={S.sources}>
        {point.sources?.map((s, i) => (
          <span key={i} className={`source-chip ${tierClass(s.tier)}`} style={{ fontSize: '0.55rem' }}>
            {s.name ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                {tierLabelFull(s.tier)} {s.name}
              </a>
            ) : (
              tierLabelFull(s.tier)
            )}
          </span>
        ))}
      </div>
      <div style={S.coords}>
        {point.lat.toFixed(2)}°{point.lat >= 0 ? 'N' : 'S'},{' '}
        {point.lon.toFixed(2)}°{point.lon >= 0 ? 'E' : 'W'}
        {' · '}{point.date}
      </div>
    </>
  );
}

// ── Card positioning ──

function computeCardPosition(
  entityX: number,
  entityY: number,
  cardWidth: number,
  cardHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number; side: 'left' | 'right' } {
  let x = entityX + OFFSET;
  let y = entityY - OFFSET;
  let side: 'left' | 'right' = 'right';

  // Flip left if card would go past right edge (leave room for right column ~300px)
  const rightBound = viewportWidth - 320;
  if (x + cardWidth > rightBound) {
    x = entityX - OFFSET - cardWidth;
    side = 'left';
  }

  // Flip back right if past left edge
  if (x < MARGIN) {
    x = entityX + OFFSET;
    side = 'right';
  }

  // Shift up if overlapping bottom timeline (~250px from bottom)
  const bottomBound = viewportHeight - 260;
  if (y + cardHeight > bottomBound) {
    y = bottomBound - cardHeight;
  }

  // Shift down if above viewport
  if (y < MARGIN) {
    y = MARGIN;
  }

  return { x, y, side };
}

// ── Styles ──

const S: Record<string, React.CSSProperties> = {
  card: {
    background: 'rgba(10,11,14,0.95)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    overflow: 'hidden',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    fontFamily: "'DM Sans', sans-serif",
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '10px 12px 6px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(232,233,237,0.4)',
    fontSize: '1.2rem',
    cursor: 'pointer',
    padding: '0 2px',
    lineHeight: 1,
    flexShrink: 0,
  },
  typeBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.55rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    marginBottom: '2px',
  },
  title: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#e8e9ed',
    lineHeight: 1.2,
  },
  genericName: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#e8e9ed',
  },
  body: {
    padding: '8px 12px 10px',
  },
  desc: {
    fontSize: '0.72rem',
    color: 'rgba(232,233,237,0.6)',
    lineHeight: 1.5,
    marginBottom: '8px',
  },
  genericDesc: {
    whiteSpace: 'pre-wrap' as const,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.65rem',
    color: 'rgba(232,233,237,0.6)',
    margin: 0,
  },
  sources: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
    marginBottom: '6px',
  },
  coords: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.6rem',
    color: 'rgba(0,255,170,0.4)',
  },
  carousel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '6px 12px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  carouselBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(232,233,237,0.4)',
    fontSize: '0.7rem',
    cursor: 'pointer',
    padding: '2px 4px',
  },
  dots: {
    display: 'flex',
    gap: '4px',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/islands/CesiumGlobe/FloatingFactCard.tsx
git commit -m "feat(globe): add FloatingFactCard component with carousel"
```

---

## Task 3: Wire FloatingFactCard into CesiumGlobe

**Files:**
- Modify: `src/components/islands/CesiumGlobe/CesiumGlobe.tsx`
- Modify: `src/components/islands/CesiumGlobe/useConflictData.ts`

This task replaces the old selectedPoint/selectedEntity system with the carousel and floating card.

- [ ] **Step 1: Export entity position from useConflictData**

In `src/components/islands/CesiumGlobe/useConflictData.ts`, update the `GenericEntityInfo` interface to include a position:

```typescript
export interface GenericEntityInfo {
  name: string;
  description?: string;
  position?: { lat: number; lon: number };
}
```

Then find where `onEntitySelect` is called (in the click handler). Pass the entity's position. Look for the pattern where the handler reads the clicked entity's position and calls `onEntitySelect`. Add `position: { lat, lon }` from the entity's coordinates.

The entity's position is stored in the `pointMapRef` for map points. For generic entities (flights, satellites), the position is available from the entity itself via `entity.position.getValue(viewer.clock.currentTime)`. Extract lat/lon from the Cartesian3.

- [ ] **Step 2: Replace state in CesiumGlobe.tsx**

In CesiumGlobe.tsx, replace the old state (around lines 107-108):

```typescript
// OLD — remove these:
// const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
// const [selectedEntity, setSelectedEntity] = useState<GenericEntityInfo | null>(null);

// NEW — carousel state:
const [carouselEntities, setCarouselEntities] = useState<CarouselEntity[]>([]);
const [activeCardIndex, setActiveCardIndex] = useState(0);
```

Add the import at the top:

```typescript
import FloatingFactCard, { type CarouselEntity } from './FloatingFactCard';
import { Cartesian3 } from 'cesium';
```

- [ ] **Step 3: Update click handlers**

Replace the existing `handlePointSelect` and `handleEntitySelect` callbacks (around lines 415-424):

```typescript
const handlePointSelect = useCallback((point: MapPoint | null) => {
  if (!point) {
    setCarouselEntities([]);
    return;
  }
  const entity: CarouselEntity = {
    id: `point-${point.id}`,
    type: 'map-point',
    position: Cartesian3.fromDegrees(point.lon, point.lat, 0),
    point,
  };
  setCarouselEntities(prev => {
    // Don't add duplicate
    if (prev.some(e => e.id === entity.id)) {
      setActiveCardIndex(prev.findIndex(e => e.id === entity.id));
      return prev;
    }
    const next = [...prev, entity].slice(-5); // FIFO cap at 5
    setActiveCardIndex(next.length - 1);
    return next;
  });
  setEventsOpen(false);
}, []);

const handleEntitySelect = useCallback((info: GenericEntityInfo) => {
  const entity: CarouselEntity = {
    id: `entity-${info.name}`,
    type: 'generic',
    position: info.position
      ? Cartesian3.fromDegrees(info.position.lon, info.position.lat, 0)
      : Cartesian3.fromDegrees(0, 0, 0),
    name: info.name,
    description: info.description,
  };
  setCarouselEntities(prev => {
    if (prev.some(e => e.id === entity.id)) {
      setActiveCardIndex(prev.findIndex(e => e.id === entity.id));
      return prev;
    }
    const next = [...prev, entity].slice(-5);
    setActiveCardIndex(next.length - 1);
    return next;
  });
  setEventsOpen(false);
}, []);
```

- [ ] **Step 4: Remove fact cards from the right column**

In the right column JSX (around lines 577-594), remove the `selectedPoint` and `selectedEntity` conditional blocks. The right column should only contain Intel feed + Telemetry:

```tsx
{/* Right column — stacked panels */}
<div className="globe-slot globe-slot--right">
  {/* Intel feed */}
  {hasPanelInSlot('right', 'intel') && (
    <CesiumEventsPanel
      events={events || []}
      onEventSelect={handleEventSelect}
      categories={categories || []}
      isOpen={eventsOpen}
      onToggle={() => setEventsOpen(prev => !prev)}
    />
  )}

  {/* Telemetry (mission preset only) */}
  {hasPanelInSlot('right', 'telemetry') && missionTrajectory && (
    <MissionTelemetry telemetryRef={telemetryRef} />
  )}
</div>
```

- [ ] **Step 5: Add FloatingFactCard render**

After the right column div, add the floating card (still inside `.globe-wrapper`):

```tsx
{/* Floating fact card — anchored to entity */}
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

- [ ] **Step 6: Update KPI strip visibility check**

The old code hid KPIs when `selectedPoint || selectedEntity`. Replace with carousel check:

```tsx
{carouselEntities.length === 0 && hasPanelInSlot('top-right', 'kpi-strip') && (
```

- [ ] **Step 7: Handle entity removal (filter toggle)**

When filters change and entities are removed from the globe, stale carousel entries should be cleaned up. Add an effect that prunes the carousel when `filteredPoints` changes:

```typescript
useEffect(() => {
  if (carouselEntities.length === 0) return;
  const pointIds = new Set(filteredPoints.map(p => p.id));
  setCarouselEntities(prev => {
    const filtered = prev.filter(e =>
      e.type === 'generic' || (e.point && pointIds.has(e.point.id))
    );
    if (filtered.length === prev.length) return prev;
    if (filtered.length === 0) return [];
    setActiveCardIndex(i => Math.min(i, filtered.length - 1));
    return filtered;
  });
}, [filteredPoints, carouselEntities.length]);
```

- [ ] **Step 8: Add Escape key handler**

In the existing keyboard handler (or add one), dismiss the card on Escape:

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && carouselEntities.length > 0) {
      setCarouselEntities([]);
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [carouselEntities.length]);
```

- [ ] **Step 9: Verify tests pass**

Run: `npx vitest run 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 10: Commit**

```bash
git add src/components/islands/CesiumGlobe/CesiumGlobe.tsx src/components/islands/CesiumGlobe/useConflictData.ts
git commit -m "feat(globe): wire FloatingFactCard with carousel into CesiumGlobe"
```

---

## Task 4: Integration test and cleanup

**Files:** None (testing only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 2: Build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 3: Visual verification on dev server**

Start dev server and test on `/iran-conflict/globe/`:
- Click a map point → floating card appears next to it with connecting line
- Rotate globe → card follows entity position
- Rotate entity behind globe → card fades out
- Click another point → card shows new point, carousel dots appear (2 dots)
- Click ◀ ▶ arrows → cycles between clicked entities, connecting line updates
- Press Escape → card dismisses
- Right column (Intel feed) stays undisturbed throughout

Test on `/artemis-2/globe/`:
- Click Orion spacecraft entity → floating card appears
- Telemetry panel in right column stays visible
- Mission Identity in bottom-left stays visible

- [ ] **Step 4: Remove unused CesiumInfoPanel import if no longer needed**

Check if `CesiumInfoPanel` is still imported in CesiumGlobe.tsx. If the floating card fully replaces it, remove the import. If it's used elsewhere, keep it.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(globe): floating fact cards — integration complete"
```
