import { z } from 'zod';

// ── Shared ──

export const TierSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

export const PoleSchema = z.enum(['western', 'middle_eastern', 'eastern', 'international']);

export const SourceSchema = z.object({
  name: z.string(),
  tier: TierSchema,
  url: z.string().optional(),
  pole: PoleSchema.optional(),
});

// ── KPI items ──
export const KpiSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  color: z.enum(['red', 'amber', 'blue', 'green']),
  source: z.string(),
  contested: z.boolean(),
  contestNote: z.string().optional(),
  delta: z.string().optional(),
  deltaNote: z.string().optional(),
  trend: z.enum(['up', 'down', 'stable']).optional(),
  lastUpdated: z.string().optional(),
});

// ── Media ──
export const MediaItemSchema = z.object({
  type: z.enum(['image', 'video', 'article']),
  url: z.string(),
  caption: z.string().optional(),
  source: z.string().optional(),
  thumbnail: z.string().optional(),
});

// ── OSINT Enums ──

export const WeaponTypeSchema = z.enum([
  'ballistic', 'cruise', 'drone', 'drone_loitering', 'drone_ucav', 'drone_recon', 'drone_fpv', 'rocket', 'mixed', 'unknown'
]);
export const ConfidenceSchema = z.enum(['high', 'medium', 'low']);
export const StrikeStatusSchema = z.enum(['hit', 'intercepted', 'partial', 'unknown']);

// ── Timeline ──
export const TimelineEventSchema = z.object({
  id: z.string(),
  year: z.string(),
  title: z.string(),
  type: z.string(),
  active: z.boolean().optional(),
  detail: z.string(),
  sources: z.array(SourceSchema),
  media: z.array(MediaItemSchema).optional(),
  weaponTypes: z.array(WeaponTypeSchema).optional(),
  confidence: ConfidenceSchema.optional(),
  lastUpdated: z.string().optional(),
});

export const TimelineEraSchema = z.object({
  era: z.string(),
  events: z.array(TimelineEventSchema),
});

// ── Shared field schemas ──

/** HH:MM time format (0:00–23:59) */
const TimeFieldSchema = z.string().regex(
  /^([01]?\d|2[0-3]):[0-5]\d$/,
  'Invalid time format, expected HH:MM (0:00–23:59)',
);

/** ISO date format YYYY-MM-DD — rejects future dates */
const DateFieldSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((d) => d <= new Date().toISOString().slice(0, 10), 'Date must not be in the future');

/** Check if a YYYY-MM-DD date string is in the future relative to today. */
export function isFutureDate(dateStr: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return dateStr > today;
}

/** Theater coordinate: [lon, lat] — bounds are tracker-specific, validated at config level */
const TheaterCoordSchema = z.tuple([z.number(), z.number()]);

// ── Map ──
export const MapPointSchema = z.object({
  id: z.string(),
  lon: z.number(),
  lat: z.number(),
  cat: z.string(),
  label: z.string(),
  sub: z.string(),
  tier: TierSchema,
  date: DateFieldSchema,
  base: z.boolean().optional(),
  showLabel: z.boolean().optional(),
  zoneRadius: z.number().positive().optional(),
  lastUpdated: z.string().optional(),
});

export const MapLineSchema = z.object({
  id: z.string(),
  from: TheaterCoordSchema,
  to: TheaterCoordSchema,
  cat: z.string(),
  label: z.string(),
  date: DateFieldSchema,
  weaponType: WeaponTypeSchema.optional(),
  launched: z.number().int().min(0).optional(),
  intercepted: z.number().int().min(0).optional(),
  confidence: ConfidenceSchema.optional(),
  time: TimeFieldSchema.optional(),
  damage: z.string().optional(),
  casualties: z.string().optional(),
  notes: z.string().optional(),
  platform: z.string().optional(),
  status: StrikeStatusSchema.optional(),
  lastUpdated: z.string().optional(),
}).superRefine((line, ctx) => {
  // strike/retaliation lines require weaponType + time for build compatibility
  if (line.cat === 'strike' || line.cat === 'retaliation') {
    if (!line.weaponType) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weaponType'], message: 'weaponType is required for strike/retaliation lines' });
    }
    if (!line.time) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['time'], message: 'time is required for strike/retaliation lines' });
    }
  }
});

// ── Military strike items ──
export const StrikeItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  detail: z.string(),
  icon: z.enum(['target', 'retaliation', 'asset', 'casualty']),
  time: z.string(),
  tier: TierSchema,
  lastUpdated: z.string().optional(),
});

// ── Assets ──
export const AssetSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  detail: z.string(),
  lastUpdated: z.string().optional(),
});

// ── Casualties ──
export const CasualtyRowSchema = z.object({
  id: z.string(),
  category: z.string(),
  killed: z.string(),
  injured: z.string(),
  source: z.string(),
  tier: z.union([TierSchema, z.literal('all')]),
  contested: z.enum(['yes', 'no', 'evolving', 'heavily', 'partial']),
  note: z.string(),
  lastUpdated: z.string().optional(),
});

