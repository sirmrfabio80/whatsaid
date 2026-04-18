import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, createUserClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createUserClient(authHeader);
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub as string;

    const adminClient = createServiceClient();
    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: callerId,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: { job_id?: string; limit?: number } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const limit = Math.min(Math.max(body.limit ?? 20, 1), 50);

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

    // Fetch edge logs from analytics
    let edgeLogs: Array<{
      timestamp: number;
      function_name: string | null;
      level: string | null;
      event_message: string;
    }> = [];
    try {
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
