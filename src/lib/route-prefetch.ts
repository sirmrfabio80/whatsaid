/**
 * Lightweight route prefetching.
 *
 * Warms the JS chunks for the routes a user is most likely to visit next,
 * scheduled at idle time (or 2s timeout fallback) so it never competes with
 * the initial render or LCP.
 *
 * Honors Save-Data and slow-network signals (2g/slow-2g) — we skip
 * prefetching entirely in those cases to avoid wasting users' data.
 *
 * The dynamic `import()` calls below MUST stay textually identical to the
 * `lazy(() => import("./pages/X"))` calls in `App.tsx` so Vite/Rollup
 * de-duplicates them to the same chunk. Otherwise prefetch creates a
 * second copy and saves nothing.
 */

type PrefetchFn = () => Promise<unknown>;

// Keyed by current pathname → list of likely next-route loaders.
// Keep the list short (≤3) per page so we don't flood the network.
const PREFETCH_MAP: Record<string, PrefetchFn[]> = {
  "/": [
    () => import("./../pages/Convert"),
    () => import("./../pages/Pricing"),
    () => import("./../pages/Help"),
  ],
  "/pricing": [
    () => import("./../pages/Convert"),
    () => import("./../pages/Login"),
    () => import("./../pages/Signup"),
  ],
  "/help": [
    () => import("./../pages/Convert"),
    () => import("./../pages/Pricing"),
  ],
  "/login": [
    () => import("./../pages/Convert"),
    () => import("./../pages/Signup"),
  ],
  "/signup": [
    () => import("./../pages/Convert"),
    () => import("./../pages/Login"),
  ],
  "/convert": [
    () => import("./../pages/History"),
    () => import("./../pages/JobDetail"),
  ],
  "/history": [
    () => import("./../pages/JobDetail"),
    () => import("./../pages/Convert"),
  ],
};

function shouldSkipPrefetch(): boolean {
  if (typeof navigator === "undefined") return true;

  // Honor Save-Data header / slow connections.
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;

  if (conn?.saveData) return true;
  if (conn?.effectiveType === "2g" || conn?.effectiveType === "slow-2g") return true;

  return false;
}

function scheduleIdle(cb: () => void): void {
  const w = window as Window & {
    requestIdleCallback?: (cb: IdleRequestCallback, opts?: { timeout?: number }) => number;
  };
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(() => cb(), { timeout: 2000 });
  } else {
    setTimeout(cb, 1500);
  }
}

let prefetchedFor: string | null = null;

/**
 * Trigger prefetch for the routes likely to be visited from `pathname`.
 * Safe to call repeatedly — work is de-duplicated per pathname and the
 * underlying dynamic imports are themselves idempotent.
 */
export function prefetchLikelyRoutes(pathname: string): void {
  if (typeof window === "undefined") return;
  if (prefetchedFor === pathname) return;
  if (shouldSkipPrefetch()) return;

  const loaders = PREFETCH_MAP[pathname];
  if (!loaders || loaders.length === 0) return;

  prefetchedFor = pathname;

  scheduleIdle(() => {
    // Fire-and-forget; swallow errors so a failed prefetch never surfaces.
    for (const load of loaders) {
      load().catch(() => {});
    }
  });
}
