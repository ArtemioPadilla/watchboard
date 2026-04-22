import { useRef, useEffect, useMemo } from 'react';
import type { TrackerCardData } from '../../../lib/tracker-directory-utils';

// ── Types ──

interface Props {
  trackerQueue: TrackerCardData[];
  featuredTracker: TrackerCardData | null;
  currentIndex: number;
  onCircleClick: (slug: string) => void;
}

// ── Constants ──

const MAX_CIRCLES = 15;

// ── Component ──

/**
 * Vertical rail of clickable tracker icons shown in the collapsed sidebar
 * during broadcast mode. Keeps the featured tracker's circle marked as active;
 * the story display itself lives in the BroadcastOverlay lower-third.
 */
export default function DesktopStoryStrip({
  trackerQueue,
  featuredTracker,
  currentIndex,
  onCircleClick,
}: Props) {
  const circlesRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<string>>(new Set());

  // Accumulate "seen" slugs as cycle advances
  useEffect(() => {
    if (featuredTracker) seenRef.current.add(featuredTracker.slug);
  }, [featuredTracker]);

  // Slide a window over trackerQueue so the active circle stays visible.
  const { visibleCircles, visibleActiveIndex } = useMemo(() => {
    const total = trackerQueue.length;
    if (total <= MAX_CIRCLES) {
      return { visibleCircles: trackerQueue, visibleActiveIndex: currentIndex };
    }
    const half = Math.floor(MAX_CIRCLES / 2);
    let start = currentIndex - half;
    if (start < 0) start = 0;
    if (start + MAX_CIRCLES > total) start = total - MAX_CIRCLES;
    return {
      visibleCircles: trackerQueue.slice(start, start + MAX_CIRCLES),
      visibleActiveIndex: currentIndex - start,
    };
  }, [trackerQueue, currentIndex]);

  // Auto-scroll circle column to keep active circle visible
  useEffect(() => {
    const container = circlesRef.current;
    if (!container) return;
    const activeCircle = container.children[visibleActiveIndex] as HTMLElement | undefined;
    if (activeCircle) {
      activeCircle.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [visibleActiveIndex]);

  if (visibleCircles.length === 0) return null;

  return (
    <div className="desktop-story-strip" aria-label="Broadcast tracker navigation">
      <div className="desktop-story-circles" ref={circlesRef}>
        {visibleCircles.map((tr, i) => {
          const isActive = i === visibleActiveIndex;
          return (
            <button
              type="button"
              key={tr.slug}
              className={
                `desktop-story-circle` +
                (isActive ? ' active' : '') +
                (seenRef.current.has(tr.slug) && !isActive ? ' seen' : '')
              }
              onClick={() => onCircleClick(tr.slug)}
              title={tr.shortName}
              aria-label={`Jump broadcast to ${tr.shortName}`}
              aria-current={isActive ? 'true' : undefined}
              style={isActive && tr.color ? { borderColor: tr.color, boxShadow: `0 0 8px ${tr.color}55` } : undefined}
            >
              {tr.icon ?? '?'}
            </button>
          );
        })}
      </div>
    </div>
  );
}
