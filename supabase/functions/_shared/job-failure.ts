/**
 * Shared helper for marking a job as failed from an edge function catch block.
 *
 * Centralizes the duplicated pattern of:
 *   1. UPDATE jobs SET status='failed', error_message=<sanitized> WHERE id=<jobId>
 *   2. (optional) INSERT a `job_failed` notification for the job's owner
 *
 * The helper is intentionally defensive: every step is wrapped so a failure
 * inside the failure handler can never throw and mask the original error
 * the caller is about to surface.
 */
import type { SupabaseClient } from "./supabase.ts";
import { sanitizeErrorForClient } from "./sanitize-error.ts";

export interface MarkJobFailedOptions {
  /**
   * When true, also inserts a `job_failed` notification for the job's owner.
   * Used by `post-process`; `transcribe` and `process-job` leave this off
   * because the failure surfaces through the calling client instead.
   */
  notify?: boolean;
}

/**
 * Mark a job as failed. Safe to call from a catch block — never throws.
 *
 * @param supabase  Service-role client (must bypass RLS to update foreign jobs)
 * @param jobId     Job to mark as failed. No-op if falsy.
 * @param error     Original error; sanitized before being persisted/exposed.
 * @param options   See `MarkJobFailedOptions`.
 */
export async function markJobFailed(
  supabase: SupabaseClient,
  jobId: string | null | undefined,
  error: unknown,
  options: MarkJobFailedOptions = {},
): Promise<void> {
  if (!jobId) return;

  const message = sanitizeErrorForClient(error);

  try {
    await supabase
      .from("jobs")
      .update({ status: "failed", error_message: message })
      .eq("id", jobId);
  } catch (updateErr) {
    console.warn("[markJobFailed] failed to update job status", updateErr);
    // If we can't even mark the job, skip the notification too.
    return;
  }

  if (!options.notify) return;

  try {
    const { data: failedJob } = await supabase
      .from("jobs")
      .select("user_id, title, file_name")
      .eq("id", jobId)
      .single();

    if (failedJob?.user_id) {
      await supabase.from("notifications").insert({
        user_id: failedJob.user_id,
        type: "job_failed",
        title: failedJob.title || failedJob.file_name || "Transcription",
        description: message,
        status: "error",
        resource_type: "job",
        resource_id: jobId,
      });
    }
  } catch (notifyErr) {
    console.warn("[markJobFailed] failed to insert notification", notifyErr);
  }
}
