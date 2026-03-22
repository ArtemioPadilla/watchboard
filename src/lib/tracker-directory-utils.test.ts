import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  filterTrackers,
  groupTrackers,
  computeFreshness,
  buildDateline,
  computeDomainCounts,
  matchesSearch,
  getVisibleDomains,
  type TrackerCardData,
} from './tracker-directory-utils';

// ── Test helpers ──

function makeTracker(overrides: Partial<TrackerCardData> = {}): TrackerCardData {
  return {
    slug: 'test-tracker',
    shortName: 'Test',
    name: 'Test Tracker',
    description: 'A test tracker for unit tests',
    status: 'active',
    temporal: 'live',
    domain: 'conflict',
    region: 'Middle East',
    startDate: '2026-01-01',
    sections: ['timeline', 'map'],
    dayCount: 80,
    lastUpdated: '2026-03-20T12:00:00Z',
    topKpis: [],
    ...overrides,
  };
}

// ── matchesSearch ──

describe('matchesSearch', () => {
  const tracker = makeTracker({
    name: 'Iran Conflict Tracker',
    shortName: 'Iran',
    description: 'Monitoring the Iran-Israel military escalation',
    domain: 'conflict',
    region: 'Middle East',
    country: 'Iran',
  });

  it('matches on name (case-insensitive)', () => {
    /** TC-test-001: matchesSearch finds by name. Verifies: AC-search */
    expect(matchesSearch(tracker, 'iran')).toBe(true);
    expect(matchesSearch(tracker, 'IRAN')).toBe(true);
    expect(matchesSearch(tracker, 'Iran Conflict')).toBe(true);
  });

  it('matches on shortName', () => {
    /** TC-test-002: matchesSearch finds by shortName. Verifies: AC-search */
    expect(matchesSearch(tracker, 'Iran')).toBe(true);
  });

  it('matches on description', () => {
    /** TC-test-003: matchesSearch finds by description. Verifies: AC-search */
    expect(matchesSearch(tracker, 'escalation')).toBe(true);
    expect(matchesSearch(tracker, 'military')).toBe(true);
  });

  it('matches on domain', () => {
    /** TC-test-004: matchesSearch finds by domain. Verifies: AC-search */
    expect(matchesSearch(tracker, 'conflict')).toBe(true);
  });

  it('matches on region', () => {
    /** TC-test-005: matchesSearch finds by region. Verifies: AC-search */
    expect(matchesSearch(tracker, 'middle east')).toBe(true);
  });

  it('matches on country', () => {
    /** TC-test-006: matchesSearch finds by country. Verifies: AC-search */
    expect(matchesSearch(tracker, 'iran')).toBe(true);
  });

  it('returns false for non-matching query', () => {
    /** TC-test-007: matchesSearch rejects unrelated terms. Verifies: AC-search */
    expect(matchesSearch(tracker, 'earthquake')).toBe(false);
    expect(matchesSearch(tracker, 'japan')).toBe(false);
  });

  it('handles tracker with no optional fields', () => {
    /** TC-test-008: matchesSearch handles missing domain/region/country. Verifies: AC-search */
    const minimal = makeTracker({ domain: undefined, region: undefined, country: undefined });
    expect(matchesSearch(minimal, 'Test')).toBe(true);
    expect(matchesSearch(minimal, 'conflict')).toBe(false);
  });
});

// ── filterTrackers ──

