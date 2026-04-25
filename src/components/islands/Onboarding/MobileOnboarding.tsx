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
