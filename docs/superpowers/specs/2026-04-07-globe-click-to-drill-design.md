# Globe Click-to-Drill — Design Spec

**Date:** 2026-04-07
**Status:** Draft
**Author:** Artemio Padilla

---

## Summary

When the user is in Geographic view mode, the CesiumJS globe on the Watchboard homepage and the GeoAccordion sidebar should behave as a single linked control. Clicking a country polygon on the globe expands the matching accordion node and flies the camera there; hovering a geographic node in the sidebar highlights the region on the globe. Country boundaries are tinted with opacity proportional to tracker density, giving an at-a-glance heat map of coverage.

This spec covers the data pipeline, interaction contract, bidirectional state design, camera behavior, visual treatment, and performance constraints.

---

## 1. Scope

This feature only activates when `viewMode === 'geographic'` in `CommandCenter`. In Operations and Domain modes the globe continues to behave exactly as today (tracker dots, rings, arcs — no polygon layer).

---

## 2. Country Boundary Data

### 2.1 Source

Use **Natural Earth 110m admin-0 countries** GeoJSON. At 110 m resolution the file is ~440 KB raw / ~120 KB gzip. The 50 m file (~1 MB raw) is unnecessary at globe zoom levels.

- Download once from naturalearthdata.com or the canonical npm package `@geo-maps/countries-110m`.
- Strip unused properties (keep only `ISO_A2` / `NAME`).
- Save to `public/geo/countries-110m.json` (static asset, served from GitHub Pages).

### 2.2 Loading Strategy

Fetch lazily, triggered on first entry into Geographic view mode (not at globe init):

```
CommandCenter detects viewMode === 'geographic'
  → dispatches loadCountryBoundaries() action
  → GlobePanel receives countriesGeoJSON prop (null until loaded)
  → globe.gl .polygonsData() updated when data arrives
```

Use `fetch('/watchboard/geo/countries-110m.json')` inside a `useEffect` in `CommandCenter` that fires only when `viewMode` transitions to `'geographic'`. Cache result in a module-level `let cachedGeo: FeatureCollection | null = null` so switching modes does not re-fetch.

**No server dependency.** The GeoJSON is a static build artifact.

---

## 3. Tracker Density Map

### 3.1 Computation

At data-load time (same useMemo that builds the GeoTree), compute a `Map<string, number>` keyed by ISO A2 country code:

```
countryDensity: Map<ISO_A2, trackerCount>
```

Each tracker contributes 1 to the country identified by `geoPath[0]` (the first path segment is always the country code, e.g. `"MX"`, `"UA"`, `"IR"`). Trackers with `region === 'global'` or an empty `geoPath` are excluded.

### 3.2 Opacity Formula

```
maxCount = max value in countryDensity (floor at 1)
opacity(country) = 0.04 + 0.22 * (count / maxCount)
```

This yields opacity in the range `[0.04, 0.26]` — visible but non-distracting over the earth texture. Countries with zero trackers render at 0.04.

---

## 4. Globe Polygon Layer

`globe.gl` supports a `polygonsData` layer via `globe.polygonsData()` / `globe.polygonGeoJsonGeometry()`. The polygon layer sits on top of the earth texture.

### 4.1 Configuration

```
globe
  .polygonsData(countriesFeatures)           // GeoJSON Feature[]
  .polygonGeoJsonGeometry(d => d.geometry)
  .polygonCapColor(d => polygonFillColor(d))
  .polygonSideColor(() => 'rgba(0,0,0,0)')
  .polygonStrokeColor(d => polygonStrokeColor(d))
  .polygonAltitude(0.001)
  .onPolygonClick(handlePolygonClick)
  .onPolygonHover(handlePolygonHover)
```

### 4.2 Color Functions

**Fill** (reactive to hover + active country):

```
polygonFillColor(feature):
  iso = feature.properties.ISO_A2
  count = countryDensity.get(iso) ?? 0
  baseOpacity = 0.04 + 0.22 * (count / maxCount)

  if iso === hoveredCountry:
    return accent-blue at 0.35 opacity
  if iso === activeCountry:
    return accent-blue at 0.28 opacity
  if count > 0:
    return accent-blue at baseOpacity
  else:
    return transparent (0.04)
```

**Stroke:**

```
polygonStrokeColor(feature):
  iso = feature.properties.ISO_A2
  if iso === hoveredCountry or iso === activeCountry:
    return 'rgba(52,152,219,0.6)'
  if countryDensity.get(iso) > 0:
    return 'rgba(52,152,219,0.18)'
  return 'rgba(255,255,255,0.06)'
```

All color functions read from refs (not state) so `globe.polygonsData()` does not need to be called on every render — only `.polygonCapColor()` and `.polygonStrokeColor()` need to be refreshed when hover/active changes (same pattern already used for point colors).

---

## 5. Bidirectional State

### 5.1 New State in CommandCenter

Two new pieces of geo-interaction state live in `CommandCenter` (not in the sub-components):

| State field | Type | Description |
|---|---|---|
| `hoveredCountry` | `string \| null` | ISO A2 of the polygon the user is hovering on the globe |
| `activeGeoPath` | `string[] \| null` | The full path to the expanded accordion node, e.g. `['middle-east', 'IR']` |

