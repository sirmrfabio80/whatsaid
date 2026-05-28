import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const auth = await requireAdmin(req.headers.get("Authorization"));
    if (!auth.ok) return auth.response;
    const { adminClient } = auth;

    let body: { job_id?: string; limit?: number } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const limit = Math.min(Math.max(body.limit ?? 20, 1), 50);

    // SECURITY: validate job_id is a UUID before any interpolation into
    // the analytics SQL string below (analytics endpoint does not support
    // parameterized queries, so we must lock the input shape).
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (body.job_id !== undefined && body.job_id !== null) {
      if (typeof body.job_id !== "string" || !UUID_RE.test(body.job_id)) {
        return new Response(
          JSON.stringify({ error: "job_id must be a UUID" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Fetch picker list (last N jobs)
    const { data: recentJobs, error: recentErr } = await adminClient
      .from("jobs")
      .select(
        "id, file_name, title, status, created_at, language_selected, language_detected, duration_seconds, user_id",
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (recentErr) throw recentErr;

    const jobId = body.job_id ?? recentJobs?.[0]?.id;
    if (!jobId) {
      return new Response(
        JSON.stringify({ job: null, outputs: [], recent_jobs: recentJobs ?? [], edge_logs: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch full job
    const { data: job, error: jobErr } = await adminClient
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (jobErr) throw jobErr;

    // Fetch outputs
    const { data: outputs, error: outErr } = await adminClient
      .from("job_outputs")
      .select("id, output_type, content, custom_prompt, metadata, raw_response, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });
    if (outErr) throw outErr;

    // Fetch upload attestation (Art. 6/14) if recorded.
    let uploadAttestation:
      | { id: string; version: string; accepted_at: string; metadata: unknown }
      | null = null;
    const consentId = (job as { upload_consent_id?: string } | null)?.upload_consent_id;
    if (consentId) {
      const { data: c } = await adminClient
        .from("consent_events")
        .select("id, version, accepted_at, metadata")
        .eq("id", consentId)
        .maybeSingle();
      if (c) uploadAttestation = c as typeof uploadAttestation;
    }

    // Fetch edge logs from analytics
    let edgeLogs: Array<{
      timestamp: number;
      function_name: string | null;
      level: string | null;
      event_message: string;
    }> = [];
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
      if (projectRef) {
        const sql = `
          select
            fl.timestamp,
            fl.event_message,
            m.function_id,
            m.level
          from function_logs fl
          cross join unnest(metadata) as m
          where fl.event_message like '%${jobId}%'
          order by fl.timestamp desc
          limit 80
        `.trim();

        const analyticsUrl = `${supabaseUrl}/analytics/v1/query`;
        const resp = await fetch(analyticsUrl, {
          method: "POST",
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sql }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const rows = (data?.result ?? data?.data ?? []) as Array<Record<string, unknown>>;
          edgeLogs = rows.map((r) => ({
            timestamp: Number(r.timestamp ?? 0),
            function_name: (r.function_id as string) ?? null,
            level: (r.level as string) ?? null,
            event_message: String(r.event_message ?? ""),
          }));
        } else {
          console.warn("[admin-get-job-details] analytics query failed", resp.status);
        }
      }
    } catch (logErr) {
      console.warn("[admin-get-job-details] edge logs fetch failed", logErr);
    }

    return new Response(
      JSON.stringify({
        job,
        outputs: outputs ?? [],
        recent_jobs: recentJobs ?? [],
        edge_logs: edgeLogs,
        upload_attestation: uploadAttestation,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[admin-get-job-details] error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
