import { useEffect, useState } from 'react';
import { DEFAULT_LOCALE, getPreferredLocale, type Locale } from './translations';

/**
 * SSR-safe locale hook for React islands.
 *
 * The static build always renders English ('en'). Detecting the user's
 * locale (localStorage / navigator.language) during the first client render
 * makes that render diverge from the SSR HTML and throws React error #418
 * (hydration text mismatch) on every translated island. Same pattern as
 * FreshnessBadge: initialize to the server value and switch to the detected
 * locale inside useEffect, after hydration has committed. Translated text
 * still swaps to the user's language right after mount.
 */
export function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => {
    const detected = getPreferredLocale();
    if (detected !== DEFAULT_LOCALE) setLocale(detected);
  }, []);
  return locale;
}
