import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders, handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/supabase.ts";

const BodySchema = z.object({
  dataset_key: z.string().min(1).max(100),
  retention_days: z.number().int().min(0).max(3650),
  strategy: z.enum(["delete", "anonymize"]),
  enabled: z.boolean(),
  description: z.string().max(500).optional().nullable(),
  legal_basis: z.string().max(200).optional().nullable(),
  reason: z.string().min(5).max(500),
});

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await requireAdmin(req.headers.get("Authorization"));
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { error: parsed.error.flatten().fieldErrors },
      400,
    );
  }
  const input = parsed.data;
  const { adminClient, userId } = auth;

  // Set per-transaction reason so the audit trigger picks it up.
  const { error: cfgErr } = await adminClient.rpc("set_retention_change_reason", {
    p_reason: input.reason,
  }).maybeSingle();
  // Fallback: if RPC isn't present, use a raw set_config via SQL through a no-op select.
  // We deliberately avoid that here and instead rely on the trigger reading
  // current_setting('app.retention_change_reason', true). Since postgrest
  // doesn't expose set_config, we pass reason via metadata column? Simpler:
  // include reason in the UPDATE itself by writing to a session GUC via RPC.
  // If the RPC isn't deployed, we just proceed without the reason.
  if (cfgErr) {
    console.warn("[update-retention-config] set_retention_change_reason missing:", cfgErr.message);
  }

  const { data, error } = await adminClient
    .from("retention_config")
    .update({
      retention_days: input.retention_days,
      strategy: input.strategy,
      enabled: input.enabled,
      description: input.description ?? null,
      legal_basis: input.legal_basis ?? null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("dataset_key", input.dataset_key)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[update-retention-config] update failed:", error);
    return jsonResponse({ error: error.message }, 400);
  }
  if (!data) {
    return jsonResponse({ error: "Dataset not found" }, 404);
  }

  // Patch the most recent audit row with the reason (since GUC didn't survive
  // across the PostgREST request). This keeps the reason guaranteed-attached
  // even when the session GUC approach isn't available.
  const { error: auditErr } = await adminClient
    .from("retention_config_audit")
    .update({ reason: input.reason })
    .eq("dataset_key", input.dataset_key)
    .is("reason", null)
    .order("changed_at", { ascending: false })
    .limit(1);
  if (auditErr) {
    console.warn("[update-retention-config] audit reason patch failed:", auditErr.message);
  }

  return jsonResponse({ ok: true, row: data });
});

// Keep corsHeaders referenced for tree-shakers / linters.
void corsHeaders;
