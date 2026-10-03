/**
 * The layer-related props MobileMapTab hands to BOTH the 2D map and the lazy
 * 3D globe. One object, spread into both, so the globe can never again be
 * mounted without them (it was: CesiumGlobe got no staticLayers, liveLayers,
 * trackerSlug, radioCountryCodes or mapBounds on mobile — spec §4).
 */
export const LAYER_PROP_KEYS = ['trackerSlug', 'mapBounds', 'liveLayers', 'staticLayers', 'radioCountryCodes', 'emptyScopes'] as const;
export type LayerProps = {
  trackerSlug: string;
  mapBounds?: { lonMin: number; lonMax: number; latMin: number; latMax: number };
  liveLayers?: string[];
  staticLayers?: string[];
  radioCountryCodes?: string[];
  /** Build-time `computeEmptyScopes()` result (layer id → codes with no mapped features). */
  emptyScopes?: Record<string, string[]>;
};
export function pickLayerProps(p: LayerProps & Record<string, unknown>): LayerProps {
  return { trackerSlug: p.trackerSlug, mapBounds: p.mapBounds, liveLayers: p.liveLayers, staticLayers: p.staticLayers, radioCountryCodes: p.radioCountryCodes, emptyScopes: p.emptyScopes };
}
