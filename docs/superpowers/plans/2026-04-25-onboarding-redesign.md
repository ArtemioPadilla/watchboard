# Onboarding Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing single-toast welcome with a 6-step desktop guided tour and a 3-step mobile bottom-sheet intro, both backed by versioned localStorage keys, replayable from the `?` shortcuts panel.

**Architecture:** A small `Onboarding/` island folder (controller + 2 step primitives + step config) mounted by `CommandCenter` (desktop) and `MobileStoryCarousel` (mobile). Spotlight steps use a single full-viewport SVG mask to "cut a hole" around real UI elements (anchor IDs added to globe wrapper, sidebar, broadcast ticker). Hero steps render fullscreen modals. Persistence in `src/lib/onboarding.ts` with two versioned keys (`watchboard-tour-desktop-v1`, `watchboard-tour-mobile-v1`) plus a one-shot legacy migration.

**Tech Stack:** React 18 islands, TypeScript, Astro 5, Vitest (unit only — project has no RTL).

**Spec:** `docs/superpowers/specs/2026-04-25-onboarding-redesign-design.md`

**Notes on spec deviations (accepted):**
- The spec calls for React Testing Library component tests. The project currently has zero `*.test.tsx` files — only Vitest unit tests for `src/lib/`. Adding RTL would be a cross-cutting infrastructure change. This plan keeps unit tests for the pure modules and relies on the manual smoke test checklist for the React components. If RTL is introduced in a separate PR, the component tests can be added after.
- The "live" current welcome is **not** `WelcomeOverlay.tsx` (which is dead code, never imported). It is an inline `showToast` block in `CommandCenter.tsx` keyed by `localStorage['watchboard-welcomed']`. The plan removes both — the dead file and the live inline block — and the legacy migration checks both possible legacy keys.
- The mobile "Replay intro" surface is implemented as a small button in the mobile carousel header. Reasoning expanded in Task 10.

---

## File Map

**Create:**
- `src/components/islands/Onboarding/OnboardingTour.tsx` — desktop controller (6 steps).
- `src/components/islands/Onboarding/MobileOnboarding.tsx` — mobile controller (3 steps).
- `src/components/islands/Onboarding/SpotlightStep.tsx` — SVG-mask spotlight + tooltip primitive.
- `src/components/islands/Onboarding/HeroStep.tsx` — fullscreen hero panel (steps 1, 5, 6).
- `src/lib/onboarding-steps.ts` — pure step config.
- `src/lib/onboarding.test.ts` — Vitest unit tests for the persistence module.
- `src/lib/onboarding-steps.test.ts` — Vitest unit tests for step config integrity.

**Modify:**
- `src/lib/onboarding.ts` — add `TourState`, `getTourState`, `markTourComplete`, `resetTour`, `isTourCompleted`, legacy migration. Keep existing `COACH_HINTS` API untouched.
- `src/components/islands/CommandCenter/CommandCenter.tsx` — mount `OnboardingTour`, remove inline `showToast` block, add "Replay tour" entry to the `?` help panel.
- `src/components/islands/CommandCenter/MobileStoryCarousel.tsx` — mount `MobileOnboarding`, add a small "Replay intro" affordance.
- `src/components/islands/CommandCenter/BroadcastOverlay.tsx` — add `id="tour-ticker"` to the ticker root.
- `src/components/islands/CommandCenter/SidebarPanel.tsx` — ensure outer element carries `id="tour-sidebar"`.
- `src/i18n/translations.ts` — add `tour.*` keys to all four locale blocks.

**Delete:**
- `src/components/islands/CommandCenter/WelcomeOverlay.tsx` — dead code, superseded.

---

## Task 1: Persistence module — tests first

**Files:**
- Modify: `src/lib/onboarding.ts`
- Create: `src/lib/onboarding.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/onboarding.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTourState,
  markTourComplete,
  resetTour,
  isTourCompleted,
  TOUR_KEY_DESKTOP,
  TOUR_KEY_MOBILE,
} from './onboarding';

describe('onboarding tour persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns default state when no key is set', () => {
    const state = getTourState('desktop');
    expect(state.completed).toBe(false);
    expect(state.replayCount).toBe(0);
    expect(state.completedAt).toBeUndefined();
  });

  it('marks tour complete with timestamp', () => {
    markTourComplete('desktop');
    const state = getTourState('desktop');
    expect(state.completed).toBe(true);
    expect(state.replayCount).toBe(0);
    expect(typeof state.completedAt).toBe('string');
    expect(new Date(state.completedAt!).toString()).not.toBe('Invalid Date');
  });

  it('isTourCompleted reflects flag', () => {
    expect(isTourCompleted('desktop')).toBe(false);
    markTourComplete('desktop');
    expect(isTourCompleted('desktop')).toBe(true);
  });

  it('resetTour clears completion but preserves replayCount on next complete', () => {
    markTourComplete('desktop');
    resetTour('desktop');
    expect(isTourCompleted('desktop')).toBe(false);
    markTourComplete('desktop');
    const state = getTourState('desktop');
    expect(state.completed).toBe(true);
    expect(state.replayCount).toBe(1);
  });

  it('keeps desktop and mobile keys independent', () => {
    markTourComplete('desktop');
    expect(isTourCompleted('desktop')).toBe(true);
    expect(isTourCompleted('mobile')).toBe(false);
  });

  it('migrates legacy watchboard-welcomed flag once and removes it', () => {
    localStorage.setItem('watchboard-welcomed', '1');
    expect(isTourCompleted('desktop')).toBe(true);
    expect(isTourCompleted('mobile')).toBe(true);
    expect(localStorage.getItem('watchboard-welcomed')).toBeNull();
  });

  it('migrates legacy watchboard-welcome-dismissed flag', () => {
    localStorage.setItem('watchboard-welcome-dismissed', 'true');
    expect(isTourCompleted('desktop')).toBe(true);
    expect(isTourCompleted('mobile')).toBe(true);
    expect(localStorage.getItem('watchboard-welcome-dismissed')).toBeNull();
  });

  it('uses the correct localStorage keys', () => {
    expect(TOUR_KEY_DESKTOP).toBe('watchboard-tour-desktop-v1');
    expect(TOUR_KEY_MOBILE).toBe('watchboard-tour-mobile-v1');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/lib/onboarding.test.ts`
Expected: FAIL — symbols `getTourState`, `markTourComplete`, etc. are not exported yet.

- [ ] **Step 3: Add the persistence implementation to `src/lib/onboarding.ts`**

