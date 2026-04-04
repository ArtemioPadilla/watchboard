# Geographic Hierarchy & Drill-Down Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add geographic drill-down (continent → country → state → city → neighborhood) so users can browse trackers by location at any scale.

**Architecture:** New schema fields (`geoPath`, `state`, `city`, `neighborhood`, `aggregate`) on tracker configs. A new `geo-utils.ts` library builds a tree from geoPath arrays. The Command Center sidebar gains a mode toggle (Operations/Geographic/Domain) with accordion drill-down in Geographic mode. New `/geo/[...path]` routes serve aggregate and virtual index pages. Build-time aggregation merges child tracker data for `aggregate: true` trackers.

**Tech Stack:** Zod (schema), React (sidebar), Astro (pages/routing), Vitest (tests)

**Spec:** `docs/superpowers/specs/2026-04-03-geographic-hierarchy-design.md`

**Deferred to follow-up plan:**
- Globe integration (clicking country regions on CesiumJS globe to drill sidebar) — requires CesiumJS entity click handlers and bidirectional state. Complex enough to be its own plan after the core geo hierarchy ships.
- Tier 3 virtual node auto-detection (3+ trackers trigger auto-generation) — the `/geo/` routes handle this case already via the catch-all, but the "no tracker.json needed" optimization can be refined later.

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `src/lib/geo-utils.ts` | `buildGeoTree()`, `findChildren()`, `resolveGeoNode()`, `aggregateTrackerData()` — pure functions for geographic hierarchy |
| `src/lib/geo-utils.test.ts` | Tests for all geo-utils functions |
| `src/components/islands/CommandCenter/GeoAccordion.tsx` | Geographic accordion tree component for sidebar |
| `src/components/islands/CommandCenter/ViewModeToggle.tsx` | Operations / Geographic / Domain pill toggle |
| `src/components/static/GeoBreadcrumb.astro` | `📍 Mexico › Sinaloa › Culiacán` breadcrumb for tracker dashboards |
| `src/components/static/GeoIndex.astro` | Lightweight index page for virtual geographic nodes |
| `src/pages/geo/index.astro` | World overview — map + continent list |
| `src/pages/geo/[...path].astro` | Catch-all geographic route (`/geo/MX/`, `/geo/MX/Sinaloa/`, etc.) |
| `trackers/mexico/tracker.json` | First aggregate tracker — Mexico hub |
| `trackers/united-states/tracker.json` | Second aggregate tracker — US hub |

### Modified files

| File | Changes |
|---|---|
| `src/lib/tracker-config.ts:127-163` | Add `state`, `city`, `neighborhood`, `geoPath`, `geoSecondary`, `aggregate`, `author`, `visibility` to TrackerConfigSchema |
| `src/lib/tracker-directory-utils.ts:8-45` | Add geo fields to `TrackerCardData` interface |
| `src/lib/tracker-directory-utils.ts:83-93` | Add `state`, `city`, `geoPath` to `matchesSearch()` |
| `src/lib/data.ts:156-209` | Add aggregate data resolution path in `loadTrackerData()` |
| `src/pages/index.astro:101-139` | Pass new geo fields in `serializedTrackers` |
| `src/components/islands/CommandCenter/CommandCenter.tsx:43-48` | Add `viewMode` state, pass to SidebarPanel |
| `src/components/islands/CommandCenter/SidebarPanel.tsx:508-660` | Replace domain tabs with mode toggle, add geographic accordion view |
| `src/pages/[tracker]/index.astro:52-62` | Add GeoBreadcrumb to hero section |
| `trackers/*/tracker.json` (all ~48) | Add `geoPath` and optionally `state`/`city` fields |

---

## Task 1: Schema — Add geographic fields to TrackerConfigSchema

**Files:**
- Modify: `src/lib/tracker-config.ts:127-163`

- [ ] **Step 1: Add new fields to TrackerConfigSchema**

In `src/lib/tracker-config.ts`, add fields inside the `TrackerConfigSchema` z.object, after `country` (line 143):

```typescript
  country: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  neighborhood: z.string().optional(),
  geoPath: z.array(z.string()).optional(),
  geoSecondary: z.array(z.string()).optional(),
  aggregate: z.boolean().optional().default(false),
  author: z.string().optional(),
  visibility: z.enum(['public', 'unlisted']).optional().default('public'),
```

- [ ] **Step 2: Add superRefine validation for geoPath consistency**

After the closing `})` of TrackerConfigSchema (line 163), chain a `.superRefine()`:

```typescript
export const TrackerConfigSchema = z.object({
  // ... existing fields ...
}).superRefine((data, ctx) => {
  if (data.geoPath && data.country && data.geoPath[0] !== data.country) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `geoPath[0] "${data.geoPath[0]}" must match country "${data.country}"`,
      path: ['geoPath'],
    });
  }
});
```

- [ ] **Step 3: Verify build passes**

Run: `npx astro check 2>&1 | head -20`
Expected: No new type errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/tracker-config.ts
git commit -m "feat(geo): add geographic hierarchy fields to TrackerConfigSchema"
```

---

## Task 2: Migrate existing tracker.json files — add geoPath

**Files:**
- Modify: all `trackers/*/tracker.json` files

- [ ] **Step 1: Write a migration script**

Create `scripts/migrate-geo-path.ts`:

```typescript
import fs from 'fs';
import path from 'path';

// Map of slug → [state, city] for trackers with sub-national specificity
const SUB_NATIONAL: Record<string, { state?: string; city?: string }> = {
  'culiacanazo': { state: 'Sinaloa', city: 'Culiacán' },
  'sinaloa-fragmentation': { state: 'Sinaloa' },
  'september-11': { state: 'New York', city: 'New York City' },
  'tlatelolco-1968': { state: 'CDMX', city: 'Mexico City' },
  'ayotzinapa': { state: 'Guerrero', city: 'Iguala' },
  'mencho-cjng': { state: 'Jalisco' },
  'fukushima-disaster': { state: 'Fukushima' },
  'chernobyl-disaster': { state: 'Kyiv Oblast', city: 'Pripyat' },
};

const trackersDir = path.resolve('trackers');

for (const slug of fs.readdirSync(trackersDir)) {
  const configPath = path.join(trackersDir, slug, 'tracker.json');
  if (!fs.existsSync(configPath)) continue;

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  if (!config.country) continue; // skip global trackers
  if (config.geoPath) continue; // already migrated

  const geoPath: string[] = [config.country];
  const sub = SUB_NATIONAL[slug];

  if (sub?.state) {
    geoPath.push(sub.state);
    config.state = sub.state;
  }
  if (sub?.city) {
    geoPath.push(sub.city);
    config.city = sub.city;
  }

  config.geoPath = geoPath;

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`✓ ${slug}: geoPath=${JSON.stringify(geoPath)}`);
}
```

- [ ] **Step 2: Run migration**

Run: `npx tsx scripts/migrate-geo-path.ts`
Expected: Output listing each tracker with its assigned geoPath

- [ ] **Step 3: Spot-check a few tracker configs**

Run: `cat trackers/culiacanazo/tracker.json | head -15`
Expected: Should show `"geoPath": ["MX", "Sinaloa", "Culiacán"]`, `"state": "Sinaloa"`, `"city": "Culiacán"`

Run: `cat trackers/iran-conflict/tracker.json | head -15`
Expected: Should show `"geoPath": ["IR"]`, no state/city

- [ ] **Step 4: Verify build passes**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add trackers/*/tracker.json scripts/migrate-geo-path.ts
git commit -m "feat(geo): add geoPath to all tracker configs"
```

---

## Task 3: Geo utilities — buildGeoTree and findChildren (TDD)

**Files:**
- Create: `src/lib/geo-utils.ts`
- Create: `src/lib/geo-utils.test.ts`

- [ ] **Step 1: Write failing tests for buildGeoTree**

Create `src/lib/geo-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildGeoTree, findChildren, resolveGeoNode, type GeoNode } from './geo-utils';
import type { TrackerCardData } from './tracker-directory-utils';

