import { cn } from "@/lib/utils";

/**
 * Shown inside Suspense while a lazy route chunk is loading.
 * Replaces `fallback={null}` so users never see a blank page
 * during normal navigation.
 */
export function PageLoadingFallback({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4",
        className,
      )}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="relative">
        <div className="h-10 w-10 rounded-full border-4 border-muted border-t-primary animate-spin" />
      </div>
      <p className="text-sm text-muted-foreground">Loading page…</p>
      <span className="sr-only">Page is loading, please wait.</span>
    </div>
  );
}
