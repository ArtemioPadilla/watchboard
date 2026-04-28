// src/components/islands/shared/IslandErrorFallback.tsx
// Tasteful dark card shown when a heavy island throws.
// Pure presentational — no React state, safe to render inside any boundary.
import type { CSSProperties } from 'react';

interface Props {
  feature: string;
  /** Optional override for the section/container element. Defaults to <div>. */
  as?: 'div' | 'section';
  /** Extra style merged onto the card root (e.g. flex sizing for full-bleed islands). */
  style?: CSSProperties;
}

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  minHeight: 220,
  padding: '32px 24px',
  margin: '16px auto',
  maxWidth: 480,
  background: 'var(--bg-card, #161821)',
  border: '1px solid var(--border-subtle, #2a2d3a)',
  borderRadius: 8,
  color: 'var(--text-primary, #e8e9ed)',
  fontFamily: "'JetBrains Mono', monospace",
  textAlign: 'center',
};

const titleStyle: CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: 'var(--accent-amber, #f39c12)',
  margin: 0,
};

const bodyStyle: CSSProperties = {
  fontSize: '0.8rem',
  lineHeight: 1.5,
  color: 'var(--text-muted, #8b949e)',
  margin: 0,
  maxWidth: 360,
};

const buttonStyle: CSSProperties = {
  marginTop: 4,
  padding: '8px 16px',
  border: '1px solid var(--border-strong, #3a3d4a)',
  borderRadius: 4,
  background: 'transparent',
  color: 'var(--text-primary, #e8e9ed)',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '0.75rem',
  fontWeight: 600,
  letterSpacing: '0.05em',
  cursor: 'pointer',
};

function reload() {
  if (typeof window !== 'undefined') window.location.reload();
}

export function IslandErrorFallback({ feature, as = 'div', style }: Props) {
  const Tag = as;
  return (
    <Tag style={{ ...cardStyle, ...style }} role="alert" aria-live="polite">
      <p style={titleStyle}>! Component crashed</p>
      <p style={bodyStyle}>
        Something went wrong loading {feature}. Reload to retry.
      </p>
      <button type="button" onClick={reload} style={buttonStyle}>
        Reload
      </button>
    </Tag>
  );
}
