import { DESKTOP_STEPS } from '../../../lib/onboarding-steps';
import { t } from '../../../i18n/translations';
import { useLocale } from '../../../i18n/useLocale';
import { useOnboardingController } from './useOnboardingController';
import { useInterests } from '../shared/useInterests';
import InterestChips from '../shared/InterestChips';
import HeroStep from './HeroStep';
import SpotlightStep from './SpotlightStep';
import type { interestOptions } from '../../../lib/interests';

export const TOUR_REPLAY_EVENT = 'watchboard:start-tour';

interface OnboardingTourProps {
  interestOptions?: ReturnType<typeof interestOptions>;
}

export default function OnboardingTour({ interestOptions: options }: OnboardingTourProps = {}) {
  const locale = useLocale();
  const { interests, toggle } = useInterests();
  const { active, stepIdx, showCompletionToast, finish, goNext, goBack } =
    useOnboardingController(DESKTOP_STEPS.length, 'desktop', TOUR_REPLAY_EVENT);

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
  const title = t(step.titleKey, locale);
  const body = t(step.bodyKey, locale);

  if (step.type === 'spotlight' && step.anchor) {
    return (
      <SpotlightStep
        anchor={step.anchor}
        title={title}
        body={body}
        stepLabel={stepLabel}
        isFirst={isFirst}
        backLabel={t('tour.back', locale)}
        nextLabel={t('tour.next', locale)}
        skipLabel={t('tour.skip', locale)}
        onBack={goBack}
        onNext={goNext}
        onSkip={finish}
      />
    );
  }

  if (step.type === 'interests') {
    const primaryLabel = t('tour.next', locale);
    return (
      <HeroStep
        variant="interests"
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
      >
        <InterestChips
          compact
          interests={interests}
          options={options ?? { domains: [], regions: [] }}
          locale={locale}
          onToggle={toggle}
        />
      </HeroStep>
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
