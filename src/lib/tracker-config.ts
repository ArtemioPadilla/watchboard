import { z } from 'zod';

// ── Camera preset ──
const CameraPresetSchema = z.object({
  lon: z.number(),
  lat: z.number(),
  alt: z.number(),
  pitch: z.number(),
  heading: z.number(),
  label: z.string().optional(),
});

// ── Map category ──
const MapCategorySchema = z.object({
  id: z.string(),
  label: z.string(),
  color: z.string(),
});

// ── Nav section ──
const NavSectionSchema = z.object({
  id: z.string(),
  label: z.string(),
});

// ── Tab definition ──
const TabSchema = z.object({
  id: z.string(),
  label: z.string(),
});

// ── Map config ──
const MapConfigSchema = z.object({
  enabled: z.boolean(),
  bounds: z.object({
    lonMin: z.number(),
    lonMax: z.number(),
    latMin: z.number(),
    latMax: z.number(),
  }),
  center: z.object({ lon: z.number(), lat: z.number() }),
  categories: z.array(MapCategorySchema),
});

// ── Clock definition ──
const ClockSchema = z.object({
  label: z.string(),
  offsetHours: z.number(),
});

// ── Globe config ──
const GlobeConfigSchema = z.object({
  enabled: z.boolean(),
  cameraPresets: z.record(z.string(), CameraPresetSchema).optional(),
  clocks: z.array(ClockSchema).optional(),
});

// ── AI update config ──
const AiConfigSchema = z.object({
  systemPrompt: z.string(),
  searchContext: z.string(),
  enabledSections: z.array(z.string()),
  coordValidation: z.object({
    lonMin: z.number(),
    lonMax: z.number(),
    latMin: z.number(),
    latMax: z.number(),
  }).optional(),
  updateIntervalDays: z.number().int().positive().default(1),
  backfillTargets: z.record(z.string(), z.number().int().positive()).optional(),
});

// ── Section IDs ──
export const SectionId = z.enum([
  'hero', 'kpis', 'timeline', 'map', 'military',
  'casualties', 'economic', 'claims', 'political',
]);

// ── Full tracker config schema ──
export const TrackerConfigSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  shortName: z.string(),
  description: z.string(),
  icon: z.string().optional(),
  color: z.string().optional(),
  status: z.enum(['active', 'archived', 'draft']),
  temporal: z.enum(['live', 'historical']).default('live'),

  startDate: z.string(),
  endDate: z.string().optional(),
  eraLabel: z.string().optional(),

  sections: z.array(SectionId),

  map: MapConfigSchema.optional(),
  globe: GlobeConfigSchema.optional(),

  navSections: z.array(NavSectionSchema),
  militaryTabs: z.array(TabSchema).optional(),
  politicalAvatars: z.array(z.string()).optional(),
  eventTypes: z.array(z.string()).optional(),

  ai: AiConfigSchema.optional(),

  ogImage: z.string().optional(),
  githubRepo: z.string().optional(),
});

export type TrackerConfig = z.infer<typeof TrackerConfigSchema>;
export type MapCategory = z.infer<typeof MapCategorySchema>;
export type CameraPreset = z.infer<typeof CameraPresetSchema>;
export type NavSection = z.infer<typeof NavSectionSchema>;
export type Tab = z.infer<typeof TabSchema>;
