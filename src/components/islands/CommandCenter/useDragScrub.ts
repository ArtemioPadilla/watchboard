import { useRef, useCallback, useEffect, useState } from 'react';

interface UseDragScrubOptions {
  onPrev: () => void;
  onNext: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  threshold?: number;
}

interface DragScrubResult {
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
  };
  isDragging: boolean;
}

const DEFAULT_THRESHOLD = 50;

export function useDragScrub({
  onPrev,
  onNext,
  onDragStart,
  onDragEnd,
  threshold = DEFAULT_THRESHOLD,
}: UseDragScrubOptions): DragScrubResult {
  const startXRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleMove = useCallback((clientX: number) => {
    if (startXRef.current === null) return;
    const delta = clientX - startXRef.current;
    if (Math.abs(delta) >= threshold) {
      if (delta < 0) {
        onNext();
      } else {
        onPrev();
      }
      startXRef.current = clientX; // reset for continuous drag
    }
  }, [onPrev, onNext, threshold]);

  const handleEnd = useCallback(() => {
    if (!draggingRef.current) return;
    startXRef.current = null;
    draggingRef.current = false;
    setIsDragging(false);
    onDragEnd?.();
  }, [onDragEnd]);

  // Attach global listeners during drag
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX);
    const onMouseUp = () => handleEnd();
    const onTouchEnd = () => handleEnd();

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onTouchMove, { passive: true });
      window.addEventListener('touchend', onTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [isDragging, handleMove, handleEnd]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    startXRef.current = e.clientX;
    draggingRef.current = true;
    setIsDragging(true);
    onDragStart?.();
  }, [onDragStart]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    draggingRef.current = true;
    setIsDragging(true);
    onDragStart?.();
  }, [onDragStart]);

  return {
    handlers: { onMouseDown, onTouchStart },
    isDragging,
  };
}