`activeGeoPath` is set by both directions of interaction (globe click or accordion click) and consumed by both components.

### 5.2 Globe → Sidebar (click on country polygon)

1. `handlePolygonClick(feature)` fires in `GlobePanel`.
2. `GlobePanel` calls `onPolygonClick(isoA2)` — a new prop added to `GlobePanelHandle` interface and `Props`.
3. `CommandCenter.handleGeoClick(isoA2)`:
   a. Finds which `GeoTree` region node contains a country child with `id === isoA2`.
   b. Constructs the path `[regionId, isoA2]`.
   c. Sets `activeGeoPath` to that path.
   d. Calls `globeRef.current.flyTo(lat, lng, altitude, 1200)` using the centroid computed from the GeoJSON feature's bounding box (average of min/max lat/lng).
4. `SidebarPanel` receives `activeGeoPath` and passes it to `GeoAccordion`.
5. `GeoAccordion` uses `activeGeoPath` to expand the matching node keys and scroll the node header into view.

### 5.3 Sidebar → Globe (hover on accordion node)

1. `RegionNode.onMouseEnter` fires with the node's `id` and `level`.
2. `GeoAccordion` calls a new prop `onHoverGeoNode(nodeId, level)`.
3. `SidebarPanel` bubbles this up to `CommandCenter`.
4. `CommandCenter` resolves ISO A2:
   - If `level === 'country'`: ISO A2 = `nodeId`.
   - If `level === 'region'`: highlight all countries in that region (set `hoveredCountry` to a sentinel `'region:middle-east'` or broadcast the full country list).
   - Higher levels (`state`, `city`): no polygon highlight — too granular for country-level data.
5. `CommandCenter` updates `hoveredCountry` state and passes it to `GlobePanel`.
6. `GlobePanel` refreshes polygon colors via `globe.polygonCapColor()` and `.polygonStrokeColor()`.

**Mouse-leave** on any accordion node sets `hoveredCountry = null`.

### 5.4 Accordion Expansion from Globe Click

`GeoAccordion` currently manages `expandedKeys` as internal state (`useState<Set<string>>`). To allow external expansion, lift `expandedKeys` to be controlled:

- Add optional props `expandedKeys?: Set<string>` and `onExpandedKeysChange?: (keys: Set<string>) => void`.
- When these props are provided, `GeoAccordion` becomes controlled; when absent, it falls back to internal state.
- `CommandCenter` supplies these props only when `viewMode === 'geographic'`.

This avoids breaking the existing uncontrolled usage in other contexts.

#### Auto-scroll on external expand

When `activeGeoPath` changes and causes a node to expand, `GeoAccordion` scrolls that node header into view via `nodeHeaderRef.scrollIntoView({ behavior: 'smooth', block: 'nearest' })` in a `useEffect` watching `expandedKeys`.

---

## 6. Camera Fly-To Behavior

### 6.1 From globe polygon click

Use existing `globeRef.current.flyTo(lat, lng, altitude, durationMs)` (already on `GlobePanelHandle`).

Altitude is distance-based on feature size:

```
Small country  (bbox area < 5°²):   altitude 1.2
Medium country (5–50°²):            altitude 1.6
Large country  (> 50°²):            altitude 2.0
```

Bounding box area = `(maxLat - minLat) * (maxLng - minLng)`.

Duration: 1200 ms in all cases. Auto-rotation stops for the duration (restores when user deselects or switches away from Geographic mode).

### 6.2 From accordion node hover

No camera movement on hover — camera only moves on click. Moving the camera on hover would be disorienting given how fast users scan the accordion.

### 6.3 From accordion node click (country/region header)

