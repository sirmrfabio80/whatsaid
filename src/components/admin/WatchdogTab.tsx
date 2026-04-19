import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Play, AlertCircle, Coins, FileX, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { TIMEOUT_PATTERN } from "@/lib/watchdog";

interface WatchdogJob {
  id: string;
  title: string | null;
  file_name: string;
  user_id: string | null;
  credits_charged: number;
  updated_at: string;
  audio_deleted_at: string | null;
  temp_file_path: string | null;
  duration_seconds: number | null;
}

interface WatchdogRefund {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  created_at: string;
  job_id: string | null;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

export default function WatchdogTab() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [failedJobs, setFailedJobs] = useState<WatchdogJob[]>([]);
  const [refunds, setRefunds] = useState<WatchdogRefund[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

    const [jobsRes, refundsRes] = await Promise.all([
      supabase
        .from("jobs")
        .select(
          "id, title, file_name, user_id, credits_charged, updated_at, audio_deleted_at, temp_file_path, duration_seconds, error_message",
        )
        .eq("status", "failed")
        .ilike("error_message", `%${TIMEOUT_PATTERN}%`)
        .gte("updated_at", since)
        .order("updated_at", { ascending: false })
        .limit(200),
      supabase
        .from("credit_transactions")
        .select("id, user_id, amount, reason, created_at, job_id")
        .ilike("reason", "Refund: stale job%")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    if (jobsRes.error) toast.error(jobsRes.error.message);
    else setFailedJobs((jobsRes.data ?? []) as WatchdogJob[]);

    if (refundsRes.error) toast.error(refundsRes.error.message);
    else setRefunds((refundsRes.data ?? []) as WatchdogRefund[]);

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runNow() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("watchdog-stale-jobs", { body: {} });
      if (error) {
        toast.error(error.message);
        return;
      }
      const cleaned = data?.cleaned ?? 0;
      const refunded = data?.refunded ?? 0;
      const orphans = data?.orphans_deleted ?? 0;
      toast.success(
        `Watchdog ran: ${cleaned} failed, ${refunded} refunded, ${orphans} orphan files removed`,
      );
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setRunning(false);
    }
  }

  const totals = useMemo(() => {
    const totalRefunded = refunds.reduce((sum, r) => sum + r.amount, 0);
    const orphansRemaining = failedJobs.filter(
      (j) => j.temp_file_path && !j.audio_deleted_at,
    ).length;
    return {
      jobs: failedJobs.length,
      refunds: refunds.length,
      credits: totalRefunded,
      orphansRemaining,
    };
  }, [failedJobs, refunds]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Watchdog</CardTitle>
            <CardDescription>
              Stale-job watchdog activity over the last 7 days. Auto-fails jobs stuck in
              processing for &gt;20 min, refunds credits, and removes orphaned audio.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" onClick={runNow} disabled={running || loading}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              <span className="ml-1">{running ? "Running…" : "Run now"}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<AlertCircle className="h-4 w-4" />}
              label="Auto-failed jobs"
              value={totals.jobs}
            />
            <StatCard
              icon={<Coins className="h-4 w-4" />}
              label="Credits refunded"
              value={totals.credits}
              hint={`${totals.refunds} refunds`}
            />
            <StatCard
              icon={<FileX className="h-4 w-4" />}
              label="Orphan audio remaining"
              value={totals.orphansRemaining}
              tone={totals.orphansRemaining > 0 ? "warn" : "ok"}
            />
            <StatCard
              icon={<ShieldAlert className="h-4 w-4" />}
              label="Window"
              value="7d"
              hint="rolling"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Auto-failed jobs</CardTitle>
          <CardDescription>Jobs marked failed by the watchdog.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState rows={3} titleWidth="" />
          ) : failedJobs.length === 0 ? (
            <EmptyState title="No watchdog actions" description="No jobs auto-failed in the last 7 days." />
          ) : (
            <ul className="divide-y divide-border">
              {failedJobs.map((job) => {
                const orphan = !!job.temp_file_path && !job.audio_deleted_at;
                return (
                  <li key={job.id} className="py-3 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{job.title || job.file_name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                        <span>{fmtDate(job.updated_at)}</span>
                        {job.duration_seconds != null && (
                          <span>{Math.round(job.duration_seconds)}s audio</span>
                        )}
                        <span className="font-mono">{job.id.slice(0, 8)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {job.credits_charged > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {job.credits_charged} cr charged
                        </Badge>
                      )}
                      {orphan ? (
                        <Badge variant="destructive" className="text-xs">
                          Audio not deleted
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Audio cleaned
                        </Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Refunds</CardTitle>
          <CardDescription>Credits refunded by the watchdog.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState rows={3} titleWidth="" />
          ) : refunds.length === 0 ? (
            <EmptyState title="No refunds" description="No credits refunded by the watchdog in the last 7 days." />
          ) : (
            <ul className="divide-y divide-border">
              {refunds.map((r) => (
                <li key={r.id} className="py-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{r.reason}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                      <span>{fmtDate(r.created_at)}</span>
                      <span className="font-mono">user {r.user_id.slice(0, 8)}</span>
                    </div>
                  </div>
                  <Badge variant="default" className="text-xs">
                    +{r.amount} cr
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "ok" | "warn";
}) {
  const toneClass =
    tone === "warn"
      ? "text-destructive"
      : tone === "ok"
      ? "text-muted-foreground"
      : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-h2 ${toneClass}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
