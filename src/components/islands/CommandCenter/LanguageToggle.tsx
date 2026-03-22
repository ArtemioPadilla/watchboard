import { memo } from 'react';
import type { CSSProperties } from 'react';
import type { Locale } from '../../../i18n/translations';

interface Props {
  locale: Locale;
  onToggle: () => void;
}

const LanguageToggle = memo(function LanguageToggle({ locale, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={styles.btn}
      title={locale === 'en' ? 'Cambiar a Espanol' : 'Switch to English'}
      aria-label={locale === 'en' ? 'Switch to Spanish' : 'Switch to English'}
    >
      <span style={{ ...styles.lang, opacity: locale === 'en' ? 1 : 0.4 }}>EN</span>
      <span style={styles.sep}>/</span>
      <span style={{ ...styles.lang, opacity: locale === 'es' ? 1 : 0.4 }}>ES</span>
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
  } as CSSProperties,
};
