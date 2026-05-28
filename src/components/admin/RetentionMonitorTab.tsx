import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import JsonBlock from "@/components/admin/JsonBlock";
import { AlertTriangle, CheckCircle2, Clock, Play, RefreshCw, RotateCw, Eye } from "lucide-react";
import { toast } from "sonner";

/**
 * Retention monitor — surfaces prune-retention sweeper health to admins.
 *
 * Sources:
 *   - public.cleanup_logs (rows where job_name LIKE 'prune-retention%')
 *   - prune-retention edge function (for ad-hoc dry-runs)
 *
 * Alerts are derived client-side from the same data; no separate alert table
 * is needed because cleanup_logs already records every run with status,
 * errors[] and the per-dataset reports under metadata.reports.
 */

interface CleanupLogRow {
  id: string;
  job_name: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  errors: unknown;
  metadata: {
    caller?: string;
    dry_run?: boolean;
    batch_size?: number;
    reports?: DatasetReport[];
  } | null;
}

interface DatasetReport {
  dataset_key: string;
  strategy: string;
  cutoff: string;
  candidates: number;
  processed: number;
  dry_run: boolean;
  error?: string;
}

interface Alert {
  level: "error" | "warn" | "info";
  message: string;
}

// Heuristic: a per-dataset candidate count above this on a single run is
// worth a closer look. The first real run can legitimately exceed it; the
// alert is a hint, not a hard failure.
const HIGH_CANDIDATE_THRESHOLD = 10_000;
// Cron is expected to run at least once per 36h. Tune when scheduling changes.
const STALE_RUN_HOURS = 36;

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function deriveAlerts(rows: CleanupLogRow[]): Alert[] {
  const alerts: Alert[] = [];
  if (rows.length === 0) {
    alerts.push({ level: "warn", message: "No prune-retention runs recorded yet." });
    return alerts;
  }

  const latest = rows[0];
  const latestAge = Date.now() - new Date(latest.started_at).getTime();
  if (latestAge > STALE_RUN_HOURS * 3_600_000) {
    alerts.push({
      level: "warn",
      message: `No run in the last ${STALE_RUN_HOURS}h — cron may be paused or failing.`,
    });
  }

  // Surface every failure in the last 7 days.
  const weekAgo = Date.now() - 7 * 86_400_000;
  for (const row of rows) {
    if (new Date(row.started_at).getTime() < weekAgo) continue;
    if (row.status === "failed") {
      const errs = Array.isArray(row.errors) ? row.errors.length : 0;
      alerts.push({
        level: "error",
        message: `Run on ${new Date(row.started_at).toLocaleString()} failed (${errs} error${errs === 1 ? "" : "s"}).`,
      });
    }
    const reports = row.metadata?.reports ?? [];
    for (const r of reports) {
      if (r.error) {
        alerts.push({
          level: "error",
          message: `${row.metadata?.dry_run ? "[dry-run] " : ""}${r.dataset_key}: ${r.error}`,
        });
      } else if (!r.dry_run && r.candidates > HIGH_CANDIDATE_THRESHOLD) {
        alerts.push({
          level: "warn",
          message: `${r.dataset_key}: ${r.candidates.toLocaleString()} rows targeted in one run (threshold ${HIGH_CANDIDATE_THRESHOLD.toLocaleString()}).`,
        });
      }
    }
  }

  if (alerts.length === 0) {
    alerts.push({ level: "info", message: "All recent runs healthy." });
  }
  return alerts;
}

