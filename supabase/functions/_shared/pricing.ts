/**
 * Server-side pricing constants — MUST match src/lib/pricing.ts byte-for-byte.
 * See src/test/pricing.shared.test.ts for parity enforcement.
 *
 * Rule: 1 credit covers up to 120 min of audio in a single file.
 * +1 credit per additional 120-min block. Hard ceiling 480 min (4 credits).
 */
export const MINUTES_PER_CREDIT = 120;
export const MAX_DURATION = 480 * 60; // seconds
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // bytes
export const MAX_CREDITS_PER_FILE = 4;

export function creditsForDuration(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 1;
  const minutes = durationSeconds / 60;
  return Math.max(1, Math.ceil(minutes / MINUTES_PER_CREDIT));
}
