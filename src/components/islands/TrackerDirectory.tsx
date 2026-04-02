import { useState, useMemo, useCallback, memo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  type TrackerCardData,
  type TrackerGroup,
  DOMAIN_COLORS,
  DOMAIN_ORDER,
  filterTrackers,
  groupTrackers,
  computeFreshness,
  buildDateline,
  computeDomainCounts,
  getVisibleDomains,
} from '../../lib/tracker-directory-utils';

interface Props {
  trackers: TrackerCardData[];
  basePath: string;
}

// ── Styles (inline, using CSS custom properties) ──

const S = {
  container: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '0 1.5rem',
  } as CSSProperties,

  searchWrap: {
    position: 'relative',
    marginBottom: '1rem',
  } as CSSProperties,

  searchIcon: {
    position: 'absolute',
    left: 12,
    top: '50%',
    transform: 'translateY(-50%)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.72rem',
    color: 'var(--text-muted)',
    opacity: 0.5,
    pointerEvents: 'none',
  } as CSSProperties,

  searchInput: {
    width: '100%',
    padding: '0.6rem 0.75rem 0.6rem 2rem',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.72rem',
    letterSpacing: '0.04em',
    outline: 'none',
    transition: 'border-color 0.2s',
  } as CSSProperties,

  tabsWrap: {
    display: 'flex',
    gap: '0.35rem',
    flexWrap: 'wrap' as const,
    marginBottom: '1.5rem',
    paddingBottom: '0.75rem',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,

  tab: (active: boolean, color?: string): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.3rem 0.6rem',
    borderRadius: 4,
    border: `1px solid ${active ? (color || 'var(--accent-blue)') : 'var(--border)'}`,
    background: active ? `${color || 'var(--accent-blue)'}18` : 'transparent',
    color: active ? (color || 'var(--accent-blue)') : 'var(--text-muted)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.56rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap' as const,
  }),

  tabCount: {
    fontWeight: 400,
    opacity: 0.7,
    fontSize: '0.52rem',
  } as CSSProperties,

  groupHeader: (type: string): CSSProperties => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: '1rem',
    paddingBottom: '0.5rem',
    borderBottom: '1px solid var(--border)',
    marginTop: type === 'live' ? 0 : '2rem',
  }),

  groupLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.68rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.12em',
    color: 'var(--text-muted)',
    margin: 0,
  } as CSSProperties,

  labelIcon: (type: string): CSSProperties => ({
    fontSize: '0.7rem',
    color: type === 'live' ? 'var(--accent-green)' :
           type === 'historical' ? 'var(--accent-amber)' :
           'var(--text-muted)',
  }),

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
    gap: '1rem',
  } as CSSProperties,

  // Full tracker card
  card: (accentColor: string, isArchived: boolean): CSSProperties => ({
    position: 'relative',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '1.5rem',
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    transition: 'all 0.25s ease',
    overflow: 'hidden',
    opacity: isArchived ? 0.6 : 1,
    cursor: 'pointer',
    color: 'inherit',
  }),

  cardAccentBar: (color: string): CSSProperties => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    background: color,
    opacity: 0.7,
  }),

  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  } as CSSProperties,

  cardIdent: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.65rem',
  } as CSSProperties,

  cardIcon: {
    fontSize: '1.6rem',
    lineHeight: 1,
  } as CSSProperties,

  cardTitles: {
    display: 'flex',
    flexDirection: 'column' as const,
  } as CSSProperties,

  cardName: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '1.15rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: 0,
    lineHeight: 1.2,
  } as CSSProperties,

  cardDateline: (color: string): CSSProperties => ({
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.58rem',
    fontWeight: 500,
    color: color,
    letterSpacing: '0.1em',
    marginTop: '0.15rem',
  }),

  statusBadge: (className: string): CSSProperties => {
    const colors: Record<string, { bg: string; fg: string; border: string }> = {
      fresh: {
        bg: 'rgba(46, 204, 113, 0.1)',
        fg: 'var(--accent-green)',
        border: 'rgba(46, 204, 113, 0.25)',
      },
      recent: {
        bg: 'rgba(243, 156, 18, 0.1)',
        fg: 'var(--accent-amber)',
        border: 'rgba(243, 156, 18, 0.25)',
      },
      stale: {
        bg: 'rgba(148, 152, 168, 0.1)',
        fg: 'var(--text-muted)',
        border: 'var(--border)',
      },
      historical: {
        bg: 'rgba(243, 156, 18, 0.1)',
        fg: 'var(--accent-amber)',
        border: 'rgba(243, 156, 18, 0.25)',
      },
      archived: {
        bg: 'rgba(148, 152, 168, 0.1)',
        fg: 'var(--text-muted)',
        border: 'var(--border)',
      },
    };
    const c = colors[className] || colors.stale;
    return {
      display: 'flex',
      alignItems: 'center',
      gap: '0.35rem',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '0.56rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      padding: '0.25rem 0.55rem',
      borderRadius: 4,
      whiteSpace: 'nowrap',
      background: c.bg,
      color: c.fg,
      border: `1px solid ${c.border}`,
    };
  },

  statusDot: {
    width: 5,
    height: 5,
    background: 'var(--accent-green)',
    borderRadius: '50%',
    animation: 'pulse 2s ease-in-out infinite',
  } as CSSProperties,

  headline: (color: string): CSSProperties => ({
    display: 'flex',
    gap: '0.4rem',
    padding: '0.5rem 0.65rem',
    background: 'rgba(231, 76, 60, 0.04)',
    borderLeft: `2px solid ${color}`,
    borderRadius: '0 4px 4px 0',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.78rem',
    color: 'var(--text-secondary)',
    lineHeight: 1.45,
  }),

  headlineMarker: (color: string): CSSProperties => ({
    color: color,
    fontWeight: 700,
    flexShrink: 0,
  }),

  desc: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.78rem',
    color: 'var(--text-muted)',
    lineHeight: 1.55,
    margin: 0,
  } as CSSProperties,

  kpiRow: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap' as const,
  } as CSSProperties,

  kpiChip: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.1rem',
    padding: '0.4rem 0.6rem',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    minWidth: 0,
  } as CSSProperties,

  kpiValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap' as const,
  } as CSSProperties,

  kpiLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.5rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 100,
  } as CSSProperties,

  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: '0.5rem',
    borderTop: '1px solid var(--border)',
  } as CSSProperties,

  features: {
    display: 'flex',
    gap: '0.4rem',
    flexWrap: 'wrap' as const,
  } as CSSProperties,

  featureBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.56rem',
    color: 'var(--text-muted)',
    background: 'var(--bg-secondary)',
    padding: '0.15rem 0.4rem',
    borderRadius: 3,
    border: '1px solid var(--border)',
  } as CSSProperties,

  updatedText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.56rem',
    color: 'var(--text-muted)',
    opacity: 0.7,
  } as CSSProperties,

  // Series strip styles
  seriesHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginTop: '2rem',
    marginBottom: '1rem',
  } as CSSProperties,

  seriesLine: {
    flex: 1,
    height: 1,
    background: 'var(--border)',
  } as CSSProperties,

  seriesLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.62rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.12em',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap' as const,
  } as CSSProperties,

  seriesStrip: {
    display: 'flex',
    gap: '0.5rem',
    overflowX: 'auto' as const,
    paddingBottom: '0.5rem',
    scrollbarWidth: 'thin' as const,
    scrollbarColor: 'var(--border) transparent',
  } as CSSProperties,

  seriesArrow: {
    display: 'flex',
    alignItems: 'center',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
    opacity: 0.3,
    flexShrink: 0,
  } as CSSProperties,

  compactCard: (color: string, isHub: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.6rem 0.85rem',
    background: 'var(--bg-card)',
    border: `1px solid ${isHub ? color + '40' : 'var(--border)'}`,
    borderRadius: 8,
    textDecoration: 'none',
    color: 'inherit',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    flexShrink: 0,
    minWidth: 0,
    position: 'relative',
    overflow: 'hidden',
  }),

  compactAccentBar: (color: string): CSSProperties => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    background: color,
    opacity: 0.5,
  }),

  compactIcon: {
    fontSize: '1.1rem',
    lineHeight: 1,
    flexShrink: 0,
  } as CSSProperties,

  compactInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 0,
  } as CSSProperties,

  compactName: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.82rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: 1.2,
  } as CSSProperties,

  compactYear: (color: string): CSSProperties => ({
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.52rem',
    color: color,
    letterSpacing: '0.08em',
    marginTop: '0.1rem',
  }),

  hubBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.44rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    padding: '0.1rem 0.3rem',
    borderRadius: 3,
    background: 'rgba(52, 152, 219, 0.15)',
    color: 'var(--accent-blue)',
    border: '1px solid rgba(52, 152, 219, 0.3)',
    flexShrink: 0,
  } as CSSProperties,

  cardImage: {
    position: 'relative' as const,
    width: '100%',
    height: 80,
    overflow: 'hidden',
    borderRadius: '6px',
    marginTop: 10,
    background: 'var(--bg-secondary)',
  } as CSSProperties,

  cardImageImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block',
    transition: 'opacity 0.3s ease-in',
  } as CSSProperties,

  cardImageAttr: {
    position: 'absolute' as const,
    bottom: 4,
    right: 4,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.42rem',
    color: 'rgba(255, 255, 255, 0.85)',
    background: 'rgba(0, 0, 0, 0.6)',
    padding: '1px 5px',
    borderRadius: 2,
    letterSpacing: '0.05em',
  } as CSSProperties,

  noResults: {
    textAlign: 'center' as const,
    padding: '3rem 1rem',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.72rem',
    color: 'var(--text-muted)',
    opacity: 0.6,
  } as CSSProperties,

  resultCount: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.56rem',
    color: 'var(--text-muted)',
    opacity: 0.5,
    marginBottom: '0.5rem',
  } as CSSProperties,
} as const;

