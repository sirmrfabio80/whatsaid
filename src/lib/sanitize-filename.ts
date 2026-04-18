/**
 * Sanitize a filename so it is safe to use as a Supabase Storage object key.
 *
 * Supabase Storage rejects keys containing many non-ASCII or punctuation
 * characters (e.g. curly quotes `’`, em-dashes `—`, accented letters, emoji).
 * This helper produces a deterministic, ASCII-only, storage-safe filename
 * while preserving the extension. The original (human-readable) filename
 * should still be stored separately for UI display.
 *
 * Rules:
 * - Split on the last `.` into base + extension
 * - Unicode-normalise (NFKD) and strip combining diacritics ("é" → "e")
 * - Replace any char outside `[A-Za-z0-9._-]` with `_`
 * - Collapse runs of `_`, trim leading/trailing `_` and `.`
 * - Empty base falls back to `audio`
 * - Lower-case extension
 * - Cap total length at ~120 chars
 */
export function sanitizeStorageFilename(name: string): string {
  const trimmed = (name ?? "").trim();
  const lastDot = trimmed.lastIndexOf(".");
  const hasExt = lastDot > 0 && lastDot < trimmed.length - 1;
  const rawBase = hasExt ? trimmed.slice(0, lastDot) : trimmed;
  const rawExt = hasExt ? trimmed.slice(lastDot + 1) : "";

  const clean = (s: string) =>
    s
      .normalize("NFKD")
      // Strip combining diacritical marks
      .replace(/[\u0300-\u036f]/g, "")
      // Replace anything outside the safe set with underscore
      .replace(/[^A-Za-z0-9._-]/g, "_")
      // Collapse runs of underscores
      .replace(/_{2,}/g, "_")
      // Trim leading/trailing underscores and dots
      .replace(/^[_.]+|[_.]+$/g, "");

  let base = clean(rawBase);
  if (!base) base = "audio";

  const ext = clean(rawExt).toLowerCase();

  let result = ext ? `${base}.${ext}` : base;

  // Cap total length, preserving extension if present.
  const MAX_LEN = 120;
  if (result.length > MAX_LEN) {
    if (ext) {
      const allowedBase = Math.max(1, MAX_LEN - ext.length - 1);
      result = `${base.slice(0, allowedBase)}.${ext}`;
    } else {
      result = result.slice(0, MAX_LEN);
    }
  }

  return result;
}
