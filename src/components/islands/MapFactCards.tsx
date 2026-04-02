import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { MapPoint, MapLine } from '../../lib/schemas';
import type { FlatEvent } from '../../lib/timeline-utils';
import { useFactCards } from './useFactCards';
import type { FactCard } from './useFactCards';

// ────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────

interface Props {
  points: MapPoint[];
  events: FlatEvent[];
  lines: MapLine[];
  currentDate: string;
  maxCards?: number;
}

// ────────────────────────────────────────────
//  HTML builder
// ────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function cardHtml(card: FactCard): string {
  const thumbHtml = card.thumbnail
    ? `<img class="fact-card-thumb" src="${esc(card.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
    : '';

  return `<div class="fact-card">
  <div class="fact-card-header">
    <span class="fact-card-category" style="color:${esc(card.categoryColor)}">${esc(card.category)}</span>
    ${card.utcTime ? `<span class="fact-card-time">${esc(card.utcTime)}</span>` : ''}
  </div>
  <div class="fact-card-title">${esc(card.title)}</div>
  ${thumbHtml}
  <div class="fact-card-connector"></div>
</div>`;
}

const CARD_H_NO_THUMB = 52;
const CARD_H_THUMB = 118;
const CONNECTOR_H = 20;

// ────────────────────────────────────────────
//  Component (renders nothing — imperative)
// ────────────────────────────────────────────

export default function MapFactCards({ points, events, lines, currentDate, maxCards }: Props) {
  const map = useMap();
  const markersRef = useRef<L.Marker[]>([]);
  const cards = useFactCards(points, events, lines, currentDate, maxCards);

  useEffect(() => {
    // Cleanup previous markers
    for (const marker of markersRef.current) {
      marker.remove();
    }
    markersRef.current = [];

    for (const card of cards) {
      const anchorY = (card.thumbnail ? CARD_H_THUMB : CARD_H_NO_THUMB) + CONNECTOR_H;
      const icon = L.divIcon({
        className: 'fact-card-wrapper',
        html: cardHtml(card),
        iconSize: [220, 0],
        iconAnchor: [110, anchorY],
      });

      const marker = L.marker([card.lat, card.lon], {
        icon,
        interactive: false,
        zIndexOffset: 1000,
      });

      marker.addTo(map);
      markersRef.current.push(marker);
    }

    return () => {
      for (const marker of markersRef.current) {
        marker.remove();
      }
      markersRef.current = [];
    };
  }, [map, cards]);

  return null;
}