describe('filterTrackers', () => {
  const trackers = [
    makeTracker({ slug: 'iran', name: 'Iran Conflict', domain: 'conflict', region: 'Middle East' }),
    makeTracker({ slug: 'chernobyl', name: 'Chernobyl', domain: 'disaster', region: 'Europe' }),
    makeTracker({ slug: 'ayotzinapa', name: 'Ayotzinapa', domain: 'human-rights', region: 'Latin America' }),
    makeTracker({ slug: 'mh17', name: 'MH17 Shootdown', domain: 'security', region: 'Europe' }),
  ];

  it('returns all trackers when no filters applied', () => {
    /** TC-test-009: filterTrackers with no filters returns all. Verifies: AC-filter */
    expect(filterTrackers(trackers, null, '')).toHaveLength(4);
  });

  it('filters by domain', () => {
    /** TC-test-010: filterTrackers by domain. Verifies: AC-filter */
    const result = filterTrackers(trackers, 'conflict', '');
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('iran');
  });

  it('filters by search query', () => {
    /** TC-test-011: filterTrackers by search query. Verifies: AC-filter */
    const result = filterTrackers(trackers, null, 'Europe');
    expect(result).toHaveLength(2);
    expect(result.map(t => t.slug)).toContain('chernobyl');
    expect(result.map(t => t.slug)).toContain('mh17');
  });

  it('filters by both domain and search query', () => {
    /** TC-test-012: filterTrackers by domain + query combined. Verifies: AC-filter */
    const result = filterTrackers(trackers, 'disaster', 'Europe');
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('chernobyl');
  });

  it('returns empty array when nothing matches', () => {
    /** TC-test-013: filterTrackers returns empty for no match. Verifies: AC-filter */
    expect(filterTrackers(trackers, 'space', '')).toHaveLength(0);
  });

  it('trims whitespace from query', () => {
    /** TC-test-014: filterTrackers ignores leading/trailing whitespace. Verifies: AC-filter */
    const result = filterTrackers(trackers, null, '  Iran  ');
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('iran');
  });

  it('treats empty string query as no filter', () => {
    /** TC-test-015: filterTrackers treats whitespace-only as no query. Verifies: AC-filter */
    expect(filterTrackers(trackers, null, '   ')).toHaveLength(4);
  });
});

// ── groupTrackers ──

describe('groupTrackers', () => {
  it('groups live (non-historical, non-archived, no series) trackers', () => {
    /** TC-test-016: groupTrackers creates live group. Verifies: AC-group */
    const trackers = [
      makeTracker({ slug: 'iran', temporal: 'live', status: 'active' }),
      makeTracker({ slug: 'mh17', temporal: 'live', status: 'active' }),
    ];
    const groups = groupTrackers(trackers);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('live');
    expect(groups[0].trackers).toHaveLength(2);
  });

  it('groups historical trackers separately', () => {
    /** TC-test-017: groupTrackers creates historical group. Verifies: AC-group */
    const trackers = [
      makeTracker({ slug: 'iran', temporal: 'live', status: 'active' }),
      makeTracker({ slug: 'chernobyl', temporal: 'historical', status: 'active' }),
    ];
    const groups = groupTrackers(trackers);
    expect(groups).toHaveLength(2);
    expect(groups[0].type).toBe('live');
    expect(groups[1].type).toBe('historical');
    expect(groups[1].trackers).toHaveLength(1);
    expect(groups[1].trackers[0].slug).toBe('chernobyl');
  });

  it('groups archived trackers separately', () => {
    /** TC-test-018: groupTrackers creates archived group. Verifies: AC-group */
    const trackers = [
      makeTracker({ slug: 'iran', status: 'active' }),
      makeTracker({ slug: 'old', status: 'archived' }),
    ];
    const groups = groupTrackers(trackers);
    const archivedGroup = groups.find(g => g.type === 'archived');
    expect(archivedGroup).toBeDefined();
    expect(archivedGroup!.trackers).toHaveLength(1);
    expect(archivedGroup!.trackers[0].slug).toBe('old');
  });

  it('groups series trackers together, sorted by hub then seriesOrder', () => {
    /** TC-test-019: groupTrackers handles series with hub + order. Verifies: AC-group */
    const trackers = [
      makeTracker({ slug: 'ep2', seriesId: 'japan-nuclear', seriesName: 'Japan Nuclear', seriesOrder: 2 }),
      makeTracker({ slug: 'hub', seriesId: 'japan-nuclear', seriesName: 'Japan Nuclear', isHub: true, seriesOrder: 0 }),
      makeTracker({ slug: 'ep1', seriesId: 'japan-nuclear', seriesName: 'Japan Nuclear', seriesOrder: 1 }),
    ];
    const groups = groupTrackers(trackers);
    const seriesGroup = groups.find(g => g.type === 'series');
    expect(seriesGroup).toBeDefined();
    expect(seriesGroup!.seriesName).toBe('Japan Nuclear');
    expect(seriesGroup!.trackers.map(t => t.slug)).toEqual(['hub', 'ep1', 'ep2']);
  });

  it('does not include archived trackers in series groups', () => {
    /** TC-test-020: groupTrackers excludes archived from series. Verifies: AC-group */
    const trackers = [
      makeTracker({ slug: 'ep1', seriesId: 'series-a', seriesName: 'Series A', status: 'active' }),
      makeTracker({ slug: 'ep2', seriesId: 'series-a', seriesName: 'Series A', status: 'archived' }),
    ];
    const groups = groupTrackers(trackers);
    const seriesGroup = groups.find(g => g.type === 'series');
    expect(seriesGroup).toBeDefined();
    expect(seriesGroup!.trackers).toHaveLength(1);
    expect(seriesGroup!.trackers[0].slug).toBe('ep1');
  });

  it('returns empty array when no trackers provided', () => {
    /** TC-test-021: groupTrackers with empty input. Verifies: AC-group */
    expect(groupTrackers([])).toEqual([]);
  });

  it('omits groups with zero members', () => {
    /** TC-test-022: groupTrackers only emits non-empty groups. Verifies: AC-group */
    const trackers = [
      makeTracker({ slug: 'hist', temporal: 'historical', status: 'active' }),
    ];
    const groups = groupTrackers(trackers);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('historical');
  });
});

