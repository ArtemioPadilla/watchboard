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
import { t, SUPPORTED_LOCALES, type Locale } from '../../../i18n/translations';

interface Props {
  trackers: TrackerCardData[];
  basePath: string;
  activeTracker: string | null;
  hoveredTracker: string | null;
  followedSlugs: string[];
  compareSlugs: string[];
  liveCount: number;
  historicalCount: number;
  onSelectTracker: (slug: string | null) => void;
  onHoverTracker: (slug: string | null) => void;
  onToggleFollow: (slug: string) => void;
  onToggleCompare: (slug: string) => void;
  locale?: import('../../../i18n/translations').Locale;
  onToggleLocale?: () => void;
  searchRef?: React.RefObject<HTMLInputElement | null>;
}

// ── TrackerRow ──

const TrackerRow = memo(function TrackerRow({
  tracker,
  basePath,
  isActive,
  isHovered,
  isFollowed,
  isCompared,
  onSelect,
  onHover,
  onToggleFollow,
  onToggleCompare,
  locale = 'en',
}: {
  tracker: TrackerCardData;
  basePath: string;
  isActive: boolean;
  isHovered: boolean;
  isFollowed: boolean;
  isCompared: boolean;
  onSelect: (slug: string | null) => void;
  onHover: (slug: string | null) => void;
  onToggleFollow: (slug: string) => void;
  onToggleCompare: (slug: string) => void;
  locale?: Locale;
}) {
  const color = tracker.color || '#3498db';
  const dateline = buildDateline(tracker);
  const freshness = computeFreshness(tracker.lastUpdated);
  const localePrefix = locale !== 'en' ? `${locale}/` : '';
  const href = `${basePath}${localePrefix}${tracker.slug}/`;
  const rowRef = useRef<HTMLDivElement>(null);

  // Auto-scroll into view when selected from globe
  useEffect(() => {
    if (isActive && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isActive]);

  const rawHeadline = locale === 'es' && tracker.headlineEs ? tracker.headlineEs : tracker.headline;
  const truncatedHeadline = rawHeadline
    ? rawHeadline.length > 120
      ? rawHeadline.slice(0, 120) + '…'
      : rawHeadline
    : null;

  if (isActive) {
    return (
      <div
        ref={rowRef}
        className="cc-tracker-expanded"
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
          <div className="cc-kpi-row" style={S.kpiRow}>
            {tracker.topKpis.map((k, i) => (
              <div key={i} style={S.kpiChip}>
                <span className="cc-kpi-value" style={S.kpiValue}>{k.value}</span>
                <span className="cc-kpi-label" style={S.kpiLabel}>{k.label}</span>
              </div>
            ))}
          </div>
        )}

        <div style={S.expandedActions}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={S.deselectBtn}
              onClick={e => { e.stopPropagation(); onSelect(null); }}
            >
              ✕ {t('cc.deselect', locale)}
            </span>
            <span
              style={{ ...S.followBtn, color: isFollowed ? '#f39c12' : 'var(--text-muted)' }}
              onClick={e => { e.stopPropagation(); onToggleFollow(tracker.slug); }}
              title={isFollowed ? 'Unfollow' : 'Follow'}
            >
              {isFollowed ? '★' : '☆'} {isFollowed ? t('status.following', locale) : t('status.follow', locale)}
            </span>
            <span
              style={{ ...S.compareBtn, color: isCompared ? 'var(--accent-blue, #58a6ff)' : 'var(--text-muted)' }}
              onClick={e => { e.stopPropagation(); onToggleCompare(tracker.slug); }}
              title={isCompared ? 'Remove from comparison' : 'Add to comparison'}
            >
              {isCompared ? '◆' : '◇'} {isCompared ? t('cc.compare', locale) : t('cc.compare', locale)}
            </span>
          </div>
          <a
            href={href}
            className="cc-open-link"
            style={S.openLink}
            onClick={e => e.stopPropagation()}
          >
            {t('cc.openDashboard', locale)} →
          </a>
        </div>
      </div>
    );
  }

  // Collapsed row
  return (
    <div
      ref={rowRef}
      className="cc-tracker-row"
      style={{
        ...S.collapsedRow,
        borderLeftColor: color,
        background: isHovered ? `${color}08` : 'transparent',
      }}
      onClick={e => {
        if (e.shiftKey) {
          onToggleCompare(tracker.slug);
        } else {
          onSelect(tracker.slug);
        }
      }}
      onMouseEnter={() => onHover(tracker.slug)}
      onMouseLeave={() => onHover(null)}
      onDoubleClick={() => { window.location.href = href; }}
    >
      <div style={S.collapsedLeft}>
        <span style={S.icon}>{tracker.icon || ''}</span>
        <span className="cc-tracker-name" style={S.collapsedName}>{tracker.shortName}</span>
        {isFollowed && <span style={S.followStar}>★</span>}
        {isCompared && <span style={S.compareDot} />}
      </div>
      <div style={S.collapsedRight}>
        {freshness.className === 'fresh' && <span style={S.freshDot} />}
        <span className="cc-tracker-status" style={{ ...S.collapsedStatus, color: freshness.className === 'fresh' ? 'var(--accent-green)' : freshness.className === 'recent' ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
          {t(freshness.className === 'fresh' ? 'status.fresh' : freshness.className === 'recent' ? 'status.recent' : 'status.stale' as any, locale)}
        </span>
        <span style={S.collapsedDay}>{dateline}</span>
      </div>
    </div>
  );
});

// ── StatusBadge ──

const StatusBadge = memo(function StatusBadge({ tracker, locale = 'en' }: { tracker: TrackerCardData; locale?: Locale }) {
  if (tracker.status === 'archived') {
    return <span style={S.badge('stale')}>{t('status.archived', locale)}</span>;
  }
  if (tracker.temporal === 'historical') {
    return <span style={S.badge('stale')}>{t('status.historical', locale)}</span>;
  }
  const { className } = computeFreshness(tracker.lastUpdated);
  const statusKey = className === 'fresh' ? 'status.fresh' : className === 'recent' ? 'status.recent' : 'status.stale';
  return (
    <span style={S.badge(className)}>
      {className === 'fresh' && <span style={S.freshDot} />}
      {t(statusKey as any, locale)}
    </span>
  );
});

// ── Series Strip ──

const SeriesStrip = memo(function SeriesStrip({
  group,
  basePath,
  activeTracker,
  hoveredTracker,
  onSelect,
  onHover,
}: {
  group: import('../../../lib/tracker-directory-utils').TrackerGroup;
  basePath: string;
  activeTracker: string | null;
  hoveredTracker: string | null;
  onSelect: (slug: string | null) => void;
  onHover: (slug: string | null) => void;
}) {
  return (
    <div>
      <div style={S.seriesHeader}>
        <div style={S.seriesLine} />
        <span style={S.seriesLabel}>{group.label}</span>
        <div style={S.seriesLine} />
      </div>
      <div className="cc-series-strip" style={S.seriesStrip}>
        {group.trackers.map((t, i) => (
          <div key={t.slug} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {i > 0 && <span style={S.seriesArrow}>→</span>}
            <div
              style={{
                ...S.seriesCard(t.color || '#3498db', !!t.isHub),
                background: activeTracker === t.slug ? `${t.color || '#3498db'}15` : hoveredTracker === t.slug ? 'var(--bg-card-hover)' : 'var(--bg-card)',
              }}
              onClick={() => onSelect(activeTracker === t.slug ? null : t.slug)}
              onMouseEnter={() => onHover(t.slug)}
              onMouseLeave={() => onHover(null)}
              onDoubleClick={() => { window.location.href = `${basePath}${t.slug}/`; }}
            >
              <span style={{ fontSize: '0.8rem' }}>{t.icon || ''}</span>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={S.seriesCardName}>{t.shortName}</span>
                <span style={{ ...S.seriesCardYear, color: t.color || '#3498db' }}>
                  {t.startDate.slice(0, 4)}{t.endDate ? `–${t.endDate.slice(0, 4)}` : ''}
                </span>
              </div>
              {t.isHub && <span style={S.hubBadge}>HUB</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ── Recent Events Feed ──

const RecentEventsFeed = memo(function RecentEventsFeed({
  trackers,
  followedSlugs,
  onSelect,
  locale = 'en',
}: {
  trackers: TrackerCardData[];
  followedSlugs: string[];
  onSelect: (slug: string | null) => void;
  locale?: Locale;
}) {
  const withHeadlines = useMemo(
    () => trackers.filter(t => t.headline && t.status === 'active'),
    [trackers],
  );

  const followedTrackers = useMemo(
    () => withHeadlines
      .filter(t => followedSlugs.includes(t.slug))
      .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()),
    [withHeadlines, followedSlugs],
  );

  const recentTrackers = useMemo(
    () => withHeadlines
      .filter(t => !followedSlugs.includes(t.slug))
      .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
      .slice(0, followedTrackers.length > 0 ? 3 : 5),
    [withHeadlines, followedSlugs, followedTrackers.length],
  );

  if (followedTrackers.length === 0 && recentTrackers.length === 0) return null;

  const renderItem = (t: TrackerCardData, isFollowed: boolean) => (
    <div
      key={t.slug}
      className="cc-feed-item"
      style={S.feedItem}
      onClick={() => onSelect(t.slug)}
    >
      <div style={S.feedItemHeader}>
        <span style={{ fontSize: '0.7rem' }}>{t.icon || ''}</span>
        <span style={S.feedItemName}>{t.shortName}</span>
        {isFollowed && <span style={S.followStar}>★</span>}
        <span style={{ ...S.feedItemAge, color: t.color || '#3498db' }}>
          {computeFreshness(t.lastUpdated).ageText}
        </span>
      </div>
      <div style={S.feedItemText}>
        {(() => {
          const h = locale === 'es' && t.headlineEs ? t.headlineEs : t.headline;
          return h && h.length > 80 ? h.slice(0, 80) + '…' : h;
        })()}
      </div>
    </div>
  );

  return (
    <div style={S.feedWrap}>
      {followedTrackers.length > 0 && (
        <>
          <div style={S.feedHeader}>
            <span style={{ color: '#f39c12', fontSize: '0.6rem' }}>★</span>
            <span>{t('status.following', locale)}</span>
          </div>
          {followedTrackers.map(t => renderItem(t, true))}
        </>
      )}
      {recentTrackers.length > 0 && (
        <>
          <div style={{ ...S.feedHeader, marginTop: followedTrackers.length > 0 ? 6 : 0 }}>
            <span style={S.feedDot} />
            <span>{t('cc.latestIntel', locale)}</span>
          </div>
          {recentTrackers.map(t => renderItem(t, false))}
        </>
      )}
    </div>
  );
});

// ── Main SidebarPanel ──

export default function SidebarPanel({
  trackers,
  basePath,
  activeTracker,
  hoveredTracker,
  followedSlugs,
  compareSlugs,
  liveCount,
  historicalCount,
  onSelectTracker,
  onHoverTracker,
  onToggleFollow,
  onToggleCompare,
  locale = 'en',
  onToggleLocale,
  searchRef,
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

  // Flat list of all visible tracker slugs for keyboard nav
  const flatSlugs = useMemo(
    () => groups.flatMap(g => g.trackers.map(t => t.slug)),
    [groups],
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onSelectTracker(null);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const currentIdx = activeTracker ? flatSlugs.indexOf(activeTracker) : -1;
      let nextIdx: number;
      if (e.key === 'ArrowDown') {
        nextIdx = currentIdx < flatSlugs.length - 1 ? currentIdx + 1 : 0;
      } else {
        nextIdx = currentIdx > 0 ? currentIdx - 1 : flatSlugs.length - 1;
      }
      onSelectTracker(flatSlugs[nextIdx]);
    }
    if (e.key === 'Enter' && activeTracker) {
      window.location.href = `${basePath}${activeTracker}/`;
    }
  }, [activeTracker, flatSlugs, onSelectTracker, basePath]);

  const isSearching = activeDomain !== null || searchQuery.trim().length > 0;

  return (
    <div style={S.sidebar} onKeyDown={handleKeyDown} tabIndex={-1}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <span style={S.brand}>WATCHBOARD</span>
          <span style={S.classification}>OSINT</span>
          <a
            href="https://github.com/ArtemioPadilla/watchboard"
            target="_blank"
            rel="noopener noreferrer"
            style={S.headerIconBtn}
            title="View on GitHub"
            aria-label="View on GitHub"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          </a>
          <a
            href="https://github.com/sponsors/ArtemioPadilla"
            target="_blank"
            rel="noopener noreferrer"
            style={S.supportBtn}
            title="Support this project"
            aria-label="Support this project"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4.25 2.5c-1.336 0-2.75 1.164-2.75 3 0 2.15 1.58 4.144 3.365 5.682A20.565 20.565 0 008 13.393a20.561 20.561 0 003.135-2.211C12.92 9.644 14.5 7.65 14.5 5.5c0-1.836-1.414-3-2.75-3-1.373 0-2.609.986-3.029 2.456a.749.749 0 01-1.442 0C6.859 3.486 5.623 2.5 4.25 2.5zM8 14.25l-.345.666-.002-.001-.006-.003-.018-.01a7.643 7.643 0 01-.31-.17 22.075 22.075 0 01-3.434-2.414C2.045 10.731 0 8.35 0 5.5 0 2.836 2.086 1 4.25 1 5.797 1 7.153 1.802 8 3.02 8.847 1.802 10.203 1 11.75 1 13.914 1 16 2.836 16 5.5c0 2.85-2.045 5.231-3.885 6.818a22.08 22.08 0 01-3.744 2.584l-.018.01-.006.003h-.002L8 14.25z"/></svg>
            <span>Support</span>
          </a>
        </div>
        <div style={S.headerRight}>
          {compareSlugs.length > 0 && (
            <span style={S.compareBadge}>
              {compareSlugs.length} CMP
            </span>
          )}
          <span style={S.liveIndicator}>● {liveCount} {t('cc.live', locale)}</span>
          <span style={S.histCount}>{historicalCount} {t('cc.hist', locale)}</span>
          {onToggleLocale && (
            <button
              type="button"
              onClick={onToggleLocale}
              style={S.langBtn}
              title="Change language"
            >
              {SUPPORTED_LOCALES.map((loc, i) => (
                <span key={loc}>
                  {i > 0 && <span style={{ opacity: 0.3 }}>/</span>}
                  <span style={{ opacity: locale === loc ? 1 : 0.4 }}>{loc.toUpperCase()}</span>
                </span>
              ))}
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div style={S.searchWrap}>
        <span style={S.searchIcon}>&gt;_</span>
        <input
          ref={searchRef}
          type="text"
          className="cc-search-input"
          placeholder={t('cc.search', locale)}
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
          className="cc-domain-tab"
          style={S.tab(!activeDomain)}
          onClick={() => setActiveDomain(null)}
        >
          ALL <span style={S.tabCount}>{trackers.length}</span>
        </button>
        {visibleDomains.map(d => (
          <button
            key={d}
            type="button"
            className="cc-domain-tab"
            style={S.tab(activeDomain === d, DOMAIN_COLORS[d])}
            onClick={() => setActiveDomain(activeDomain === d ? null : d)}
          >
            {d.toUpperCase()} <span style={S.tabCount}>{domainCounts[d]}</span>
          </button>
        ))}
      </div>

      {/* Tracker list */}
      <div style={S.list}>
        {/* Recent events feed (only when not searching) */}
        {!isSearching && <RecentEventsFeed trackers={trackers} followedSlugs={followedSlugs} onSelect={onSelectTracker} locale={locale} />}

        {filtered.length === 0 ? (
          <div style={S.noResults}>{t('cc.noResults', locale)}</div>
        ) : (
          groups.map(group => {
            // Render series groups as horizontal strips
            if (group.type === 'series') {
              return (
                <SeriesStrip
                  key={`series-${group.label}`}
                  group={group}
                  basePath={basePath}
                  activeTracker={activeTracker}
                  hoveredTracker={hoveredTracker}
                  onSelect={onSelectTracker}
                  onHover={onHoverTracker}
                />
              );
            }
            return (
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
                    isFollowed={followedSlugs.includes(t.slug)}
                    isCompared={compareSlugs.includes(t.slug)}
                    onSelect={onSelectTracker}
                    onHover={onHoverTracker}
                    onToggleFollow={onToggleFollow}
                    onToggleCompare={onToggleCompare}
                    locale={locale}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="cc-footer" style={S.footer}>
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

  headerIconBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
    opacity: 0.7,
    transition: 'opacity 0.15s, color 0.15s',
    textDecoration: 'none',
  } as CSSProperties,

  supportBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '2px 6px',
    borderRadius: 3,
    border: '1px solid rgba(219,39,119,0.25)',
    background: 'rgba(219,39,119,0.06)',
    color: '#db2777',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.46rem',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
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

  langBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    padding: '2px 5px',
    border: '1px solid var(--border)',
    borderRadius: 3,
    background: 'transparent',
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.48rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    letterSpacing: '0.04em',
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
    padding: '8px 12px',
    borderLeft: '2px solid transparent',
    cursor: 'pointer',
    transition: 'background 0.15s',
    userSelect: 'none' as const,
    minHeight: 44, // ensure minimum touch target
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

  followBtn: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.52rem',
    cursor: 'pointer',
    opacity: 0.8,
    transition: 'color 0.2s',
    letterSpacing: '0.04em',
    userSelect: 'none' as const,
  } as CSSProperties,

  followStar: {
    color: '#f39c12',
    fontSize: '0.55rem',
    flexShrink: 0,
  } as CSSProperties,

  compareBtn: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.52rem',
    cursor: 'pointer',
    opacity: 0.8,
    transition: 'color 0.2s',
    letterSpacing: '0.04em',
    userSelect: 'none' as const,
  } as CSSProperties,

  compareDot: {
    width: 5,
    height: 5,
    background: 'var(--accent-blue, #58a6ff)',
    borderRadius: 2,
    flexShrink: 0,
  } as CSSProperties,

  compareBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.5rem',
    fontWeight: 600,
    color: 'var(--accent-blue, #58a6ff)',
    background: 'rgba(88,166,255,0.1)',
    border: '1px solid rgba(88,166,255,0.25)',
    borderRadius: 3,
    padding: '1px 5px',
    letterSpacing: '0.06em',
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

  // Series strip styles
  seriesHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px 4px',
    marginTop: 8,
  } as CSSProperties,

  seriesLine: {
    flex: 1,
    height: 1,
    background: 'var(--border)',
  } as CSSProperties,

  seriesLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.48rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap' as const,
  } as CSSProperties,

  seriesStrip: {
    display: 'flex',
    gap: '4px',
    overflowX: 'auto' as const,
    padding: '4px 12px 8px',
    scrollbarWidth: 'thin' as const,
    scrollbarColor: 'var(--border) transparent',
  } as CSSProperties,

  seriesArrow: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.6rem',
    color: 'var(--text-muted)',
    opacity: 0.3,
    flexShrink: 0,
  } as CSSProperties,

  seriesCard: (color: string, isHub: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '4px 8px',
    border: `1px solid ${isHub ? color + '40' : 'var(--border)'}`,
    borderRadius: 5,
    cursor: 'pointer',
    transition: 'all 0.15s',
    flexShrink: 0,
    borderTop: `2px solid ${color}80`,
  }),

  seriesCardName: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.7rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap' as const,
    lineHeight: 1.2,
  } as CSSProperties,

  seriesCardYear: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.45rem',
    letterSpacing: '0.06em',
    marginTop: 1,
  } as CSSProperties,

  hubBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.38rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    padding: '1px 3px',
    borderRadius: 2,
    background: 'rgba(52,152,219,0.15)',
    color: 'var(--accent-blue)',
    border: '1px solid rgba(52,152,219,0.3)',
    flexShrink: 0,
  } as CSSProperties,

  // Recent events feed
  feedWrap: {
    padding: '6px 12px 8px',
    borderBottom: '1px solid var(--border)',
    marginBottom: 4,
  } as CSSProperties,

  feedHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.48rem',
    fontWeight: 600,
    letterSpacing: '0.12em',
    color: 'var(--accent-green)',
    marginBottom: 6,
  } as CSSProperties,

  feedDot: {
    width: 5,
    height: 5,
    background: 'var(--accent-green)',
    borderRadius: '50%',
    boxShadow: '0 0 4px rgba(46,204,113,0.5)',
    animation: 'pulse 2s ease-in-out infinite',
  } as CSSProperties,

  feedItem: {
    padding: '4px 6px',
    marginBottom: 3,
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'background 0.15s',
    background: 'rgba(255,255,255,0.02)',
  } as CSSProperties,

  feedItemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  } as CSSProperties,

  feedItemName: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.65rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
  } as CSSProperties,

  feedItemAge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.42rem',
    marginLeft: 'auto',
  } as CSSProperties,

  feedItemText: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.6rem',
    color: 'var(--text-muted)',
    lineHeight: 1.4,
    marginTop: 2,
    paddingLeft: 18,
  } as CSSProperties,

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
