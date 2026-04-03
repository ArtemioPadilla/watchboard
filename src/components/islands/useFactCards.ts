import { useMemo } from 'react';
import type { MapPoint, MapLine } from '../../lib/schemas';
import type { FlatEvent } from '../../lib/timeline-utils';

// ────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────

export type FactCardCategory = 'KINETIC' | 'INFRASTRUCTURE' | 'CIVILIAN IMPACT' | 'ESCALATION';

export interface FactCard {
  id: string;
  lon: number;
  lat: number;
  category: FactCardCategory;
  categoryColor: string;
  utcTime: string;
  title: string;
  thumbnail?: string;
  tier: number;
  date: string;
}

// ────────────────────────────────────────────
//  Constants
// ────────────────────────────────────────────

const CATEGORY_COLORS: Record<FactCardCategory, string> = {
  KINETIC: '#ff2244',
  INFRASTRUCTURE: '#ff8844',
  'CIVILIAN IMPACT': '#ffaa00',
  ESCALATION: '#ff44ff',
};

// ────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────

/** Classify a timeline event into a fact card category */
export function classifyEvent(event: FlatEvent): FactCardCategory {
  const t = (event.type || '').toLowerCase();
  if (t === 'military' || t.includes('strike') || t.includes('kinetic')) return 'KINETIC';
  if (t.includes('infrastructure') || t.includes('internet') || t.includes('cyber')) return 'INFRASTRUCTURE';
  if (t.includes('humanitarian') || t.includes('civilian')) return 'CIVILIAN IMPACT';
  if (t.includes('escalation') || t.includes('diplomatic')) return 'ESCALATION';
  return 'KINETIC';
}

/** Map point category to fact card category */
function catToCategory(cat: string): FactCardCategory {
  if (cat === 'strike') return 'KINETIC';
  if (cat === 'retaliation') return 'KINETIC';
  if (cat === 'front') return 'ESCALATION';
  return 'INFRASTRUCTURE';
}

/** Build fact cards from conflict data for a given date */
export function buildFactCards(
  points: MapPoint[],
  events: FlatEvent[],
  lines: MapLine[],
  currentDate: string,
  maxCards: number,
): FactCard[] {
  const cards: FactCard[] = [];
  // Spatial dedup: grid-snap to 0.5° cells
  const seen = new Set<string>();

  // ── From strike/retaliation map points on current date ──
  for (const pt of points) {
    if (pt.date !== currentDate) continue;
    if (pt.cat !== 'strike' && pt.cat !== 'retaliation') continue;

    const cellKey = `${Math.round(pt.lon * 2) / 2},${Math.round(pt.lat * 2) / 2}`;
    if (seen.has(cellKey)) continue;
    seen.add(cellKey);

    // Try to find a matching MapLine for UTC time
    const matchingLine = lines.find(
      l =>
        l.date === currentDate &&
        Math.abs(l.to[0] - pt.lon) < 0.5 &&
        Math.abs(l.to[1] - pt.lat) < 0.5,
    );

    // Try to find a matching event for thumbnail
    const matchingEvent = events.find(
      e => e.resolvedDate === currentDate && e.title?.toUpperCase().includes(pt.label.toUpperCase().substring(0, 8)),
    );

    const utcTime = matchingLine?.time
      ? `${matchingLine.time} UTC`
      : '';

    const thumbnail = matchingEvent?.media?.find(m => m.thumbnail)?.thumbnail;

    const category = catToCategory(pt.cat);

    cards.push({
      id: `fc-pt-${pt.id}`,
      lon: pt.lon,
      lat: pt.lat,
      category,
      categoryColor: CATEGORY_COLORS[category],
      utcTime,
      title: pt.label.toUpperCase(),
      thumbnail,
      tier: pt.tier,
      date: pt.date,
    });
  }

  // Sort: lower tier first (higher priority), then by category weight
  const catWeight: Record<FactCardCategory, number> = {
    KINETIC: 0,
    INFRASTRUCTURE: 1,
    'CIVILIAN IMPACT': 2,
    ESCALATION: 3,
  };
  cards.sort((a, b) => a.tier - b.tier || catWeight[a.category] - catWeight[b.category]);

  return cards.slice(0, maxCards);
}

// ────────────────────────────────────────────
//  Hook
// ────────────────────────────────────────────

export function useFactCards(
  points: MapPoint[],
  events: FlatEvent[],
  lines: MapLine[],
  currentDate: string,
  maxCards = 8,
): FactCard[] {
  return useMemo(
    () => buildFactCards(points, events, lines, currentDate, maxCards),
    [points, events, lines, currentDate, maxCards],
  );
}
