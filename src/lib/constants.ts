import type { NavSection, Tab } from './tracker-config';

// Truly static fallback defaults. These are only used when a component is
// rendered without explicit tracker config (navSections / tabs props).
// Previously these were derived from `loadAllTrackers()[0]`, which silently
// changed whenever a new tracker sorted first alphabetically.
export const NAV_SECTIONS: readonly NavSection[] = [
  { id: 'sec-timeline', label: 'Timeline' },
  { id: 'sec-map', label: 'Map' },
  { id: 'sec-military', label: 'Military' },
  { id: 'sec-humanitarian', label: 'Humanitarian' },
  { id: 'sec-economic', label: 'Economic' },
  { id: 'sec-contested', label: 'Contested' },
  { id: 'sec-political', label: 'Political' },
];

export const MIL_TABS: readonly Tab[] = [
  { id: 'strikes', label: 'Strike Targets' },
  { id: 'retaliation', label: 'Iranian Retaliation' },
  { id: 'assets', label: 'US Assets Deployed' },
];
