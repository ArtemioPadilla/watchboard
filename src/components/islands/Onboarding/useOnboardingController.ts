import { useCallback, useEffect, useState } from 'react';
import {
  isTourCompleted,
  markTourComplete,
  getTourState,
  type TourSurface,
} from '../../../lib/onboarding';

/**
 * Shared tour state machine for OnboardingTour (desktop) and
 * MobileOnboarding. Handles auto-launch on first visit, replay via a window
 * event, step navigation, completion persistence, and the one-shot
 * completion toast.
 */
export function useOnboardingController(
  stepCount: number,
  surface: TourSurface,
  replayEvent: string,
) {
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [showCompletionToast, setShowCompletionToast] = useState(false);

  // Auto-launch on first visit
  useEffect(() => {
    if (!isTourCompleted(surface)) {
      setStepIdx(0);
      setActive(true);
    }
  }, [surface]);

  // Listen for replay event from elsewhere (e.g. ? menu / ↻ button)
  useEffect(() => {
    const handler = () => {
      setStepIdx(0);
      setActive(true);
    };
    window.addEventListener(replayEvent, handler);
    return () => window.removeEventListener(replayEvent, handler);
  }, [replayEvent]);

  const finish = useCallback(() => {
    const wasFirstCompletion = getTourState(surface).replayCount === 0
      && !isTourCompleted(surface);
    markTourComplete(surface);
    setActive(false);
    if (wasFirstCompletion) setShowCompletionToast(true);
  }, [surface]);

  useEffect(() => {
    if (!showCompletionToast) return;
    const id = setTimeout(() => setShowCompletionToast(false), 4000);
    return () => clearTimeout(id);
  }, [showCompletionToast]);

  const goNext = useCallback(() => {
    if (stepIdx >= stepCount - 1) {
      finish();
    } else {
      setStepIdx((i) => i + 1);
    }
  }, [stepIdx, stepCount, finish]);

  const goBack = useCallback(() => {
    setStepIdx((i) => Math.max(0, i - 1));
  }, []);

  return { active, stepIdx, showCompletionToast, finish, goNext, goBack };
}
