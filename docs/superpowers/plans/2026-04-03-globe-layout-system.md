# Globe Layout System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CesiumGlobe's pile of `position: fixed` overlays with a CSS Grid layout system that prevents UI collisions between default and tracker-specific panels.

**Architecture:** A `.globe-layout` CSS Grid overlay sits on top of the Cesium viewer. Named grid areas (`top-left`, `top-center`, `top-right`, `left`, `right`, `bottom`, plus auxiliary slots `left-aux`, `right-aux`, `bottom-aux`) receive existing components via `.globe-slot--*` class names. MissionHUD splits into three components targeting auxiliary slots. Mobile collapses to a single-column grid.

**Tech Stack:** CSS Grid, React (existing CesiumGlobe island), Astro pages

**Spec:** `docs/superpowers/specs/2026-04-03-globe-layout-system-design.md`

---

### Task 1: Create `globe-layout.css` with the grid system

**Files:**
- Create: `src/styles/globe-layout.css`

- [ ] **Step 1: Create the grid layout CSS file**

```css
/* ══════════════════════════════════════════════
   Globe Layout System — CSS Grid overlay
   Slot-based positioning for all globe UI panels.
   ══════════════════════════════════════════════ */

/* ── Layout grid (desktop) ── */
.globe-layout {
  position: fixed;
  inset: 0;
  z-index: 90;
  pointer-events: none;
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-rows: auto 1fr auto auto;
  grid-template-areas:
    "top-left    top-center   top-right"
    "left        .            right"
    "left-aux    bottom-aux   right-aux"
    "bottom-left bottom       bottom-right";
  padding: 12px;
  gap: 8px;
  align-items: start;
}

/* ── Slot base ── */
.globe-slot {
  pointer-events: auto;
  min-width: 0;
  min-height: 0;
}

/* ── Named slot areas ── */
.globe-slot--top-left     { grid-area: top-left;     display: flex; gap: 8px; align-items: center; }
.globe-slot--top-center   { grid-area: top-center;   justify-self: center; text-align: center; pointer-events: none; }
.globe-slot--top-right    { grid-area: top-right;    justify-self: end; }
.globe-slot--left         { grid-area: left;         align-self: start; }
.globe-slot--right        { grid-area: right;        align-self: start; justify-self: end; }
.globe-slot--bottom       { grid-area: bottom;       justify-self: center; align-self: end; width: 90%; max-width: 900px; }
.globe-slot--left-aux     { grid-area: left-aux;     align-self: end; }
.globe-slot--right-aux    { grid-area: right-aux;    align-self: end; justify-self: end; }
.globe-slot--bottom-aux   { grid-area: bottom-aux;   justify-self: center; align-self: end; width: 90%; max-width: 900px; }

/* ── Hydration boundary: promote React island children to grid participants ──
   Astro wraps client:only components in <astro-island>. The React component
   returns <div class="globe-wrapper">. Both sit between .globe-layout and
   the .globe-slot elements. display:contents makes them transparent to grid. ── */
.globe-layout > astro-island { display: contents; }
.globe-wrapper { display: contents; }

/* ── Cesium canvas — fills viewport behind the grid ── */
.globe-canvas {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
}

/* ── Mobile layout (<=768px) ── */
@media (max-width: 768px) {
  .globe-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto auto;
    grid-template-areas:
      "top-center"
      "."
      "bottom-aux"
      "bottom";
    padding: 8px;
    gap: 4px;
  }

  .globe-slot--top-left,
  .globe-slot--top-right,
  .globe-slot--left,
  .globe-slot--right,
  .globe-slot--left-aux,
  .globe-slot--right-aux {
    display: none !important;
  }
}
```

- [ ] **Step 2: Verify file exists**

Run: `ls -la src/styles/globe-layout.css`
Expected: File listed with the correct size.

- [ ] **Step 3: Commit**

```bash
git add src/styles/globe-layout.css
git commit -m "feat(globe): add slot-based CSS grid layout system"
```

---

### Task 2: Wire up `.globe-layout` grid in `globe.astro` and import the CSS

**Files:**
- Modify: `src/pages/[tracker]/globe.astro:34-67`
- Modify: `src/styles/globe.css:1`

- [ ] **Step 1: Import `globe-layout.css` at the top of `globe.css`**

In `src/styles/globe.css`, at line 1, change:

```css
@import './unified-timeline.css';
```

to:

```css
@import './unified-timeline.css';
@import './globe-layout.css';
```

- [ ] **Step 2: Wrap globe.astro content in `.globe-layout` and slot the back/about links**

In `src/pages/[tracker]/globe.astro`, replace the `<main>` block (lines 35-66):

