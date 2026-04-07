# Globe Click-to-Drill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Link the CesiumJS homepage globe and the GeoAccordion sidebar as a single bidirectional control in Geographic view mode — clicking a country polygon on the globe expands the matching accordion node and flies the camera there, while hovering a geographic node in the sidebar highlights the country polygon on the globe.

**Architecture:** Country boundary polygons are rendered on the globe via `globe.gl`'s polygon layer, sourced from a static Natural Earth 110m GeoJSON file fetched lazily when the user first enters Geographic mode. Tracker density per country is computed from `geoPath[0]` (ISO A2 codes) and drives polygon opacity as a heat map. New bidirectional state (`hoveredCountry`, `activeGeoPath`, `expandedKeys`) is lifted to `CommandCenter.tsx`, which passes it down to both `GlobePanel.tsx` and `GeoAccordion.tsx` (via `SidebarPanel.tsx`), keeping the two components in sync without direct coupling.

**Tech Stack:** globe.gl polygon layer API, Natural Earth 110m GeoJSON (static asset), React controlled-component pattern for `GeoAccordion`, existing `globeRef.flyTo()` for camera animation.

---

## Task 1 — Prepare the Natural Earth 110m GeoJSON static asset

**Files:**
- `public/geo/countries-110m.json` (new)

**Steps:**

1. Create the `public/geo/` directory:

```bash
mkdir -p /Users/artemiopadilla/Documents/repos/GitHub/personal/iran-conflict-tracker/public/geo
```

2. Download and strip the Natural Earth 110m GeoJSON. Use the canonical source from the `@geo-maps/countries-110m` npm package or naturalearthdata.com. The goal is a `FeatureCollection` with only `ISO_A2` and `NAME` properties per feature, at ~120 KB gzip.

```bash
cd /Users/artemiopadilla/Documents/repos/GitHub/personal/iran-conflict-tracker
npx tsx -e "
const res = await fetch('https://cdn.jsdelivr.net/npm/@geo-maps/countries-coastline-110m/map.geo.json');
const geo = await res.json();
// Strip to only ISO_A2 + NAME
for (const f of geo.features) {
  const iso = f.properties?.ISO_A2 || f.properties?.iso_a2 || f.id || '';
  const name = f.properties?.NAME || f.properties?.name || '';
  f.properties = { ISO_A2: iso, NAME: name };
}
const { writeFileSync } = await import('fs');
writeFileSync('public/geo/countries-110m.json', JSON.stringify(geo));
console.log('Features:', geo.features.length, 'Size:', JSON.stringify(geo).length, 'bytes');
"
```

If the CDN source above does not include ISO_A2, use this alternative:

```bash
npx tsx -e "
const res = await fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson');
const geo = await res.json();
for (const f of geo.features) {
  const iso = f.properties.ISO_A2 || '';
  const name = f.properties.NAME || '';
  f.properties = { ISO_A2: iso, NAME: name };
}
const { writeFileSync } = await import('fs');
writeFileSync('public/geo/countries-110m.json', JSON.stringify(geo));
console.log('Features:', geo.features.length, 'Size:', JSON.stringify(geo).length, 'bytes');
"
```

3. Verify the file is present and reasonably sized (should be ~180 features, 300-500 KB raw):

```bash
wc -c public/geo/countries-110m.json
npx tsx -e "
const geo = JSON.parse(require('fs').readFileSync('public/geo/countries-110m.json', 'utf8'));
console.log('Feature count:', geo.features.length);
console.log('Sample:', geo.features[0].properties);
const isoSet = new Set(geo.features.map((f: any) => f.properties.ISO_A2));
console.log('Unique ISO codes:', isoSet.size);
console.log('Has MX:', isoSet.has('MX'), 'Has UA:', isoSet.has('UA'), 'Has IR:', isoSet.has('IR'));
"
```

**Commit message:** `feat(globe): add Natural Earth 110m country boundaries GeoJSON`

---

## Task 2 — Compute country density map from tracker geoPath[0]

**Files:**
- `src/lib/geo-utils.ts` (edit)

**Steps:**

1. Add a `computeCountryDensity` function at the bottom of `src/lib/geo-utils.ts`:

