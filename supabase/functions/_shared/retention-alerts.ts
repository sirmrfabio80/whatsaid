/**
 * Pure helpers + dispatcher for prune-retention admin alerts.
 *
 * `evaluateAlerts` is dependency-free and unit-testable. It looks at the
 * fresh report plus a small history slice and returns the set of alerts
 * that *should* be emitted (subject to throttling at dispatch time).
 *
 * `dispatchAlerts` performs the throttled writes + email enqueue. It never
 * throws — callers (prune-retention, watchdog) are not blocked if alerting
 * misfires.
 */

import { ADMIN_NOTIFY_EMAIL, SITE_URL } from "./constants.ts";

export type AlertKind =
  | "run_failed"
  | "high_candidates"
  | "large_processed_jump"
  | "missing_runs";

export interface DatasetReportLite {
  dataset_key: string;
  status?: string;
  strategy?: string;
  candidates?: number;
  processed?: number;
  dry_run?: boolean;
  error?: string;
}

export interface RunReport {
  run_id?: string | null;
  job_name?: string;
  mode: "live" | "dry-run";
  status: "ok" | "failed" | "partial";
  datasets: DatasetReportLite[];
}

export interface HistoricalRun {
  job_name: string;
  metadata: { datasets?: DatasetReportLite[] } | null;
}

export interface AlertCandidate {
  kind: AlertKind;
  dataset_key: string | null;
  details: Record<string, unknown>;
}

export const HIGH_CANDIDATES_THRESHOLD = 10_000;
export const PROCESSED_SPIKE_MULTIPLIER = 10;
export const SPIKE_MIN_HISTORY = 10;
export const THROTTLE_WINDOW_HOURS = 6;
export const MISSING_RUNS_HOURS = 36;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Pure planner. Given a fresh run report and a history slice of *live*
 * runs (most recent first), decide which alert candidates apply.
 */
export function evaluateAlerts(
  run: RunReport,
  history: HistoricalRun[] = [],
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const datasets = run.datasets ?? [];

  // 1. run_failed — any dataset error OR overall status=failed.
  const failed = datasets.filter((d) => d.error || d.status === "failed");
  if (failed.length > 0 || run.status === "failed") {
    out.push({
      kind: "run_failed",
      dataset_key: null,
      details: {
        failed_datasets: failed.map((d) => ({
          dataset_key: d.dataset_key,
          error: d.error ?? null,
          status: d.status ?? null,
        })),
      },
    });
  }

  // 2. high_candidates — per-dataset.
  for (const d of datasets) {
    if ((d.candidates ?? 0) > HIGH_CANDIDATES_THRESHOLD) {
      out.push({
        kind: "high_candidates",
        dataset_key: d.dataset_key,
        details: {
          candidates: d.candidates,
          threshold: HIGH_CANDIDATES_THRESHOLD,
        },
      });
    }
  }

  // 3. large_processed_jump — live only, needs enough history.
  if (run.mode === "live" && history.length >= SPIKE_MIN_HISTORY) {
    for (const d of datasets) {
      const processed = d.processed ?? 0;
      if (processed <= 0) continue;
      const samples: number[] = [];
      for (const h of history) {
        const match = (h.metadata?.datasets ?? []).find(
          (x) => x.dataset_key === d.dataset_key,
        );
        if (match && typeof match.processed === "number") {
          samples.push(match.processed);
        }
      }
      if (samples.length < SPIKE_MIN_HISTORY) continue;
      const med = median(samples);
      // If historical median is 0 we can't meaningfully compute a "10x"
      // ratio — skip rather than flagging every first-real-run.
      if (med <= 0) continue;
      if (processed > med * PROCESSED_SPIKE_MULTIPLIER) {
        out.push({
          kind: "large_processed_jump",
          dataset_key: d.dataset_key,
          details: {
            processed,
            historical_median: med,
            multiplier: PROCESSED_SPIKE_MULTIPLIER,
          },
        });
      }
    }
  }

  return out;
}

interface SupabaseLike {
  from: (t: string) => any;
  // deno-lint-ignore no-explicit-any
  functions: { invoke: (name: string, opts: any) => Promise<any> };
}

