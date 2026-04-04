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
    meta: { dayCount: 1, lastUpdated: '2026-01-01', heroHeadline: 'Test', operationName: 'Test', dateline: 'Test', footerNote: '' } as any,
    digests: [],
    missionTrajectory: null,
    ...overrides,
  };
}

describe('aggregateTrackerData', () => {
  it('merges map points from children when parent has none', () => {
    const parent = makeTrackerData();
    const children = [
      makeTrackerData({
        mapPoints: [{ id: 'p1', lat: 20, lon: -100, cat: 'base', date: '2026-01-01', label: 'A', sources: [] } as any],
      }),
      makeTrackerData({
        mapPoints: [{ id: 'p2', lat: 25, lon: -99, cat: 'base', date: '2026-01-02', label: 'B', sources: [] } as any],
      }),
    ];
    const result = aggregateTrackerData(parent, children);
    expect(result.mapPoints).toHaveLength(2);
  });

  it('merges timeline events from children, deduplicates by date+title', () => {
    const parent = makeTrackerData();
    const children = [
      makeTrackerData({
        timeline: [{ era: 'Era 1', events: [
          { date: '2026-01-01', title: 'Event A', year: '2026', sources: [] } as any,
          { date: '2026-01-02', title: 'Event B', year: '2026', sources: [] } as any,
        ] }],
      }),
      makeTrackerData({
        timeline: [{ era: 'Era 2', events: [
          { date: '2026-01-01', title: 'Event A', year: '2026', sources: [] } as any,  // duplicate
          { date: '2026-01-03', title: 'Event C', year: '2026', sources: [] } as any,
        ] }],
      }),
    ];
    const result = aggregateTrackerData(parent, children);
    const allEvents = result.timeline.flatMap(e => e.events);
    expect(allEvents).toHaveLength(3); // A, B, C (A deduped)
  });

  it('parent KPIs take precedence over children', () => {
    const parent = makeTrackerData({
      kpis: [{ value: '100', label: 'Custom KPI' } as any],
    });
    const children = [
      makeTrackerData({
        kpis: [{ value: '50', label: 'Child KPI' } as any],
      }),
    ];
    const result = aggregateTrackerData(parent, children);
    expect(result.kpis[0].label).toBe('Custom KPI');
    expect(result.kpis).toHaveLength(1); // only parent's
  });

  it('uses latest lastUpdated from parent or children', () => {
    const parent = makeTrackerData({
      meta: { dayCount: 1, lastUpdated: '2026-01-01', heroHeadline: 'Test', operationName: 'Test', dateline: 'Test', footerNote: '' } as any,
    });
    const children = [
      makeTrackerData({
        meta: { dayCount: 10, lastUpdated: '2026-03-15', heroHeadline: 'Child', operationName: 'Child', dateline: 'Child', footerNote: '' } as any,
      }),
    ];
    const result = aggregateTrackerData(parent, children);
    expect(result.meta.lastUpdated).toBe('2026-03-15');
  });

  it('parent map points take precedence', () => {
    const parent = makeTrackerData({
      mapPoints: [{ id: 'parent-p1', lat: 20, lon: -100, cat: 'base', date: '2026-01-01', label: 'Parent', sources: [] } as any],
    });
    const children = [
      makeTrackerData({
        mapPoints: [{ id: 'child-p1', lat: 25, lon: -99, cat: 'base', date: '2026-01-02', label: 'Child', sources: [] } as any],
      }),
    ];
    const result = aggregateTrackerData(parent, children);
    expect(result.mapPoints).toHaveLength(1);
    expect(result.mapPoints[0].id).toBe('parent-p1');
  });

  it('merges map lines from children when parent has none', () => {
    const parent = makeTrackerData();
    const children = [
      makeTrackerData({
        mapLines: [{ id: 'l1', from: [20, -100], to: [25, -99], cat: 'route', date: '2026-01-01', label: 'Line A', sources: [] } as any],
      }),
      makeTrackerData({
        mapLines: [{ id: 'l2', from: [30, -95], to: [35, -90], cat: 'route', date: '2026-01-02', label: 'Line B', sources: [] } as any],
      }),
    ];
    const result = aggregateTrackerData(parent, children);
    expect(result.mapLines).toHaveLength(2);
  });

  it('parent map lines take precedence', () => {
    const parent = makeTrackerData({
      mapLines: [{ id: 'parent-l1', from: [20, -100], to: [25, -99], cat: 'route', date: '2026-01-01', label: 'Parent Line', sources: [] } as any],
    });
    const children = [
      makeTrackerData({
        mapLines: [{ id: 'child-l1', from: [30, -95], to: [35, -90], cat: 'route', date: '2026-01-02', label: 'Child Line', sources: [] } as any],
      }),
    ];
    const result = aggregateTrackerData(parent, children);
    expect(result.mapLines).toHaveLength(1);
    expect(result.mapLines[0].id).toBe('parent-l1');
  });

  it('merges casualties from children when parent has none', () => {
    const parent = makeTrackerData();
    const children = [
      makeTrackerData({
        casualties: [{ group: 'Civilians', killed: 10, injured: 20, source: 'UN', tier: 1, contested: 'no' } as any],
      }),
      makeTrackerData({
        casualties: [{ group: 'Military', killed: 5, injured: 15, source: 'DOD', tier: 1, contested: 'no' } as any],
      }),
    ];
    const result = aggregateTrackerData(parent, children);
    expect(result.casualties).toHaveLength(2);
  });

  it('preserves parent econ, claims, political as-is', () => {
    const parent = makeTrackerData({
      econ: [{ indicator: 'GDP', value: '1T', direction: 'up', date: '2026-01-01', source: 'WB', tier: 1 } as any],
      claims: [{ claim: 'Test claim', actor: 'Gov', date: '2026-01-01', source: 'Official', tier: 1 } as any],
      political: [{ avatar: 'pres', name: 'President', role: 'Head of State', quote: 'Hello' } as any],
    });
    const children = [
      makeTrackerData({
        econ: [{ indicator: 'Inflation', value: '5%', direction: 'up', date: '2026-01-01', source: 'IMF', tier: 2 } as any],
      }),
    ];
    const result = aggregateTrackerData(parent, children);
    expect(result.econ).toHaveLength(1);
    expect(result.econ[0].indicator).toBe('GDP');
    expect(result.claims).toHaveLength(1);
    expect(result.political).toHaveLength(1);
  });

  it('returns parent data when no children provided', () => {
    const parent = makeTrackerData({
      kpis: [{ value: '42', label: 'Solo KPI' } as any],
    });
    const result = aggregateTrackerData(parent, []);
    expect(result.kpis).toHaveLength(1);
    expect(result.kpis[0].label).toBe('Solo KPI');
  });

  it('timeline events sorted newest first', () => {
    const parent = makeTrackerData();
    const children = [
      makeTrackerData({
        timeline: [{ era: 'Era 1', events: [
          { date: '2026-01-01', title: 'Old Event', year: '2026', sources: [] } as any,
        ] }],
      }),
      makeTrackerData({
        timeline: [{ era: 'Era 2', events: [
          { date: '2026-03-15', title: 'New Event', year: '2026', sources: [] } as any,
        ] }],
      }),
    ];
    const result = aggregateTrackerData(parent, children);
    const allEvents = result.timeline.flatMap(e => e.events);
    expect(allEvents[0].title).toBe('New Event');
    expect(allEvents[1].title).toBe('Old Event');
  });
});