```typescript
// in src/lib/geo-utils.ts, after the existing exports

/**
 * Compute a density map: ISO A2 country code → number of trackers
 * whose geoPath[0] matches that code.
 * Global trackers and those without geoPath are excluded.
 */
export function computeCountryDensity(trackers: TrackerCardData[]): Map<string, number> {
  const density = new Map<string, number>();
  for (const t of trackers) {
    if (t.region === 'global' || !t.geoPath || t.geoPath.length === 0) continue;
    const iso = t.geoPath[0];
    density.set(iso, (density.get(iso) ?? 0) + 1);
  }
  return density;
}
```

2. Verify it builds:

```bash
cd /Users/artemiopadilla/Documents/repos/GitHub/personal/iran-conflict-tracker && npx tsc --noEmit src/lib/geo-utils.ts 2>&1 | head -20
```

**Commit message:** `feat(geo): add computeCountryDensity utility for polygon heat map`

---

## Task 3 — Lift GeoAccordion expandedKeys to controlled mode

**Files:**
- `src/components/islands/CommandCenter/GeoAccordion.tsx` (edit)

**Steps:**

1. Extend the `Props` interface to support controlled mode and hover callbacks. In `src/components/islands/CommandCenter/GeoAccordion.tsx`, replace the existing `Props` interface:

```typescript
// Old:
interface Props {
  trackers: TrackerCardData[];
  basePath: string;
  activeTracker: string | null;
  onSelectTracker: (slug: string | null) => void;
  onHoverTracker: (slug: string | null) => void;
}

// New:
interface Props {
  trackers: TrackerCardData[];
  basePath: string;
  activeTracker: string | null;
  onSelectTracker: (slug: string | null) => void;
  onHoverTracker: (slug: string | null) => void;
  // Controlled expansion (optional — falls back to internal state when absent)
  expandedKeys?: Set<string>;
  onExpandedKeysChange?: (keys: Set<string>) => void;
  // Geo interaction callbacks
  onHoverGeoNode?: (nodeId: string, level: GeoNode['level']) => void;
  onLeaveGeoNode?: () => void;
  // Highlight path from globe click
  activeGeoPath?: string[] | null;
}
```

2. Update the `GeoAccordion` component to support controlled mode. Replace the internal `expandedKeys` state and `handleToggle`:

```typescript
// Old (inside GeoAccordion component body):
const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
// ...
const handleToggle = useCallback((key: string) => {
  setExpandedKeys(prev => {
    const next = new Set(prev);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    return next;
  });
}, []);

// New:
const [internalExpandedKeys, setInternalExpandedKeys] = useState<Set<string>>(new Set());

// Controlled vs uncontrolled
const isControlled = props.expandedKeys !== undefined;
const expandedKeys = isControlled ? props.expandedKeys! : internalExpandedKeys;
const setExpandedKeys = isControlled
  ? (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      const next = typeof updater === 'function' ? updater(props.expandedKeys!) : updater;
      props.onExpandedKeysChange?.(next);
    }
  : (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      setInternalExpandedKeys(prev => typeof updater === 'function' ? updater(prev) : updater);
    };

const handleToggle = useCallback((key: string) => {
  setExpandedKeys((prev: Set<string>) => {
    const next = new Set(prev);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    return next;
  });
}, [isControlled, props.expandedKeys, props.onExpandedKeysChange]);
```

Note: Because the `GeoAccordion` component uses destructured props in its signature, you need to capture them via a `props` reference. The cleanest approach: change the signature to accept `props: Props` and destructure inside the body — or use `arguments`-style access. The exact approach should preserve the existing `memo` wrapper.

Here is the concrete full signature change:

```typescript
// Old signature:
const GeoAccordion = memo(function GeoAccordion({
  trackers,
  basePath,
  activeTracker,
  onSelectTracker,
  onHoverTracker,
}: Props) {

// New signature:
const GeoAccordion = memo(function GeoAccordion(props: Props) {
  const {
    trackers,
    basePath,
    activeTracker,
    onSelectTracker,
    onHoverTracker,
    onHoverGeoNode,
    onLeaveGeoNode,
    activeGeoPath,
  } = props;
```

3. Pass `onHoverGeoNode` / `onLeaveGeoNode` down to `RegionNode`. Add these props to `RegionNode`:

```typescript
// Add to RegionNode's props:
  onHoverGeoNode?: (nodeId: string, level: GeoNode['level']) => void;
  onLeaveGeoNode?: () => void;
```

4. In `RegionNode`, add `onMouseEnter` / `onMouseLeave` to the node header `<div>`:

```typescript
// In RegionNode's node header <div>:
onMouseEnter={() => onHoverGeoNode?.(node.id, node.level)}
onMouseLeave={() => onLeaveGeoNode?.()}
```

And pass `onHoverGeoNode` / `onLeaveGeoNode` through to recursive `<RegionNode>` children.

5. Add auto-scroll on external expand. Add a `useEffect` inside `GeoAccordion` that watches `activeGeoPath`:

```typescript
const scrollTargetRef = useRef<string | null>(null);

useEffect(() => {
  if (!activeGeoPath || activeGeoPath.length === 0) return;
  // The node key for the country level is "1-{ISO_A2}" (depth=1 for country under region)
  // Set a scroll target that RegionNode can pick up
  scrollTargetRef.current = `1-${activeGeoPath[activeGeoPath.length - 1]}`;
}, [activeGeoPath]);
```

For the actual scroll, the simplest pattern is to pass `scrollTargetRef` down to `RegionNode` and have each node header check if its key matches, then call `scrollIntoView`. This requires a `ref` on the node header `<div>` and a `useEffect`:

```typescript
// In RegionNode, add:
const headerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (scrollTargetKey === nodeKey && headerRef.current) {
    headerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}, [expandedKeys]); // fires when keys change (including from external expand)
```

6. Verify the build:

```bash
cd /Users/artemiopadilla/Documents/repos/GitHub/personal/iran-conflict-tracker && npm run build 2>&1 | tail -20
```

**Commit message:** `feat(geo): lift GeoAccordion expandedKeys to controlled mode with hover callbacks`

---

## Task 4 — Add new bidirectional state to CommandCenter

**Files:**
- `src/components/islands/CommandCenter/CommandCenter.tsx` (edit)

**Steps:**

1. Add imports at the top of `CommandCenter.tsx`:

```typescript
import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { computeCountryDensity } from '../../../lib/geo-utils';
import type { FeatureCollection } from 'geojson';
```

Note: The `geojson` types ship with `@types/geojson`. If not installed:

```bash
cd /Users/artemiopadilla/Documents/repos/GitHub/personal/iran-conflict-tracker && npm ls @types/geojson 2>/dev/null || npm install -D @types/geojson
```

2. Add new state inside the `CommandCenter` component, after existing state declarations:

```typescript
// Globe ↔ GeoAccordion bidirectional state (geographic mode only)
const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
const [activeGeoPath, setActiveGeoPath] = useState<string[] | null>(null);
const [countriesGeoJSON, setCountriesGeoJSON] = useState<any>(null);
const [geoExpandedKeys, setGeoExpandedKeys] = useState<Set<string>>(new Set());
```

3. Compute `countryDensity` with `useMemo`:

```typescript
const countryDensity = useMemo(() => computeCountryDensity(trackers), [trackers]);
```

4. Add the lazy GeoJSON fetch, gated on `viewMode === 'geographic'`:

```typescript
useEffect(() => {
  if (viewMode !== 'geographic') return;
  if (countriesGeoJSON) return; // already loaded / cached

  const base = import.meta.env.BASE_URL || '/watchboard';
  const basePath = base.endsWith('/') ? base : `${base}/`;
  fetch(`${basePath}geo/countries-110m.json`)
    .then(r => r.ok ? r.json() : null)
    .then(data => { if (data) setCountriesGeoJSON(data); })
    .catch(() => { /* polygon layer simply won't appear */ });
}, [viewMode, countriesGeoJSON]);
```

5. Reset geo state when leaving geographic mode:

```typescript
useEffect(() => {
  if (viewMode !== 'geographic') {
    setHoveredCountry(null);
    setActiveGeoPath(null);
    setGeoExpandedKeys(new Set());
  }
}, [viewMode]);
```

6. Define `activeCountry` derived from `activeGeoPath`:

