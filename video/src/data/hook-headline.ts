/**
 * Turns a tracker headline into something usable as a two-second hook.
 *
 * Tracker headlines are written for a dashboard: several developments joined
 * with semicolons, carrying counters and day markers. Rendering one at display
 * size produces the exact wall of text #157 objects to — the first render of
 * the hook composition put this on screen:
 *
 *   "Somalia: Israel Appoints First Ambassador to Somaliland, Deepening FGS
 *    Sovereignty Crisis; Honour 25 Crew Still Held Day 2; 19 Days to
 *    Presidential Term Expiry"
 *
 * Three separate stories filling half the frame. So the hook-first structure
 * alone changes nothing without this step, which is the point the issue makes
 * about hook generation — this is the deterministic floor beneath it, not a
 * replacement for writing real hooks.
 */

/** Longest headline that still reads at display size in a 1080x1920 frame. */
const MAX_CHARS = 72;

export function deriveHookHeadline(raw: string | undefined, fallback = 'Breaking'): string {
  if (!raw) return fallback;

  // Take the first clause. Dashboard headlines join independent developments
  // with semicolons; only the first one is the lead.
  let text = raw.split(';')[0].trim();

  // Drop a trailing subordinate clause when the headline is still too long —
  // "X, deepening Y" keeps X, which is the news.
  if (text.length > MAX_CHARS && text.includes(',')) {
    const firstComma = text.slice(0, MAX_CHARS + 20).lastIndexOf(',');
    if (firstComma > 20) text = text.slice(0, firstComma).trim();
  }

  // Last resort: cut at a word boundary rather than mid-word.
  if (text.length > MAX_CHARS) {
    const cut = text.lastIndexOf(' ', MAX_CHARS);
    text = (cut > 20 ? text.slice(0, cut) : text.slice(0, MAX_CHARS)).trim();
    text = text.replace(/[,;:—–-]$/, '');
  }

  return text.length > 0 ? text : fallback;
}
