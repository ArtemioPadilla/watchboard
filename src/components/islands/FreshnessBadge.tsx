import { useEffect, useState } from 'react';

interface Props {
  /** ISO 8601 timestamp from `meta.lastUpdated`. May be undefined for trackers
   *  whose data has never been updated. */
  lastUpdated?: string;
  /**
   * Hours after which the badge flips to amber + "may be outdated" copy.
   * Default 30h matches the spec — one missed nightly cycle.
   */
  staleHours?: number;
  /**
   * Hours under which the badge renders in green. Default 12h. The neutral
   * state (between fresh and stale) is muted gray.
   */
  freshHours?: number;
  /** Optional className passed through to the root span. */
  className?: string;
}

type Tier = 'fresh' | 'neutral' | 'stale' | 'unknown';

function classify(diffMs: number, freshMs: number, staleMs: number): Tier {
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'unknown';
  if (diffMs <= freshMs) return 'fresh';
  if (diffMs >= staleMs) return 'stale';
  return 'neutral';
}

function formatAgo(diffMs: number): string {
  const min = Math.floor(diffMs / 60_000);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `${h}h ago`;
  if (h < 48)   return 'yesterday';
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const COLORS: Record<Tier, { color: string; bg: string; border: string; dot: string }> = {
  fresh:   { color: 'var(--accent-green, #2ecc71)', bg: 'rgba(46,204,113,0.10)',  border: 'rgba(46,204,113,0.35)',  dot: 'var(--accent-green, #2ecc71)' },
  neutral: { color: 'var(--text-muted,    #8b949e)', bg: 'rgba(139,148,158,0.10)', border: 'rgba(139,148,158,0.30)', dot: 'var(--text-muted, #8b949e)' },
  stale:   { color: 'var(--accent-amber,  #f39c12)', bg: 'rgba(243,156,18,0.10)',  border: 'rgba(243,156,18,0.40)',  dot: 'var(--accent-amber, #f39c12)' },
  unknown: { color: 'var(--text-muted,    #8b949e)', bg: 'transparent',            border: 'rgba(139,148,158,0.30)', dot: 'var(--text-muted, #8b949e)' },
};

export default function FreshnessBadge({
  lastUpdated,
  staleHours = 30,
  freshHours = 12,
  className,
}: Props) {
  // Render the static timestamp (or "—") on first mount so the SSR HTML and the
  // first client render are identical (avoids React #418). The relative form
  // takes over after hydration.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setTick((n) => n + 1);
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // SSR / first render: render the date as a stable static string.
  if (tick === 0) {
    if (!lastUpdated) {
      return (
        <span className={className} style={{ ...baseStyle, ...stylesFor(COLORS.unknown) }} role="status" aria-live="polite">
          <span style={dotStyle(COLORS.unknown.dot)} aria-hidden="true" />
          Last update unknown
        </span>
      );
    }
    return (
      <span className={className} style={{ ...baseStyle, ...stylesFor(COLORS.neutral) }} role="status" aria-live="polite" suppressHydrationWarning>
        <span style={dotStyle(COLORS.neutral.dot)} aria-hidden="true" />
        Updated {lastUpdated.slice(0, 10)}
      </span>
    );
  }

  if (!lastUpdated) {
    return (
      <span className={className} style={{ ...baseStyle, ...stylesFor(COLORS.unknown) }} role="status" aria-live="polite">
        <span style={dotStyle(COLORS.unknown.dot)} aria-hidden="true" />
        Last update unknown
      </span>
    );
  }

  const ts = Date.parse(lastUpdated);
  if (!Number.isFinite(ts)) {
    return (
      <span className={className} style={{ ...baseStyle, ...stylesFor(COLORS.unknown) }} role="status" aria-live="polite">
        <span style={dotStyle(COLORS.unknown.dot)} aria-hidden="true" />
        Last update unknown
      </span>
    );
  }

  const diffMs = Date.now() - ts;
  const freshMs = freshHours * 3_600_000;
  const staleMs = staleHours * 3_600_000;
  const tier = classify(diffMs, freshMs, staleMs);
  const colors = COLORS[tier];

  // Stale headline gets an explicit "may be outdated" so color isn't the
  // sole signal (a11y).
  const label = tier === 'stale'
    ? `Updated ${formatAgo(diffMs)} — may be outdated`
    : `Updated ${formatAgo(diffMs)}`;

  return (
    <span
      className={className}
      style={{ ...baseStyle, ...stylesFor(colors) }}
      role="status"
      aria-live="polite"
      title={lastUpdated}
    >
      <span style={dotStyle(colors.dot)} aria-hidden="true" />
      {label}
    </span>
  );
}

const baseStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 8px',
  borderRadius: 999,
  border: '1px solid',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '0.6rem',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
};

function stylesFor(c: { color: string; bg: string; border: string }): React.CSSProperties {
  return { color: c.color, background: c.bg, borderColor: c.border };
}

function dotStyle(color: string): React.CSSProperties {
  return {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: color,
    flex: '0 0 auto',
  };
}
