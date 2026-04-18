/**
 * Shared constants for the stale-job watchdog.
 *
 * Mirrors values used by `supabase/functions/watchdog-stale-jobs/index.ts`.
 * Keep these in sync — the admin dashboard filters jobs/refunds by matching
 * against these strings.
 */

/** Substring present in `jobs.error_message` for watchdog-failed jobs. */
export const TIMEOUT_PATTERN = "marked failed by watchdog";

/** Prefix used for `credit_transactions.reason` on watchdog refunds. */
export const REFUND_REASON_PREFIX = "Refund: stale job";
