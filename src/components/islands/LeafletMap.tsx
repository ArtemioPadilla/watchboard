import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, ZoomControl, Circle, Marker, Polygon, Pane } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPoint, MapLine } from '../../lib/schemas';
import { catColor, lineColor, WEAPON_TYPE_WEIGHTS, WEAPON_TYPE_LABELS, STATUS_LABELS, computeArcPositions } from './map-helpers';
import type { OverlayData } from './useMapOverlays';
import type { FlightData } from './useMapFlights';
import MapArcAnimator from './MapArcAnimator';
import MapFactCards from './MapFactCards';
import type { FlatEvent } from '../../lib/timeline-utils';

// ────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────

interface Props {
  points: MapPoint[];
  lines: MapLine[];
  onSelectPoint: (pt: MapPoint) => void;
  onSelectLine?: (line: MapLine) => void;
  overlays?: OverlayData;
  flights?: FlightData[];
  terminatorPolygon?: [number, number][] | null;
  currentDate?: string;
  isPlaying?: boolean;
  events?: FlatEvent[];
  showFactCards?: boolean;
  mapCenter?: { lon: number; lat: number };
  mapBounds?: { lonMin: number; lonMax: number; latMin: number; latMax: number };
}

// ────────────────────────────────────────────
//  Marker helpers
// ────────────────────────────────────────────

/** Determine marker radius based on category and tier */
function markerRadius(cat: string, tier: number): number {
  if (cat === 'front') return 8;
  if (cat === 'asset') return 6;
  if (tier === 1) return 6;
  return 5;
}

/** Determine if point should show permanent label — driven by data fields */
function showPermanentLabel(pt: MapPoint): boolean {
  return pt.base === true || pt.showLabel === true;
}

// ────────────────────────────────────────────
//  Line rendering helpers (OSINT-aware)
// ────────────────────────────────────────────

/** Determine line weight -- uses weapon type if available */
function resolveLineWeight(line: MapLine): number {
  if (line.weaponType) {
    return WEAPON_TYPE_WEIGHTS[line.weaponType] || 1.5;
  }
  if (line.cat === 'strike') return 1.8;
  if (line.cat === 'retaliation') return 1.5;
  return 1.2;
}

/** Determine line opacity -- low confidence reduces opacity */
function resolveLineOpacity(line: MapLine): number {
  if (line.confidence === 'low') return 0.3;
  return 0.5;
}

/** Determine line dash pattern -- intercepted uses distinct pattern */
function resolveLineDash(line: MapLine): string {
  if (line.status === 'intercepted') return '3,8';
  if (line.cat === 'strike') return '8,4';
  if (line.cat === 'retaliation') return '4,6';
  if (line.cat === 'front') return '2,4';
  return '6,4';
}

/** Build a rich tooltip string for a line with OSINT data */
function buildLineTooltip(line: MapLine): string {
  const parts: string[] = [line.label];

  if (line.weaponType) {
    parts.push(WEAPON_TYPE_LABELS[line.weaponType] || line.weaponType.toUpperCase());
  }

  if (line.platform) {
    parts.push(`Platform: ${line.platform}`);
  }

  if (line.launched != null || line.intercepted != null) {
    const launched = line.launched != null ? `${line.launched} launched` : '';
    const intercepted = line.intercepted != null ? `${line.intercepted} intercepted` : '';
    const counts = [launched, intercepted].filter(Boolean).join(', ');
    if (counts) parts.push(counts);
  }

  if (line.status) {
    parts.push(`Status: ${STATUS_LABELS[line.status] || line.status.toUpperCase()}`);
  }

  if (line.damage) {
    parts.push(`Damage: ${line.damage}`);
  }

  if (line.casualties) {
    parts.push(`Casualties: ${line.casualties}`);
  }

  if (line.time) {
    parts.push(`Time: ${line.time}`);
  }

  return parts.join(' | ');
}

