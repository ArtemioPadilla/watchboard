/** Shared helpers for event display across mobile components. */

/** Map event type to its accent CSS variable. */
export function eventTypeColor(type: string): string {
  if (type === 'strike' || type === 'attack') return 'var(--accent-red)';
  if (type === 'retaliation' || type === 'response') return 'var(--accent-amber)';
  if (type === 'diplomatic' || type === 'politics') return 'var(--accent-blue)';
  if (type === 'ceasefire' || type === 'peace') return 'var(--accent-green)';
  return 'var(--border-light)';
}

/** Human-readable relative time from an ISO date string. */
export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
