/**
 * Thin wrapper around the `check_and_record_usage` RPC for edge functions.
 *
 * Returns `null` when the quota allows the action (already recorded), or a
 * ready-to-return 429 Response when the caller has exceeded the cap.
 *
 * Usage:
 *   const blocked = await enforceQuota(supabase, {
 *     userId,
 *     action: "regenerate_output",
 *     scope: "user_day",
 *     window: "1 day",
 *     limit: 100,
 *   });
 *   if (blocked) return blocked;
 */
import { corsHeaders } from "./cors.ts";
import type { SupabaseClient } from "./supabase.ts";

export type QuotaScope =
  | "user_day"
  | "user_lifetime"
  | "job_day"
  | "job_lifetime"
  | "recipient_job_day";

export interface QuotaParams {
  userId: string;
  action: string;
  scope: QuotaScope;
  limit: number;
  /** Postgres interval string, e.g. "1 day" or "1 hour". Omit for *_lifetime scopes. */
  window?: string;
  jobId?: string;
  scopeKey?: string;
  units?: number;
  metadata?: Record<string, unknown>;
}

export async function enforceQuota(
  supabase: SupabaseClient,
  params: QuotaParams,
): Promise<Response | null> {
  const { data, error } = await supabase.rpc("check_and_record_usage", {
    p_user_id: params.userId,
    p_action: params.action,
    p_scope: params.scope,
    p_job_id: params.jobId ?? null,
    p_scope_key: params.scopeKey ?? null,
    p_window: params.window ?? null,
    p_limit: params.limit,
    p_units: params.units ?? 1,
    p_metadata: params.metadata ?? null,
  });

  // Fail-open on infrastructure errors — quotas are a guardrail, not the
  // only line of defense. Log loudly and let the action proceed.
  if (error) {
    console.error(`[quota] RPC error for action=${params.action}:`, error);
    return null;
  }

  const result = data as { allowed: boolean; used: number; limit: number; scope: string };
  if (result?.allowed) return null;

  return new Response(
    JSON.stringify({
      error: "Quota exceeded",
      action: params.action,
      scope: params.scope,
      used: result?.used ?? null,
      limit: result?.limit ?? params.limit,
    }),
    {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
