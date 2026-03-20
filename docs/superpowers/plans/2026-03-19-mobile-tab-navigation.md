# Mobile Tab Navigation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scroll-based 2D mobile layout and the 3D MobileBottomSheet with a unified app-like tab navigation (MAP / FEED / DATA / INTEL) that works across both 2D and 3D views.

**Architecture:** A single `MobileTabShell` React island wraps all mobile content. It renders a fixed header (with 2D/3D toggle), fixed bottom tab bar, and switches between tab content components. The MAP tab keeps the map mounted (hidden when inactive) to preserve Leaflet/Cesium state. Other tabs unmount when inactive. The desktop layout remains unchanged — both layouts render in the HTML, CSS media queries show the correct one.

**Tech Stack:** React 18, TypeScript, Astro 5, CSS custom properties

**Spec:** `docs/superpowers/specs/2026-03-19-mobile-unified-dashboard-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/components/islands/mobile/MobileTabShell.tsx` | Main shell: header, tab bar, tab switching, shared state |
| Create | `src/components/islands/mobile/MobileHeader.tsx` | Fixed header with live dot, operation name, 2D/3D toggle |
| Create | `src/components/islands/mobile/MobileTabBar.tsx` | Fixed bottom tab bar (MAP/FEED/DATA/INTEL) |
| Create | `src/components/islands/mobile/MobileMapTab.tsx` | MAP tab: full-viewport map + UnifiedTimelineBar |
| Create | `src/components/islands/mobile/MobileFeedTab.tsx` | FEED tab: situation brief + latest event cards |
| Create | `src/components/islands/mobile/MobileDataTab.tsx` | DATA tab: sub-tabbed casualties/economic/military |
| Create | `src/components/islands/mobile/MobileIntelTab.tsx` | INTEL tab: sub-tabbed claims/political/timeline |
| Create | `src/styles/mobile-tabs.css` | All `mtab-*` styles + media query overrides |
| Modify | `src/pages/[tracker]/index.astro` | Add MobileTabShell alongside desktop layout |
| Modify | `src/pages/[tracker]/globe.astro` | Add mobile redirect to `?mode=3d` |
| Delete | `src/components/islands/CesiumGlobe/MobileBottomSheet.tsx` | Replaced by MobileTabShell |
| Modify | `src/components/islands/CesiumGlobe/CesiumGlobe.tsx` | Remove MobileBottomSheet import/usage |
| Modify | `src/styles/globe.css` | Remove `.mobile-sheet-*` CSS |

---

## Chunk 1: Core Shell + Tab Bar + CSS

### Task 1: Create mobile-tabs.css

**Files:**
- Create: `src/styles/mobile-tabs.css`

- [ ] **Step 1: Create the mobile tab CSS file**

This file defines all `mtab-*` styles plus the media query rules that toggle between desktop and mobile layouts.

Key CSS rules:
- `.mtab-shell` — full viewport container, `display: flex; flex-direction: column; height: 100vh; height: 100dvh;`
- `.mtab-header` — fixed top, 44px height, `position: fixed; top: 0; z-index: 100`
- `.mtab-toggle` — 2D/3D segmented control
- `.mtab-bar` — fixed bottom tab bar, `position: fixed; bottom: 0; z-index: 100; padding-bottom: env(safe-area-inset-bottom, 0px);`
- `.mtab-tab` — individual tab (icon + label), `role="tab"`, min-height 52px
- `.mtab-content` — scrollable content area, `padding-top: 44px; padding-bottom: 52px; flex: 1; overflow-y: auto;`
- `.mtab-subtabs` — sub-tab row for DATA/INTEL
- `.mtab-kpi-row` — compact inline KPI strip
- `.mtab-event-card` — event card in FEED tab
- `.mtab-badge` — notification badge

