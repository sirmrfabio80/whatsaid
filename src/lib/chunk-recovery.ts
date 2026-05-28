import { recordChunkFailure } from "./chunk-diagnostics";

const CHUNK_RELOAD_STATE_KEY = "__ws_chunk_reload_state";

/**
 * Configuration for the one-time reload mechanism with exponential backoff.
 *
 * - `maxAttempts`: hard cap on automatic reloads within a single session.
 *   Once exceeded, `reloadOnceForChunkError` stops reloading and lets the
 *   ChunkErrorBoundary render its fallback UI (manual Retry only).
 * - `backoffMs`: per-attempt cooldown. The Nth automatic reload requires
 *   that at least `backoffMs[N-1]` ms have passed since the previous reload.
 *   The last value is reused if attempts exceed the array length.
 * - `resetAfterMs`: if no chunk failure has been observed for this long,
 *   the attempt counter resets (a successful long-lived session is healthy).
 */
export type ChunkRecoveryConfig = {
  maxAttempts: number;
  backoffMs: readonly number[];
  resetAfterMs: number;
};

export const CHUNK_RECOVERY_CONFIG: ChunkRecoveryConfig = {
  maxAttempts: 3,
  backoffMs: [10_000, 60_000, 300_000],
  resetAfterMs: 10 * 60_000,
};

type ReloadState = {
  attempts: number;
  lastAt: number;
};

function readState(): ReloadState {
  try {
    const raw = sessionStorage.getItem(CHUNK_RELOAD_STATE_KEY);
    if (!raw) return { attempts: 0, lastAt: 0 };
    const parsed = JSON.parse(raw) as Partial<ReloadState>;
    return {
      attempts: Number(parsed.attempts ?? 0) || 0,
      lastAt: Number(parsed.lastAt ?? 0) || 0,
    };
  } catch {
    return { attempts: 0, lastAt: 0 };
  }
}

function writeState(state: ReloadState): void {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_STATE_KEY, JSON.stringify(state));
  } catch {
    /* sessionStorage unavailable — best-effort only */
  }
}

export function resetChunkReloadState(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_STATE_KEY);
  } catch {
    /* ignore */
  }
}

export function getChunkReloadState(): ReloadState {
  if (typeof sessionStorage === "undefined") return { attempts: 0, lastAt: 0 };
  return readState();
}

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

/**
 * Pure decision helper — exported for unit tests. Given the prior state and
 * current time, returns the next action and the state to persist.
 */
export function planChunkReload(
  state: ReloadState,
  now: number,
  config: typeof CHUNK_RECOVERY_CONFIG = CHUNK_RECOVERY_CONFIG,
): { action: "reload" | "skip-cooldown" | "skip-cap"; nextState: ReloadState } {
  // Reset counter if the last failure is old enough — the session has been
  // healthy and we can treat new failures as a fresh incident.
  const effective: ReloadState =
    state.lastAt && now - state.lastAt > config.resetAfterMs
      ? { attempts: 0, lastAt: 0 }
      : state;

  if (effective.attempts >= config.maxAttempts) {
    return { action: "skip-cap", nextState: effective };
  }

  const requiredBackoff =
    config.backoffMs[Math.min(effective.attempts, config.backoffMs.length - 1)];

  if (effective.lastAt && now - effective.lastAt < requiredBackoff) {
    return { action: "skip-cooldown", nextState: effective };
  }

  return {
    action: "reload",
    nextState: { attempts: effective.attempts + 1, lastAt: now },
  };
}

export function reloadOnceForChunkError(
  value: unknown,
  options?: { source?: "error" | "unhandledrejection" | "boundary"; evt?: Event },
): boolean {
  if (typeof window === "undefined" || !isChunkLoadError(value)) return false;

  // Log the failure to the in-app diagnostics ring buffer before any reload
  // decision so we capture even attempts that get suppressed by the cap.
  recordChunkFailure({
    value,
    source: options?.source ?? "boundary",
    evt: options?.evt,
  });

  const { action, nextState } = planChunkReload(readState(), Date.now());

  if (action !== "reload") {
    // Persist any reset that happened so the boundary UI reflects truth.
    writeState(nextState);
    return false;
  }

  writeState(nextState);
  window.location.reload();
  return true;
}