// ── Thumbnail helpers ──

function cardImageUrl(tracker: TrackerCardData): string | null {
  if (tracker.latestEventMedia) return tracker.latestEventMedia.url;
  if (tracker.mapCenter) {
    const { lat, lon } = tracker.mapCenter;
    const z = 5;
    const n = Math.pow(2, z);
    const x = Math.floor(((lon + 180) / 360) * n);
    const y = Math.floor(
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n,
    );
    return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  }
  return null;
}

function CardImage({ tracker }: { tracker: TrackerCardData }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = cardImageUrl(tracker);

  if (!url || failed) return null;

  const isEventMedia = !!tracker.latestEventMedia;

  return (
    <div style={S.cardImage}>
      <img
        src={url}
        alt=""
        style={{ ...S.cardImageImg, opacity: loaded ? 1 : 0 }}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
      {isEventMedia && tracker.latestEventMedia && (
        <span style={S.cardImageAttr}>
          {tracker.latestEventMedia.source} · T{tracker.latestEventMedia.tier}
        </span>
      )}
    </div>
  );
}

// ── Subcomponents ──

const StatusBadge = memo(function StatusBadge({
  tracker,
}: {
  tracker: TrackerCardData;
}) {
  if (tracker.status === 'archived') {
    return <span style={S.statusBadge('archived')}>ARCHIVED</span>;
  }
  if (tracker.temporal === 'historical') {
    return <span style={S.statusBadge('historical')}>HISTORICAL</span>;
  }
  const { label, className } = computeFreshness(tracker.lastUpdated);
  return (
    <span style={S.statusBadge(className)}>
      {className === 'fresh' && <span style={S.statusDot} />}
      <span>{label}</span>
    </span>
  );
});

