import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SpotlightStepProps {
  anchor: string;
  title: string;
  body: string;
  stepLabel: string;          // e.g. "2 / 6"
  isFirst: boolean;
  backLabel: string;
  nextLabel: string;
  skipLabel: string;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

const PADDING = 8;
const TOOLTIP_W = 320;
const TOOLTIP_GAP = 16;

export default function SpotlightStep({
  anchor,
  title,
  body,
  stepLabel,
  isFirst,
  backLabel,
  nextLabel,
  skipLabel,
  onBack,
  onNext,
  onSkip,
}: SpotlightStepProps) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const loggedMissing = useRef(false);

  const measure = useCallback(() => {
    const el = document.querySelector(anchor) as HTMLElement | null;
    if (!el) {
      if (!loggedMissing.current) {
        console.warn(`[OnboardingTour] anchor not found: ${anchor} — falling back to centered modal.`);
        loggedMissing.current = true;
      }
      setMissing(true);
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setMissing(false);
    setRect({
      x: r.x - PADDING,
      y: r.y - PADDING,
      w: r.width + PADDING * 2,
      h: r.height + PADDING * 2,
    });
  }, [anchor]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, { passive: true });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onResize);
      ro.observe(document.body);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize);
      ro?.disconnect();
    };
  }, [measure]);

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

  // Focus the next button when step appears
  useEffect(() => {
    const btn = tooltipRef.current?.querySelector<HTMLButtonElement>('button[data-tour-next]');
    btn?.focus();
  }, [anchor]);

  const tooltipPos = computeTooltipPosition(rect);

  return createPortal(
    <div role="dialog" aria-labelledby="watchboard-tour-title" style={styles.root}>
      <svg style={styles.svg} aria-hidden="true">
        <defs>
          <mask id="watchboard-tour-spotlight">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && !missing && (
              <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={8} fill="black" />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.65)"
          mask="url(#watchboard-tour-spotlight)"
        />
      </svg>

      <div ref={tooltipRef} style={{ ...styles.tooltip, ...tooltipPos }}>
        <div style={styles.stepLabel}>{stepLabel}</div>
        <div id="watchboard-tour-title" style={styles.title}>{title}</div>
        <div style={styles.body}>{body}</div>
        <div style={styles.footer}>
          <button type="button" onClick={onSkip} style={styles.skip}>
            {skipLabel}
          </button>
          <div style={styles.navButtons}>
            {!isFirst && (
              <button type="button" onClick={onBack} style={styles.secondary}>
                {backLabel}
              </button>
            )}
            <button type="button" data-tour-next onClick={onNext} style={styles.primary}>
              {nextLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function computeTooltipPosition(rect: Rect | null): React.CSSProperties {
  if (!rect) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipH = 200; // budget; auto-flip uses this to decide above vs below
  const preferBelow = rect.y + rect.h + TOOLTIP_GAP + tooltipH < vh - 16;
  const top = preferBelow
    ? rect.y + rect.h + TOOLTIP_GAP
    : Math.max(16, rect.y - tooltipH - TOOLTIP_GAP);
  const centerX = rect.x + rect.w / 2 - TOOLTIP_W / 2;
  const left = Math.max(16, Math.min(vw - TOOLTIP_W - 16, centerX));
  return { top, left, width: TOOLTIP_W };
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed',
    inset: 0,
    zIndex: 300,
    pointerEvents: 'none',
  },
  svg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
  tooltip: {
    position: 'fixed',
    background: 'var(--bg-card, #161b22)',
    border: '1px solid var(--border, #30363d)',
    borderRadius: 10,
    padding: '14px 16px',
    pointerEvents: 'auto',
    boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
    fontFamily: "'DM Sans', sans-serif",
  },
  stepLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.55rem',
    color: 'var(--text-muted, #8b949e)',
    letterSpacing: '0.1em',
    marginBottom: 6,
  },
  title: {
    fontSize: '0.95rem',
    fontWeight: 700,
    color: 'var(--text-primary, #e6edf3)',
    marginBottom: 6,
  },
  body: {
    fontSize: '0.78rem',
    color: 'var(--text-secondary, #8b949e)',
    lineHeight: 1.45,
    marginBottom: 12,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  navButtons: {
    display: 'flex',
    gap: 6,
  },
  primary: {
    background: '#1f6feb',
    color: '#fff',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.72rem',
    fontWeight: 600,
    padding: '6px 14px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
  },
  secondary: {
    background: 'transparent',
    color: 'var(--text-secondary, #8b949e)',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.72rem',
    fontWeight: 500,
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid var(--border, #30363d)',
    cursor: 'pointer',
  },
  skip: {
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
