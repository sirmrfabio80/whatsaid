import { cn } from "@/lib/utils";

export interface LoadingStateProps {
  /** Number of skeleton rows to render. Default: 3. */
  rows?: number;
  /** Optional title skeleton width (Tailwind class). */
  titleWidth?: string;
  /** Skeleton row height (Tailwind class). Default: h-20. */
  rowHeight?: string;
  className?: string;
}

/**
 * Generic skeleton placeholder for list-style pages (History, etc.).
 * Renders an optional title bar + N pulsing rows. Tokens-only so it
 * inherits the active theme automatically.
 */
export function LoadingState({
  rows = 3,
  titleWidth = "w-64",
  rowHeight = "h-20",
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn("space-y-3 motion-safe:skeleton-shimmer", className)}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      {titleWidth ? (
        <div className={cn("h-8 bg-muted rounded-lg animate-pulse mb-8", titleWidth)} />
      ) : null}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn("bg-muted rounded-xl animate-pulse", rowHeight)} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
