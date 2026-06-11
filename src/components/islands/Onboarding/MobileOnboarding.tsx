import { MOBILE_STEPS } from '../../../lib/onboarding-steps';
import { t } from '../../../i18n/translations';
import { useLocale } from '../../../i18n/useLocale';
import { useOnboardingController } from './useOnboardingController';
import HeroStep from './HeroStep';

export const MOBILE_TOUR_REPLAY_EVENT = 'watchboard:start-mobile-tour';

export default function MobileOnboarding() {
  const locale = useLocale();
  const { active, stepIdx, showCompletionToast, finish, goNext, goBack } =
    useOnboardingController(MOBILE_STEPS.length, 'mobile', MOBILE_TOUR_REPLAY_EVENT);

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
      title={t(step.titleKey, locale)}
      body={t(step.bodyKey, locale)}
      stepLabel={stepLabel}
      isFirst={isFirst}
      isLast={isLast}
      primaryLabel={isLast ? t('tour.gotIt', locale) : t('tour.next', locale)}
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
