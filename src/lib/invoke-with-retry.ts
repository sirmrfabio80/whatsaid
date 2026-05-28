import { supabase } from "@/integrations/supabase/client";
import type { FunctionInvokeOptions } from "@supabase/functions-js";
import { recordEdgeAttempt, recordEdgeFinal } from "@/lib/edge-telemetry";


/**
 * Retry policy for transient Edge Function failures.
 *
 * Retries on:
 *  - Network/fetch errors (no HTTP response received)
 *  - HTTP 408 Request Timeout
 *  - HTTP 425 Too Early
 *  - HTTP 429 Too Many Requests
 *  - HTTP 5xx (except 501 Not Implemented)
 *
 * Does NOT retry on:
 *  - 4xx client errors (validation, auth, conflict, forbidden, not found, etc.)
 *  - Successful responses
 */

export interface InvokeWithRetryOptions {
  /** Max attempts including the first call. Default 3. */
  maxAttempts?: number;
  /** Base delay in ms for exponential backoff. Default 300. */
  baseDelayMs?: number;
  /** Cap on per-attempt delay in ms. Default 4000. */
  maxDelayMs?: number;
  /** Optional callback for observability. */
  onRetry?: (info: { attempt: number; delayMs: number; status?: number; reason: string }) => void;
}

const TRANSIENT_STATUSES = new Set([408, 425, 429]);

function isTransientStatus(status: number | undefined): boolean {
  if (status === undefined) return false;
  if (TRANSIENT_STATUSES.has(status)) return true;
  if (status >= 500 && status <= 599 && status !== 501) return true;
  return false;
}

async function extractStatus(error: unknown): Promise<number | undefined> {
  if (!error || typeof error !== "object") return undefined;
  const ctx = (error as { context?: unknown }).context;
  if (ctx && typeof ctx === "object" && "status" in ctx) {
    const s = (ctx as { status?: unknown }).status;
    if (typeof s === "number") return s;
  }
  return undefined;
}

function classifyError(error: unknown): string {
  if (!error) return "unknown";
  const name = (error as { name?: string }).name;
  if (name === "FunctionsFetchError") return "network";
  if (name === "FunctionsHttpError") return "http";
  if (name === "FunctionsRelayError") return "relay";
  return name ?? "unknown";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function invokeWithRetry<T = unknown>(
  functionName: string,
  options: FunctionInvokeOptions = {},
  const maxAttempts = Math.max(1, retry.maxAttempts ?? 3);
  const baseDelay = retry.baseDelayMs ?? 300;
  const maxDelay = retry.maxDelayMs ?? 4000;

  let lastResult: { data: T | null; error: unknown } = { data: null, error: null };
  const startedAt = Date.now();
  let lastStatus: number | undefined;
  let lastReason: string | undefined;
  let attemptsUsed = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptsUsed = attempt;
    const attemptStart = Date.now();
    const result = await supabase.functions.invoke<T>(functionName, options);
    const attemptMs = Date.now() - attemptStart;
    lastResult = { data: (result.data ?? null) as T | null, error: result.error };

    if (!result.error) {
      recordEdgeAttempt({ functionName, attempt, reason: "ok", durationMs: attemptMs });
      recordEdgeFinal({
        functionName,
        attempts: attempt,
        outcome: "success",
        totalMs: Date.now() - startedAt,
      });
      return lastResult;
    }

    const status = await extractStatus(result.error);
    const reason = classifyError(result.error);
    lastStatus = status;
    lastReason = reason;
    const transient = reason === "network" || reason === "relay" || isTransientStatus(status);

    recordEdgeAttempt({
      functionName,
      attempt,
      status,
      reason: transient ? `${reason}:transient` : reason,
      durationMs: attemptMs,
    });

    if (!transient || attempt === maxAttempts) {
      recordEdgeFinal({
        functionName,
        attempts: attempt,
        outcome: transient ? "transient" : "fatal",
        status,
        reason,
        totalMs: Date.now() - startedAt,
      });
      return lastResult;
    }

    const expo = Math.min(maxDelay, baseDelay * 2 ** (attempt - 1));
    const jitter = Math.floor(Math.random() * Math.min(250, expo));
    const delayMs = expo + jitter;

    retry.onRetry?.({ attempt, delayMs, status, reason });
    await sleep(delayMs);
  }

  // Defensive: loop always returns above, but record a final event if not.
  recordEdgeFinal({
    functionName,
    attempts: attemptsUsed,
    outcome: "fatal",
    status: lastStatus,
    reason: lastReason,
    totalMs: Date.now() - startedAt,
  });
  return lastResult;
}

}