Media queries at the bottom:
```css
/* Phone: always show mobile, hide desktop */
@media (max-width: 768px) {
  .desktop-layout { display: none !important; }
  .mobile-layout { display: block !important; }
}
/* Tablet: respect user preference */
@media (min-width: 769px) and (max-width: 1024px) {
  body[data-mobile-mode="reader"] .desktop-layout { display: block !important; }
  body[data-mobile-mode="reader"] .mobile-layout { display: none !important; }
  body[data-mobile-mode="app"] .desktop-layout { display: none !important; }
  body[data-mobile-mode="app"] .mobile-layout { display: block !important; }
}
/* Desktop: always show desktop, hide mobile */
@media (min-width: 1025px) {
  .mobile-layout { display: none !important; }
}
```

Read `src/styles/globe.css` for the existing `.mobile-sheet-*` styles (around lines 830-860) as reference for the dark theme color palette and spacing conventions. Use the same CSS custom properties (`--bg-primary`, `--bg-secondary`, `--accent-red`, etc.) from `src/styles/global.css`.

- [ ] **Step 2: Commit**

```bash
git add src/styles/mobile-tabs.css
git commit -m "feat: create mobile-tabs.css with mtab-* namespace and media queries"
```

---

### Task 2: Create MobileHeader + MobileTabBar components

**Files:**
- Create: `src/components/islands/mobile/MobileHeader.tsx`
- Create: `src/components/islands/mobile/MobileTabBar.tsx`

- [ ] **Step 1: Create the mobile directory**

```bash
mkdir -p src/components/islands/mobile
```

- [ ] **Step 2: Create MobileHeader.tsx**

```typescript
// src/components/islands/mobile/MobileHeader.tsx
import type { Meta } from '../../../lib/schemas';

interface Props {
  meta: Meta;
  mapMode: '2d' | '3d';
  onToggleMapMode: () => void;
  globeEnabled?: boolean;
  isHistorical?: boolean;
}

export default function MobileHeader({ meta, mapMode, onToggleMapMode, globeEnabled, isHistorical }: Props) {
  return (
    <header className="mtab-header">
      <div className="mtab-header-left">
        {!isHistorical && <span className="mtab-live-dot" />}
        <span className="mtab-op-name">{meta.operationName}</span>
      </div>
      {globeEnabled && (
        <div className="mtab-toggle" role="radiogroup" aria-label="Map mode">
          <button
            className={`mtab-toggle-btn ${mapMode === '2d' ? 'active' : ''}`}
            onClick={() => mapMode !== '2d' && onToggleMapMode()}
            role="radio"
            aria-checked={mapMode === '2d'}
          >
            2D
          </button>
          <button
            className={`mtab-toggle-btn ${mapMode === '3d' ? 'active' : ''}`}
            onClick={() => mapMode !== '3d' && onToggleMapMode()}
            role="radio"
            aria-checked={mapMode === '3d'}
          >
            3D
          </button>
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 3: Create MobileTabBar.tsx**

```typescript
// src/components/islands/mobile/MobileTabBar.tsx

export type MobileTab = 'map' | 'feed' | 'data' | 'intel';

interface Props {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  feedBadge?: number;
}

const TABS: { id: MobileTab; icon: string; label: string }[] = [
  { id: 'map', icon: '◎', label: 'MAP' },
  { id: 'feed', icon: '◉', label: 'FEED' },
  { id: 'data', icon: '▤', label: 'DATA' },
  { id: 'intel', icon: '☷', label: 'INTEL' },
];

