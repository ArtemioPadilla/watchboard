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
  { featureKey: 'follow', text: 'Select a tracker in the sidebar, then press F or tap ☆ to follow it', anchor: 'sidebar' },
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

// ─── Tour persistence (added by onboarding redesign) ───

export const TOUR_KEY_DESKTOP = 'watchboard-tour-desktop-v1';
export const TOUR_KEY_MOBILE = 'watchboard-tour-mobile-v1';

export type TourSurface = 'desktop' | 'mobile';

export interface TourState {
  completed: boolean;
  completedAt?: string;
  lastStepIndex?: number;
  replayCount: number;
}

const DEFAULT_TOUR_STATE: TourState = {
  completed: false,
  replayCount: 0,
};

const LEGACY_KEYS = ['watchboard-welcomed', 'watchboard-welcome-dismissed'];
let migrationRun = false;

function tourKey(surface: TourSurface): string {
  return surface === 'desktop' ? TOUR_KEY_DESKTOP : TOUR_KEY_MOBILE;
}

function runLegacyMigrationOnce(): void {
  if (migrationRun) return;
  migrationRun = true;
  try {
    const hadLegacy = LEGACY_KEYS.some((k) => localStorage.getItem(k) != null);
    if (!hadLegacy) return;
    for (const surface of ['desktop', 'mobile'] as TourSurface[]) {
      if (localStorage.getItem(tourKey(surface)) == null) {
        const state: TourState = {
          completed: true,
          completedAt: new Date().toISOString(),
          replayCount: 0,
        };
        localStorage.setItem(tourKey(surface), JSON.stringify(state));
      }
    }
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
  } catch {
    // localStorage unavailable; tour will simply re-prompt
  }
}

export function getTourState(surface: TourSurface): TourState {
  runLegacyMigrationOnce();
  try {
    const raw = localStorage.getItem(tourKey(surface));
    if (!raw) return { ...DEFAULT_TOUR_STATE };
    const parsed = JSON.parse(raw) as Partial<TourState>;
    return {
      completed: !!parsed.completed,
      completedAt: parsed.completedAt,
      lastStepIndex: parsed.lastStepIndex,
      replayCount: typeof parsed.replayCount === 'number' ? parsed.replayCount : 0,
    };
  } catch {
    return { ...DEFAULT_TOUR_STATE };
  }
}

export function isTourCompleted(surface: TourSurface): boolean {
  return getTourState(surface).completed;
}

export function markTourComplete(surface: TourSurface): void {
  try {
    const prev = getTourState(surface);
    const next: TourState = {
      completed: true,
      completedAt: new Date().toISOString(),
      replayCount: prev.replayCount,
    };
    localStorage.setItem(tourKey(surface), JSON.stringify(next));
  } catch {}
}

export function resetTour(surface: TourSurface): void {
  try {
    const prev = getTourState(surface);
    const next: TourState = {
      completed: false,
      replayCount: prev.replayCount + (prev.completed ? 1 : 0),
    };
    localStorage.setItem(tourKey(surface), JSON.stringify(next));
  } catch {}
}

// Test-only: reset module-level migration latch so tests can re-trigger migration.
export function __resetMigrationForTests(): void {
  migrationRun = false;
}
