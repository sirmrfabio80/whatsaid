import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Download, Check, FileText, Sparkles, MessageSquareText, Globe, FileDown, RotateCw, Send } from "lucide-react";
import { getLanguageLabel } from "@/lib/languages";
import { useToast } from "@/hooks/use-toast";
import { exportDocx, exportPdf } from "@/lib/export";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface JobOutput {
  id: string;
  output_type: string;
  content: string;
  custom_prompt: string | null;
}

export interface JobMeta {
  language_detected: string | null;
  duration_seconds: number | null;
  file_name: string;
  created_at: string;
}

interface JobResultsProps {
  jobId: string;
  onMetaLoaded?: (meta: JobMeta) => void;
}

export default function JobResults({ jobId, onMetaLoaded }: JobResultsProps) {
  const { toast } = useToast();
  const [outputs, setOutputs] = useState<JobOutput[]>([]);
  const [meta, setMeta] = useState<JobMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  const fetchData = useCallback(async () => {
    const [{ data: outputsData }, { data: jobData }] = await Promise.all([
      supabase
        .from("job_outputs")
        .select("id, output_type, content, custom_prompt")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true }),
      supabase
        .from("jobs")
        .select("language_detected, duration_seconds, file_name, created_at")
        .eq("id", jobId)
        .maybeSingle(),
    ]);

    setOutputs((outputsData as JobOutput[]) ?? []);
    const m = jobData as JobMeta | null;
    setMeta(m);
    if (m) onMetaLoaded?.(m);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (content: string, filename: string, mime = "text/plain;charset=utf-8") => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRegenerate = async () => {
    if (!customPrompt.trim()) {
      toast({ title: "Please enter a prompt", variant: "destructive" });
      return;
    }

    setRegenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("regenerate", {
        body: { job_id: jobId, custom_prompt: customPrompt.trim() },
      });

      if (error) {
        toast({ title: "Regeneration failed", description: error.message, variant: "destructive" });
        return;
      }

      if (data?.error) {
        toast({ title: "Regeneration failed", description: data.error, variant: "destructive" });
        return;
      }

      toast({ title: "AI output regenerated" });
      setCustomPrompt("");
      await fetchData();
    } catch (e) {
      toast({ title: "Something went wrong", variant: "destructive" });
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center text-muted-foreground py-8 text-sm">
        Loading results...
      </div>
    );
  }

  const transcript = outputs.find((o) => o.output_type === "transcript");
  const summary = outputs.find((o) => o.output_type === "summary");
  const custom = outputs.find((o) => o.output_type === "custom");

  const baseName = meta?.file_name?.replace(/\.[^.]+$/, "") ?? "output";

  const handleDownloadAllJson = () => {
    const payload: Record<string, unknown> = {
      file_name: meta?.file_name ?? null,
      language_detected: meta?.language_detected ?? null,
      duration_seconds: meta?.duration_seconds ?? null,
    };
    if (transcript) payload.transcript = transcript.content;
    if (summary) payload.summary = summary.content;
    if (custom) {
      payload.custom_prompt = custom.custom_prompt;
      payload.custom_output = custom.content;
    }
    handleDownload(JSON.stringify(payload, null, 2), `${baseName}.json`, "application/json");
  };

  const buildExportPayload = () => ({
    fileName: meta?.file_name ?? "output",
    language: meta?.language_detected ? getLanguageLabel(meta.language_detected) : null,
    durationSeconds: meta?.duration_seconds ?? null,
    createdAt: meta?.created_at ?? null,
    transcript: transcript?.content ?? null,
    summary: summary?.content ?? null,
    customPrompt: custom?.custom_prompt ?? null,
    customOutput: custom?.content ?? null,
  });

  const handleExportDocx = async () => {
    try {
      await exportDocx(buildExportPayload());
      toast({ title: "DOCX downloaded" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const handleExportPdf = () => {
    try {
      exportPdf(buildExportPayload());
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const tabs = [
    transcript && { key: "transcript", label: "Transcript", icon: FileText, output: transcript },
    summary && { key: "summary", label: "Summary", icon: Sparkles, output: summary },
    custom && { key: "custom", label: "AI Output", icon: MessageSquareText, output: custom },
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    icon: typeof FileText;
    output: JobOutput;
  }>;

  if (tabs.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8 text-sm">
        No outputs found for this job.
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-page-enter">
      {/* Language badge */}
      {meta?.language_detected && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="rounded-lg gap-1.5 text-xs font-medium">
            <Globe className="w-3 h-3" />
            {getLanguageLabel(meta.language_detected)}
          </Badge>
        </div>
      )}

      <Tabs defaultValue={tabs[0].key} className="w-full">
        <TabsList className="w-full justify-start rounded-xl bg-muted/50 p-1 h-auto flex-wrap">
          {tabs.map(({ key, label, icon: Icon }) => (
            <TabsTrigger
              key={key}
              value={key}
              className="rounded-lg gap-1.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map(({ key, output }) => (
          <TabsContent key={key} value={key} className="mt-4">
            <Card className="rounded-xl border-border/50 shadow-sm">
              <CardContent className="p-0">
                {/* Actions bar */}
                <div className="flex items-center justify-end gap-2 p-3 border-b border-border/50">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-lg gap-1.5 text-xs h-8"
                    onClick={() => handleCopy(output.content, output.id)}
                  >
                    {copiedId === output.id ? (
                      <Check className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedId === output.id ? "Copied" : "Copy"}
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="rounded-lg gap-1.5 text-xs h-8">
                        <FileDown className="w-3.5 h-3.5" />
                        Export
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[140px]">
                      <DropdownMenuItem onClick={() => handleDownload(output.content, `${baseName}_${key}.txt`)}>
                        <Download className="w-3.5 h-3.5 mr-2" />
                        Plain text (.txt)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDownloadAllJson}>
                        <Download className="w-3.5 h-3.5 mr-2" />
                        JSON (.json)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportDocx}>
                        <Download className="w-3.5 h-3.5 mr-2" />
                        Word (.docx)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportPdf}>
                        <Download className="w-3.5 h-3.5 mr-2" />
                        PDF (print)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Content */}
                <div className="p-5 sm:p-6">
                  {output.custom_prompt && (
                    <div className="mb-4 p-3 rounded-lg bg-muted/50 text-sm">
                      <span className="text-muted-foreground font-medium">Prompt: </span>
                      <span className="text-foreground">{output.custom_prompt}</span>
                    </div>
                  )}
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                    {output.content}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Regenerate custom output */}
      <Card className="rounded-xl border-border/50 shadow-sm">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <RotateCw className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-medium">
              {custom ? "Regenerate AI output" : "Generate AI output"}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Enter a custom prompt to apply to the transcript. {custom ? "This will replace the current AI output." : ""}
          </p>
          <Textarea
            placeholder="e.g. Extract all decisions made and list who is responsible for each..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            className="rounded-xl text-sm min-h-[80px] mb-3 resize-none"
            disabled={regenerating}
          />
          <Button
            onClick={handleRegenerate}
            disabled={regenerating || !customPrompt.trim()}
            className="rounded-xl gap-1.5"
            size="sm"
          >
            {regenerating ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                {custom ? "Regenerate" : "Generate"}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