/**
 * Throttle + email dispatch. Never throws — best-effort.
 * Returns the number of emails actually enqueued.
 */
export async function dispatchAlerts(
  admin: SupabaseLike,
  alerts: AlertCandidate[],
  ctx: {
    runId?: string | null;
    cleanupLogId?: string | null;
    jobName?: string;
    mode: "live" | "dry-run";
    datasetsForEmail?: DatasetReportLite[];
    serviceKey?: string;
    supabaseUrl?: string;
  },
): Promise<number> {
  if (alerts.length === 0) return 0;
  let sent = 0;
  const throttleSince = new Date(
    Date.now() - THROTTLE_WINDOW_HOURS * 3600 * 1000,
  ).toISOString();

  for (const a of alerts) {
    try {
      // Throttle: skip if same (kind, dataset_key) was emitted recently.
      let q = admin
        .from("retention_alerts")
        .select("id", { head: true, count: "exact" })
        .eq("alert_kind", a.kind)
        .gte("sent_at", throttleSince)
        .eq("email_sent", true);
      q = a.dataset_key === null
        ? q.is("dataset_key", null)
        : q.eq("dataset_key", a.dataset_key);
      const { count } = await q;
      if ((count ?? 0) > 0) continue;

      // Reserve the row first so concurrent invocations collapse to one.
      const { data: row, error: insErr } = await admin
        .from("retention_alerts")
        .insert({
          alert_kind: a.kind,
          dataset_key: a.dataset_key,
          cleanup_log_id: ctx.cleanupLogId ?? null,
          details: a.details ?? {},
          email_sent: false,
        })
        .select("id")
        .single();
      if (insErr || !row) {
        console.error("[retention-alerts] insert failed", insErr);
        continue;
      }

      const idempotencyKey = `retention-${a.kind}-${a.dataset_key ?? "run"}-${ctx.cleanupLogId ?? row.id}`;
      const templateData = {
        alertKind: a.kind,
        runId: ctx.runId ?? ctx.cleanupLogId ?? null,
        mode: ctx.mode,
        jobName: ctx.jobName ?? "prune-retention",
        datasets: ctx.datasetsForEmail ?? [],
        dashboardUrl: `${SITE_URL}/admin?tab=retention-monitor`,
        detectedAt: new Date().toISOString(),
        message: humanMessage(a),
      };

      let emailError: string | null = null;
      try {
        if (ctx.supabaseUrl && ctx.serviceKey) {
          const res = await fetch(
            `${ctx.supabaseUrl}/functions/v1/send-transactional-email`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ctx.serviceKey}`,
                apikey: ctx.serviceKey,
              },
              body: JSON.stringify({
                templateName: "admin-retention-alert",
                recipientEmail: ADMIN_NOTIFY_EMAIL,
                idempotencyKey,
                templateData,
              }),
            },
          );
          if (!res.ok) {
            emailError = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
          }
        } else {
          emailError = "missing supabaseUrl/serviceKey";
        }
      } catch (e) {
        emailError = (e as Error).message;
      }

      await admin
        .from("retention_alerts")
        .update({
          email_sent: emailError === null,
          email_error: emailError,
        })
        .eq("id", row.id);

      if (emailError === null) sent += 1;
    } catch (e) {
      console.error("[retention-alerts] dispatch error", e);
    }
  }
  return sent;
}

function humanMessage(a: AlertCandidate): string {
  switch (a.kind) {
    case "run_failed":
      return "One or more datasets reported errors during the last prune-retention run.";
    case "high_candidates":
      return `Dataset ${a.dataset_key} has more than ${HIGH_CANDIDATES_THRESHOLD} rows past their retention horizon. This may indicate a backlog or misconfigured retention.`;
    case "large_processed_jump":
      return `Dataset ${a.dataset_key} processed significantly more rows than recent runs. Verify this is expected.`;
    case "missing_runs":
      return `No prune-retention run has been recorded in the last ${MISSING_RUNS_HOURS} hours. The cron job may be broken.`;
  }
}
