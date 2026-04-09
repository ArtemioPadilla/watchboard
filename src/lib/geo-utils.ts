/**
 * Geographic hierarchy utilities for building and querying the geo tree.
 * Used by GeoAccordion, /geo/ routes, and aggregate data resolution.
 */

import type { TrackerCardData } from './tracker-directory-utils';
import type { TrackerData } from './data';
import { countryName } from './country-names';

// ── Types ──

export interface GeoNode {
  id: string;
  label: string;
  level: 'root' | 'region' | 'country' | 'state' | 'city' | 'neighborhood';
  trackers: TrackerCardData[];       // trackers at exactly this level
  secondaryTrackers: TrackerCardData[]; // trackers here via geoSecondary
  children: GeoNode[];
  trackerCount: number;              // total trackers in this subtree
  aggregateTracker?: TrackerCardData; // the aggregate: true tracker
}

export interface GeoTree extends GeoNode {
  global: TrackerCardData[];   // region: 'global' trackers
  ungrouped: TrackerCardData[]; // no geoPath and not global
}

// ── Region label mapping ──

const REGION_LABELS: Record<string, string> = {
  'north-america': 'North America',
  'south-america': 'South America',
  'latin-america': 'Latin America',
  'central-america': 'Central America',
  'europe': 'Europe',
  'middle-east': 'Middle East',
  'east-asia': 'East Asia',
  'south-asia': 'South Asia',
  'south-east-asia': 'South East Asia',
  'southeast-asia': 'Southeast Asia',
  'central-asia': 'Central Asia',
  'africa': 'Africa',
  'oceania': 'Oceania',
  'caribbean': 'Caribbean',
  'global': 'Global',
};

