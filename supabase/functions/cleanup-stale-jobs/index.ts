import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const STALE_MINUTES = 5;

    // Find stale pdf_export jobs
    const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

    const { data: staleJobs, error: fetchErr } = await supabase
      .from("async_jobs")
      .select("id, user_id, title")
      .eq("job_type", "pdf_export")
      .eq("status", "processing")
      .lt("created_at", cutoff);

    if (fetchErr) {
      console.error("[cleanup-stale-jobs] Fetch error:", fetchErr.message);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!staleJobs || staleJobs.length === 0) {
      console.log("[cleanup-stale-jobs] No stale jobs found");
      return new Response(JSON.stringify({ cleaned: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[cleanup-stale-jobs] Found ${staleJobs.length} stale job(s)`);

    for (const job of staleJobs) {
      // Mark as failed
      await supabase
        .from("async_jobs")
        .update({
          status: "failed",
          error_message: "Export timed out — please try again",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      // Create failure notification for the user
      await supabase.from("notifications").insert({
        user_id: job.user_id,
        type: "job_failed",
        title: job.title || "PDF export",
        description: "Export timed out — please try again",
        status: "error",
        async_job_id: job.id,
      });
    }

    console.log(`[cleanup-stale-jobs] Cleaned ${staleJobs.length} stale job(s)`);

    return new Response(JSON.stringify({ cleaned: staleJobs.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[cleanup-stale-jobs] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
