import type { CoachHint } from '../../../lib/onboarding';

interface CoachMarkProps {
  hint: CoachHint;
  onDismiss: () => void;
}

export default function CoachMark({ hint, onDismiss }: CoachMarkProps) {
  // Position based on anchor type
  const positionStyle = getPositionStyle(hint.anchor);

  return (
    <div style={{ ...styles.container, ...positionStyle }}>
      <div style={styles.content}>
        <span style={styles.icon}>💡</span>
        <span style={styles.text}>{hint.text}</span>
        <button style={styles.close} onClick={onDismiss} aria-label="Dismiss hint">×</button>
      </div>
    </div>
  );
}

function getPositionStyle(anchor: CoachHint['anchor']): React.CSSProperties {
  switch (anchor) {
    case 'ticker':
      return { position: 'absolute', bottom: 44, left: 12, zIndex: 30 };
    case 'search':
      return { position: 'absolute', top: 60, right: 12, zIndex: 30 };
    case 'sidebar':
      return { position: 'absolute', top: 120, right: 12, zIndex: 30 };
    case 'globe':
      return { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 30 };
    case 'card':
      return { position: 'absolute', bottom: 100, left: 12, zIndex: 30 };
    default:
      return { position: 'absolute', bottom: 50, left: 12, zIndex: 30 };
  }
}

const styles = {
  container: {
    animation: 'fadeIn 0.4s ease-out',
    pointerEvents: 'auto' as const,
  } as React.CSSProperties,
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgba(31, 111, 235, 0.08)',
    border: '1px solid rgba(31, 111, 235, 0.25)',
    borderRadius: 8,
    padding: '8px 12px',
    maxWidth: 280,
  } as React.CSSProperties,
  icon: {
    fontSize: '0.75rem',
    flexShrink: 0,
  } as React.CSSProperties,
  text: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.6rem',
    color: 'var(--accent-blue, #58a6ff)',
    lineHeight: 1.4,
  } as React.CSSProperties,
  close: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted, #484f58)',
    fontSize: '0.85rem',
    cursor: 'pointer',
    padding: '0 2px',
    lineHeight: 1,
    flexShrink: 0,
  } as React.CSSProperties,
};
