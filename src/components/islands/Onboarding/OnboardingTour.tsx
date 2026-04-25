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