// ── computeFreshness ──

describe('computeFreshness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns LIVE/fresh when updated less than 24h ago', () => {
    /** TC-test-023: computeFreshness <24h = LIVE. Verifies: AC-freshness */
    vi.setSystemTime(new Date('2026-03-20T14:00:00Z'));
    const result = computeFreshness('2026-03-20T12:00:00Z');
    expect(result.label).toBe('LIVE');
    expect(result.className).toBe('fresh');
    expect(result.ageText).toBe('2h ago');
  });

  it('returns "Just now" for updates less than 1h ago', () => {
    /** TC-test-024: computeFreshness <1h = Just now. Verifies: AC-freshness */
    vi.setSystemTime(new Date('2026-03-20T12:30:00Z'));
    const result = computeFreshness('2026-03-20T12:00:00Z');
    expect(result.label).toBe('LIVE');
    expect(result.ageText).toBe('Just now');
  });

  it('returns RECENT when updated 24-48h ago', () => {
    /** TC-test-025: computeFreshness 24-48h = RECENT. Verifies: AC-freshness */
    vi.setSystemTime(new Date('2026-03-21T18:00:00Z'));
    const result = computeFreshness('2026-03-20T12:00:00Z');
    expect(result.label).toBe('RECENT');
    expect(result.className).toBe('recent');
    expect(result.ageText).toBe('1d ago');
  });

  it('returns STALE when updated more than 48h ago', () => {
    /** TC-test-026: computeFreshness >48h = STALE. Verifies: AC-freshness */
    vi.setSystemTime(new Date('2026-03-25T12:00:00Z'));
    const result = computeFreshness('2026-03-20T12:00:00Z');
    expect(result.label).toBe('STALE');
    expect(result.className).toBe('stale');
    expect(result.ageText).toBe('5d ago');
  });

  it('handles boundary at exactly 24h', () => {
    /** TC-test-027: computeFreshness exactly 24h = RECENT (not LIVE). Verifies: AC-freshness */
    vi.setSystemTime(new Date('2026-03-21T12:00:00Z'));
    const result = computeFreshness('2026-03-20T12:00:00Z');
    expect(result.label).toBe('RECENT');
    expect(result.className).toBe('recent');
  });

  it('handles boundary at exactly 48h', () => {
    /** TC-test-028: computeFreshness exactly 48h = STALE. Verifies: AC-freshness */
    vi.setSystemTime(new Date('2026-03-22T12:00:00Z'));
    const result = computeFreshness('2026-03-20T12:00:00Z');
    expect(result.label).toBe('STALE');
    expect(result.className).toBe('stale');
  });
});

