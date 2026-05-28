/**
 * Generate a client-side idempotency key.
 *
 * Used by create-job / record-consent / record-tos-acceptance so that
 * automatic retries (network blip, edge function cold-start 5xx, etc.)
 * never create duplicate jobs or duplicate consent rows: the server
 * detects the repeated key and replays the original response.
 *
 * Pass the SAME key across all retries of one logical operation; generate
 * a NEW key for each fresh user-initiated attempt.
 */
export function newIdempotencyKey(prefix?: string): string {
  // crypto.randomUUID is available in all evergreen browsers.
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  return prefix ? `${prefix}_${uuid}` : uuid;
}
