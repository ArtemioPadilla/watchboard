import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface HeroStepProps {
  variant: 'intro' | 'tiers' | 'closing' | 'mobile';
  title: string;
  body: string;
  stepLabel?: string;
  isFirst: boolean;
  isLast: boolean;
  primaryLabel: string;
  backLabel: string;
  skipLabel: string;
  onPrimary: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export default function HeroStep({
  variant,
  title,
  body,
  stepLabel,
  isFirst,
  isLast,
  primaryLabel,
  backLabel,
  skipLabel,
  onPrimary,
  onBack,
  onSkip,
}: HeroStepProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSkip]);

  const isMobileSheet = variant === 'mobile';

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Onboarding tour step" style={styles.backdrop}>
      <div style={isMobileSheet ? styles.mobileSheet : styles.panel}>
        {stepLabel && <div style={styles.stepLabel}>{stepLabel}</div>}
        {variant === 'intro' && <div style={styles.iconRow}>🌐 📺 🔍</div>}
        {variant === 'tiers' && (
          <div style={styles.tiersRow}>
            <TierBadge color="var(--tier-1, #2ecc71)" label="T1" sub="Official" />
            <TierBadge color="var(--tier-2, #58a6ff)" label="T2" sub="Major outlets" />
            <TierBadge color="var(--tier-3, #f39c12)" label="T3" sub="Institutional" />
            <TierBadge color="var(--tier-4, #e74c3c)" label="T4" sub="Unverified" />
          </div>
        )}
        <h2 style={styles.title}>{title}</h2>
        <p style={styles.body}>{body}</p>
        <div style={styles.footer}>
          {!isFirst && !isMobileSheet && (
            <button type="button" onClick={onBack} style={styles.secondary}>
              {backLabel}
            </button>
          )}
          <button ref={primaryRef} type="button" onClick={onPrimary} style={styles.primary}>
            {primaryLabel}
          </button>
        </div>
        {!isLast && (
          <button type="button" onClick={onSkip} style={styles.skip}>
            {skipLabel}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function TierBadge({ color, label, sub }: { color: string; label: string; sub: string }) {
  return (
    <div style={{ ...tierBadgeStyles.cell, borderColor: color }}>
      <div style={{ ...tierBadgeStyles.label, color }}>{label}</div>
      <div style={tierBadgeStyles.sub}>{sub}</div>
    </div>
  );
}

const tierBadgeStyles: Record<string, React.CSSProperties> = {
  cell: {
    flex: 1,
    border: '1px solid',
    borderRadius: 6,
    padding: '8px 4px',
    textAlign: 'center',
  },
  label: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.85rem',
    fontWeight: 700,
  },
  sub: {
    fontSize: '0.6rem',
    color: 'var(--text-muted, #8b949e)',
    marginTop: 2,
  },
};

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 300,
  },
  panel: {
    background: 'var(--bg-card, #161b22)',
    border: '1px solid var(--border, #30363d)',
    borderRadius: 12,
    padding: '28px 28px 20px',
    maxWidth: 480,
    width: '90%',
    textAlign: 'center',
    fontFamily: "'DM Sans', sans-serif",
    position: 'relative',
  },
  mobileSheet: {
    background: 'var(--bg-card, #161b22)',
    border: '1px solid var(--border, #30363d)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: '24px 20px 32px',
    width: '100%',
    maxWidth: '100%',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: "'DM Sans', sans-serif",
  },
  stepLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.55rem',
    color: 'var(--text-muted, #8b949e)',
    letterSpacing: '0.12em',
    marginBottom: 12,
  },
  iconRow: {
    fontSize: '1.4rem',
    letterSpacing: '0.5rem',
    marginBottom: 16,
  },
  tiersRow: {
    display: 'flex',
    gap: 8,
    margin: '8px 0 16px',
  },
  title: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '1.4rem',
    fontWeight: 700,
    color: 'var(--text-primary, #e6edf3)',
    margin: '0 0 10px',
  },
  body: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary, #8b949e)',
    lineHeight: 1.5,
    margin: '0 0 20px',
  },
  footer: {
    display: 'flex',
    gap: 10,
    justifyContent: 'center',
  },
  primary: {
    background: '#1f6feb',
    color: '#fff',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.78rem',
    fontWeight: 600,
    padding: '8px 18px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
  },
  secondary: {
    background: 'transparent',
    color: 'var(--text-secondary, #8b949e)',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.78rem',
    fontWeight: 500,
    padding: '8px 14px',
    borderRadius: 6,
    border: '1px solid var(--border, #30363d)',
    cursor: 'pointer',
  },
  skip: {
    position: 'absolute',
    top: 8,
    right: 12,
    background: 'transparent',
    color: 'var(--text-muted, #8b949e)',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.65rem',
    fontWeight: 500,
    padding: '4px 8px',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
};
