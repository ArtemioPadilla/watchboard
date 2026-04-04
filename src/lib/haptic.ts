/** Trigger a short haptic vibration on supported devices. */
export function haptic(ms = 10) {
  try { navigator.vibrate?.(ms); } catch { /* unsupported */ }
}