```astro
<BaseLayout title={`3D Intelligence Globe — ${config.shortName}`} trackerSlug={config.slug}>
  <main id="main-content">
  <div class="globe-layout">
    <div class="globe-slot globe-slot--top-left">
      <a href={`${basePath}${config.slug}/`} class="globe-back-link">&larr; Dashboard</a>
      <a href={`${basePath}${config.slug}/about/`} class="globe-about-link">About</a>
    </div>
    <CesiumGlobe
      client:only="react"
      points={data.mapPoints}
      lines={data.mapLines}
      kpis={data.kpis}
      meta={data.meta}
      events={events}
      cameraPresets={config.globe?.cameraPresets ?? {}}
      categories={config.map?.categories ?? []}
      mapCenter={config.map?.center ?? { lon: 0, lat: 0 }}
      isHistorical={config.temporal === 'historical'}
      endDate={config.endDate}
      clocks={config.globe?.clocks}
      missionTrajectory={missionTrajectory}
    />
  </div>
  <script>
    if (window.innerWidth <= 768) {
      const pathParts = window.location.pathname.replace(/\/+$/, '').split('/');
      pathParts.pop();
      window.location.replace(pathParts.join('/') + '/?mode=3d');
    }
  </script>
  <script define:vars={{ trackerSlug: config.slug }}>
    if (window.posthog) {
      window.posthog.register({ tracker_slug: trackerSlug });
      window.posthog.capture('globe_opened', { tracker_slug: trackerSlug });
    }
  </script>
  </main>
</BaseLayout>
```

- [ ] **Step 3: Remove old fixed positioning from `.globe-back-link` and `.globe-about-link` in `globe.css`**

In `src/styles/globe.css`, replace the `.globe-back-link` rule (lines 21-36):

```css
.globe-back-link {
  color: var(--text-primary, #e8e9ed);
  background: rgba(10, 11, 14, 0.85);
  backdrop-filter: blur(8px);
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-family: 'DM Sans', sans-serif;
  font-size: 0.8rem;
  text-decoration: none;
  transition: background 0.2s;
}
```

Replace the `.globe-about-link` rule (lines 42-57):

```css
.globe-about-link {
  color: var(--text-muted, #8b8fa2);
  background: rgba(10, 11, 14, 0.85);
  backdrop-filter: blur(8px);
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-family: 'DM Sans', sans-serif;
  font-size: 0.8rem;
  text-decoration: none;
  transition: background 0.2s, color 0.2s;
}
```

Key changes: Remove `position: fixed`, `top`, `left`, and `z-index` from both. The `.globe-slot--top-left` flex container handles positioning.

- [ ] **Step 4: Build and verify**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds. Back/about links are now grid-positioned.

- [ ] **Step 5: Commit**

```bash
git add src/pages/\[tracker\]/globe.astro src/styles/globe.css src/styles/globe-layout.css
git commit -m "feat(globe): wire layout grid into globe.astro, slot back/about links"
```

---

### Task 3: Convert `globe-wrapper` to `display: contents` and move header into `top-center` slot

**Files:**
- Modify: `src/components/islands/CesiumGlobe/CesiumGlobe.tsx:492-498`
- Modify: `src/styles/globe.css:6-10,64-70,436-461`

**Context:** CSS Grid only works on direct children. The React island's `.globe-wrapper` sits between `.globe-layout` and the `.globe-slot` elements. With `display: contents` on `.globe-wrapper` (added in Task 1's CSS), its children become direct grid participants. But `display: contents` removes the box, so `.globe-wrapper`'s background/sizing duties move elsewhere.

- [ ] **Step 1: Move body background to handle the black backdrop**

In `src/styles/globe.css`, replace the body override (lines 6-10):

```css
body:has(.globe-wrapper) {
  overflow: hidden;
  margin: 0;
  padding: 0;
}
```

with:

```css
body:has(.globe-wrapper) {
  overflow: hidden;
  margin: 0;
  padding: 0;
  background: #000;
}
```

- [ ] **Step 2: Remove `.globe-wrapper` styling from globe.css**

Replace the `.globe-wrapper` rule (lines 64-70):

```css
.globe-wrapper {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background: #000;
}
```

with:

```css
/* .globe-wrapper uses display:contents (see globe-layout.css)
   to promote its children into .globe-layout grid participants.
   Background is on body:has(.globe-wrapper). */
```

- [ ] **Step 3: Wrap the Cesium Viewer in a `.globe-canvas` div and move header into slot**

In `src/components/islands/CesiumGlobe/CesiumGlobe.tsx`, replace the beginning of the return block (lines 492-498):

```tsx
  return (
    <div className="globe-wrapper">
      {/* Operation header */}
      <div className="globe-header">
        <div className="globe-header-dateline">{meta.dateline}</div>
        <div className="globe-header-op">{meta.operationName}</div>
      </div>

      <Viewer
```

with:

```tsx
  return (
    <div className="globe-wrapper">
      {/* Operation header */}
      <div className="globe-slot globe-slot--top-center">
        <div className="globe-header">
          <div className="globe-header-dateline">{meta.dateline}</div>
          <div className="globe-header-op">{meta.operationName}</div>
        </div>
      </div>

      {/* Cesium canvas — fixed viewport behind grid */}
      <div className="globe-canvas">
      <Viewer
```

And find the closing `/>` of `<Viewer>` (after `creditContainer={creditDivRef.current!}`):

```tsx
        creditContainer={creditDivRef.current!}
      />
```

Add a closing `</div>` right after it:

```tsx
        creditContainer={creditDivRef.current!}
      />
      </div>
```

- [ ] **Step 4: Remove fixed positioning from `.globe-header` in globe.css**

In `src/styles/globe.css`, replace the `.globe-header` rule:

```css
.globe-header {
  position: fixed;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 95;
  text-align: center;
  pointer-events: none;
}
```

with:

```css
.globe-header {
  text-align: center;
  pointer-events: none;
}
```

- [ ] **Step 5: Build and verify**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/islands/CesiumGlobe/CesiumGlobe.tsx src/styles/globe.css
git commit -m "refactor(globe): display:contents on globe-wrapper, canvas wrapper, header slot"
```

---

### Task 4: Move KPI strip into `top-right` slot

**Files:**
- Modify: `src/components/islands/CesiumGlobe/CesiumGlobe.tsx:594-612`
- Modify: `src/styles/globe.css:464-476`

- [ ] **Step 1: Wrap KPI strip in a slot div in CesiumGlobe.tsx**

In `src/components/islands/CesiumGlobe/CesiumGlobe.tsx`, replace the KPI strip block (lines 594-612):

```tsx
      {/* KPI strip — hidden when info panel is open */}
      {!selectedPoint && !selectedEntity && <div className={`globe-kpi-strip${showAllKpis ? ' expanded' : ''}`}>
        {kpis.slice(0, showAllKpis ? kpis.length : 4).map(k => (
          <div key={k.id} className="globe-kpi" style={{ borderColor: KPI_COLORS[k.color] || '#555' }}>
            <span className="globe-kpi-value" style={{ color: KPI_COLORS[k.color] }}>{k.value}</span>
            <span className="globe-kpi-label">{k.label}</span>
            {k.delta && (
              <span className={`globe-kpi-delta ${k.trend === 'up' ? 'up' : k.trend === 'down' ? 'down' : ''}`}>
                {k.delta}
              </span>
            )}
          </div>
        ))}
        {kpis.length > 4 && (
          <button className="globe-kpi-more" onClick={() => setShowAllKpis(p => !p)}>
            {showAllKpis ? '\u2212' : `+${kpis.length - 4}`}
          </button>
        )}
      </div>}
