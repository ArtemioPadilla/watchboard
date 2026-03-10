import { useEffect, useRef, useState } from 'react';
import {
  Cartesian3,
  Color,
  NearFarScalar,
  DistanceDisplayCondition,
  VerticalOrigin,
  HorizontalOrigin,
  HeightReference,
  type Viewer as CesiumViewer,
  type Entity,
} from 'cesium';
import type { MapPoint } from '../../../lib/schemas';
import type { FlatEvent } from '../../../lib/timeline-utils';
import { buildFactCards, type FactCard, type FactCardCategory } from '../useFactCards';

// Re-export for consumers
export type { FactCard as GroundTruthCard };

// ────────────────────────────────────────────
//  Canvas card renderer
// ────────────────────────────────────────────

const CARD_WIDTH = 280;
const CARD_PADDING = 12;
const HEADER_HEIGHT = 20;
const TITLE_HEIGHT = 24;
const CARD_HEIGHT = HEADER_HEIGHT + TITLE_HEIGHT + CARD_PADDING * 2 + 4;

const CATEGORY_COLORS: Record<FactCardCategory, string> = {
  KINETIC: '#ff2244',
  INFRASTRUCTURE: '#ff8844',
  'CIVILIAN IMPACT': '#ffaa00',
  ESCALATION: '#ff44ff',
};

/** Draw a rounded rectangle path (compatible with older browsers) */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function renderFactCardCanvas(card: FactCard): HTMLCanvasElement {
  const dpr = 2; // retina
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH * dpr;
  canvas.height = CARD_HEIGHT * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = 'rgba(12, 14, 18, 0.92)';
  roundRectPath(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, 6);
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  roundRectPath(ctx, 0.5, 0.5, CARD_WIDTH - 1, CARD_HEIGHT - 1, 6);
  ctx.stroke();

  // Category accent line (top)
  const catColor = CATEGORY_COLORS[card.category] || '#ff4444';
  ctx.fillStyle = catColor;
  ctx.fillRect(CARD_PADDING, CARD_PADDING, 3, HEADER_HEIGHT);

  // Category label
  ctx.font = "bold 10px 'JetBrains Mono', monospace";
  ctx.fillStyle = catColor;
  ctx.textBaseline = 'middle';
  ctx.fillText(card.category, CARD_PADDING + 8, CARD_PADDING + HEADER_HEIGHT / 2);

  // UTC time (right-aligned)
  if (card.utcTime) {
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.fillStyle = 'rgba(232, 233, 237, 0.5)';
    ctx.textAlign = 'right';
    ctx.fillText(card.utcTime, CARD_WIDTH - CARD_PADDING, CARD_PADDING + HEADER_HEIGHT / 2);
    ctx.textAlign = 'left';
  }

  // Title
  ctx.font = "bold 11px 'JetBrains Mono', monospace";
  ctx.fillStyle = '#e8e9ed';
  // Truncate title to fit
  let title = card.title;
  while (ctx.measureText(title).width > CARD_WIDTH - CARD_PADDING * 2 && title.length > 3) {
    title = title.slice(0, -4) + '...';
  }
  ctx.fillText(title, CARD_PADDING, CARD_PADDING + HEADER_HEIGHT + TITLE_HEIGHT / 2 + 4);

  return canvas;
}

// ────────────────────────────────────────────
//  Hook
// ────────────────────────────────────────────

/** Ground truth / fact cards rendered as Cesium billboard entities at strike locations */
export function useGroundTruth(
  viewer: CesiumViewer | null,
  enabled: boolean,
  points: MapPoint[],
  events: FlatEvent[],
  currentDate: string,
) {
  const [count, setCount] = useState(0);
  const [cards, setCards] = useState<FactCard[]>([]);
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

    const builtCards = buildFactCards(points, events, [], currentDate, 8);
    setCards(builtCards);
    setCount(builtCards.length);

    for (const card of builtCards) {
      const cssColor = CATEGORY_COLORS[card.category] || '#ff4444';
      const color = Color.fromCssColorString(cssColor);

      // Canvas-rendered card billboard
      const canvas = renderFactCardCanvas(card);
      const billboardEntity = viewer.entities.add({
        name: `FC: ${card.title}`,
        position: Cartesian3.fromDegrees(card.lon, card.lat, 5000),
        billboard: {
          image: canvas as any,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          verticalOrigin: VerticalOrigin.BOTTOM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(5e4, 0.6, 3e6, 0.18),
          distanceDisplayCondition: new DistanceDisplayCondition(0, 5e6),
          heightReference: HeightReference.NONE,
          pixelOffset: { x: 0, y: -8 } as any,
        },
      });
      entitiesRef.current.push(billboardEntity);

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