const KpiChips = memo(function KpiChips({
  kpis,
}: {
  kpis: Array<{ value: string; label: string }>;
}) {
  if (kpis.length === 0) return null;
  return (
    <div style={S.kpiRow}>
      {kpis.map((k, i) => (
        <div key={i} style={S.kpiChip}>
          <span style={S.kpiValue}>{k.value}</span>
          <span style={S.kpiLabel}>{k.label}</span>
        </div>
      ))}
    </div>
  );
});

const TrackerCard = memo(function TrackerCard({
  tracker,
  basePath,
}: {
  tracker: TrackerCardData;
  basePath: string;
}) {
  const accentColor = tracker.color || '#3498db';
  const isArchived = tracker.status === 'archived';
  const freshness = computeFreshness(tracker.lastUpdated);
  const dateline = buildDateline(tracker);
  const href = `${basePath}${tracker.slug}/`;

  const truncatedHeadline = tracker.headline
    ? tracker.headline.length > 100
      ? tracker.headline.slice(0, 100) + '...'
      : tracker.headline
    : null;

  return (
    <a
      href={href}
      style={S.card(accentColor, isArchived)}
      onMouseEnter={e => {
        const el = e.currentTarget;
        el.style.borderColor = `color-mix(in srgb, ${accentColor} 40%, var(--border))`;
        el.style.background = 'var(--bg-card-hover)';
        el.style.transform = 'translateY(-3px)';
        el.style.boxShadow = `0 8px 24px rgba(0,0,0,0.3), 0 0 0 1px color-mix(in srgb, ${accentColor} 15%, transparent)`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget;
        el.style.borderColor = '';
        el.style.background = '';
        el.style.transform = '';
        el.style.boxShadow = '';
      }}
    >
      <div style={S.cardAccentBar(accentColor)} />
      <div style={S.cardTop}>
        <div style={S.cardIdent}>
          <span style={S.cardIcon}>{tracker.icon || ''}</span>
          <div style={S.cardTitles}>
            <h3 style={S.cardName}>{tracker.shortName}</h3>
            <span style={S.cardDateline(accentColor)}>{dateline}</span>
          </div>
        </div>
        <StatusBadge tracker={tracker} />
      </div>

      {truncatedHeadline && (
        <div style={S.headline(accentColor)}>
          <span style={S.headlineMarker(accentColor)}>&rsaquo;</span>
          <span>{truncatedHeadline}</span>
        </div>
      )}

      <CardImage tracker={tracker} />

      <p style={S.desc}>{tracker.description}</p>
      <KpiChips kpis={tracker.topKpis} />

      <div style={S.cardFooter}>
        <div style={S.features}>
          <span style={S.featureBadge}>{tracker.sections.length} sections</span>
          {tracker.mapEnabled && <span style={S.featureBadge}>Map</span>}
          {tracker.globeEnabled && <span style={S.featureBadge}>3D Globe</span>}
        </div>
        <span style={S.updatedText}>{freshness.ageText}</span>
      </div>
    </a>
  );
});

