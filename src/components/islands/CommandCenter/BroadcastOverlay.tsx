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
