import { useMemo } from 'react';
import { GeoJSON, Pane, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { Frontline } from '../../lib/deepstate';
import type { GdacsFile } from '../../../scripts/lib/gdacs';
import type { GeoLayer } from '../../lib/geo-layer-schema';
import { staticLayerMeta } from '../../lib/geo-layer-schema';

interface Props {
  frontline?: Frontline | null;
  gdacs?: GdacsFile | null;
  statics?: { id: string; layer: GeoLayer }[];
}

const GDACS_COLORS: Record<string, string> = { Red: '#ff1744', Orange: '#ff9100' };

/** Leaflet renderers for the E5 layers; data comes from the same hooks as the globe. */
export default function GeoLayersLeaflet({ frontline, gdacs, statics = [] }: Props) {
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
        return (
          <Pane key={id} name={`static-${id}`} style={{ zIndex: 360 }}>
            <GeoJSON
              key={`${id}-${layer._provenance.retrievedAt}`}
              data={layer as any}
              style={() => ({ color, weight: 1.2, opacity: 0.7, fillColor: color, fillOpacity: 0.2 })}
              pointToLayer={(_f: any, latlng: any) => L.circleMarker(latlng, { pane: `static-${id}`, radius: 4, color: '#000', weight: 1, fillColor: color, fillOpacity: 0.9 })}
              onEachFeature={(f: any, l: any) => { const n = f?.properties?.name; if (n) l.bindTooltip(String(n), { className: 'dark-tooltip', sticky: true }); }}
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
