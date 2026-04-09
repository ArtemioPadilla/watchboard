import { useRef, useEffect, type ReactNode } from 'react';
import { useCollapsible } from './useCollapsible';

interface Props {
  id: string;
  icon: string;
  label: string;
  defaultExpanded: boolean;
  children: ReactNode;
}

/* ── Inline styles ── */

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'rgba(10,11,14,0.9)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: '3px 10px',
  cursor: 'pointer',
  color: 'rgba(255,255,255,0.6)',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '0.6rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  transition: 'background 0.2s',
  whiteSpace: 'nowrap' as const,
  userSelect: 'none' as const,
};

const pillIconStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  lineHeight: 1,
};

const pillChevronStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  opacity: 0.5,
};

const wrapperStyle: React.CSSProperties = {
  position: 'relative',
};

const collapseToggleStyle: React.CSSProperties = {
  position: 'absolute',
  top: 4,
  right: 4,
  zIndex: 10,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'rgba(255,255,255,0.3)',
  fontSize: '0.85rem',
  lineHeight: 1,
  padding: '2px 4px',
  borderRadius: 4,
  transition: 'color 0.15s',
};

const contentWrapperStyle = (isExpanded: boolean): React.CSSProperties => ({
  overflow: 'hidden',
  transition: 'max-height 0.3s ease, opacity 0.25s ease',
  maxHeight: isExpanded ? 'var(--panel-height, 2000px)' : '0px',
  opacity: isExpanded ? 1 : 0,
});

export default function CollapsiblePanel({ id, icon, label, defaultExpanded, children }: Props) {
  const [isExpanded, toggle] = useCollapsible(id, defaultExpanded);
  const contentRef = useRef<HTMLDivElement>(null);
  const measuredRef = useRef<number>(2000);

  // Measure actual content height for smooth max-height animation
  useEffect(() => {
    if (isExpanded && contentRef.current) {
      const h = contentRef.current.scrollHeight;
      if (h > 0) measuredRef.current = h;
    }
  }, [isExpanded, children]);

  if (!isExpanded) {
    return (
      <div
        style={pillStyle}
        onClick={toggle}
        role="button"
        tabIndex={0}
        aria-expanded={false}
        aria-label={`Expand ${label} panel`}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(10,11,14,0.9)'; }}
      >
        <span style={pillIconStyle}>{icon}</span>
        <span>{label}</span>
        <span style={pillChevronStyle}>{'\u25B8'}</span>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <button
        style={collapseToggleStyle}
        onClick={toggle}
        aria-expanded={true}
        aria-label={`Collapse ${label} panel`}
        title={`Collapse ${label}`}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'; }}
      >
        {'\u25BE'}
      </button>
      <div
        ref={contentRef}
        style={{
          ...contentWrapperStyle(true),
          maxHeight: measuredRef.current + 'px',
        }}
      >
        {children}
      </div>
    </div>
  );
}
