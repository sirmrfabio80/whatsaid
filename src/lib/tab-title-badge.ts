/**
 * Tab title badge — prefixes the document title with "(N) " when transcriptions
 * complete while the tab is hidden. Clears automatically when the tab regains
 * focus/visibility.
 *
 * Lightweight singleton; no React dependency. Safe to call from any context.
 */

let pendingCount = 0;
let originalTitle: string | null = null;
let listenersAttached = false;

const BADGE_RE = /^\(\d+\)\s+/;

function stripBadge(title: string): string {
  return title.replace(BADGE_RE, "");
}

function applyTitle() {
  if (typeof document === "undefined") return;
  const base = stripBadge(originalTitle ?? document.title);
  document.title = pendingCount > 0 ? `(${pendingCount}) ${base}` : base;
}

function ensureListeners() {
  if (listenersAttached || typeof window === "undefined") return;
  listenersAttached = true;

  const clear = () => {
    if (!document.hidden) clearTabBadge();
  };
  document.addEventListener("visibilitychange", clear);
  window.addEventListener("focus", clear);
}

/**
 * Increment the pending badge — only takes effect while the tab is hidden.
 * If the tab is visible, this is a no-op (user already sees the notification).
 */
export function incrementTabBadge() {
  if (typeof document === "undefined") return;
  ensureListeners();
  if (!document.hidden) return;
  if (originalTitle === null) {
    originalTitle = stripBadge(document.title);
  }
  pendingCount += 1;
  applyTitle();
}

/** Clear the badge immediately (e.g. on focus, or when user opens notifications). */
export function clearTabBadge() {
  if (pendingCount === 0) return;
  pendingCount = 0;
  applyTitle();
  originalTitle = null;
}