```typescript
const activeCountry = activeGeoPath && activeGeoPath.length > 0
  ? activeGeoPath[activeGeoPath.length - 1]  // last segment is the most specific, but country is [0] from geoPath
  : null;
```

Actually, per the spec, `activeGeoPath` is `[regionId, countryIsoA2]`. So the country ISO is:

```typescript
const activeCountry = activeGeoPath && activeGeoPath.length >= 2 ? activeGeoPath[1] : null;
```

7. Add the `handleGeoClick` callback (globe polygon click → expand sidebar):

```typescript
const handleGeoClick = useCallback((isoA2: string) => {
  // Find which region contains this country
  // We need the GeoTree — compute it or use a lookup from trackers
  const regionForCountry = trackers.find(
    t => t.geoPath && t.geoPath[0] === isoA2 && t.region
  )?.region ?? null;

  if (regionForCountry) {
    const path = [regionForCountry, isoA2];
    setActiveGeoPath(path);
    // Clear active tracker — they are mutually exclusive per spec section 11.4
    setActiveTracker(null);
    // Expand the region and country nodes in the accordion
    setGeoExpandedKeys(prev => {
      const next = new Set(prev);
      next.add(`0-${regionForCountry}`); // depth 0 = region
      next.add(`1-${isoA2}`);            // depth 1 = country
      return next;
    });
  }
}, [trackers]);
```

8. Add the `handleHoverGeoNode` callback (sidebar hover → globe highlight):

```typescript
const handleHoverGeoNode = useCallback((nodeId: string, level: string) => {
  if (level === 'country') {
    setHoveredCountry(nodeId);
  } else if (level === 'region') {
    setHoveredCountry(`region:${nodeId}`);
  } else {
    setHoveredCountry(null);
  }
}, []);

const handleLeaveGeoNode = useCallback(() => {
  setHoveredCountry(null);
}, []);
```

9. Ensure `activeGeoPath` and `activeTracker` are mutually exclusive. Modify the existing `handleSelect`:

```typescript
const handleSelect = useCallback((slug: string | null) => {
  setActiveTracker(slug);
  if (slug) setActiveGeoPath(null); // clear geo selection when a tracker is selected
}, []);
```

10. Pass new props to `GlobePanel`:

```typescript
<GlobePanel
  ref={globeRef}
  trackers={trackers}
  activeTracker={activeTracker}
  hoveredTracker={hoveredTracker}
  followedSlugs={followedSlugs}
  broadcastMode={broadcastEnabled}
  featuredSlug={broadcast.featuredTracker?.slug || null}
  onSelectTracker={handleSelect}
  onHoverTracker={handleHover}
  viewMode={viewMode}
  countriesGeoJSON={viewMode === 'geographic' ? countriesGeoJSON : null}
  countryDensity={countryDensity}
  hoveredCountry={hoveredCountry}
  activeCountry={activeCountry}
  onPolygonClick={handleGeoClick}
  onPolygonHover={setHoveredCountry}
/>
```

11. Pass new props down through `SidebarPanel` to `GeoAccordion`. First add them to the `SidebarPanel` props interface and call-site:

```typescript
<SidebarPanel
  {/* ... existing props ... */}
  geoExpandedKeys={viewMode === 'geographic' ? geoExpandedKeys : undefined}
  onGeoExpandedKeysChange={viewMode === 'geographic' ? setGeoExpandedKeys : undefined}
  onHoverGeoNode={handleHoverGeoNode}
  onLeaveGeoNode={handleLeaveGeoNode}
  activeGeoPath={activeGeoPath}
/>
```

12. Verify the build:

```bash
cd /Users/artemiopadilla/Documents/repos/GitHub/personal/iran-conflict-tracker && npm run build 2>&1 | tail -20
```

**Commit message:** `feat(globe): add bidirectional geo state to CommandCenter`

---

## Task 5 — Thread new props through SidebarPanel to GeoAccordion

**Files:**
- `src/components/islands/CommandCenter/SidebarPanel.tsx` (edit)

**Steps:**

1. Add new props to `SidebarPanel`'s `Props` interface:

```typescript
// Add to the existing Props interface in SidebarPanel.tsx:
  geoExpandedKeys?: Set<string>;
  onGeoExpandedKeysChange?: (keys: Set<string>) => void;
  onHoverGeoNode?: (nodeId: string, level: string) => void;
  onLeaveGeoNode?: () => void;
  activeGeoPath?: string[] | null;
```

