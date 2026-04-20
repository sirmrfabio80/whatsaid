/**
 * Shared constants for the stale-job watchdog.
 *
 * Mirrors values used by `supabase/functions/watchdog-stale-jobs/index.ts`.
 * Keep these in sync — the admin dashboard filters jobs/refunds by matching
 * against these strings, and History surfaces user-friendly variants.
 */

/** Substring present in `jobs.error_message` for watchdog-failed jobs (any cause). */
export const TIMEOUT_PATTERN = "marked failed by watchdog";

/**
 * Substring present in `jobs.error_message` for jobs whose browser-side
 * upload/enhance step never completed (tab closed, mobile suspend, worker crash).
 * Covers BOTH the watchdog-emitted message ("Upload interrupted — marked failed
 * by watchdog") and the manually-set message used when an admin marks a single
 * stuck job ("Upload interrupted — audio enhancement did not complete").
 */
export const UPLOAD_INTERRUPTED_PATTERN = "Upload interrupted";

/** Prefix used for `credit_transactions.reason` on watchdog refunds. */
export const REFUND_REASON_PREFIX = "Refund: stale job";

/**
 * Returns true when a job's `error_message` indicates the upload was
 * interrupted client-side rather than a transcription/post-process failure.
 * Used by History to render a clearer "Upload interrupted — retry" CTA.
 */
export function isUploadInterrupted(errorMessage: string | null | undefined): boolean {
  return !!errorMessage && errorMessage.includes(UPLOAD_INTERRUPTED_PATTERN);
}
