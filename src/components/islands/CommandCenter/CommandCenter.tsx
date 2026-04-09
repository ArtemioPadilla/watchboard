import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { trackEvent } from '../../../lib/analytics';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';
import { computeCountryDensity } from '../../../lib/geo-utils';
import { type Locale, SUPPORTED_LOCALES, getPreferredLocale, setPreferredLocale, t } from '../../../i18n/translations';
const GlobePanel = lazy(() => import('./GlobePanel'));
import SidebarPanel from './SidebarPanel';
import type { ViewMode } from './ViewModeToggle';
import MobileStoryCarousel from './MobileStoryCarousel';
import ComparePanel from './ComparePanel';
import NotificationManager from './NotificationManager';
import { useBroadcastMode } from './useBroadcastMode';
import BroadcastOverlay from './BroadcastOverlay';
import CoachMark from './CoachMark';
import { getDiscoveredFeatures, markFeatureDiscovered, getNextCoachHint } from '../../../lib/onboarding';

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
  { key: 'L', tKey: 'shortcuts.cityLights' },
  { key: 'O', tKey: 'shortcuts.openSelected' },
  { key: 'Esc', tKey: 'shortcuts.deselect' },
  { key: '?', tKey: 'shortcuts.help' },
] as const;

function computeFeatureCentroidAndAltitude(feature: any): {
  centroid: { lat: number; lng: number };
  altitude: number;
} {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;

  function visitCoords(coords: any) {
    if (typeof coords[0] === 'number') {
      const lng = coords[0], lat = coords[1];
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      return;
    }
    for (const c of coords) visitCoords(c);
  }

  if (feature.geometry?.coordinates) {
    visitCoords(feature.geometry.coordinates);
  }

  const centroid = {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
  };

  const area = (maxLat - minLat) * (maxLng - minLng);
  let altitude = 1.6;
  if (area < 25) altitude = 1.2;
  else if (area > 2500) altitude = 2.0;

  return { centroid, altitude };
}

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
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'geo') return 'geographic';
      if (hash === 'domain') return 'domain';
    }
    return 'operations';
  });
  const [locale, setLocale] = useState<Locale>('en');
  const [showHelp, setShowHelp] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [coachHint, setCoachHint] = useState<ReturnType<typeof getNextCoachHint>>(null);
  const [discoveredFeatures, setDiscoveredFeatures] = useState<Set<string>>(new Set());

  // Globe <-> GeoAccordion bidirectional state (geographic mode only)
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [activeGeoPath, setActiveGeoPath] = useState<string[] | null>(null);
  const [countriesGeoJSON, setCountriesGeoJSON] = useState<any>(null);
  const [geoExpandedKeys, setGeoExpandedKeys] = useState<Set<string>>(new Set());

  const countryDensity = useMemo(() => computeCountryDensity(trackers), [trackers]);
  const activeCountry = activeGeoPath && activeGeoPath.length >= 2 ? activeGeoPath[1] : null;

  const searchRef = useRef<HTMLInputElement>(null);
  const globeRef = useRef<{
    toggleRotation?: () => void;
    flyTo?: (lat: number, lng: number, altitude: number, durationMs: number) => void;
    setAutoRotate?: (enabled: boolean, speed?: number) => void;
    toggleCityLights?: () => void;
  }>(null);

  const broadcastEnabled = !activeTracker && !broadcastOff;

  const broadcast = useBroadcastMode(
    trackers,
    globeRef,
    broadcastEnabled,
    (slug) => setHoveredTracker(slug),
    followedSlugs,
  );

  useEffect(() => {
    const hash = viewMode === 'operations' ? '' : viewMode === 'geographic' ? '#geo' : '#domain';
    if (hash) {
      window.history.replaceState(null, '', hash);
    } else if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [viewMode]);

  // Lazy-load country GeoJSON when entering geographic mode
  useEffect(() => {
    if (viewMode !== 'geographic') return;
    if (countriesGeoJSON) return;

    const geoBase = import.meta.env.BASE_URL || '/watchboard';
    const geoBasePath = geoBase.endsWith('/') ? geoBase : `${geoBase}/`;
    fetch(`${geoBasePath}geo/countries-110m.json`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setCountriesGeoJSON(data); })
      .catch(() => { /* polygon layer simply won't appear */ });
  }, [viewMode, countriesGeoJSON]);

  // Reset geo state when leaving geographic mode
  useEffect(() => {
    if (viewMode !== 'geographic') {
      setHoveredCountry(null);
      setActiveGeoPath(null);
      setGeoExpandedKeys(new Set());
      if (!activeTracker) {
        globeRef.current?.setAutoRotate?.(true, 0.3);
      }
    }
  }, [viewMode]);

  useEffect(() => {
    setFollowedSlugs(loadFollows());
    setLocale(getPreferredLocale());
    const discovered = getDiscoveredFeatures();
    setDiscoveredFeatures(discovered);
    setCoachHint(getNextCoachHint(discovered));
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('watchboard-welcomed')) {
      setShowToast(true);
      localStorage.setItem('watchboard-welcomed', '1');
      const timer = setTimeout(() => setShowToast(false), 8000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDiscoverFeature = useCallback((feature: string) => {
    markFeatureDiscovered(feature);
    setDiscoveredFeatures(prev => {
      const next = new Set(prev);
      next.add(feature);
      setCoachHint(getNextCoachHint(next));
      return next;
    });
  }, []);

  const handleDismissCoachHint = useCallback(() => {
    if (coachHint) {
      handleDiscoverFeature(coachHint.featureKey);
    }
  }, [coachHint, handleDiscoverFeature]);

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
    if (slug) setActiveGeoPath(null);
  }, []);

  const handleHover = useCallback((slug: string | null) => {
    setHoveredTracker(slug);
  }, []);

  // Globe polygon click -> expand sidebar accordion + fly camera
  const handleGeoClick = useCallback((isoA2: string) => {
    const regionForCountry = trackers.find(
      t => t.geoPath && t.geoPath[0] === isoA2 && t.region
    )?.region ?? null;

    if (regionForCountry) {
      const path = [regionForCountry, isoA2];
      setActiveGeoPath(path);
      setActiveTracker(null);
      setGeoExpandedKeys(prev => {
        const next = new Set(prev);
        next.add(`0-${regionForCountry}`);
        next.add(`1-${isoA2}`);
        return next;
      });

      if (countriesGeoJSON) {
        const feature = countriesGeoJSON.features?.find(
          (f: any) => f.properties?.ISO_A2 === isoA2
        );
        if (feature) {
          const { centroid, altitude } = computeFeatureCentroidAndAltitude(feature);
          globeRef.current?.flyTo?.(centroid.lat, centroid.lng, altitude, 1200);
          globeRef.current?.setAutoRotate?.(false);
        }
      }
    }
  }, [trackers, countriesGeoJSON]);

  // Sidebar hover -> globe highlight
  const handleHoverGeoNode = useCallback((nodeId: string, level: string) => {
    if (level === 'country') {
      setHoveredCountry(nodeId);
    } else if (level === 'region') {
      setHoveredCountry(`region:${nodeId}`);
    } else {
      setHoveredCountry(null);
    }
  }, []);

  const handleLeaveGeoNode = useCallback(() => {
    setHoveredCountry(null);
  }, []);

  // Accordion node click -> fly camera
  const handleClickGeoNode = useCallback((nodeId: string, level: string) => {
    if (level === 'country') {
      handleGeoClick(nodeId);
    } else if (level === 'region') {
      const regionTrackers = trackers.filter(t => t.region === nodeId && t.mapCenter);
      if (regionTrackers.length > 0) {
        const avgLat = regionTrackers.reduce((s, t) => s + t.mapCenter!.lat, 0) / regionTrackers.length;
        const avgLng = regionTrackers.reduce((s, t) => s + t.mapCenter!.lon, 0) / regionTrackers.length;
        globeRef.current?.flyTo?.(avgLat, avgLng, 2.0, 1200);
        globeRef.current?.setAutoRotate?.(false);
      }
      setActiveGeoPath([nodeId]);
      setActiveTracker(null);
    }
  }, [trackers, handleGeoClick]);

  const handleToggleFollow = useCallback((slug: string) => {
    handleDiscoverFeature('follow');
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

      if (isInput) return;

      switch (e.key) {
        case '/':
          e.preventDefault();
          searchRef.current?.focus();
          handleDiscoverFeature('search');
          break;
        case '?':
          e.preventDefault();
          setShowHelp(prev => !prev);
          break;
        case 'f':
        case 'F': {
          const targetSlug = activeTracker || hoveredTracker;
          if (targetSlug) {
            e.preventDefault();
            handleToggleFollow(targetSlug);
          }
          break;
        }
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
        case 'l':
        case 'L':
          e.preventDefault();
          globeRef.current?.toggleCityLights?.();
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
            viewMode={viewMode}
            countriesGeoJSON={viewMode === 'geographic' ? countriesGeoJSON : null}
            countryDensity={countryDensity}
            hoveredCountry={hoveredCountry}
            activeCountry={activeCountry}
            onPolygonClick={handleGeoClick}
            onPolygonHover={setHoveredCountry}
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
              handleDiscoverFeature('ticker-click');
            }}
            isUserPaused={broadcast.isUserPaused}
            pauseCountdown={broadcast.pauseCountdown}
            onUserPause={() => {
              broadcast.userPause();
              handleDiscoverFeature('broadcast-pause');
            }}
            onUserResume={broadcast.userResume}
            onResetPauseTimer={broadcast.resetPauseTimer}
            onGoToNext={broadcast.goToNext}
            onGoToPrev={broadcast.goToPrev}
            basePath={basePath}
          />
        )}
      </div>
      {isMobile && (
        <MobileStoryCarousel trackers={trackers} basePath={basePath} followedSlugs={followedSlugs} />
      )}
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
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          geoExpandedKeys={viewMode === 'geographic' ? geoExpandedKeys : undefined}
          onGeoExpandedKeysChange={viewMode === 'geographic' ? setGeoExpandedKeys : undefined}
          onHoverGeoNode={handleHoverGeoNode}
          onLeaveGeoNode={handleLeaveGeoNode}
          onClickGeoNode={handleClickGeoNode}
          activeGeoPath={activeGeoPath}
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

      {/* Coach marks */}
      {coachHint && (
        <CoachMark hint={coachHint} onDismiss={handleDismissCoachHint} />
      )}

      {/* First-visit toast */}
      {showToast && (
        <div
          style={{
            position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '0.6rem 1.2rem',
            fontFamily: "'JetBrains Mono', monospace", fontSize: '0.72rem',
            color: 'var(--text-secondary)', zIndex: 9999,
            animation: 'fadeIn 0.3s ease-out',
            cursor: 'pointer',
          }}
          onClick={() => setShowToast(false)}
          role="status"
          aria-live="polite"
        >
          Press <kbd style={{ background: 'var(--bg-secondary)', padding: '0.1rem 0.3rem', borderRadius: '3px', color: 'var(--text-primary)' }}>/</kbd> to search
          &nbsp;&middot;&nbsp;
          <kbd style={{ background: 'var(--bg-secondary)', padding: '0.1rem 0.3rem', borderRadius: '3px', color: 'var(--text-primary)' }}>B</kbd> for broadcast
          &nbsp;&middot;&nbsp;
          <kbd style={{ background: 'var(--bg-secondary)', padding: '0.1rem 0.3rem', borderRadius: '3px', color: 'var(--text-primary)' }}>?</kbd> for shortcuts
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
