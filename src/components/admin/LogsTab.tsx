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
import { RefreshCw, Loader2, Search, X, Inbox } from "lucide-react";
import { toast } from "sonner";
import JsonBlock from "./JsonBlock";
import JobAuditCard from "./JobAuditCard";
import EdgeLogsList from "./EdgeLogsList";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";

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
  upload_attestation?: {
    id: string;
    version: string;
    accepted_at: string;
    metadata: { basis?: string; contextNote?: string | null } | null;
  } | null;
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

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data?.recent_jobs ?? [];
    return (data?.recent_jobs ?? []).filter((j) => {
      const haystack = [
        j.file_name,
        j.title ?? "",
        j.user_id ?? "",
        j.id,
        j.status,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data?.recent_jobs, search]);

  if (loading && !data) {
    return <LoadingState rows={2} titleWidth="w-48" rowHeight="h-32" className="py-6" />;
  }

  if (!data?.job) {
    return <EmptyState icon={Inbox} title="No jobs found" description="There are no jobs in the system yet." />;
  }

  const transcriptOutput = data.outputs.find((o) => o.output_type === "transcript");

  return (
    <div className="space-y-6">
      {/* Job picker */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
          <span className="text-sm text-muted-foreground shrink-0">Job:</span>
          <Select
            value={selectedJobId ?? undefined}
            onValueChange={(v) => load(v)}
          >
            <SelectTrigger className="max-w-xl min-w-[16rem]">
              <SelectValue placeholder="Select a job" />
            </SelectTrigger>
            <SelectContent>
              {filteredJobs.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No jobs match “{search}”
                </div>
              ) : (
                filteredJobs.map((j) => (
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
                ))
              )}
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[12rem] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by file, title, user id…"
              className="h-9 pl-8 pr-8 text-sm"
              aria-label="Filter jobs"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded"
                aria-label="Clear filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {search && (
            <span className="text-xs text-muted-foreground shrink-0">
              {filteredJobs.length} / {data?.recent_jobs.length ?? 0}
            </span>
          )}
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
      <JobAuditCard job={data.job} uploadAttestation={data.upload_attestation ?? null} />

      {/* AAI request */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-h3">AssemblyAI request payload</CardTitle>
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
          <CardTitle className="text-h3">AssemblyAI raw response</CardTitle>
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
          <CardTitle className="text-h3">
            Post-processing outputs{" "}
            <span className="text-caption font-normal text-muted-foreground">
              ({data.outputs.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.outputs.length === 0 ? (
            <p className="text-body-sm text-muted-foreground">No outputs yet.</p>
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
