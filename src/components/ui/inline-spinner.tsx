import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type InlineSpinnerSize = "xs" | "sm" | "md" | "lg";

export interface InlineSpinnerProps {
  /** xs ≈ 14px (in dense buttons), sm ≈ 16px (default in buttons),
   *  md ≈ 20px (page hint), lg ≈ 40px (full-screen card). */
  size?: InlineSpinnerSize;
  /** Optional caption shown next to the spinner. */
  label?: string;
  /** Tone of the spinner + label. Defaults to inheriting current text color. */
  tone?: "current" | "primary" | "muted";
  /** Layout: inline (default) or centered block with vertical padding. */
  layout?: "inline" | "block";
  className?: string;
  /** Optional aria-label override (defaults to label or "Loading"). */
  ariaLabel?: string;
}

const SIZE_MAP: Record<InlineSpinnerSize, string> = {
  xs: "w-3.5 h-3.5",
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-10 h-10",
};

const TONE_MAP: Record<NonNullable<InlineSpinnerProps["tone"]>, string> = {
  current: "",
  primary: "text-primary",
  muted: "text-muted-foreground",
};

/**
 * Standard inline loading indicator. Use for:
 * - in-button progress (size="sm" or "xs", no label)
 * - inline section progress with caption (size="sm", layout="block", tone="muted")
 * - centered card overlays (size="lg", tone="primary")
 *
 * Visually distinct from <LoadingState> (skeleton placeholders) — this is a
 * live "working" indicator, not a layout placeholder.
 */
export function InlineSpinner({
  size = "sm",
  label,
  tone = "current",
  layout = "inline",
  className,
  ariaLabel,
}: InlineSpinnerProps) {
  const spinner = (
    <Loader2
      className={cn("animate-spin shrink-0", SIZE_MAP[size], TONE_MAP[tone])}
      aria-hidden={label ? "true" : undefined}
    />
  );

  const content = label ? (
    <>
      {spinner}
      <span>{label}</span>
    </>
  ) : (
    spinner
  );

  const a11yLabel = ariaLabel ?? label ?? "Loading";

  if (layout === "block") {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 py-8 text-sm",
          tone === "current" ? "text-muted-foreground" : TONE_MAP[tone],
          className,
        )}
        role="status"
        aria-live="polite"
        aria-label={label ? undefined : a11yLabel}
      >
        {content}
      </div>
    );
  }

  if (label) {
    return (
      <span
        className={cn("inline-flex items-center gap-1.5", TONE_MAP[tone], className)}
        role="status"
        aria-live="polite"
      >
        {content}
      </span>
    );
  }

  // Bare spinner — keep as a span with aria-label so it's announced.
  return (
    <span
      role="status"
      aria-label={a11yLabel}
      className={cn("inline-flex", className)}
    >
      {spinner}
    </span>
  );
}
