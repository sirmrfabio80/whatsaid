/**
 * Stale-job watchdog.
 *
 * Finds transcription jobs that have been stuck in `processing` for more
 * than STALE_MINUTES with no `updated_at` activity, marks them `failed`,
 * refunds their credits, deletes any orphaned temp-audio file, and emits a
 * `job_failed` notification.
 *
 * Also sweeps jobs stuck in `uploading` for more than UPLOAD_STALE_MINUTES
 * (browser-side enhance/upload interrupted — tab closed, mobile suspend, or
 * worker crash) so they don't appear forever as in-progress in History.
 *
 * Also performs a secondary sweep over already-failed jobs whose temp-audio
 * file was never cleaned up (audio_deleted_at IS NULL) to garbage-collect
 * orphan storage objects from earlier crashes.
 *
 * Designed to be invoked on a schedule (e.g. pg_cron every 5 minutes).
 */
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const STALE_MINUTES = 30;
// Client emits a heartbeat every 60s while preparing/enhancing/uploading
// (see useJobHeartbeat). 20 min ≈ 20 missed heartbeats — enough margin to
// avoid false positives on very slow connections that still produce chunks.
const UPLOAD_STALE_MINUTES = 20;
const ORPHAN_LOOKBACK_HOURS = 24;
export const TIMEOUT_MESSAGE = "Job timed out — marked failed by watchdog";
export const UPLOAD_INTERRUPTED_MESSAGE =
  "Upload interrupted — marked failed by watchdog";

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

interface StaleJobRow {
  id: string;
  user_id: string | null;
  title: string | null;
  file_name: string | null;
  credits_charged: number;
  temp_file_path: string | null;
  audio_deleted_at: string | null;
}

interface SweepResult {
  cleaned: number;
  refunded: number;
  audioDeleted: number;
}

/**
 * Mark a single stale job as failed, refund credits, clean up audio, notify user.
 * Returns counters so the caller can aggregate them into the response payload.
 *
 * `fromStatus` guards against races (only flip if the row is still in the
 * expected status). `failureMessage` is persisted to `jobs.error_message`
 * AND included in the notification description.
 */
async function failStaleJob(
  supabase: ReturnType<typeof createServiceClient>,
  job: StaleJobRow,
  fromStatus: "processing" | "uploading",
  failureMessage: string,
): Promise<SweepResult> {
  const result: SweepResult = { cleaned: 0, refunded: 0, audioDeleted: 0 };

  // 1. Mark failed (race-safe).
  const { data: updated, error: updateErr } = await supabase
    .from("jobs")
    .update({ status: "failed", error_message: failureMessage })
    .eq("id", job.id)
    .eq("status", fromStatus)
    .select("id")
    .maybeSingle();

  if (updateErr || !updated) return result;
  result.cleaned = 1;

  // 2. Refund credits if the user was charged and is not an admin.
  // Jobs in `uploading` typically haven't been charged (process-job deducts
  // after upload), but this is still safe + defensive.
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
        p_reason: `Refund: stale job ${job.id} (${failureMessage})`,
      });
      if (refundErr) {
        console.error(
          `[watchdog-stale-jobs] Refund failed for job ${job.id}:`,
          refundErr.message,
        );
      } else {
        result.refunded = 1;
      }
    }
  }

  // 3. Clean up orphaned temp-audio file (privacy: must not retain).
  if (!job.audio_deleted_at && job.temp_file_path) {
    if (await deleteTempAudio(supabase, job.id, job.temp_file_path)) {
      result.audioDeleted = 1;
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
        description: failureMessage,
        status: "error",
        resource_type: "job",
        resource_id: job.id,
      });
    }
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    const now = Date.now();
    const processingCutoff = new Date(now - STALE_MINUTES * 60 * 1000).toISOString();
    const uploadingCutoff = new Date(now - UPLOAD_STALE_MINUTES * 60 * 1000).toISOString();

    // Fetch both stuck-processing AND stuck-uploading jobs in parallel.
    const [processingRes, uploadingRes] = await Promise.all([
      supabase
        .from("jobs")
        .select("id, user_id, title, file_name, credits_charged, temp_file_path, audio_deleted_at")
        .eq("status", "processing")
        .lt("updated_at", processingCutoff),
      supabase
        .from("jobs")
        .select("id, user_id, title, file_name, credits_charged, temp_file_path, audio_deleted_at")
        .eq("status", "uploading")
        .lt("updated_at", uploadingCutoff),
    ]);

    if (processingRes.error) {
      console.error("[watchdog-stale-jobs] Fetch error (processing):", processingRes.error.message);
      return new Response(JSON.stringify({ error: processingRes.error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (uploadingRes.error) {
      console.error("[watchdog-stale-jobs] Fetch error (uploading):", uploadingRes.error.message);
      return new Response(JSON.stringify({ error: uploadingRes.error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let cleaned = 0;
    let refunded = 0;
    let audioDeleted = 0;
    let uploadCleaned = 0;

    for (const job of processingRes.data ?? []) {
      const r = await failStaleJob(supabase, job as StaleJobRow, "processing", TIMEOUT_MESSAGE);
      cleaned += r.cleaned;
      refunded += r.refunded;
      audioDeleted += r.audioDeleted;
    }

    for (const job of uploadingRes.data ?? []) {
      const r = await failStaleJob(supabase, job as StaleJobRow, "uploading", UPLOAD_INTERRUPTED_MESSAGE);
      cleaned += r.cleaned;
      uploadCleaned += r.cleaned;
      refunded += r.refunded;
      audioDeleted += r.audioDeleted;
    }

    // ---- Secondary sweep: orphan temp-audio files for already-failed jobs ----
    const orphanCutoff = new Date(
      now - ORPHAN_LOOKBACK_HOURS * 60 * 60 * 1000,
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
      `[watchdog-stale-jobs] cleaned=${cleaned} (processing=${cleaned - uploadCleaned}, uploading=${uploadCleaned}) refunded=${refunded} audio=${audioDeleted} orphans=${orphansDeleted}`,
    );

    return new Response(
      JSON.stringify({
        cleaned,
        cleaned_processing: cleaned - uploadCleaned,
        cleaned_uploading: uploadCleaned,
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
