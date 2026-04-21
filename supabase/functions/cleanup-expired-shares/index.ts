import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

/**
 * cleanup-expired-shares
 *
 * Sweeps storage objects whose lifetime has ended:
 *
 *  1. `shared-pdfs/` — PDFs uploaded for an email share. Authoritative TTL is
 *     `transcript_shares.expires_at` (default `now() + 2 days`). All PDFs are
 *     stored under `<job_id>/<uuid>.pdf`. We delete blobs belonging to shares
 *     past expiry, then delete blobs that have no matching share row at all
 *     (orphans from failed share creation).
 *
 *  2. `exports/` — async PDF export jobs (`async_jobs.job_type = 'pdf_export'`).
 *     Stored under `<user_id>/<async_job_id>/<filename>.pdf`. We delete blobs
 *     for completed async jobs older than EXPORT_TTL_DAYS — the user has had
 *     plenty of time to download via the notification.
 *
 * Resilience:
 *  - Missing prefixes (folders that no longer exist on storage) are NOT
 *    treated as errors — they're tracked separately as `missing_prefixes`.
 *  - Each run inserts a row in `cleanup_logs` with counts, errors, and
 *    duration. The row is created at start (status=running) and updated at
 *    end so failed/timed-out runs are still visible.
 *
 * Idempotent and safe to call repeatedly. Designed to run via pg_cron once
 * per hour.
 */

const JOB_NAME = "cleanup-expired-shares";
const EXPORT_TTL_DAYS = 7;
const ORPHAN_GRACE_HOURS = 24; // ignore very fresh orphans (still being uploaded)

interface CleanupSummary {
  shared_pdfs_deleted: number;
  shared_pdfs_orphans_deleted: number;
  exports_deleted: number;
  missing_prefixes: number;
  errors: string[];
}

/**
 * Storage `.list()` returns an empty array when the prefix doesn't exist
 * AND when it exists but is empty — Supabase doesn't distinguish. A "not
 * found" error from the storage API itself is treated as a missing prefix
 * (counted separately, not an error).
 */
