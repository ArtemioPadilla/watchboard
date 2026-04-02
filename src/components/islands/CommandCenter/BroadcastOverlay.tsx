import { useState, useEffect } from 'react';
import { t, getPreferredLocale } from '../../../i18n/translations';
import type { BroadcastPhase } from './useBroadcastMode';

interface TrackerForOverlay {
  slug: string;
  shortName: string;
  icon?: string;
  headline?: string;
  domain?: string;
  color?: string;
  topKpis: Array<{ value: string; label: string }>;
  latestEventMedia?: { url: string; source: string; tier: number };
  mapCenter?: { lon: number; lat: number };
}

function thumbnailUrl(tracker: TrackerForOverlay): string | null {
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

function BroadcastThumbnail({ tracker }: { tracker: TrackerForOverlay }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = thumbnailUrl(tracker);

  useEffect(() => { setFailed(false); setLoaded(false); }, [tracker.slug]);

  if (!url || failed) return null;

  const isEventMedia = !!tracker.latestEventMedia;

  return (
    <div className="broadcast-lt-thumb">
      <img
        src={url}
        alt=""
        className={`broadcast-lt-thumb-img${loaded ? ' loaded' : ''}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
      {isEventMedia && tracker.latestEventMedia && (
        <span className="broadcast-lt-thumb-attr">
          {tracker.latestEventMedia.source} · T{tracker.latestEventMedia.tier}
        </span>
      )}
    </div>
  );
}

interface BroadcastOverlayProps {
  featuredTracker: TrackerForOverlay | null;
  phase: BroadcastPhase;
  progress: number;
  trackerQueue: TrackerForOverlay[];
  currentIndex: number;
  onJumpTo: (slug: string) => void;
}

export default function BroadcastOverlay({
  featuredTracker,
  phase,
  progress,
  trackerQueue,
  currentIndex,
  onJumpTo,
}: BroadcastOverlayProps) {
  const locale = getPreferredLocale();
  const isPaused = phase === 'paused';
  const isVisible = phase === 'dwelling' || phase === 'transitioning';

  // Compute ticker animation duration based on content
  const tickerDuration = Math.max(trackerQueue.length * 5, 30);

  return (
    <>
      {/* LIVE Badge */}
      <div className={`broadcast-live-badge ${isPaused ? 'paused' : ''}`}>
        <div className="broadcast-live-dot" />
        <span className="broadcast-live-text">{isPaused ? t('broadcast.paused', locale) : t('broadcast.live', locale)}</span>
      </div>

      {/* Lower-Third */}
      {featuredTracker && (
        <div className={`broadcast-lower-third ${isVisible ? 'visible' : ''}`}>
          <div
            className="broadcast-lt-accent"
            style={{ background: featuredTracker.color || 'var(--accent-blue)' }}
          />
          <BroadcastThumbnail tracker={featuredTracker} />
          <div className="broadcast-lt-body">
            {featuredTracker.domain && (
              <div className="broadcast-lt-category">{featuredTracker.domain.toUpperCase()}</div>
            )}
            <div className="broadcast-lt-name">
              {featuredTracker.icon} {featuredTracker.shortName}
            </div>
            {featuredTracker.headline && (
              <div className="broadcast-lt-headline">{featuredTracker.headline}</div>
            )}
            {featuredTracker.topKpis?.[0] && (
              <div className="broadcast-lt-kpi">
                <span className="broadcast-lt-kpi-value">{featuredTracker.topKpis[0].value}</span>
                <span className="broadcast-lt-kpi-label">{featuredTracker.topKpis[0].label}</span>
              </div>
            )}
            <div className="broadcast-lt-progress">
              <div
                className="broadcast-lt-progress-fill"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* News Ticker */}
      {trackerQueue.length > 0 && (
        <div className="broadcast-ticker">
          <div className="broadcast-ticker-label">WATCHBOARD</div>
          <div className="broadcast-ticker-track">
            <div
              className={`broadcast-ticker-content ${isPaused ? 'paused' : ''}`}
              style={{ '--ticker-duration': `${tickerDuration}s` } as React.CSSProperties}
            >
              {/* Duplicate for seamless loop */}
              {[0, 1].map(copy => (
                <span key={copy}>
                  {trackerQueue.map((t, i) => (
                    <span
                      key={`${copy}-${t.slug}`}
                      className={`broadcast-ticker-item ${i === currentIndex ? 'active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); onJumpTo(t.slug); }}
                    >
                      {t.icon} {t.shortName} — {t.headline || 'Tracking...'}
                      <span className="broadcast-ticker-separator">|</span>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
