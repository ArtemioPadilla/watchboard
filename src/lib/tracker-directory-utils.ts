/**
 * Pure business logic for the TrackerDirectory component.
 * Extracted for testability and reuse.
 */

// ── Types ──

export interface TrackerCardData {
  slug: string;
  shortName: string;
  name: string;
  description: string;
  icon?: string;
  color?: string;
  status: string;
  temporal: string;
  domain?: string;
  region?: string;
  country?: string;
  startDate: string;
  endDate?: string;
  sections: string[];
  seriesId?: string;
  seriesName?: string;
  seriesOrder?: number;
  isHub?: boolean;
  mapEnabled?: boolean;
  globeEnabled?: boolean;
  mapCenter?: { lon: number; lat: number };
  dayCount: number;
  lastUpdated: string;
  headline?: string;
  topKpis: Array<{ value: string; label: string }>;
  headlineEs?: string;
  descriptionEs?: string;
  topKpisEs?: Array<{ value: string; label: string }>;
  digestSummary?: string;
  digestSectionsUpdated?: string[];
  latestEventMedia?: { url: string; source: string; tier: number };
}

export interface TrackerGroup {
  type: 'live' | 'series' | 'historical' | 'archived';
  label: string;
  labelIcon?: string;
  trackers: TrackerCardData[];
  seriesName?: string;
}

export interface Freshness {
  label: string;
  className: string;
  ageText: string;
}

// ── Domain constants ──

export const DOMAIN_COLORS: Record<string, string> = {
  conflict: '#e74c3c',
  security: '#9b59b6',
  governance: '#3498db',
  disaster: '#e67e22',
  'human-rights': '#f39c12',
  science: '#1abc9c',
  space: '#3498db',
  economy: '#c0392b',
  culture: '#e91e63',
  history: '#795548',
};

export const DOMAIN_ORDER = [
  'conflict', 'security', 'governance', 'disaster',
  'human-rights', 'science', 'space', 'economy', 'culture', 'history',
] as const;

// ── Filtering ──

export function matchesSearch(tracker: TrackerCardData, query: string): boolean {
  const q = query.toLowerCase();
  return (
    tracker.name.toLowerCase().includes(q) ||
    tracker.shortName.toLowerCase().includes(q) ||
    tracker.description.toLowerCase().includes(q) ||
    (tracker.domain?.toLowerCase().includes(q) ?? false) ||
    (tracker.region?.toLowerCase().includes(q) ?? false) ||
    (tracker.country?.toLowerCase().includes(q) ?? false)
  );
}

export function filterTrackers(
  trackers: TrackerCardData[],
  domain: string | null,
  query: string,
): TrackerCardData[] {
  let result = trackers;
  if (domain) {
    result = result.filter(t => t.domain === domain);
  }
  const trimmed = query.trim();
  if (trimmed) {
    result = result.filter(t => matchesSearch(t, trimmed));
  }
  return result;
}

// ── Grouping ──

export function groupTrackers(trackers: TrackerCardData[]): TrackerGroup[] {
  const groups: TrackerGroup[] = [];

  // 1. Live operations (non-historical, non-archived, no series)
  const live = trackers.filter(
    t => t.status !== 'archived' && t.temporal !== 'historical' && !t.seriesId,
  );
  if (live.length > 0) {
    groups.push({ type: 'live', label: 'Live Operations', labelIcon: '\u25C9', trackers: live });
  }

  // 2. Series groups
  const seriesMap = new Map<string, { name: string; trackers: TrackerCardData[] }>();
  for (const t of trackers) {
    if (!t.seriesId || t.status === 'archived') continue;
    if (!seriesMap.has(t.seriesId)) {
      seriesMap.set(t.seriesId, { name: t.seriesName || t.seriesId, trackers: [] });
    }
    seriesMap.get(t.seriesId)!.trackers.push(t);
  }
  for (const [, data] of seriesMap) {
    data.trackers.sort((a, b) => {
      if (a.isHub && !b.isHub) return -1;
      if (!a.isHub && b.isHub) return 1;
      return (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0);
    });
    groups.push({
      type: 'series',
      label: data.name,
      seriesName: data.name,
      trackers: data.trackers,
    });
  }

  // 3. Historical (non-archived, historical, no series)
  const historical = trackers.filter(
    t => t.status !== 'archived' && t.temporal === 'historical' && !t.seriesId,
  );
  if (historical.length > 0) {
    groups.push({ type: 'historical', label: 'Historical Analysis', labelIcon: '\u23F0', trackers: historical });
  }

  // 4. Archived
  const archived = trackers.filter(t => t.status === 'archived');
  if (archived.length > 0) {
    groups.push({ type: 'archived', label: 'Archived', labelIcon: '\u25FB', trackers: archived });
  }

  return groups;
}

// ── Freshness ──

export function computeFreshness(lastUpdated: string): Freshness {
  const updated = new Date(lastUpdated);
  const now = new Date();
  const ageHrs = Math.floor((now.getTime() - updated.getTime()) / 3600000);

  const ageText =
    ageHrs < 1 ? 'Just now' :
    ageHrs < 24 ? `${ageHrs}h ago` :
    `${Math.floor(ageHrs / 24)}d ago`;

  if (ageHrs < 24) return { label: 'LIVE', className: 'fresh', ageText };
  if (ageHrs < 48) return { label: 'RECENT', className: 'recent', ageText };
  return { label: 'STALE', className: 'stale', ageText };
}

// ── Dateline ──

export function buildDateline(tracker: TrackerCardData): string {
  if (tracker.temporal !== 'historical') {
    return `DAY ${tracker.dayCount}`;
  }
  const startYear = tracker.startDate.slice(0, 4);
  const endYear = tracker.endDate ? tracker.endDate.slice(0, 4) : 'Present';
  return startYear === endYear ? startYear : `${startYear}\u2013${endYear}`;
}

// ── Domain counts ──

export function computeDomainCounts(trackers: TrackerCardData[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of trackers) {
    if (t.domain) {
      counts[t.domain] = (counts[t.domain] || 0) + 1;
    }
  }
  return counts;
}

export function getVisibleDomains(counts: Record<string, number>): string[] {
  return DOMAIN_ORDER.filter(d => (counts[d] || 0) > 0);
}
