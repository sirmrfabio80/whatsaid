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
 * Dry-run mode:
 *  - Pass `?dry_run=1` (or `{ "dry_run": true }` in the JSON body) to compute
 *    what *would* be deleted without performing any storage removals or DB
 *    mutations. Dry-runs do NOT write to `cleanup_logs` (audit log stays
 *    clean) and the response includes `would_delete` arrays of object paths
 *    so the caller can review before approving a real run.
 *
 * Idempotent and safe to call repeatedly. Designed to run via pg_cron once
 * per hour.
 */

const JOB_NAME = "cleanup-expired-shares";
const EXPORT_TTL_DAYS = 7;
const ORPHAN_GRACE_HOURS = 24; // ignore very fresh orphans (still being uploaded)

/**
 * Defaults for tunables that live in `public.cleanup_config`. Used as a
 * fallback when the row is missing/unreadable — keeps the cleanup job
 * working even before the table is provisioned.
 *
 *  - `share_pdf_cache_ttl_days`: how long a `share_pdf_cache` row may sit
 *    untouched (`last_used_at`) before it gets pruned. Generous default
 *    (30 days) so re-shares within a month still hit the cache.
 *  - `cleanup_batch_size`: cap on rows fetched per sweep (expired shares,
 *    old exports, stale cache entries). Bounds the per-run work so the
 *    function fits inside the edge runtime time/memory budget.
 */
const DEFAULT_SHARE_CACHE_TTL_DAYS = 30;
const DEFAULT_CLEANUP_BATCH_SIZE = 1000;

interface CleanupConfig {
  share_pdf_cache_ttl_days: number;
  cleanup_batch_size: number;
}

interface CleanupSummary {
  shared_pdfs_deleted: number;
  shared_pdfs_orphans_deleted: number;
  exports_deleted: number;
  share_pdf_cache_deleted: number;
  missing_prefixes: number;
  errors: string[];
}