// ── buildDateline ──

describe('buildDateline', () => {
  it('returns "DAY N" for live (non-historical) trackers', () => {
    /** TC-test-029: buildDateline live tracker. Verifies: AC-dateline */
    const tracker = makeTracker({ temporal: 'live', dayCount: 42 });
    expect(buildDateline(tracker)).toBe('DAY 42');
  });

  it('returns year range for historical trackers with different start/end years', () => {
    /** TC-test-030: buildDateline historical with range. Verifies: AC-dateline */
    const tracker = makeTracker({
      temporal: 'historical',
      startDate: '1986-04-26',
      endDate: '1986-12-14',
    });
    expect(buildDateline(tracker)).toBe('1986');
  });

  it('returns "startYear-endYear" for historical with multi-year range', () => {
    /** TC-test-031: buildDateline historical multi-year range. Verifies: AC-dateline */
    const tracker = makeTracker({
      temporal: 'historical',
      startDate: '2014-09-26',
      endDate: '2026-03-20',
    });
    expect(buildDateline(tracker)).toBe('2014\u20132026');
  });

  it('returns "startYear-Present" for historical with no endDate', () => {
    /** TC-test-032: buildDateline historical no end date. Verifies: AC-dateline */
    const tracker = makeTracker({
      temporal: 'historical',
      startDate: '2014-09-26',
      endDate: undefined,
    });
    expect(buildDateline(tracker)).toBe('2014\u2013Present');
  });
});

// ── computeDomainCounts ──

describe('computeDomainCounts', () => {
  it('counts trackers per domain', () => {
    /** TC-test-033: computeDomainCounts basic counting. Verifies: AC-domain-counts */
    const trackers = [
      makeTracker({ domain: 'conflict' }),
      makeTracker({ domain: 'conflict' }),
      makeTracker({ domain: 'disaster' }),
      makeTracker({ domain: 'security' }),
    ];
    const counts = computeDomainCounts(trackers);
    expect(counts).toEqual({ conflict: 2, disaster: 1, security: 1 });
  });

  it('skips trackers without a domain', () => {
    /** TC-test-034: computeDomainCounts skips undefined domain. Verifies: AC-domain-counts */
    const trackers = [
      makeTracker({ domain: 'conflict' }),
      makeTracker({ domain: undefined }),
    ];
    const counts = computeDomainCounts(trackers);
    expect(counts).toEqual({ conflict: 1 });
  });

  it('returns empty object for empty array', () => {
    /** TC-test-035: computeDomainCounts empty input. Verifies: AC-domain-counts */
    expect(computeDomainCounts([])).toEqual({});
  });
});

// ── getVisibleDomains ──

describe('getVisibleDomains', () => {
  it('returns only domains that have a count > 0 in DOMAIN_ORDER order', () => {
    /** TC-test-036: getVisibleDomains filters and orders. Verifies: AC-domain-counts */
    const counts = { disaster: 3, conflict: 1, science: 2 };
    const visible = getVisibleDomains(counts);
    expect(visible).toEqual(['conflict', 'disaster', 'science']);
  });

  it('returns empty array when no counts', () => {
    /** TC-test-037: getVisibleDomains with empty counts. Verifies: AC-domain-counts */
    expect(getVisibleDomains({})).toEqual([]);
  });
});
