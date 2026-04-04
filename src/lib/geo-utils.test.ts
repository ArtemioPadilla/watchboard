import { describe, it, expect } from 'vitest';
import type { TrackerCardData } from './tracker-directory-utils';
import { buildGeoTree, findChildren, resolveGeoNode } from './geo-utils';
import type { GeoNode, GeoTree } from './geo-utils';

// ── Test helpers ──

function makeTracker(overrides: Partial<TrackerCardData> = {}): TrackerCardData {
  return {
    slug: 'test-tracker',
    shortName: 'Test',
    name: 'Test Tracker',
    description: 'A test tracker',
    status: 'active',
    temporal: 'live',
    domain: 'conflict',
    region: 'middle-east',
    country: 'IR',
    startDate: '2026-01-01',
    sections: ['timeline', 'map'],
    dayCount: 80,
    lastUpdated: '2026-03-20T12:00:00Z',
    topKpis: [],
    ...overrides,
  };
}

// ── buildGeoTree ──

describe('buildGeoTree', () => {
  it('returns a root node with global and ungrouped arrays', () => {
    const tree = buildGeoTree([]);
    expect(tree.id).toBe('root');
    expect(tree.level).toBe('root');
    expect(tree.global).toEqual([]);
    expect(tree.ungrouped).toEqual([]);
    expect(tree.children).toEqual([]);
    expect(tree.trackerCount).toBe(0);
  });

  it('groups trackers by region at the top level', () => {
    const trackers = [
      makeTracker({ slug: 'iran', region: 'middle-east', country: 'IR', geoPath: ['IR'] }),
      makeTracker({ slug: 'ukraine', region: 'europe', country: 'UA', geoPath: ['UA'] }),
      makeTracker({ slug: 'mh17', region: 'europe', country: 'UA', geoPath: ['UA'] }),
    ];
    const tree = buildGeoTree(trackers);

    expect(tree.children).toHaveLength(2);
    const regionIds = tree.children.map(c => c.id);
    expect(regionIds).toContain('middle-east');
    expect(regionIds).toContain('europe');

    const europeNode = tree.children.find(c => c.id === 'europe')!;
    expect(europeNode.level).toBe('region');
    expect(europeNode.trackerCount).toBe(2);
  });

  it('builds country nodes under regions from geoPath', () => {
    const trackers = [
      makeTracker({ slug: 'culiacanazo', region: 'north-america', country: 'MX', geoPath: ['MX', 'Sinaloa', 'Culiacan'] }),
      makeTracker({ slug: 'ayotzinapa', region: 'north-america', country: 'MX', geoPath: ['MX', 'Guerrero', 'Iguala'] }),
    ];
    const tree = buildGeoTree(trackers);

    const naNode = tree.children.find(c => c.id === 'north-america')!;
    expect(naNode).toBeDefined();
    expect(naNode.children).toHaveLength(1); // MX
    const mxNode = naNode.children[0];
    expect(mxNode.id).toBe('MX');
    expect(mxNode.level).toBe('country');
    expect(mxNode.trackerCount).toBe(2);
  });

  it('builds state and city nodes from geoPath segments', () => {
    const trackers = [
      makeTracker({
        slug: 'culiacanazo',
        region: 'north-america',
        country: 'MX',
        state: 'Sinaloa',
        city: 'Culiacan',
        geoPath: ['MX', 'Sinaloa', 'Culiacan'],
      }),
    ];
    const tree = buildGeoTree(trackers);

    const mxNode = tree.children[0].children[0]; // north-america > MX
    expect(mxNode.children).toHaveLength(1); // Sinaloa
    const sinaloaNode = mxNode.children[0];
    expect(sinaloaNode.id).toBe('Sinaloa');
    expect(sinaloaNode.level).toBe('state');

    expect(sinaloaNode.children).toHaveLength(1); // Culiacan
    const culiacanNode = sinaloaNode.children[0];
    expect(culiacanNode.id).toBe('Culiacan');
    expect(culiacanNode.level).toBe('city');
    expect(culiacanNode.trackers).toHaveLength(1);
    expect(culiacanNode.trackers[0].slug).toBe('culiacanazo');
  });

  it('places trackers at the correct depth based on geoPath length', () => {
    const countryTracker = makeTracker({
      slug: 'iran-conflict',
      region: 'middle-east',
      country: 'IR',
      geoPath: ['IR'],
    });
    const cityTracker = makeTracker({
      slug: 'tehran-protests',
      region: 'middle-east',
      country: 'IR',
      state: 'Tehran',
      city: 'Tehran',
      geoPath: ['IR', 'Tehran', 'Tehran'],
    });
    const tree = buildGeoTree([countryTracker, cityTracker]);

    const irNode = tree.children[0].children[0]; // middle-east > IR
    expect(irNode.trackers).toHaveLength(1);
    expect(irNode.trackers[0].slug).toBe('iran-conflict');

    const tehranCity = irNode.children[0].children[0]; // Tehran state > Tehran city
    expect(tehranCity.trackers).toHaveLength(1);
    expect(tehranCity.trackers[0].slug).toBe('tehran-protests');
  });

  it('sends trackers without geoPath to ungrouped', () => {
    const trackers = [
      makeTracker({ slug: 'no-geo', region: undefined, country: undefined, geoPath: undefined }),
      makeTracker({ slug: 'has-region-no-path', region: 'europe', country: 'UA', geoPath: undefined }),
    ];
    const tree = buildGeoTree(trackers);
    expect(tree.ungrouped).toHaveLength(2);
    expect(tree.children).toHaveLength(0);
  });

  it('sends global trackers (region: "global") to the global array', () => {
    const trackers = [
      makeTracker({ slug: 'covid', region: 'global', geoPath: undefined }),
      makeTracker({ slug: 'climate', region: 'global', geoPath: undefined }),
      makeTracker({ slug: 'iran', region: 'middle-east', country: 'IR', geoPath: ['IR'] }),
    ];
    const tree = buildGeoTree(trackers);
    expect(tree.global).toHaveLength(2);
    expect(tree.global.map(t => t.slug)).toContain('covid');
    expect(tree.global.map(t => t.slug)).toContain('climate');
    // Iran should still appear in the tree
    expect(tree.children).toHaveLength(1);
  });

  it('places geoSecondary trackers as secondaryTrackers on secondary country nodes', () => {
    const tracker = makeTracker({
      slug: 'iran-conflict',
      region: 'middle-east',
      country: 'IR',
      geoPath: ['IR'],
      geoSecondary: ['IL', 'SY'],
    });
    const tree = buildGeoTree([tracker]);

    // The primary placement is in middle-east > IR
    const meNode = tree.children.find(c => c.id === 'middle-east')!;
    const irNode = meNode.children.find(c => c.id === 'IR')!;
    expect(irNode.trackers).toHaveLength(1);

    // Secondary placements: IL and SY should exist as country nodes under middle-east
    const ilNode = meNode.children.find(c => c.id === 'IL')!;
    expect(ilNode).toBeDefined();
    expect(ilNode.secondaryTrackers).toHaveLength(1);
    expect(ilNode.secondaryTrackers[0].slug).toBe('iran-conflict');
    expect(ilNode.trackers).toHaveLength(0); // not a primary tracker here

    const syNode = meNode.children.find(c => c.id === 'SY')!;
    expect(syNode).toBeDefined();
    expect(syNode.secondaryTrackers).toHaveLength(1);
    expect(syNode.secondaryTrackers[0].slug).toBe('iran-conflict');
  });

  it('sets aggregateTracker on the node for aggregate: true trackers', () => {
    const mexicoAggregate = makeTracker({
      slug: 'mexico-hub',
      region: 'north-america',
      country: 'MX',
      geoPath: ['MX'],
      aggregate: true,
    });
    const childTracker = makeTracker({
      slug: 'culiacanazo',
      region: 'north-america',
      country: 'MX',
      state: 'Sinaloa',
      city: 'Culiacan',
      geoPath: ['MX', 'Sinaloa', 'Culiacan'],
    });
    const tree = buildGeoTree([mexicoAggregate, childTracker]);

    const mxNode = tree.children[0].children.find(c => c.id === 'MX')!;
    expect(mxNode.aggregateTracker).toBeDefined();
    expect(mxNode.aggregateTracker!.slug).toBe('mexico-hub');
    // Aggregate trackers should NOT appear in node.trackers
    expect(mxNode.trackers).toHaveLength(0);
    // The child tracker is deeper, not at country level
    expect(mxNode.trackerCount).toBe(2); // total subtree count includes aggregate + child
  });

  it('computes trackerCount as total trackers in the subtree', () => {
    const trackers = [
      makeTracker({ slug: 'mx-hub', region: 'north-america', country: 'MX', geoPath: ['MX'], aggregate: true }),
      makeTracker({ slug: 't1', region: 'north-america', country: 'MX', geoPath: ['MX', 'Sinaloa'] }),
      makeTracker({ slug: 't2', region: 'north-america', country: 'MX', geoPath: ['MX', 'Guerrero'] }),
      makeTracker({ slug: 't3', region: 'north-america', country: 'US', geoPath: ['US'] }),
    ];
    const tree = buildGeoTree(trackers);

    const naNode = tree.children.find(c => c.id === 'north-america')!;
    expect(naNode.trackerCount).toBe(4);

    const mxNode = naNode.children.find(c => c.id === 'MX')!;
    expect(mxNode.trackerCount).toBe(3); // mx-hub (aggregate) + t1 + t2

    const usNode = naNode.children.find(c => c.id === 'US')!;
    expect(usNode.trackerCount).toBe(1);
  });

  it('generates human-readable labels for region nodes', () => {
    const trackers = [
      makeTracker({ slug: 't1', region: 'north-america', country: 'US', geoPath: ['US'] }),
      makeTracker({ slug: 't2', region: 'middle-east', country: 'IR', geoPath: ['IR'] }),
      makeTracker({ slug: 't3', region: 'east-asia', country: 'JP', geoPath: ['JP'] }),
    ];
    const tree = buildGeoTree(trackers);

    const labels = tree.children.map(c => c.label);
    expect(labels).toContain('North America');
    expect(labels).toContain('Middle East');
    expect(labels).toContain('East Asia');
  });

  it('sorts region children alphabetically by label', () => {
    const trackers = [
      makeTracker({ slug: 't1', region: 'europe', country: 'UA', geoPath: ['UA'] }),
      makeTracker({ slug: 't2', region: 'africa', country: 'EG', geoPath: ['EG'] }),
      makeTracker({ slug: 't3', region: 'north-america', country: 'US', geoPath: ['US'] }),
    ];
    const tree = buildGeoTree(trackers);

    const labels = tree.children.map(c => c.label);
    expect(labels).toEqual(['Africa', 'Europe', 'North America']);
  });

  it('handles geoSecondary with a different region than the primary', () => {
    // e.g., MH17 is in Europe (UA) but has geoSecondary MY (south-east-asia)
    const tracker = makeTracker({
      slug: 'mh17',
      region: 'europe',
      country: 'UA',
      geoPath: ['UA'],
      geoSecondary: ['MY'],
    });
    const tree = buildGeoTree([tracker]);

    // Primary: europe > UA
    const europeNode = tree.children.find(c => c.id === 'europe')!;
    expect(europeNode).toBeDefined();
    const uaNode = europeNode.children.find(c => c.id === 'UA')!;
    expect(uaNode.trackers).toHaveLength(1);

    // Secondary: we need a region for MY. Since we don't know it,
    // geoSecondary country codes without a region should go under a catch-all
    // Actually, the simplest approach: geoSecondary countries are placed under
    // the SAME region as the primary tracker, since we don't have region info for secondary.
    // Let me check the implementation spec again... The task says "secondary country node."
    // The implementation should place secondary codes under the primary tracker's region.
    const myNode = europeNode.children.find(c => c.id === 'MY');
    expect(myNode).toBeDefined();
    expect(myNode!.secondaryTrackers).toHaveLength(1);
    expect(myNode!.secondaryTrackers[0].slug).toBe('mh17');
  });
});

