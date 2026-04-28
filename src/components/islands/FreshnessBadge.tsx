import { useEffect, useState } from 'react';
import { getPreferredLocale, type Locale } from '../../i18n/translations';

/**
 * "Updated X ago" pill with tier-colored staleness states. Used in the page
 * Header (replaces a vanilla-JS span that did the same thing) and on the
 * /breaking-news-audit/ page to surface "Last scan: …" prominently.
 *
 * Strings, thresholds, and class hooks intentionally match the previous
 * vanilla implementation (`.freshness-indicator`, `.freshness-text`, `.fresh`,
 * `.stale` — styled in `src/styles/global.css`) so the existing CSS keeps
 * working without an island-specific stylesheet.
 *
 * Time buckets (per the 2026-03-04 data-freshness spec):
 *   < 1h:      "Updated X min ago"
 *   1–23h:     "Updated Xh ago"
 *   24–47h:    "Updated yesterday"
 *   48h+:      "Updated X days ago"
 *   ≥ stale:   above text + "— Data may be outdated" (amber)
 *   missing:   "Last update time unknown"
 */

interface Props {
  /** ISO 8601 timestamp. Undefined / unparseable → "Last update time unknown". */
  lastUpdated?: string;
  /** Hours under which the badge renders fresh (green). Default 12. */
  freshHours?: number;
  /** Hours at or above which the badge renders stale (amber + warning). Default 30. */
  staleHours?: number;
  /** Optional label override. Defaults to nothing — the component renders only "Updated …". */
  label?: string;
  /** Locale override; falls back to `getPreferredLocale()` (only the unknown
   *  state is translated, matching the prior Header implementation). */
  locale?: Locale;
  /** Extra class names appended to the root `.freshness-indicator`. */
  className?: string;
}

type Tier = 'fresh' | 'neutral' | 'stale' | 'unknown';

const UNKNOWN_LABEL: Record<Locale, string> = {
  en: 'Last update time unknown',
  es: 'Hora de actualización desconocida',
  fr: 'Heure de mise à jour inconnue',
  pt: 'Hora de atualização desconhecida',
};

export function classifyFreshness(diffMs: number, freshMs: number, staleMs: number): Tier {
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'unknown';
  // Boundary inclusivity per the spec: < 12h is fresh; ≥ 30h is stale; everything between is neutral.
  if (diffMs < freshMs) return 'fresh';
  if (diffMs >= staleMs) return 'stale';
  return 'neutral';
}

export function formatAgo(diffMs: number): string {
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) return `Updated ${Math.max(1, min)} min ago`;
  const hr = Math.floor(diffMs / 3_600_000);
  if (hr < 24) return `Updated ${hr}h ago`;
  if (hr < 48) return 'Updated yesterday';
  const days = Math.floor(diffMs / 86_400_000);
  return `Updated ${days} days ago`;
}

/** Static SSR text — used until the first useEffect tick on the client. */
function staticUpdatedText(lastUpdated: string): string {
  const parsed = new Date(lastUpdated);
  if (Number.isNaN(parsed.getTime())) return '';
  return `Updated ${parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export default function FreshnessBadge({
  lastUpdated,
  freshHours = 12,
  staleHours = 30,
  label,
  locale,
  className,
}: Props) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const effectiveLocale = locale ?? getPreferredLocale();
  const unknownText = UNKNOWN_LABEL[effectiveLocale] ?? UNKNOWN_LABEL.en;

  const ts = lastUpdated ? Date.parse(lastUpdated) : NaN;
  const validTs = Number.isFinite(ts);

  // First render (server + first client paint): emit a stable static string so
  // SSR HTML matches the first client render byte-for-byte (avoids React #418).
  if (now === null) {
    if (!lastUpdated || !validTs) {
      return (
        <span
          className={joinClasses('freshness-indicator', 'stale', className)}
          role="status"
          aria-live="polite"
          title={lastUpdated}
        >
          {label && <span className="freshness-label">{label}{' '}</span>}
          <span className="freshness-text">{unknownText}</span>
        </span>
      );
    }
    return (
      <span
        className={joinClasses('freshness-indicator', className)}
        role="status"
        aria-live="polite"
        title={lastUpdated}
        suppressHydrationWarning
      >
        {label && <span className="freshness-label">{label}{' '}</span>}
        <span className="freshness-text" suppressHydrationWarning>
          {staticUpdatedText(lastUpdated)}
        </span>
      </span>
    );
  }

  if (!lastUpdated || !validTs) {
    return (
      <span
        className={joinClasses('freshness-indicator', 'stale', className)}
        role="status"
        aria-live="polite"
        title={lastUpdated}
      >
        {label && <span className="freshness-label">{label}{' '}</span>}
        <span className="freshness-text">{unknownText}</span>
      </span>
    );
  }

  const diffMs = now - ts;
  const freshMs = freshHours * 3_600_000;
  const staleMs = staleHours * 3_600_000;
  const tier = classifyFreshness(diffMs, freshMs, staleMs);
  const baseText = formatAgo(diffMs);
  const text = tier === 'stale' ? `${baseText} — Data may be outdated` : baseText;

  const tierClass =
    tier === 'fresh' ? 'fresh' :
    tier === 'stale' ? 'stale' :
    tier === 'unknown' ? 'stale' :
    null;

  return (
    <span
      className={joinClasses('freshness-indicator', tierClass, className)}
      role="status"
      aria-live="polite"
      title={lastUpdated}
    >
      {label && <span className="freshness-label">{label}{' '}</span>}
      <span className="freshness-text">{text}</span>
    </span>
  );
}

function joinClasses(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
