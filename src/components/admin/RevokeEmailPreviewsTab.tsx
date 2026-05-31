import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { Badge } from "@/components/ui/badge";

interface PreviewScenario {
  id: string;
  label: string;
  description: string;
  input: {
    title: string;
    reason: string | null;
    revokerLabel: string | null;
  };
  subject: string;
  html: string;
  text: string;
}

/**
 * Admin-only preview of the share-revocation notification email across all
 * canonical scenarios (neither / reason-only / revoker-only / both / extreme
 * lengths / XSS). Renders the HTML in a sandboxed iframe and shows the
 * subject + plain-text fallback alongside.
 */
export default function RevokeEmailPreviewsTab() {
  const [scenarios, setScenarios] = useState<PreviewScenario[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke(
        "preview-share-revoke-email",
        { body: {} },
      );
      if (invokeErr) throw invokeErr;
      const list = (data?.previews ?? []) as PreviewScenario[];
      setScenarios(list);
      setActiveId(list[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load previews");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const active = useMemo(
    () => scenarios?.find((s) => s.id === activeId) ?? null,
    [scenarios, activeId],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Share-revocation email previews</CardTitle>
          <p className="text-body-sm text-muted-foreground mt-1">
            Renders every canonical scenario so you can verify subject, HTML and
            plain-text output before any real notification is sent. No emails
            are sent from this page.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !scenarios && <LoadingState rows={3} />}
        {error && <ErrorState title="Could not load previews" description={error} />}

        {scenarios && active && (
          <Tabs value={activeId ?? undefined} onValueChange={setActiveId}>
            <TabsList className="flex flex-wrap h-auto">
              {scenarios.map((s) => (
                <TabsTrigger key={s.id} value={s.id}>
                  {s.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {scenarios.map((s) => (
              <TabsContent key={s.id} value={s.id} className="space-y-4 pt-4">
                <p className="text-body-sm text-muted-foreground">{s.description}</p>

                <div className="grid gap-3 sm:grid-cols-3">
                  <MetaCell label="Title (input)" value={s.input.title} />
                  <MetaCell
                    label="Reason (input)"
                    value={s.input.reason ?? "—"}
                    muted={!s.input.reason}
                  />
                  <MetaCell
                    label="Revoker (input)"
                    value={s.input.revokerLabel ?? "—"}
                    muted={!s.input.revokerLabel}
                  />
                </div>

                <div className="rounded-lg border bg-muted/40 px-3 py-2">
                  <div className="flex items-center gap-2 text-caption text-muted-foreground uppercase tracking-wide">
                    Subject
                    <Badge variant="secondary" className="font-mono">
                      {s.subject.length} chars
                    </Badge>
                  </div>
                  <p className="font-mono text-body-sm mt-1 break-all">{s.subject}</p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-caption text-muted-foreground uppercase tracking-wide">
                      HTML preview
                    </div>
                    <iframe
                      title={`Revoke email HTML — ${s.label}`}
                      sandbox=""
                      srcDoc={s.html}
                      className="w-full h-[420px] rounded-lg border bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="text-caption text-muted-foreground uppercase tracking-wide">
                      Plain text
                    </div>
                    <pre className="w-full h-[420px] overflow-auto rounded-lg border bg-muted/40 p-3 text-body-sm whitespace-pre-wrap font-mono">
                      {s.text}
                    </pre>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function MetaCell({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-caption text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <p
        className={`mt-1 text-body-sm break-words ${muted ? "text-muted-foreground italic" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
