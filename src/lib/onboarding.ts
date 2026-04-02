/**
 * Onboarding state management via localStorage.
 * Tracks welcome overlay dismissal and feature discovery for coach marks.
 */

const WELCOME_KEY = 'watchboard-welcome-dismissed';
const FEATURES_KEY = 'watchboard-features-discovered';

export interface CoachHint {
  featureKey: string;
  text: string;
  anchor: 'search' | 'ticker' | 'sidebar' | 'globe' | 'card';
}

const COACH_HINTS: CoachHint[] = [
  { featureKey: 'broadcast-pause', text: 'Hover the ticker or card to pause and explore', anchor: 'ticker' },
  { featureKey: 'ticker-click', text: 'Click any headline in the ticker to jump there', anchor: 'ticker' },
  { featureKey: 'search', text: 'Press / to search across all trackers', anchor: 'search' },
  { featureKey: 'follow', text: 'Press F on a tracker to follow it for priority updates', anchor: 'sidebar' },
  { featureKey: 'drag-scrub', text: 'Drag the ticker left/right to scrub through stories', anchor: 'ticker' },
];

export function isWelcomeDismissed(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === 'true';
  } catch {
    return false;
  }
}

export function dismissWelcome(permanent: boolean): void {
  try {
    if (permanent) {
      localStorage.setItem(WELCOME_KEY, 'true');
    }
    // If not permanent, we just close the overlay for this session
    // (handled by component state)
  } catch {}
}

export function getDiscoveredFeatures(): Set<string> {
  try {
    const raw = localStorage.getItem(FEATURES_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function markFeatureDiscovered(feature: string): void {
  try {
    const discovered = getDiscoveredFeatures();
    discovered.add(feature);
    localStorage.setItem(FEATURES_KEY, JSON.stringify([...discovered]));
  } catch {}
}

export function getNextCoachHint(discovered: Set<string>): CoachHint | null {
  for (const hint of COACH_HINTS) {
    if (!discovered.has(hint.featureKey)) {
      return hint;
    }
  }
  return null;
}