// ── findChildren ──

describe('findChildren', () => {
  const trackers = [
    makeTracker({ slug: 'mx-hub', region: 'north-america', country: 'MX', geoPath: ['MX'], aggregate: true }),
    makeTracker({ slug: 'culiacanazo', region: 'north-america', country: 'MX', geoPath: ['MX', 'Sinaloa', 'Culiacan'] }),
    makeTracker({ slug: 'mencho', region: 'north-america', country: 'MX', geoPath: ['MX', 'Jalisco', 'Guadalajara'] }),
    makeTracker({ slug: 'ayotzinapa', region: 'north-america', country: 'MX', geoPath: ['MX', 'Guerrero', 'Iguala'] }),
    makeTracker({ slug: 'iran', region: 'middle-east', country: 'IR', geoPath: ['IR'] }),
  ];

  it('finds all trackers whose geoPath starts with the given prefix', () => {
    const children = findChildren(trackers, ['MX']);
    expect(children).toHaveLength(3); // culiacanazo, mencho, ayotzinapa (NOT mx-hub itself)
    expect(children.map(t => t.slug).sort()).toEqual(['ayotzinapa', 'culiacanazo', 'mencho']);
  });

  it('does NOT include the parent itself (exact match)', () => {
    const children = findChildren(trackers, ['MX']);
    expect(children.find(t => t.slug === 'mx-hub')).toBeUndefined();
  });

  it('finds children at a deeper level', () => {
    const children = findChildren(trackers, ['MX', 'Sinaloa']);
    expect(children).toHaveLength(1);
    expect(children[0].slug).toBe('culiacanazo');
  });

  it('returns empty array when no children match', () => {
    const children = findChildren(trackers, ['MX', 'Sinaloa', 'Culiacan']);
    expect(children).toHaveLength(0);
  });

  it('returns empty array for a non-existent prefix', () => {
    const children = findChildren(trackers, ['BR']);
    expect(children).toHaveLength(0);
  });

  it('works with empty prefix (returns all trackers with any geoPath longer than 0)', () => {
    // An empty prefix means "all trackers that have a geoPath longer than []"
    const children = findChildren(trackers, []);
    // All 5 trackers have a geoPath, so all 5 have geoPath longer than []
    expect(children).toHaveLength(5);
  });

  it('ignores trackers without geoPath', () => {
    const withMissing = [
      ...trackers,
      makeTracker({ slug: 'no-geo', geoPath: undefined }),
    ];
    const children = findChildren(withMissing, ['MX']);
    expect(children.find(t => t.slug === 'no-geo')).toBeUndefined();
  });
});

