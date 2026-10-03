import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LAYER_PROP_KEYS, pickLayerProps } from './mobile-layer-props';

describe('pickLayerProps', () => {
  it('returns exactly the layer keys', () => {
    const picked = pickLayerProps({ trackerSlug: 'ukraine-war', staticLayers: ['radio-towers'], liveLayers: ['deepstate-frontline'], radioCountryCodes: ['UA'], mapBounds: { lonMin: 1, lonMax: 2, latMin: 3, latMax: 4 }, points: [] } as never);
    expect(Object.keys(picked).sort()).toEqual([...LAYER_PROP_KEYS].sort());
  });
});

describe('MobileMapTab source', () => {
  const src = readFileSync('src/components/islands/mobile/MobileMapTab.tsx', 'utf8');
  const block = (tag: string) => { const i = src.indexOf(`<${tag}`); return src.slice(i, src.indexOf('/>', i)); };
  it('spreads the same layerProps into the 2D map and the 3D globe', () => {
    expect(block('IntelMap')).toContain('{...layerProps}');
    expect(block('CesiumGlobe')).toContain('{...layerProps}');
  });
  it('passes no layer key by hand (so the two lists cannot drift)', () => {
    for (const k of LAYER_PROP_KEYS) {
      expect(block('IntelMap')).not.toMatch(new RegExp(`\\b${k}=`));
      expect(block('CesiumGlobe')).not.toMatch(new RegExp(`\\b${k}=`));
    }
  });
});
