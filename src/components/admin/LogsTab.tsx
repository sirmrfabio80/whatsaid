import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import JsonBlock from "./JsonBlock";
import JobAuditCard from "./JobAuditCard";
import EdgeLogsList from "./EdgeLogsList";

interface RecentJob {
  id: string;
  file_name: string;
  title: string | null;
  status: string;
  created_at: string;
  language_selected: string | null;
  language_detected: string | null;
  duration_seconds: number | null;
  user_id: string | null;
}

interface JobOutput {
  id: string;
  output_type: string;
  content: string;
  custom_prompt: string | null;
  metadata: Record<string, unknown> | null;
  raw_response: Record<string, unknown> | null;
  created_at: string;
}

interface JobDetailsResponse {
  job: any;
  outputs: JobOutput[];
  recent_jobs: RecentJob[];
  edge_logs: Array<{
    timestamp: number;
    function_name: string | null;
    level: string | null;
    event_message: string;
  }>;
}

export default function LogsTab() {
  const [data, setData] = useState<JobDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async (jobId?: string) => {
    setLoading(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke<JobDetailsResponse>(
        "admin-get-job-details",
        { body: { job_id: jobId, limit: 20 } },
      );
      if (error) throw error;
      if (!resp) throw new Error("No data");
      setData(resp);
      setSelectedJobId(resp.job?.id ?? null);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to load job details");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading latest job…
      </div>
    );
  }

  if (!data?.job) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No jobs found.
        </CardContent>
      </Card>
    );
  }

  const transcriptOutput = data.outputs.find((o) => o.output_type === "transcript");

  return (
    <div className="space-y-6">
      {/* Job picker */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm text-muted-foreground shrink-0">Job:</span>
          <Select
            value={selectedJobId ?? undefined}
            onValueChange={(v) => load(v)}
          >
            <SelectTrigger className="max-w-xl">
              <SelectValue placeholder="Select a job" />
            </SelectTrigger>
            <SelectContent>
              {data.recent_jobs.map((j) => (
                <SelectItem key={j.id} value={j.id}>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(j.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Badge variant="outline" className="text-[10px]">{j.status}</Badge>
                    <span className="truncate">{j.title || j.file_name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load(selectedJobId ?? undefined)}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {/* Header + audit */}
      <JobAuditCard job={data.job} />

      {/* AAI request */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">AssemblyAI request payload</CardTitle>
        </CardHeader>
        <CardContent>
          <JsonBlock
            data={data.job.transcription_config}
            title="transcription_config (sent to AssemblyAI)"
          />
        </CardContent>
      </Card>

      {/* AAI response */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">AssemblyAI raw response</CardTitle>
        </CardHeader>
        <CardContent>
          <JsonBlock
            data={transcriptOutput?.raw_response}
            title={`raw_response${transcriptOutput ? "" : " (no transcript output yet)"}`}
            defaultCollapsed={false}
            maxHeight="36rem"
          />
        </CardContent>
      </Card>

      {/* Outputs list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Post-processing outputs{" "}
            <span className="text-xs font-normal text-muted-foreground">
              ({data.outputs.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.outputs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No outputs yet.</p>
          ) : (
            data.outputs.map((o) => (
              <details
                key={o.id}
                className="rounded-lg border bg-muted/20 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="cursor-pointer flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="secondary">{o.output_type}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {o.content.length.toLocaleString()} chars
                    </span>
                    {o.custom_prompt && (
                      <span className="truncate text-xs text-muted-foreground italic">
                        “{o.custom_prompt.slice(0, 80)}”
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(o.created_at).toLocaleString()}
                  </span>
                </summary>
                <div className="px-3 pb-3 pt-1 space-y-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                      Content
                    </div>
                    <pre className="text-xs font-mono whitespace-pre-wrap bg-background/60 rounded-md border p-3 max-h-64 overflow-auto">
                      {o.content || "(empty)"}
                    </pre>
                  </div>
                  {o.metadata && Object.keys(o.metadata).length > 0 && (
                    <JsonBlock data={o.metadata} title="metadata" defaultCollapsed />
                  )}
                </div>
              </details>
            ))
          )}
        </CardContent>
      </Card>

      {/* Edge logs */}
      <EdgeLogsList logs={data.edge_logs} />
    </div>
  );
}