const CompactSeriesCard = memo(function CompactSeriesCard({
  tracker,
  basePath,
}: {
  tracker: TrackerCardData;
  basePath: string;
}) {
  const color = tracker.color || '#3498db';
  const href = `${basePath}${tracker.slug}/`;
  const startYear = tracker.startDate.slice(0, 4);
  const endYear = tracker.endDate ? tracker.endDate.slice(0, 4) : '';
  const yearLabel = endYear && endYear !== startYear ? `${startYear}\u2013${endYear}` : startYear;

  return (
    <a
      href={href}
      style={S.compactCard(color, !!tracker.isHub)}
      onMouseEnter={e => {
        const el = e.currentTarget;
        el.style.borderColor = `${color}60`;
        el.style.background = 'var(--bg-card-hover)';
        el.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget;
        el.style.borderColor = '';
        el.style.background = '';
        el.style.transform = '';
      }}
    >
      <div style={S.compactAccentBar(color)} />
      <span style={S.compactIcon}>{tracker.icon || ''}</span>
      <div style={S.compactInfo}>
        <span style={S.compactName}>{tracker.shortName}</span>
        <span style={S.compactYear(color)}>{yearLabel}</span>
      </div>
      {tracker.isHub && <span style={S.hubBadge}>HUB</span>}
    </a>
  );
});

// ── Series strip ──

