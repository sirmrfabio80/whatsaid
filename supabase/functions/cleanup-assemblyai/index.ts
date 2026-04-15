import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

/**
 * Retries deletion of AssemblyAI transcripts that failed during initial cleanup.
 * Picks up jobs with assemblyai_delete_status = 'failed' and retries the DELETE call.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ASSEMBLYAI_API_KEY = Deno.env.get("ASSEMBLYAI_API_KEY");
    if (!ASSEMBLYAI_API_KEY) {
      throw new Error("ASSEMBLYAI_API_KEY is not configured");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch jobs with failed AssemblyAI deletion (limit batch)
    const { data: failedJobs, error: fetchErr } = await supabase
      .from("jobs")
      .select("id, assemblyai_transcript_id")
      .eq("assemblyai_delete_status", "failed")
      .not("assemblyai_transcript_id", "is", null)
      .limit(50);

    if (fetchErr) {
      throw new Error(`Failed to fetch retry candidates: ${fetchErr.message}`);
    }

    if (!failedJobs || failedJobs.length === 0) {
      return new Response(JSON.stringify({ message: "No failed deletions to retry", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[cleanup-assemblyai] Retrying ${failedJobs.length} failed deletions`);

    let deleted = 0;
    let stillFailed = 0;

    for (const job of failedJobs) {
      try {
        const deleteRes = await fetch(
          `${ASSEMBLYAI_BASE}/transcript/${job.assemblyai_transcript_id}`,
          {
            method: "DELETE",
            headers: { Authorization: ASSEMBLYAI_API_KEY },
          }
        );

        if (deleteRes.ok || deleteRes.status === 404) {
          // 404 = already gone, treat as success
          await supabase
            .from("jobs")
            .update({ assemblyai_delete_status: "deleted" })
            .eq("id", job.id);
          deleted++;
          console.log(`[cleanup-assemblyai] Deleted: ${job.assemblyai_transcript_id}`);
        } else {
          const errText = await deleteRes.text();
          console.error(
            `[cleanup-assemblyai] Still failing for ${job.assemblyai_transcript_id} [${deleteRes.status}]: ${errText}`
          );
          stillFailed++;
        }
      } catch (err) {
        console.error(`[cleanup-assemblyai] Error for ${job.assemblyai_transcript_id}:`, err);
        stillFailed++;
      }
    }

    return new Response(
      JSON.stringify({ deleted, still_failed: stillFailed, total: failedJobs.length }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[cleanup-assemblyai] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
