/**
 * radio-overrides.ts — community corrections to the radio-stations static
 * layer, applied by scripts/geo/refresh-layers.ts on top of whatever
 * radio-browser.info returns for the current run. A PR that edits
 * src/data/radio-stations-overrides.json changes the next regeneration
 * without waiting on the upstream directory to fix itself.
 */
import { z } from 'zod';
import overridesJson from '../data/radio-stations-overrides.json';
import type { GeoLayer } from './geo-layer-schema';

const StationPatchSchema = z.object({
  name: z.string().optional(),
  country: z.string().nullable().optional(),
  countryCode: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  freqLabel: z.string().nullable().optional(),
  streamUrl: z.string().url().optional(),
  codec: z.string().optional(),
  votes: z.number().optional(),
  stationUuid: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
});

export const RadioOverrideSchema = z.object({
  stationUuid: z.string().min(1),
  action: z.enum(['add', 'remove', 'correct']),
  note: z.string().min(1),
  source: z.string().min(1),
  patch: StationPatchSchema.optional(),
});
export type RadioOverride = z.infer<typeof RadioOverrideSchema>;

export function loadRadioOverrides(): RadioOverride[] {
  return z.array(RadioOverrideSchema).parse(overridesJson);
}

/** Pure: applies add/remove/correct overrides on top of the fetched features. */
export function applyRadioOverrides(features: GeoLayer['features'], overrides: RadioOverride[]): GeoLayer['features'] {
  let out = [...features];
  for (const ov of overrides) {
    if (ov.action === 'remove') {
      out = out.filter((f) => f.id !== ov.stationUuid);
    } else if (ov.action === 'correct') {
      out = out.map((f) => (f.id === ov.stationUuid ? { ...f, properties: { ...f.properties, ...ov.patch } } : f));
    } else if (ov.action === 'add') {
      const p = ov.patch ?? {};
      if (typeof p.lat !== 'number' || typeof p.lon !== 'number') continue; // can't place it without coordinates
      out.push({
        type: 'Feature', id: ov.stationUuid,
        properties: { stationUuid: ov.stationUuid, name: p.name ?? ov.stationUuid, country: p.country ?? null, countryCode: p.countryCode ?? null, language: p.language ?? null, freqLabel: p.freqLabel ?? null, streamUrl: p.streamUrl ?? '', codec: p.codec ?? 'MP3', votes: p.votes ?? 0 },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      });
    }
  }
  return out;
}
