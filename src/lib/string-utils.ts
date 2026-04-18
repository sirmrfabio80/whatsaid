/**
 * Generic string utilities. Keep this module dependency-free.
 */

/**
 * Escape a string so it can be safely embedded into a `RegExp` literal.
 * Mirrors the canonical MDN implementation.
 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
