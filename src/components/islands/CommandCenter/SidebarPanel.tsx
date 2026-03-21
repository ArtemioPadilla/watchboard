import { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import type { CSSProperties } from 'react';
import {
  type TrackerCardData,
  DOMAIN_COLORS,
  filterTrackers,
  groupTrackers,
  computeFreshness,
  buildDateline,
  computeDomainCounts,
  getVisibleDomains,
} from '../../../lib/tracker-directory-utils';

interface Props {
  trackers: TrackerCardData[];
  basePath: string;
  activeTracker: string | null;
  hoveredTracker: string | null;
  liveCount: number;
  historicalCount: number;
  onSelectTracker: (slug: string | null) => void;
  onHoverTracker: (slug: string | null) => void;
}

// ── TrackerRow ──

const TrackerRow = memo(function TrackerRow({
  tracker,
  basePath,
  isActive,
  isHovered,
  onSelect,
  onHover,
}: {
  tracker: TrackerCardData;
  basePath: string;
  isActive: boolean;
  isHovered: boolean;
  onSelect: (slug: string | null) => void;
  onHover: (slug: string | null) => void;
}) {
  const color = tracker.color || '#3498db';
  const dateline = buildDateline(tracker);
  const freshness = computeFreshness(tracker.lastUpdated);
  const href = `${basePath}${tracker.slug}/`;
  const rowRef = useRef<HTMLDivElement>(null);

  // Auto-scroll into view when selected from globe
  useEffect(() => {
    if (isActive && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isActive]);

  const truncatedHeadline = tracker.headline
    ? tracker.headline.length > 120
      ? tracker.headline.slice(0, 120) + '…'
      : tracker.headline
    : null;

  if (isActive) {
    return (
      <div
        ref={rowRef}
        style={{
          ...S.expandedRow,
          borderColor: `${color}50`,
          borderTopColor: color,
          background: `${color}0a`,
        }}
        onMouseEnter={() => onHover(tracker.slug)}
        onMouseLeave={() => onHover(null)}
      >
        <div style={S.expandedTop}>
          <div style={S.expandedIdent}>
            <span style={S.icon}>{tracker.icon || ''}</span>
            <div>
              <div style={S.expandedName}>{tracker.shortName}</div>
              <div style={{ ...S.expandedDateline, color }}>{dateline} · {tracker.region || ''}</div>
            </div>
          </div>
          <StatusBadge tracker={tracker} />
        </div>

        {truncatedHeadline && (
          <div style={{ ...S.headline, borderLeftColor: `${color}50` }}>
            <span style={{ color, fontWeight: 700, flexShrink: 0 }}>›</span>
            <span>{truncatedHeadline}</span>
          </div>
        )}

        {tracker.topKpis.length > 0 && (
          <div style={S.kpiRow}>
            {tracker.topKpis.map((k, i) => (
              <div key={i} style={S.kpiChip}>
                <span style={S.kpiValue}>{k.value}</span>
                <span style={S.kpiLabel}>{k.label}</span>
              </div>
            ))}
          </div>
        )}

        <div style={S.expandedActions}>
          <span
            style={S.deselectBtn}
            onClick={e => { e.stopPropagation(); onSelect(null); }}
          >
            ✕ DESELECT
          </span>
          <a
            href={href}
            style={S.openLink}
            onClick={e => e.stopPropagation()}
          >
            OPEN DASHBOARD →
          </a>
        </div>
      </div>
    );
  }

  // Collapsed row
  return (
    <div
      ref={rowRef}
      style={{
        ...S.collapsedRow,
        borderLeftColor: color,
        background: isHovered ? `${color}08` : 'transparent',
      }}
      onClick={() => onSelect(tracker.slug)}
      onMouseEnter={() => onHover(tracker.slug)}
      onMouseLeave={() => onHover(null)}
      onDoubleClick={() => { window.location.href = href; }}
    >
      <div style={S.collapsedLeft}>
        <span style={S.icon}>{tracker.icon || ''}</span>
        <span style={S.collapsedName}>{tracker.shortName}</span>
      </div>
      <div style={S.collapsedRight}>
        {freshness.className === 'fresh' && <span style={S.freshDot} />}
        <span style={{ ...S.collapsedStatus, color: freshness.className === 'fresh' ? 'var(--accent-green)' : freshness.className === 'recent' ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
          {freshness.label}
        </span>
        <span style={S.collapsedDay}>{dateline}</span>
      </div>
    </div>
  );
});

// ── StatusBadge ──

const StatusBadge = memo(function StatusBadge({ tracker }: { tracker: TrackerCardData }) {
  if (tracker.status === 'archived') {
    return <span style={S.badge('stale')}>ARCHIVED</span>;
  }
  if (tracker.temporal === 'historical') {
    return <span style={S.badge('stale')}>HISTORICAL</span>;
  }
  const { label, className } = computeFreshness(tracker.lastUpdated);
  return (
    <span style={S.badge(className)}>
      {className === 'fresh' && <span style={S.freshDot} />}
      {label}
    </span>
  );
});

// ── Main SidebarPanel ──

export default function SidebarPanel({
  trackers,
  basePath,
  activeTracker,
  hoveredTracker,
  liveCount,
  historicalCount,
  onSelectTracker,
  onHoverTracker,
}: Props) {
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(
    () => filterTrackers(trackers, activeDomain, searchQuery),
    [trackers, activeDomain, searchQuery],
  );

  const groups = useMemo(() => groupTrackers(filtered), [filtered]);
  const domainCounts = useMemo(() => computeDomainCounts(trackers), [trackers]);
  const visibleDomains = useMemo(() => getVisibleDomains(domainCounts), [domainCounts]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onSelectTracker(null);
  }, [onSelectTracker]);

  return (
    <div style={S.sidebar} onKeyDown={handleKeyDown} tabIndex={-1}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <span style={S.brand}>WATCHBOARD</span>
          <span style={S.classification}>OSINT</span>
        </div>
        <div style={S.headerRight}>
          <span style={S.liveIndicator}>● {liveCount} LIVE</span>
          <span style={S.histCount}>{historicalCount} HIST</span>
        </div>
      </div>

      {/* Search */}
      <div style={S.searchWrap}>
        <span style={S.searchIcon}>&gt;_</span>
        <input
          type="text"
          placeholder="Search trackers..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={S.searchInput}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = ''; }}
          aria-label="Search trackers"
        />
      </div>

      {/* Domain tabs */}
      <div style={S.tabs}>
        <button
          type="button"
          style={S.tab(!activeDomain)}
          onClick={() => setActiveDomain(null)}
        >
          ALL <span style={S.tabCount}>{trackers.length}</span>
        </button>
        {visibleDomains.map(d => (
          <button
            key={d}
            type="button"
            style={S.tab(activeDomain === d, DOMAIN_COLORS[d])}
            onClick={() => setActiveDomain(activeDomain === d ? null : d)}
          >
            {d.toUpperCase()} <span style={S.tabCount}>{domainCounts[d]}</span>
          </button>
        ))}
      </div>

      {/* Tracker list */}
      <div style={S.list}>
        {filtered.length === 0 ? (
          <div style={S.noResults}>No trackers match your search.</div>
        ) : (
          groups.map(group => (
            <div key={`${group.type}-${group.label}`}>
              <div style={S.groupHeader(group.type)}>
                {group.labelIcon && <span style={S.groupIcon(group.type)}>{group.labelIcon}</span>}
                <span>{group.label.toUpperCase()}</span>
              </div>
              {group.trackers.map(t => (
                <TrackerRow
                  key={t.slug}
                  tracker={t}
                  basePath={basePath}
                  isActive={activeTracker === t.slug}
                  isHovered={hoveredTracker === t.slug}
                  onSelect={onSelectTracker}
                  onHover={onHoverTracker}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div style={S.footer}>
        <span>Watchboard v1.0 · MIT</span>
        <a href="https://github.com/ArtemioPadilla/watchboard" target="_blank" rel="noopener noreferrer" style={S.footerLink}>GitHub</a>
      </div>
    </div>
  );
}

// ── Styles ──

const S = {
  sidebar: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  } as CSSProperties,

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'rgba(22,27,34,0.5)',
    flexShrink: 0,
  } as CSSProperties,

  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as CSSProperties,

  brand: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.72rem',
    fontWeight: 700,
    color: 'var(--accent-blue)',
    letterSpacing: '0.08em',
  } as CSSProperties,

  classification: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.5rem',
    color: 'var(--accent-green)',
    background: 'rgba(46,204,113,0.08)',
    padding: '1px 6px',
    borderRadius: 3,
    border: '1px solid rgba(46,204,113,0.15)',
    letterSpacing: '0.08em',
  } as CSSProperties,

  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.56rem',
  } as CSSProperties,

  liveIndicator: {
    color: 'var(--accent-green)',
  } as CSSProperties,

  histCount: {
    color: 'var(--text-muted)',
  } as CSSProperties,

  searchWrap: {
    position: 'relative' as const,
    padding: '8px 12px',
    flexShrink: 0,
  } as CSSProperties,

  searchIcon: {
    position: 'absolute' as const,
    left: 22,
    top: '50%',
    transform: 'translateY(-50%)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.65rem',
    color: 'var(--accent-blue)',
    opacity: 0.7,
    pointerEvents: 'none' as const,
  } as CSSProperties,

  searchInput: {
    width: '100%',
    padding: '6px 10px 6px 30px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    color: 'var(--text-primary)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.65rem',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
  } as CSSProperties,

  tabs: {
    display: 'flex',
    gap: '3px',
    flexWrap: 'wrap' as const,
    padding: '0 12px 8px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  } as CSSProperties,

  tab: (active: boolean, color?: string): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 6px',
    borderRadius: 3,
    border: `1px solid ${active ? (color || 'var(--accent-blue)') : 'var(--border)'}`,
    background: active ? `${color || 'var(--accent-blue)'}18` : 'transparent',
    color: active ? (color || 'var(--accent-blue)') : 'var(--text-muted)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.5rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  }),

  tabCount: {
    fontWeight: 400,
    opacity: 0.7,
  } as CSSProperties,

  list: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '4px 0',
    scrollbarWidth: 'thin' as const,
    scrollbarColor: 'var(--border) transparent',
  } as CSSProperties,

  groupHeader: (type: string): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px 4px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.52rem',
    fontWeight: 600,
    letterSpacing: '0.12em',
    color: type === 'live' ? 'var(--accent-green)' : type === 'historical' ? 'var(--accent-amber)' : 'var(--text-muted)',
    marginTop: type === 'live' ? 0 : 8,
  }),

  groupIcon: (type: string): CSSProperties => ({
    fontSize: '0.6rem',
    color: type === 'live' ? 'var(--accent-green)' : type === 'historical' ? 'var(--accent-amber)' : 'var(--text-muted)',
  }),

  // Collapsed row
  collapsedRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 12px',
    borderLeft: '2px solid transparent',
    cursor: 'pointer',
    transition: 'background 0.15s',
    userSelect: 'none' as const,
  } as CSSProperties,

  collapsedLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
  } as CSSProperties,

  icon: {
    fontSize: '0.9rem',
    lineHeight: 1,
    flexShrink: 0,
  } as CSSProperties,

  collapsedName: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.78rem',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as CSSProperties,

  collapsedRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  } as CSSProperties,

  collapsedStatus: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.48rem',
    fontWeight: 600,
    letterSpacing: '0.06em',
  } as CSSProperties,

  collapsedDay: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.52rem',
    color: 'var(--text-muted)',
    opacity: 0.7,
  } as CSSProperties,

  freshDot: {
    width: 4,
    height: 4,
    background: 'var(--accent-green)',
    borderRadius: '50%',
    flexShrink: 0,
    boxShadow: '0 0 4px rgba(46,204,113,0.5)',
    animation: 'pulse 2s ease-in-out infinite',
  } as CSSProperties,

  // Expanded row
  expandedRow: {
    margin: '2px 8px',
    padding: '10px',
    border: '1px solid',
    borderTop: '2px solid',
    borderRadius: 6,
    transition: 'all 0.2s',
  } as CSSProperties,

  expandedTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  } as CSSProperties,

  expandedIdent: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as CSSProperties,

  expandedName: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.85rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    lineHeight: 1.2,
  } as CSSProperties,

  expandedDateline: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.5rem',
    fontWeight: 500,
    letterSpacing: '0.08em',
    marginTop: 2,
  } as CSSProperties,

  headline: {
    display: 'flex',
    gap: '6px',
    padding: '6px 8px',
    borderLeft: '2px solid',
    borderRadius: '0 4px 4px 0',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.72rem',
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
    marginTop: 8,
  } as CSSProperties,

  kpiRow: {
    display: 'flex',
    gap: '5px',
    marginTop: 8,
  } as CSSProperties,

  kpiChip: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 1,
    padding: '3px 6px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 4,
  } as CSSProperties,

  kpiValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.68rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap' as const,
  } as CSSProperties,

  kpiLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.42rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap' as const,
  } as CSSProperties,

  expandedActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 6,
    borderTop: '1px solid var(--border)',
  } as CSSProperties,

  deselectBtn: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.52rem',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    opacity: 0.6,
    transition: 'opacity 0.2s',
    letterSpacing: '0.04em',
  } as CSSProperties,

  openLink: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.58rem',
    color: 'var(--accent-blue)',
    textDecoration: 'none',
    fontWeight: 600,
    letterSpacing: '0.04em',
  } as CSSProperties,

  badge: (className: string): CSSProperties => {
    const colors: Record<string, { bg: string; fg: string; border: string }> = {
      fresh: { bg: 'rgba(46,204,113,0.1)', fg: 'var(--accent-green)', border: 'rgba(46,204,113,0.25)' },
      recent: { bg: 'rgba(243,156,18,0.1)', fg: 'var(--accent-amber)', border: 'rgba(243,156,18,0.25)' },
      stale: { bg: 'rgba(148,152,168,0.1)', fg: 'var(--text-muted)', border: 'var(--border)' },
    };
    const c = colors[className] || colors.stale;
    return {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '0.48rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      padding: '2px 6px',
      borderRadius: 3,
      whiteSpace: 'nowrap',
      background: c.bg,
      color: c.fg,
      border: `1px solid ${c.border}`,
    };
  },

  noResults: {
    textAlign: 'center' as const,
    padding: '2rem 1rem',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.65rem',
    color: 'var(--text-muted)',
    opacity: 0.6,
  } as CSSProperties,

  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 12px',
    borderTop: '1px solid var(--border)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.52rem',
    color: 'var(--text-muted)',
    opacity: 0.5,
    flexShrink: 0,
  } as CSSProperties,

  footerLink: {
    color: 'var(--accent-blue)',
    textDecoration: 'none',
  } as CSSProperties,
};
