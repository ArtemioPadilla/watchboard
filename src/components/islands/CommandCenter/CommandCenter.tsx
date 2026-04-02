import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { trackEvent } from '../../../lib/analytics';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';
import { type Locale, SUPPORTED_LOCALES, getPreferredLocale, setPreferredLocale, t } from '../../../i18n/translations';
const GlobePanel = lazy(() => import('./GlobePanel'));
import SidebarPanel from './SidebarPanel';
import MobileStoryCarousel from './MobileStoryCarousel';
import ComparePanel from './ComparePanel';
import NotificationManager from './NotificationManager';
import { useBroadcastMode } from './useBroadcastMode';
import BroadcastOverlay from './BroadcastOverlay';

const FOLLOWS_KEY = 'watchboard-follows';

function loadFollows(): string[] {
  try {
    const raw = localStorage.getItem(FOLLOWS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveFollows(slugs: string[]) {
  try { localStorage.setItem(FOLLOWS_KEY, JSON.stringify(slugs)); } catch {}
}

const SHORTCUTS = [
  { key: '/', tKey: 'shortcuts.search' },
  { key: '↑ ↓', tKey: 'shortcuts.navigate' },
  { key: 'Enter', tKey: 'shortcuts.open' },
  { key: 'F', tKey: 'shortcuts.follow' },
  { key: 'C', tKey: 'cc.compare' },
  { key: 'B', tKey: 'shortcuts.broadcast' },
  { key: 'G', tKey: 'shortcuts.rotate' },
  { key: 'O', tKey: 'shortcuts.openSelected' },
  { key: 'Esc', tKey: 'shortcuts.deselect' },
  { key: '?', tKey: 'shortcuts.help' },
] as const;

interface Props {
  trackers: TrackerCardData[];
  basePath: string;
  liveCount: number;
  historicalCount: number;
}

export default function CommandCenter({
  trackers,
  basePath,
  liveCount,
  historicalCount,
}: Props) {
  const [activeTracker, setActiveTracker] = useState<string | null>(null);
  const [hoveredTracker, setHoveredTracker] = useState<string | null>(null);
  const [followedSlugs, setFollowedSlugs] = useState<string[]>([]);
  const [compareSlugs, setCompareSlugs] = useState<string[]>([]);
  const [broadcastOff, setBroadcastOff] = useState(false);
  const [locale, setLocale] = useState<Locale>('en');
  const [showHelp, setShowHelp] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const globeRef = useRef<{
    toggleRotation?: () => void;
    flyTo?: (lat: number, lng: number, altitude: number, durationMs: number) => void;
    setAutoRotate?: (enabled: boolean, speed?: number) => void;
  }>(null);

  const broadcastEnabled = !activeTracker && !broadcastOff;

  const broadcast = useBroadcastMode(
    trackers,
    globeRef,
    broadcastEnabled,
    (slug) => setHoveredTracker(slug),
  );

  useEffect(() => {
    setFollowedSlugs(loadFollows());
    setLocale(getPreferredLocale());
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleToggleLocale = useCallback(() => {
    setLocale(prev => {
      const idx = SUPPORTED_LOCALES.indexOf(prev);
      const next = SUPPORTED_LOCALES[(idx + 1) % SUPPORTED_LOCALES.length];
      setPreferredLocale(next);
      return next;
    });
  }, []);

  const handleSelect = useCallback((slug: string | null) => {
    setActiveTracker(slug);
  }, []);

  const handleHover = useCallback((slug: string | null) => {
    setHoveredTracker(slug);
  }, []);

  const handleToggleFollow = useCallback((slug: string) => {
    setFollowedSlugs(prev => {
      const next = prev.includes(slug)
        ? prev.filter(s => s !== slug)
        : [...prev, slug];
      saveFollows(next);
      return next;
    });
  }, []);

  const handleToggleCompare = useCallback((slug: string) => {
    setCompareSlugs(prev =>
      prev.includes(slug)
        ? prev.filter(s => s !== slug)
        : [...prev, slug],
    );
  }, []);

  const handleClearCompare = useCallback(() => {
    setCompareSlugs([]);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (e.key === 'Escape') {
        if (showHelp) { setShowHelp(false); return; }
        if (compareSlugs.length > 0) { setCompareSlugs([]); return; }
        if (isInput) { (target as HTMLInputElement).blur(); return; }
        setActiveTracker(null);
        return;
      }

      // Don't handle shortcuts when typing in an input
      if (isInput) return;

      switch (e.key) {
        case '/':
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case '?':
          e.preventDefault();
          setShowHelp(prev => !prev);
          break;
        case 'f':
        case 'F':
          if (activeTracker) {
            e.preventDefault();
            handleToggleFollow(activeTracker);
          }
          break;
        case 'b':
        case 'B':
          e.preventDefault();
          trackEvent('broadcast_mode_toggled', { enabled: broadcastOff });
          setBroadcastOff(prev => !prev);
          break;
        case 'g':
        case 'G':
          e.preventDefault();
          globeRef.current?.toggleRotation?.();
          break;
        case 'c':
        case 'C':
          if (activeTracker) {
            e.preventDefault();
            handleToggleCompare(activeTracker);
          }
          break;
        case 'o':
        case 'O':
          if (activeTracker) {
            e.preventDefault();
            const lp = locale === 'es' ? 'es/' : '';
            window.location.href = `${basePath}${lp}${activeTracker}/`;
          }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTracker, showHelp, compareSlugs.length, handleToggleFollow, handleToggleCompare, basePath, locale]);

  return (
    <div className="command-center-root" role="application" aria-label="Watchboard Command Center" style={styles.container}>
      <h1 className="sr-only">Watchboard — Intelligence Dashboard Platform</h1>
      <NotificationManager trackers={trackers} followedSlugs={followedSlugs} />
      <div className="cc-globe" style={styles.globe} role="region" aria-label="Globe visualization">
        <Suspense fallback={
          <div style={styles.globeLoading}>
            <div style={styles.globePlaceholder}>
              <div style={styles.globeSpinner} />
            </div>
            <div style={styles.globeLoadingText}>{t('cc.initGlobe', locale)}</div>
          </div>
        }>
          <GlobePanel
            ref={globeRef}
            trackers={trackers}
            activeTracker={activeTracker}
            hoveredTracker={hoveredTracker}
            followedSlugs={followedSlugs}
            broadcastMode={broadcastEnabled}
            featuredSlug={broadcast.featuredTracker?.slug || null}
            onSelectTracker={handleSelect}
            onHoverTracker={handleHover}
          />
        </Suspense>
        {broadcastEnabled && (
          <BroadcastOverlay
            featuredTracker={broadcast.featuredTracker}
            phase={broadcast.phase}
            progress={broadcast.progress}
            trackerQueue={broadcast.trackerQueue}
            currentIndex={broadcast.currentIndex}
            onJumpTo={(slug) => {
              broadcast.jumpTo(slug);
            }}
          />
        )}
        {isMobile && (
          <MobileStoryCarousel trackers={trackers} basePath={basePath} />
        )}
      </div>
      <nav className="cc-sidebar" style={styles.sidebar} aria-label="Tracker directory">
        <SidebarPanel
          trackers={trackers}
          basePath={basePath}
          activeTracker={activeTracker}
          hoveredTracker={hoveredTracker}
          followedSlugs={followedSlugs}
          liveCount={liveCount}
          historicalCount={historicalCount}
          onSelectTracker={handleSelect}
          onHoverTracker={handleHover}
          onToggleFollow={handleToggleFollow}
          compareSlugs={compareSlugs}
          onToggleCompare={handleToggleCompare}
          locale={locale}
          onToggleLocale={handleToggleLocale}
          searchRef={searchRef}
        />
      </nav>

      {/* Tracker comparison panel */}
      {compareSlugs.length >= 2 && (
        <ComparePanel
          trackers={trackers}
          compareSlugs={compareSlugs}
          onClose={handleClearCompare}
          onRemove={handleToggleCompare}
          basePath={basePath}
        />
      )}

      {/* Keyboard shortcuts help overlay */}
      {showHelp && (
        <div style={styles.helpOverlay} onClick={() => setShowHelp(false)}>
          <div style={styles.helpPanel} onClick={e => e.stopPropagation()}>
            <div style={styles.helpTitle}>{t('shortcuts.title', locale)}</div>
            <div style={styles.helpGrid}>
              {SHORTCUTS.map(s => (
                <div key={s.key} style={styles.helpRow}>
                  <kbd style={styles.helpKey}>{s.key}</kbd>
                  <span style={styles.helpLabel}>{t(s.tKey as any, locale)}</span>
                </div>
              ))}
            </div>
            <div style={styles.helpClose}><kbd style={styles.helpKeyInline}>?</kbd> / <kbd style={styles.helpKeyInline}>Esc</kbd> {t('shortcuts.close', locale)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
    position: 'relative' as const,
  } as React.CSSProperties,

  globe: {
    flex: '6 1 0%',
    position: 'relative' as const,
    minWidth: 0,
  } as React.CSSProperties,

  globeLoading: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    background: '#000',
  } as React.CSSProperties,

  globePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 30%, #1e3a5f 0%, #0e1f35 50%, #060a10 100%)',
    position: 'relative' as const,
  } as React.CSSProperties,

  globeSpinner: {
    position: 'absolute' as const,
    inset: -6,
    borderRadius: '50%',
    border: '2px solid transparent',
    borderTopColor: 'rgba(52,152,219,0.5)',
    animation: 'spin 1.5s linear infinite',
  } as React.CSSProperties,

  globeLoadingText: {
    marginTop: 16,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.55rem',
    color: 'var(--text-muted)',
    letterSpacing: '0.12em',
    opacity: 0.5,
  } as React.CSSProperties,

  sidebar: {
    flex: '4 1 0%',
    minWidth: 280,
    maxWidth: 440,
    borderLeft: '1px solid var(--border)',
    overflow: 'hidden',
  } as React.CSSProperties,

  helpOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    backdropFilter: 'blur(4px)',
  } as React.CSSProperties,

  helpPanel: {
    background: 'var(--bg-card, #161b22)',
    border: '1px solid var(--border, #30363d)',
    borderRadius: 10,
    padding: '1.5rem 2rem',
    maxWidth: 340,
    width: '90%',
  } as React.CSSProperties,

  helpTitle: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: 'var(--accent-blue, #58a6ff)',
    marginBottom: '1rem',
  } as React.CSSProperties,

  helpGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  } as React.CSSProperties,

  helpRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  } as React.CSSProperties,

  helpKey: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.65rem',
    fontWeight: 600,
    background: 'var(--bg-secondary, #0d1117)',
    border: '1px solid var(--border, #30363d)',
    borderRadius: 4,
    padding: '2px 8px',
    color: 'var(--text-primary, #e6edf3)',
    minWidth: 36,
    textAlign: 'center' as const,
  } as React.CSSProperties,

  helpKeyInline: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.6rem',
    background: 'var(--bg-secondary, #0d1117)',
    border: '1px solid var(--border, #30363d)',
    borderRadius: 3,
    padding: '1px 5px',
    color: 'var(--text-primary, #e6edf3)',
  } as React.CSSProperties,

  helpLabel: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '0.78rem',
    color: 'var(--text-secondary, #8b949e)',
  } as React.CSSProperties,

  helpClose: {
    marginTop: '1rem',
    paddingTop: '0.75rem',
    borderTop: '1px solid var(--border, #30363d)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.55rem',
    color: 'var(--text-muted, #484f58)',
    textAlign: 'center' as const,
  } as React.CSSProperties,
};

/* Note: mobile layout overrides are in index.astro <style is:global> block */