2. Destructure the new props in the `SidebarPanel` component function signature.

3. Pass them to `GeoAccordion` in the render section (around line 678):

```typescript
<GeoAccordion
  trackers={filtered}
  basePath={basePath}
  activeTracker={activeTracker}
  onSelectTracker={onSelectTracker}
  onHoverTracker={onHoverTracker}
  expandedKeys={geoExpandedKeys}
  onExpandedKeysChange={onGeoExpandedKeysChange}
  onHoverGeoNode={onHoverGeoNode}
  onLeaveGeoNode={onLeaveGeoNode}
  activeGeoPath={activeGeoPath}
/>
```

4. Verify the build:

```bash
cd /Users/artemiopadilla/Documents/repos/GitHub/personal/iran-conflict-tracker && npm run build 2>&1 | tail -20
```

**Commit message:** `feat(globe): thread geo interaction props through SidebarPanel to GeoAccordion`

---

## Task 6 — Render polygon layer in GlobePanel

**Files:**
- `src/components/islands/CommandCenter/GlobePanel.tsx` (edit)

**Steps:**

1. Extend the `Props` interface in `GlobePanel.tsx`:

```typescript
interface Props {
  trackers: TrackerCardData[];
  activeTracker: string | null;
  hoveredTracker: string | null;
  followedSlugs: string[];
  broadcastMode?: boolean;
  featuredSlug?: string | null;
  cityLights?: boolean;
  onSelectTracker: (slug: string | null) => void;
  onHoverTracker: (slug: string | null) => void;
  // Geographic mode polygon layer
  viewMode?: 'operations' | 'geographic' | 'domain';
  countriesGeoJSON?: any | null;
  countryDensity?: Map<string, number>;
  hoveredCountry?: string | null;
  activeCountry?: string | null;
  onPolygonClick?: (isoA2: string) => void;
  onPolygonHover?: (isoA2: string | null) => void;
}
```

2. Destructure the new props in the forwardRef component:

```typescript
const GlobePanel = forwardRef<GlobePanelHandle, Props>(function GlobePanel({
  trackers,
  activeTracker,
  hoveredTracker,
  followedSlugs,
  broadcastMode = false,
  featuredSlug = null,
  cityLights: cityLightsProp = true,
  onSelectTracker,
  onHoverTracker,
  viewMode,
  countriesGeoJSON,
  countryDensity,
  hoveredCountry,
  activeCountry,
  onPolygonClick,
  onPolygonHover,
}, ref) {
```

3. Add refs for polygon color accessors (so they read current values without re-configuring the globe):

```typescript
const hoveredCountryRef = useRef(hoveredCountry);
const activeCountryRef = useRef(activeCountry);
const countryDensityRef = useRef(countryDensity);
const onPolygonClickRef = useRef(onPolygonClick);
const onPolygonHoverRef = useRef(onPolygonHover);

hoveredCountryRef.current = hoveredCountry;
activeCountryRef.current = activeCountry;
countryDensityRef.current = countryDensity;
onPolygonClickRef.current = onPolygonClick;
onPolygonHoverRef.current = onPolygonHover;
```

4. Compute `maxDensity` for the opacity formula:

```typescript
const maxDensity = useMemo(() => {
  if (!countryDensity || countryDensity.size === 0) return 1;
  return Math.max(1, ...countryDensity.values());
}, [countryDensity]);

const maxDensityRef = useRef(maxDensity);
maxDensityRef.current = maxDensity;
```

5. Define the polygon color accessor functions (outside of useEffect, as stable function references):

