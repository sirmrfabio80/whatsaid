/**
 * prune-retention — sweeper that enforces the horizons configured in
 * `public.retention_config`. Supports a first-class `dry_run` mode so admins
 * (and staging) can preview what *would* be deleted/anonymised before any
 * mutation runs.
 *
 * Auth model:
 *   - service_role (cron / scripted)          → always allowed
 *   - authenticated admin (has_role('admin')) → allowed, useful for the
 *     admin UI "Run now" button
 *   - everyone else                           → 403
 *
 * Request body (all optional):
 *   {
 *     "dry_run":      boolean,         // default: true (safe by default)
 *     "dataset_keys": string[],        // restrict to a subset
 *     "batch_size":   number,          // per-dataset row cap, clamped
 *   }
 *
 * Response: per-dataset report { candidates, processed, dry_run, strategy }.
 * A row is also written to `cleanup_logs` for observability.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  buildPlan,
  clampBatchSize,
  type PlannedDataset,
} from "../_shared/retention-plan.ts";

interface DatasetReport {
  dataset_key: string;
  strategy: string;
  cutoff: string;
  candidates: number;
  processed: number;
  dry_run: boolean;
  error?: string;
}

async function isAdmin(supabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  // has_role lives in the `private` schema and isn't reachable over REST, so
  // we check user_roles directly with the service-role client.
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) return false;
  return !!data;
}

async function countCandidates(
  supabase: ReturnType<typeof createClient>,
  p: PlannedDataset,
): Promise<number> {
  let q = supabase
    .from(p.table)
    .select("*", { count: "exact", head: true })
    .lt(p.timestamp_column, p.cutoff_iso);
  if (p.extra_filter) {
    if (p.extra_filter.op === "not.is") q = q.not(p.extra_filter.column, "is", p.extra_filter.value);
    else q = q.is(p.extra_filter.column, p.extra_filter.value as never);
  }
  const { count, error } = await q;
  if (error) throw new Error(`count ${p.table}: ${error.message}`);
  return count ?? 0;
}

async function pickIdBatch(
  supabase: ReturnType<typeof createClient>,
  p: PlannedDataset,
  batchSize: number,
): Promise<string[]> {
  let q = supabase
    .from(p.table)
    .select("id")
    .lt(p.timestamp_column, p.cutoff_iso)
    .limit(batchSize);
  if (p.extra_filter) {
    if (p.extra_filter.op === "not.is") q = q.not(p.extra_filter.column, "is", p.extra_filter.value);
    else q = q.is(p.extra_filter.column, p.extra_filter.value as never);
  }
  const { data, error } = await q;
  if (error) throw new Error(`select ids ${p.table}: ${error.message}`);
  return (data ?? []).map((r: { id: string }) => r.id);
}

async function applyDataset(
  supabase: ReturnType<typeof createClient>,
  p: PlannedDataset,
  batchSize: number,
): Promise<number> {
  const ids = await pickIdBatch(supabase, p, batchSize);
  if (ids.length === 0) return 0;

  if (p.strategy === "delete") {
    const { error } = await supabase.from(p.table).delete().in("id", ids);
    if (error) throw new Error(`delete ${p.table}: ${error.message}`);
    return ids.length;
  }

  // anonymize: null out PII columns. Idempotent because the plan's
  // extra_filter (e.g. ip_hash not null) excludes already-anonymised rows.
  const patch: Record<string, null> = {};
  for (const col of p.anonymize_nulls ?? []) patch[col] = null;
  if (Object.keys(patch).length === 0) {
    throw new Error(`anonymize ${p.table}: no columns configured`);
  }
  const { error } = await supabase.from(p.table).update(patch).in("id", ids);
  if (error) throw new Error(`anonymize ${p.table}: ${error.message}`);
  return ids.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // --- auth gate ---------------------------------------------------------
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  let caller: "service" | "admin" | null = null;
  if (token && token === SERVICE_KEY) {
    caller = "service";
  } else if (token) {
    const { data: { user } } = await admin.auth.getUser(token);
    if (user && (await isAdmin(admin, user.id))) caller = "admin";
  }
  if (!caller) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- input -------------------------------------------------------------
  let body: { dry_run?: boolean; dataset_keys?: string[]; batch_size?: number } = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { body = {}; }
  }
  const dryRun = body.dry_run !== false; // default: true (safe)
  const batchSize = clampBatchSize(body.batch_size);

  // --- plan --------------------------------------------------------------
  const { data: cfgRows, error: cfgErr } = await admin
    .from("retention_config")
    .select("dataset_key, retention_days, strategy, enabled");
  if (cfgErr) {
    return new Response(JSON.stringify({ error: cfgErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const plan = buildPlan({
    rows: (cfgRows ?? []) as never,
    now: new Date(),
    onlyDatasets: body.dataset_keys,
  });

  // --- log run start -----------------------------------------------------
  const { data: logRow } = await admin
    .from("cleanup_logs")
    .insert({
      job_name: dryRun ? "prune-retention:dry-run" : "prune-retention",
      status: "running",
      metadata: { caller, batch_size: batchSize, planned: plan.planned.map((p) => p.dataset_key) },
    })
    .select("id")
    .single();

  // --- execute -----------------------------------------------------------
  const reports: DatasetReport[] = [];
  const errors: Array<{ dataset_key: string; error: string }> = [];
  const startedAt = Date.now();

  for (const p of plan.planned) {
    try {
      const candidates = await countCandidates(admin, p);
      let processed = 0;
      if (!dryRun && candidates > 0) {
        processed = await applyDataset(admin, p, batchSize);
      }
      reports.push({
        dataset_key: p.dataset_key,
        strategy: p.strategy,
        cutoff: p.cutoff_iso,
        candidates,
        processed,
        dry_run: dryRun,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ dataset_key: p.dataset_key, error: msg });
      reports.push({
        dataset_key: p.dataset_key,
        strategy: p.strategy,
        cutoff: p.cutoff_iso,
        candidates: 0,
        processed: 0,
        dry_run: dryRun,
        error: msg,
      });
    }
  }

  if (logRow?.id) {
    await admin
      .from("cleanup_logs")
      .update({
        status: errors.length ? "failed" : "completed",
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        errors: errors,
        metadata: { caller, batch_size: batchSize, dry_run: dryRun, reports },
      })
      .eq("id", logRow.id);
  }

  return new Response(
    JSON.stringify({
      dry_run: dryRun,
      caller,
      batch_size: batchSize,
      planned: plan.planned.length,
      skipped: plan.skipped,
      reports,
      errors,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
