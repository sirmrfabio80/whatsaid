/**
 * Stale-job watchdog.
 *
 * Finds transcription jobs that have been stuck in `processing` for more
 * than STALE_MINUTES with no `updated_at` activity, marks them `failed`,
 * refunds their credits, and emits a `job_failed` notification.
 *
 * Designed to be invoked on a schedule (e.g. pg_cron every 5 minutes).
 */
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const STALE_MINUTES = 20;
const TIMEOUT_MESSAGE = "Job timed out — marked failed by watchdog";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();

    const { data: staleJobs, error: fetchErr } = await supabase
      .from("jobs")
      .select("id, user_id, title, file_name, credits_charged")
      .eq("status", "processing")
      .lt("updated_at", cutoff);

    if (fetchErr) {
      console.error("[watchdog-stale-jobs] Fetch error:", fetchErr.message);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!staleJobs || staleJobs.length === 0) {
      return new Response(JSON.stringify({ cleaned: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[watchdog-stale-jobs] Found ${staleJobs.length} stale job(s)`);

    let cleaned = 0;
    let refunded = 0;

    for (const job of staleJobs) {
      // 1. Mark job as failed (guard against races: only update if still processing).
      const { data: updated, error: updateErr } = await supabase
        .from("jobs")
        .update({ status: "failed", error_message: TIMEOUT_MESSAGE })
        .eq("id", job.id)
        .eq("status", "processing")
        .select("id")
        .maybeSingle();

      if (updateErr || !updated) {
        // Either failed to update or job already moved out of processing.
        continue;
      }
      cleaned++;

      // 2. Refund credits if the user was charged and is not an admin.
      if (job.user_id && job.credits_charged > 0) {
        const { data: adminRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", job.user_id)
          .eq("role", "admin")
          .maybeSingle();

        if (!adminRole) {
          const { error: refundErr } = await supabase.rpc("add_credits", {
            p_user_id: job.user_id,
            p_amount: job.credits_charged,
            p_reason: `Refund: stale job ${job.id} (${TIMEOUT_MESSAGE})`,
          });
          if (refundErr) {
            console.error(
              `[watchdog-stale-jobs] Refund failed for job ${job.id}:`,
              refundErr.message,
            );
          } else {
            refunded++;
          }
        }
      }

      // 3. Notify the user (skip duplicate failure notifications for this job).
      if (job.user_id) {
        const { data: existingNotif } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", job.user_id)
          .eq("resource_type", "job")
          .eq("resource_id", job.id)
          .eq("type", "job_failed")
          .limit(1);

        if (!existingNotif || existingNotif.length === 0) {
          await supabase.from("notifications").insert({
            user_id: job.user_id,
            type: "job_failed",
            title: job.title || job.file_name || "Transcription",
            description: TIMEOUT_MESSAGE,
            status: "error",
            resource_type: "job",
            resource_id: job.id,
          });
        }
      }
    }

    console.log(`[watchdog-stale-jobs] Cleaned ${cleaned}, refunded ${refunded}`);

    return new Response(JSON.stringify({ cleaned, refunded }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[watchdog-stale-jobs] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
