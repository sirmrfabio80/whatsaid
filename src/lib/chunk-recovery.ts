const CHUNK_RELOAD_KEY = "__ws_chunk_reload_at";
const CHUNK_RELOAD_COOLDOWN_MS = 10_000;

export function isChunkLoadError(value: unknown): boolean {
  const message =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : typeof value === "object" && value !== null && "message" in value
          ? String((value as { message?: unknown }).message ?? "")
          : "";

  const name =
    value instanceof Error
      ? value.name
      : typeof value === "object" && value !== null && "name" in value
        ? String((value as { name?: unknown }).name ?? "")
        : "";

  return (
    name === "ChunkLoadError" ||
    message.includes("Importing a module script failed") ||
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("error loading dynamically imported module") ||
    /ChunkLoadError/i.test(message)
  );
}

export function reloadOnceForChunkError(value: unknown): boolean {
  if (typeof window === "undefined" || !isChunkLoadError(value)) return false;

  const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || "0");
  if (Date.now() - last < CHUNK_RELOAD_COOLDOWN_MS) return false;

  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  window.location.reload();
  return true;
}