// ── resolveGeoNode ──

describe('resolveGeoNode', () => {
  let tree: GeoTree;

  // Build a tree with known structure for navigation tests
  const trackers = [
    makeTracker({ slug: 'iran', region: 'middle-east', country: 'IR', geoPath: ['IR'] }),
    makeTracker({ slug: 'culiacanazo', region: 'north-america', country: 'MX', geoPath: ['MX', 'Sinaloa', 'Culiacan'] }),
    makeTracker({ slug: 'mx-hub', region: 'north-america', country: 'MX', geoPath: ['MX'], aggregate: true }),
  ];

  // Build once for all tests in this describe block
  // (buildGeoTree is pure, so this is safe)
  tree = buildGeoTree(trackers);

  it('returns the root node for empty path', () => {
    const node = resolveGeoNode(tree, []);
    expect(node).toBe(tree);
  });

  it('navigates to a region node', () => {
    const node = resolveGeoNode(tree, ['north-america']);
    expect(node).toBeDefined();
    expect(node!.id).toBe('north-america');
    expect(node!.level).toBe('region');
  });

  it('navigates to a country node', () => {
    const node = resolveGeoNode(tree, ['north-america', 'MX']);
    expect(node).toBeDefined();
    expect(node!.id).toBe('MX');
    expect(node!.level).toBe('country');
  });

  it('navigates to a state node', () => {
    const node = resolveGeoNode(tree, ['north-america', 'MX', 'Sinaloa']);
    expect(node).toBeDefined();
    expect(node!.id).toBe('Sinaloa');
    expect(node!.level).toBe('state');
  });

  it('navigates to a city node', () => {
    const node = resolveGeoNode(tree, ['north-america', 'MX', 'Sinaloa', 'Culiacan']);
    expect(node).toBeDefined();
    expect(node!.id).toBe('Culiacan');
    expect(node!.level).toBe('city');
  });

  it('returns undefined for a non-existent path', () => {
    const node = resolveGeoNode(tree, ['europe']);
    expect(node).toBeUndefined();
  });

  it('returns undefined for a partially valid path', () => {
    const node = resolveGeoNode(tree, ['north-america', 'BR']);
    expect(node).toBeUndefined();
  });

  it('returns undefined for a path that goes too deep', () => {
    const node = resolveGeoNode(tree, ['north-america', 'MX', 'Sinaloa', 'Culiacan', 'Centro']);
    expect(node).toBeUndefined();
  });
});
