import { useState, useCallback, useEffect } from 'react';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';
import GlobePanel from './GlobePanel';
import SidebarPanel from './SidebarPanel';

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

  // Load follows from localStorage on mount
  useEffect(() => {
    setFollowedSlugs(loadFollows());
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

  // Escape to deselect
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveTracker(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="command-center-root" style={styles.container}>
      <div style={styles.globe}>
        <GlobePanel
          trackers={trackers}
          activeTracker={activeTracker}
          hoveredTracker={hoveredTracker}
          followedSlugs={followedSlugs}
          onSelectTracker={handleSelect}
          onHoverTracker={handleHover}
        />
      </div>
      <div style={styles.sidebar}>
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
        />
      </div>
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
  } as React.CSSProperties,

  globe: {
    flex: '6 1 0%',
    position: 'relative' as const,
    minWidth: 0,
  } as React.CSSProperties,

  sidebar: {
    flex: '4 1 0%',
    minWidth: 280,
    maxWidth: 440,
    borderLeft: '1px solid var(--border)',
    overflow: 'hidden',
  } as React.CSSProperties,
};
