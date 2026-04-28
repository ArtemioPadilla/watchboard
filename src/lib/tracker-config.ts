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
const GlobeLayoutSchema = z.enum(['default', 'mission', 'disaster']);

const GlobeConfigSchema = z.object({
  enabled: z.boolean(),
  layout: GlobeLayoutSchema.optional().default('default'),
  layoutOverrides: z.record(z.string(), z.array(z.string())).optional(),
  cameraPresets: z.record(z.string(), CameraPresetSchema).optional(),
  clocks: z.array(ClockSchema).optional(),
});

// ── Adaptive update policy ──
const UpdatePolicySchema = z.object({
  escalation: z.array(z.number().int().positive()).min(1),
  quietThreshold: z.number().int().min(0).default(0),
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
  updatePolicy: UpdatePolicySchema.optional(),
  backfillTargets: z.record(z.string(), z.number().int().positive()).optional(),
  rssFeeds: z.array(z.string().url()).optional(),
});

// ── Section IDs ──
export const SectionId = z.enum([
  'hero', 'kpis', 'timeline', 'map', 'military',
  'casualties', 'economic', 'claims', 'political',
]);

// ── Tone classification ──
export const ToneSchema = z.enum(['progress', 'alert', 'historical', 'neutral']);
export type Tone = z.infer<typeof ToneSchema>;

// ── Domain (primary topic classification) ──
export const DomainSchema = z.enum([
  'conflict',
  'security',
  'governance',
  'disaster',
  'human-rights',
  'science',
  'space',
  'economy',
  'culture',
  'history',
]);

// ── Geographic region ──
export const RegionSchema = z.enum([
  'north-america', 'central-america', 'south-america',
  'europe', 'central-europe', 'middle-east', 'africa',
  'central-asia', 'south-asia', 'east-asia',
  'southeast-asia', 'oceania', 'global',
]);

// ── Series (groups related trackers, optional hub) ──
const SeriesSchema = z.object({
  id: z.string(),
  name: z.string(),
  order: z.number().optional(),
  isHub: z.boolean().optional(),
});

// ── Cross-tracker relationship ──
const RelatedTrackerSchema = z.object({
  slug: z.string(),
  relation: z.enum([
    'predecessor', 'successor', 'context',
    'parallel', 'component', 'continuation',
  ]),
  label: z.string().optional(),
});

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

  // Tracker type classification
  trackerType: z.enum(['factual', 'institutional', 'historical']).optional(),

  tone: ToneSchema.optional().default('neutral'),

  // Taxonomy
  domain: DomainSchema.optional(),
  region: RegionSchema.optional(),
  tags: z.array(z.string()).optional(),
  series: SeriesSchema.optional(),
  related: z.array(RelatedTrackerSchema).optional(),
  country: z.string().optional(),

  // Geographic hierarchy
  state: z.string().optional(),
  city: z.string().optional(),
  neighborhood: z.string().optional(),
  geoPath: z.array(z.string()).optional(),
  geoSecondary: z.array(z.string()).optional(), // Secondary country codes for cross-border trackers

  // Aggregation & community
  aggregate: z.boolean().default(false),
  author: z.string().optional(),
  visibility: z.enum(['public', 'unlisted']).default('public'),

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
})
// Validate: geoPath[0] must be the ISO country code matching `country`.
// This ensures geographic tree construction is consistent.
// Aggregate trackers (geoPath: ["MX"]) must also follow this rule.
.superRefine((data, ctx) => {
  if (data.geoPath && data.country && data.geoPath[0] !== data.country) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `geoPath[0] "${data.geoPath[0]}" must match country "${data.country}"`,
      path: ['geoPath'],
    });
  }
});

export type TrackerConfig = z.infer<typeof TrackerConfigSchema>;
export type MapCategory = z.infer<typeof MapCategorySchema>;
export type CameraPreset = z.infer<typeof CameraPresetSchema>;
export type NavSection = z.infer<typeof NavSectionSchema>;
export type Tab = z.infer<typeof TabSchema>;
export type Domain = z.infer<typeof DomainSchema>;
export type Region = z.infer<typeof RegionSchema>;
export type Series = z.infer<typeof SeriesSchema>;
export type RelatedTracker = z.infer<typeof RelatedTrackerSchema>;
export type UpdatePolicy = z.infer<typeof UpdatePolicySchema>;
export type GlobeLayout = z.infer<typeof GlobeLayoutSchema>;
