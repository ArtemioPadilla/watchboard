import { loadAllTrackers } from './tracker-registry';
import type { NavSection, Tab } from './tracker-config';

// Use the first available tracker for defaults (no hardcoded slug)
const defaultConfig = loadAllTrackers()[0];

export const NAV_SECTIONS: readonly NavSection[] = defaultConfig?.navSections ?? [
  { id: 'sec-timeline', label: 'Timeline' },
  { id: 'sec-map', label: 'Map' },
  { id: 'sec-military', label: 'Military' },
  { id: 'sec-humanitarian', label: 'Humanitarian' },
  { id: 'sec-economic', label: 'Economic' },
  { id: 'sec-contested', label: 'Contested' },
  { id: 'sec-political', label: 'Political' },
];

export const MIL_TABS: readonly Tab[] = defaultConfig?.militaryTabs ?? [
  { id: 'strikes', label: 'Strike Targets' },
  { id: 'retaliation', label: 'Iranian Retaliation' },
  { id: 'assets', label: 'US Assets Deployed' },
];