function regionLabel(regionId: string): string {
  return REGION_LABELS[regionId] ?? regionId
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Level order for geoPath segments (after region):
// geoPath[0] = country, [1] = state, [2] = city, [3] = neighborhood
const LEVEL_BY_DEPTH: GeoNode['level'][] = ['country', 'state', 'city', 'neighborhood'];

// ── Core functions ──

/**
 * Build a geographic tree from an array of tracker card data.
 * Groups by region (top level), then drills down via geoPath segments.
 */
export function buildGeoTree(trackers: TrackerCardData[]): GeoTree {
  const tree: GeoTree = {
    id: 'root',
    label: 'All Regions',
    level: 'root',
    trackers: [],
    secondaryTrackers: [],
    children: [],
    trackerCount: 0,
    global: [],
    ungrouped: [],
  };

  // Partition trackers into global, ungrouped, and geo-located
  const geoTrackers: TrackerCardData[] = [];

  for (const tracker of trackers) {
    if (tracker.region === 'global') {
      tree.global.push(tracker);
    } else if (!tracker.geoPath || tracker.geoPath.length === 0) {
      tree.ungrouped.push(tracker);
    } else {
      geoTrackers.push(tracker);
    }
  }

  // Build region map
  const regionMap = new Map<string, GeoNode>();

  for (const tracker of geoTrackers) {
    const regionId = tracker.region ?? 'unknown';

    // Ensure region node exists
    if (!regionMap.has(regionId)) {
      regionMap.set(regionId, {
        id: regionId,
        label: regionLabel(regionId),
        level: 'region',
        trackers: [],
        secondaryTrackers: [],
        children: [],
        trackerCount: 0,
      });
    }

    const regionNode = regionMap.get(regionId)!;
    insertTracker(regionNode, tracker, tracker.geoPath!, 0);

    // Handle geoSecondary: place as secondaryTrackers on secondary country nodes
    if (tracker.geoSecondary) {
      for (const secondaryCountry of tracker.geoSecondary) {
        ensureChildNode(regionNode, secondaryCountry, 'country');
        const secondaryNode = regionNode.children.find(c => c.id === secondaryCountry)!;
        secondaryNode.secondaryTrackers.push(tracker);
      }
    }
  }

  // Sort regions alphabetically by label and attach to tree
  tree.children = Array.from(regionMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );

  // Compute tracker counts bottom-up
  for (const regionNode of tree.children) {
    computeTrackerCount(regionNode);
  }
  tree.trackerCount = tree.children.reduce((sum, c) => sum + c.trackerCount, 0)
    + tree.global.length
    + tree.ungrouped.length;

  return tree;
}

/**
 * Insert a tracker into the tree at the correct depth based on its geoPath.
 */
function insertTracker(
  parentNode: GeoNode,
  tracker: TrackerCardData,
  geoPath: string[],
  depth: number,
): void {
  if (depth >= geoPath.length) {
    // Should not happen, but safety: place at parent
    if (tracker.aggregate) {
      parentNode.aggregateTracker = tracker;
    } else {
      parentNode.trackers.push(tracker);
    }
    return;
  }

  const segmentId = geoPath[depth];
  const level = LEVEL_BY_DEPTH[depth] ?? 'neighborhood';

  ensureChildNode(parentNode, segmentId, level);
  const childNode = parentNode.children.find(c => c.id === segmentId)!;

  if (depth === geoPath.length - 1) {
    // This is the leaf node for this tracker
    if (tracker.aggregate) {
      childNode.aggregateTracker = tracker;
    } else {
      childNode.trackers.push(tracker);
    }
  } else {
    // Continue drilling down
    insertTracker(childNode, tracker, geoPath, depth + 1);
  }
}

/**
 * Ensure a child node with the given id exists on the parent.
 */
function ensureChildNode(
  parentNode: GeoNode,
  childId: string,
  level: GeoNode['level'],
): void {
  if (!parentNode.children.find(c => c.id === childId)) {
    parentNode.children.push({
      id: childId,
      label: level === 'country' ? countryName(childId) : childId,
      level,
      trackers: [],
      secondaryTrackers: [],
      children: [],
      trackerCount: 0,
    });
  }
}

/**
 * Recursively compute trackerCount for a node and all descendants.
 * Count = own trackers + aggregate tracker (if any) + sum of children's counts.
 */
function computeTrackerCount(node: GeoNode): number {
  let count = node.trackers.length;
  if (node.aggregateTracker) count += 1;

  for (const child of node.children) {
    count += computeTrackerCount(child);
  }

  node.trackerCount = count;
  return count;
}

/**
 * Compute a density map: ISO A2 country code -> number of trackers
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

/**
 * Find all trackers whose geoPath starts with `parentGeoPath` but is strictly longer.
 * Returns children only, not the parent itself.
 */
export function findChildren(
  allTrackers: TrackerCardData[],
  parentGeoPath: string[],
): TrackerCardData[] {
  return allTrackers.filter(t => {
    if (!t.geoPath) return false;
    if (t.geoPath.length <= parentGeoPath.length) return false;

    // Check that geoPath starts with parentGeoPath
    for (let i = 0; i < parentGeoPath.length; i++) {
      if (t.geoPath[i] !== parentGeoPath[i]) return false;
    }
    return true;
  });
}

/**
 * Navigate the geo tree by path segments to find a specific node.
 * Returns undefined if the path doesn't exist.
 *
 * Path segments: ['region-id', 'country-id', 'state-id', 'city-id', ...]
 */
export function resolveGeoNode(
  tree: GeoTree | GeoNode,
  path: string[],
): GeoNode | undefined {
  if (path.length === 0) return tree;

  const [head, ...rest] = path;
  const child = tree.children.find(c => c.id === head);
  if (!child) return undefined;

  if (rest.length === 0) return child;
  return resolveGeoNode(child, rest);
}

// ── Aggregate data merging ──

/**
 * Merge parent tracker data with children tracker data for aggregate trackers.
 *
 * Precedence rules:
 * - KPIs: parent's own KPIs take precedence. If parent has none, use children's.
 * - Timeline/events: if parent has no events, merge all children's events (union),
 *   deduplicate by date+title similarity, sort newest first.
 * - Map points: parent's own take precedence. If none, union of children's.
 * - Map lines: same as map points.
 * - Casualties: parent's own take precedence. If none, union of children's.
 * - Meta: use latest lastUpdated from parent or children.
 * - All other fields (econ, claims, political, etc.): parent's data stays as-is.
 */
export function aggregateTrackerData(
  parentData: TrackerData,
  childrenData: TrackerData[],
): TrackerData {
  const hasOwnKpis = parentData.kpis.length > 0;
  const hasOwnTimeline = parentData.timeline.some(e => e.events.length > 0);
  const hasOwnMapPoints = parentData.mapPoints.length > 0;

  // KPIs: parent first, else children
  const kpis = hasOwnKpis ? parentData.kpis : childrenData.flatMap(c => c.kpis);

  // Timeline: parent first, else merged children events
  let timeline = parentData.timeline;
  if (!hasOwnTimeline) {
    const allEvents = childrenData
      .flatMap(c => c.timeline.flatMap(era => era.events))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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

  // Map data: parent takes precedence
  const mapPoints = hasOwnMapPoints ? parentData.mapPoints : childrenData.flatMap(c => c.mapPoints);
  const mapLines = parentData.mapLines.length > 0 ? parentData.mapLines : childrenData.flatMap(c => c.mapLines);

  // Casualties: parent takes precedence
  const casualties = parentData.casualties.length > 0 ? parentData.casualties : childrenData.flatMap(c => c.casualties);

  // Latest meta
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
    casualties,
    meta,
  };
}
