import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();

    const STALE_MINUTES = 10;

    // Use updated_at for staleness — gives active jobs more time
    const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

    const { data: staleJobs, error: fetchErr } = await supabase
      .from("async_jobs")
      .select("id, user_id, title, resource_url")
      .eq("job_type", "pdf_export")
      .eq("status", "processing")
      .lt("updated_at", cutoff);

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
    let cleaned = 0;

    for (const job of staleJobs) {
      // Skip if it already has a resource_url (completed upload, status update may have lagged)
      if (job.resource_url) {
        console.log(`[cleanup-stale-jobs] Skipping ${job.id} — has resource_url`);
        continue;
      }

      // Check for existing failure notification to prevent duplicates
      const { data: existingNotif } = await supabase
        .from("notifications")
        .select("id")
        .eq("async_job_id", job.id)
        .eq("status", "error")
        .limit(1);

      // Mark as failed
      await supabase
        .from("async_jobs")
        .update({
          status: "failed",
          error_message: "Export timed out — please try again",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      // Only create failure notification if one doesn't already exist
      if (!existingNotif || existingNotif.length === 0) {
        await supabase.from("notifications").insert({
          user_id: job.user_id,
          type: "pdf_export_failed",
          title: job.title || "PDF export",
          description: "Export timed out — please try again",
          status: "error",
          async_job_id: job.id,
        });
      }

      cleaned++;
    }

    console.log(`[cleanup-stale-jobs] Cleaned ${cleaned} stale job(s)`);

    return new Response(JSON.stringify({ cleaned }), {
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