export default function RetentionMonitorTab() {
  const [rows, setRows] = useState<CleanupLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<CleanupLogRow | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("cleanup_logs")
      .select("id, job_name, status, started_at, finished_at, duration_ms, errors, metadata")
      .like("job_name", "prune-retention%")
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) {
      toast.error(`Failed to load runs: ${error.message}`);
    } else {
      setRows((data ?? []) as CleanupLogRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const invokePrune = useCallback(
    async (opts: { dryRun: boolean; datasetKeys?: string[]; sourceId?: string; label: string }) => {
      if (opts.sourceId) setRetryingId(opts.sourceId);
      else setRunning(true);
      try {
        const body: Record<string, unknown> = { dry_run: opts.dryRun };
        if (opts.datasetKeys?.length) body.dataset_keys = opts.datasetKeys;
        const { error } = await supabase.functions.invoke("prune-retention", { body });
        if (error) throw error;
        toast.success(`${opts.label} started — refresh in a few seconds.`);
        setTimeout(() => { void load(); }, 800);
      } catch (e) {
        toast.error(`${opts.label} failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        if (opts.sourceId) setRetryingId(null);
        else setRunning(false);
      }
    },
    [load],
  );

  const runDry = useCallback(() => invokePrune({ dryRun: true, label: "Dry-run" }), [invokePrune]);

  const alerts = useMemo(() => deriveAlerts(rows), [rows]);
  const latest = rows[0];
  const latestReports = latest?.metadata?.reports ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Retention monitor</CardTitle>
            <CardDescription>
              Health of the <code>prune-retention</code> sweeper over the last 50 runs.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
            <Button size="sm" onClick={runDry} disabled={running}>
              <Play className="h-4 w-4 mr-2" /> {running ? "Running…" : "Run dry-run"}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {alerts.map((a, i) => (
            <AlertRow key={i} alert={a} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Latest run</CardTitle>
          <CardDescription>
            {latest
              ? `${latest.metadata?.dry_run ? "Dry-run" : "Live run"} • ${timeAgo(latest.started_at)} • ${latest.status}`
              : "No runs yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {latestReports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dataset reports recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Dataset</th>
                    <th className="py-2 pr-4">Strategy</th>
                    <th className="py-2 pr-4">Cutoff</th>
                    <th className="py-2 pr-4 text-right">Candidates</th>
                    <th className="py-2 pr-4 text-right">Processed</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {latestReports.map((r) => (
                    <tr key={r.dataset_key} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{r.dataset_key}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={r.strategy === "anonymize" ? "secondary" : "outline"}>
                          {r.strategy}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {new Date(r.cutoff).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {r.candidates.toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {r.processed.toLocaleString()}
                      </td>
                      <td className="py-2">
                        {r.error ? (
                          <Badge variant="destructive">error</Badge>
                        ) : r.dry_run ? (
                          <Badge variant="outline">dry-run</Badge>
                        ) : (
                          <Badge>ok</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run history</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState />
          ) : rows.length === 0 ? (
            <EmptyState icon={Clock} title="No runs yet" description="Trigger a dry-run to seed history." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Started</th>
                    <th className="py-2 pr-4">Mode</th>
                    <th className="py-2 pr-4">Caller</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4 text-right">Duration</th>
                    <th className="py-2 pr-4 text-right">Datasets</th>
                    <th className="py-2 pr-4 text-right">Total processed</th>
                    <th className="py-2 pr-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const reports = r.metadata?.reports ?? [];
                    const totalProcessed = reports.reduce((s, x) => s + (x.processed ?? 0), 0);
                    const errCount = Array.isArray(r.errors) ? (r.errors as unknown[]).length : 0;
                    return (
                      <tr
                        key={r.id}
                        className="border-b last:border-0 cursor-pointer hover:bg-muted/40"
                        onClick={() => setSelected(r)}
                      >
                        <td className="py-2 pr-4">
                          <div>{new Date(r.started_at).toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">{timeAgo(r.started_at)}</div>
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant={r.metadata?.dry_run ? "outline" : "secondary"}>
                            {r.metadata?.dry_run ? "dry-run" : "live"}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {r.metadata?.caller ?? "—"}
                        </td>
                        <td className="py-2 pr-4">
                          {r.status === "failed" ? (
                            <Badge variant="destructive">
                              failed{errCount ? ` (${errCount})` : ""}
                            </Badge>
                          ) : r.status === "completed" ? (
                            <Badge>completed</Badge>
                          ) : (
                            <Badge variant="outline">{r.status}</Badge>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {formatDuration(r.duration_ms)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{reports.length}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {totalProcessed.toLocaleString()}
                        </td>
                        <td
                          className="py-2 pr-4 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            onClick={() => setSelected(r)}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1.5" /> Details
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <RunDetailsDialog
        row={selected}
        onClose={() => setSelected(null)}
        retryingId={retryingId}
        onRetry={(row, dryRun) =>
          invokePrune({
            dryRun,
            datasetKeys: (row.metadata?.reports ?? []).map((r) => r.dataset_key),
            sourceId: row.id,
            label: dryRun ? "Retry (dry-run)" : "Retry (live)",
          })
        }
      />
    </div>
  );
}

function RunDetailsDialog({
  row,
  onClose,
  onRetry,
  retryingId,
}: {
  row: CleanupLogRow | null;
  onClose: () => void;
  onRetry: (row: CleanupLogRow, dryRun: boolean) => void;
  retryingId: string | null;
}) {
  const open = row !== null;
  const reports = row?.metadata?.reports ?? [];
  const errors = Array.isArray(row?.errors) ? (row?.errors as unknown[]) : [];
  const isRetrying = !!row && retryingId === row.id;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Run details</DialogTitle>
          {row && (
            <DialogDescription>
              {new Date(row.started_at).toLocaleString()} • {row.metadata?.dry_run ? "dry-run" : "live"} •{" "}
              {row.status} • {formatDuration(row.duration_ms)}
            </DialogDescription>
          )}
        </DialogHeader>

        {row && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={isRetrying}
                onClick={() => onRetry(row, true)}
              >
                <RotateCw className="h-4 w-4 mr-2" />
                {isRetrying ? "Running…" : "Retry as dry-run"}
              </Button>
              <Button
                size="sm"
                disabled={isRetrying}
                onClick={() => onRetry(row, false)}
              >
                <Play className="h-4 w-4 mr-2" />
                {isRetrying ? "Running…" : "Retry as live"}
              </Button>
            </div>

            {reports.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Per-dataset reports</h4>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b bg-muted/40">
                        <th className="py-2 px-3">Dataset</th>
                        <th className="py-2 px-3">Strategy</th>
                        <th className="py-2 px-3">Cutoff</th>
                        <th className="py-2 px-3 text-right">Candidates</th>
                        <th className="py-2 px-3 text-right">Processed</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((r) => (
                        <tr key={r.dataset_key} className="border-b last:border-0">
                          <td className="py-2 px-3 font-medium">{r.dataset_key}</td>
                          <td className="py-2 px-3">{r.strategy}</td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {new Date(r.cutoff).toLocaleDateString()}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            {r.candidates.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            {r.processed.toLocaleString()}
                          </td>
                          <td className="py-2 px-3">
                            {r.error ? (
                              <Badge variant="destructive">error</Badge>
                            ) : r.dry_run ? (
                              <Badge variant="outline">dry-run</Badge>
                            ) : (
                              <Badge>ok</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {reports.some((r) => r.error) && (
                  <div className="space-y-1">
                    <h5 className="text-xs font-medium text-muted-foreground">Dataset errors</h5>
                    {reports.filter((r) => r.error).map((r) => (
                      <pre
                        key={r.dataset_key}
                        className="text-xs p-2 rounded bg-destructive/10 text-destructive overflow-x-auto whitespace-pre-wrap"
                      >
                        <span className="font-semibold">{r.dataset_key}:</span> {r.error}
                      </pre>
                    ))}
                  </div>
                )}
              </div>
            )}

            <JsonBlock title="Reports (JSON)" data={reports} defaultCollapsed />
            <JsonBlock
              title={`Errors${errors.length ? ` (${errors.length})` : ""}`}
              data={errors}
              defaultCollapsed={errors.length === 0}
            />
            <JsonBlock title="Metadata" data={row.metadata} defaultCollapsed />
            <JsonBlock
              title="Raw row"
              data={row}
              defaultCollapsed
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const Icon = alert.level === "info" ? CheckCircle2 : AlertTriangle;
  const tone =
    alert.level === "error"
      ? "text-destructive"
      : alert.level === "warn"
      ? "text-amber-600 dark:text-amber-400"
      : "text-emerald-600 dark:text-emerald-400";
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className={`h-4 w-4 mt-0.5 ${tone}`} />
      <span>{alert.message}</span>
    </div>
  );
}