When the user clicks a country node header in the accordion (not a tracker leaf), `CommandCenter` triggers a fly-to using the same centroid logic. Region-level clicks fly to the region centroid (pre-computed from the `REGION_LABELS` map's known bounding boxes, hardcoded for the ~15 regions).

---

## 7. Visual Highlighting

### 7.1 Hover (sidebar → globe)

- Country polygon fill: `accent-blue` at 0.35 opacity.
- Country polygon stroke: `rgba(52,152,219,0.6)`.
- Transitions via globe.gl's built-in color interpolation (no additional CSS needed).
- Tracker dots within the hovered country stay at full opacity; all other dots dim to 40% (existing dimming logic already handles this via `activeTracker`/`hoveredTracker`).

### 7.2 Active / selected country (globe click)

- Country polygon fill: `accent-blue` at 0.28 opacity (slightly less than hover so it doesn't look broken after click).
- Stroke same as hover.
- The accordion node is highlighted with `color: var(--accent-blue)` and a left border strip (reuse existing `nodeHeader` style override).

### 7.3 Density tint

- Applied continuously in both selected and unselected states.
- Countries with trackers show a low-opacity fill that acts as a geographic heat map.
- Zero-tracker countries show only a faint border at 0.06 opacity — visible but not cluttered.

### 7.4 Mode transition

When `viewMode` leaves `'geographic'`, the polygon layer is hidden instantly (`globe.polygonsData([])`). Tracker dots return to their normal styling. State `hoveredCountry` and `activeGeoPath` are reset to null on mode exit.

---

## 8. Interface Changes

### GlobePanel Props (additions)

```typescript
interface Props {
  // ... existing ...
  viewMode?: 'operations' | 'geographic' | 'domain';
  countriesGeoJSON?: FeatureCollection | null;    // null = not loaded yet
  countryDensity?: Map<string, number>;           // ISO A2 → count
  hoveredCountry?: string | null;                 // from sidebar hover
  activeCountry?: string | null;                  // from polygon click or accordion
  onPolygonClick?: (isoA2: string) => void;
  onPolygonHover?: (isoA2: string | null) => void;
}
```

### GlobePanel Handle (additions)

No changes needed — `flyTo` is already exposed.

### GeoAccordion Props (additions)

```typescript
interface Props {
  // ... existing ...
  expandedKeys?: Set<string>;                         // controlled mode
  onExpandedKeysChange?: (keys: Set<string>) => void; // controlled mode
  onHoverGeoNode?: (nodeId: string, level: GeoNode['level']) => void;
  activeGeoPath?: string[] | null;                    // highlight path
}
```

### CommandCenter State (additions)

```typescript
const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
const [activeGeoPath, setActiveGeoPath]   = useState<string[] | null>(null);
const [countriesGeoJSON, setCountriesGeoJSON] = useState<FeatureCollection | null>(null);
```

Plus a `countryDensity` derived value (useMemo from trackers + GeoTree).

---

## 9. Performance Considerations

### 9.1 Polygon count

Natural Earth 110m has ~180 country polygons. Each is a GeoJSON MultiPolygon with relatively few vertices at this resolution. `globe.gl` renders these via Three.js `ExtrudeGeometry` — 180 polygons is well within budget.

### 9.2 Color recomputation

Globe.gl re-evaluates color accessor functions every animation frame. To keep this fast:
- Color functions read from refs, not state, to avoid closure captures.
- They perform only one Map lookup + one arithmetic operation — O(1) per polygon.

### 9.3 GeoJSON fetch

The 110m file is ~440 KB raw. Fetched once, cached in module scope. On slow connections the polygon layer simply does not appear until the fetch resolves — the globe remains functional with dots only.

Add a `?v=1` cache-buster query param tied to a build constant so the CDN can cache aggressively while allowing invalidation on data updates.

### 9.4 GeoTree memo

`buildGeoTree` is already memoized in `GeoAccordion` (`useMemo([trackers])`). The `countryDensity` map is derived from the same trackers array — compute it in the same useMemo block to avoid a second traversal. Move this memo up to `CommandCenter` so both `GeoAccordion` and `GlobePanel` share one computation.

### 9.5 Accordion expansion scroll

Scrolling a node into view triggers a layout read (`getBoundingClientRect`). Gate this behind a ref flag that is set only when the expansion was externally triggered (globe click) — skip it for user-initiated accordion toggles.

### 9.6 No-op in non-geographic modes

The polygon layer, all new event handlers, and the GeoJSON fetch are gated behind `viewMode === 'geographic'`. In Operations and Domain modes there is zero overhead from this feature.

---

## 10. Out of Scope

- Subnational (state/province) polygon boundaries. The 110m dataset does not include them; adding them would require a separate 50 m admin-1 file (~4 MB) and is not justified by the current tracker granularity.
- Tooltip / info card on polygon hover. The sidebar accordion already surfaces this information.
- Mobile layout. The Command Center collapses to a single-column layout on mobile; the globe and sidebar are not simultaneously visible, so bidirectional sync is not meaningful on small screens. The polygon density tint still renders on the globe, but click-to-drill targets the MobileStoryCarousel, not the accordion.
- Search integration. Typing in the sidebar search box does not filter polygon highlights — search operates on tracker rows, not geographic nodes.

---

## 11. Open Questions

1. **ISO A2 in geoPath[0]**: The spec assumes `geoPath[0]` is always an ISO 3166-1 alpha-2 code (e.g. `"MX"`, `"UA"`). Auditing the 48 tracker configs is required before implementation. If any tracker uses a full country name or a custom identifier, a lookup table will be needed.

2. **Region centroid coordinates**: Hardcoding bounding-box centroids for the 15 named regions is straightforward but brittle if new regions are added. Consider deriving them from the GeoJSON at runtime by computing the mean centroid of all matching country polygons.

3. **Polygon click vs. point click conflict**: When a tracker dot and a country polygon overlap, `globe.gl` fires both `onPolygonClick` and `onPointClick`. The existing `onPointClick` handler should take priority — suppress `onPolygonClick` when the click target is within the hit radius of any tracker point. Evaluate whether `globe.gl` provides a native z-order mechanism or whether a distance check is needed.

4. **`activeGeoPath` vs. `activeTracker`**: Both represent a "selected" concept. Define the priority rule: selecting a tracker leaf in the accordion sets `activeTracker` (existing behavior), not `activeGeoPath`. Clicking a country/region node header sets `activeGeoPath` but clears `activeTracker`. The two are mutually exclusive.
