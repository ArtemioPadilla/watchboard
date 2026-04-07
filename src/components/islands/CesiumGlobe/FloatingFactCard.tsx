import { useMemo, useCallback, type CSSProperties } from 'react';
import { Cartesian3, type Viewer as CesiumViewer } from 'cesium';
import type { MapPoint } from '../../../lib/schemas';
import { MAP_CATEGORIES } from '../../../lib/map-utils';
import { useEntityScreenPosition } from './useEntityScreenPosition';
import { tierLabelFull, tierClass } from './cesium-helpers';

/* ── Types ─────────────────────────────────────────────────── */

export interface CarouselEntity {
  id: string;
  type: 'map-point' | 'generic';
  position: Cartesian3;
  point?: MapPoint;
  name?: string;
  description?: string;
}

interface Props {
  viewer: CesiumViewer;
  entities: CarouselEntity[];
  activeIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

/* ── Constants ─────────────────────────────────────────────── */

const CARD_WIDTH = 280;
const CARD_HEIGHT_EST = 200; // rough estimate for collision checks
const EDGE_MARGIN = 12;
const RIGHT_COLUMN_RESERVE = 320;
const BOTTOM_RESERVE = 260;
const OFFSET_FROM_ENTITY = 24;

/* ── Edge collision avoidance ──────────────────────────────── */

function computeCardPosition(
  ex: number,
  ey: number,
  viewW: number,
  viewH: number,
): { left: number; top: number; anchorX: number; anchorY: number; side: 'left' | 'right' } {
  const usableRight = viewW - RIGHT_COLUMN_RESERVE;
  const usableBottom = viewH - BOTTOM_RESERVE;

  // Try right side first
  let left = ex + OFFSET_FROM_ENTITY;
  let side: 'left' | 'right' = 'right';

  // Flip to left if card would overflow the usable right boundary
  if (left + CARD_WIDTH > usableRight) {
    left = ex - OFFSET_FROM_ENTITY - CARD_WIDTH;
    side = 'left';
  }

  // Clamp horizontal
  left = Math.max(EDGE_MARGIN, Math.min(left, viewW - CARD_WIDTH - EDGE_MARGIN));

  // Vertical: center on entity, then shift if needed
  let top = ey - CARD_HEIGHT_EST / 2;

  // Shift up if overlapping bottom reserve
  if (top + CARD_HEIGHT_EST > usableBottom) {
    top = usableBottom - CARD_HEIGHT_EST;
  }

  // Clamp vertical
  top = Math.max(EDGE_MARGIN, Math.min(top, viewH - CARD_HEIGHT_EST - EDGE_MARGIN));

  // Anchor point on the card edge closest to entity
  const anchorX = side === 'right' ? left : left + CARD_WIDTH;
  const anchorY = Math.max(top, Math.min(ey, top + CARD_HEIGHT_EST));

  return { left, top, anchorX, anchorY, side };
}

/* ── Styles ────────────────────────────────────────────────── */

const cardStyle: CSSProperties = {
  position: 'fixed',
  zIndex: 10,
  width: CARD_WIDTH,
  background: 'rgba(10,11,14,0.95)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  padding: '10px 12px',
  pointerEvents: 'auto',
  transition: 'opacity 0.25s ease',
  boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
};

const svgOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 9,
  transition: 'opacity 0.25s ease',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 6,
  marginBottom: 6,
};

const badgeStyle = (color: string): CSSProperties => ({
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '0.55rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color,
  background: `${color}22`,
  border: `1px solid ${color}44`,
  borderRadius: 3,
  padding: '1px 5px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
});

const titleStyle: CSSProperties = {
  fontFamily: "'Cormorant Garamond', serif",
  fontSize: '0.95rem',
  fontWeight: 600,
  color: 'rgba(255,255,255,0.92)',
  lineHeight: 1.2,
  flex: 1,
};

const closeBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.5)',
  fontSize: '1rem',
  cursor: 'pointer',
  padding: '0 2px',
  lineHeight: 1,
  flexShrink: 0,
};

const bodyStyle: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '0.72rem',
  color: 'rgba(255,255,255,0.65)',
  lineHeight: 1.45,
  marginBottom: 6,
};

const coordsStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '0.6rem',
  color: 'rgba(0,255,170,0.4)',
  marginTop: 4,
};

const tierChipStyle = (tier: number): CSSProperties => ({
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '0.55rem',
  borderRadius: 3,
  padding: '1px 5px',
  display: 'inline-block',
  marginRight: 4,
});

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  marginTop: 8,
  borderTop: '1px solid rgba(255,255,255,0.08)',
  paddingTop: 6,
};

