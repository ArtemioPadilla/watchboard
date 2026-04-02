import { useState } from 'react';

interface WelcomeOverlayProps {
  onDismiss: (permanent: boolean) => void;
}

export default function WelcomeOverlay({ onDismiss }: WelcomeOverlayProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  return (
    <div style={styles.backdrop} onClick={() => onDismiss(dontShowAgain)}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.icon}>🌐</div>
        <h2 style={styles.heading}>Welcome to Watchboard</h2>
        <p style={styles.description}>
          Real-time intelligence dashboards tracking world events.
          The globe rotates through active stories — click any tracker in the sidebar to explore.
        </p>

        <div style={styles.shortcuts}>
          <ShortcutHint keyLabel="B" description="Pause broadcast" />
          <ShortcutHint keyLabel="/" description="Search" />
          <ShortcutHint keyLabel="?" description="All shortcuts" />
        </div>

        <div style={styles.footer}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              style={styles.checkbox}
            />
            Don't show again
          </label>
          <button style={styles.button} onClick={() => onDismiss(dontShowAgain)}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function ShortcutHint({ keyLabel, description }: { keyLabel: string; description: string }) {
  return (
    <div style={styles.shortcutItem}>
      <kbd style={styles.kbd}>{keyLabel}</kbd>
      <span style={styles.shortcutText}>{description}</span>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    backdropFilter: 'blur(4px)',
    animation: 'fadeIn 0.3s ease-out',
  } as React.CSSProperties,
  panel: {
    background: 'var(--bg-card, #161b22)',
    border: '1px solid var(--border, #30363d)',
    borderRadius: 12,
    padding: '28px 24px',
    maxWidth: 380,
    width: '90%',
    textAlign: 'center' as const,
    animation: 'scaleIn 0.3s ease-out',
  } as React.CSSProperties,
  icon: {
    fontSize: 28,
    marginBottom: 8,
  } as React.CSSProperties,
  heading: {
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: '1.2rem',
    fontWeight: 700,
    color: 'var(--text-primary, #e6edf3)',
    margin: '0 0 6px',
  } as React.CSSProperties,
  description: {
    fontSize: '0.75rem',
    color: 'var(--text-secondary, #8b949e)',
    lineHeight: 1.5,
    marginBottom: 16,
  } as React.CSSProperties,
  shortcuts: {
    display: 'flex',
    gap: 8,
    justifyContent: 'center',
    flexWrap: 'wrap' as const,
    marginBottom: 16,
  } as React.CSSProperties,
  shortcutItem: {
    background: 'var(--bg-secondary, #0d1117)',
    border: '1px solid var(--border, #30363d)',
    borderRadius: 6,
    padding: '6px 10px',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  } as React.CSSProperties,
  kbd: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.55rem',
    background: 'var(--bg-primary, #0a0b0e)',
    border: '1px solid var(--border, #30363d)',
    borderRadius: 3,
    padding: '1px 5px',
    color: 'var(--text-primary, #e6edf3)',
  } as React.CSSProperties,
  shortcutText: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.6rem',
    color: 'var(--text-secondary, #8b949e)',
  } as React.CSSProperties,
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTop: '1px solid var(--border, #30363d)',
    paddingTop: 12,
  } as React.CSSProperties,
  checkboxLabel: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.6rem',
    color: 'var(--text-muted, #484f58)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  } as React.CSSProperties,
  checkbox: {
    width: 14,
    height: 14,
    accentColor: 'var(--accent-blue, #58a6ff)',
  } as React.CSSProperties,
  button: {
    background: '#1f6feb',
    color: '#fff',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '6px 16px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,
};
