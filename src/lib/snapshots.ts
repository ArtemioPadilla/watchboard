/**
 * snapshots.ts — curated overlay data (airspace closures, GPS jamming,
 * internet blackouts) loaded from src/data/snapshots/*.json and validated
 * once at import time.
 *
 * These used to be three arrays written twice: once inside the Cesium hooks
 * and once in MapOverlayData.ts for Leaflet, already diverging in their
 * labels. They are hand-curated snapshots of early March 2026 scoped to the
 * Iran conflict, and every file says so in `_provenance` so the UI can show
 * the date instead of pretending the layer is live (ADR-0002, plan E2.H5).
 */
import { z } from 'zod';
import nfzJson from '../data/snapshots/nfz.json';
import jamJson from '../data/snapshots/gps-jamming.json';
import blackoutJson from '../data/snapshots/blackouts.json';

const LonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const SnapshotProvenanceSchema = z.object({
  source: z.string().min(1),
  license: z.string().min(1),
  snapshotDate: IsoDate,
  scope: z.array(z.string().min(1)).min(1),
  note: z.string().optional(),
  url: z.string().url().optional(),
});
export type SnapshotProvenance = z.infer<typeof SnapshotProvenanceSchema>;

export const NoFlyZoneSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  startDate: IsoDate,
  endDate: IsoDate.optional(),
  polygon: z.array(LonLat).min(3),
  center: LonLat,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type NoFlyZone = z.infer<typeof NoFlyZoneSchema>;

export const GpsJammingZoneSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  center: LonLat,
  radiusKm: z.number().positive().max(2000),
  startDate: IsoDate,
  endDate: IsoDate.optional(),
  severity: z.enum(['high', 'medium', 'low']),
  source: z.string().optional(),
});
export type GpsJammingZone = z.infer<typeof GpsJammingZoneSchema>;

export const InternetBlackoutSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  region: z.string().min(1),
  polygon: z.array(LonLat).min(3),
  center: LonLat,
  startDate: IsoDate,
  endDate: IsoDate.optional(),
  severity: z.enum(['total', 'major', 'partial']),
  source: z.string().optional(),
});
export type InternetBlackout = z.infer<typeof InternetBlackoutSchema>;

function snapshotFile<T extends z.ZodTypeAny>(item: T) {
  return z.object({ _provenance: SnapshotProvenanceSchema, items: z.array(item) })
    .superRefine((file, ctx) => {
      const ids = new Set<string>();
      file.items.forEach((it: { id: string; startDate: string; endDate?: string }, i: number) => {
        if (ids.has(it.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items', i, 'id'], message: `duplicate id ${it.id}` });
        ids.add(it.id);
        if (it.endDate && it.endDate < it.startDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items', i, 'endDate'], message: 'endDate before startDate' });
        if (it.startDate > file._provenance.snapshotDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items', i, 'startDate'], message: 'startDate after snapshotDate' });
      });
    });
}

export const NoFlyZoneFileSchema = snapshotFile(NoFlyZoneSchema);
export const GpsJammingFileSchema = snapshotFile(GpsJammingZoneSchema);
export const InternetBlackoutFileSchema = snapshotFile(InternetBlackoutSchema);

const nfzFile = NoFlyZoneFileSchema.parse(nfzJson);
const jamFile = GpsJammingFileSchema.parse(jamJson);
const blackoutFile = InternetBlackoutFileSchema.parse(blackoutJson);

export const NO_FLY_ZONES: NoFlyZone[] = nfzFile.items;
export const NO_FLY_ZONES_PROVENANCE: SnapshotProvenance = nfzFile._provenance;
export const GPS_JAMMING_ZONES: GpsJammingZone[] = jamFile.items;
export const GPS_JAMMING_PROVENANCE: SnapshotProvenance = jamFile._provenance;
export const INTERNET_BLACKOUTS: InternetBlackout[] = blackoutFile.items;
export const INTERNET_BLACKOUTS_PROVENANCE: SnapshotProvenance = blackoutFile._provenance;

/** Items active on `date` (inclusive of start, inclusive of end). */
export function activeOn<T extends { startDate: string; endDate?: string }>(items: T[], date: string): T[] {
  return items.filter(z => date >= z.startDate && (!z.endDate || date <= z.endDate));
}

/** Multi-line labels are authored with "\n" for the globe; flatten for tooltips. */
export function flatLabel(label: string): string {
  return label.replace(/\n/g, ' ');
}