// ── Economic ──
export const EconItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  change: z.string(),
  direction: z.enum(['up', 'down']),
  sparkData: z.array(z.number()).min(2),
  color: z.string(),
  source: z.string(),
  lastUpdated: z.string().optional(),
});

// ── Claims ──
export const ClaimSchema = z.object({
  id: z.string(),
  question: z.string(),
  sideA: z.object({ label: z.string(), text: z.string() }),
  sideB: z.object({ label: z.string(), text: z.string() }),
  resolution: z.string(),
  lastUpdated: z.string().optional(),
});

// ── Political ──
export const PolItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  avatar: z.string(),
  initial: z.string(),
  quote: z.string(),
  lastUpdated: z.string().optional(),
});

// ── Meta ──
export const MetaSchema = z.object({
  operationName: z.string(),
  dayCount: z.number(),
  dateline: z.string(),
  heroHeadline: z.string(),
  heroSubtitle: z.string(),
  footerNote: z.string(),
  lastUpdated: z.string(),
  breaking: z.boolean().optional(),
});

// ── Digest (RSS feed items) ──
export const DigestEntrySchema = z.object({
  date: z.string(),
  title: z.string(),
  summary: z.string(),
  sectionsUpdated: z.array(z.string()).optional(),
});

// ── Ingestion Metrics ──
export const MetricsValidationErrorSchema = z.object({
  tracker: z.string(),
  file: z.string(),
  field: z.string(),
  message: z.string(),
});

export const MetricsInventorySchema = z.object({
  kpis: z.number(),
  timeline: z.number(),
  mapPoints: z.number(),
  mapLines: z.number(),
  claims: z.number(),
  political: z.number(),
  casualties: z.number(),
  events: z.number(),
});

export const MetricsRunSchema = z.object({
  timestamp: z.string(),
  status: z.enum(['success', 'failure']),
  trigger: z.enum(['schedule', 'workflow_dispatch']),
  trackersResolved: z.array(z.string()),
  validation: z.object({
    jsonValid: z.boolean(),
    schemaValid: z.boolean(),
    errors: z.array(MetricsValidationErrorSchema),
    fixAgentInvoked: z.boolean().optional(),
    fixAgentResult: z.enum(['success', 'failure']).optional(),
    errorsBeforeFix: z.number().optional(),
    errorsAfterFix: z.number().optional(),
  }),
  inventory: z.record(z.string(), MetricsInventorySchema),
});

export const MetricsIndexEntrySchema = z.object({
  file: z.string(),
  timestamp: z.string(),
  status: z.enum(['success', 'failure']),
  trackerCount: z.number(),
  errorCount: z.number(),
});

// ── Inferred types ──
export type MediaItem = z.infer<typeof MediaItemSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type KpiItem = z.infer<typeof KpiSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type TimelineEra = z.infer<typeof TimelineEraSchema>;
export type MapPoint = z.infer<typeof MapPointSchema>;
export type MapLine = z.infer<typeof MapLineSchema>;
export type StrikeItem = z.infer<typeof StrikeItemSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type CasualtyRow = z.infer<typeof CasualtyRowSchema>;
export type EconItem = z.infer<typeof EconItemSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type PolItem = z.infer<typeof PolItemSchema>;
export type Meta = z.infer<typeof MetaSchema>;
export type WeaponType = z.infer<typeof WeaponTypeSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type StrikeStatus = z.infer<typeof StrikeStatusSchema>;
export type DigestEntry = z.infer<typeof DigestEntrySchema>;
export type MetricsValidationError = z.infer<typeof MetricsValidationErrorSchema>;
export type MetricsInventory = z.infer<typeof MetricsInventorySchema>;
export type MetricsRun = z.infer<typeof MetricsRunSchema>;
export type MetricsIndexEntry = z.infer<typeof MetricsIndexEntrySchema>;

// ── Mission Trajectory ──

export const MissionPhaseSchema = z.object({
  id: z.string(),
  label: z.string(),
  start: z.string(),
  end: z.string(),
});

export const MissionCrewSchema = z.object({
  name: z.string(),
  role: z.string(),
});

export const MissionWaypointSchema = z.object({
  t: z.string(),
  x: z.number(), y: z.number(), z: z.number(),
  vx: z.number(), vy: z.number(), vz: z.number(),
});

export const MissionTrajectorySchema = z.object({
  vehicle: z.string(),
  crew: z.array(MissionCrewSchema),
  launchTime: z.string(),
  splashdownTime: z.string(),
  phases: z.array(MissionPhaseSchema).min(1),
  waypoints: z.array(MissionWaypointSchema).min(2),
});

export type MissionPhase = z.infer<typeof MissionPhaseSchema>;
export type MissionCrew = z.infer<typeof MissionCrewSchema>;
export type MissionWaypoint = z.infer<typeof MissionWaypointSchema>;
export type MissionTrajectory = z.infer<typeof MissionTrajectorySchema>;
