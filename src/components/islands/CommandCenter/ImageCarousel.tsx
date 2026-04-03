import { useState, useEffect, useCallback, useRef } from 'react';

interface ImageData {
  url: string;
  source: string;
  tier: number;
}

interface ImageCarouselProps {
  images: ImageData[];
  autoAdvance?: boolean;
  fallbackIcon?: string;
  fallbackDomain?: string;
}

const DOMAIN_GRADIENTS: Record<string, string> = {
  conflict: 'linear-gradient(135deg, #1a0a0a, #2c1010, #0d1117)',
  security: 'linear-gradient(135deg, #1a0a1a, #2c102c, #0d1117)',
  governance: 'linear-gradient(135deg, #0a0a1a, #101030, #0d1117)',
  disaster: 'linear-gradient(135deg, #1a0f00, #2c1a05, #0d1117)',
  default: 'linear-gradient(135deg, #12141a, #181b23, #0d1117)',
};

const AUTO_ADVANCE_MS = 4000;

export default function ImageCarousel({ images, autoAdvance = false, fallbackIcon, fallbackDomain }: ImageCarouselProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(0);
  const startRef = useRef(0);

  // Reset index when images change
  useEffect(() => { setCurrentIdx(0); setProgress(0); }, [images]);

  // Auto-advance every 4s with progress tracking
  useEffect(() => {
    if (!autoAdvance || images.length <= 1) return;
    startRef.current = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      const pct = Math.min(elapsed / AUTO_ADVANCE_MS, 1);
      setProgress(pct);
      if (pct >= 1) {
        setCurrentIdx(prev => (prev + 1) % images.length);
        startRef.current = performance.now();
        setProgress(0);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [autoAdvance, images]);

  const goTo = useCallback((idx: number) => {
    setCurrentIdx(Math.max(0, Math.min(idx, images.length - 1)));
    startRef.current = performance.now();
    setProgress(0);
  }, [images.length]);

  // Fallback: no images
  if (images.length === 0) {
    const gradient = DOMAIN_GRADIENTS[fallbackDomain ?? ''] ?? DOMAIN_GRADIENTS.default;
    return (
      <div className="img-carousel" style={styles.container}>
        <div style={{ ...styles.fallback, background: gradient }}>
          <span style={styles.fallbackIcon}>{fallbackIcon ?? '?'}</span>
        </div>
      </div>
    );
  }

  const current = images[currentIdx];

  return (
    <div className="img-carousel" style={styles.container}>
      {autoAdvance && images.length > 1 && (
        <div style={styles.progressRow}>
          {images.map((_, i) => (
            <div key={i} style={styles.progressTrack}>
              <div
                style={{
                  ...styles.progressFill,
                  width: i < currentIdx ? '100%' : i === currentIdx ? `${progress * 100}%` : '0%',
                }}
              />
            </div>
          ))}
        </div>
      )}
      <div style={styles.imageWrap}>
        <img
          src={current.url}
          alt=""
          style={styles.image}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
      {/* Attribution */}
      <div style={styles.attribution}>
        {current.source} · T{current.tier}
      </div>
      {/* Dots + arrows (only if multiple images) */}
      {images.length > 1 && (
        <div style={styles.controls}>
          <button style={styles.arrow} onClick={(e) => { e.stopPropagation(); goTo((currentIdx - 1 + images.length) % images.length); }}>‹</button>
          <div style={styles.dots}>
            {images.map((_, i) => (
              <span
                key={i}
                style={{
                  ...styles.dot,
                  opacity: i === currentIdx ? 1 : 0.35,
                }}
                onClick={(e) => { e.stopPropagation(); goTo(i); }}
              />
            ))}
          </div>
          <button style={styles.arrow} onClick={(e) => { e.stopPropagation(); goTo((currentIdx + 1) % images.length); }}>›</button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    width: 140,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  } as React.CSSProperties,
  progressRow: {
    display: 'flex',
    gap: 3,
    padding: '0 2px',
  } as React.CSSProperties,
  progressTrack: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    background: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  } as React.CSSProperties,
  progressFill: {
    height: '100%',
    background: 'var(--accent-blue, #58a6ff)',
    borderRadius: 1,
    transition: 'width 0.1s linear',
  } as React.CSSProperties,
  imageWrap: {
    width: '100%',
    aspectRatio: '3 / 4',
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid var(--border, #30363d)',
    background: '#0d1117',
  } as React.CSSProperties,
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block',
  } as React.CSSProperties,
  fallback: {
    width: '100%',
    aspectRatio: '3 / 4',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--border, #30363d)',
  } as React.CSSProperties,
  fallbackIcon: {
    fontSize: 48,
  } as React.CSSProperties,
  attribution: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.4rem',
    color: 'var(--text-muted, #484f58)',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  controls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  } as React.CSSProperties,
  dots: {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
  } as React.CSSProperties,
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--text-primary, #e6edf3)',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  } as React.CSSProperties,
  arrow: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary, #8b949e)',
    fontSize: '1rem',
    cursor: 'pointer',
    padding: '0 2px',
    lineHeight: 1,
  } as React.CSSProperties,
};
