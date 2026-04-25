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
