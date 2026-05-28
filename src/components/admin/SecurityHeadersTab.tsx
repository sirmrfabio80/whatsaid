import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert, Trash2 } from "lucide-react";
import {
  getFrameDiagnostics,
  clearFrameDiagnostics,
  subscribeFrameDiagnostics,
  type FrameDiagnostic,
} from "@/lib/frame-diagnostics";
// Headers we surface explicitly. Anything else is shown in the "Other" list.
const TRACKED_HEADERS = [
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "strict-transport-security",
  "referrer-policy",
  "x-content-type-options",
  "cross-origin-opener-policy",
  "permissions-policy",
] as const;

type HeaderMap = Record<string, string>;

interface FetchResult {
  url: string;
  status: number;
  fetchedAt: number;
  headers: HeaderMap;
}

function parseCsp(value: string): Array<{ directive: string; sources: string[] }> {
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [directive, ...sources] = part.split(/\s+/);
      return { directive, sources };
    });
}

function frameAncestorsFromCsp(value: string | undefined): string[] | null {
  if (!value) return null;
  const directive = parseCsp(value).find((d) => d.directive === "frame-ancestors");
  return directive ? directive.sources : null;
}

export default function SecurityHeadersTab() {
  const [url, setUrl] = useState(() => window.location.origin + "/");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<FrameDiagnostic[]>(() => getFrameDiagnostics());

  useEffect(() => {
    return subscribeFrameDiagnostics(() => setDiagnostics(getFrameDiagnostics()));
  }, []);

  const run = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      // Use GET (HEAD is sometimes blocked by SPAs/CDNs) and discard the body.
      const res = await fetch(target, { method: "GET", cache: "no-store", credentials: "omit" });
      const headers: HeaderMap = {};
      res.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      setResult({ url: target, status: res.status, fetchedAt: Date.now(), headers });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch headers");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run(url);
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const csp = result?.headers["content-security-policy"];
  const cspReportOnly = result?.headers["content-security-policy-report-only"];
  const xfo = result?.headers["x-frame-options"];

  const frameAncestors = useMemo(
    () => frameAncestorsFromCsp(csp) ?? frameAncestorsFromCsp(cspReportOnly),
    [csp, cspReportOnly],
  );

  const lovableEmbeddable = useMemo(() => {
    if (xfo && /^(deny|sameorigin)$/i.test(xfo.trim())) return false;
    if (!frameAncestors) return true; // No directive = no restriction.
    if (frameAncestors.includes("'none'")) return false;
    const allowedHosts = ["*.lovable.app", "*.lovableproject.com", "lovable.dev", "*.lovable.dev"];
    return allowedHosts.some((host) =>
      frameAncestors.some((src) => src.includes(host.replace("*.", ""))),
    );
  }, [xfo, frameAncestors]);

  const cspDirectives = useMemo(() => {
    const value = csp ?? cspReportOnly;
    return value ? parseCsp(value) : [];
  }, [csp, cspReportOnly]);

  const otherHeaders = useMemo(() => {
    if (!result) return [] as Array<[string, string]>;
    return Object.entries(result.headers).filter(
      ([key]) => !TRACKED_HEADERS.includes(key as (typeof TRACKED_HEADERS)[number]),
    );
  }, [result]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Security headers inspector</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-body-sm text-muted-foreground">
            Fetches the URL from the browser and surfaces CSP, <code>frame-ancestors</code>, and
            framing controls. Useful when the Lovable preview iframe fails to embed.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/"
              className="flex-1"
            />
            <Button onClick={() => void run(url)} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">Refresh</span>
            </Button>
          </div>
          {error && (
            <p className="text-body-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {result && (
            <p className="text-caption text-muted-foreground">
              Fetched <code>{result.url}</code> · status {result.status} ·{" "}
              {new Date(result.fetchedAt).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {lovableEmbeddable ? (
                <>
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  Lovable preview can embed this URL
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                  Lovable preview is blocked from embedding this URL
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-body-sm">
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground w-44 shrink-0">X-Frame-Options</span>
              {xfo ? (
                <Badge variant="outline" className="font-mono">{xfo}</Badge>
              ) : (
                <span className="text-muted-foreground">— not set</span>
              )}
            </div>
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground w-44 shrink-0">frame-ancestors</span>
              {frameAncestors ? (
                <div className="flex flex-wrap gap-1">
                  {frameAncestors.map((src) => (
                    <Badge key={src} variant="outline" className="font-mono">
                      {src}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground">— not set</span>
              )}
            </div>
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground w-44 shrink-0">CSP mode</span>
              <Badge variant={csp ? "default" : "outline"}>
                {csp ? "Enforcing" : cspReportOnly ? "Report-only" : "None"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {cspDirectives.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Content-Security-Policy directives</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {cspDirectives.map(({ directive, sources }) => (
                <div key={directive} className="text-body-sm">
                  <span className="font-mono font-medium">{directive}</span>{" "}
                  <span className="font-mono text-muted-foreground break-all">
                    {sources.join(" ") || "—"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {result && otherHeaders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Other response headers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-caption font-mono">
              {otherHeaders.map(([key, value]) => (
                <div key={key} className="break-all">
                  <span className="text-muted-foreground">{key}:</span> {value}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