interface DryRunReport {
  shared_pdfs: string[];
  shared_pdfs_orphans: string[];
  exports: string[];
  share_pdf_cache_rows: string[]; // cache row IDs that would be deleted
  expired_share_rows: string[]; // share IDs that would be deleted
  exports_rows_nulled: string[]; // async_job IDs whose resource_url would be cleared
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

async function parseDryRun(req: Request): Promise<boolean> {
  const url = new URL(req.url);
  const qp = url.searchParams.get("dry_run");
  if (qp && (qp === "1" || qp.toLowerCase() === "true")) return true;
  if (req.method === "POST") {
    try {
      const body = await req.clone().json();
      if (body && typeof body === "object" && body.dry_run === true) return true;
    } catch {
      /* not JSON — ignore */
    }
  }
  return false;
}

/**
 * Load tunables from `cleanup_config` (singleton row, id=1). Falls back to
 * defaults on missing row, RLS denial, parse error, or out-of-range
 * values so a misconfigured table can never break the cleanup job.
 */
async function loadConfig(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<CleanupConfig> {
  try {
    const { data, error } = await supabase
      .from("cleanup_config")
      .select("share_pdf_cache_ttl_days, cleanup_batch_size")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) {
      return {
        share_pdf_cache_ttl_days: DEFAULT_SHARE_CACHE_TTL_DAYS,
        cleanup_batch_size: DEFAULT_CLEANUP_BATCH_SIZE,
      };
    }
    const ttl = Number(data.share_pdf_cache_ttl_days);
    const batch = Number(data.cleanup_batch_size);
    return {
      share_pdf_cache_ttl_days:
        Number.isFinite(ttl) && ttl >= 1 && ttl <= 365
          ? ttl
          : DEFAULT_SHARE_CACHE_TTL_DAYS,
      cleanup_batch_size:
        Number.isFinite(batch) && batch >= 50 && batch <= 10_000
          ? batch
          : DEFAULT_CLEANUP_BATCH_SIZE,
    };
  } catch {
    return {
      share_pdf_cache_ttl_days: DEFAULT_SHARE_CACHE_TTL_DAYS,
      cleanup_batch_size: DEFAULT_CLEANUP_BATCH_SIZE,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const dryRun = await parseDryRun(req);
  const startedAt = new Date();
  const summary: CleanupSummary = {
    shared_pdfs_deleted: 0,
    shared_pdfs_orphans_deleted: 0,
    exports_deleted: 0,
    share_pdf_cache_deleted: 0,
    missing_prefixes: 0,
    errors: [],
  };
  const dryReport: DryRunReport = {
    shared_pdfs: [],
    shared_pdfs_orphans: [],
    exports: [],
    share_pdf_cache_rows: [],
    expired_share_rows: [],
    exports_rows_nulled: [],
  };

  const supabase = createServiceClient();
  const config = await loadConfig(supabase);
  console.log(
    `[${JOB_NAME}] config: ttl=${config.share_pdf_cache_ttl_days}d batch=${config.cleanup_batch_size}`,
  );

  // Insert a "running" log row up-front so timeouts / crashes are visible.
  // Skipped in dry-run mode so previews don't pollute the audit log.
  let logId: string | null = null;
  if (!dryRun) {
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
          share_pdf_cache_deleted: summary.share_pdf_cache_deleted,
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
      .limit(config.cleanup_batch_size);

    if (sharesErr) {
      summary.errors.push(`fetch expired shares: ${sharesErr.message}`);
    } else if (expiredShares && expiredShares.length > 0) {
      console.log(`[${JOB_NAME}] Found ${expiredShares.length} expired share(s)${dryRun ? " (dry-run)" : ""}`);
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
        if (!files || files.length === 0) {
          summary.missing_prefixes += 1;
          continue;
        }

        const paths = files
          .filter((f) => f && f.name)
          .map((f) => `${jobId}/${f.name}`);
        if (paths.length === 0) continue;

        if (dryRun) {
          dryReport.shared_pdfs.push(...paths);
          summary.shared_pdfs_deleted += paths.length;
          continue;
        }

        const { error: removeErr } = await supabase.storage
          .from("shared-pdfs")
          .remove(paths);
        if (removeErr) {
          summary.errors.push(`remove shared-pdfs/${jobId}: ${removeErr.message}`);
        } else {
          summary.shared_pdfs_deleted += paths.length;
        }
      }

      const expiredIds = expiredShares.map((s) => s.id);
      if (dryRun) {
        dryReport.expired_share_rows.push(...expiredIds);
      } else {
        const { error: delRowErr } = await supabase
          .from("transcript_shares")
          .delete()
          .in("id", expiredIds);
        if (delRowErr) {
          summary.errors.push(`delete share rows: ${delRowErr.message}`);
        }
      }
    }

    // -------------------------------------------------------------------
    // 1b. shared-pdfs: orphan sweep
    // -------------------------------------------------------------------
    const { data: rootDirs, error: rootErr } = await supabase.storage
      .from("shared-pdfs")
      .list("", { limit: 1000 });

    if (rootErr) {
      if (isMissingPrefixError(rootErr)) {
        console.log(`[${JOB_NAME}] shared-pdfs bucket appears empty`);
      } else {
        summary.errors.push(`list shared-pdfs root: ${rootErr.message}`);
      }
    } else if (rootDirs && rootDirs.length > 0) {
      const graceCutoff = Date.now() - ORPHAN_GRACE_HOURS * 60 * 60 * 1000;

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

          if (dryRun) {
            dryReport.shared_pdfs_orphans.push(...paths);
            summary.shared_pdfs_orphans_deleted += paths.length;
            continue;
          }

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
      .limit(config.cleanup_batch_size);

    if (exportsErr) {
      summary.errors.push(`fetch old exports: ${exportsErr.message}`);
    } else if (oldExports && oldExports.length > 0) {
      console.log(`[${JOB_NAME}] Found ${oldExports.length} expired export(s)${dryRun ? " (dry-run)" : ""}`);
      const paths = oldExports
        .map((j) => j.resource_url as string | null)
        .filter((p): p is string => !!p && p.length > 0);

      if (dryRun) {
        dryReport.exports.push(...paths);
        dryReport.exports_rows_nulled.push(...oldExports.map((j) => j.id));
        summary.exports_deleted += paths.length;
      } else {
        if (paths.length > 0) {
          const { error: removeErr } = await supabase.storage
            .from("exports")
            .remove(paths);
          if (removeErr) {
            if (isMissingPrefixError(removeErr)) {
              summary.missing_prefixes += paths.length;
            } else {
              summary.errors.push(`remove exports: ${removeErr.message}`);
            }
          } else {
            summary.exports_deleted += paths.length;
          }
        }
        const ids = oldExports.map((j) => j.id);
        const { error: nullErr } = await supabase
          .from("async_jobs")
          .update({ resource_url: null })
          .in("id", ids);
        if (nullErr) {
          summary.errors.push(`null exports.resource_url: ${nullErr.message}`);
        }
      }
    }

    // -------------------------------------------------------------------
    // 3. share_pdf_cache: prune index rows untouched for the configured
    //    TTL (see `cleanup_config.share_pdf_cache_ttl_days`).
    //
    // The actual blobs they reference are usually already gone (the
    // shared-pdfs sweep above runs first). This step bounds the cache
    // table itself so it doesn't grow forever — repeated edits to the
    // same job constantly produce new (job_id, content_hash) rows, and
    // without TTL each user accumulates one row per historical hash.
    // -------------------------------------------------------------------
    const cacheCutoff = new Date(
      Date.now() - config.share_pdf_cache_ttl_days * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: staleCacheRows, error: cacheFetchErr } = await supabase
      .from("share_pdf_cache")
      .select("id")
      .lt("last_used_at", cacheCutoff)
      .limit(config.cleanup_batch_size);

    if (cacheFetchErr) {
      summary.errors.push(`fetch stale share_pdf_cache: ${cacheFetchErr.message}`);
    } else if (staleCacheRows && staleCacheRows.length > 0) {
      console.log(
        `[${JOB_NAME}] Found ${staleCacheRows.length} stale share_pdf_cache row(s)${dryRun ? " (dry-run)" : ""}`,
      );
      const ids = staleCacheRows.map((r) => r.id);
      if (dryRun) {
        dryReport.share_pdf_cache_rows.push(...ids);
        summary.share_pdf_cache_deleted += ids.length;
      } else {
        const { error: cacheDelErr } = await supabase
          .from("share_pdf_cache")
          .delete()
          .in("id", ids);
        if (cacheDelErr) {
          summary.errors.push(`delete share_pdf_cache rows: ${cacheDelErr.message}`);
        } else {
          summary.share_pdf_cache_deleted += ids.length;
        }
      }
    }

    // -------------------------------------------------------------------
    // 4. TTL prune for cleanup_logs and finished async_jobs (30 days).
    //    Keeps the largest housekeeping tables from growing unbounded.
    //    Counts surface in cleanup_logs.metadata for observability.
    // -------------------------------------------------------------------
    const ttlCutoff = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    let cleanup_logs_pruned = 0;
    let async_jobs_pruned = 0;

    if (!dryRun) {
      const { data: oldLogs, error: oldLogsErr } = await supabase
        .from("cleanup_logs")
        .delete()
        .lt("created_at", ttlCutoff)
        .select("id");
      if (oldLogsErr) {
        summary.errors.push(`prune cleanup_logs: ${oldLogsErr.message}`);
      } else {
        cleanup_logs_pruned = oldLogs?.length ?? 0;
      }

      const { data: oldAsync, error: oldAsyncErr } = await supabase
        .from("async_jobs")
        .delete()
        .in("status", ["completed", "failed"])
        .lt("updated_at", ttlCutoff)
        .select("id");
      if (oldAsyncErr) {
        summary.errors.push(`prune async_jobs: ${oldAsyncErr.message}`);
      } else {
        async_jobs_pruned = oldAsync?.length ?? 0;
      }

      if (logId && (cleanup_logs_pruned > 0 || async_jobs_pruned > 0)) {
        try {
          await supabase
            .from("cleanup_logs")
            .update({
              metadata: { cleanup_logs_pruned, async_jobs_pruned },
            })
            .eq("id", logId);
        } catch (e) {
          console.warn(`[${JOB_NAME}] write ttl metadata failed:`, e);
        }
      }
    }

    console.log(
      `[${JOB_NAME}] done${dryRun ? " (dry-run)" : ""}`,
      JSON.stringify({ ...summary, cleanup_logs_pruned, async_jobs_pruned }),
    );
    await finalize("completed");

    return new Response(
      JSON.stringify({
        ok: true,
        dry_run: dryRun,
        config,
        ...summary,
        cleanup_logs_pruned,
        async_jobs_pruned,
        ...(dryRun ? { would_delete: dryReport } : {}),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[${JOB_NAME}] Error:`, error);
    await finalize("failed", msg);
    return new Response(
      JSON.stringify({ error: msg, dry_run: dryRun, ...summary }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
