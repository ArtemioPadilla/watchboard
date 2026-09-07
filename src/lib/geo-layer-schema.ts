/**
 * geo-layer-schema.ts — contract for static GeoJSON layers under
 * public/geo/layers/{id}.geojson (plan E5.H3).
 *
 * A static layer is a FeatureCollection with a `_provenance` block: where
 * it came from, under which license, when it was retrieved and how it was
 * transformed. The UI shows the retrieval date next to the toggle; the
 * refresh script (scripts/geo/refresh-layers.ts) is the only writer.
 */
import { z } from 'zod';

export const GeoLayerProvenanceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  source: z.string().min(1),
  url: z.string().url(),
  license: z.string().min(1),
  attribution: z.string().min(1),
  retrievedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
  transform: z.string().optional(),
  featureCount: z.number().int().nonnegative(),
});
export type GeoLayerProvenance = z.infer<typeof GeoLayerProvenanceSchema>;

const Position = z.array(z.number()).min(2);
const GeometrySchema = z.object({
  type: z.enum(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']),
  coordinates: z.union([Position, z.array(Position), z.array(z.array(Position)), z.array(z.array(z.array(Position)))]),
});

export const GeoLayerFeatureSchema = z.object({
  type: z.literal('Feature'),
  id: z.union([z.string(), z.number()]).optional(),
  properties: z.record(z.string(), z.unknown()).default({}),
  geometry: GeometrySchema,
});

export const GeoLayerSchema = z.object({
  type: z.literal('FeatureCollection'),
  _provenance: GeoLayerProvenanceSchema,
  features: z.array(GeoLayerFeatureSchema),
}).superRefine((layer, ctx) => {
  if (layer._provenance.featureCount !== layer.features.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['_provenance', 'featureCount'], message: `featureCount ${layer._provenance.featureCount} != features.length ${layer.features.length}` });
  }
});
export type GeoLayer = z.infer<typeof GeoLayerSchema>;

/** Display metadata for the toggles and the sources page. */
export interface StaticLayerMeta {
  id: string;
  label: string;
  color: string;
  kind: 'point' | 'line' | 'polygon';
}

export const STATIC_LAYERS: StaticLayerMeta[] = [
  { id: 'nuclear-plants', label: 'layers.nuclearPlants', color: '#ffcc00', kind: 'point' },
  { id: 'submarine-cables', label: 'layers.submarineCables', color: '#4fc3f7', kind: 'line' },
  { id: 'maritime-chokepoints', label: 'layers.chokepoints', color: '#ff8a65', kind: 'point' },
];

export function staticLayerMeta(id: string): StaticLayerMeta | undefined {
  return STATIC_LAYERS.find(l => l.id === id);
}
