/** Trigger a short haptic vibration on supported devices. Respects prefers-reduced-motion. */
export function haptic(ms = 10) {
  try {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    navigator.vibrate?.(ms);
  } catch { /* unsupported */ }
}