function isMissingPrefixError(err: { message?: string } | null): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("not found") ||
    m.includes("does not exist") ||
    m.includes("no such") ||
    m.includes("404")
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = new Date();
  const summary: CleanupSummary = {
    shared_pdfs_deleted: 0,
    shared_pdfs_orphans_deleted: 0,
    exports_deleted: 0,
    missing_prefixes: 0,
    errors: [],
  };

  const supabase = createServiceClient();

  // Insert a "running" log row up-front so timeouts / crashes are visible.
  let logId: string | null = null;
  try {
    const { data: logRow, error: logErr } = await supabase
      .from("cleanup_logs")
      .insert({
        job_name: JOB_NAME,
        started_at: startedAt.toISOString(),
        status: "running",
      })
      .select("id")
      .single();
    if (logErr) {
      console.warn(`[${JOB_NAME}] failed to insert log row:`, logErr.message);
    } else {
      logId = logRow.id;
    }
  } catch (e) {
    console.warn(`[${JOB_NAME}] log insert threw:`, e);
  }

  const finalize = async (status: "completed" | "failed", topLevelError?: string) => {
    const finishedAt = new Date();
    const errors = topLevelError ? [...summary.errors, topLevelError] : summary.errors;
    if (!logId) return;
    try {
      await supabase
        .from("cleanup_logs")
        .update({
          finished_at: finishedAt.toISOString(),
          duration_ms: finishedAt.getTime() - startedAt.getTime(),
          status,
          shared_pdfs_deleted: summary.shared_pdfs_deleted,
          shared_pdfs_orphans_deleted: summary.shared_pdfs_orphans_deleted,
          exports_deleted: summary.exports_deleted,
          missing_prefixes: summary.missing_prefixes,
          errors,
        })
        .eq("id", logId);
    } catch (e) {
      console.warn(`[${JOB_NAME}] log finalize threw:`, e);
    }
  };

  try {
    const nowIso = startedAt.toISOString();

    // -------------------------------------------------------------------
    // 1a. shared-pdfs: delete by expired transcript_shares
    // -------------------------------------------------------------------
    const { data: expiredShares, error: sharesErr } = await supabase
      .from("transcript_shares")
      .select("id, job_id")
      .lt("expires_at", nowIso)
      .limit(500);

    if (sharesErr) {
      summary.errors.push(`fetch expired shares: ${sharesErr.message}`);
    } else if (expiredShares && expiredShares.length > 0) {
      console.log(`[${JOB_NAME}] Found ${expiredShares.length} expired share(s)`);
      // Each share's PDF lives under `<job_id>/<uuid>.pdf` — we don't know
      // the uuid from the row, so list the prefix and delete everything.
      // Multiple shares can reference the same job_id; dedupe by job_id.
      // Filter out any null/empty job_ids defensively.
      const uniqueJobIds = Array.from(
        new Set(expiredShares.map((s) => s.job_id).filter((id): id is string => !!id))
      );
      for (const jobId of uniqueJobIds) {
        const { data: files, error: listErr } = await supabase.storage
          .from("shared-pdfs")
          .list(jobId, { limit: 1000 });

        if (listErr) {
          if (isMissingPrefixError(listErr)) {
            summary.missing_prefixes += 1;
            console.log(`[${JOB_NAME}] missing shared-pdfs prefix: ${jobId}`);
          } else {
            summary.errors.push(`list shared-pdfs/${jobId}: ${listErr.message}`);
          }
          continue;
        }
        // Empty list = either missing prefix or empty folder. Either way, nothing to delete.
        if (!files || files.length === 0) {
          summary.missing_prefixes += 1;
          continue;
        }

        const paths = files
          .filter((f) => f && f.name)
          .map((f) => `${jobId}/${f.name}`);
        if (paths.length === 0) continue;

        const { error: removeErr } = await supabase.storage
          .from("shared-pdfs")
          .remove(paths);
        if (removeErr) {
          summary.errors.push(`remove shared-pdfs/${jobId}: ${removeErr.message}`);
        } else {
          summary.shared_pdfs_deleted += paths.length;
        }
      }

      // Delete the share rows themselves so we don't reprocess them, even
      // when the underlying storage prefix was already gone.
      const expiredIds = expiredShares.map((s) => s.id);
      const { error: delRowErr } = await supabase
        .from("transcript_shares")
        .delete()
        .in("id", expiredIds);
      if (delRowErr) {
        summary.errors.push(`delete share rows: ${delRowErr.message}`);
      }
    }

    // -------------------------------------------------------------------
    // 1b. shared-pdfs: orphan sweep
    // List top-level prefixes (job_ids) and remove any whose newest object
    // is older than ORPHAN_GRACE_HOURS *and* has no matching transcript_share row.
    // -------------------------------------------------------------------
    const { data: rootDirs, error: rootErr } = await supabase.storage
      .from("shared-pdfs")
      .list("", { limit: 1000 });

    if (rootErr) {
      if (isMissingPrefixError(rootErr)) {
        // Bucket is empty / never written to — that's fine.
        console.log(`[${JOB_NAME}] shared-pdfs bucket appears empty`);
      } else {
        summary.errors.push(`list shared-pdfs root: ${rootErr.message}`);
      }
    } else if (rootDirs && rootDirs.length > 0) {
      const graceCutoff = Date.now() - ORPHAN_GRACE_HOURS * 60 * 60 * 1000;

      // Bulk-check which job_ids still have any share row at all.
      const candidateJobIds = rootDirs
        .map((d) => d.name)
        .filter((n): n is string => !!n);
      if (candidateJobIds.length > 0) {
        const { data: liveShares } = await supabase
          .from("transcript_shares")
          .select("job_id")
          .in("job_id", candidateJobIds);
        const liveSet = new Set((liveShares ?? []).map((s) => s.job_id));

        for (const dir of rootDirs) {
          if (!dir.name || liveSet.has(dir.name)) continue;

          const { data: files, error: subErr } = await supabase.storage
            .from("shared-pdfs")
            .list(dir.name, { limit: 1000 });
          if (subErr) {
            if (isMissingPrefixError(subErr)) {
              summary.missing_prefixes += 1;
            } else {
              summary.errors.push(`list orphan shared-pdfs/${dir.name}: ${subErr.message}`);
            }
            continue;
          }
          if (!files || files.length === 0) {
            summary.missing_prefixes += 1;
            continue;
          }

          const newestMs = files.reduce((acc, f) => {
            const ts = f.created_at ? Date.parse(f.created_at) : 0;
            return Math.max(acc, ts);
          }, 0);
          if (newestMs > graceCutoff) continue; // still in grace

          const paths = files
            .filter((f) => f && f.name)
            .map((f) => `${dir.name}/${f.name}`);
          if (paths.length === 0) continue;

          const { error: removeErr } = await supabase.storage
            .from("shared-pdfs")
            .remove(paths);
          if (removeErr) {
            summary.errors.push(`remove orphan shared-pdfs/${dir.name}: ${removeErr.message}`);
          } else {
            summary.shared_pdfs_orphans_deleted += paths.length;
          }
        }
      }
    }

    // -------------------------------------------------------------------
    // 2. exports bucket: delete completed async pdf_export jobs older than TTL
    // -------------------------------------------------------------------
    const exportCutoff = new Date(
      Date.now() - EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: oldExports, error: exportsErr } = await supabase
      .from("async_jobs")
      .select("id, user_id, resource_url")
      .eq("job_type", "pdf_export")
      .eq("status", "completed")
      .not("resource_url", "is", null)
      .lt("completed_at", exportCutoff)
      .limit(500);

    if (exportsErr) {
      summary.errors.push(`fetch old exports: ${exportsErr.message}`);
    } else if (oldExports && oldExports.length > 0) {
      console.log(`[${JOB_NAME}] Found ${oldExports.length} expired export(s)`);
      const paths = oldExports
        .map((j) => j.resource_url as string | null)
        .filter((p): p is string => !!p && p.length > 0);
      if (paths.length > 0) {
        const { error: removeErr } = await supabase.storage
          .from("exports")
          .remove(paths);
        if (removeErr) {
          // Storage `.remove()` succeeds for missing objects; a hard error
          // here means something else (auth, network). Still log it.
          if (isMissingPrefixError(removeErr)) {
            summary.missing_prefixes += paths.length;
          } else {
            summary.errors.push(`remove exports: ${removeErr.message}`);
          }
        } else {
          summary.exports_deleted += paths.length;
        }
      }
      // Null out resource_url so we don't re-process; keep the row for history.
      const ids = oldExports.map((j) => j.id);
      const { error: nullErr } = await supabase
        .from("async_jobs")
        .update({ resource_url: null })
        .in("id", ids);
      if (nullErr) {
        summary.errors.push(`null exports.resource_url: ${nullErr.message}`);
      }
    }

    console.log(`[${JOB_NAME}] done`, JSON.stringify(summary));
    await finalize("completed");

    return new Response(JSON.stringify({ ok: true, ...summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[${JOB_NAME}] Error:`, error);
    await finalize("failed", msg);
    return new Response(
      JSON.stringify({ error: msg, ...summary }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