```typescript
function getPolygonCapColor(feature: any): string {
  const iso = feature.properties?.ISO_A2;
  const density = countryDensityRef.current;
  const maxD = maxDensityRef.current;
  const count = density?.get(iso) ?? 0;
  const baseOpacity = 0.04 + 0.22 * (count / maxD);
  const hovered = hoveredCountryRef.current;
  const active = activeCountryRef.current;

  if (iso === hovered || (hovered?.startsWith('region:') && isCountryInRegion(iso, hovered))) {
    return 'rgba(52,152,219,0.35)';
  }
  if (iso === active) {
    return 'rgba(52,152,219,0.28)';
  }
  if (count > 0) {
    return `rgba(52,152,219,${baseOpacity.toFixed(3)})`;
  }
  return 'rgba(52,152,219,0.04)';
}

function getPolygonStrokeColor(feature: any): string {
  const iso = feature.properties?.ISO_A2;
  const density = countryDensityRef.current;
  const count = density?.get(iso) ?? 0;
  const hovered = hoveredCountryRef.current;
  const active = activeCountryRef.current;

  if (iso === hovered || iso === active ||
      (hovered?.startsWith('region:') && isCountryInRegion(iso, hovered))) {
    return 'rgba(52,152,219,0.6)';
  }
  if (count > 0) {
    return 'rgba(52,152,219,0.18)';
  }
  return 'rgba(255,255,255,0.06)';
}
```

6. Add a helper for region-level hover (checking if a country is in the hovered region). This needs a mapping from ISO A2 to region, derived from trackers:

```typescript
// Build a simple ISO → region lookup from trackers (computed once)
const isoToRegionRef = useRef(new Map<string, string>());
useMemo(() => {
  const map = new Map<string, string>();
  for (const t of trackers) {
    if (t.geoPath && t.geoPath[0] && t.region) {
      map.set(t.geoPath[0], t.region);
    }
  }
  isoToRegionRef.current = map;
}, [trackers]);

function isCountryInRegion(iso: string, hoveredRegion: string): boolean {
  // hoveredRegion format: "region:middle-east"
  const regionId = hoveredRegion.replace('region:', '');
  return isoToRegionRef.current.get(iso) === regionId;
}
```

7. Add a `useEffect` that manages the polygon layer when `countriesGeoJSON` changes:

```typescript
useEffect(() => {
  const globe = globeRef.current;
  if (!globe) return;

  if (countriesGeoJSON && countriesGeoJSON.features) {
    globe
      .polygonsData(countriesGeoJSON.features)
      .polygonGeoJsonGeometry((d: any) => d.geometry)
      .polygonCapColor(getPolygonCapColor)
      .polygonSideColor(() => 'rgba(0,0,0,0)')
      .polygonStrokeColor(getPolygonStrokeColor)
      .polygonAltitude(0.001)
      .onPolygonClick((polygon: any) => {
        const iso = polygon?.properties?.ISO_A2;
        if (iso) onPolygonClickRef.current?.(iso);
      })
      .onPolygonHover((polygon: any) => {
        const iso = polygon?.properties?.ISO_A2 ?? null;
        onPolygonHoverRef.current?.(iso);
        if (containerRef.current) {
          containerRef.current.style.cursor = polygon ? 'pointer' : 'grab';
        }
      });
  } else {
    // Clear polygon layer when not in geographic mode
    globe.polygonsData([]);
  }
}, [countriesGeoJSON]);
```

8. Add a `useEffect` to refresh polygon colors when hover/active state changes (without re-setting data):

```typescript
useEffect(() => {
  const globe = globeRef.current;
  if (!globe || !countriesGeoJSON) return;

  globe
    .polygonCapColor(getPolygonCapColor)
    .polygonStrokeColor(getPolygonStrokeColor);
}, [hoveredCountry, activeCountry, countryDensity]);
```

9. Verify the build:

```bash
cd /Users/artemiopadilla/Documents/repos/GitHub/personal/iran-conflict-tracker && npm run build 2>&1 | tail -20
```

**Commit message:** `feat(globe): render country polygon layer with density heat map in geographic mode`

---

## Task 7 — Implement camera fly-to on polygon click

**Files:**
- `src/components/islands/CommandCenter/CommandCenter.tsx` (edit)

**Steps:**

1. Add centroid + altitude computation logic inside `handleGeoClick`. After setting `activeGeoPath` and expanding keys, fly the camera:

