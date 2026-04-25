# Onboarding Redesign — Design Spec

**Date:** 2026-04-25
**Status:** Approved (brainstorm), pending implementation plan
**Supersedes:** `WelcomeOverlay` (single-modal welcome) and partially the coach-hint queue's role as "first impression."

## Problem

A first-time visitor lands on Watchboard and sees a 3D globe, a sidebar list of trackers, and a scrolling broadcast ticker — with no headline explaining *what the site is* or *how to use it*. The existing `WelcomeOverlay` is a single dismissible modal that lists three keyboard shortcuts and is easy to miss or mis-skim. A friend reported the site is "too hard to understand as a newcomer." The audit confirmed the value prop, navigation model, source-tier system, and section semantics are all unexplained on first paint.

## Goal

Replace the single welcome modal with a multi-step guided tour that:

1. Explains what Watchboard is in one screen.
2. Walks the user through the three primary surfaces (globe, sidebar, broadcast ticker).
3. Teaches the source-tier color system inline, not in a buried About page.
4. Is unmissable on first visit, easy to skip, and replayable.
5. Has a separate, shorter flow for mobile (which uses a different layout entirely).

## Non-Goals (v1)

- Mid-tour resume (close + reopen restarts from step 1).
- Cross-device tour state sync.
- Per-tracker mini-tours on tracker detail pages.
- A/B testing tour copy variants.
- Removing the existing `COACH_HINTS` queue — it serves post-tour micro-discoveries and stays.

## Architecture

### New files

- `src/components/islands/Onboarding/OnboardingTour.tsx` — desktop controller, owns step state and renders the active step.
- `src/components/islands/Onboarding/MobileOnboarding.tsx` — mobile controller (3 steps, bottom-sheet layout).
- `src/components/islands/Onboarding/SpotlightStep.tsx` — reusable spotlight + auto-positioned tooltip primitive.
- `src/components/islands/Onboarding/HeroStep.tsx` — fullscreen hero panel used by step 1, step 5 (tier system), and step 6 (closing).
- `src/lib/onboarding-steps.ts` — pure config: ordered array of `{id, type: 'hero' | 'spotlight' | 'closing', anchor?, copy, illustration?}`.

### Modified files

- `src/lib/onboarding.ts` — add `TOUR_KEY_DESKTOP` / `TOUR_KEY_MOBILE` (versioned: `-v1` suffix), `TourState` interface, `getTourState`, `markTourComplete`, `resetTour`, `isTourCompleted`. Add legacy migration: if `watchboard-welcome-dismissed` exists, mark both new keys complete and delete the legacy key.
- `src/components/islands/CommandCenter/CommandCenter.tsx` — swap the `WelcomeOverlay` mount for `OnboardingTour`; add a "Replay tour" item to the `?` shortcuts panel.
- `src/components/islands/CommandCenter/MobileStoryCarousel.tsx` — mount `MobileOnboarding` on first visit; add a small "Replay intro" affordance (exact placement deferred to implementation plan).
- `src/i18n/translations.ts` — add tour copy keys for en, es, fr, pt.

### Deleted files

- `src/components/islands/CommandCenter/WelcomeOverlay.tsx` — superseded.

### Anchor IDs to add (small additive change)

- `#tour-globe` on the Cesium globe canvas wrapper.
- `#tour-sidebar` on the `SidebarPanel` outer div.
- `#tour-ticker` on the `BroadcastOverlay` ticker container.

Missing anchor → step degrades to a centered modal (no spotlight). Logged once to console; no user-facing error.

## UX Flow

### Desktop tour (6 steps, ~30s)

Progress dots top-center. "Skip tour" link bottom-right (always visible). "Back" / "Next →" bottom-center. Esc dismisses + marks complete.

1. **Hero — What is Watchboard?**
   Headline: *"Watchboard — live intelligence on the world's biggest stories."*
   Three pillars (icon row): 🌐 Track 50+ unfolding events · 📺 Watch the broadcast · 🔍 Search every claim & source.
   CTA: "Take the 30-second tour →" (primary) · "Skip" (secondary).

2. **Spotlight — Globe.** *"Each pin is a real event. Click to dive into a tracker."*

3. **Spotlight — Sidebar.** *"Every active tracker, grouped by view (Operations / Geographic / Domain). Star to follow."*

4. **Spotlight — Broadcast ticker.** *"Auto-cycles through trackers. Press **B** to pause. Hover to explore."*

5. **Hero — Source tiers.** *"How we rate sources."* with four colored badges:
   - 🟢 **T1** Official (governments, UN, IAEA)
   - 🔵 **T2** Major outlets (Reuters, AP, BBC)
   - 🟠 **T3** Institutional (CSIS, HRW, think tanks)
   - 🔴 **T4** Unverified (social media, early reports)

   Footer: *"We surface all four so you can judge for yourself."*

6. **Closing.** *"You're ready."* + 3 shortcut chips: `/` Search · `B` Pause broadcast · `?` All shortcuts & replay.
   On dismiss: 4-second toast — *"Tour done. Replay anytime from the **?** menu."* (fired only on first completion, when `replayCount === 0` at completion time).

### Mobile tour (3 steps, bottom-sheet)

Slides up from bottom 60% of viewport. No spotlight (small screens make spotlight cramped).

1. **Welcome.** *"Live intelligence on the world's biggest stories."* + 1-line tier-badge primer.
2. **Stories.** *"Tap or swipe through stories. Each circle is a tracker."* (arrow points up to carousel.)
3. **Dive in.** *"Tap any story to open the full tracker."* + "Got it" button → toast on dismiss.

## SpotlightStep Primitive