Append the following at the bottom of the existing `src/lib/onboarding.ts` (do not delete the existing `COACH_HINTS` API — it stays for post-tour micro-discovery hints):

```ts
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
```

- [ ] **Step 4: Adjust the test file to call `__resetMigrationForTests` in `beforeEach`**

Edit `src/lib/onboarding.test.ts` — add the import and call:

```ts
import {
  getTourState,
  markTourComplete,
  resetTour,
  isTourCompleted,
  TOUR_KEY_DESKTOP,
  TOUR_KEY_MOBILE,
  __resetMigrationForTests,
} from './onboarding';

describe('onboarding tour persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetMigrationForTests();
  });
  // ... rest unchanged
});
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npx vitest run src/lib/onboarding.test.ts`
Expected: 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/onboarding.ts src/lib/onboarding.test.ts
git commit -m "feat(onboarding): add tour persistence with legacy migration"
```

---

## Task 2: Step config — tests first

**Files:**
- Create: `src/lib/onboarding-steps.ts`
- Create: `src/lib/onboarding-steps.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/onboarding-steps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DESKTOP_STEPS, MOBILE_STEPS } from './onboarding-steps';

describe('onboarding step configs', () => {
  it('has 6 desktop steps in spec order', () => {
    expect(DESKTOP_STEPS).toHaveLength(6);
    expect(DESKTOP_STEPS.map((s) => s.id)).toEqual([
      'hero-intro',
      'spotlight-globe',
      'spotlight-sidebar',
      'spotlight-ticker',
      'hero-tiers',
      'hero-closing',
    ]);
  });

  it('has 3 mobile steps in spec order', () => {
    expect(MOBILE_STEPS).toHaveLength(3);
    expect(MOBILE_STEPS.map((s) => s.id)).toEqual([
      'mobile-welcome',
      'mobile-stories',
      'mobile-dive-in',
    ]);
  });

  it('every spotlight step has a non-empty CSS-selector anchor', () => {
    for (const step of DESKTOP_STEPS) {
      if (step.type === 'spotlight') {
        expect(step.anchor).toBeTruthy();
        expect(step.anchor!.startsWith('#')).toBe(true);
      }
    }
  });

  it('all desktop step ids are unique', () => {
    const ids = DESKTOP_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all mobile step ids are unique', () => {
    const ids = MOBILE_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/lib/onboarding-steps.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the step config**

Create `src/lib/onboarding-steps.ts`:

```ts
export type StepType = 'hero' | 'spotlight' | 'closing';

export interface OnboardingStep {
  id: string;
  type: StepType;
  anchor?: string;
  titleKey: string;
  bodyKey: string;
}

export const DESKTOP_STEPS: OnboardingStep[] = [
  { id: 'hero-intro',        type: 'hero',      titleKey: 'tour.intro.title',     bodyKey: 'tour.intro.body' },
  { id: 'spotlight-globe',   type: 'spotlight', anchor: '#tour-globe',    titleKey: 'tour.globe.title',     bodyKey: 'tour.globe.body' },
  { id: 'spotlight-sidebar', type: 'spotlight', anchor: '#tour-sidebar',  titleKey: 'tour.sidebar.title',   bodyKey: 'tour.sidebar.body' },
  { id: 'spotlight-ticker',  type: 'spotlight', anchor: '#tour-ticker',   titleKey: 'tour.ticker.title',    bodyKey: 'tour.ticker.body' },
  { id: 'hero-tiers',        type: 'hero',      titleKey: 'tour.tiers.title',     bodyKey: 'tour.tiers.body' },
  { id: 'hero-closing',      type: 'closing',   titleKey: 'tour.closing.title',   bodyKey: 'tour.closing.body' },
];

export const MOBILE_STEPS: OnboardingStep[] = [
  { id: 'mobile-welcome',  type: 'hero',    titleKey: 'tour.mobile.welcome.title',  bodyKey: 'tour.mobile.welcome.body' },
  { id: 'mobile-stories',  type: 'hero',    titleKey: 'tour.mobile.stories.title',  bodyKey: 'tour.mobile.stories.body' },
  { id: 'mobile-dive-in',  type: 'closing', titleKey: 'tour.mobile.dive.title',     bodyKey: 'tour.mobile.dive.body' },
];
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/lib/onboarding-steps.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding-steps.ts src/lib/onboarding-steps.test.ts
git commit -m "feat(onboarding): add desktop + mobile step config"
```

---

## Task 3: Translation keys for all 4 locales

**Files:**
- Modify: `src/i18n/translations.ts`

The file uses a `const en = {...}` object as the source of truth, then `type TranslationKeys = Record<keyof typeof en, string>` for `es`, `fr`, `pt`. Adding a key to `en` requires adding it to the other three or TypeScript will fail to compile.

- [ ] **Step 1: Add tour keys to the `en` block**

Find the existing `// Welcome overlay` section in `src/i18n/translations.ts` (around line 103). Insert the following block right after the existing `welcome.*` keys (do not delete those — they may still be referenced by the dead `WelcomeOverlay.tsx` until Task 9 removes it):

```ts
  // Onboarding tour (replaces welcome overlay)
  'tour.skip': 'Skip tour',
  'tour.next': 'Next →',
  'tour.back': 'Back',
  'tour.gotIt': 'Got it',
  'tour.takeTheTour': 'Take the 30-second tour →',
  'tour.startExploring': 'Start exploring →',

  'tour.intro.title': 'Watchboard — live intelligence on the world\'s biggest stories.',
  'tour.intro.body': 'Track 50+ unfolding events · Watch the broadcast · Search every claim & source.',

  'tour.globe.title': 'The globe',
  'tour.globe.body': 'Each pin is a real event. Click to dive into a tracker.',

  'tour.sidebar.title': 'The sidebar',
  'tour.sidebar.body': 'Every active tracker, grouped by view (Operations / Geographic / Domain). Star to follow.',

  'tour.ticker.title': 'Broadcast mode',
  'tour.ticker.body': 'Auto-cycles through trackers. Press B to pause. Hover to explore.',

  'tour.tiers.title': 'How we rate sources',
  'tour.tiers.body': 'T1 Official · T2 Major outlets · T3 Institutional · T4 Unverified. We surface all four so you can judge for yourself.',

  'tour.closing.title': 'You\'re ready.',
  'tour.closing.body': 'Press / to search · B to pause broadcast · ? for shortcuts and to replay this tour.',
  'tour.closing.toast': 'Tour done. Replay anytime from the ? menu.',

  'tour.replay': 'Replay tour',
  'tour.newHere': 'New here?',
  'tour.lastCompleted': 'Last completed:',

  'tour.mobile.welcome.title': 'Watchboard',
  'tour.mobile.welcome.body': 'Live intelligence on the world\'s biggest stories. Source badges (T1–T4) range from official to unverified.',
  'tour.mobile.stories.title': 'Stories',
  'tour.mobile.stories.body': 'Tap or swipe through stories above. Each circle is a tracker.',
  'tour.mobile.dive.title': 'Dive in',
  'tour.mobile.dive.body': 'Tap any story to open the full tracker.',
```

- [ ] **Step 2: Add the same keys to the `es` block**

Find `const es: TranslationKeys = {` (around line 558). After the welcome keys, add:

```ts
  // Onboarding tour
  'tour.skip': 'Saltar tour',
  'tour.next': 'Siguiente →',
  'tour.back': 'Atrás',
  'tour.gotIt': 'Entendido',
  'tour.takeTheTour': 'Hacer el tour de 30 segundos →',
  'tour.startExploring': 'Empezar a explorar →',

  'tour.intro.title': 'Watchboard — inteligencia en vivo sobre las historias más importantes del mundo.',
  'tour.intro.body': 'Sigue más de 50 eventos en desarrollo · Mira la transmisión · Busca cualquier afirmación y fuente.',

  'tour.globe.title': 'El globo',
  'tour.globe.body': 'Cada punto es un evento real. Haz clic para entrar en un tracker.',

  'tour.sidebar.title': 'La barra lateral',
  'tour.sidebar.body': 'Todos los trackers activos, agrupados por vista (Operaciones / Geográfica / Dominio). Marca con estrella para seguir.',

  'tour.ticker.title': 'Modo transmisión',
  'tour.ticker.body': 'Cicla automáticamente entre trackers. Pulsa B para pausar. Pasa el ratón para explorar.',

  'tour.tiers.title': 'Cómo clasificamos las fuentes',
  'tour.tiers.body': 'T1 Oficiales · T2 Grandes medios · T3 Institucionales · T4 No verificadas. Mostramos las cuatro para que tú juzgues.',

  'tour.closing.title': 'Listo.',
  'tour.closing.body': 'Pulsa / para buscar · B para pausar la transmisión · ? para atajos y para repetir este tour.',
  'tour.closing.toast': 'Tour completado. Repítelo desde el menú ?.',

  'tour.replay': 'Repetir tour',
  'tour.newHere': '¿Nuevo aquí?',
  'tour.lastCompleted': 'Última vez:',

  'tour.mobile.welcome.title': 'Watchboard',
  'tour.mobile.welcome.body': 'Inteligencia en vivo sobre las historias más importantes. Las insignias (T1–T4) van de oficial a no verificado.',
  'tour.mobile.stories.title': 'Historias',
  'tour.mobile.stories.body': 'Toca o desliza entre las historias de arriba. Cada círculo es un tracker.',
  'tour.mobile.dive.title': 'Sumérgete',
  'tour.mobile.dive.body': 'Toca cualquier historia para abrir el tracker completo.',
```

- [ ] **Step 3: Add the same keys to the `fr` block**

Find `const fr: TranslationKeys = {` (around line 1082). After the welcome keys, add:

```ts
  // Onboarding tour
  'tour.skip': 'Passer le tour',
  'tour.next': 'Suivant →',
  'tour.back': 'Retour',
  'tour.gotIt': 'Compris',
  'tour.takeTheTour': 'Faire le tour de 30 secondes →',
  'tour.startExploring': 'Commencer à explorer →',

  'tour.intro.title': 'Watchboard — renseignement en direct sur les plus grandes histoires du monde.',
  'tour.intro.body': 'Suivez 50+ événements en cours · Regardez la diffusion · Recherchez chaque affirmation et source.',

  'tour.globe.title': 'Le globe',
  'tour.globe.body': 'Chaque point est un événement réel. Cliquez pour ouvrir un tracker.',

  'tour.sidebar.title': 'La barre latérale',
  'tour.sidebar.body': 'Tous les trackers actifs, regroupés par vue (Opérations / Géographique / Domaine). Étoile pour suivre.',

  'tour.ticker.title': 'Mode diffusion',
  'tour.ticker.body': 'Défile automatiquement entre les trackers. Appuyez sur B pour mettre en pause. Survolez pour explorer.',

  'tour.tiers.title': 'Notre classification des sources',
  'tour.tiers.body': 'T1 Officielles · T2 Grands médias · T3 Institutionnelles · T4 Non vérifiées. Nous affichons les quatre pour que vous puissiez juger.',

  'tour.closing.title': 'Vous êtes prêt.',
  'tour.closing.body': 'Appuyez sur / pour chercher · B pour mettre en pause · ? pour les raccourcis et pour rejouer ce tour.',
  'tour.closing.toast': 'Tour terminé. Rejouez-le depuis le menu ?.',

  'tour.replay': 'Rejouer le tour',
  'tour.newHere': 'Nouveau ici ?',
  'tour.lastCompleted': 'Dernière fois :',

  'tour.mobile.welcome.title': 'Watchboard',
  'tour.mobile.welcome.body': 'Renseignement en direct. Les badges (T1–T4) vont d\'officiel à non vérifié.',
  'tour.mobile.stories.title': 'Stories',
  'tour.mobile.stories.body': 'Touchez ou glissez parmi les stories ci-dessus. Chaque cercle est un tracker.',
  'tour.mobile.dive.title': 'Plongez',
  'tour.mobile.dive.body': 'Touchez n\'importe quelle story pour ouvrir le tracker complet.',
```

- [ ] **Step 4: Add the same keys to the `pt` block**

Find `const pt: TranslationKeys = {` (around line 1606). After the welcome keys, add:

```ts
  // Onboarding tour
  'tour.skip': 'Pular tour',
  'tour.next': 'Próximo →',
  'tour.back': 'Voltar',
  'tour.gotIt': 'Entendido',
  'tour.takeTheTour': 'Fazer o tour de 30 segundos →',
  'tour.startExploring': 'Começar a explorar →',

  'tour.intro.title': 'Watchboard — inteligência ao vivo sobre as maiores histórias do mundo.',
  'tour.intro.body': 'Acompanhe 50+ eventos em andamento · Assista à transmissão · Pesquise cada afirmação e fonte.',

  'tour.globe.title': 'O globo',
  'tour.globe.body': 'Cada ponto é um evento real. Clique para abrir um tracker.',

  'tour.sidebar.title': 'A barra lateral',
  'tour.sidebar.body': 'Todos os trackers ativos, agrupados por visão (Operações / Geográfica / Domínio). Marque com estrela para seguir.',

  'tour.ticker.title': 'Modo transmissão',
  'tour.ticker.body': 'Alterna automaticamente entre trackers. Pressione B para pausar. Passe o mouse para explorar.',

  'tour.tiers.title': 'Como classificamos as fontes',
  'tour.tiers.body': 'T1 Oficiais · T2 Grandes veículos · T3 Institucionais · T4 Não verificadas. Mostramos as quatro para você julgar.',

  'tour.closing.title': 'Você está pronto.',
  'tour.closing.body': 'Pressione / para buscar · B para pausar a transmissão · ? para atalhos e para repetir este tour.',
  'tour.closing.toast': 'Tour concluído. Repita pelo menu ?.',

  'tour.replay': 'Repetir tour',
  'tour.newHere': 'Novo por aqui?',
  'tour.lastCompleted': 'Última vez:',

  'tour.mobile.welcome.title': 'Watchboard',
  'tour.mobile.welcome.body': 'Inteligência ao vivo. Os selos (T1–T4) vão de oficial a não verificado.',
  'tour.mobile.stories.title': 'Histórias',
  'tour.mobile.stories.body': 'Toque ou deslize entre as histórias acima. Cada círculo é um tracker.',
  'tour.mobile.dive.title': 'Mergulhe',
  'tour.mobile.dive.body': 'Toque em qualquer história para abrir o tracker completo.',
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors. (If any locale block is missing a key, TypeScript will fail with `Property 'tour.X' is missing in type ...`.)

- [ ] **Step 6: Commit**

```bash
git add src/i18n/translations.ts
git commit -m "feat(onboarding): add tour translation keys for en/es/fr/pt"
```

---

## Task 4: Add anchor IDs to existing components

**Files:**
- Modify: `src/components/islands/CommandCenter/CommandCenter.tsx` (globe wrapper)
- Modify: `src/components/islands/CommandCenter/SidebarPanel.tsx` (sidebar root)
- Modify: `src/components/islands/CommandCenter/BroadcastOverlay.tsx` (ticker root)

These IDs let `SpotlightStep` find anchors via `document.querySelector('#tour-globe')`.

- [ ] **Step 1: Add `id="tour-globe"` to the globe wrapper**

In `src/components/islands/CommandCenter/CommandCenter.tsx`, find the existing `<div className="cc-globe" ...>` block (around line 563):

```tsx
<div className="cc-globe" style={{...}}
```

Change to:

```tsx
<div id="tour-globe" className="cc-globe" style={{...}}
```

- [ ] **Step 2: Add `id="tour-sidebar"` to the sidebar nav**

In `src/components/islands/CommandCenter/CommandCenter.tsx`, find the existing `<nav className="cc-sidebar" ...>` block (around line 690):

```tsx
<nav className="cc-sidebar" style={sidebarStyle} aria-label="Tracker directory">
```

Change to:

```tsx
<nav id="tour-sidebar" className="cc-sidebar" style={sidebarStyle} aria-label="Tracker directory">
```

- [ ] **Step 3: Add `id="tour-ticker"` to the broadcast LIVE badge**

`BroadcastOverlay` returns a React fragment (`<>…</>`) at line 233 — it has multiple absolute-positioned children, not a single root, so wrapping in a div would break layout. The most prominent always-visible broadcast element is the `broadcast-live-badge` div at line 240. Add the id there:

Find:
```tsx
<div className={`broadcast-live-badge ${isPaused ? 'paused' : ''}`}>
```

Change to:
```tsx
<div id="tour-ticker" className={`broadcast-live-badge ${isPaused ? 'paused' : ''}`}>
```

This means the step 4 spotlight highlights the LIVE badge when broadcast is on. If the user has broadcast turned off, the anchor is missing → SpotlightStep falls back to a centered modal (already-implemented degraded path). Acceptable for v1.

- [ ] **Step 4: Smoke check the anchors render**

Run: `npm run dev`
Open the homepage in a browser. In DevTools console, run:

```js
['#tour-globe', '#tour-sidebar', '#tour-ticker'].forEach((s) =>
  console.log(s, !!document.querySelector(s))
);
```

Expected: all three log `true`. (`#tour-ticker` only when broadcast mode is on; that's the documented degraded-fallback case.)

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/CommandCenter/CommandCenter.tsx \
        src/components/islands/CommandCenter/BroadcastOverlay.tsx
git commit -m "feat(onboarding): add tour anchor ids to globe, sidebar, ticker"
```

---

## Task 5: SpotlightStep primitive

**Files:**
- Create: `src/components/islands/Onboarding/SpotlightStep.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SpotlightStepProps {
  anchor: string;
  title: string;
  body: string;
  stepLabel: string;          // e.g. "2 / 6"
  isFirst: boolean;
  isLast: boolean;
  backLabel: string;
  nextLabel: string;
  skipLabel: string;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

const PADDING = 8;
const TOOLTIP_W = 320;
const TOOLTIP_GAP = 16;

export default function SpotlightStep({
  anchor,
  title,
  body,
  stepLabel,
  isFirst,
  isLast,
  backLabel,
  nextLabel,
  skipLabel,
  onBack,
  onNext,
  onSkip,
}: SpotlightStepProps) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const loggedMissing = useRef(false);

  const measure = useCallback(() => {
    const el = document.querySelector(anchor) as HTMLElement | null;
    if (!el) {
      if (!loggedMissing.current) {
        console.warn(`[OnboardingTour] anchor not found: ${anchor} — falling back to centered modal.`);
        loggedMissing.current = true;
      }
      setMissing(true);
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setMissing(false);
    setRect({
      x: r.x - PADDING,
      y: r.y - PADDING,
      w: r.width + PADDING * 2,
      h: r.height + PADDING * 2,
    });
  }, [anchor]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, { passive: true });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onResize);
      ro.observe(document.body);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize);
      ro?.disconnect();
    };
  }, [measure]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSkip]);

  // Focus the next button when step appears
  useEffect(() => {
    const btn = tooltipRef.current?.querySelector<HTMLButtonElement>('button[data-tour-next]');
    btn?.focus();
  }, [anchor]);

  const tooltipPos = computeTooltipPosition(rect);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Onboarding tour step" style={styles.root}>
      <svg style={styles.svg} aria-hidden="true">
        <defs>
          <mask id="watchboard-tour-spotlight">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && !missing && (
              <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={8} fill="black" />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.65)"
          mask="url(#watchboard-tour-spotlight)"
        />
      </svg>

      <div ref={tooltipRef} style={{ ...styles.tooltip, ...tooltipPos }}>
        <div style={styles.stepLabel}>{stepLabel}</div>
        <div style={styles.title}>{title}</div>
        <div style={styles.body}>{body}</div>
        <div style={styles.footer}>
          <button type="button" onClick={onSkip} style={styles.skip}>
            {skipLabel}
          </button>
          <div style={styles.navButtons}>
            {!isFirst && (
              <button type="button" onClick={onBack} style={styles.secondary}>
                {backLabel}
              </button>
            )}
            <button type="button" data-tour-next onClick={onNext} style={styles.primary}>
              {nextLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function computeTooltipPosition(rect: Rect | null): React.CSSProperties {
  if (!rect) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipH = 200; // estimated; auto-flip uses this as a budget
  const preferBelow = rect.y + rect.h + TOOLTIP_GAP + tooltipH < vh - 16;
  const top = preferBelow
    ? rect.y + rect.h + TOOLTIP_GAP
    : Math.max(16, rect.y - tooltipH - TOOLTIP_GAP);
  const centerX = rect.x + rect.w / 2 - TOOLTIP_W / 2;
  const left = Math.max(16, Math.min(vw - TOOLTIP_W - 16, centerX));
  return { top, left, width: TOOLTIP_W };
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed',
    inset: 0,
    zIndex: 300,
    pointerEvents: 'none',
  },
  svg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
  tooltip: {
    position: 'fixed',
    background: 'var(--bg-card, #161b22)',
    border: '1px solid var(--border, #30363d)',
    borderRadius: 10,
    padding: '14px 16px',
    pointerEvents: 'auto',
    boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
    fontFamily: "'DM Sans', sans-serif",
  },
  stepLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.55rem',
    color: 'var(--text-muted, #8b949e)',
    letterSpacing: '0.1em',
    marginBottom: 6,
  },
  title: {
    fontSize: '0.95rem',
    fontWeight: 700,
    color: 'var(--text-primary, #e6edf3)',
    marginBottom: 6,
  },
  body: {
    fontSize: '0.78rem',
    color: 'var(--text-secondary, #8b949e)',
    lineHeight: 1.45,
    marginBottom: 12,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  navButtons: {
    display: 'flex',
    gap: 6,
  },
  primary: {
    background: '#1f6feb',
    color: '#fff',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.72rem',
    fontWeight: 600,
    padding: '6px 14px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
  },
  secondary: {
    background: 'transparent',
    color: 'var(--text-secondary, #8b949e)',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.72rem',
    fontWeight: 500,
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid var(--border, #30363d)',
    cursor: 'pointer',
  },
  skip: {
    background: 'transparent',
    color: 'var(--text-muted, #8b949e)',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.65rem',
    fontWeight: 500,
    padding: '4px 8px',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/Onboarding/SpotlightStep.tsx
git commit -m "feat(onboarding): add SpotlightStep primitive (svg-mask + tooltip)"
```

---

## Task 6: HeroStep primitive

**Files:**
- Create: `src/components/islands/Onboarding/HeroStep.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface HeroStepProps {
  variant: 'intro' | 'tiers' | 'closing' | 'mobile';
  title: string;
  body: string;
  stepLabel?: string;
  isFirst: boolean;
  isLast: boolean;
  primaryLabel: string;
  backLabel: string;
  skipLabel: string;
  onPrimary: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export default function HeroStep({
  variant,
  title,
  body,
  stepLabel,
  isFirst,
  isLast,
  primaryLabel,
  backLabel,
  skipLabel,
  onPrimary,
  onBack,
  onSkip,
}: HeroStepProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSkip]);

  const isMobileSheet = variant === 'mobile';

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Onboarding tour step" style={styles.backdrop}>
      <div style={isMobileSheet ? styles.mobileSheet : styles.panel}>
        {stepLabel && <div style={styles.stepLabel}>{stepLabel}</div>}
        {variant === 'intro' && <div style={styles.iconRow}>🌐 📺 🔍</div>}
        {variant === 'tiers' && (
          <div style={styles.tiersRow}>
            <TierBadge color="var(--tier-1, #2ecc71)" label="T1" sub="Official" />
            <TierBadge color="var(--tier-2, #58a6ff)" label="T2" sub="Major outlets" />
            <TierBadge color="var(--tier-3, #f39c12)" label="T3" sub="Institutional" />
            <TierBadge color="var(--tier-4, #e74c3c)" label="T4" sub="Unverified" />
          </div>
        )}
        <h2 style={styles.title}>{title}</h2>
        <p style={styles.body}>{body}</p>
        <div style={styles.footer}>
          {!isFirst && !isMobileSheet && (
            <button type="button" onClick={onBack} style={styles.secondary}>
              {backLabel}
            </button>
          )}
          <button ref={primaryRef} type="button" onClick={onPrimary} style={styles.primary}>
            {primaryLabel}
          </button>
        </div>
        {!isLast && (
          <button type="button" onClick={onSkip} style={styles.skip}>
            {skipLabel}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function TierBadge({ color, label, sub }: { color: string; label: string; sub: string }) {
  return (
    <div style={{ ...tierBadgeStyles.cell, borderColor: color }}>
      <div style={{ ...tierBadgeStyles.label, color }}>{label}</div>
      <div style={tierBadgeStyles.sub}>{sub}</div>
    </div>
  );
}

const tierBadgeStyles: Record<string, React.CSSProperties> = {
  cell: {
    flex: 1,
    border: '1px solid',
    borderRadius: 6,
    padding: '8px 4px',
    textAlign: 'center',
  },
  label: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.85rem',
    fontWeight: 700,
  },
  sub: {
    fontSize: '0.6rem',
    color: 'var(--text-muted, #8b949e)',
    marginTop: 2,
  },
};

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 300,
  },
  panel: {
    background: 'var(--bg-card, #161b22)',
    border: '1px solid var(--border, #30363d)',
    borderRadius: 12,
    padding: '28px 28px 20px',
    maxWidth: 480,
    width: '90%',
    textAlign: 'center',
    fontFamily: "'DM Sans', sans-serif",
    position: 'relative',
  },
  mobileSheet: {
    background: 'var(--bg-card, #161b22)',
    border: '1px solid var(--border, #30363d)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: '24px 20px 32px',
    width: '100%',
    maxWidth: '100%',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: "'DM Sans', sans-serif",
  },
  stepLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.55rem',
    color: 'var(--text-muted, #8b949e)',
    letterSpacing: '0.12em',
    marginBottom: 12,
  },
  iconRow: {
    fontSize: '1.4rem',
    letterSpacing: '0.5rem',
    marginBottom: 16,
  },
  tiersRow: {
    display: 'flex',
    gap: 8,
    margin: '8px 0 16px',
  },
  title: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '1.4rem',
    fontWeight: 700,
    color: 'var(--text-primary, #e6edf3)',
    margin: '0 0 10px',
  },
  body: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary, #8b949e)',
    lineHeight: 1.5,
    margin: '0 0 20px',
  },
  footer: {
    display: 'flex',
    gap: 10,
    justifyContent: 'center',
  },
  primary: {
    background: '#1f6feb',
    color: '#fff',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.78rem',
    fontWeight: 600,
    padding: '8px 18px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
  },
  secondary: {
    background: 'transparent',
    color: 'var(--text-secondary, #8b949e)',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.78rem',
    fontWeight: 500,
    padding: '8px 14px',
    borderRadius: 6,
    border: '1px solid var(--border, #30363d)',
    cursor: 'pointer',
  },
  skip: {
    position: 'absolute',
    top: 8,
    right: 12,
    background: 'transparent',
    color: 'var(--text-muted, #8b949e)',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.65rem',
    fontWeight: 500,
    padding: '4px 8px',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/Onboarding/HeroStep.tsx
git commit -m "feat(onboarding): add HeroStep primitive (intro/tiers/closing/mobile)"
```

---

## Task 7: OnboardingTour controller (desktop)

**Files:**
- Create: `src/components/islands/Onboarding/OnboardingTour.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState, useCallback } from 'react';
import { DESKTOP_STEPS } from '../../../lib/onboarding-steps';
import { isTourCompleted, markTourComplete, getTourState } from '../../../lib/onboarding';
import { t, getPreferredLocale } from '../../../i18n/translations';
import HeroStep from './HeroStep';
import SpotlightStep from './SpotlightStep';

