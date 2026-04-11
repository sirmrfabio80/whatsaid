import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, Download, Check, FileText, Sparkles, HelpCircle, FileDown, Send, AlertTriangle, Loader2, Globe } from "lucide-react";
import { getLanguageLabel, LANGUAGES } from "@/lib/languages";
import { useToast } from "@/hooks/use-toast";
import { exportDocx, exportPdf, type QAEntry } from "@/lib/export";
import SpeakerChips from "@/components/SpeakerChips";
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
  speech_model: string | null;
  speaker_names: Record<string, string>;
}

interface JobResultsProps {
  jobId: string;
  onMetaLoaded?: (meta: JobMeta) => void;
}

/** Parse unique speaker labels like "Speaker A:", "Speaker B:" from transcript text */
function parseSpeakers(text: string): string[] {
  const matches = text.match(/^(Speaker [A-Z]):/gm);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.replace(":", "")))];
}

/** Replace speaker labels in text with their renamed versions */
function applySpeakerNames(text: string, names: Record<string, string>): string {
  let result = text;
  for (const [original, renamed] of Object.entries(names)) {
    if (renamed) {
      // Replace "Speaker A:" at the start of lines
      const regex = new RegExp(`^${escapeRegex(original)}:`, "gm");
      result = result.replace(regex, `${renamed}:`);
      // Replace inline references
      const inlineRegex = new RegExp(`\\b${escapeRegex(original)}\\b`, "g");
      result = result.replace(inlineRegex, renamed);
    }
  }
  return result;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function JobResults({ jobId, onMetaLoaded }: JobResultsProps) {
  const { toast } = useToast();
  const [outputs, setOutputs] = useState<JobOutput[]>([]);
  const [meta, setMeta] = useState<JobMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});

  // Summary language state
  const [summaryLang, setSummaryLang] = useState<string>("");
  const [regeneratingSummary, setRegeneratingSummary] = useState(false);

  // Questions tab state
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [askingQuestion, setAskingQuestion] = useState(false);

  const fetchData = useCallback(async () => {
    const [{ data: outputsData }, { data: jobData }] = await Promise.all([
      supabase
        .from("job_outputs")
        .select("id, output_type, content, custom_prompt")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true }),
      supabase
        .from("jobs")
        .select("language_detected, duration_seconds, file_name, created_at, speech_model, speaker_names")
        .eq("id", jobId)
        .maybeSingle(),
    ]);

    setOutputs((outputsData as JobOutput[]) ?? []);
    const m = jobData
      ? {
          ...jobData,
          speaker_names: (jobData.speaker_names as Record<string, string>) ?? {},
        }
      : null;
    setMeta(m as JobMeta | null);
    if (m) {
      setSpeakerNames((m.speaker_names as Record<string, string>) ?? {});
      setSummaryLang((prev) => prev || m.language_detected || "en");
      onMetaLoaded?.(m as JobMeta);
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- Speaker renaming ----
  const handleRenameSpeaker = async (original: string, newName: string) => {
    const updated = { ...speakerNames, [original]: newName };
    setSpeakerNames(updated);
    await supabase.from("jobs").update({ speaker_names: updated }).eq("id", jobId);
  };

  const handleResetSpeakerNames = async () => {
    setSpeakerNames({});
    await supabase.from("jobs").update({ speaker_names: {} }).eq("id", jobId);
  };

  // ---- Summary language change ----
  const handleSummaryLanguageChange = async (langCode: string) => {
    if (langCode === summaryLang) return;
    setSummaryLang(langCode);
    setRegeneratingSummary(true);
    try {
      const { data, error } = await supabase.functions.invoke("regenerate", {
        body: { job_id: jobId, output_type: "summary", target_language: langCode },
      });
      if (error || data?.error) {
        toast({
          title: "Failed to regenerate summary",
          description: error?.message || data?.error,
          variant: "destructive",
        });
        return;
      }
      toast({ title: `Summary regenerated in ${getLanguageLabel(langCode)}` });
      await fetchData();
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" });
    } finally {
      setRegeneratingSummary(false);
    }
  };

  // ---- Copy ----
  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ---- Download helpers ----
  const handleDownload = (content: string, filename: string, mime = "text/plain;charset=utf-8") => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const baseName = meta?.file_name?.replace(/\.[^.]+$/, "") ?? "output";

  const handleDownloadAllJson = () => {
    const payload: Record<string, unknown> = {
      file_name: meta?.file_name ?? null,
      language_detected: meta?.language_detected ?? null,
      duration_seconds: meta?.duration_seconds ?? null,
    };
    if (transcript) payload.transcript = applySpeakerNames(transcript.content, speakerNames);
    if (summary) payload.summary = applySpeakerNames(summary.content, speakerNames);
    const questionEntries = getQuestionEntries();
    if (questionEntries.length > 0) {
      payload.questions = questionEntries.map((q) => ({
        prompt: q.custom_prompt,
        answer: applySpeakerNames(q.content, speakerNames),
      }));
    }
    handleDownload(JSON.stringify(payload, null, 2), `${baseName}.json`, "application/json");
  };

  const buildExportPayload = () => {
    const qEntries = getQuestionEntries();
    const questions: QAEntry[] = qEntries.map((q) => ({
      prompt: q.custom_prompt,
      answer: applySpeakerNames(q.content, speakerNames),
    }));
    return {
      fileName: meta?.file_name ?? "output",
      language: meta?.language_detected ? getLanguageLabel(meta.language_detected) : null,
      durationSeconds: meta?.duration_seconds ?? null,
      createdAt: meta?.created_at ?? null,
      transcript: transcript ? applySpeakerNames(transcript.content, speakerNames) : null,
      summary: summary ? applySpeakerNames(summary.content, speakerNames) : null,
      customPrompt: null,
      customOutput: null,
      questions: questions.length > 0 ? questions : undefined,
    };
  };

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

  // ---- Ask question ----
  const handleAskQuestion = async () => {
    if (!questionPrompt.trim()) {
      toast({ title: "Please enter a question", variant: "destructive" });
      return;
    }

    setAskingQuestion(true);
    try {
      const { data, error } = await supabase.functions.invoke("regenerate", {
        body: { job_id: jobId, custom_prompt: questionPrompt.trim() },
      });

      if (error) {
        toast({ title: "Failed to get answer", description: error.message, variant: "destructive" });
        return;
      }

      if (data?.error) {
        toast({ title: "Failed to get answer", description: data.error, variant: "destructive" });
        return;
      }

      toast({ title: "Answer saved" });
      setQuestionPrompt("");
      await fetchData();
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" });
    } finally {
      setAskingQuestion(false);
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

  // Questions: include both legacy "custom" outputs and new "question" outputs
  const getQuestionEntries = () =>
    outputs.filter((o) => o.output_type === "custom" || o.output_type === "question");

  const speakers = transcript ? parseSpeakers(transcript.content) : [];

  if (!transcript && !summary) {
    return (
      <div className="text-center text-muted-foreground py-8 text-sm">
        No outputs found for this job.
      </div>
    );
  }

  const questionEntries = getQuestionEntries();

  // ---- Per-tab actions ----
  const ActionsBar = ({ content, id, tabKey }: { content: string; id: string; tabKey: string }) => (
    <div className="flex items-center justify-end gap-2 p-3 border-b border-border/50">
      <Button
        variant="ghost"
        size="sm"
        className="rounded-lg gap-1.5 text-xs h-8"
        onClick={() => handleCopy(applySpeakerNames(content, speakerNames), id)}
      >
        {copiedId === id ? (
          <Check className="w-3.5 h-3.5 text-primary" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
        {copiedId === id ? "Copied" : "Copy"}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="rounded-lg gap-1.5 text-xs h-8">
            <FileDown className="w-3.5 h-3.5" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[140px]">
          <DropdownMenuItem
            onClick={() =>
              handleDownload(
                applySpeakerNames(content, speakerNames),
                `${baseName}_${tabKey}.txt`
              )
            }
          >
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
  );

  return (
    <div className="space-y-4 animate-page-enter">
      <Tabs defaultValue="transcript" className="w-full">
        <TabsList className="w-full justify-start rounded-xl bg-muted/50 p-1 h-auto">
          <TabsTrigger
            value="transcript"
            className="rounded-lg gap-1.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <FileText className="w-3.5 h-3.5" />
            Transcript
          </TabsTrigger>
          <TabsTrigger
            value="summary"
            className="rounded-lg gap-1.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Summary
          </TabsTrigger>
          <TabsTrigger
            value="questions"
            className="rounded-lg gap-1.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Questions
          </TabsTrigger>
        </TabsList>

        {/* ===== TRANSCRIPT TAB ===== */}
        <TabsContent value="transcript" className="mt-4">
          <Card className="rounded-xl border-border/50 shadow-sm">
            <CardContent className="p-0">
              {transcript && (
                <ActionsBar content={transcript.content} id={transcript.id} tabKey="transcript" />
              )}
              <div className="p-5 sm:p-6">
                {speakers.length > 0 && (
                  <SpeakerChips
                    speakers={speakers}
                    speakerNames={speakerNames}
                    onRename={handleRenameSpeaker}
                    onReset={handleResetSpeakerNames}
                  />
                )}
                {transcript ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                    {applySpeakerNames(transcript.content, speakerNames)}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No transcript available.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== SUMMARY TAB ===== */}
        <TabsContent value="summary" className="mt-4">
          <Card className="rounded-xl border-border/50 shadow-sm">
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-2 p-3 border-b border-border/50 flex-wrap">
                {/* Summary language selector */}
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  <label htmlFor="summary-lang" className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                    Summary language
                  </label>
                  <Select value={summaryLang} onValueChange={handleSummaryLanguageChange} disabled={regeneratingSummary}>
                    <SelectTrigger
                      id="summary-lang"
                      className="h-7 w-[140px] text-xs rounded-lg border-border/60"
                      aria-label="Summary language"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.filter((l) => l.code !== "auto").map((l) => (
                        <SelectItem key={l.code} value={l.code} className="text-xs">
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {regeneratingSummary && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                </div>

                {/* Copy / Export actions */}
                {summary && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-lg gap-1.5 text-xs h-8"
                      onClick={() => handleCopy(applySpeakerNames(summary.content, speakerNames), summary.id)}
                    >
                      {copiedId === summary.id ? (
                        <Check className="w-3.5 h-3.5 text-primary" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedId === summary.id ? "Copied" : "Copy"}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="rounded-lg gap-1.5 text-xs h-8">
                          <FileDown className="w-3.5 h-3.5" />
                          Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[140px]">
                        <DropdownMenuItem
                          onClick={() =>
                            handleDownload(
                              applySpeakerNames(summary.content, speakerNames),
                              `${baseName}_summary.txt`
                            )
                          }
                        >
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
                )}
              </div>
              <div className="p-5 sm:p-6">
                {regeneratingSummary ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Regenerating summary…
                  </div>
                ) : summary ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                    {applySpeakerNames(summary.content, speakerNames)}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No summary available.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== QUESTIONS TAB ===== */}
        <TabsContent value="questions" className="mt-4">
          <Card className="rounded-xl border-border/50 shadow-sm">
            <CardContent className="p-0">
              {/* Question input */}
              <div className="p-4 sm:p-5 border-b border-border/50">
                <label htmlFor="question-input" className="text-sm font-medium mb-2 block">
                  Ask a question about this transcript
                </label>
                <div className="flex gap-2">
                  <Textarea
                    id="question-input"
                    placeholder="e.g. What medication was mentioned? What are the next steps?"
                    value={questionPrompt}
                    onChange={(e) => setQuestionPrompt(e.target.value)}
                    className="rounded-xl text-sm min-h-[60px] resize-none flex-1"
                    disabled={askingQuestion}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAskQuestion();
                      }
                    }}
                  />
                  <Button
                    onClick={handleAskQuestion}
                    disabled={askingQuestion || !questionPrompt.trim()}
                    size="sm"
                    className="rounded-xl self-end"
                    aria-label="Submit question"
                  >
                    {askingQuestion ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Saved Q&A list */}
              <div role="log" aria-live="polite" aria-label="Questions and answers">
                {questionEntries.length === 0 ? (
                  <div className="p-5 text-center text-sm text-muted-foreground">
                    No questions asked yet. Ask a question above to get AI-generated answers based on the transcript.
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {[...questionEntries].reverse().map((entry) => (
                      <div key={entry.id} className="p-4 sm:p-5">
                        {entry.custom_prompt && (
                          <p className="text-sm font-medium text-muted-foreground mb-2">
                            Q: {entry.custom_prompt}
                          </p>
                        )}
                        <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                          {applySpeakerNames(entry.content, speakerNames)}
                        </div>
                        <div className="mt-2 flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-lg gap-1.5 text-xs h-7"
                            onClick={() => handleCopy(entry.content, entry.id)}
                          >
                            {copiedId === entry.id ? (
                              <Check className="w-3 h-3 text-primary" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            {copiedId === entry.id ? "Copied" : "Copy"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Strengthened AI disclaimer */}
      <div
        role="note"
        className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/30 p-4"
      >
        <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground/80">AI-generated content</strong> — This transcript, summary, and any AI outputs may contain errors including misidentified speakers, inaccurate medical or technical terms, and omitted or fabricated details. Do not rely on this as a verbatim record for medical, legal, or financial decisions. Always verify critical information with the original source.
        </p>
      </div>
    </div>
  );
}