const SeriesStrip = memo(function SeriesStrip({
  name,
  trackers,
  basePath,
}: {
  name: string;
  trackers: TrackerCardData[];
  basePath: string;
}) {
  return (
    <div>
      <div style={S.seriesHeader}>
        <div style={S.seriesLine} />
        <span style={S.seriesLabel}>{name}</span>
        <div style={S.seriesLine} />
      </div>
      <div style={S.seriesStrip}>
        {trackers.map((t, i) => (
          <div key={t.slug} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {i > 0 && <span style={S.seriesArrow}>&rarr;</span>}
            <CompactSeriesCard tracker={t} basePath={basePath} />
          </div>
        ))}
      </div>
    </div>
  );
});

// ── Domain tabs ──

const DomainTabs = memo(function DomainTabs({
  trackers,
  activeDomain,
  onSelect,
}: {
  trackers: TrackerCardData[];
  activeDomain: string | null;
  onSelect: (domain: string | null) => void;
}) {
  const domainCounts = useMemo(() => computeDomainCounts(trackers), [trackers]);

  const visibleDomains = useMemo(
    () => getVisibleDomains(domainCounts),
    [domainCounts],
  );

  return (
    <div style={S.tabsWrap}>
      <button
        type="button"
        style={S.tab(!activeDomain)}
        onClick={() => onSelect(null)}
      >
        ALL
        <span style={S.tabCount}>{trackers.length}</span>
      </button>
      {visibleDomains.map(d => (
        <button
          key={d}
          type="button"
          style={S.tab(activeDomain === d, DOMAIN_COLORS[d])}
          onClick={() => onSelect(activeDomain === d ? null : d)}
        >
          {d.toUpperCase()}
          <span style={S.tabCount}>{domainCounts[d]}</span>
        </button>
      ))}
    </div>
  );
});

// ── Search input ──

const SearchInput = memo(function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={S.searchWrap}>
      <span style={S.searchIcon}>&gt;_</span>
      <input
        type="text"
        placeholder="Search trackers by name, domain, region..."
        value={value}
        onChange={e => onChange(e.target.value)}
        style={S.searchInput}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; }}
        onBlur={e => { e.currentTarget.style.borderColor = ''; }}
        aria-label="Search trackers"
      />
    </div>
  );
});

// ── Group renderer ──

function GroupSection({
  group,
  basePath,
}: {
  group: TrackerGroup;
  basePath: string;
}): ReactNode {
  if (group.type === 'series') {
    return (
      <SeriesStrip
        key={`series-${group.label}`}
        name={group.label}
        trackers={group.trackers}
        basePath={basePath}
      />
    );
  }

  return (
    <section key={group.type}>
      <div style={S.groupHeader(group.type)}>
        <h2 style={S.groupLabel}>
          {group.labelIcon && (
            <span style={S.labelIcon(group.type)}>{group.labelIcon}</span>
          )}
          {group.label}
        </h2>
      </div>
      <div style={S.grid}>
        {group.trackers.map(t => (
          <TrackerCard key={t.slug} tracker={t} basePath={basePath} />
        ))}
      </div>
    </section>
  );
}

// ── Main component ──

export default function TrackerDirectory({ trackers, basePath }: Props) {
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleDomainSelect = useCallback((domain: string | null) => {
    setActiveDomain(domain);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const filtered = useMemo(
    () => filterTrackers(trackers, activeDomain, searchQuery),
    [trackers, activeDomain, searchQuery],
  );

  const groups = useMemo(() => groupTrackers(filtered), [filtered]);

  const isFiltering = activeDomain !== null || searchQuery.trim().length > 0;

  return (
    <div style={S.container}>
      <SearchInput value={searchQuery} onChange={handleSearchChange} />
      <DomainTabs
        trackers={trackers}
        activeDomain={activeDomain}
        onSelect={handleDomainSelect}
      />

      {isFiltering && (
        <div style={S.resultCount}>
          {filtered.length} tracker{filtered.length !== 1 ? 's' : ''} found
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={S.noResults}>
          No trackers match your search.
        </div>
      ) : (
        groups.map(group => (
          <GroupSection
            key={`${group.type}-${group.label}`}
            group={group}
            basePath={basePath}
          />
        ))
      )}
    </div>
  );
}