```typescript
const handleGeoClick = useCallback((isoA2: string) => {
  const regionForCountry = trackers.find(
    t => t.geoPath && t.geoPath[0] === isoA2 && t.region
  )?.region ?? null;

  if (regionForCountry) {
    const path = [regionForCountry, isoA2];
    setActiveGeoPath(path);
    setActiveTracker(null);
    setGeoExpandedKeys(prev => {
      const next = new Set(prev);
      next.add(`0-${regionForCountry}`);
      next.add(`1-${isoA2}`);
      return next;
    });

    // Fly camera to country centroid
    if (countriesGeoJSON) {
      const feature = countriesGeoJSON.features?.find(
        (f: any) => f.properties?.ISO_A2 === isoA2
      );
      if (feature) {
        const { centroid, altitude } = computeFeatureCentroidAndAltitude(feature);
        globeRef.current?.flyTo?.(centroid.lat, centroid.lng, altitude, 1200);
        // Pause auto-rotation during fly-to
        globeRef.current?.setAutoRotate?.(false);
      }
    }
  }
}, [trackers, countriesGeoJSON]);
```

2. Add the `computeFeatureCentroidAndAltitude` helper above the component:

```typescript
function computeFeatureCentroidAndAltitude(feature: any): {
  centroid: { lat: number; lng: number };
  altitude: number;
} {
  // Compute bounding box from all coordinates
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;

  function visitCoords(coords: any) {
    if (typeof coords[0] === 'number') {
      // [lng, lat] pair
      const lng = coords[0], lat = coords[1];
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      return;
    }
    for (const c of coords) visitCoords(c);
  }

  if (feature.geometry?.coordinates) {
    visitCoords(feature.geometry.coordinates);
  }

  const centroid = {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
  };

  // Altitude based on bounding box area
  const area = (maxLat - minLat) * (maxLng - minLng);
  let altitude = 1.6; // medium
  if (area < 25) altitude = 1.2;       // small (< 5 degrees squared)
  else if (area > 2500) altitude = 2.0; // large (> 50 degrees squared)

  return { centroid, altitude };
}
```

3. Verify the build:

```bash
cd /Users/artemiopadilla/Documents/repos/GitHub/personal/iran-conflict-tracker && npm run build 2>&1 | tail -20
```

**Commit message:** `feat(globe): fly camera to country centroid on polygon click`

---

## Task 8 — Wire accordion node click to fly camera

**Files:**
- `src/components/islands/CommandCenter/GeoAccordion.tsx` (edit)
- `src/components/islands/CommandCenter/SidebarPanel.tsx` (edit)
- `src/components/islands/CommandCenter/CommandCenter.tsx` (edit)

**Steps:**

1. Add a new callback prop to `GeoAccordion` and `SidebarPanel` for when a country/region node header is clicked:

```typescript
// In GeoAccordion Props:
  onClickGeoNode?: (nodeId: string, level: GeoNode['level']) => void;
```

2. In `RegionNode`, when the node header is clicked, also call `onClickGeoNode` in addition to `onToggle`:

```typescript
onClick={() => {
  if (hasChildren) onToggle(nodeKey);
  onClickGeoNode?.(node.id, node.level);
}}
```

3. Thread `onClickGeoNode` through `SidebarPanel` to `CommandCenter`.

4. In `CommandCenter`, define `handleClickGeoNode`:

```typescript
const handleClickGeoNode = useCallback((nodeId: string, level: string) => {
  if (level === 'country') {
    // Same as handleGeoClick
    handleGeoClick(nodeId);
  } else if (level === 'region') {
    // Fly to region centroid — use average of all tracker positions in that region
    const regionTrackers = trackers.filter(t => t.region === nodeId && t.mapCenter);
    if (regionTrackers.length > 0) {
      const avgLat = regionTrackers.reduce((s, t) => s + t.mapCenter!.lat, 0) / regionTrackers.length;
      const avgLng = regionTrackers.reduce((s, t) => s + t.mapCenter!.lon, 0) / regionTrackers.length;
      globeRef.current?.flyTo?.(avgLat, avgLng, 2.0, 1200);
      globeRef.current?.setAutoRotate?.(false);
    }
    setActiveGeoPath([nodeId]);
    setActiveTracker(null);
  }
}, [trackers, handleGeoClick]);
```

5. Verify the build:

```bash
cd /Users/artemiopadilla/Documents/repos/GitHub/personal/iran-conflict-tracker && npm run build 2>&1 | tail -20
```

