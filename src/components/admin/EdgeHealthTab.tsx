import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Trash2 } from "lucide-react";
import {
  clearEdgeTelemetry,
  getEdgeTelemetryEvents,
  getEdgeTelemetryRollup,
  subscribeEdgeTelemetry,
  type EdgeTelemetryEvent,
} from "@/lib/edge-telemetry";


type CheckResult = {
  name: string;
  status: "idle" | "running" | "ok" | "fail";
  httpStatus?: number;
  durationMs?: number;
  error?: string;
  corsOk?: boolean;
};

// Curated list of edge functions safe to ping via OPTIONS (CORS preflight).
// OPTIONS handlers don't execute business logic and are side-effect free.
const FUNCTIONS: string[] = [
  "geo-check",
  "check-login-region",
  "create-job",
  "record-tos-acceptance",
  "record-consent",
  "suggest-speakers",
  "detect-language",
  "generate-tags",
  "generate-title",
  "share-transcript",
  "claim-transcript-share",
  "dsr-export",
  "dsr-rectification-request",
  "validate-profile-email",
  "validate-signup-country",
  "preview-transactional-email",
  "send-transactional-email",
  "paddle-webhook",
  "auth-email-hook",
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

async function pingFunction(name: string): Promise<CheckResult> {
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  const started = performance.now();
  try {
    const res = await fetch(url, {
      method: "OPTIONS",
      headers: {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type,apikey",
        Origin: window.location.origin,
      },
    });
    const duration = Math.round(performance.now() - started);
    const corsOk = !!res.headers.get("access-control-allow-origin");
    const ok = res.status >= 200 && res.status < 400;
    return {
      name,
      status: ok ? "ok" : "fail",
      httpStatus: res.status,
      durationMs: duration,
      corsOk,
      error: ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      name,
      status: "fail",
      durationMs: Math.round(performance.now() - started),
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}

export default function EdgeHealthTab() {
  const initial = useMemo<Record<string, CheckResult>>(
    () => Object.fromEntries(FUNCTIONS.map((n) => [n, { name: n, status: "idle" as const }])),
    [],
  );
  const [results, setResults] = useState<Record<string, CheckResult>>(initial);
  const [running, setRunning] = useState(false);

  const runAll = useCallback(async () => {
    setRunning(true);
    setResults((prev) =>
      Object.fromEntries(FUNCTIONS.map((n) => [n, { ...prev[n], status: "running" as const }])),
    );
    const settled = await Promise.all(FUNCTIONS.map((n) => pingFunction(n)));
    setResults(Object.fromEntries(settled.map((r) => [r.name, r])));
    setRunning(false);
  }, []);

  const summary = useMemo(() => {
    const all = Object.values(results);
    const ok = all.filter((r) => r.status === "ok").length;
    const fail = all.filter((r) => r.status === "fail").length;
    const idle = all.filter((r) => r.status === "idle").length;
    return { ok, fail, idle, total: all.length };
  }, [results]);

  return (
    <div className="space-y-6">

    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Edge function health</CardTitle>
          <p className="text-body-sm text-muted-foreground mt-1">
            Pings each function with a CORS preflight (<code className="text-caption">OPTIONS</code>) from the
            browser. No business logic runs and no data is mutated.
          </p>
        </div>
        <Button onClick={runAll} disabled={running} aria-label="Run health checks">
          {running ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running…
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" /> Run checks
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 text-caption">
          <Badge variant="outline">Total: {summary.total}</Badge>
          <Badge variant="outline" className="text-green-600">OK: {summary.ok}</Badge>
          <Badge variant="outline" className="text-destructive">Fail: {summary.fail}</Badge>
          {summary.idle > 0 && <Badge variant="outline">Pending: {summary.idle}</Badge>}
        </div>

        <div className="rounded-md border divide-y">
          {FUNCTIONS.map((name) => {
            const r = results[name];
            return (
              <div key={name} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  {r.status === "ok" && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                  {r.status === "fail" && <XCircle className="w-4 h-4 text-destructive shrink-0" />}
                  {r.status === "running" && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                  {r.status === "idle" && <span className="w-4 h-4 rounded-full border shrink-0" aria-hidden />}
                  <code className="text-body-sm truncate">{name}</code>
                </div>
                <div className="flex items-center gap-2 text-caption text-muted-foreground shrink-0">
                  {r.corsOk === false && r.status === "fail" && (
                    <Badge variant="outline" className="text-destructive">No CORS</Badge>
                  )}
                  {typeof r.httpStatus === "number" && <span>HTTP {r.httpStatus}</span>}
                  {typeof r.durationMs === "number" && <span>{r.durationMs}ms</span>}
                  {r.error && <span className="text-destructive truncate max-w-[200px]" title={r.error}>{r.error}</span>}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-caption text-muted-foreground">
          A failure here usually means the function is undeployed, has missing CORS headers, or is unreachable
          from the browser's network. Authenticated logic isn't exercised — use the function-specific UIs to
          verify behaviour.
        </p>
      </CardContent>
      </Card>
      <EdgeTelemetryCard />
    </div>
  );
}

function EdgeTelemetryCard() {
  const [, tick] = useState(0);

  useEffect(() => {
    const unsub = subscribeEdgeTelemetry(() => tick((n) => n + 1));
    return unsub;
  }, []);

  const rollup = getEdgeTelemetryRollup();
  const events = getEdgeTelemetryEvents();
  const finals = events.filter((e): e is Extract<EdgeTelemetryEvent, { type: "final" }> => e.type === "final");
  const recent = finals.slice(-15).reverse();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Edge invocation telemetry</CardTitle>
          <p className="text-body-sm text-muted-foreground mt-1">
            Structured client-side log of every Edge Function call made through{" "}
            <code className="text-caption">invokeWithRetry</code>. No request or response payloads are stored —
            only function name, attempts, HTTP status, reason class, and timing.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            clearEdgeTelemetry();
            tick((n) => n + 1);
          }}
          aria-label="Clear telemetry"
        >
          <Trash2 className="w-4 h-4 mr-2" /> Clear
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {rollup.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            No invocations recorded in this browser yet. Trigger a job creation or consent action to populate.
          </p>
        ) : (
          <div className="rounded-md border divide-y">
            {rollup.map((row) => {
              const failRate = row.total === 0 ? 0 : Math.round((row.fatal / row.total) * 100);
              const topReasons = Object.entries(row.reasonCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([k, v]) => `${k} ×${v}`)
                .join(", ");
              return (
                <div key={row.functionName} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {row.fatal === 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive shrink-0" />
                    )}
                    <code className="text-body-sm truncate">{row.functionName}</code>
                  </div>
                  <div className="flex items-center gap-2 text-caption text-muted-foreground shrink-0 flex-wrap">
                    <Badge variant="outline">{row.total} calls</Badge>
                    <Badge variant="outline" className="text-green-600">{row.success} ok</Badge>
                    {row.fatal > 0 && (
                      <Badge variant="outline" className="text-destructive">
                        {row.fatal} fail ({failRate}%)
                      </Badge>
                    )}
                    {row.retried > 0 && <Badge variant="outline">{row.retried} retried</Badge>}
                    <span>{row.avgMs}ms avg</span>
                    {topReasons && <span title={topReasons} className="truncate max-w-[260px]">{topReasons}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {recent.length > 0 && (
          <div>
            <h4 className="text-body-sm font-medium mb-2">Recent calls</h4>
            <div className="rounded-md border divide-y text-caption">
              {recent.map((e, idx) => (
                <div key={`${e.at}-${idx}`} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {e.outcome === "success" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                    )}
                    <code className="truncate">{e.functionName}</code>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                    <span>{e.attempts === 1 ? "1 attempt" : `${e.attempts} attempts`}</span>
                    {typeof e.status === "number" && <span>HTTP {e.status}</span>}
                    {e.reason && e.outcome !== "success" && <span>{e.reason}</span>}
                    <span>{e.totalMs}ms</span>
                    <span>{new Date(e.at).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-caption text-muted-foreground">
          Data is stored in this browser only (localStorage rollup + in-memory ring). Clearing browser storage or
          using a different device will reset the counts.
        </p>
      </CardContent>
    </Card>
  );
}

