/**
 * In-memory dedup cache for client-generated export artifacts (DOCX, TXT,
 * JSON). Keyed by `(jobId, format, contentHash)` so:
 *
 *   - Re-downloading the same format for an unchanged transcript reuses the
 *     same `Blob` instead of re-running `Packer.toBlob` / re-serialising.
 *   - Editing the transcript/summary changes the hash and forces a fresh
 *     build (cache miss).
 *   - Changing the format (e.g. DOC → TXT) misses, since the artifact
 *     payload differs.
 *
 * Unlike PDF, these formats are not uploaded anywhere — the cache only
 * avoids redundant CPU work and memory churn on the same tab. Bounded with
 * a small LRU to keep total Blob retention modest.
 */
import type { CanonicalExportData } from "@/lib/export-types";

export type CacheableFormat = "txt" | "json" | "doc";

interface CacheEntry {
  blob: Blob;
  filename: string;
  insertedAt: number;
}

const MAX_ENTRIES = 12;
const cache = new Map<string, CacheEntry>();

/** SHA-256 hash of the canonical payload, truncated to 32 hex chars. */
export async function hashExportData(data: CanonicalExportData): Promise<string> {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function cacheKey(jobId: string, format: CacheableFormat, hash: string): string {
  return `${jobId}:${format}:${hash}`;
}

export function readCache(
  jobId: string,
  format: CacheableFormat,
  hash: string,
): CacheEntry | null {
  const key = cacheKey(jobId, format, hash);
  const hit = cache.get(key);
  if (!hit) return null;
  // Touch: re-insert to bump LRU order
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

export function writeCache(
  jobId: string,
  format: CacheableFormat,
  hash: string,
  blob: Blob,
  filename: string,
): void {
  const key = cacheKey(jobId, format, hash);
  cache.set(key, { blob, filename, insertedAt: Date.now() });
  // Evict oldest entries beyond the cap.
  while (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

/** Trigger a download from a cached `Blob` without recreating it. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
