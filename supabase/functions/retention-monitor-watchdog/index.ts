/**
 * retention-monitor-watchdog — fires on a cron (every ~6h). Looks at the
 * latest `cleanup_logs` row for prune-retention (live or dry-run) and emits
 * a `missing_runs` alert if it hasn't seen one in MISSING_RUNS_HOURS.
 *
 * Auth: service_role (cron) or admin (manual test).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  dispatchAlerts,
  MISSING_RUNS_HOURS,
} from "../_shared/retention-alerts.ts";

async function isAdmin(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
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
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
      if (payload?.role === "service_role") caller = "service";
    } catch { /* ignore */ }
    if (!caller) {
      const { data: { user } } = await admin.auth.getUser(token);
      if (user && (await isAdmin(admin, user.id))) caller = "admin";
    }
  }
  if (!caller) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- find latest run ---------------------------------------------------
  const { data: latest } = await admin
    .from("cleanup_logs")
    .select("id, job_name, started_at")
    .in("job_name", ["prune-retention", "prune-retention:dry-run"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cutoff = Date.now() - MISSING_RUNS_HOURS * 3600 * 1000;
  const lastStartedAt = latest?.started_at ? new Date(latest.started_at).getTime() : 0;
  const stale = !latest || lastStartedAt < cutoff;

  let emailed = 0;
  if (stale) {
    emailed = await dispatchAlerts(
      admin as never,
      [{
        kind: "missing_runs",
        dataset_key: null,
        details: {
          last_run_id: latest?.id ?? null,
          last_job_name: latest?.job_name ?? null,
          last_started_at: latest?.started_at ?? null,
          threshold_hours: MISSING_RUNS_HOURS,
        },
      }],
      {
        runId: latest?.id ?? null,
        cleanupLogId: latest?.id ?? null,
        jobName: "retention-monitor-watchdog",
        mode: "live",
        datasetsForEmail: [],
        serviceKey: SERVICE_KEY,
        supabaseUrl: SUPABASE_URL,
      },
    );
  }

  return new Response(
    JSON.stringify({
      caller,
      stale,
      threshold_hours: MISSING_RUNS_HOURS,
      last_started_at: latest?.started_at ?? null,
      last_job_name: latest?.job_name ?? null,
      emails_sent: emailed,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