```

with:

```tsx
      {/* KPI strip — hidden when info panel is open */}
      {!selectedPoint && !selectedEntity && (
        <div className="globe-slot globe-slot--top-right">
          <div className={`globe-kpi-strip${showAllKpis ? ' expanded' : ''}`}>
            {kpis.slice(0, showAllKpis ? kpis.length : 4).map(k => (
              <div key={k.id} className="globe-kpi" style={{ borderColor: KPI_COLORS[k.color] || '#555' }}>
                <span className="globe-kpi-value" style={{ color: KPI_COLORS[k.color] }}>{k.value}</span>
                <span className="globe-kpi-label">{k.label}</span>
                {k.delta && (
                  <span className={`globe-kpi-delta ${k.trend === 'up' ? 'up' : k.trend === 'down' ? 'down' : ''}`}>
                    {k.delta}
                  </span>
                )}
              </div>
            ))}
            {kpis.length > 4 && (
              <button className="globe-kpi-more" onClick={() => setShowAllKpis(p => !p)}>
                {showAllKpis ? '\u2212' : `+${kpis.length - 4}`}
              </button>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 2: Remove fixed positioning from `.globe-kpi-strip` in globe.css**

In `src/styles/globe.css`, replace the `.globe-kpi-strip` rule (lines 464-476):

```css
.globe-kpi-strip {
  position: fixed;
  top: 10px;
  right: 12px;
  z-index: 90;
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
  justify-content: flex-end;
  align-items: flex-start;
  max-width: 50vw;
  overflow: hidden;
}
```

with:

```css
.globe-kpi-strip {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
  justify-content: flex-end;
  align-items: flex-start;
  max-width: 50vw;
  overflow: hidden;
}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/islands/CesiumGlobe/CesiumGlobe.tsx src/styles/globe.css
git commit -m "refactor(globe): move KPI strip into top-right grid slot"
```

---

### Task 5: Move CesiumControls (toolbar) into `left` slot

**Files:**
- Modify: `src/components/islands/CesiumGlobe/CesiumGlobe.tsx:614-640`
- Modify: `src/styles/globe.css:85-94`

- [ ] **Step 1: Wrap CesiumControls in a slot div in CesiumGlobe.tsx**

In `src/components/islands/CesiumGlobe/CesiumGlobe.tsx`, replace lines 614-640 (the `<CesiumControls ... />` block):

```tsx
      {/* Overlay controls toolbar */}
      <CesiumControls
        ...props...
      />
```

with:

```tsx
      {/* Overlay controls toolbar */}
      <div className="globe-slot globe-slot--left">
        <CesiumControls
          ...props...
        />
      </div>
```

Keep all existing props on CesiumControls unchanged — only wrap it.

- [ ] **Step 2: Remove fixed positioning from `.globe-toolbar` in globe.css**

In `src/styles/globe.css`, replace lines 85-94:

```css
.globe-toolbar {
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 90;
  display: flex;
  align-items: flex-start;
  gap: 0;
  padding-top: 42px; /* space for back link */
}
```

with:

```css
.globe-toolbar {
  display: flex;
  align-items: flex-start;
  gap: 0;
}
```

Note: `padding-top: 42px` is removed — the grid row separation now provides spacing between the `top-left` back link and the `left` toolbar.

- [ ] **Step 3: Build and verify**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/islands/CesiumGlobe/CesiumGlobe.tsx src/styles/globe.css
git commit -m "refactor(globe): move toolbar into left grid slot"
```

---

### Task 6: Move events panel and info panel into `right` slot

**Files:**
- Modify: `src/components/islands/CesiumGlobe/CesiumGlobe.tsx:551-569,642-654`
- Modify: `src/styles/globe.css:359-371,564-568,609-624`

- [ ] **Step 1: Wrap info panel, entity panel, and events panel in a single `right` slot div**

In `CesiumGlobe.tsx`, the info panel (lines 551-569) and events panel (lines 642-654) are currently separate siblings. Replace both blocks with a single `right` slot wrapper:

Find the info panel block:
```tsx
      {/* Info panel — close events panel when a point is selected */}
      {selectedPoint && (
        <CesiumInfoPanel point={selectedPoint} onClose={() => setSelectedPoint(null)} />
      )}

      {/* Generic entity info panel (flights, ships, satellites) */}
      {selectedEntity && !selectedPoint && (
        <div className="globe-info-panel">
          <button className="globe-info-close" onClick={() => setSelectedEntity(null)} aria-label="Close info panel">
            &times;
          </button>
          <div className="globe-info-title">{selectedEntity.name}</div>
          {selectedEntity.description && (
            <pre className="globe-info-body" style={{ whiteSpace: 'pre-wrap', margin: '0.5rem 0 0', fontSize: '0.75rem', opacity: 0.85 }}>
              {selectedEntity.description}
            </pre>
          )}
        </div>
      )}
```

Replace with:

```tsx
      {/* Info panel — close events panel when a point is selected */}
      {selectedPoint && (
        <div className="globe-slot globe-slot--right">
          <CesiumInfoPanel point={selectedPoint} onClose={() => setSelectedPoint(null)} />
        </div>
      )}

      {/* Generic entity info panel (flights, ships, satellites) */}
      {selectedEntity && !selectedPoint && (
        <div className="globe-slot globe-slot--right">
          <div className="globe-info-panel">
            <button className="globe-info-close" onClick={() => setSelectedEntity(null)} aria-label="Close info panel">
              &times;
            </button>
            <div className="globe-info-title">{selectedEntity.name}</div>
            {selectedEntity.description && (
              <pre className="globe-info-body" style={{ whiteSpace: 'pre-wrap', margin: '0.5rem 0 0', fontSize: '0.75rem', opacity: 0.85 }}>
                {selectedEntity.description}
              </pre>
            )}
          </div>
        </div>
      )}
```

Find the events panel block:
```tsx
      {/* Events / Intel feed panel */}
      <CesiumEventsPanel
        events={events}
        currentDate={currentDate}
        isOpen={eventsOpen}
        onToggle={() => { ... }}
        activeEventId={cinematicMode ? cinematicEventId : undefined}
      />
```

Replace with:

```tsx
      {/* Events / Intel feed panel */}
      <div className="globe-slot globe-slot--right">
        <CesiumEventsPanel
          events={events}
          currentDate={currentDate}
          isOpen={eventsOpen}
          onToggle={() => {
            setEventsOpen(prev => {
              if (!prev) setSelectedPoint(null);
              return !prev;
            });
          }}
          activeEventId={cinematicMode ? cinematicEventId : undefined}
        />
      </div>
```

- [ ] **Step 2: Remove fixed positioning from panel CSS classes in globe.css**

Replace `.globe-info-panel` (lines 359-371):
```css
.globe-info-panel {
  position: fixed;
  top: 60px;
  right: 12px;
  z-index: 100;
  width: 280px;
  background: rgba(10, 11, 14, 0.92);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 16px;
  animation: slideInRight 0.25s ease-out;
}
```

with:
```css
.globe-info-panel {
  width: 280px;
  background: rgba(10, 11, 14, 0.92);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 16px;
  animation: slideInRight 0.25s ease-out;
}
```

Replace `.globe-events-toggle` (lines 564-568):
```css
.globe-events-toggle {
  position: fixed;
  top: 60px;
  right: 12px;
  z-index: 100;
```

with:
```css
.globe-events-toggle {
```

(Keep remaining properties: `background`, `backdrop-filter`, `border`, `border-radius`, `color`, `font-size`, `padding`, `cursor`, `display`, `align-items`, `gap`, `transition`.)

Replace `.globe-events-panel` (lines 609-624):
```css
.globe-events-panel {
  position: fixed;
  top: 60px;
  right: 12px;
  width: 340px;
  max-height: calc(100vh - 200px);
  background: rgba(10, 11, 14, 0.92);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: panelSlideIn 0.3s ease;
}
```

with:
```css
.globe-events-panel {
  width: 340px;
  max-height: calc(100vh - 200px);
  background: rgba(10, 11, 14, 0.92);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: panelSlideIn 0.3s ease;
}
```

- [ ] **Step 3: Update mobile override in globe.css**

In the `@media (max-width: 768px)` block (lines 959-1007), the `.globe-events-panel`, `.globe-events-toggle` are already hidden via the grid slot (`globe-slot--right` gets `display: none`). Remove these from the explicit mobile hide rule:

Replace:
```css
  .globe-toolbar,
  .globe-events-panel,
  .globe-events-toggle,
  .globe-kpi-strip,
  .hud-overlay {
    display: none !important;
  }
```

with:
```css
  .hud-overlay {
    display: none !important;
  }
```

The toolbar, events panel, events toggle, and KPI strip are now hidden by the grid slot `display: none` rules in `globe-layout.css`. The `.hud-overlay` remains because it's a full-viewport element outside the grid.

Also update the mobile info panel override. Replace:
```css
  .globe-info-panel {
    top: auto;
    bottom: 100px;
    right: 8px;
    left: 8px;
    width: auto;
    z-index: 95;
  }
```

with:
```css
  .globe-info-panel {
    width: auto;
  }
```

The info panel is inside `.globe-slot--right` which is hidden on mobile. If it needs to show on mobile in the future, its slot visibility can be toggled. For now it matches existing behavior (hidden on mobile).

- [ ] **Step 4: Build and verify**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/CesiumGlobe/CesiumGlobe.tsx src/styles/globe.css
git commit -m "refactor(globe): move events/info panels into right grid slot"
```

---

### Task 7: Move UnifiedTimelineBar into `bottom` slot

**Files:**
- Modify: `src/components/islands/CesiumGlobe/CesiumGlobe.tsx:571-592`
- Modify: `src/styles/unified-timeline.css:19-28`

- [ ] **Step 1: Wrap UnifiedTimelineBar in a slot div in CesiumGlobe.tsx**

In `src/components/islands/CesiumGlobe/CesiumGlobe.tsx`, wrap the timeline block (lines 571-592):

```tsx
      {/* Enhanced Timeline — always rendered */}
      <UnifiedTimelineBar
        context="3d"
        ...props...
      />
```

with:

```tsx
      {/* Enhanced Timeline — always rendered */}
      <div className="globe-slot globe-slot--bottom">
        <UnifiedTimelineBar
          context="3d"
          ...props...
        />
      </div>
```

Keep all existing props on UnifiedTimelineBar unchanged.

- [ ] **Step 2: Remove fixed positioning from `[data-context="3d"]` in unified-timeline.css**

In `src/styles/unified-timeline.css`, replace lines 19-28:

```css
.utl-bar[data-context="3d"] {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 900px;
  z-index: 20;
  border-radius: 10px;
}
```

with:

```css
.utl-bar[data-context="3d"] {
  width: 100%;
  border-radius: 10px;
}
```

The slot `.globe-slot--bottom` handles centering, max-width (900px), and 90% width. The timeline just fills its slot.

- [ ] **Step 3: Build and verify**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/islands/CesiumGlobe/CesiumGlobe.tsx src/styles/unified-timeline.css
git commit -m "refactor(globe): move timeline bar into bottom grid slot"
```

---

### Task 8: Split MissionHUD into three slot-targeted components

**Files:**
- Create: `src/components/islands/CesiumGlobe/MissionIdentity.tsx`
- Create: `src/components/islands/CesiumGlobe/MissionTelemetry.tsx`
- Create: `src/components/islands/CesiumGlobe/MissionPhaseBar.tsx`
- Delete: `src/components/islands/CesiumGlobe/MissionHUD.tsx`

- [ ] **Step 1: Create `MissionIdentity.tsx`**

This is the top-left panel from MissionHUD (vehicle name, phase, MET, TRACK button), now targeting the `left-aux` slot.

```tsx
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { TelemetryState } from './mission-helpers';
import { formatMET } from './mission-helpers';

interface Props {
  telemetryRef: MutableRefObject<TelemetryState>;
  vehicle: string;
  onTrackSpacecraft?: () => void;
}

const panelStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.75)',
  border: '1px solid #333',
  borderRadius: 6,
  padding: '8px 14px',
  fontFamily: "'JetBrains Mono', monospace",
};

export default function MissionIdentity({ telemetryRef, vehicle, onTrackSpacecraft }: Props) {
  const rafRef = useRef<number>(0);
  const phaseRef = useRef<HTMLDivElement>(null);
  const metRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => {
      const t = telemetryRef.current;
      if (phaseRef.current) phaseRef.current.textContent = t.currentPhase?.label ?? 'Pre-Launch';
      if (metRef.current) metRef.current.textContent = `MET ${formatMET(t.metSeconds)}`;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [telemetryRef]);

  return (
    <div style={panelStyle}>
      <div style={{ color: '#4ade80', fontWeight: 'bold', fontSize: 15 }}>{vehicle}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
        <div ref={phaseRef} style={{ color: '#ccc', fontSize: 12 }}>Pre-Launch</div>
      </div>
      <div ref={metRef} style={{ color: '#888', fontSize: 11, marginTop: 4 }}>MET 00:00:00:00</div>
      {onTrackSpacecraft && (
        <button
          onClick={onTrackSpacecraft}
          style={{
            marginTop: 6, padding: '4px 10px', fontSize: 10,
            background: 'rgba(74, 222, 128, 0.15)', border: '1px solid #4ade80',
            borderRadius: 4, color: '#4ade80', cursor: 'pointer',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          TRACK ORION
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `MissionTelemetry.tsx`**

This is the top-right panel from MissionHUD (altitude, velocity, distance to Moon), now targeting the `right-aux` slot.

```tsx
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { TelemetryState } from './mission-helpers';
import { formatDistance, formatVelocity } from './mission-helpers';

interface Props {
  telemetryRef: MutableRefObject<TelemetryState>;
}

const panelStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.75)',
  border: '1px solid #333',
  borderRadius: 6,
  padding: '8px 14px',
  fontFamily: "'JetBrains Mono', monospace",
  textAlign: 'right',
};

export default function MissionTelemetry({ telemetryRef }: Props) {
  const rafRef = useRef<number>(0);
  const altRef = useRef<HTMLDivElement>(null);
  const velRef = useRef<HTMLDivElement>(null);
  const moonDistRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => {
      const t = telemetryRef.current;
      if (altRef.current) altRef.current.textContent = formatDistance(t.altitudeKm);
      if (velRef.current) velRef.current.textContent = formatVelocity(t.velocityKmS);
      if (moonDistRef.current) moonDistRef.current.textContent = formatDistance(t.distToMoonKm);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [telemetryRef]);

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 10, color: '#60a5fa', textTransform: 'uppercase' }}>Altitude</div>
      <div ref={altRef} style={{ fontSize: 16, color: '#fff', marginBottom: 4 }}>0 km</div>
      <div style={{ fontSize: 10, color: '#f59e0b', textTransform: 'uppercase' }}>Velocity</div>
      <div ref={velRef} style={{ fontSize: 16, color: '#fff', marginBottom: 4 }}>0 m/s</div>
      <div style={{ fontSize: 10, color: '#a78bfa', textTransform: 'uppercase' }}>Distance to Moon</div>
      <div ref={moonDistRef} style={{ fontSize: 16, color: '#fff' }}>0 km</div>
    </div>
  );
}
```

- [ ] **Step 3: Create `MissionPhaseBar.tsx`**

This is the bottom panel from MissionHUD (phase timeline), now targeting the `bottom-aux` slot. Also includes mobile compact mode.

```tsx
import { useEffect, useRef, type MutableRefObject } from 'react';
import type { TelemetryState } from './mission-helpers';
import { formatMET, formatDistance, formatVelocity } from './mission-helpers';
import type { MissionPhase } from '../../../lib/schemas';

interface Props {
  telemetryRef: MutableRefObject<TelemetryState>;
  vehicle: string;
  phases: MissionPhase[];
  onTrackSpacecraft?: () => void;
}

const panelStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.75)',
  border: '1px solid #333',
  borderRadius: 6,
  padding: '8px 14px',
  fontFamily: "'JetBrains Mono', monospace",
};

export default function MissionPhaseBar({ telemetryRef, vehicle, phases, onTrackSpacecraft }: Props) {
  const rafRef = useRef<number>(0);
  const progressRef = useRef<HTMLDivElement>(null);
  // Mobile compact refs
  const compactPhaseRef = useRef<HTMLSpanElement>(null);
  const compactAltRef = useRef<HTMLSpanElement>(null);
  const compactVelRef = useRef<HTMLSpanElement>(null);

  const totalDuration = phases.reduce((sum, p) => {
    return sum + (new Date(p.end).getTime() - new Date(p.start).getTime());
  }, 0);

  useEffect(() => {
    const tick = () => {
      const t = telemetryRef.current;
      if (progressRef.current) progressRef.current.style.width = `${(t.overallProgress * 100).toFixed(1)}%`;
      if (compactPhaseRef.current) compactPhaseRef.current.textContent = t.currentPhase?.label ?? 'Pre-Launch';
      if (compactAltRef.current) compactAltRef.current.textContent = formatDistance(t.altitudeKm);
      if (compactVelRef.current) compactVelRef.current.textContent = formatVelocity(t.velocityKmS);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [telemetryRef]);

  return (
    <>
      {/* Desktop: full phase timeline */}
      <div className="mission-phase-bar--desktop" style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 10 }}>
          {phases.map((phase) => {
            const phaseDur = new Date(phase.end).getTime() - new Date(phase.start).getTime();
            const widthPct = (phaseDur / totalDuration) * 100;
            return (
              <div key={phase.id} style={{
                width: `${widthPct}%`, textAlign: 'center', color: '#888',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {phase.label}
              </div>
            );
          })}
        </div>
        <div style={{ height: 4, background: '#222', borderRadius: 2 }}>
          <div ref={progressRef} style={{
            height: 4, borderRadius: 2, width: '0%',
            background: 'linear-gradient(90deg, #4ade80, #60a5fa, #f59e0b, #a78bfa)',
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* Mobile: compact single-row strip */}
      <div className="mission-phase-bar--mobile" style={{
        ...panelStyle,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 11,
      }}>
        <span style={{ color: '#4ade80', fontWeight: 'bold' }}>{vehicle}</span>
        <span ref={compactPhaseRef} style={{ color: '#ccc' }}>Pre-Launch</span>
        <span style={{ color: '#555' }}>|</span>
        <span style={{ color: '#60a5fa', fontSize: 10 }}>ALT</span>
        <span ref={compactAltRef} style={{ color: '#fff' }}>0 km</span>
        <span style={{ color: '#555' }}>|</span>
        <span style={{ color: '#f59e0b', fontSize: 10 }}>VEL</span>
        <span ref={compactVelRef} style={{ color: '#fff' }}>0 m/s</span>
        {onTrackSpacecraft && (
          <button
            onClick={onTrackSpacecraft}
            style={{
              marginLeft: 'auto', padding: '2px 8px', fontSize: 9,
              background: 'rgba(74, 222, 128, 0.15)', border: '1px solid #4ade80',
              borderRadius: 4, color: '#4ade80', cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            TRACK
          </button>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Add mobile visibility rules for the phase bar variants to `globe-layout.css`**

Append to `src/styles/globe-layout.css`, before the closing of the file:

```css
/* ── Mission phase bar responsive ── */
.mission-phase-bar--mobile { display: none; }

@media (max-width: 768px) {
  .mission-phase-bar--desktop { display: none; }
  .mission-phase-bar--mobile  { display: flex; }
}
```

- [ ] **Step 5: Delete `MissionHUD.tsx`**

Run: `rm src/components/islands/CesiumGlobe/MissionHUD.tsx`

- [ ] **Step 6: Build to verify the new files compile (will fail on CesiumGlobe.tsx import — expected)**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Error about missing MissionHUD import in CesiumGlobe.tsx. This is expected and will be fixed in Task 9.

- [ ] **Step 7: Commit the new components (before wiring them up)**

```bash
git add src/components/islands/CesiumGlobe/MissionIdentity.tsx \
        src/components/islands/CesiumGlobe/MissionTelemetry.tsx \
        src/components/islands/CesiumGlobe/MissionPhaseBar.tsx \
        src/styles/globe-layout.css
git rm src/components/islands/CesiumGlobe/MissionHUD.tsx
git commit -m "refactor(globe): split MissionHUD into Identity, Telemetry, PhaseBar components"
```

---

### Task 9: Wire new mission components into CesiumGlobe.tsx

**Files:**
- Modify: `src/components/islands/CesiumGlobe/CesiumGlobe.tsx:42-43,532-539`

- [ ] **Step 1: Update imports in CesiumGlobe.tsx**

Replace:
```tsx
import { useLunarMission } from './useLunarMission';
import MissionHUD from './MissionHUD';
import type { MissionTrajectory } from '../../../lib/schemas';
```

with:
```tsx
import { useLunarMission } from './useLunarMission';
import MissionIdentity from './MissionIdentity';
import MissionTelemetry from './MissionTelemetry';
import MissionPhaseBar from './MissionPhaseBar';
import type { MissionTrajectory } from '../../../lib/schemas';
```

- [ ] **Step 2: Replace MissionHUD rendering with slotted components**

In CesiumGlobe.tsx, find the MissionHUD block (lines 531-539):
```tsx
      {/* Mission telemetry HUD */}
      {missionTrajectory && (
        <MissionHUD
          telemetryRef={telemetryRef}
          vehicle={missionTrajectory.vehicle}
          phases={missionTrajectory.phases}
          onTrackSpacecraft={trackSpacecraft}
        />
      )}
```

Replace with:
```tsx
      {/* Mission telemetry — slotted into auxiliary grid areas */}
      {missionTrajectory && (
        <>
          <div className="globe-slot globe-slot--left-aux">
            <MissionIdentity
              telemetryRef={telemetryRef}
              vehicle={missionTrajectory.vehicle}
              onTrackSpacecraft={trackSpacecraft}
            />
          </div>
          <div className="globe-slot globe-slot--right-aux">
            <MissionTelemetry telemetryRef={telemetryRef} />
          </div>
          <div className="globe-slot globe-slot--bottom-aux">
            <MissionPhaseBar
              telemetryRef={telemetryRef}
              vehicle={missionTrajectory.vehicle}
              phases={missionTrajectory.phases}
              onTrackSpacecraft={trackSpacecraft}
            />
          </div>
        </>
      )}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/islands/CesiumGlobe/CesiumGlobe.tsx
git commit -m "feat(globe): wire mission components into auxiliary grid slots"
```

---

### Task 10: Clean up remaining z-index and positioning artifacts

**Files:**
- Modify: `src/styles/globe.css`

- [ ] **Step 1: Audit and remove stale z-index declarations**

Search `src/styles/globe.css` for any remaining `z-index` declarations on elements that are now inside grid slots. The following should have had their z-index removed in earlier tasks. Verify and clean up any that were missed:

- `.globe-back-link` — should have no `position: fixed` or `z-index`
- `.globe-about-link` — should have no `position: fixed` or `z-index`
- `.globe-header` — should have no `position: fixed` or `z-index`
- `.globe-kpi-strip` — should have no `position: fixed` or `z-index`
- `.globe-toolbar` — should have no `position: fixed` or `z-index`
- `.globe-info-panel` — should have no `position: fixed` or `z-index`
- `.globe-events-toggle` — should have no `position: fixed` or `z-index`
- `.globe-events-panel` — should have no `position: fixed` or `z-index`

Elements that keep their positioning (outside the grid):
- `.hud-overlay` — keeps `position: fixed; z-index: 85` (full viewport, outside grid)
- `.cinematic-overlay` — keeps `position: fixed; z-index: 20` (full viewport, outside grid)

- [ ] **Step 2: Build and verify**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/styles/globe.css
git commit -m "chore(globe): clean up stale z-index and positioning artifacts"
```

---

### Task 11: Visual verification across trackers

**Files:** None (verification only)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify Iran Conflict globe (default tracker, no mission HUD)**

Open `http://localhost:4321/watchboard/iran-conflict/globe/` in a browser. Verify:
- Back link and About link visible in top-left
- Globe header centered at top
- KPI cards visible in top-right
- Toolbar icons on the left (filter, camera, visual, layers)
- Events panel toggleable on the right
- Timeline bar at the bottom, centered
- No overlapping elements
- Toolbar flyouts open without being clipped

- [ ] **Step 3: Verify Artemis 2 globe (with mission HUD)**

Open `http://localhost:4321/watchboard/artemis-2/globe/` in a browser. Verify:
- MissionIdentity panel visible in left-aux (below toolbar, not overlapping it)
- MissionTelemetry panel visible in right-aux (not overlapping KPIs or events toggle)
- MissionPhaseBar visible above the timeline bar (not overlapping it)
- All default controls still accessible: toolbar, KPIs, events, timeline
- TRACK ORION button is clickable

- [ ] **Step 4: Verify mobile layout**

Use browser DevTools responsive mode at 375px width. Verify:
- Toolbar, KPIs, events panel, left-aux, right-aux all hidden
- Globe header visible at top
- On Artemis 2: mobile compact mission strip visible above timeline
- Timeline bar functional at bottom

- [ ] **Step 5: Verify cinematic mode on Iran Conflict globe**

Click the cinematic mode button in the toolbar. Verify the cinematic overlay (shot counter + label) is visible and not blocked by any grid element.

- [ ] **Step 6: Stop dev server, commit any fixes if needed**

If any visual issues were found, fix them and commit before proceeding.