function makeTracker(overrides: Partial<TrackerCardData> = {}): TrackerCardData {
  return {
    slug: 'test',
    shortName: 'Test',
    name: 'Test Tracker',
    description: 'Test',
    status: 'active',
    temporal: 'live',
    startDate: '2026-01-01',
    sections: [],
    dayCount: 1,
    lastUpdated: '2026-01-01',
    topKpis: [],
    ...overrides,
  };
}

describe('buildGeoTree', () => {
  it('groups trackers by country', () => {
    const trackers = [
      makeTracker({ slug: 'iran', country: 'IR', geoPath: ['IR'], region: 'middle-east' }),
      makeTracker({ slug: 'culiacanazo', country: 'MX', geoPath: ['MX', 'Sinaloa', 'Culiacán'], region: 'north-america' }),
      makeTracker({ slug: 'sinaloa', country: 'MX', geoPath: ['MX', 'Sinaloa'], region: 'north-america' }),
    ];
    const tree = buildGeoTree(trackers);

    expect(tree.children).toHaveLength(2); // middle-east, north-america
    const americas = tree.children.find(c => c.id === 'north-america');
    expect(americas).toBeDefined();
    expect(americas!.children).toHaveLength(1); // MX
    const mx = americas!.children[0];
    expect(mx.id).toBe('MX');
    expect(mx.trackerCount).toBe(2);
    const sinaloa = mx.children.find(c => c.id === 'Sinaloa');
    expect(sinaloa).toBeDefined();
    expect(sinaloa!.trackerCount).toBe(2);
  });

  it('puts trackers without geoPath into an "Uncategorized" region', () => {
    const trackers = [
      makeTracker({ slug: 'quantum', country: undefined, geoPath: undefined }),
    ];
    const tree = buildGeoTree(trackers);
    expect(tree.children).toHaveLength(0); // no geo trackers
    expect(tree.ungrouped).toHaveLength(1);
  });

  it('puts global trackers into a "Global" region', () => {
    const trackers = [
      makeTracker({ slug: 'ww2', region: 'global', country: 'DE', geoPath: undefined }),
    ];
    const tree = buildGeoTree(trackers);
    expect(tree.global).toHaveLength(1);
  });

  it('includes geoSecondary trackers as references', () => {
    const trackers = [
      makeTracker({ slug: 'india-pak', country: 'IN', geoPath: ['IN'], geoSecondary: ['PK'], region: 'south-asia' }),
    ];
    const tree = buildGeoTree(trackers);
    const southAsia = tree.children.find(c => c.id === 'south-asia');
    const india = southAsia!.children.find(c => c.id === 'IN');
    const pakistan = southAsia!.children.find(c => c.id === 'PK');
    expect(india!.trackers).toHaveLength(1);
    expect(pakistan!.secondaryTrackers).toHaveLength(1);
  });
});

describe('findChildren', () => {
  it('finds all trackers whose geoPath starts with a prefix', () => {
    const trackers = [
      makeTracker({ slug: 'culiacanazo', geoPath: ['MX', 'Sinaloa', 'Culiacán'] }),
      makeTracker({ slug: 'sinaloa', geoPath: ['MX', 'Sinaloa'] }),
      makeTracker({ slug: 'iran', geoPath: ['IR'] }),
      makeTracker({ slug: 'mexico-nat', geoPath: ['MX'] }),
    ];
    const children = findChildren(trackers, ['MX']);
    expect(children.map(c => c.slug).sort()).toEqual(['culiacanazo', 'sinaloa']);
  });

  it('returns empty array if no children', () => {
    const trackers = [makeTracker({ slug: 'iran', geoPath: ['IR'] })];
    expect(findChildren(trackers, ['MX'])).toEqual([]);
  });
});

