/**
 * Client-side telemetry for Supabase Edge Function invocations.
 *
 * Captures per-attempt and per-call records so the Admin "Edge health" tab
 * can rank which functions fail most often, what reason / HTTP status they
 * fail with, and how long calls take end-to-end (including retries).
 *
 * Storage layers:
 *  - In-memory ring buffer (fast, full structured event list)
 *  - localStorage rollup keyed by function name (survives reloads, used by
 *    the admin dashboard to show top offenders without needing a backend
 *    table).
 *
 * Deliberately no PII: we never persist request bodies, response bodies,
 * tokens, headers, or user identifiers. Only function name, attempt count,
 * outcome, HTTP status, reason classification, and timestamps.
 */

export type EdgeOutcome = "success" | "transient" | "fatal";

export interface EdgeAttemptEvent {
  type: "attempt";
  functionName: string;
  attempt: number;
  status?: number;
  reason: string;
  durationMs: number;
  at: number;
}

export interface EdgeFinalEvent {
  type: "final";
  functionName: string;
  attempts: number;
  outcome: EdgeOutcome;
  status?: number;
  reason?: string;
  totalMs: number;
  at: number;
}

export type EdgeTelemetryEvent = EdgeAttemptEvent | EdgeFinalEvent;

interface RollupRow {
  functionName: string;
  total: number;
  success: number;
  fatal: number;
  retried: number;
  lastStatus?: number;
  lastReason?: string;
  lastOutcome?: EdgeOutcome;
  lastAt: number;
  avgMs: number;
  // Top reason counts so the admin can see "network: 12, http 503: 4".
  reasonCounts: Record<string, number>;
}

const RING_MAX = 200;
const STORAGE_KEY = "ws.edge.telemetry.v1";
const ring: EdgeTelemetryEvent[] = [];
const listeners = new Set<(events: readonly EdgeTelemetryEvent[]) => void>();

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function loadRollup(): Record<string, RollupRow> {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, RollupRow>;
  } catch {
    return {};
  }
}

function saveRollup(rollup: Record<string, RollupRow>): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rollup));
  } catch {
    // Quota exceeded or storage disabled — telemetry is best-effort.
  }
}

function pushEvent(evt: EdgeTelemetryEvent): void {
  ring.push(evt);
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
  for (const fn of listeners) {
    try {
      fn(ring);
    } catch {
      // Ignore listener errors.
    }
  }
}

function reasonKey(reason: string | undefined, status: number | undefined): string {
  if (status && status >= 400) return `${reason ?? "http"}:${status}`;
  return reason ?? "unknown";
}

export function recordEdgeAttempt(evt: Omit<EdgeAttemptEvent, "type" | "at">): void {
  pushEvent({ type: "attempt", at: Date.now(), ...evt });
}

export function recordEdgeFinal(evt: Omit<EdgeFinalEvent, "type" | "at">): void {
  const full: EdgeFinalEvent = { type: "final", at: Date.now(), ...evt };
  pushEvent(full);

  const rollup = loadRollup();
  const row: RollupRow = rollup[full.functionName] ?? {
    functionName: full.functionName,
    total: 0,
    success: 0,
    fatal: 0,
    retried: 0,
    lastAt: 0,
    avgMs: 0,
    reasonCounts: {},
  };

  const prevTotal = row.total;
  row.total = prevTotal + 1;
  row.avgMs = Math.round((row.avgMs * prevTotal + full.totalMs) / row.total);
  row.lastAt = full.at;
  row.lastOutcome = full.outcome;
  row.lastStatus = full.status;
  row.lastReason = full.reason;

  if (full.outcome === "success") {
    row.success += 1;
  } else {
    row.fatal += 1;
  }
  if (full.attempts > 1) row.retried += 1;

  if (full.outcome !== "success") {
    const key = reasonKey(full.reason, full.status);
    row.reasonCounts[key] = (row.reasonCounts[key] ?? 0) + 1;
  }

  rollup[full.functionName] = row;
  saveRollup(rollup);
}

export function getEdgeTelemetryEvents(): readonly EdgeTelemetryEvent[] {
  return ring;
}

export function getEdgeTelemetryRollup(): RollupRow[] {
  const rollup = loadRollup();
  return Object.values(rollup).sort((a, b) => b.fatal - a.fatal || b.total - a.total);
}

export function clearEdgeTelemetry(): void {
  ring.length = 0;
  if (isBrowser()) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  for (const fn of listeners) {
    try {
      fn(ring);
    } catch {
      // ignore
    }
  }
}

export function subscribeEdgeTelemetry(
  fn: (events: readonly EdgeTelemetryEvent[]) => void,
): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
