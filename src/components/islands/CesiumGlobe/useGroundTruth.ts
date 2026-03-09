import { useEffect, useRef, useState } from 'react';
import {
  Cartesian3,
  Color,
  LabelStyle,
  VerticalOrigin,
  HorizontalOrigin,
  NearFarScalar,
  DistanceDisplayCondition,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import type { MapPoint } from '../../../lib/schemas';
import type { FlatEvent } from '../../../lib/timeline-utils';

export interface GroundTruthCard {
  id: string;
  title: string;
  type: 'kinetic' | 'infrastructure' | 'civilian_impact' | 'escalation';
  utcTime: string;
  lon: number;
  lat: number;
  date: string;
}

const TYPE_COLORS: Record<string, string> = {
  kinetic: '#ff2244',
  infrastructure: '#ff8844',
  civilian_impact: '#ffaa00',
  escalation: '#ff44ff',
};

const TYPE_LABELS: Record<string, string> = {
  kinetic: 'KINETIC',
  infrastructure: 'INFRASTRUCTURE',
  civilian_impact: 'CIVILIAN IMPACT',
  escalation: 'ESCALATION',
};

/** Derive event type from timeline event */
function classifyEvent(event: FlatEvent): string {
  const typeStr = (event.type || '').toLowerCase();
  if (typeStr === 'military' || typeStr.includes('strike') || typeStr.includes('kinetic')) return 'kinetic';
  if (typeStr.includes('infrastructure') || typeStr.includes('internet') || typeStr.includes('cyber')) return 'infrastructure';
  if (typeStr.includes('humanitarian') || typeStr.includes('civilian')) return 'civilian_impact';
  if (typeStr.includes('escalation') || typeStr.includes('diplomatic')) return 'escalation';
  return 'kinetic';
}

/** Generate ground truth cards from conflict data points and timeline events */
function buildGroundTruthCards(
  points: MapPoint[],
  events: FlatEvent[],
  currentDate: string,
): GroundTruthCard[] {
  const cards: GroundTruthCard[] = [];
  const seen = new Set<string>();

  // From strike/retaliation map points on current date
  for (const pt of points) {
    if (pt.date !== currentDate) continue;
    if (pt.cat !== 'strike' && pt.cat !== 'retaliation') continue;
    const key = `${pt.lon.toFixed(1)}-${pt.lat.toFixed(1)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    cards.push({
      id: `gt-pt-${pt.id}`,
      title: pt.label.toUpperCase(),
      type: pt.cat === 'strike' ? 'kinetic' : 'kinetic',
      utcTime: pt.date,
      lon: pt.lon,
      lat: pt.lat,
      date: pt.date,
    });
  }

  // From timeline events on current date with location
  for (const ev of events) {
    if (ev.resolvedDate !== currentDate) continue;
    const evType = classifyEvent(ev);
    // Use events that don't already overlap with map points
    const title = (ev.title || '').toUpperCase();
    const key = title.substring(0, 20);
    if (seen.has(key)) continue;
    seen.add(key);

    // Skip events without geographic context (no reliable lon/lat from timeline events)
    // Instead, we use them to augment nearby map point cards
  }

  return cards;
}

/** Ground truth intelligence cards rendered as Cesium entities at strike locations */
export function useGroundTruth(
  viewer: CesiumViewer | null,
  enabled: boolean,
  points: MapPoint[],
  events: FlatEvent[],
  currentDate: string,
  onSelectCard?: (card: GroundTruthCard) => void,
) {
  const [count, setCount] = useState(0);
  const [cards, setCards] = useState<GroundTruthCard[]>([]);
  const entitiesRef = useRef<Entity[]>([]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;

    // Cleanup previous
    entitiesRef.current.forEach(e => {
      try { viewer.entities.remove(e); } catch { /* ok */ }
    });
    entitiesRef.current = [];

    if (!enabled) {
      setCount(0);
      setCards([]);
      return;
    }

    const builtCards = buildGroundTruthCards(points, events, currentDate);
    setCards(builtCards);
    setCount(builtCards.length);

    for (const card of builtCards) {
      const cssColor = TYPE_COLORS[card.type] || '#ff4444';
      const typeLabel = TYPE_LABELS[card.type] || 'EVENT';
      const color = Color.fromCssColorString(cssColor);

      // Main label — event type + time
      const headerEntity = viewer.entities.add({
        name: `GT: ${card.title}`,
        position: Cartesian3.fromDegrees(card.lon, card.lat, 5000),
        label: {
          text: `${typeLabel}    ${card.utcTime}`,
          font: "bold 9px 'JetBrains Mono', monospace",
          fillColor: Color.WHITE.withAlpha(0.95),
          backgroundColor: Color.fromCssColorString('#111').withAlpha(0.85),
          showBackground: true,
          backgroundPadding: { x: 8, y: 5 } as any,
          outlineColor: color.withAlpha(0.8),
          outlineWidth: 1,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          horizontalOrigin: HorizontalOrigin.LEFT,
          scaleByDistance: new NearFarScalar(5e4, 1.0, 3e6, 0.3),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 5e6),
          pixelOffset: { x: 6, y: -20 } as any,
        },
      });
      entitiesRef.current.push(headerEntity);

      // Title label below header
      const titleEntity = viewer.entities.add({
        position: Cartesian3.fromDegrees(card.lon, card.lat, 5000),
        label: {
          text: card.title,
          font: "bold 10px 'JetBrains Mono', monospace",
          fillColor: Color.WHITE.withAlpha(0.9),
          backgroundColor: Color.fromCssColorString('#111').withAlpha(0.85),
          showBackground: true,
          backgroundPadding: { x: 8, y: 5 } as any,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.TOP,
          horizontalOrigin: HorizontalOrigin.LEFT,
          scaleByDistance: new NearFarScalar(5e4, 1.0, 3e6, 0.3),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 5e6),
          pixelOffset: { x: 6, y: -5 } as any,
        },
      });
      entitiesRef.current.push(titleEntity);

      // Connecting line from ground to card
      const lineEntity = viewer.entities.add({
        polyline: {
          positions: [
            Cartesian3.fromDegrees(card.lon, card.lat, 0),
            Cartesian3.fromDegrees(card.lon, card.lat, 5000),
          ],
          width: 1.5,
          material: color.withAlpha(0.4),
        },
      });
      entitiesRef.current.push(lineEntity);

      // Ground marker dot
      const dotEntity = viewer.entities.add({
        position: Cartesian3.fromDegrees(card.lon, card.lat, 200),
        point: {
          pixelSize: 6,
          color: color.withAlpha(0.9),
          outlineColor: Color.WHITE.withAlpha(0.5),
          outlineWidth: 1,
        },
      });
      entitiesRef.current.push(dotEntity);
    }

    return () => {
      if (!viewer.isDestroyed()) {
        entitiesRef.current.forEach(e => {
          try { viewer.entities.remove(e); } catch { /* ok */ }
        });
      }
      entitiesRef.current = [];
    };
  }, [enabled, viewer, currentDate, points, events]);

  return { count, cards };
}
