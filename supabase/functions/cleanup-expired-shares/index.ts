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
 * Returns a summary of bytes / objects deleted per bucket. Idempotent and
 * safe to call repeatedly. Designed to run via pg_cron once per hour.
 */

const EXPORT_TTL_DAYS = 7;
const ORPHAN_GRACE_HOURS = 24; // ignore very fresh orphans (still being uploaded)

interface CleanupSummary {
  shared_pdfs_deleted: number;
  shared_pdfs_orphans_deleted: number;
  exports_deleted: number;
  errors: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const summary: CleanupSummary = {
    shared_pdfs_deleted: 0,
    shared_pdfs_orphans_deleted: 0,
    exports_deleted: 0,
    errors: [],
  };

  try {
    const supabase = createServiceClient();
    const nowIso = new Date().toISOString();

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
      console.log(`[cleanup-expired-shares] Found ${expiredShares.length} expired share(s)`);
      // Each share's PDF lives under `<job_id>/<uuid>.pdf` — we don't know
      // the uuid from the row, so list the prefix and delete everything.
      // Multiple shares can reference the same job_id; dedupe by job_id.
      const uniqueJobIds = Array.from(new Set(expiredShares.map((s) => s.job_id)));
      for (const jobId of uniqueJobIds) {
        const { data: files, error: listErr } = await supabase.storage
          .from("shared-pdfs")
          .list(jobId, { limit: 1000 });

        if (listErr) {
          summary.errors.push(`list shared-pdfs/${jobId}: ${listErr.message}`);
          continue;
        }
        if (!files || files.length === 0) continue;

        const paths = files.map((f) => `${jobId}/${f.name}`);
        const { error: removeErr } = await supabase.storage
          .from("shared-pdfs")
          .remove(paths);
        if (removeErr) {
          summary.errors.push(`remove shared-pdfs/${jobId}: ${removeErr.message}`);
        } else {
          summary.shared_pdfs_deleted += paths.length;
        }
      }

      // Delete the share rows themselves so we don't reprocess them.
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
      summary.errors.push(`list shared-pdfs root: ${rootErr.message}`);
    } else if (rootDirs && rootDirs.length > 0) {
      const graceCutoff = Date.now() - ORPHAN_GRACE_HOURS * 60 * 60 * 1000;

      // Bulk-check which job_ids still have any share row at all.
      const candidateJobIds = rootDirs.map((d) => d.name).filter(Boolean);
      if (candidateJobIds.length > 0) {
        const { data: liveShares } = await supabase
          .from("transcript_shares")
          .select("job_id")
          .in("job_id", candidateJobIds);
        const liveSet = new Set((liveShares ?? []).map((s) => s.job_id));

        for (const dir of rootDirs) {
          if (liveSet.has(dir.name)) continue;

          const { data: files } = await supabase.storage
            .from("shared-pdfs")
            .list(dir.name, { limit: 1000 });
          if (!files || files.length === 0) continue;

          const newestMs = files.reduce((acc, f) => {
            const ts = f.created_at ? Date.parse(f.created_at) : 0;
            return Math.max(acc, ts);
          }, 0);
          if (newestMs > graceCutoff) continue; // still in grace

          const paths = files.map((f) => `${dir.name}/${f.name}`);
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
      console.log(`[cleanup-expired-shares] Found ${oldExports.length} expired export(s)`);
      const paths = oldExports
        .map((j) => j.resource_url as string)
        .filter(Boolean);
      if (paths.length > 0) {
        const { error: removeErr } = await supabase.storage
          .from("exports")
          .remove(paths);
        if (removeErr) {
          summary.errors.push(`remove exports: ${removeErr.message}`);
        } else {
          summary.exports_deleted += paths.length;
        }
      }
      // Null out resource_url so we don't re-process; keep the row for history.
      const ids = oldExports.map((j) => j.id);
      await supabase
        .from("async_jobs")
        .update({ resource_url: null })
        .in("id", ids);
    }

    console.log(
      `[cleanup-expired-shares] done`,
      JSON.stringify(summary)
    );

    return new Response(JSON.stringify({ ok: true, ...summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[cleanup-expired-shares] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        ...summary,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
