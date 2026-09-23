import { useMemo } from 'react';
import { GeoJSON, Pane, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { Frontline } from '../../lib/deepstate';
import type { GdacsFile } from '../../../scripts/lib/gdacs';
import type { GeoLayer } from '../../lib/geo-layer-schema';
import { staticLayerMeta } from '../../lib/geo-layer-schema';
import { radioIconSvgFor, withinBounds, type LonLatBounds } from '../../lib/radio-icons';

interface Props {
  frontline?: Frontline | null;
  gdacs?: GdacsFile | null;
  statics?: { id: string; layer: GeoLayer }[];
  onSelectRadioFeature?: (properties: any) => void;
  /** Tracker's map.bounds (E5.H3): clips radio-towers/radio-stations to the theater, padded 2°. */
  bounds?: LonLatBounds | null;
}

const GDACS_COLORS: Record<string, string> = { Red: '#ff1744', Orange: '#ff9100' };

/** Leaflet renderers for the E5 layers; data comes from the same hooks as the globe. */
export default function GeoLayersLeaflet({ frontline, gdacs, statics = [], onSelectRadioFeature, bounds }: Props) {
  const frontlineFc = useMemo(() => frontline ? ({
    type: 'FeatureCollection' as const,
    features: frontline.polygons.map(p => ({
      type: 'Feature' as const,
      properties: { label: p.label, status: p.status, fill: p.fill, fillOpacity: p.fillOpacity, stroke: p.stroke },
      geometry: { type: 'Polygon' as const, coordinates: p.rings },
    })),
  }) : null, [frontline]);

  return (
    <>
      {frontlineFc && (
        <Pane name="frontline" style={{ zIndex: 350 }}>
          <GeoJSON
            key={`fl-${frontline?.id}`}
            data={frontlineFc as any}
            style={(f: any) => ({ color: f?.properties?.stroke, weight: 1, fillColor: f?.properties?.fill, fillOpacity: Math.min(0.5, (f?.properties?.fillOpacity ?? 0.3) + 0.1) })}
            onEachFeature={(f: any, layer: any) => layer.bindTooltip(`${f.properties.label} · DeepStateMAP ${frontline?.datetime ?? ''}`, { className: 'dark-tooltip', sticky: true })}
          />
        </Pane>
      )}
      {statics.map(({ id, layer }) => {
        const meta = staticLayerMeta(id);
        const color = meta?.color ?? '#ffffff';
        const radioSvg = radioIconSvgFor(id);
        // Radio layers clip to the tracker's theater (padded 2°); every other
        // static layer (nuclear plants, cables, chokepoints) renders as-is.
        const clippedLayer = meta?.clipToBounds && bounds
          ? { ...layer, features: layer.features.filter(f => {
              if (f.geometry.type !== 'Point') return true;
              const [lon, lat] = f.geometry.coordinates as number[];
              return withinBounds(lon, lat, bounds);
            }) }
          : layer;
        return (
          <Pane key={id} name={`static-${id}`} style={{ zIndex: 360 }}>
            <GeoJSON
              key={`${id}-${layer._provenance.retrievedAt}`}
              data={clippedLayer as any}
              style={() => ({ color, weight: 1.2, opacity: 0.7, fillColor: color, fillOpacity: 0.2 })}
              pointToLayer={(_f: any, latlng: any) => radioSvg
                ? L.marker(latlng, { icon: L.divIcon({ html: radioSvg, className: 'radio-map-icon', iconSize: [22, 22], iconAnchor: [11, 11] }), pane: `static-${id}` })
                : L.circleMarker(latlng, { pane: `static-${id}`, radius: 4, color: '#000', weight: 1, fillColor: color, fillOpacity: 0.9 })}
              onEachFeature={(f: any, l: any) => {
                const n = f?.properties?.name;
                if (n) l.bindTooltip(String(n), { className: 'dark-tooltip', sticky: true });
                if ((id === 'radio-stations' || id === 'radio-towers') && onSelectRadioFeature) {
                  l.on('click', () => onSelectRadioFeature(f.properties));
                }
              }}
            />
          </Pane>
        );
      })}
      {gdacs && gdacs.alerts.map(a => (
        <CircleMarker
          key={a.id}
          center={[a.lat, a.lon]}
          radius={a.level === 'Red' ? 8 : 6}
          pathOptions={{ color: '#000', weight: 1, fillColor: GDACS_COLORS[a.level] ?? '#fff', fillOpacity: 0.9 }}
        >
          <Tooltip className="dark-tooltip" sticky>
            <strong>GDACS {a.level} {a.eventType}</strong><br />{a.title}{a.severity ? <><br />{a.severity}</> : null}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}