export default function MobileTabBar({ activeTab, onTabChange, feedBadge }: Props) {
  return (
    <nav className="mtab-bar" role="tablist" aria-label="Dashboard sections">
      {TABS.map(tab => (
        <button
          key={tab.id}
          className={`mtab-tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`tabpanel-${tab.id}`}
        >
          <span className="mtab-tab-icon">{tab.icon}</span>
          <span className="mtab-tab-label">{tab.label}</span>
          {tab.id === 'feed' && feedBadge != null && feedBadge > 0 && (
            <span className="mtab-badge">{feedBadge}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Verify compilation**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/mobile/
git commit -m "feat: create MobileHeader and MobileTabBar components"
```

---

### Task 3: Create MobileTabShell

**Files:**
- Create: `src/components/islands/mobile/MobileTabShell.tsx`

This is the main orchestrator. It manages shared state (activeTab, mapMode, timeline state) and renders header + tab bar + active tab content.

- [ ] **Step 1: Create MobileTabShell.tsx**

```typescript
// src/components/islands/mobile/MobileTabShell.tsx
import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import type { TrackerConfig } from '../../../lib/tracker-config';
import type { KpiItem, MapPoint, MapLine, CasualtyRow, EconItem, Claim, PolItem, StrikeItem, Asset, Meta } from '../../../lib/schemas';
import type { FlatEvent } from '../../../lib/timeline-utils';
import type { TimelineEra } from '../../../lib/schemas';
import type { MapCategory } from '../../../lib/map-utils';
import MobileHeader from './MobileHeader';
import MobileTabBar, { type MobileTab } from './MobileTabBar';
import MobileFeedTab from './MobileFeedTab';
import MobileDataTab from './MobileDataTab';
import MobileIntelTab from './MobileIntelTab';

// Lazy-load the map tab (contains Leaflet, potentially Cesium)
const MobileMapTab = lazy(() => import('./MobileMapTab'));

interface Props {
  // Tracker config
  config: TrackerConfig;
  // Data slices
  kpis: KpiItem[];
  meta: Meta;
  mapPoints: MapPoint[];
  mapLines: MapLine[];
  events: FlatEvent[];
  categories: MapCategory[];
  timeline: TimelineEra[];
  strikeTargets: StrikeItem[];
  retaliationData: StrikeItem[];
  assetsData: Asset[];
  casualties: CasualtyRow[];
  econ: EconItem[];
  claims: Claim[];
  political: PolItem[];
  // Initial state
  initialMapMode?: '2d' | '3d';
}

export default function MobileTabShell({ config, kpis, meta, mapPoints, mapLines, events, categories, timeline, strikeTargets, retaliationData, assetsData, casualties, econ, claims, political, initialMapMode = '2d' }: Props) {
  const [activeTab, setActiveTab] = useState<MobileTab>('map');
  const [mapMode, setMapMode] = useState<'2d' | '3d'>(initialMapMode);

  const toggleMapMode = useCallback(() => {
    setMapMode(prev => prev === '2d' ? '3d' : '2d');
  }, []);

  // Count events for latest date (for feed badge)
  const latestDate = useMemo(() => {
    const dates = events.map(e => e.resolvedDate).sort();
    return dates[dates.length - 1] || '';
  }, [events]);

  const feedBadge = useMemo(
    () => events.filter(e => e.resolvedDate === latestDate).length,
    [events, latestDate],
  );

  return (
    <div className="mtab-shell">
      <MobileHeader
        meta={meta}
        mapMode={mapMode}
        onToggleMapMode={toggleMapMode}
        globeEnabled={config.globe?.enabled}
        isHistorical={config.temporal === 'historical'}
      />

      {/* Tab content — MAP stays mounted (hidden), others unmount */}
      <div className="mtab-content">
        <div
          id="tabpanel-map"
          role="tabpanel"
          aria-labelledby="tab-map"
          style={{ display: activeTab === 'map' ? 'block' : 'none', height: '100%' }}
        >
          <Suspense fallback={<div className="mtab-loading">Loading map...</div>}>
            <MobileMapTab
              mode={mapMode}
              points={mapPoints}
              lines={mapLines}
              events={events}
              categories={categories}
              kpis={kpis}
              config={config}
            />
          </Suspense>
        </div>

        {activeTab === 'feed' && (
          <div id="tabpanel-feed" role="tabpanel" aria-labelledby="tab-feed">
            <MobileFeedTab meta={meta} events={events} />
          </div>
        )}

        {activeTab === 'data' && (
          <div id="tabpanel-data" role="tabpanel" aria-labelledby="tab-data">
            <MobileDataTab
              kpis={kpis}
              casualties={casualties}
              econ={econ}
              strikeTargets={strikeTargets}
              retaliationData={retaliationData}
              assetsData={assetsData}
              tabs={config.militaryTabs}
            />
          </div>
        )}

        {activeTab === 'intel' && (
          <div id="tabpanel-intel" role="tabpanel" aria-labelledby="tab-intel">
            <MobileIntelTab
              claims={claims}
              political={political}
              timeline={timeline}
              avatarLabels={config.politicalAvatars}
            />
          </div>
        )}
      </div>

      <MobileTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        feedBadge={feedBadge}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit 2>&1 | head -20
```

This will have errors because the tab content components don't exist yet. That's expected — they are created in Tasks 4-7.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/mobile/MobileTabShell.tsx
git commit -m "feat: create MobileTabShell orchestrator component"
```

---

## Chunk 2: Tab Content Components

### Task 4: Create MobileMapTab

**Files:**
- Create: `src/components/islands/mobile/MobileMapTab.tsx`

The MAP tab wraps the existing `IntelMap` component (2D) and provides the full-viewport map experience. 3D Cesium support is deferred — the initial implementation shows a placeholder when 3D is selected, since lazy-loading Cesium into the mobile shell is complex and can be a follow-up.

- [ ] **Step 1: Create MobileMapTab.tsx**

This wraps `IntelMap` from `../IntelMap` with a compact KPI row above it. The map fills the remaining viewport. The `UnifiedTimelineBar` is already rendered inside `IntelMap`.

```typescript
// src/components/islands/mobile/MobileMapTab.tsx
import type { MapPoint, MapLine, KpiItem } from '../../../lib/schemas';
import type { FlatEvent } from '../../../lib/timeline-utils';
import type { MapCategory } from '../../../lib/map-utils';
import type { TrackerConfig } from '../../../lib/tracker-config';
import IntelMap from '../IntelMap';

interface Props {
  mode: '2d' | '3d';
  points: MapPoint[];
  lines: MapLine[];
  events: FlatEvent[];
  categories: MapCategory[];
  kpis: KpiItem[];
  config: TrackerConfig;
}

export default function MobileMapTab({ mode, points, lines, events, categories, kpis, config }: Props) {
  return (
    <div className="mtab-map-tab">
      {/* Compact KPI row */}
      <div className="mtab-kpi-row">
        {kpis.slice(0, 5).map(k => (
          <span key={k.id} className={`mtab-kpi ${k.color}`}>
            <span className="mtab-kpi-val">{k.value}</span>
          </span>
        ))}
      </div>

      {/* Map */}
      {mode === '2d' ? (
        <div className="mtab-map-container">
          <IntelMap
            points={points}
            lines={lines}
            events={events}
            categories={categories}
            mapCenter={config.map?.center}
            mapBounds={config.map?.bounds}
          />
        </div>
      ) : (
        <div className="mtab-3d-placeholder">
          <p>3D Globe</p>
          <p className="mtab-3d-hint">Open the full 3D experience on desktop for the best viewing.</p>
          <a href={`/watchboard/${config.slug}/globe/`} className="mtab-3d-link">Open 3D Globe →</a>
        </div>
      )}
    </div>
  );
}
```

Note: Full Cesium integration in the mobile shell is deferred. The 2D/3D toggle on mobile shows 2D map by default. When 3D is selected, it links to the dedicated globe page. This avoids loading ~3MB of Cesium on mobile.

- [ ] **Step 2: Commit**

```bash
git add src/components/islands/mobile/MobileMapTab.tsx
git commit -m "feat: create MobileMapTab with compact KPI row and IntelMap"
```

---

### Task 5: Create MobileFeedTab

**Files:**
- Create: `src/components/islands/mobile/MobileFeedTab.tsx`

- [ ] **Step 1: Create MobileFeedTab.tsx**

The FEED tab shows the situation brief and latest events as expandable cards.

```typescript
// src/components/islands/mobile/MobileFeedTab.tsx
import { useState, useMemo } from 'react';
import type { Meta } from '../../../lib/schemas';
import type { FlatEvent } from '../../../lib/timeline-utils';

interface Props {
  meta: Meta;
  events: FlatEvent[];
}

const TYPE_COLORS: Record<string, string> = {
  military: '#e74c3c',
  diplomatic: '#3498db',
  humanitarian: '#f39c12',
  economic: '#2ecc71',
};

export default function MobileFeedTab({ meta, events }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Group events by date, most recent first
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, FlatEvent[]>();
    const sorted = [...events].sort((a, b) => b.resolvedDate.localeCompare(a.resolvedDate));
    for (const ev of sorted) {
      const existing = grouped.get(ev.resolvedDate) || [];
      existing.push(ev);
      grouped.set(ev.resolvedDate, existing);
    }
    return grouped;
  }, [events]);

  return (
    <div className="mtab-feed">
      {/* Situation Brief */}
      <div className="mtab-brief">
        <div className="mtab-brief-label">SITUATION BRIEF</div>
        <p className="mtab-brief-text">{meta.heroSubtitle}</p>
      </div>

      {/* Events by date */}
      {Array.from(eventsByDate.entries()).map(([date, dayEvents]) => (
        <div key={date} className="mtab-feed-day">
          <div className="mtab-feed-date">
            {new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', {
              timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
            })}
            <span className="mtab-feed-count">{dayEvents.length} events</span>
          </div>
          {dayEvents.map(ev => {
            const isExpanded = expandedId === `${ev.resolvedDate}-${ev.title}`;
            return (
              <button
                key={`${ev.resolvedDate}-${ev.title}`}
                className="mtab-event-card"
                onClick={() => setExpandedId(isExpanded ? null : `${ev.resolvedDate}-${ev.title}`)}
                style={{ borderLeftColor: TYPE_COLORS[ev.type] || '#888' }}
              >
                <div className="mtab-event-header">
                  <span className="mtab-event-type" style={{ color: TYPE_COLORS[ev.type] || '#888' }}>
                    {ev.type.toUpperCase()}
                  </span>
                  <span className="mtab-event-expand">{isExpanded ? '−' : '+'}</span>
                </div>
                <div className="mtab-event-title">{ev.title}</div>
                {isExpanded && ev.body && (
                  <div className="mtab-event-body">{ev.body}</div>
                )}
                {isExpanded && ev.sources && ev.sources.length > 0 && (
                  <div className="mtab-event-sources">
                    {ev.sources.map((s, i) => (
                      <span key={i} className={`source-chip t${s.tier}`}>
                        T{s.tier} · {s.name}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/islands/mobile/MobileFeedTab.tsx
git commit -m "feat: create MobileFeedTab with situation brief and event cards"
```

---

### Task 6: Create MobileDataTab

**Files:**
- Create: `src/components/islands/mobile/MobileDataTab.tsx`

- [ ] **Step 1: Create MobileDataTab.tsx**

Sub-tabbed view: CASUALTIES / ECONOMIC / MILITARY.

```typescript
// src/components/islands/mobile/MobileDataTab.tsx
import { useState } from 'react';
import type { KpiItem, CasualtyRow, EconItem, StrikeItem, Asset } from '../../../lib/schemas';
import type { Tab } from '../../../lib/tracker-config';

interface Props {
  kpis: KpiItem[];
  casualties: CasualtyRow[];
  econ: EconItem[];
  strikeTargets: StrikeItem[];
  retaliationData: StrikeItem[];
  assetsData: Asset[];
  tabs?: Tab[];
}

type DataSubTab = 'casualties' | 'economic' | 'military';

export default function MobileDataTab({ kpis, casualties, econ, strikeTargets, retaliationData, assetsData }: Props) {
  const [subTab, setSubTab] = useState<DataSubTab>('casualties');

  return (
    <div className="mtab-data">
      {/* Sub-tabs */}
      <div className="mtab-subtabs" role="tablist">
        {(['casualties', 'economic', 'military'] as DataSubTab[]).map(tab => (
          <button
            key={tab}
            className={`mtab-subtab ${subTab === tab ? 'active' : ''}`}
            onClick={() => setSubTab(tab)}
            role="tab"
            aria-selected={subTab === tab}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Casualties */}
      {subTab === 'casualties' && (
        <div className="mtab-data-panel" role="tabpanel">
          <div className="mtab-kpi-grid">
            {kpis.filter(k => k.id !== 'days_of_conflict').slice(0, 6).map(k => (
              <div key={k.id} className={`mtab-kpi-card ${k.color}`}>
                <div className="mtab-kpi-card-label">{k.label}</div>
                <div className="mtab-kpi-card-value">{k.value}</div>
                <div className="mtab-kpi-card-source">{k.source}</div>
              </div>
            ))}
          </div>
          {casualties.length > 0 && (
            <>
              <div className="mtab-section-label">BREAKDOWN</div>
              {casualties.map(row => (
                <div key={row.id} className="mtab-data-row">
                  <span className="mtab-data-row-label">{row.category}</span>
                  <span className="mtab-data-row-value">{row.killed || '—'}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Economic */}
      {subTab === 'economic' && (
        <div className="mtab-data-panel" role="tabpanel">
          {econ.map(item => (
            <div key={item.id} className="mtab-econ-card">
              <div className="mtab-econ-label">{item.label}</div>
              <div className={`mtab-econ-value ${item.color}`}>{item.value}</div>
              <div className={`mtab-econ-change ${item.direction}`}>
                {item.direction === 'up' ? '▲' : '▼'} {item.change}
              </div>
              <div className="mtab-econ-source">{item.source}</div>
            </div>
          ))}
        </div>
      )}

      {/* Military */}
      {subTab === 'military' && (
        <div className="mtab-data-panel" role="tabpanel">
          {strikeTargets.length > 0 && (
            <>
              <div className="mtab-section-label">STRIKE TARGETS</div>
              {strikeTargets.map(s => (
                <div key={s.id} className="mtab-strike-row">
                  <span className="mtab-strike-name">{s.name}</span>
                  <span className="mtab-strike-detail">{s.detail}</span>
                  <span className={`source-chip t${s.tier}`}>T{s.tier}</span>
                </div>
              ))}
            </>
          )}
          {retaliationData.length > 0 && (
            <>
              <div className="mtab-section-label">IRANIAN RETALIATION</div>
              {retaliationData.map(s => (
                <div key={s.id} className="mtab-strike-row">
                  <span className="mtab-strike-name">{s.name}</span>
                  <span className="mtab-strike-detail">{s.detail}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/islands/mobile/MobileDataTab.tsx
git commit -m "feat: create MobileDataTab with casualties/economic/military sub-tabs"
```

---

### Task 7: Create MobileIntelTab

**Files:**
- Create: `src/components/islands/mobile/MobileIntelTab.tsx`

- [ ] **Step 1: Create MobileIntelTab.tsx**

Sub-tabbed view: CLAIMS / POLITICAL / TIMELINE.

```typescript
// src/components/islands/mobile/MobileIntelTab.tsx
import { useState } from 'react';
import type { Claim, PolItem } from '../../../lib/schemas';
import type { TimelineEra } from '../../../lib/schemas';

interface Props {
  claims: Claim[];
  political: PolItem[];
  timeline: TimelineEra[];
  avatarLabels?: Record<string, string>;
}

type IntelSubTab = 'claims' | 'political' | 'timeline';

export default function MobileIntelTab({ claims, political, timeline, avatarLabels }: Props) {
  const [subTab, setSubTab] = useState<IntelSubTab>('political');

  return (
    <div className="mtab-intel">
      <div className="mtab-subtabs" role="tablist">
        {(['claims', 'political', 'timeline'] as IntelSubTab[]).map(tab => (
          <button
            key={tab}
            className={`mtab-subtab ${subTab === tab ? 'active' : ''}`}
            onClick={() => setSubTab(tab)}
            role="tab"
            aria-selected={subTab === tab}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Claims */}
      {subTab === 'claims' && (
        <div className="mtab-data-panel" role="tabpanel">
          {claims.map(c => (
            <div key={c.id} className="mtab-claim-card">
              <div className="mtab-claim-question">{c.question}</div>
              <div className="mtab-claim-sides">
                <div className="mtab-claim-side">
                  <span className="mtab-claim-side-label">{c.sideA.label}</span>
                  <p>{c.sideA.text}</p>
                </div>
                <div className="mtab-claim-side">
                  <span className="mtab-claim-side-label">{c.sideB.label}</span>
                  <p>{c.sideB.text}</p>
                </div>
              </div>
              <div className="mtab-claim-resolution">{c.resolution}</div>
            </div>
          ))}
        </div>
      )}

      {/* Political */}
      {subTab === 'political' && (
        <div className="mtab-data-panel" role="tabpanel">
          {political.map(p => (
            <div key={p.id} className="mtab-political-card">
              <div className="mtab-political-header">
                <div className="mtab-political-avatar">{p.initial}</div>
                <div className="mtab-political-info">
                  <div className="mtab-political-name">{p.name}</div>
                  <div className="mtab-political-role">{p.role}</div>
                </div>
                {avatarLabels?.[p.avatar] && (
                  <span className="mtab-political-badge">{avatarLabels[p.avatar]}</span>
                )}
              </div>
              <blockquote className="mtab-political-quote">"{p.quote}"</blockquote>
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      {subTab === 'timeline' && (
        <div className="mtab-data-panel" role="tabpanel">
          {timeline.map(era => (
            <div key={era.label} className="mtab-era">
              <div className="mtab-era-label">{era.label}</div>
              {era.events.map((ev, i) => (
                <div key={i} className="mtab-era-event">
                  <span className="mtab-era-date">{ev.date}</span>
                  <span className="mtab-era-title">{ev.title}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify all tab components compile**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/mobile/MobileIntelTab.tsx
git commit -m "feat: create MobileIntelTab with claims/political/timeline sub-tabs"
```

---

## Chunk 3: Page Integration + Cleanup

### Task 8: Integrate MobileTabShell into index.astro

**Files:**
- Modify: `src/pages/[tracker]/index.astro`
- Modify: `src/styles/global.css` (add CSS import)

- [ ] **Step 1: Add CSS import to global.css**

At the top of `src/styles/global.css`, add:
```css
@import './mobile-tabs.css';
```

- [ ] **Step 2: Modify index.astro to render both layouts**

In `src/pages/[tracker]/index.astro`:

1. Add MobileTabShell import at the top (after existing imports):
```typescript
import MobileTabShell from '../../components/islands/mobile/MobileTabShell';
```

2. Wrap the existing desktop content (from `<Header>` through `<Footer>`) in a `<div class="desktop-layout">`.

3. Add the mobile shell as a sibling `<div class="mobile-layout">` with `<MobileTabShell>`:

The modified template section should look like:
```astro
<BaseLayout ...>
  <!-- Desktop layout (hidden on mobile via CSS) -->
  <div class="desktop-layout">
    <Header ... />
    <main id="main-content">
      {config.sections.includes('hero') && <Hero meta={data.meta} />}
      {config.sections.includes('kpis') && <KpiStrip kpis={data.kpis} />}
      <div class="theater-layout">
        ...existing theater content...
      </div>
      <SourceLegend />
    </main>
    <Footer ... />
  </div>

  <!-- Mobile layout (hidden on desktop via CSS) -->
  <div class="mobile-layout">
    <MobileTabShell
      client:load
      config={config}
      kpis={data.kpis}
      meta={data.meta}
      mapPoints={data.mapPoints}
      mapLines={data.mapLines}
      events={flatEvents}
      categories={categories}
      timeline={data.timeline}
      strikeTargets={data.strikeTargets}
      retaliationData={data.retaliationData}
      assetsData={data.assetsData}
      casualties={data.casualties}
      econ={data.econ}
      claims={data.claims}
      political={data.political}
    />
  </div>
</BaseLayout>
```

Note: Use `client:load` (not `client:only`) so the shell SSRs a skeleton.

- [ ] **Step 3: Build and verify**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/[tracker]/index.astro src/styles/global.css
git commit -m "feat: integrate MobileTabShell into dashboard page with dual-layout"
```

---

### Task 9: Add globe.astro mobile redirect + cleanup MobileBottomSheet

**Files:**
- Modify: `src/pages/[tracker]/globe.astro`
- Modify: `src/components/islands/CesiumGlobe/CesiumGlobe.tsx`
- Delete: `src/components/islands/CesiumGlobe/MobileBottomSheet.tsx`
- Modify: `src/styles/globe.css`

- [ ] **Step 1: Add mobile redirect to globe.astro**

In `src/pages/[tracker]/globe.astro`, add a client-side redirect script in the `<head>` or before `</body>`:

```html
<script>
  if (window.innerWidth <= 768) {
    const slug = window.location.pathname.split('/').filter(Boolean).find((_, i, arr) => i === arr.length - 2) || '';
    window.location.replace(`/watchboard/${slug}/?mode=3d`);
  }
</script>
```

Actually, since this is Astro SSG, add the script inline in the globe page template. Read the existing `globe.astro` to find the right insertion point.

- [ ] **Step 2: Remove MobileBottomSheet from CesiumGlobe.tsx**

In `src/components/islands/CesiumGlobe/CesiumGlobe.tsx`:
1. Remove the `import MobileBottomSheet` line
2. Remove the `<MobileBottomSheet>` JSX usage
3. Remove any state/props that were only used by MobileBottomSheet (grep for `isMobileSheetOpen`, `sheetState`, etc.)

- [ ] **Step 3: Delete MobileBottomSheet.tsx**

```bash
rm src/components/islands/CesiumGlobe/MobileBottomSheet.tsx
```

- [ ] **Step 4: Remove `.mobile-sheet-*` CSS from globe.css**

Search for all `.mobile-sheet-*` rules in `src/styles/globe.css` and remove them:

```bash
grep -n 'mobile-sheet' src/styles/globe.css
```

Remove all matched rule blocks. Verify:
```bash
grep -c 'mobile-sheet' src/styles/globe.css
```
Expected: 0.

- [ ] **Step 5: Build and verify**

```bash
npm run build 2>&1 | tail -10
grep -r "MobileBottomSheet" src/ --include="*.tsx" --include="*.ts"
```

Expected: Build succeeds, no references to MobileBottomSheet remain.

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "refactor: remove MobileBottomSheet, add globe mobile redirect"
```

---

### Task 10: Visual verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify mobile view (resize browser to ≤768px)**

Open `http://localhost:4321/watchboard/iran-conflict/` at mobile width. Verify:
- Header shows live dot + operation name + 2D/3D toggle
- Tab bar fixed at bottom: MAP / FEED / DATA / INTEL
- MAP tab: compact KPIs + full map + UnifiedTimelineBar
- FEED tab: situation brief + event cards grouped by date
- DATA tab: sub-tabs (CASUALTIES/ECONOMIC/MILITARY), KPI grid, breakdown rows
- INTEL tab: sub-tabs (CLAIMS/POLITICAL/TIMELINE), political cards with quotes
- Tab bar never moves regardless of content

- [ ] **Step 3: Verify desktop view**

Open `http://localhost:4321/watchboard/iran-conflict/` at full width. Verify:
- Desktop theater layout unchanged
- No mobile tab bar visible
- All sections render as before

- [ ] **Step 4: Verify other trackers**

Open `http://localhost:4321/watchboard/ayotzinapa/` at mobile width — verify tabs work.
Open `http://localhost:4321/watchboard/september-11/` at mobile width — verify historical tracker (no live dot).

- [ ] **Step 5: Full build**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: address visual issues in mobile tab navigation"
```
