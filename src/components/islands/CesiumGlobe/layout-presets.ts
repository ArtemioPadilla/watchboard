/**
 * Globe layout presets — defines which panels appear in which grid slots.
 * Each preset maps slot IDs to arrays of panel IDs.
 * CesiumGlobe reads the resolved layout and renders panels dynamically.
 */

export type PanelId =
  | 'op-header'
  | 'kpi-strip'
  | 'toolbar'
  | 'intel'
  | 'telemetry'
  | 'mission-identity'
  | 'timeline';

export type SlotId =
  | 'top-center'
  | 'top-right'
  | 'left'
  | 'right'
  | 'bottom-left'
  | 'bottom';

export type GlobeLayoutPreset = 'default' | 'mission' | 'disaster';

export interface ResolvedLayout {
  slots: Record<SlotId, PanelId[]>;
  hudMode: 'military' | 'civilian';
  missionTimelineHeader: boolean;
}

const DEFAULT_LAYOUT: ResolvedLayout = {
  slots: {
    'top-center': ['op-header'],
    'top-right': ['kpi-strip'],
    'left': ['toolbar'],
    'right': ['intel'],
    'bottom-left': [],
    'bottom': ['timeline'],
  },
  hudMode: 'military',
  missionTimelineHeader: false,
};

const MISSION_LAYOUT: ResolvedLayout = {
  slots: {
    'top-center': ['op-header'],
    'top-right': ['kpi-strip'],
    'left': ['toolbar'],
    'right': ['intel', 'telemetry'],
    'bottom-left': ['mission-identity'],
    'bottom': ['timeline'],
  },
  hudMode: 'military',
  missionTimelineHeader: true,
};

const DISASTER_LAYOUT: ResolvedLayout = {
  slots: {
    'top-center': ['op-header'],
    'top-right': ['kpi-strip'],
    'left': ['toolbar'],
    'right': ['intel'],
    'bottom-left': [],
    'bottom': ['timeline'],
  },
  hudMode: 'civilian',
  missionTimelineHeader: false,
};

const PRESETS: Record<GlobeLayoutPreset, ResolvedLayout> = {
  default: DEFAULT_LAYOUT,
  mission: MISSION_LAYOUT,
  disaster: DISASTER_LAYOUT,
};

export function resolveLayout(
  preset: GlobeLayoutPreset = 'default',
  overrides?: Record<string, string[]>,
): ResolvedLayout {
  const base = PRESETS[preset] || PRESETS['default'];
  if (!overrides) return base;
  return {
    ...base,
    slots: { ...base.slots, ...overrides } as Record<SlotId, PanelId[]>,
  };
}
