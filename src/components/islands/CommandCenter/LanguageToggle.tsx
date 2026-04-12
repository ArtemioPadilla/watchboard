import { memo } from 'react';
import type { CSSProperties } from 'react';
import type { Locale } from '../../../i18n/translations';
import { SUPPORTED_LOCALES } from '../../../i18n/translations';

interface Props {
  locale: Locale;
  onToggle: () => void;
}

const LOCALE_LABELS: Record<string, string> = {
  en: 'EN',
  es: 'ES',
  fr: 'FR',
  pt: 'PT',
};

const LanguageToggle = memo(function LanguageToggle({ locale, onToggle }: Props) {
  const labels: Record<string, string> = {
    en: 'Switch language',
    es: 'Cambiar idioma',
    fr: 'Changer de langue',
    pt: 'Mudar idioma',
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      style={styles.btn}
      title={labels[locale] || labels.en}
      aria-label={labels[locale] || labels.en}
    >
      {SUPPORTED_LOCALES.map((loc, i) => (
        <span key={loc}>
          {i > 0 && <span style={styles.sep}>/</span>}
          <span style={{ ...styles.lang, opacity: locale === loc ? 1 : 0.4 }}>
            {LOCALE_LABELS[loc] || loc.toUpperCase()}
          </span>
        </span>
      ))}
    </button>
  );
});

export default LanguageToggle;

const styles = {
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    padding: '2px 6px',
    border: '1px solid var(--border)',
    borderRadius: 3,
    background: 'transparent',
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.5rem',
    fontWeight: 600,
    letterSpacing: '0.06em',
    transition: 'border-color 0.2s',
  } as CSSProperties,

  lang: {
    color: 'var(--text-primary)',
    transition: 'opacity 0.2s',
  } as CSSProperties,

  sep: {
    color: 'var(--text-muted)',
    opacity: 0.3,
    margin: '0 1px',
  } as CSSProperties,
};
