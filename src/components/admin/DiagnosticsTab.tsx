import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Play, Trash2, Activity, Globe, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  getChunkFailures,
  clearChunkFailures,
  subscribeChunkFailures,
  type ChunkFailure,
} from "@/lib/chunk-diagnostics";

type Strategy = "mobile" | "desktop";

interface PsiRunResult {
  id: string;
  route: string;
  strategy: Strategy;
  ranAt: number;
  performance: number | null;
  seo: number | null;
  lcpMs: number | null;
  fcpMs: number | null;
  ttfbMs: number | null;
  cls: number | null;
  renderBlockingMs: number | null;
  renderBlockingCount: number;
  cacheSavingsBytes: number;
  cacheItems: Array<{ url: string; ttlMs: number; bytes: number }>;
  raw: unknown;
}

interface LiveVital {
  name: string;
  value: number;
  rating?: string;
  ts: number;
}

const ORIGIN = "https://whatsaid.app";
const COMMON_ROUTES = ["/", "/convert", "/pricing", "/help", "/login", "/signup"];

function fmtMs(v: number | null) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(2)} s`;
  return `${Math.round(v)} ms`;
}

function fmtKb(bytes: number) {
  if (!bytes) return "0 KiB";
  return `${(bytes / 1024).toFixed(0)} KiB`;
}

function scoreColor(score: number | null) {
  if (score === null) return "bg-muted text-muted-foreground";
  if (score >= 90) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  return "bg-destructive/15 text-destructive";
}

function ratingColor(rating?: string) {
  if (rating === "good") return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  if (rating === "needs-improvement") return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  if (rating === "poor") return "bg-destructive/15 text-destructive";
  return "bg-muted text-muted-foreground";
}

export default function DiagnosticsTab() {
  const [route, setRoute] = useState("/");
  const [strategy, setStrategy] = useState<Strategy>("desktop");
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<PsiRunResult[]>([]);
  const [chunkFailures, setChunkFailures] = useState<ChunkFailure[]>(() => getChunkFailures());

  useEffect(() => {
    return subscribeChunkFailures(() => setChunkFailures(getChunkFailures()));
  }, []);



  // Capture live Web Vitals from the current admin session
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const wv = await import("web-vitals");
        const push = (m: { name: string; value: number; rating?: string }) => {
          if (cancelled) return;
          setLiveVitals((prev) => {
            const next = prev.filter((p) => p.name !== m.name);
            next.push({ name: m.name, value: m.value, rating: m.rating, ts: Date.now() });
            return next;
          });
        };
        wv.onLCP(push);
        wv.onCLS(push);
        wv.onINP(push);
        wv.onFCP(push);
        wv.onTTFB(push);
      } catch (e) {
        console.warn("web-vitals load failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runPsi = useCallback(async () => {
    const cleanRoute = route.startsWith("/") ? route : `/${route}`;
    const targetUrl = `${ORIGIN}${cleanRoute}`;
    setRunning(true);
    try {
      const params = new URLSearchParams({
        url: targetUrl,
        strategy,
      });
      params.append("category", "performance");
      params.append("category", "seo");

      const res = await fetch(
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`PSI ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      const lhr = data.lighthouseResult;
      const audits = lhr?.audits ?? {};
      const categories = lhr?.categories ?? {};

      const lcp = audits["largest-contentful-paint"]?.numericValue ?? null;
      const fcp = audits["first-contentful-paint"]?.numericValue ?? null;
      const ttfb = audits["server-response-time"]?.numericValue ?? null;
      const cls = audits["cumulative-layout-shift"]?.numericValue ?? null;

      const renderBlocking = audits["render-blocking-resources"] ?? audits["render-blocking-insight"];
      const renderBlockingMs = renderBlocking?.details?.overallSavingsMs ?? renderBlocking?.numericValue ?? null;
      const renderBlockingItems: Array<{ url: string }> = renderBlocking?.details?.items ?? [];

      const cache = audits["uses-long-cache-ttl"] ?? audits["cache-insight"];
      const cacheItems: Array<{ url: string; cacheLifetimeMs?: number; totalBytes?: number }> =
        cache?.details?.items ?? [];
      const cacheSavingsBytes = cache?.details?.overallSavingsBytes ?? cache?.details?.debugData?.wastedBytes ?? 0;

      const result: PsiRunResult = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        route: cleanRoute,
        strategy,
        ranAt: Date.now(),
        performance: categories.performance ? Math.round(categories.performance.score * 100) : null,
        seo: categories.seo ? Math.round(categories.seo.score * 100) : null,
        lcpMs: lcp,
        fcpMs: fcp,
        ttfbMs: ttfb,
        cls: cls,
        renderBlockingMs,
        renderBlockingCount: renderBlockingItems.length,
        cacheSavingsBytes: Math.round(cacheSavingsBytes ?? 0),
        cacheItems: cacheItems.slice(0, 5).map((i) => ({
          url: i.url,
          ttlMs: i.cacheLifetimeMs ?? 0,
          bytes: i.totalBytes ?? 0,
        })),
        raw: lhr,
      };

      setRuns((prev) => [result, ...prev].slice(0, 20));
      toast.success(`Lighthouse: ${cleanRoute} (${strategy})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`PSI failed: ${msg}`);
    } finally {
      setRunning(false);
    }
  }, [route, strategy]);

  const clearRuns = () => setRuns([]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-h3">
            <Activity className="h-4 w-4" /> Live Web Vitals (this session)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {liveVitals.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">
              Waiting for Web Vitals signals from the current page…
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {liveVitals
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((v) => (
                  <div
                    key={v.name}
                    className="rounded-lg border border-border bg-card/50 p-3"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-body-xs font-mono uppercase tracking-wide text-muted-foreground">
                        {v.name}
                      </span>
                      {v.rating && (
                        <Badge variant="secondary" className={ratingColor(v.rating)}>
                          {v.rating}
                        </Badge>
                      )}
                    </div>
                    <div className="text-h4 font-semibold tabular-nums">
                      {v.name === "CLS" ? v.value.toFixed(3) : fmtMs(v.value)}
                    </div>
                  </div>
                ))}
            </div>
          )}
          <p className="text-body-xs text-muted-foreground mt-3">
            Captured via the <code className="px-1 rounded bg-muted">web-vitals</code> library on this page only. Navigate to a route then return here to refresh.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-h3">
            <Globe className="h-4 w-4" /> Lighthouse per route (PageSpeed Insights)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-body-xs text-muted-foreground mb-1 block">
                Route on {ORIGIN}
              </label>
              <Input
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                placeholder="/"
                disabled={running}
              />
            </div>
            <div>
              <label className="text-body-xs text-muted-foreground mb-1 block">Strategy</label>
              <Select value={strategy} onValueChange={(v) => setStrategy(v as Strategy)} disabled={running}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desktop">Desktop</SelectItem>
                  <SelectItem value="mobile">Mobile</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={runPsi} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Run Lighthouse
            </Button>
            <Button variant="outline" onClick={clearRuns} disabled={!runs.length || running}>
              <Trash2 className="h-4 w-4 mr-2" /> Clear
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-body-xs text-muted-foreground self-center">Quick:</span>
            {COMMON_ROUTES.map((r) => (
              <Button
                key={r}
                size="sm"
                variant="outline"
                disabled={running}
                onClick={() => setRoute(r)}
              >
                {r}
              </Button>
            ))}
          </div>

          {runs.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">
              No runs yet. Each run takes ~15–25s and uses Google's public PSI API (rate-limited without a key).
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Route</TableHead>
                    <TableHead>Strategy</TableHead>
                    <TableHead className="text-right">Perf</TableHead>
                    <TableHead className="text-right">SEO</TableHead>
                    <TableHead className="text-right">LCP</TableHead>
                    <TableHead className="text-right">FCP</TableHead>
                    <TableHead className="text-right">TTFB</TableHead>
                    <TableHead className="text-right">CLS</TableHead>
                    <TableHead className="text-right">Render-block</TableHead>
                    <TableHead className="text-right">Cache savings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-body-xs">{r.route}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{r.strategy}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className={scoreColor(r.performance)}>
                          {r.performance ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className={scoreColor(r.seo)}>
                          {r.seo ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMs(r.lcpMs)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMs(r.fcpMs)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMs(r.ttfbMs)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.cls === null ? "—" : r.cls.toFixed(3)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtMs(r.renderBlockingMs)}
                        {r.renderBlockingCount > 0 && (
                          <span className="text-muted-foreground"> ({r.renderBlockingCount})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtKb(r.cacheSavingsBytes)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {runs.length > 0 && runs[0].cacheItems.length > 0 && (
            <div>
              <h4 className="text-body-sm font-medium mb-2">
                Top cacheable assets — last run ({runs[0].route} / {runs[0].strategy})
              </h4>
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead className="text-right">Cache TTL</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs[0].cacheItems.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-body-xs max-w-[400px] truncate">
                          {item.url}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.ttlMs ? fmtMs(item.ttlMs) : <span className="text-destructive">none</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtKb(item.bytes)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