**Render strategy: SVG mask, not stacked div overlays.** A single fixed-position `<svg>` covering the viewport, with a `<mask>` containing a full-viewport white rect minus a black rect over the target. The black rect cuts the hole; the visible scrim is one `<rect fill="rgba(0,0,0,0.65)" mask="url(#spotlight)">`. Animates cleanly via CSS transitions on rect attrs.

**Target resolution.** Each spotlight step has an `anchor: string` CSS selector. On mount and on resize/scroll:
```ts
const el = document.querySelector(anchor);
const rect = el.getBoundingClientRect();
setTargetRect({ x: rect.x - 8, y: rect.y - 8, w: rect.width + 16, h: rect.height + 16 });
```
8px breathing room around the element.

**Tooltip positioning.** Hand-rolled auto-flip: prefer below target, flip to above if cropped; prefer right, flip left if cropped. ~30 lines for our 4 anchors. No floating-ui dependency.

**Interactivity.**
- Backdrop: `pointer-events: none` so the spotlit element stays clickable.
- Tooltip: `pointer-events: auto`, contains "Back" / "Next →" / "Skip".
- Esc anywhere → skip.

**Window resize / scroll.** ResizeObserver on `document.body` + passive scroll listener → recompute rect.

**Accessibility.**
- `role="dialog"`, `aria-modal="true"` on tooltip.
- Focus trapped to tooltip's buttons during the step.
- Spotlight rect `aria-hidden="true"`.
- `prefers-reduced-motion` → snap rect transitions instantly.

## Persistence

```ts
const TOUR_KEY_DESKTOP = 'watchboard-tour-desktop-v1';
const TOUR_KEY_MOBILE  = 'watchboard-tour-mobile-v1';

interface TourState {
  completed: boolean;
  completedAt?: string;   // ISO timestamp
  lastStepIndex?: number; // reserved; not used in v1
  replayCount: number;
}
```

The `-v1` suffix is deliberate. When tour content changes materially in the future, bump to `-v2`; old completion flags become irrelevant and returning users see the new tour once.

**API**
```ts
getTourState(surface: 'desktop' | 'mobile'): TourState
markTourComplete(surface): void
resetTour(surface): void
isTourCompleted(surface): boolean
```

**Why split keys (not shared)?** Desktop and mobile tours teach different mental models (globe + sidebar + ticker vs. story carousel). A desktop-trained user on their phone still benefits from the mobile intro. Cost: one extra localStorage entry.

**Legacy migration.** First time the new code reads state, if `watchboard-welcome-dismissed=true` exists, both new keys are silently marked complete and the legacy key is removed. Returning users who already dismissed the old overlay are not re-prompted. One-shot.

**SSR safety.** All localStorage access wrapped in try/catch. React island reads in `useEffect` only — never during render. Astro static build remains correct.

## Replay Surface

**Primary: `?` shortcuts panel.** Add a top section above the keybindings list:
- *"New here?"* + button "▶ Replay tour"
- *"Last completed: Apr 14, 2026"* (smaller text) when `completedAt` exists.

Click → `resetTour('desktop')` then dispatches a custom event `watchboard:start-tour` that `OnboardingTour` listens for. Avoids prop-drilling between two distant islands.

**Secondary: completion toast** (described in Closing step above).

**Mobile.** A "Replay intro" link in the existing mobile carousel header overflow / settings affordance. Exact placement deferred to the implementation plan after re-reading `MobileStoryCarousel.tsx`.

## Error Handling

- All localStorage access in try/catch; on failure tour acts as if not yet completed (slight annoyance > broken site).
- Missing anchor element → log once, render centered modal fallback, never crash.
- Translation key missing → fall back to English (existing `t()` behavior).
- ResizeObserver unsupported → fall back to window resize listener; spotlight may lag during sidebar collapse animation but remains functional.

## Testing

**Unit (Vitest)**
- `onboarding.test.ts` — defaults, write shape, reset preserves `replayCount`, legacy migration triggers exactly once.
- `onboarding-steps.test.ts` — unique IDs, every spotlight step has non-empty anchor, copy exists in all 4 locales.

**Component (React Testing Library)**
- `SpotlightStep.test.tsx` — centered fallback when anchor missing, correct rect when anchor present, Esc fires onSkip.
- `OnboardingTour.test.tsx` — auto-launches when `completed=false`, does not when `completed=true`, Skip mid-tour marks complete, completion toast fires only on first completion.
- `MobileOnboarding.test.tsx` — 3-step flow, separate localStorage key.

**Manual smoke tests**
1. Fresh browser → tour auto-launches → walk all 6 steps → toast appears → reload → tour does not re-launch.
2. Click "Replay tour" → relaunches → no toast on second completion.
3. Resize window mid-step 2 → spotlight follows the globe.
4. Mobile viewport → desktop tour does not show, mobile bottom-sheet does, completing it does not affect desktop key.
5. Locale switch (en/es/fr/pt) → tour copy renders translated.
6. Returning user with legacy `watchboard-welcome-dismissed=true` → no tour, both new keys silently marked complete.

## Rollout

**Single PR. No feature flag.** The feature is fully reversible by clearing localStorage; flagging would require keeping both `WelcomeOverlay` and `OnboardingTour` code paths simultaneously, which is more risk than removing.

**Pre-merge checklist**
- `npm run build` passes.
- Manual smoke tests 1–6 on Chrome desktop + Safari iOS.
- Spotlight z-index above the Cesium WebGL container's stacking context.

**Post-merge signal**
- `replayCount` in localStorage gives a free per-user signal if we ever instrument it. No new analytics infra in v1.