const navBtnStyle: CSSProperties = {
  background: 'none',
  border: '1px solid rgba(255,255,255,0.15)',
  color: 'rgba(255,255,255,0.6)',
  borderRadius: 4,
  width: 22,
  height: 22,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.65rem',
  padding: 0,
};

const dotStyle = (active: boolean): CSSProperties => ({
  width: 5,
  height: 5,
  borderRadius: '50%',
  background: active ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.25)',
  transition: 'background 0.2s',
});

/* ── Component ─────────────────────────────────────────────── */

export default function FloatingFactCard({
  viewer,
  entities,
  activeIndex,
  onClose,
  onNavigate,
}: Props) {
  const entity = entities[activeIndex];
  if (!entity) return null;

  const screenPos = useEntityScreenPosition(viewer, entity.position);

  const viewW = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const viewH = typeof window !== 'undefined' ? window.innerHeight : 1080;

  const cardPos = useMemo(
    () => computeCardPosition(screenPos.x, screenPos.y, viewW, viewH),
    [screenPos.x, screenPos.y, viewW, viewH],
  );

  // Resolve display data from entity
  const point = entity.point;
  const category = point ? MAP_CATEGORIES.find(c => c.id === point.cat) : null;
  const displayName = point?.label ?? entity.name ?? 'Unknown';
  const displayDesc = point?.sub ?? entity.description ?? '';
  const displayColor = category?.color ?? '#888';
  const displayType = category?.label ?? (entity.type === 'generic' ? 'Point' : 'Map Point');

  const handlePrev = useCallback(() => {
    onNavigate((activeIndex - 1 + entities.length) % entities.length);
  }, [activeIndex, entities.length, onNavigate]);

  const handleNext = useCallback(() => {
    onNavigate((activeIndex + 1) % entities.length);
  }, [activeIndex, entities.length, onNavigate]);

  const opacity = screenPos.visible ? 1 : 0;

  return (
    <>
      {/* SVG connecting line */}
      <svg
        style={{ ...svgOverlayStyle, opacity }}
        width="100%"
        height="100%"
      >
        {/* Small circle around entity position */}
        <circle
          cx={screenPos.x}
          cy={screenPos.y}
          r={8}
          fill="none"
          stroke={displayColor}
          strokeWidth={1.2}
          strokeDasharray="3 2"
          opacity={0.7}
        />
        {/* Dashed line from entity to card anchor */}
        <line
          x1={screenPos.x}
          y1={screenPos.y}
          x2={cardPos.anchorX}
          y2={cardPos.anchorY}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      </svg>

      {/* Card */}
      <div
        style={{
          ...cardStyle,
          left: cardPos.left,
          top: cardPos.top,
          opacity,
        }}
      >
        {/* Header */}
        <div style={headerStyle}>
          <span style={badgeStyle(displayColor)}>{displayType}</span>
          <span style={titleStyle}>{displayName}</span>
          <button
            style={closeBtnStyle}
            onClick={onClose}
            aria-label="Close fact card"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        {displayDesc && <div style={bodyStyle}>{displayDesc}</div>}

        {/* Tier + Date */}
        {point && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span
              className={tierClass(point.tier)}
              style={tierChipStyle(point.tier)}
            >
              {tierLabelFull(point.tier)}
            </span>
            {point.date && (
              <span style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '0.65rem',
                color: 'rgba(255,255,255,0.45)',
              }}>
                {point.date}
              </span>
            )}
          </div>
        )}

        {/* Coordinates */}
        {point && (
          <div style={coordsStyle}>
            {point.lat >= 0 ? point.lat.toFixed(2) + '\u00b0N' : Math.abs(point.lat).toFixed(2) + '\u00b0S'}
            {', '}
            {point.lon >= 0 ? point.lon.toFixed(2) + '\u00b0E' : Math.abs(point.lon).toFixed(2) + '\u00b0W'}
          </div>
        )}

        {/* Carousel footer */}
        {entities.length > 1 && (
          <div style={footerStyle}>
            <button style={navBtnStyle} onClick={handlePrev} aria-label="Previous entity">
              &#9664;
            </button>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {entities.map((_, i) => (
                <span
                  key={i}
                  style={dotStyle(i === activeIndex)}
                />
              ))}
            </div>
            <button style={navBtnStyle} onClick={handleNext} aria-label="Next entity">
              &#9654;
            </button>
          </div>
        )}
      </div>
    </>
  );
}
