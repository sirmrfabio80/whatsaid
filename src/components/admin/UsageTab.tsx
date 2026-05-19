import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, BarChart3 } from "lucide-react";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Admin Usage tab — reads the durable usage ledger written by
 * `check_and_record_usage`. Read-only; backed by RLS that allows admins to
 * view all rows via the service-role escape hatch the rest of the admin
 * tabs already use. We keep the query small (max 500 rows) and aggregate
 * client-side because per-action counts are usually low.
 */
interface UsageRow {
  id: string;
  user_id: string;
  job_id: string | null;
  action: string;
  scope: string;
  units: number;
  created_at: string;
}

interface ActionAgg {
  action: string;
  count: number;
  uniqueUsers: number;
}

const RANGE_OPTIONS = [
  { value: "24h", label: "Last 24h", hours: 24 },
  { value: "7d", label: "Last 7 days", hours: 24 * 7 },
  { value: "30d", label: "Last 30 days", hours: 24 * 30 },
] as const;

export default function UsageTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [range, setRange] = useState<typeof RANGE_OPTIONS[number]["value"]>("7d");
  const [actionFilter, setActionFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const opt = RANGE_OPTIONS.find((r) => r.value === range)!;
    const since = new Date(Date.now() - opt.hours * 3_600_000).toISOString();
    const { data, error: err } = await supabase
      .from("usage_events")
      .select("id, user_id, job_id, action, scope, units, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows((data ?? []) as UsageRow[]);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const aggregates = useMemo<ActionAgg[]>(() => {
    const byAction = new Map<string, { count: number; users: Set<string> }>();
    for (const r of rows) {
      const entry = byAction.get(r.action) ?? { count: 0, users: new Set<string>() };
      entry.count += r.units;
      entry.users.add(r.user_id);
      byAction.set(r.action, entry);
    }
    return [...byAction.entries()]
      .map(([action, v]) => ({ action, count: v.count, uniqueUsers: v.users.size }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const actionOptions = useMemo(
    () => ["all", ...aggregates.map((a) => a.action)],
    [aggregates],
  );

  const filteredRows = useMemo(
    () => (actionFilter === "all" ? rows : rows.filter((r) => r.action === actionFilter)),
    [rows, actionFilter],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Usage events
            </CardTitle>
            <CardDescription>
              Durable spend-guardrail ledger (usage_events). Counts what
              <code className="mx-1 text-xs">check_and_record_usage</code>
              has recorded over the selected window.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <LoadingState rows={3} />
          ) : error ? (
            <EmptyState
              icon={BarChart3}
              title="Could not load usage events"
              description={error}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No usage events in this window"
              description="Quota checks haven't fired in the selected range."
            />
          ) : (
            <>
              <section>
                <h3 className="text-body-sm font-semibold mb-2">Totals by action</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {aggregates.map((a) => (
                    <div
                      key={a.action}
                      className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-body-sm font-medium truncate" title={a.action}>
                          {a.action}
                        </p>
                        <p className="text-caption text-muted-foreground">
                          {a.uniqueUsers} user{a.uniqueUsers === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 font-mono">
                        {a.count}
                      </Badge>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-body-sm font-semibold">
                    Recent events ({filteredRows.length})
                  </h3>
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {actionOptions.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a === "all" ? "All actions" : a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-body-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Time</th>
                        <th className="text-left px-3 py-2 font-medium">Action</th>
                        <th className="text-left px-3 py-2 font-medium">Scope</th>
                        <th className="text-left px-3 py-2 font-medium">User</th>
                        <th className="text-left px-3 py-2 font-medium">Job</th>
                        <th className="text-right px-3 py-2 font-medium">Units</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.slice(0, 100).map((r) => (
                        <tr key={r.id} className="border-t border-border">
                          <td className="px-3 py-2 font-mono text-caption text-muted-foreground">
                            {new Date(r.created_at).toLocaleString()}
                          </td>
                          <td className="px-3 py-2">{r.action}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.scope}</td>
                          <td className="px-3 py-2 font-mono text-caption">
                            {r.user_id.slice(0, 8)}…
                          </td>
                          <td className="px-3 py-2 font-mono text-caption">
                            {r.job_id ? `${r.job_id.slice(0, 8)}…` : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{r.units}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredRows.length > 100 && (
                  <p className="text-caption text-muted-foreground mt-2">
                    Showing the most recent 100 of {filteredRows.length} rows in this window.
                  </p>
                )}
              </section>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
