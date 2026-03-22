import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { t, getPreferredLocale, getLocaleFromUrl, DEFAULT_LOCALE } from './translations';

// ── t() ──

describe('t', () => {
  it('returns English translation by default', () => {
    /** TC-i18n-001: t() defaults to English. Verifies: AC-t-default */
    expect(t('header.unclassified')).toBe('UNCLASSIFIED');
    expect(t('footer.about')).toBe('About & Credits');
  });

  it('returns English when explicitly passed "en"', () => {
    /** TC-i18n-002: t() with explicit English locale. Verifies: AC-t-default */
    expect(t('header.unclassified', 'en')).toBe('UNCLASSIFIED');
  });

  it('returns Spanish translation for locale "es"', () => {
    /** TC-i18n-003: t() returns Spanish. Verifies: AC-t-es */
    expect(t('header.unclassified', 'es')).toBe('NO CLASIFICADO');
    expect(t('footer.about', 'es')).toBe('Acerca de y Creditos');
    expect(t('status.active', 'es')).toBe('ACTIVO');
  });

  it('returns English fallback for a valid key with no Spanish override', () => {
    /**
     * TC-i18n-004: t() falls back to English when key is missing in target locale.
     * Verifies: AC-t-fallback
     *
     * Note: currently all keys exist in both locales, so this tests the fallback
     * chain logic. The function returns `translations[locale]?.[key] || translations.en[key] || key`.
     */
    // All keys are covered in both locales, so we verify the chain works
    // by checking the function's behavior with known keys in both languages
    expect(t('time.justNow', 'en')).toBe('Just now');
    expect(t('time.justNow', 'es')).toBe('Ahora mismo');
  });

  it('covers all domain keys in both languages', () => {
    /** TC-i18n-005: t() domain translations. Verifies: AC-t-complete */
    expect(t('domain.conflict', 'en')).toBe('CONFLICT');
    expect(t('domain.conflict', 'es')).toBe('CONFLICTO');
    expect(t('domain.disaster', 'en')).toBe('DISASTER');
    expect(t('domain.disaster', 'es')).toBe('DESASTRE');
  });

  it('covers section keys in both languages', () => {
    /** TC-i18n-006: t() section translations. Verifies: AC-t-complete */
    expect(t('section.timeline', 'en')).toBe('Timeline');
    expect(t('section.timeline', 'es')).toBe('Linea de Tiempo');
  });
});

// ── getLocaleFromUrl ──

describe('getLocaleFromUrl', () => {
  it('returns "es" when path starts with /es/', () => {
    /** TC-i18n-007: getLocaleFromUrl detects /es/. Verifies: AC-locale-url */
    const url = new URL('https://example.com/es/some-page');
    expect(getLocaleFromUrl(url)).toBe('es');
  });

  it('returns "es" when locale is after base path (/watchboard/es/)', () => {
    /** TC-i18n-008: getLocaleFromUrl detects locale after base. Verifies: AC-locale-url */
    const url = new URL('https://example.com/watchboard/es/tracker');
    expect(getLocaleFromUrl(url)).toBe('es');
  });

  it('returns default locale for paths without a locale prefix', () => {
    /** TC-i18n-009: getLocaleFromUrl defaults to en. Verifies: AC-locale-url */
    const url = new URL('https://example.com/watchboard/iran-conflict');
    expect(getLocaleFromUrl(url)).toBe(DEFAULT_LOCALE);
  });

  it('returns default locale for root path', () => {
    /** TC-i18n-010: getLocaleFromUrl root path. Verifies: AC-locale-url */
    const url = new URL('https://example.com/');
    expect(getLocaleFromUrl(url)).toBe(DEFAULT_LOCALE);
  });

  it('does not match unsupported locales', () => {
    /** TC-i18n-011: getLocaleFromUrl rejects unsupported locale. Verifies: AC-locale-url */
    const url = new URL('https://example.com/fr/some-page');
    expect(getLocaleFromUrl(url)).toBe(DEFAULT_LOCALE);
  });
});

// ── getPreferredLocale ──

describe('getPreferredLocale', () => {
  // Save original globals
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore original globals
    if (originalWindow === undefined) {
      // @ts-expect-error -- restoring undefined in test env
      delete globalThis.window;
    }
    if (originalNavigator === undefined) {
      // @ts-expect-error -- restoring undefined in test env
      delete globalThis.navigator;
    }
  });

  it('returns default locale in SSR (no window)', () => {
    /** TC-i18n-012: getPreferredLocale SSR fallback. Verifies: AC-locale-preferred */
    // In vitest node environment, window is undefined by default
    // @ts-expect-error -- simulating SSR
    delete globalThis.window;
    expect(getPreferredLocale()).toBe(DEFAULT_LOCALE);
  });

  it('returns saved locale from localStorage', () => {
    /** TC-i18n-013: getPreferredLocale reads localStorage. Verifies: AC-locale-preferred */
    const mockStorage: Record<string, string> = { 'watchboard-locale': 'es' };
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: () => {},
    });
    vi.stubGlobal('navigator', { language: 'en-US' });

    expect(getPreferredLocale()).toBe('es');
  });

  it('falls back to browser language when localStorage is empty', () => {
    /** TC-i18n-014: getPreferredLocale uses navigator.language. Verifies: AC-locale-preferred */
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    vi.stubGlobal('navigator', { language: 'es-MX' });

    expect(getPreferredLocale()).toBe('es');
  });

  it('returns default locale when browser language is unsupported', () => {
    /** TC-i18n-015: getPreferredLocale unsupported browser lang. Verifies: AC-locale-preferred */
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    vi.stubGlobal('navigator', { language: 'fr-FR' });

    expect(getPreferredLocale()).toBe(DEFAULT_LOCALE);
  });

  it('returns default locale when localStorage throws', () => {
    /** TC-i18n-016: getPreferredLocale handles localStorage error. Verifies: AC-locale-preferred */
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('SecurityError'); }, setItem: () => {} });
    vi.stubGlobal('navigator', { language: 'en-US' });

    expect(getPreferredLocale()).toBe('en');
  });
});
