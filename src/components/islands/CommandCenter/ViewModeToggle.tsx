import { memo } from 'react';
import type { CSSProperties } from 'react';

export type ViewMode = 'operations' | 'geographic' | 'domain';

interface Props {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const MODES: { id: ViewMode; label: string; icon: string }[] = [
  { id: 'operations', label: 'OPS', icon: '◉' },
  { id: 'geographic', label: 'GEO', icon: '🌍' },
  { id: 'domain', label: 'DOMAIN', icon: '◫' },
];

export default memo(function ViewModeToggle({ mode, onChange }: Props) {
  return (
    <div style={S.wrap}>
      {MODES.map(m => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          style={{
            ...S.pill,
            ...(mode === m.id ? S.pillActive : {}),
          }}
        >
          <span style={S.pillIcon}>{m.icon}</span>
          <span>{m.label}</span>
        </button>
      ))}
    </div>
  );
});

const S = {
  wrap: {
    display: 'flex',
    gap: '2px',
    padding: '4px',
    background: 'var(--bg-card, #161b22)',
    borderRadius: '6px',
    margin: '0 8px 6px',
  } as CSSProperties,
  pill: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    border: 'none',
    borderRadius: '4px',
    background: 'transparent',
    color: 'var(--text-muted, #8b949e)',
    fontSize: '0.6rem',
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 600,
    letterSpacing: '0.5px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    flex: 1,
    justifyContent: 'center',
  } as CSSProperties,
  pillActive: {
    background: 'rgba(31,111,235,0.15)',
    color: 'var(--accent-blue, #58a6ff)',
    border: '1px solid rgba(31,111,235,0.3)',
  } as CSSProperties,
  pillIcon: {
    fontSize: '0.7rem',
  } as CSSProperties,
};
