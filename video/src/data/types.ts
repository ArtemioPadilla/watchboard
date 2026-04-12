/** Breaking tracker data used by the video composition */
export interface BreakingTracker {
  slug: string;
  name: string;
  icon: string;
  headline: string;
  kpiLabel: string;
  kpiValue: number;
  kpiPrefix: string;
  kpiSuffix: string;
  sourceTier: 1 | 2 | 3 | 4;
  sourceLabel: string;
  mapCenter: [number, number]; // [lat, lng]
}

export interface BreakingData {
  date: string;
  trackers: BreakingTracker[];
}

export const ACCENT_COLORS = {
  red: '#e74c3c',
  amber: '#f39c12',
  blue: '#3498db',
  green: '#2ecc71',
} as const;

export const SLIDE_ACCENTS = [
  ACCENT_COLORS.red,
  ACCENT_COLORS.blue,
  ACCENT_COLORS.amber,
] as const;

export const SAMPLE_DATA: BreakingData = {
  date: new Date().toISOString().split('T')[0],
  trackers: [
    {
      slug: 'iran-conflict',
      name: 'Iran Conflict',
      icon: '\u2694\uFE0F',
      headline:
        'US begins Hormuz mine-clearing operations as Iran claims upper hand in ceasefire talks',
      kpiLabel: 'DAY',
      kpiValue: 43,
      kpiPrefix: '',
      kpiSuffix: '',
      sourceTier: 1,
      sourceLabel: 'CENTCOM / Reuters',
      mapCenter: [29, 49],
    },
    {
      slug: 'ukraine-war',
      name: 'Ukraine War',
      icon: '\uD83C\uDDFA\uD83C\uDDE6',
      headline:
        'Major Russian offensive in Zaporizhzhia sector; Ukraine strikes Crimean bridge logistics hub',
      kpiLabel: 'DAY',
      kpiValue: 778,
      kpiPrefix: '',
      kpiSuffix: '',
      sourceTier: 2,
      sourceLabel: 'ISW / Reuters',
      mapCenter: [48.5, 35.0],
    },
    {
      slug: 'gaza-war',
      name: 'Gaza War',
      icon: '\uD83D\uDEA8',
      headline:
        'IDF expands Rafah operations; humanitarian corridor negotiations stall at UN Security Council',
      kpiLabel: 'DAY',
      kpiValue: 554,
      kpiPrefix: '',
      kpiSuffix: '',
      sourceTier: 1,
      sourceLabel: 'IDF / Al Jazeera',
      mapCenter: [31.4, 34.4],
    },
  ],
};