export const TOUR_REPLAY_EVENT = 'watchboard:start-tour';

export default function OnboardingTour() {
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [showCompletionToast, setShowCompletionToast] = useState(false);
  const locale = getPreferredLocale();

  // Auto-launch on first visit
  useEffect(() => {
    if (!isTourCompleted('desktop')) {
      setStepIdx(0);
      setActive(true);
    }
  }, []);

  // Listen for replay event from elsewhere (e.g. ? menu)
  useEffect(() => {
    const handler = () => {
      setStepIdx(0);
      setActive(true);
    };
    window.addEventListener(TOUR_REPLAY_EVENT, handler);
    return () => window.removeEventListener(TOUR_REPLAY_EVENT, handler);
  }, []);

  const finish = useCallback(() => {
    const wasFirstCompletion = getTourState('desktop').replayCount === 0
      && !isTourCompleted('desktop');
    markTourComplete('desktop');
    setActive(false);
    if (wasFirstCompletion) {
      setShowCompletionToast(true);
      setTimeout(() => setShowCompletionToast(false), 4000);
    }
  }, []);

  const goNext = useCallback(() => {
    if (stepIdx >= DESKTOP_STEPS.length - 1) {
      finish();
    } else {
      setStepIdx((i) => i + 1);
    }
  }, [stepIdx, finish]);

  const goBack = useCallback(() => {
    setStepIdx((i) => Math.max(0, i - 1));
  }, []);

  if (!active && !showCompletionToast) return null;

  if (showCompletionToast && !active) {
    return (
      <div role="status" aria-live="polite" style={toastStyles}>
        {t('tour.closing.toast', locale)}
      </div>
    );
  }

  const step = DESKTOP_STEPS[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === DESKTOP_STEPS.length - 1;
  const stepLabel = `${stepIdx + 1} / ${DESKTOP_STEPS.length}`;
  const title = t(step.titleKey as any, locale);
  const body = t(step.bodyKey as any, locale);

  if (step.type === 'spotlight' && step.anchor) {
    return (
      <SpotlightStep
        anchor={step.anchor}
        title={title}
        body={body}
        stepLabel={stepLabel}
        isFirst={isFirst}
        isLast={isLast}
        backLabel={t('tour.back', locale)}
        nextLabel={t('tour.next', locale)}
        skipLabel={t('tour.skip', locale)}
        onBack={goBack}
        onNext={goNext}
        onSkip={finish}
      />
    );
  }

  // Hero / closing variants
  const variant = step.id === 'hero-tiers'
    ? 'tiers'
    : step.id === 'hero-closing'
    ? 'closing'
    : 'intro';

  const primaryLabel = isFirst
    ? t('tour.takeTheTour', locale)
    : isLast
    ? t('tour.startExploring', locale)
    : t('tour.next', locale);

  return (
    <HeroStep
      variant={variant}
      title={title}
      body={body}
      stepLabel={stepLabel}
      isFirst={isFirst}
      isLast={isLast}
      primaryLabel={primaryLabel}
      backLabel={t('tour.back', locale)}
      skipLabel={t('tour.skip', locale)}
      onPrimary={goNext}
      onBack={goBack}
      onSkip={finish}
    />
  );
}

const toastStyles: React.CSSProperties = {
  position: 'fixed',
  bottom: 24,
  right: 24,
  background: 'var(--bg-card, #161b22)',
  border: '1px solid var(--border, #30363d)',
  borderRadius: 8,
  padding: '10px 14px',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '0.7rem',
  color: 'var(--text-secondary, #8b949e)',
  zIndex: 9999,
  boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/Onboarding/OnboardingTour.tsx
git commit -m "feat(onboarding): add desktop OnboardingTour controller"
```

---

## Task 8: MobileOnboarding controller

**Files:**
- Create: `src/components/islands/Onboarding/MobileOnboarding.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState, useCallback } from 'react';
import { MOBILE_STEPS } from '../../../lib/onboarding-steps';
import { isTourCompleted, markTourComplete, getTourState } from '../../../lib/onboarding';
import { t, getPreferredLocale } from '../../../i18n/translations';
import HeroStep from './HeroStep';

export const MOBILE_TOUR_REPLAY_EVENT = 'watchboard:start-mobile-tour';

export default function MobileOnboarding() {
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [showCompletionToast, setShowCompletionToast] = useState(false);
  const locale = getPreferredLocale();

  useEffect(() => {
    if (!isTourCompleted('mobile')) {
      setStepIdx(0);
      setActive(true);
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      setStepIdx(0);
      setActive(true);
    };
    window.addEventListener(MOBILE_TOUR_REPLAY_EVENT, handler);
    return () => window.removeEventListener(MOBILE_TOUR_REPLAY_EVENT, handler);
  }, []);

  const finish = useCallback(() => {
    const wasFirstCompletion = getTourState('mobile').replayCount === 0
      && !isTourCompleted('mobile');
    markTourComplete('mobile');
    setActive(false);
    if (wasFirstCompletion) {
      setShowCompletionToast(true);
      setTimeout(() => setShowCompletionToast(false), 4000);
    }
  }, []);

  const goNext = useCallback(() => {
    if (stepIdx >= MOBILE_STEPS.length - 1) {
      finish();
    } else {
      setStepIdx((i) => i + 1);
    }
  }, [stepIdx, finish]);

  if (!active && !showCompletionToast) return null;

  if (showCompletionToast && !active) {
    return (
      <div role="status" aria-live="polite" style={toastStyles}>
        {t('tour.closing.toast', locale)}
      </div>
    );
  }

  const step = MOBILE_STEPS[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === MOBILE_STEPS.length - 1;
  const stepLabel = `${stepIdx + 1} / ${MOBILE_STEPS.length}`;

  return (
    <HeroStep
      variant="mobile"
      title={t(step.titleKey as any, locale)}
      body={t(step.bodyKey as any, locale)}
      stepLabel={stepLabel}
      isFirst={isFirst}
      isLast={isLast}
      primaryLabel={isLast ? t('tour.gotIt', locale) : t('tour.next', locale)}
      backLabel={t('tour.back', locale)}
      skipLabel={t('tour.skip', locale)}
      onPrimary={goNext}
      onBack={() => setStepIdx((i) => Math.max(0, i - 1))}
      onSkip={finish}
    />
  );
}

const toastStyles: React.CSSProperties = {
  position: 'fixed',
  bottom: 80,
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'var(--bg-card, #161b22)',
  border: '1px solid var(--border, #30363d)',
  borderRadius: 8,
  padding: '8px 14px',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '0.65rem',
  color: 'var(--text-secondary, #8b949e)',
  zIndex: 9999,
  maxWidth: '90vw',
  textAlign: 'center',
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/Onboarding/MobileOnboarding.tsx
git commit -m "feat(onboarding): add MobileOnboarding controller (3-step bottom-sheet)"
```

---

## Task 9: Wire OnboardingTour into CommandCenter, remove inline welcome toast, delete WelcomeOverlay

**Files:**
- Modify: `src/components/islands/CommandCenter/CommandCenter.tsx`
- Delete: `src/components/islands/CommandCenter/WelcomeOverlay.tsx`

- [ ] **Step 1: Add the OnboardingTour import**

In `src/components/islands/CommandCenter/CommandCenter.tsx`, after the existing onboarding import:

```tsx
import { getDiscoveredFeatures, markFeatureDiscovered, getNextCoachHint } from '../../../lib/onboarding';
```

Add:

```tsx
import { resetTour } from '../../../lib/onboarding';
import OnboardingTour, { TOUR_REPLAY_EVENT } from '../../Onboarding/OnboardingTour';
```

(Note the relative path: from `src/components/islands/CommandCenter/` up two to `src/components/`.)

- [ ] **Step 2: Remove the inline welcome-toast state and effect**

Find and delete these blocks in `CommandCenter.tsx`:

1. The `showToast` state declaration (around line 128):
   ```tsx
   const [showToast, setShowToast] = useState(false);
   ```

2. The `useEffect` that reads `watchboard-welcomed` (around lines 214–221):
   ```tsx
   useEffect(() => {
     if (!localStorage.getItem('watchboard-welcomed')) {
       setShowToast(true);
       localStorage.setItem('watchboard-welcomed', '1');
       const timer = setTimeout(() => setShowToast(false), 8000);
       return () => clearTimeout(timer);
     }
   }, []);
   ```

3. The toast JSX (around lines 879–900) — the entire `{showToast && (...)}` block.

(Removal of the legacy `watchboard-welcomed` flag is intentional — Task 1's migration handles existing users.)

- [ ] **Step 3: Add a "Replay tour" affordance to the `?` help panel**

Add an import for `getTourState` to the existing onboarding import line:

```tsx
import { getDiscoveredFeatures, markFeatureDiscovered, getNextCoachHint, getTourState } from '../../../lib/onboarding';
```

Find the `helpPanel` JSX (around lines 856–871). Just inside the `<div style={styles.helpPanel} ...>`, before `<div style={styles.helpTitle}>...</div>`, insert:

```tsx
<div style={styles.replayBlock}>
  <div>
    <div style={styles.replayLabel}>{t('tour.newHere' as any, locale)}</div>
    {(() => {
      const ts = getTourState('desktop').completedAt;
      if (!ts) return null;
      const date = new Date(ts).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
      return <div style={styles.replayMeta}>{t('tour.lastCompleted' as any, locale)} {date}</div>;
    })()}
  </div>
  <button
    type="button"
    style={styles.replayButton}
    onClick={() => {
      resetTour('desktop');
      setShowHelp(false);
      window.dispatchEvent(new CustomEvent(TOUR_REPLAY_EVENT));
    }}
  >
    ▶ {t('tour.replay' as any, locale)}
  </button>
</div>
```

Then add the corresponding style entries to the `styles` object at the bottom of the file (just below `helpClose`):

```tsx
  replayBlock: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'var(--bg-secondary, #0d1117)',
    border: '1px solid var(--border, #30363d)',
    borderRadius: 6,
    padding: '8px 12px',
    marginBottom: '0.75rem',
  } as React.CSSProperties,
  replayLabel: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.7rem',
    color: 'var(--text-secondary, #8b949e)',
  } as React.CSSProperties,
  replayMeta: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.5rem',
    color: 'var(--text-muted, #484f58)',
    marginTop: 2,
  } as React.CSSProperties,
  replayButton: {
    background: '#1f6feb',
    color: '#fff',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
```

- [ ] **Step 4: Mount the OnboardingTour island**

Just before the closing `</div>` of the root `command-center-root` container (right after the `{coachHint && !isMobile && (...)}` block, around line 876), add:

```tsx
{!isMobile && <OnboardingTour />}
```

(Mobile mounts its own tour from MobileStoryCarousel — see Task 10.)

- [ ] **Step 5: Delete the dead WelcomeOverlay file**

```bash
git rm src/components/islands/CommandCenter/WelcomeOverlay.tsx
```

- [ ] **Step 6: Type-check + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both succeed. (`npm run build` is the final correctness gate before any UI testing.)

- [ ] **Step 7: Commit**

```bash
git add src/components/islands/CommandCenter/CommandCenter.tsx
git commit -m "feat(onboarding): mount desktop tour, remove legacy welcome toast"
```

---

## Task 10: Wire MobileOnboarding into MobileStoryCarousel + add Replay intro affordance

**Files:**
- Modify: `src/components/islands/CommandCenter/MobileStoryCarousel.tsx`

The mobile carousel has no settings menu. The simplest, lowest-disruption replay surface is a tiny "↻" button placed in the top-right of the story circles row. Tapping it dispatches the mobile-replay event.

- [ ] **Step 1: Add imports**

At the top of `src/components/islands/CommandCenter/MobileStoryCarousel.tsx`, add:

```tsx
import { resetTour } from '../../../lib/onboarding';
import MobileOnboarding, { MOBILE_TOUR_REPLAY_EVENT } from '../../Onboarding/MobileOnboarding';
```

- [ ] **Step 2: Mount `<MobileOnboarding />` and add the replay button inside the returned JSX**

Find the `return (` block (around line 130) that begins:

```tsx
return (
  <div className="story-carousel">
    {/* Circle row */}
    <div className="story-circles" ref={circlesRef}>
```

Replace with:

```tsx
return (
  <div className="story-carousel">
    <MobileOnboarding />
    <button
      type="button"
      aria-label={t('tour.replay' as any, locale)}
      title={t('tour.replay' as any, locale)}
      onClick={() => {
        resetTour('mobile');
        window.dispatchEvent(new CustomEvent(MOBILE_TOUR_REPLAY_EVENT));
      }}
      style={{
        position: 'absolute',
        top: 6,
        right: 8,
        zIndex: 10,
        background: 'rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '50%',
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255,255,255,0.7)',
        cursor: 'pointer',
        fontSize: '0.85rem',
      }}
    >↻</button>
    {/* Circle row */}
    <div className="story-circles" ref={circlesRef}>
```

- [ ] **Step 3: Type-check + build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/components/islands/CommandCenter/MobileStoryCarousel.tsx
git commit -m "feat(onboarding): mount mobile tour + add replay-intro affordance"
```

---

## Task 11: Manual smoke test pass + final build gate

**Files:** none modified — verification only.

This task validates the full feature against the spec's manual smoke checklist. Do not skip — the previous tasks have unit coverage for the pure modules but no automated coverage for the React components.

- [ ] **Step 1: Build and start preview**

```bash
npm run build
npm run preview
```

Open the preview URL in Chrome.

- [ ] **Step 2: Run smoke test 1 — fresh-visit auto-launch**

In a Chrome window with cleared site data (DevTools → Application → Storage → Clear site data):

1. Reload the homepage.
2. **Expect:** `OnboardingTour` step 1 (hero-intro) appears, modal centered, primary button reads "Take the 30-second tour →".
3. Click "Next →" through all 6 steps. Steps 2–4 should highlight the globe / sidebar / ticker respectively.
4. On step 6 ("You're ready"), click "Start exploring →".
5. **Expect:** the modal closes, a toast in the bottom-right reads "Tour done. Replay anytime from the ? menu." It auto-dismisses in ~4s.
6. Reload the page.
7. **Expect:** the tour does NOT auto-launch.

If any step fails, file a failure note and STOP — do not proceed.

- [ ] **Step 3: Run smoke test 2 — replay**

1. Press `?` on the keyboard. The help panel opens.
2. **Expect:** at the top of the panel, a "New here? ▶ Replay tour" row is visible.
3. Click "▶ Replay tour".
4. **Expect:** the help panel closes, the tour relaunches at step 1.
5. Walk through to completion.
6. **Expect:** NO toast on this completion (it's a replay).

- [ ] **Step 4: Run smoke test 3 — spotlight follows resize**

1. Trigger the tour replay again (steps 1–3 above), advance to step 2 (globe).
2. Resize the browser window narrower then wider.
3. **Expect:** the spotlight rect smoothly tracks the globe bounding box.

- [ ] **Step 5: Run smoke test 4 — mobile tour, separate key**

1. Open Chrome DevTools, switch to a mobile viewport (e.g. iPhone 14).
2. Clear site data again.
3. Reload.
4. **Expect:** the desktop tour does NOT auto-launch. The mobile bottom-sheet does. Walk through 3 steps.
5. After completion, switch back to desktop viewport and reload.
6. **Expect:** the desktop tour DOES auto-launch (mobile completion did not satisfy the desktop key).

- [ ] **Step 6: Run smoke test 5 — locale rendering**

1. Replay the tour.
2. Change the language via the language toggle (🌐 in the nav).
3. Replay the tour again.
4. **Expect:** copy renders in the selected locale (es / fr / pt).

- [ ] **Step 7: Run smoke test 6 — legacy migration**

1. Open the homepage in a fresh browser.
2. In DevTools console, run: `localStorage.setItem('watchboard-welcomed', '1')`.
3. Reload.
4. **Expect:** the tour does NOT auto-launch. The legacy key is gone (`localStorage.getItem('watchboard-welcomed')` is `null`). Both new keys exist with `completed: true`.

- [ ] **Step 8: Final build + unit-test gate**

```bash
npx vitest run
npm run build
```

Expected: all unit tests pass, build succeeds.

- [ ] **Step 9: Commit a smoke-test summary (optional but recommended)**

If any smoke step revealed a follow-up issue and was fixed inline, ensure those fixes are committed. Otherwise, this task produces no commit; the previous task commits represent the feature.

---

## Summary

| Task | Output | Tests |
|------|--------|-------|
| 1    | `onboarding.ts` persistence + migration | 8 unit tests |
| 2    | `onboarding-steps.ts` config            | 5 unit tests |
| 3    | i18n keys (en/es/fr/pt)                 | tsc only |
| 4    | Anchor IDs on globe / sidebar / ticker  | console smoke |
| 5    | `SpotlightStep.tsx`                     | manual smoke |
| 6    | `HeroStep.tsx`                          | manual smoke |
| 7    | `OnboardingTour.tsx` (desktop)          | manual smoke |
| 8    | `MobileOnboarding.tsx`                  | manual smoke |
| 9    | Wire desktop + remove legacy + delete WelcomeOverlay | manual smoke |
| 10   | Wire mobile + replay button             | manual smoke |
| 11   | Full smoke checklist + final gate       | acceptance |

Total: 11 tasks, 11 commits, ~13 unit tests, 7 manual smoke checks.
