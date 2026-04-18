/**
 * Lightweight date/time formatters used in UI surfaces (notifications, etc.).
 *
 * For locale-aware date+time strings prefer `Intl.DateTimeFormat` directly.
 * These helpers return short, human-friendly relative strings.
 */

/**
 * Returns a short relative time string ("just now", "5m ago", "3h ago", "2d ago")
 * for a given ISO date string. English-only by design — caller can localise
 * downstream if needed.
 */
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