/** Create a DivIcon for military bases */
function baseIcon(): L.DivIcon {
  return L.divIcon({
    className: 'base-marker',
    html: '<span class="base-marker-inner">\u2B1F</span>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

// ────────────────────────────────────────────
//  Earthquake rendering helpers
// ────────────────────────────────────────────

/** Compute earthquake marker radius from magnitude */
function quakeRadius(mag: number): number {
  return Math.max(4, mag * 3);
}

/** Compute earthquake color from depth using HSL (shallow = red, deep = blue) */
function quakeColor(depth: number): string {
  // depth 0 -> hue 0 (red), depth 100+ -> hue 240 (blue)
  const hue = Math.min(240, Math.round((depth / 100) * 240));
  return `hsl(${hue}, 90%, 55%)`;
}

// ────────────────────────────────────────────
//  Component
// ────────────────────────────────────────────

export default function LeafletMap({
  points, lines, onSelectPoint, onSelectLine, overlays,
  flights, terminatorPolygon, currentDate, isPlaying,
  events, showFactCards, mapCenter, mapBounds,
}: Props) {
  const center: LatLngExpression = mapCenter ? [mapCenter.lat, mapCenter.lon] : [29, 49];

  const basePoints = points.filter(p => p.base);
  const frontPoints = points.filter(p => p.cat === 'front');
  const regularPoints = points.filter(p => p.cat !== 'front' && !p.base);

  const bounds = mapBounds
    ? L.latLngBounds(
        [mapBounds.latMin, mapBounds.lonMin],
        [mapBounds.latMax, mapBounds.lonMax],
      )
    : undefined;

  return (
    <MapContainer
      {...(bounds ? { bounds } : { center, zoom: 5 })}
      minZoom={3}
      maxZoom={12}
      style={{ width: '100%', height: '100%', background: '#0d0f14' }}
      scrollWheelZoom={true}
      zoomControl={false}
    >
      <ZoomControl position="topright" />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />

      {/* ── Day/night terminator (behind everything) ── */}
      {terminatorPolygon && (
        <Pane name="terminator-pane" style={{ zIndex: 200 }}>
          <Polygon
            positions={terminatorPolygon}
            pathOptions={{
              fillColor: '#000',
              fillOpacity: 0.15,
              weight: 0,
              stroke: false,
            }}
            interactive={false}
          />
        </Pane>
      )}

      {/* ── Overlay: No-fly zones ── */}
      {overlays?.noFlyZones.map(zone => (
        <Polygon
          key={zone.id}
          positions={zone.polygon}
          pathOptions={{
            color: zone.color,
            fillColor: zone.color,
            fillOpacity: 0.08,
            weight: 2,
            opacity: 0.5,
            dashArray: '6,4',
          }}
        >
          <Tooltip className="dark-tooltip nfz-tooltip" sticky>
            <span>{zone.label}</span>
          </Tooltip>
        </Polygon>
      ))}

      {/* ── Overlay: GPS jamming hexagons ── */}
      {overlays?.gpsJamming.map(zone => (
        <Polygon
          key={zone.id}
          positions={zone.hexLatLngs}
          pathOptions={{
            color: zone.color,
            fillColor: zone.color,
            fillOpacity: zone.fillAlpha,
            weight: 1.5,
            opacity: 0.4,
            dashArray: '4,4',
          }}
        >
          <Tooltip className="dark-tooltip jam-tooltip" sticky>
            <span>{zone.label}</span>
          </Tooltip>
        </Polygon>
      ))}

      {/* ── Overlay: Internet blackout zones ── */}
      {overlays?.internetBlackout.map(zone => (
        <Polygon
          key={zone.id}
          positions={zone.polygon}
          pathOptions={{
            color: zone.color,
            fillColor: zone.color,
            fillOpacity: zone.fillAlpha,
            weight: 2,
            opacity: zone.outlineAlpha,
            dashArray: '8,6',
          }}
        >
          <Tooltip className="dark-tooltip blackout-tooltip" sticky>
            <span>{zone.label}</span>
          </Tooltip>
        </Polygon>
      ))}

      {/* ── Overlay: Earthquakes ── */}
      {overlays?.earthquakes.map(quake => (
        <CircleMarker
          key={quake.id}
          center={[quake.lat, quake.lon]}
          radius={quakeRadius(quake.mag)}
          pathOptions={{
            color: quakeColor(quake.depth),
            fillColor: quakeColor(quake.depth),
            fillOpacity: 0.6,
            weight: 1.5,
          }}
          className={quake.mag >= 4.5 ? 'earthquake-marker' : undefined}
        >
          <Tooltip className="dark-tooltip" sticky>
            <span>{quake.label}<br />Depth: {quake.depth.toFixed(1)} km</span>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* ── Overlay: Weather (cloud cover circles + wind tooltips) ── */}
      {overlays?.weather
        .filter(w => w.cloudCover > 15)
        .map(w => (
          <Circle
            key={`wx-${w.label}`}
            center={[w.lat, w.lon]}
            radius={Math.max(15000, w.cloudCover * 800)}
            pathOptions={{
              color: '#88ccff',
              fillColor: '#88ccff',
              fillOpacity: Math.min(0.25, w.cloudCover / 400),
              weight: 0.5,
              opacity: Math.min(0.3, w.cloudCover / 300),
            }}
          >
            <Tooltip className="dark-tooltip weather-tooltip" sticky>
              <span>{w.label}: {Math.round(w.cloudCover)}% cloud {w.windText}</span>
            </Tooltip>
          </Circle>
        ))}

      {/* Active front zones -- soft glowing circles */}
      {frontPoints.map(pt => (
        <Circle
          key={`zone-${pt.id}`}
          center={[pt.lat, pt.lon]}
          radius={pt.zoneRadius ?? 40000}
          pathOptions={{
            color: '#9b59b6',
            fillColor: '#9b59b6',
            fillOpacity: 0.08,
            weight: 1,
            opacity: 0.3,
            dashArray: '4,4',
          }}
          className="front-zone-pulse"
        />
      ))}

      {/* Connection lines -- arc vectors with OSINT enhancements */}
      {lines.map((line, i) => {
        const from: [number, number] = [line.from[1], line.from[0]];
        const to: [number, number] = [line.to[1], line.to[0]];
        const positions = computeArcPositions(from, to);
        const color = lineColor(line.cat);
        const tooltipContent = buildLineTooltip(line);

        return (
          <Polyline
            key={`line-${i}`}
            positions={positions}
            pathOptions={{
              color,
              weight: resolveLineWeight(line),
              opacity: resolveLineOpacity(line),
              dashArray: resolveLineDash(line),
            }}
            eventHandlers={onSelectLine ? { click: () => onSelectLine(line) } : undefined}
          >
            <Tooltip className="dark-tooltip osint-tooltip">
              <span>
                {tooltipContent.split(' | ').map((part, j) => (
                  <span key={j}>{j > 0 && <br />}{part}</span>
                ))}
              </span>
            </Tooltip>
          </Polyline>
        );
      })}

      {/* Military bases -- pentagon icon, always visible */}
      {basePoints.map(pt => (
        <Marker
          key={pt.id}
          position={[pt.lat, pt.lon]}
          icon={baseIcon()}
          eventHandlers={{ click: () => onSelectPoint(pt) }}
        >
          <Tooltip
            permanent
            direction="top"
            offset={[0, -14]}
            className="dark-tooltip base-tooltip"
          >
            {pt.label}
          </Tooltip>
        </Marker>
      ))}

      {/* Front zone markers */}
      {frontPoints.map(pt => {
        const color = catColor(pt.cat);
        return (
          <CircleMarker
            key={pt.id}
            center={[pt.lat, pt.lon]}
            radius={markerRadius(pt.cat, pt.tier)}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.7,
              weight: 2,
            }}
            className="marker-pulse"
            eventHandlers={{ click: () => onSelectPoint(pt) }}
          >
            <Tooltip
              permanent={showPermanentLabel(pt)}
              direction="top"
              offset={[0, -10]}
              className="dark-tooltip"
            >
              {pt.label}
            </Tooltip>
          </CircleMarker>
        );
      })}

      {/* Regular map points -- sorted so tier-1 renders on top */}
      {[...regularPoints]
        .sort((a, b) => b.tier - a.tier)
        .map(pt => {
          const color = catColor(pt.cat);
          const isPermanent = showPermanentLabel(pt);
          const radius = markerRadius(pt.cat, pt.tier);

          return (
            <CircleMarker
              key={pt.id}
              center={[pt.lat, pt.lon]}
              radius={radius}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: pt.tier === 1 ? 0.9 : 0.7,
                weight: pt.tier === 1 ? 2 : 1,
              }}
              className={pt.tier === 1 ? 'marker-pulse' : undefined}
              eventHandlers={{ click: () => onSelectPoint(pt) }}
            >
              <Tooltip
                permanent={isPermanent}
                direction="top"
                offset={[0, -8]}
                className="dark-tooltip"
              >
                {pt.label}
              </Tooltip>
            </CircleMarker>
          );
        })}

      {/* ── Live flights ── */}
      {flights?.map(f => (
        <CircleMarker
          key={f.icao24}
          center={[f.lat, f.lon]}
          radius={f.isMilitary ? 5 : 3}
          pathOptions={{
            color: f.isMilitary ? '#ffdd00' : '#00aaff',
            fillColor: f.isMilitary ? '#ffdd00' : '#00aaff',
            fillOpacity: 0.8,
            weight: f.isMilitary ? 2 : 1,
          }}
          className={f.isMilitary ? 'flight-marker-military' : undefined}
        >
          <Tooltip className="dark-tooltip flight-tooltip" sticky>
            <span>
              {f.callsign || f.icao24}
              {f.isMilitary && <b> [MIL]</b>}
              <br />
              {f.country} | {f.altitude.toLocaleString()} ft | {f.velocity} kts
            </span>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* ── Animated strike arcs ── */}
      {currentDate && (
        <MapArcAnimator
          lines={lines}
          currentDate={currentDate}
          isPlaying={isPlaying ?? false}
        />
      )}

      {/* ── Fact cards overlay ── */}
      {showFactCards && currentDate && events && (
        <MapFactCards
          points={points}
          events={events}
          lines={lines}
          currentDate={currentDate}
        />
      )}
    </MapContainer>
  );
}