describe('resolveGeoNode', () => {
  it('resolves a path to the correct node', () => {
    const trackers = [
      makeTracker({ slug: 'culiacanazo', country: 'MX', geoPath: ['MX', 'Sinaloa', 'Culiacán'], region: 'north-america' }),
    ];
    const tree = buildGeoTree(trackers);
    const node = resolveGeoNode(tree, ['north-america', 'MX', 'Sinaloa']);
    expect(node).toBeDefined();
    expect(node!.id).toBe('Sinaloa');
  });

  it('returns undefined for invalid path', () => {
    const tree = buildGeoTree([]);
    expect(resolveGeoNode(tree, ['nonexistent'])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run src/lib/geo-utils.test.ts 2>&1 | tail -10`
Expected: FAIL — module `./geo-utils` not found

- [ ] **Step 3: Implement geo-utils.ts**

Create `src/lib/geo-utils.ts`:

```typescript
import type { TrackerCardData } from './tracker-directory-utils';

// ── Types ──

export interface GeoNode {
  id: string;
  label: string;
  level: 'root' | 'region' | 'country' | 'state' | 'city' | 'neighborhood';
  trackers: TrackerCardData[];       // trackers at exactly this level
  secondaryTrackers: TrackerCardData[]; // trackers here via geoSecondary
  children: GeoNode[];
  trackerCount: number;              // total trackers in this subtree
  aggregateTracker?: TrackerCardData; // the aggregate: true tracker for this node, if any
}

export interface GeoTree extends GeoNode {
  global: TrackerCardData[];   // region: 'global' trackers
  ungrouped: TrackerCardData[]; // no geoPath and not global
}

// ── Region display labels ──

const REGION_LABELS: Record<string, string> = {
  'north-america': 'North America',
  'central-america': 'Central America',
  'south-america': 'South America',
  'europe': 'Europe',
  'middle-east': 'Middle East',
  'africa': 'Africa',
  'central-asia': 'Central Asia',
  'south-asia': 'South Asia',
  'east-asia': 'East Asia',
  'southeast-asia': 'Southeast Asia',
  'oceania': 'Oceania',
};

// ── Level order for geoPath segments ──

const LEVELS: GeoNode['level'][] = ['country', 'state', 'city', 'neighborhood'];

// ── Core functions ──

export function buildGeoTree(trackers: TrackerCardData[]): GeoTree {
  const root: GeoTree = {
    id: 'world',
    label: 'World',
    level: 'root',
    trackers: [],
    secondaryTrackers: [],
    children: [],
    trackerCount: 0,
    global: [],
    ungrouped: [],
  };

  // Separate global and ungrouped
  const geoTrackers: TrackerCardData[] = [];
  for (const t of trackers) {
    if (!t.geoPath || t.geoPath.length === 0) {
      if (t.region === 'global') {
        root.global.push(t);
      } else {
        root.ungrouped.push(t);
      }
    } else {
      geoTrackers.push(t);
    }
  }

  // Group by region first
  const regionMap = new Map<string, TrackerCardData[]>();
  for (const t of geoTrackers) {
    const region = t.region || 'global';
    if (!regionMap.has(region)) regionMap.set(region, []);
    regionMap.get(region)!.push(t);
  }

  // Build region nodes
  for (const [regionId, regionTrackers] of regionMap) {
    const regionNode: GeoNode = {
      id: regionId,
      label: REGION_LABELS[regionId] || regionId,
      level: 'region',
      trackers: [],
      secondaryTrackers: [],
      children: [],
      trackerCount: 0,
    };

    // Build subtree from geoPath segments
    for (const t of regionTrackers) {
      insertTracker(regionNode, t, t.geoPath!, 0);
    }

    // Handle geoSecondary — add as secondary references
    for (const t of geoTrackers) {
      if (!t.geoSecondary) continue;
      for (const secondaryCountry of t.geoSecondary) {
        // Check if this secondary country belongs to this region
        const belongsHere = regionTrackers.some(
          rt => rt.geoPath?.[0] === secondaryCountry
        );
        if (belongsHere) {
          let countryNode = regionNode.children.find(c => c.id === secondaryCountry);
          if (!countryNode) {
            countryNode = makeNode(secondaryCountry, secondaryCountry, 'country');
            regionNode.children.push(countryNode);
          }
          countryNode.secondaryTrackers.push(t);
        }
      }
    }

    updateCounts(regionNode);
    if (regionNode.trackerCount > 0 || regionNode.children.length > 0) {
      root.children.push(regionNode);
    }
  }

  // Sort regions by tracker count (descending)
  root.children.sort((a, b) => b.trackerCount - a.trackerCount);
  updateCounts(root);

  return root;
}

function insertTracker(parent: GeoNode, tracker: TrackerCardData, geoPath: string[], depth: number): void {
  if (depth >= geoPath.length) {
    // This tracker lives at exactly this level
    if (tracker.aggregate) {
      parent.aggregateTracker = tracker;
    } else {
      parent.trackers.push(tracker);
    }
    return;
  }

  const segment = geoPath[depth];
  const level = LEVELS[depth] || 'neighborhood';
  let child = parent.children.find(c => c.id === segment);
  if (!child) {
    // Use display labels from tracker if available
    const label = depth === 0
      ? segment // country code — display label comes from tracker shortName or lookup
      : segment; // state/city names are already human-readable
    child = makeNode(segment, label, level);
    parent.children.push(child);
  }

  insertTracker(child, tracker, geoPath, depth + 1);
}

function makeNode(id: string, label: string, level: GeoNode['level']): GeoNode {
  return {
    id,
    label,
    level,
    trackers: [],
    secondaryTrackers: [],
    children: [],
    trackerCount: 0,
  };
}

function updateCounts(node: GeoNode): number {
  let count = node.trackers.length + (node.aggregateTracker ? 1 : 0);
  for (const child of node.children) {
    count += updateCounts(child);
  }
  node.trackerCount = count;
  return count;
}

export function findChildren(
  allTrackers: TrackerCardData[],
  parentGeoPath: string[],
): TrackerCardData[] {
  return allTrackers.filter(t => {
    if (!t.geoPath || t.geoPath.length <= parentGeoPath.length) return false;
    return parentGeoPath.every((seg, i) => t.geoPath![i] === seg);
  });
}

export function resolveGeoNode(tree: GeoTree, path: string[]): GeoNode | undefined {
  let current: GeoNode = tree;
  for (const segment of path) {
    const child = current.children.find(c => c.id === segment);
    if (!child) return undefined;
    current = child;
  }
  return current;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run src/lib/geo-utils.test.ts 2>&1`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo-utils.ts src/lib/geo-utils.test.ts
git commit -m "feat(geo): add geo-utils with buildGeoTree, findChildren, resolveGeoNode"
```

---

## Task 4: Update TrackerCardData and serialization with geo fields

**Files:**
- Modify: `src/lib/tracker-directory-utils.ts:8-45,83-93`
- Modify: `src/pages/index.astro:101-139`

- [ ] **Step 1: Add geo fields to TrackerCardData interface**

In `src/lib/tracker-directory-utils.ts`, add after `country` (line 19):

```typescript
  state?: string;
  city?: string;
  neighborhood?: string;
  geoPath?: string[];
  geoSecondary?: string[];
  aggregate?: boolean;
```

- [ ] **Step 2: Add state/city/geoPath to matchesSearch**

In `src/lib/tracker-directory-utils.ts`, update `matchesSearch()` (line 83-93). Add these conditions to the return:

```typescript
    (tracker.state?.toLowerCase().includes(q) ?? false) ||
    (tracker.city?.toLowerCase().includes(q) ?? false) ||
    (tracker.neighborhood?.toLowerCase().includes(q) ?? false) ||
    (tracker.geoPath?.some(seg => seg.toLowerCase().includes(q)) ?? false)
```

- [ ] **Step 3: Add geo fields to serializedTrackers in index.astro**

In `src/pages/index.astro`, add to the return object (around line 115, after `country`):

```typescript
    state: t.state,
    city: t.city,
    neighborhood: t.neighborhood,
    geoPath: t.geoPath,
    geoSecondary: t.geoSecondary,
    aggregate: t.aggregate,
```

- [ ] **Step 4: Update existing tests**

In `src/lib/tracker-directory-utils.test.ts`, update `makeTracker` helper to include optional geo fields that can be overridden:

No changes needed — the existing helper uses `Partial<TrackerCardData>` with spread, so new optional fields work automatically.

Add a test for searching by state:

```typescript
  it('matches by state', () => {
    const t = makeTracker({ state: 'Sinaloa', geoPath: ['MX', 'Sinaloa'] });
    expect(matchesSearch(t, 'sinaloa')).toBe(true);
  });
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/tracker-directory-utils.test.ts 2>&1`
Expected: All tests PASS

- [ ] **Step 6: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/lib/tracker-directory-utils.ts src/lib/tracker-directory-utils.test.ts src/pages/index.astro
git commit -m "feat(geo): add geographic fields to TrackerCardData and search"
```

---

## Task 5: ViewModeToggle component

**Files:**
- Create: `src/components/islands/CommandCenter/ViewModeToggle.tsx`

- [ ] **Step 1: Create the ViewModeToggle component**

```tsx
import { memo } from 'react';
import type { CSSProperties } from 'react';

export type ViewMode = 'operations' | 'geographic' | 'domain';

interface Props {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const MODES: { id: ViewMode; label: string; icon: string }[] = [
  { id: 'operations', label: 'OPS', icon: '◉' },
  { id: 'geographic', label: 'GEO', icon: '🌍' },
  { id: 'domain', label: 'DOMAIN', icon: '◫' },
];

export default memo(function ViewModeToggle({ mode, onChange }: Props) {
  return (
    <div style={S.wrap}>
      {MODES.map(m => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          style={{
            ...S.pill,
            ...(mode === m.id ? S.pillActive : {}),
          }}
        >
          <span style={S.pillIcon}>{m.icon}</span>
          <span>{m.label}</span>
        </button>
      ))}
    </div>
  );
});

const S = {
  wrap: {
    display: 'flex',
    gap: '2px',
    padding: '4px',
    background: 'var(--bg-card, #161b22)',
    borderRadius: '6px',
    margin: '0 8px 6px',
  } as CSSProperties,
  pill: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    border: 'none',
    borderRadius: '4px',
    background: 'transparent',
    color: 'var(--text-muted, #8b949e)',
    fontSize: '0.6rem',
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 600,
    letterSpacing: '0.5px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    flex: 1,
    justifyContent: 'center',
  } as CSSProperties,
  pillActive: {
    background: 'rgba(31,111,235,0.15)',
    color: 'var(--accent-blue, #58a6ff)',
    border: '1px solid rgba(31,111,235,0.3)',
  } as CSSProperties,
  pillIcon: {
    fontSize: '0.7rem',
  } as CSSProperties,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/islands/CommandCenter/ViewModeToggle.tsx
git commit -m "feat(geo): add ViewModeToggle component"
```

---

## Task 6: GeoAccordion component

**Files:**
- Create: `src/components/islands/CommandCenter/GeoAccordion.tsx`

- [ ] **Step 1: Create the GeoAccordion component**

```tsx
import { useState, useMemo, useCallback, memo } from 'react';
import type { CSSProperties } from 'react';
import { buildGeoTree, type GeoNode, type GeoTree } from '../../../lib/geo-utils';
import { computeFreshness } from '../../../lib/tracker-directory-utils';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';

interface Props {
  trackers: TrackerCardData[];
  basePath: string;
  activeTracker: string | null;
  onSelectTracker: (slug: string | null) => void;
  onHoverTracker: (slug: string | null) => void;
}

export default memo(function GeoAccordion({
  trackers,
  basePath,
  activeTracker,
  onSelectTracker,
  onHoverTracker,
}: Props) {
  const tree = useMemo(() => buildGeoTree(trackers), [trackers]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = useCallback((nodeId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  return (
    <div style={S.wrap}>
      {/* Global trackers */}
      {tree.global.length > 0 && (
        <div>
          <div style={S.sectionHeader}>🌐 GLOBAL</div>
          {tree.global.map(t => (
            <TrackerLeaf
              key={t.slug}
              tracker={t}
              basePath={basePath}
              isActive={activeTracker === t.slug}
              onSelect={onSelectTracker}
              onHover={onHoverTracker}
            />
          ))}
        </div>
      )}

      {/* Region accordion */}
      {tree.children.map(region => (
        <RegionNode
          key={region.id}
          node={region}
          basePath={basePath}
          activeTracker={activeTracker}
          expanded={expanded}
          onToggle={toggle}
          onSelect={onSelectTracker}
          onHover={onHoverTracker}
          depth={0}
        />
      ))}
    </div>
  );
});

// ── Recursive accordion node ──

const RegionNode = memo(function RegionNode({
  node,
  basePath,
  activeTracker,
  expanded,
  onToggle,
  onSelect,
  onHover,
  depth,
}: {
  node: GeoNode;
  basePath: string;
  activeTracker: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (slug: string | null) => void;
  onHover: (slug: string | null) => void;
  depth: number;
}) {
  const nodeKey = `${depth}-${node.id}`;
  const isExpanded = expanded.has(nodeKey);
  const hasChildren = node.children.length > 0 || node.trackers.length > 0;

  return (
    <div style={{ marginLeft: depth > 0 ? 12 : 0 }}>
      <div
        style={{
          ...S.nodeHeader,
          ...(depth === 0 ? S.regionHeader : S.subHeader),
        }}
        onClick={() => hasChildren && onToggle(nodeKey)}
      >
        <span style={S.chevron}>{hasChildren ? (isExpanded ? '▾' : '▸') : '·'}</span>
        <span style={S.nodeLabel}>{node.label}</span>
        <span style={S.nodeCount}>{node.trackerCount}</span>
      </div>

      {isExpanded && (
        <div>
          {/* Aggregate tracker first */}
          {node.aggregateTracker && (
            <TrackerLeaf
              tracker={node.aggregateTracker}
              basePath={basePath}
              isActive={activeTracker === node.aggregateTracker.slug}
              onSelect={onSelect}
              onHover={onHover}
              isAggregate
            />
          )}

          {/* Direct trackers at this level */}
          {node.trackers.map(t => (
            <TrackerLeaf
              key={t.slug}
              tracker={t}
              basePath={basePath}
              isActive={activeTracker === t.slug}
              onSelect={onSelect}
              onHover={onHover}
            />
          ))}

          {/* Secondary references */}
          {node.secondaryTrackers.length > 0 && (
            <div style={S.secondarySection}>
              <span style={S.secondaryLabel}>Also covers:</span>
              {node.secondaryTrackers.map(t => (
                <TrackerLeaf
                  key={`sec-${t.slug}`}
                  tracker={t}
                  basePath={basePath}
                  isActive={activeTracker === t.slug}
                  onSelect={onSelect}
                  onHover={onHover}
                />
              ))}
            </div>
          )}

          {/* Child nodes */}
          {node.children.map(child => (
            <RegionNode
              key={child.id}
              node={child}
              basePath={basePath}
              activeTracker={activeTracker}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              onHover={onHover}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// ── Leaf tracker row ──

const TrackerLeaf = memo(function TrackerLeaf({
  tracker,
  basePath,
  isActive,
  onSelect,
  onHover,
  isAggregate,
}: {
  tracker: TrackerCardData;
  basePath: string;
  isActive: boolean;
  onSelect: (slug: string | null) => void;
  onHover: (slug: string | null) => void;
  isAggregate?: boolean;
}) {
  const freshness = computeFreshness(tracker.lastUpdated);
  const color = tracker.color || '#3498db';

  return (
    <div
      style={{
        ...S.leaf,
        borderLeftColor: color,
        background: isActive ? `${color}15` : 'transparent',
      }}
      onClick={() => onSelect(isActive ? null : tracker.slug)}
      onMouseEnter={() => onHover(tracker.slug)}
      onMouseLeave={() => onHover(null)}
      onDoubleClick={() => { window.location.href = `${basePath}${tracker.slug}/`; }}
    >
      <span style={S.leafIcon}>{tracker.icon || ''}</span>
      <span style={{ ...S.leafName, fontWeight: isAggregate ? 700 : 500 }}>
        {tracker.shortName}
      </span>
      {isAggregate && <span style={S.aggBadge}>HUB</span>}
      <span
        style={{
          ...S.leafStatus,
          color: freshness.className === 'fresh' ? 'var(--accent-green)' : freshness.className === 'recent' ? 'var(--accent-amber)' : 'var(--text-muted)',
        }}
        suppressHydrationWarning
      >
        {freshness.ageText}
      </span>
    </div>
  );
});

// ── Styles ──

const S = {
  wrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  } as CSSProperties,
  sectionHeader: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.6rem',
    fontWeight: 700,
    letterSpacing: '1px',
    color: 'var(--text-muted)',
    padding: '8px 12px 4px',
  } as CSSProperties,
  nodeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 10px',
    cursor: 'pointer',
    userSelect: 'none' as const,
    transition: 'background 0.1s',
  } as CSSProperties,
  regionHeader: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: '0.5px',
    color: 'var(--text-secondary, #c9d1d9)',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  subHeader: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.62rem',
    fontWeight: 600,
    color: 'var(--text-muted, #8b949e)',
  } as CSSProperties,
  chevron: {
    fontSize: '0.6rem',
    color: 'var(--text-muted)',
    width: '10px',
    flexShrink: 0,
  } as CSSProperties,
  nodeLabel: {} as CSSProperties,
  nodeCount: {
    marginLeft: 'auto',
    fontSize: '0.55rem',
    color: 'var(--text-muted)',
    background: 'var(--bg-card, #161b22)',
    padding: '1px 5px',
    borderRadius: '8px',
  } as CSSProperties,
  leaf: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px 4px 14px',
    borderLeft: '2px solid transparent',
    cursor: 'pointer',
    transition: 'background 0.1s',
    fontSize: '0.72rem',
  } as CSSProperties,
  leafIcon: {
    fontSize: '0.8rem',
    flexShrink: 0,
  } as CSSProperties,
  leafName: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.72rem',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as CSSProperties,
  leafStatus: {
    marginLeft: 'auto',
    fontSize: '0.55rem',
    fontFamily: "'DM Sans', sans-serif",
    flexShrink: 0,
  } as CSSProperties,
  aggBadge: {
    fontSize: '0.45rem',
    fontWeight: 700,
    letterSpacing: '0.5px',
    color: 'var(--accent-blue, #58a6ff)',
    background: 'rgba(31,111,235,0.12)',
    padding: '1px 4px',
    borderRadius: '3px',
    flexShrink: 0,
  } as CSSProperties,
  secondarySection: {
    marginLeft: '14px',
    borderLeft: '1px dashed var(--border)',
    paddingLeft: '8px',
  } as CSSProperties,
  secondaryLabel: {
    fontSize: '0.5rem',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
    display: 'block',
    padding: '2px 0',
  } as CSSProperties,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/islands/CommandCenter/GeoAccordion.tsx
git commit -m "feat(geo): add GeoAccordion component for geographic drill-down"
```

---

## Task 7: Wire view mode into CommandCenter and SidebarPanel

**Files:**
- Modify: `src/components/islands/CommandCenter/CommandCenter.tsx:43-48,56-60`
- Modify: `src/components/islands/CommandCenter/SidebarPanel.tsx:15-31,508-660`

- [ ] **Step 1: Add viewMode state to CommandCenter**

In `CommandCenter.tsx`, add import at top:

```typescript
import type { ViewMode } from './ViewModeToggle';
```

After `const [broadcastOff, setBroadcastOff] = useState(false);` (around line 60), add:

```typescript
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'geo') return 'geographic';
      if (hash === 'domain') return 'domain';
    }
    return 'operations';
  });
```

Add a `useEffect` to sync hash:

```typescript
  useEffect(() => {
    const hash = viewMode === 'operations' ? '' : viewMode === 'geographic' ? '#geo' : '#domain';
    if (hash) {
      window.history.replaceState(null, '', hash);
    } else if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [viewMode]);
```

- [ ] **Step 2: Pass viewMode to SidebarPanel**

In `CommandCenter.tsx`, find where `<SidebarPanel` is rendered (around line 296). Add props:

```tsx
  viewMode={viewMode}
  onChangeViewMode={setViewMode}
```

- [ ] **Step 3: Update SidebarPanel Props interface**

In `SidebarPanel.tsx`, add to Props interface (line 15-31):

```typescript
  viewMode?: import('./ViewModeToggle').ViewMode;
  onChangeViewMode?: (mode: import('./ViewModeToggle').ViewMode) => void;
```

- [ ] **Step 4: Replace domain tabs with ViewModeToggle + conditional content**

In `SidebarPanel.tsx`, add imports at top:

```typescript
import ViewModeToggle from './ViewModeToggle';
import type { ViewMode } from './ViewModeToggle';
import GeoAccordion from './GeoAccordion';
```

Replace the domain tabs section (lines ~638-658) and tracker list section (lines ~661-700) with:

```tsx
      {/* View mode toggle */}
      {onChangeViewMode && (
        <ViewModeToggle mode={viewMode || 'operations'} onChange={onChangeViewMode} />
      )}

      {/* Domain tabs — only in domain mode */}
      {(viewMode || 'operations') === 'domain' && (
        <div style={S.tabs}>
          <button type="button" className="cc-domain-tab" style={S.tab(!activeDomain)} onClick={() => setActiveDomain(null)}>
            ALL <span style={S.tabCount}>{trackers.length}</span>
          </button>
          {visibleDomains.map(d => (
            <button key={d} type="button" className="cc-domain-tab" style={S.tab(activeDomain === d, DOMAIN_COLORS[d])} onClick={() => setActiveDomain(activeDomain === d ? null : d)}>
              {d.toUpperCase()} <span style={S.tabCount}>{domainCounts[d]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tracker list */}
      <div style={S.list}>
        {(viewMode || 'operations') === 'geographic' ? (
          <GeoAccordion
            trackers={filtered}
            basePath={basePath}
            activeTracker={activeTracker}
            onSelectTracker={onSelectTracker}
            onHoverTracker={onHoverTracker}
          />
        ) : (
          <>
            {!isSearching && <RecentEventsFeed trackers={trackers} basePath={basePath} followedSlugs={followedSlugs} onSelect={onSelectTracker} locale={locale} />}
            {filtered.length === 0 ? (
              <div style={S.noResults}>{t('cc.noResults', locale)}</div>
            ) : (
              groups.map(group => {
                if (group.type === 'series') {
                  return (
                    <SeriesStrip
                      key={`series-${group.label}`}
                      group={group}
                      basePath={basePath}
                      activeTracker={activeTracker}
                      hoveredTracker={hoveredTracker}
                      onSelect={onSelectTracker}
                      onHover={onHoverTracker}
                    />
                  );
                }
                return (
                  <div key={`${group.type}-${group.label}`}>
                    <div style={S.groupHeader(group.type)}>
                      {group.labelIcon && <span style={S.groupIcon(group.type)}>{group.labelIcon}</span>}
                      <span>{group.label.toUpperCase()}</span>
                    </div>
                    {group.trackers.map(t => (
                      <TrackerRow
                        key={t.slug}
                        tracker={t}
                        basePath={basePath}
                        isActive={activeTracker === t.slug}
                        isHovered={hoveredTracker === t.slug}
                        isFollowed={followedSlugs.includes(t.slug)}
                        isCompared={compareSlugs.includes(t.slug)}
                        onSelect={onSelectTracker}
                        onHover={onHoverTracker}
                        onToggleFollow={onToggleFollow}
                        onToggleCompare={onToggleCompare}
                        locale={locale}
                      />
                    ))}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
```

- [ ] **Step 5: Verify dev server works**

Run: `npm run dev -- --host 2>&1 | head -5`
Open browser, check: Operations mode shows today's layout, Geographic mode shows accordion, Domain mode shows domain tabs.

- [ ] **Step 6: Commit**

```bash
git add src/components/islands/CommandCenter/CommandCenter.tsx src/components/islands/CommandCenter/SidebarPanel.tsx
git commit -m "feat(geo): wire view mode toggle into Command Center sidebar"
```

---

## Task 8: GeoBreadcrumb component for tracker dashboards

**Files:**
- Create: `src/components/static/GeoBreadcrumb.astro`
- Modify: `src/pages/[tracker]/index.astro:52-62`

- [ ] **Step 1: Create GeoBreadcrumb.astro**

```astro
---
interface Props {
  geoPath?: string[];
  country?: string;
  state?: string;
  city?: string;
  neighborhood?: string;
}

const { geoPath, country, state, city, neighborhood } = Astro.props;
const base = import.meta.env.BASE_URL;
const basePath = base.endsWith('/') ? base : `${base}/`;

if (!geoPath || geoPath.length === 0) return;

// Build breadcrumb segments with display labels and links
const segments: { label: string; href: string }[] = [];
const labels = [country || geoPath[0], state, city, neighborhood].filter(Boolean) as string[];

for (let i = 0; i < geoPath.length; i++) {
  const pathSlice = geoPath.slice(0, i + 1).join('/');
  segments.push({
    label: labels[i] || geoPath[i],
    href: `${basePath}geo/${pathSlice}/`,
  });
}
---

<nav class="geo-breadcrumb" aria-label="Geographic location">
  <span class="geo-pin">📍</span>
  {segments.map((seg, i) => (
    <>
      {i > 0 && <span class="geo-sep">›</span>}
      <a href={seg.href} class="geo-link">{seg.label}</a>
    </>
  ))}
</nav>

<style>
  .geo-breadcrumb {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: 'DM Sans', sans-serif;
    font-size: 0.7rem;
    margin-bottom: 4px;
  }
  .geo-pin {
    font-size: 0.75rem;
  }
  .geo-sep {
    color: var(--text-muted);
  }
  .geo-link {
    color: var(--accent-blue, #58a6ff);
    text-decoration: none;
    transition: opacity 0.15s;
  }
  .geo-link:hover {
    opacity: 0.8;
    text-decoration: underline;
  }
</style>
```

- [ ] **Step 2: Add breadcrumb to tracker dashboard hero**

In `src/pages/[tracker]/index.astro`, add import at top (after other static imports):

```astro
import GeoBreadcrumb from '../../components/static/GeoBreadcrumb.astro';
```

Add the breadcrumb just before `<HeroKpiCombo>` (around line 62):

```astro
      <GeoBreadcrumb
        geoPath={config.geoPath}
        country={config.country}
        state={config.state}
        city={config.city}
        neighborhood={config.neighborhood}
      />
      <HeroKpiCombo meta={data.meta} kpis={data.kpis} />
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/static/GeoBreadcrumb.astro src/pages/[tracker]/index.astro
git commit -m "feat(geo): add GeoBreadcrumb to tracker dashboards"
```

---

## Task 9: Geographic routes — /geo/ pages

**Files:**
- Create: `src/pages/geo/index.astro`
- Create: `src/pages/geo/[...path].astro`
- Create: `src/components/static/GeoIndex.astro`

- [ ] **Step 1: Create GeoIndex.astro — lightweight index template**

```astro
---
import type { TrackerConfig } from '../../lib/tracker-config';

interface Props {
  label: string;
  path: string[];
  trackers: Array<{
    slug: string;
    shortName: string;
    icon?: string;
    color?: string;
    description: string;
    lastUpdated: string;
    status: string;
  }>;
  childNodes: Array<{
    id: string;
    label: string;
    trackerCount: number;
    href: string;
  }>;
  breadcrumb: Array<{ label: string; href: string }>;
}

const { label, trackers, childNodes, breadcrumb } = Astro.props;
const base = import.meta.env.BASE_URL;
const basePath = base.endsWith('/') ? base : `${base}/`;
---

<div class="geo-index">
  <nav class="geo-index-breadcrumb" aria-label="Geographic navigation">
    <a href={`${basePath}geo/`} class="geo-crumb">🌍 World</a>
    {breadcrumb.map(seg => (
      <>
        <span class="geo-crumb-sep">›</span>
        <a href={seg.href} class="geo-crumb">{seg.label}</a>
      </>
    ))}
  </nav>

  <h1 class="geo-index-title">{label}</h1>
  <p class="geo-index-subtitle">{trackers.length} tracker{trackers.length !== 1 ? 's' : ''} in this region</p>

  {childNodes.length > 0 && (
    <div class="geo-subregions">
      <h2 class="geo-section-title">Sub-regions</h2>
      <div class="geo-subregion-grid">
        {childNodes.map(node => (
          <a href={node.href} class="geo-subregion-card">
            <span class="geo-subregion-name">{node.label}</span>
            <span class="geo-subregion-count">{node.trackerCount} tracker{node.trackerCount !== 1 ? 's' : ''}</span>
          </a>
        ))}
      </div>
    </div>
  )}

  {trackers.length > 0 && (
    <div class="geo-trackers">
      <h2 class="geo-section-title">Trackers</h2>
      <div class="geo-tracker-grid">
        {trackers.map(t => (
          <a href={`${basePath}${t.slug}/`} class="geo-tracker-card" style={`border-left-color: ${t.color || '#3498db'}`}>
            <div class="geo-tracker-header">
              <span class="geo-tracker-icon">{t.icon || ''}</span>
              <span class="geo-tracker-name">{t.shortName}</span>
            </div>
            <p class="geo-tracker-desc">{t.description}</p>
          </a>
        ))}
      </div>
    </div>
  )}
</div>

<style>
  .geo-index {
    max-width: 900px;
    margin: 0 auto;
    padding: 24px 16px;
    font-family: 'DM Sans', sans-serif;
  }
  .geo-index-breadcrumb {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    margin-bottom: 16px;
  }
  .geo-crumb {
    color: var(--accent-blue, #58a6ff);
    text-decoration: none;
  }
  .geo-crumb:hover { text-decoration: underline; }
  .geo-crumb-sep { color: var(--text-muted); }
  .geo-index-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 4px;
  }
  .geo-index-subtitle {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin: 0 0 24px;
  }
  .geo-section-title {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--text-muted);
    margin: 0 0 12px;
  }
  .geo-subregion-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 8px;
    margin-bottom: 24px;
  }
  .geo-subregion-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px;
    background: var(--bg-card, #161b22);
    border: 1px solid var(--border);
    border-radius: 6px;
    text-decoration: none;
    transition: border-color 0.15s;
  }
  .geo-subregion-card:hover {
    border-color: var(--accent-blue, #58a6ff);
  }
  .geo-subregion-name {
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--text-primary);
  }
  .geo-subregion-count {
    font-size: 0.65rem;
    color: var(--text-muted);
  }
  .geo-tracker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 10px;
  }
  .geo-tracker-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    background: var(--bg-card, #161b22);
    border: 1px solid var(--border);
    border-left: 3px solid;
    border-radius: 6px;
    text-decoration: none;
    transition: border-color 0.15s;
  }
  .geo-tracker-card:hover {
    border-color: var(--accent-blue, #58a6ff);
  }
  .geo-tracker-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .geo-tracker-icon { font-size: 1rem; }
  .geo-tracker-name {
    font-weight: 600;
    font-size: 0.85rem;
    color: var(--text-primary);
  }
  .geo-tracker-desc {
    font-size: 0.7rem;
    color: var(--text-muted);
    margin: 0;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
```

- [ ] **Step 2: Create /geo/index.astro — world overview**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import GeoIndex from '../../components/static/GeoIndex.astro';
import { loadAllTrackers } from '../../lib/tracker-registry';

const trackers = loadAllTrackers().filter(t => t.status !== 'draft');
const base = import.meta.env.BASE_URL;
const basePath = base.endsWith('/') ? base : `${base}/`;

// Group by region
const regionMap = new Map<string, typeof trackers>();
for (const t of trackers) {
  const region = t.region || 'global';
  if (!regionMap.has(region)) regionMap.set(region, []);
  regionMap.get(region)!.push(t);
}

const REGION_LABELS: Record<string, string> = {
  'north-america': 'North America',
  'central-america': 'Central America',
  'south-america': 'South America',
  'europe': 'Europe',
  'middle-east': 'Middle East',
  'africa': 'Africa',
  'central-asia': 'Central Asia',
  'south-asia': 'South Asia',
  'east-asia': 'East Asia',
  'southeast-asia': 'Southeast Asia',
  'oceania': 'Oceania',
  'global': 'Global',
};

const childNodes = [...regionMap.entries()]
  .map(([id, ts]) => ({
    id,
    label: REGION_LABELS[id] || id,
    trackerCount: ts.length,
    href: `${basePath}geo/${id}/`,
  }))
  .sort((a, b) => b.trackerCount - a.trackerCount);
---
<BaseLayout title="Geographic Explorer — Watchboard">
  <main id="main-content">
    <GeoIndex
      label="World"
      path={[]}
      trackers={[]}
      childNodes={childNodes}
      breadcrumb={[]}
    />
  </main>
</BaseLayout>
```

- [ ] **Step 3: Create /geo/[...path].astro — catch-all geographic route**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import GeoIndex from '../../components/static/GeoIndex.astro';
import { loadAllTrackers } from '../../lib/tracker-registry';
import { loadTrackerData } from '../../lib/data';

const REGION_LABELS: Record<string, string> = {
  'north-america': 'North America',
  'central-america': 'Central America',
  'south-america': 'South America',
  'europe': 'Europe',
  'middle-east': 'Middle East',
  'africa': 'Africa',
  'central-asia': 'Central Asia',
  'south-asia': 'South Asia',
  'east-asia': 'East Asia',
  'southeast-asia': 'Southeast Asia',
  'oceania': 'Oceania',
  'global': 'Global',
};

export function getStaticPaths() {
  const trackers = loadAllTrackers().filter(t => t.status !== 'draft');
  const paths = new Set<string>();

  // Region-level paths
  for (const t of trackers) {
    if (t.region) paths.add(t.region);
  }

  // geoPath prefix paths: /geo/MX, /geo/MX/Sinaloa, etc.
  for (const t of trackers) {
    if (!t.geoPath) continue;
    for (let i = 0; i < t.geoPath.length; i++) {
      const regionPrefix = t.region || 'global';
      const geoSlice = t.geoPath.slice(0, i + 1);
      paths.add(`${regionPrefix}/${geoSlice.join('/')}`);
    }
  }

  return [...paths].map(p => ({
    params: { path: p },
  }));
}

const { path: rawPath } = Astro.params;
const pathSegments = (rawPath as string).split('/');
const base = import.meta.env.BASE_URL;
const basePath = base.endsWith('/') ? base : `${base}/`;

const allTrackers = loadAllTrackers().filter(t => t.status !== 'draft');
const regionId = pathSegments[0];
const geoSegments = pathSegments.slice(1); // country, state, city...

// Filter trackers for this geographic node
let matchingTrackers = allTrackers.filter(t => t.region === regionId);
if (geoSegments.length > 0) {
  matchingTrackers = matchingTrackers.filter(t => {
    if (!t.geoPath) return false;
    return geoSegments.every((seg, i) => t.geoPath![i] === seg);
  });
}

// Check if there's an aggregate tracker at this exact level
const aggregateTracker = matchingTrackers.find(
  t => t.aggregate && t.geoPath?.length === geoSegments.length
);

// If there's a full aggregate tracker, redirect to its dashboard
// For now, render the GeoIndex template
const directTrackers = matchingTrackers.filter(t => {
  if (!t.geoPath) return geoSegments.length === 0;
  return t.geoPath.length === geoSegments.length;
});

// Build child nodes (next level down)
const childMap = new Map<string, number>();
for (const t of matchingTrackers) {
  if (!t.geoPath || t.geoPath.length <= geoSegments.length) continue;
  const nextSegment = t.geoPath[geoSegments.length];
  childMap.set(nextSegment, (childMap.get(nextSegment) || 0) + 1);
}

const childNodes = [...childMap.entries()]
  .map(([id, count]) => ({
    id,
    label: id,
    trackerCount: count,
    href: `${basePath}geo/${pathSegments.join('/')}/${id}/`,
  }))
  .sort((a, b) => b.trackerCount - a.trackerCount);

// Build breadcrumb
const breadcrumb = pathSegments.map((seg, i) => ({
  label: i === 0 ? (REGION_LABELS[seg] || seg) : seg,
  href: `${basePath}geo/${pathSegments.slice(0, i + 1).join('/')}/`,
}));

const label = geoSegments.length > 0
  ? geoSegments[geoSegments.length - 1]
  : (REGION_LABELS[regionId] || regionId);

const serializedTrackers = directTrackers.map(t => ({
  slug: t.slug,
  shortName: t.shortName,
  icon: t.icon,
  color: t.color,
  description: t.description,
  lastUpdated: (() => {
    try {
      const data = loadTrackerData(t.slug, t.eraLabel);
      return data.meta.lastUpdated;
    } catch {
      return t.startDate;
    }
  })(),
  status: t.status,
}));
---
<BaseLayout title={`${label} — Geographic Explorer — Watchboard`}>
  <main id="main-content">
    <GeoIndex
      label={label}
      path={pathSegments}
      trackers={serializedTrackers}
      childNodes={childNodes}
      breadcrumb={breadcrumb}
    />
  </main>
</BaseLayout>
```

- [ ] **Step 4: Verify build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds, new pages generated at `/geo/`, `/geo/north-america/`, `/geo/north-america/MX/`, etc.

- [ ] **Step 5: Verify routes manually**

Run: `ls dist/watchboard/geo/ 2>/dev/null || echo 'not found'`
Expected: Directory exists with `index.html` and subdirectories

- [ ] **Step 6: Commit**

```bash
git add src/pages/geo/ src/components/static/GeoIndex.astro
git commit -m "feat(geo): add /geo/ routes with geographic index pages"
```

---

## Task 10: Create aggregate tracker configs — Mexico and United States

**Files:**
- Create: `trackers/mexico/tracker.json`
- Create: `trackers/mexico/data/meta.json`
- Create: `trackers/united-states/tracker.json`
- Create: `trackers/united-states/data/meta.json`

- [ ] **Step 1: Create Mexico aggregate tracker**

Create `trackers/mexico/tracker.json`:

```json
{
  "slug": "mexico",
  "name": "Mexico Intelligence Hub",
  "shortName": "Mexico",
  "description": "Geographic hub aggregating intelligence from all Mexico-based trackers — cartel operations, political developments, and historical events.",
  "icon": "🇲🇽",
  "color": "#006847",
  "status": "active",
  "temporal": "live",
  "domain": "security",
  "region": "north-america",
  "country": "MX",
  "geoPath": ["MX"],
  "aggregate": true,
  "startDate": "2019-10-17",
  "sections": ["hero", "kpis", "timeline", "map"],
  "navSections": [
    {"id": "kpis", "label": "Overview"},
    {"id": "timeline", "label": "Timeline"},
    {"id": "map", "label": "Map"}
  ],
  "map": {
    "enabled": true,
    "bounds": {"lonMin": -118.4, "lonMax": -86.7, "latMin": 14.5, "latMax": 32.7},
    "center": {"lon": -102, "lat": 23.5},
    "categories": []
  }
}
```

Create `trackers/mexico/data/meta.json`:

```json
{
  "dayCount": 1,
  "lastUpdated": "2026-04-03",
  "heroHeadline": "Mexico Intelligence Hub — Aggregated view across all Mexico-based trackers",
  "heroSubtitle": "Cartel operations, political developments, and historical events"
}
```

- [ ] **Step 2: Create United States aggregate tracker**

Create `trackers/united-states/tracker.json`:

```json
{
  "slug": "united-states",
  "name": "United States Intelligence Hub",
  "shortName": "United States",
  "description": "Geographic hub aggregating intelligence from all US-based trackers — security operations, political history, and space programs.",
  "icon": "🇺🇸",
  "color": "#3C3B6E",
  "status": "active",
  "temporal": "live",
  "domain": "governance",
  "region": "north-america",
  "country": "US",
  "geoPath": ["US"],
  "aggregate": true,
  "startDate": "2001-09-11",
  "sections": ["hero", "kpis", "timeline", "map"],
  "navSections": [
    {"id": "kpis", "label": "Overview"},
    {"id": "timeline", "label": "Timeline"},
    {"id": "map", "label": "Map"}
  ],
  "map": {
    "enabled": true,
    "bounds": {"lonMin": -125, "lonMax": -66, "latMin": 24, "latMax": 50},
    "center": {"lon": -98, "lat": 38},
    "categories": []
  }
}
```

Create `trackers/united-states/data/meta.json`:

```json
{
  "dayCount": 1,
  "lastUpdated": "2026-04-03",
  "heroHeadline": "United States Intelligence Hub — Aggregated view across all US-based trackers",
  "heroSubtitle": "Security operations, political history, and space programs"
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds, new pages generated at `/mexico/` and `/united-states/`

- [ ] **Step 4: Commit**

```bash
git add trackers/mexico/ trackers/united-states/
git commit -m "feat(geo): add Mexico and United States aggregate tracker hubs"
```

---

## Task 11: Build-time data aggregation for aggregate trackers

**Files:**
- Modify: `src/lib/data.ts:156-209`

- [ ] **Step 1: Write failing test for aggregate data loading**

Create `src/lib/aggregate-data.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { aggregateTrackerData } from './geo-utils';
import type { TrackerData } from './data';

function makeTrackerData(overrides: Partial<TrackerData> = {}): TrackerData {
  return {
    kpis: [],
    timeline: [],
    mapPoints: [],
    mapLines: [],
    strikeTargets: [],
    retaliationData: [],
    assetsData: [],
    casualties: [],
    econ: [],
    claims: [],
    political: [],
    meta: { dayCount: 1, lastUpdated: '2026-01-01', heroHeadline: 'Test' } as any,
    digests: [],
    missionTrajectory: null,
    ...overrides,
  };
}

describe('aggregateTrackerData', () => {
  it('merges map points from children', () => {
    const parent = makeTrackerData();
    const children = [
      makeTrackerData({
        mapPoints: [{ id: 'p1', lat: 20, lon: -100, cat: 'base', date: '2026-01-01', label: 'Point A', sources: [] } as any],
      }),
      makeTrackerData({
        mapPoints: [{ id: 'p2', lat: 25, lon: -99, cat: 'base', date: '2026-01-02', label: 'Point B', sources: [] } as any],
      }),
    ];
    const result = aggregateTrackerData(parent, children);
    expect(result.mapPoints).toHaveLength(2);
  });

  it('merges timelines from children', () => {
    const parent = makeTrackerData();
    const children = [
      makeTrackerData({
        timeline: [{ era: 'Era 1', events: [{ date: '2026-01-01', title: 'Event A', year: '2026', sources: [] } as any] }],
      }),
      makeTrackerData({
        timeline: [{ era: 'Era 1', events: [{ date: '2026-01-02', title: 'Event B', year: '2026', sources: [] } as any] }],
      }),
    ];
    const result = aggregateTrackerData(parent, children);
    const allEvents = result.timeline.flatMap(e => e.events);
    expect(allEvents).toHaveLength(2);
  });

  it('parent data takes precedence over child data', () => {
    const parent = makeTrackerData({
      kpis: [{ value: '100', label: 'Custom KPI' } as any],
    });
    const children = [
      makeTrackerData({
        kpis: [{ value: '50', label: 'Child KPI' } as any],
      }),
    ];
    const result = aggregateTrackerData(parent, children);
    // Parent KPIs come first
    expect(result.kpis[0].label).toBe('Custom KPI');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx vitest run src/lib/aggregate-data.test.ts 2>&1 | tail -5`
Expected: FAIL — `aggregateTrackerData` not found

- [ ] **Step 3: Implement aggregateTrackerData in geo-utils.ts**

Add to `src/lib/geo-utils.ts`:

```typescript
import type { TrackerData } from './data';

export function aggregateTrackerData(
  parentData: TrackerData,
  childrenData: TrackerData[],
): TrackerData {
  // Parent's own data takes precedence; children fill gaps
  const hasOwnKpis = parentData.kpis.length > 0;
  const hasOwnTimeline = parentData.timeline.some(e => e.events.length > 0);
  const hasOwnMapPoints = parentData.mapPoints.length > 0;

  // Merge KPIs: parent first, then unique child KPIs
  const kpis = hasOwnKpis
    ? parentData.kpis
    : childrenData.flatMap(c => c.kpis);

  // Merge timeline events into a single era
  let timeline = parentData.timeline;
  if (!hasOwnTimeline) {
    const allEvents = childrenData
      .flatMap(c => c.timeline.flatMap(era => era.events))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Deduplicate by date + title similarity
    const seen = new Set<string>();
    const deduped = allEvents.filter(evt => {
      const key = `${evt.date}::${evt.title.toLowerCase().slice(0, 40)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (deduped.length > 0) {
      timeline = [{ era: 'Aggregated Events', events: deduped }];
    }
  }

  // Merge map data: union of all children + parent
  const mapPoints = hasOwnMapPoints
    ? parentData.mapPoints
    : childrenData.flatMap(c => c.mapPoints);

  const mapLines = parentData.mapLines.length > 0
    ? parentData.mapLines
    : childrenData.flatMap(c => c.mapLines);

  // Use latest meta from children for dayCount/lastUpdated
  const latestChild = childrenData
    .map(c => c.meta)
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())[0];

  const meta = {
    ...parentData.meta,
    dayCount: parentData.meta.dayCount || latestChild?.dayCount || 0,
    lastUpdated: parentData.meta.lastUpdated > (latestChild?.lastUpdated || '')
      ? parentData.meta.lastUpdated
      : (latestChild?.lastUpdated || parentData.meta.lastUpdated),
  };

  return {
    ...parentData,
    kpis,
    timeline,
    mapPoints,
    mapLines,
    casualties: parentData.casualties.length > 0
      ? parentData.casualties
      : childrenData.flatMap(c => c.casualties),
    meta,
  };
}
```

- [ ] **Step 4: Run test to confirm pass**

Run: `npx vitest run src/lib/aggregate-data.test.ts 2>&1`
Expected: All tests PASS

- [ ] **Step 5: Wire aggregation into loadTrackerData**

In `src/lib/data.ts`, add import at top:

```typescript
import { findChildren, aggregateTrackerData } from './geo-utils';
import { loadAllTrackers } from './tracker-registry';
```

At the end of `loadTrackerData()`, before the final `return` (line 208), add:

```typescript
  // Aggregate child tracker data if this is an aggregate tracker
  const config = loadAllTrackers().find(t => t.slug === slug);
  if (config?.aggregate) {
    const allConfigs = loadAllTrackers().filter(t => t.status !== 'draft');
    const childConfigs = findChildren(
      allConfigs.map(c => ({ ...c, geoPath: c.geoPath, topKpis: [], dayCount: 0, lastUpdated: c.startDate, sections: c.sections as string[] } as any)),
      config.geoPath || [],
    );
    const childrenData = childConfigs.map(c => {
      try {
        return loadTrackerData(c.slug, allConfigs.find(ac => ac.slug === c.slug)?.eraLabel);
      } catch {
        return null;
      }
    }).filter((d): d is TrackerData => d !== null);

    if (childrenData.length > 0) {
      const base = { kpis, timeline, mapPoints, mapLines, strikeTargets, retaliationData, assetsData, casualties, econ, claims, political, meta, digests, missionTrajectory };
      const aggregated = aggregateTrackerData(base, childrenData);
      return aggregated;
    }
  }
```

- [ ] **Step 6: Verify build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds. Mexico and US hub pages now show aggregated data from children.

- [ ] **Step 7: Commit**

```bash
git add src/lib/geo-utils.ts src/lib/aggregate-data.test.ts src/lib/data.ts
git commit -m "feat(geo): add build-time data aggregation for aggregate trackers"
```

---

## Task 12: Final integration test and cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run all tests**

Run: `npx vitest run 2>&1`
Expected: All tests pass

- [ ] **Step 2: Full build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds with no errors

- [ ] **Step 3: Verify geographic pages exist**

Run: `find dist/watchboard/geo -name 'index.html' | head -15`
Expected: Multiple index.html files at various geographic levels

- [ ] **Step 4: Verify aggregate tracker pages**

Run: `ls dist/watchboard/mexico/index.html dist/watchboard/united-states/index.html`
Expected: Both files exist

- [ ] **Step 5: Remove migration script**

Run: `rm scripts/migrate-geo-path.ts`

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(geo): geographic hierarchy — complete integration"
```
