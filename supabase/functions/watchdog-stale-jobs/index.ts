/**
 * Stale-job watchdog.
 *
 * Two-phase recovery for jobs stuck in `processing`:
 *
 *   Phase A — Retry (RETRY_AFTER_MINUTES, default 15 min):
 *     If a job has been processing for >15 min, has no transcript output yet,
 *     and has not already been retried, re-kick the `transcribe` function once
 *     and bump `watchdog_retry_count`. This recovers from transient edge
 *     function crashes / lost background work without losing the job.
 *
 *   Phase B — Hard fail (STALE_MINUTES, default 20 min):
 *     If a job is still stuck after the retry grace window, mark it `failed`,
 *     refund credits, delete the orphan temp-audio file, and notify the user.
 *
 * Also performs a secondary sweep over already-failed jobs whose temp-audio
 * file was never cleaned up (audio_deleted_at IS NULL) to garbage-collect
 * orphan storage objects from earlier crashes.
 *
 * Designed to be invoked on a schedule (e.g. pg_cron every 5 minutes).
 */
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const RETRY_AFTER_MINUTES = 15;
const STALE_MINUTES = 20;
const ORPHAN_LOOKBACK_HOURS = 24;
export const TIMEOUT_MESSAGE = "Job timed out — marked failed by watchdog";

async function deleteTempAudio(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
  tempFilePath: string | null,
): Promise<boolean> {
  if (!tempFilePath) return false;
  const { error } = await supabase.storage.from("temp-audio").remove([tempFilePath]);
  if (error) {
    console.error(`[watchdog-stale-jobs] Storage delete failed for ${jobId}:`, error.message);
    return false;
  }
  await supabase
    .from("jobs")
    .update({ audio_deleted_at: new Date().toISOString() })
    .eq("id", jobId);
  return true;
}

/**
 * Has this job already produced a transcript output? Used to decide whether a
 * stuck job is salvageable via a retry (no transcript yet → transcribe never
 * finished → safe to retry) vs. truly stuck downstream (transcript exists →
 * post-process is the bottleneck → don't re-run transcribe).
 */
async function hasTranscriptOutput(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("job_outputs")
    .select("id")
    .eq("job_id", jobId)
    .eq("output_type", "transcript")
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function kickoffTranscribe(jobId: string): Promise<boolean> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("[watchdog-stale-jobs] Missing SUPABASE_URL or SERVICE_ROLE_KEY — cannot retry");
    return false;
  }
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/transcribe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ job_id: jobId }),
    });
    // Always consume the body to avoid resource leaks.
    await res.text().catch(() => "");
    return res.ok || res.status === 202;
  } catch (err) {
    console.error(`[watchdog-stale-jobs] Retry kickoff failed for ${jobId}:`, err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    const now = Date.now();
    const retryCutoff = new Date(now - RETRY_AFTER_MINUTES * 60 * 1000).toISOString();
    const staleCutoff = new Date(now - STALE_MINUTES * 60 * 1000).toISOString();

    // ---- Phase A: retry candidates (15-20 min old, no retry yet) ----
    const { data: retryCandidates } = await supabase
      .from("jobs")
      .select("id, watchdog_retry_count, updated_at" as never)
      .eq("status", "processing")
      .lt("updated_at", retryCutoff)
      .gte("updated_at", staleCutoff);

    let retried = 0;
    let retrySkipped = 0;

    for (const row of retryCandidates ?? []) {
      const job = row as { id: string; watchdog_retry_count: number | null };
      if ((job.watchdog_retry_count ?? 0) >= 1) {
        retrySkipped++;
        continue;
      }

      // Only retry if no transcript exists yet — otherwise we'd duplicate work.
      const hasTranscript = await hasTranscriptOutput(supabase, job.id);
      if (hasTranscript) {
        retrySkipped++;
        continue;
      }

      // Atomically claim the retry slot to avoid duplicate kickoffs across
      // overlapping watchdog runs.
      const { data: claimed } = await supabase
        .from("jobs")
        .update({
          watchdog_retry_count: 1,
          updated_at: new Date().toISOString(),
          processing_stage: "queued",
        } as never)
        .eq("id", job.id)
        .eq("status", "processing")
        .eq("watchdog_retry_count", job.watchdog_retry_count ?? 0)
        .select("id")
        .maybeSingle();

      if (!claimed) {
        retrySkipped++;
        continue;
      }

      const ok = await kickoffTranscribe(job.id);
      if (ok) {
        retried++;
        console.log(`[watchdog-stale-jobs] Retried transcribe for job ${job.id}`);
      } else {
        console.warn(`[watchdog-stale-jobs] Retry kickoff returned non-ok for job ${job.id}`);
      }
    }

    // ---- Phase B: hard-fail jobs older than STALE_MINUTES ----
    const { data: staleJobs, error: fetchErr } = await supabase
      .from("jobs")
      .select("id, user_id, title, file_name, credits_charged, temp_file_path, audio_deleted_at")
      .eq("status", "processing")
      .lt("updated_at", staleCutoff);

    if (fetchErr) {
      console.error("[watchdog-stale-jobs] Fetch error:", fetchErr.message);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let cleaned = 0;
    let refunded = 0;
    let audioDeleted = 0;

    for (const job of staleJobs ?? []) {
      // 1. Mark job as failed (guard against races: only update if still processing).
      const { data: updated, error: updateErr } = await supabase
        .from("jobs")
        .update({ status: "failed", error_message: TIMEOUT_MESSAGE })
        .eq("id", job.id)
        .eq("status", "processing")
        .select("id")
        .maybeSingle();

      if (updateErr || !updated) continue;
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

      // 3. Clean up orphaned temp-audio file (privacy: must not retain).
      if (!job.audio_deleted_at && job.temp_file_path) {
        if (await deleteTempAudio(supabase, job.id, job.temp_file_path)) {
          audioDeleted++;
        }
      }

      // 4. Notify the user (skip duplicate failure notifications for this job).
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

    // ---- Secondary sweep: orphan temp-audio files for already-failed jobs ----
    const orphanCutoff = new Date(
      Date.now() - ORPHAN_LOOKBACK_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const { data: orphanJobs } = await supabase
      .from("jobs")
      .select("id, temp_file_path")
      .eq("status", "failed")
      .is("audio_deleted_at", null)
      .not("temp_file_path", "is", null)
      .gt("updated_at", orphanCutoff)
      .limit(100);

    let orphansDeleted = 0;
    for (const job of orphanJobs ?? []) {
      if (await deleteTempAudio(supabase, job.id, job.temp_file_path)) {
        orphansDeleted++;
      }
    }

    console.log(
      `[watchdog-stale-jobs] retried=${retried} retry_skipped=${retrySkipped} cleaned=${cleaned} refunded=${refunded} audio=${audioDeleted} orphans=${orphansDeleted}`,
    );

    return new Response(
      JSON.stringify({
        retried,
        retry_skipped: retrySkipped,
        cleaned,
        refunded,
        audio_deleted: audioDeleted,
        orphans_deleted: orphansDeleted,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[watchdog-stale-jobs] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