**Commit message:** `feat(globe): fly camera on accordion country/region node click`

---

## Task 9 — Visual polish: active node styling + mode transition cleanup

**Files:**
- `src/components/islands/CommandCenter/GeoAccordion.tsx` (edit)
- `src/components/islands/CommandCenter/GlobePanel.tsx` (edit)

**Steps:**

1. In `GeoAccordion`'s `RegionNode`, highlight the active node based on `activeGeoPath`. Add a left border strip and accent-blue color when the node's key is in the active path:

```typescript
// In RegionNode, compute isActive:
const isActiveNode = activeGeoPath?.includes(node.id) ?? false;

// Apply to node header style:
style={{
  ...S.nodeHeader,
  color: isActiveNode ? 'var(--accent-blue)' : levelColor,
  borderLeft: isActiveNode ? '2px solid var(--accent-blue)' : '2px solid transparent',
  cursor: hasChildren ? 'pointer' : 'default',
}}
```

Pass `activeGeoPath` through to `RegionNode` in its props.

2. In `GlobePanel`, ensure polygon layer is cleared on mode transition. Add/verify:

```typescript
// Already in Task 6, but verify:
// When countriesGeoJSON becomes null (mode exit), polygons are cleared
useEffect(() => {
  const globe = globeRef.current;
  if (!globe) return;
  if (!countriesGeoJSON) {
    globe.polygonsData([]);
  }
}, [countriesGeoJSON]);
```

3. Resume auto-rotation when exiting geographic mode. In `CommandCenter`, the existing `viewMode` reset effect already clears state. Add auto-rotate restore:

```typescript
useEffect(() => {
  if (viewMode !== 'geographic') {
    setHoveredCountry(null);
    setActiveGeoPath(null);
    setGeoExpandedKeys(new Set());
    // Resume auto-rotation if no tracker is selected
    if (!activeTracker) {
      globeRef.current?.setAutoRotate?.(true, 0.3);
    }
  }
}, [viewMode]);
```

4. Verify end-to-end with dev server:

```bash
cd /Users/artemiopadilla/Documents/repos/GitHub/personal/iran-conflict-tracker && npm run build 2>&1 | tail -20
```

**Commit message:** `feat(globe): polish active node styling and mode transition cleanup`

---

## Task 10 — Handle polygon-click vs point-click conflict

**Files:**
- `src/components/islands/CommandCenter/GlobePanel.tsx` (edit)

**Steps:**

1. The spec notes that when a tracker dot overlaps a country polygon, both `onPolygonClick` and `onPointClick` fire. The point click should take priority. Implement a debounce guard:

```typescript
// Add a ref to track recent point clicks
const pointClickedRef = useRef(false);

// In the existing onPointClick handler, set the guard:
.onPointClick((point: any) => {
  pointClickedRef.current = true;
  setTimeout(() => { pointClickedRef.current = false; }, 50);
  const slug = point.slug;
  onSelectRef.current(activeRef.current === slug ? null : slug);
})

// In onPolygonClick handler, check the guard:
.onPolygonClick((polygon: any) => {
  if (pointClickedRef.current) return; // point click takes priority
  const iso = polygon?.properties?.ISO_A2;
  if (iso) onPolygonClickRef.current?.(iso);
})
```

2. Verify the build:

```bash
cd /Users/artemiopadilla/Documents/repos/GitHub/personal/iran-conflict-tracker && npm run build 2>&1 | tail -20
```

**Commit message:** `fix(globe): suppress polygon click when point click takes priority`

---

## Verification Checklist

After all tasks are complete, run the following:

```bash
cd /Users/artemiopadilla/Documents/repos/GitHub/personal/iran-conflict-tracker

# Full build must pass
npm run build

# Manual verification in dev:
npm run dev
# 1. Open http://localhost:4321/watchboard/
# 2. Switch to GEO mode via the toggle
# 3. Verify country polygons appear with density tint
# 4. Click a country polygon → sidebar accordion expands, camera flies
# 5. Hover a country node in sidebar → polygon highlights on globe
# 6. Click a tracker dot on the globe → polygon click does NOT fire
# 7. Switch back to OPS mode → polygons disappear, state resets
# 8. Switch to GEO mode again → polygons reappear (no re-fetch)
```
