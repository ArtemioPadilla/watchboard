import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../../../i18n/translations';
import { useLocale } from '../../../i18n/useLocale';

interface Props {
  /** Returns the URL to copy. Callers flush their view-state writer here so
   *  the link reflects the camera as it is now, not as it was 500 ms ago. */
  buildUrl: () => string;
  /** Bump this counter to trigger a copy from a keyboard shortcut. */
  trigger?: number;
  className?: string;
  compact?: boolean;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * "Share view" button: copies the current URL (with view state) to the
 * clipboard and confirms with a 2 s toast. Reused by the globe toolbar,
 * the 2D map layer panel and the homepage.
 */
export default function ShareViewButton({ buildUrl, trigger, className = '', compact = false }: Props) {
  const locale = useLocale();
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTrigger = useRef(trigger);

  const copy = useCallback(async () => {
    const ok = await copyText(buildUrl());
    setStatus(ok ? 'copied' : 'failed');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus('idle'), 2000);
  }, [buildUrl]);

  useEffect(() => {
    if (trigger !== undefined && trigger !== lastTrigger.current) {
      lastTrigger.current = trigger;
      void copy();
    }
  }, [trigger, copy]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const label = status === 'copied'
    ? t('share.copied', locale)
    : status === 'failed'
      ? t('share.copyFailed', locale)
      : t('share.copyView', locale);

  return (
    <button
      type="button"
      className={`share-view-btn${status !== 'idle' ? ` share-view-btn--${status}` : ''} ${className}`.trim()}
      onClick={() => void copy()}
      title={`${t('share.copyView', locale)} (S)`}
      aria-label={label}
      aria-live="polite"
      data-status={status}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M6 10a3 3 0 010-4l2-2a3 3 0 014 4l-1 1M10 6a3 3 0 010 4l-2 2a3 3 0 01-4-4l1-1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      {!compact && <span className="share-view-label">{label}</span>}
      {compact && status !== 'idle' && <span className="share-view-toast">{label}</span>}
    </button>
  );
}
