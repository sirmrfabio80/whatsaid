import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Check, FileText, Sparkles, HelpCircle, Send, AlertTriangle, Loader2, Globe } from "lucide-react";
import ShareButton from "@/components/ShareButton";
import { LANGUAGES } from "@/lib/languages";
import { applySpeakerNames } from "@/lib/speaker-names";
import { buildCanonicalPayload } from "@/lib/export-payload";
import ExportButton from "@/components/ExportButton";
import SpeakerChips from "@/components/SpeakerChips";
import StructuredSummary, { SectionBody } from "@/components/StructuredSummary";
import TranscriptEditor, { parseSegments, type SpeakerSuggestion } from "@/components/TranscriptEditor";
import { toast } from "sonner";

interface JobOutput { id: string; output_type: string; content: string; custom_prompt: string | null; }

export interface JobMeta {
  language_detected: string | null; summary_language: string | null; duration_seconds: number | null;
  file_name: string; created_at: string; recorded_at: string | null; recorded_at_source: string | null;
  speech_model: string | null; speaker_names: Record<string, string>; title: string | null;
  metadata_location_iso6709: string | null;
  location_label: string | null;
}

interface JobResultsProps { jobId: string; currentTitle?: string | null; onMetaLoaded?: (meta: JobMeta) => void; }

function parseSpeakers(text: string): string[] {
  const matches = text.match(/^(Speaker [A-Z]):/gm);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.replace(":", "")))];
}

export default function JobResults({ jobId, currentTitle, onMetaLoaded }: JobResultsProps) {
  const { t } = useTranslation();
  const [outputs, setOutputs] = useState<JobOutput[]>([]);
  const [meta, setMeta] = useState<JobMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [summaryLang, setSummaryLang] = useState<string>("");
  const [regeneratingSummary, setRegeneratingSummary] = useState(false);
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [askingQuestion, setAskingQuestion] = useState(false);
  const [excludedQAIds, setExcludedQAIds] = useState<Set<string>>(new Set());
  const [transcriptEdited, setTranscriptEdited] = useState(false);
  const [extraSpeakers, setExtraSpeakers] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<SpeakerSuggestion[]>([]);
  const [suggestingForSpeaker, setSuggestingForSpeaker] = useState<string | null>(null);
  const [suggestionTarget, setSuggestionTarget] = useState<string | null>(null);
  const editedIdsRef = useRef<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    const [{ data: outputsData }, { data: jobData }] = await Promise.all([
      supabase.from("job_outputs").select("id, output_type, content, custom_prompt").eq("job_id", jobId).order("created_at", { ascending: true }),
      supabase.from("jobs").select("language_detected, summary_language, duration_seconds, file_name, created_at, recorded_at, recorded_at_source, speech_model, speaker_names, title, metadata_location_iso6709, location_label").eq("id", jobId).maybeSingle(),
    ]);
    setOutputs((outputsData as JobOutput[]) ?? []);
    const m = jobData ? { ...jobData, speaker_names: (jobData.speaker_names as Record<string, string>) ?? {} } : null;
    setMeta(m as JobMeta | null);
    if (m) { setSpeakerNames((m.speaker_names as Record<string, string>) ?? {}); setSummaryLang((prev) => prev || m.summary_language || m.language_detected || "en"); onMetaLoaded?.(m as JobMeta); }
    setLoading(false);
  }, [jobId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRenameSpeaker = async (original: string, newName: string) => { const updated = { ...speakerNames, [original]: newName }; setSpeakerNames(updated); await supabase.from("jobs").update({ speaker_names: updated }).eq("id", jobId); };
  const handleResetSpeakerNames = async () => { setSpeakerNames({}); await supabase.from("jobs").update({ speaker_names: {} }).eq("id", jobId); };

  const handleAddSpeaker = () => {
    const allExisting = [...(transcript ? parseSpeakers(transcript.content) : []), ...extraSpeakers];
    const usedLetters = new Set(allExisting.map((s) => { const m = s.match(/^Speaker ([A-Z])$/); return m ? m[1] : null; }).filter(Boolean));
    let next = "A";
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      if (!usedLetters.has(letter)) { next = letter; break; }
    }
    const newSpeaker = `Speaker ${next}`;
    if (!allExisting.includes(newSpeaker)) {
      setExtraSpeakers((prev) => [...prev, newSpeaker]);
    }
  };

  const handleDeleteSpeaker = async (speaker: string, reassignTo?: string) => {
    // If reassigning segments to another speaker, update transcript content
    if (reassignTo && transcript) {
      const segs = parseSegments(transcript.content);
      const updated = segs.map((seg) => {
        if (seg.speaker !== speaker) return seg;
        return { ...seg, speaker: reassignTo, raw: `${reassignTo}: ${seg.text}` };
      });
      const newContent = updated.map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.raw)).join("\n");
      await handleTranscriptSave(newContent);
    }
    setExtraSpeakers((prev) => prev.filter((s) => s !== speaker));
    setSuggestions((prev) => prev.filter((s) => s.speaker !== speaker));
    if (suggestionTarget === speaker) setSuggestionTarget(null);
    const updated = { ...speakerNames };
    delete updated[speaker];
    setSpeakerNames(updated);
    await supabase.from("jobs").update({ speaker_names: updated }).eq("id", jobId);
  };

  // Create a new speaker — returns the name
  const createSpeakerRef = useRef<() => string | null>(() => null);

  const handleSuggestSpeaker = async (targetSpeaker: string) => {
    if (!transcript || suggestingForSpeaker) return;
    setSuggestingForSpeaker(targetSpeaker);
    setSuggestionTarget(targetSpeaker);
    setSuggestions([]);
    try {
      const segments = parseSegments(transcript.content);
      const lines = segments
        .filter((s) => s.speaker)
        .map((s) => ({ id: s.id, speaker: s.speaker, text: s.text }));

      const { data, error } = await supabase.functions.invoke("suggest-speakers", {
        body: {
          transcript_lines: lines,
          target_speaker: targetSpeaker,
          existing_speakers: allSpeakers,
          excluded_ids: [...editedIdsRef.current],
        },
      });

      if (error || data?.error) {
        toast.error(data?.error ?? t("speakerSuggestions.error"));
        setSuggestionTarget(null);
        return;
      }

      const sug: SpeakerSuggestion[] = (data?.suggestions ?? []).map((s: { id: string; confidence: number }) => ({
        id: s.id,
        confidence: s.confidence,
        speaker: targetSpeaker,
      }));

      if (sug.length === 0) {
        toast.info(t("speakerSuggestions.noSuggestionsHint"));
        setSuggestionTarget(null);
      }
      setSuggestions(sug);
    } catch {
      toast.error(t("speakerSuggestions.error"));
      setSuggestionTarget(null);
    } finally {
      setSuggestingForSpeaker(null);
    }
  };

  const handleAcceptSuggestions = async (accepted: SpeakerSuggestion[]) => {
    if (!transcript) return;
    const acceptedMap = new Map(accepted.map((s) => [s.id, s.speaker]));
    const segments = parseSegments(transcript.content);
    const updated = segments.map((seg) => {
      const newSpeaker = acceptedMap.get(seg.id);
      if (!newSpeaker) return seg;
      return {
        ...seg,
        speaker: newSpeaker,
        raw: `${newSpeaker}: ${seg.text}`,
      };
    });
    const newContent = updated.map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.raw)).join("\n");
    await handleTranscriptSave(newContent);
    setSuggestions([]);
    setSuggestionTarget(null);
    toast.success(t("speakerSuggestions.accepted", { count: accepted.length }));
  };

  const handleDismissSuggestions = () => {
    setSuggestions([]);
    setSuggestionTarget(null);
  };

  const handleSummaryLanguageChange = async (langCode: string) => {
    if (langCode === summaryLang) return;
    const prevLang = summaryLang; setSummaryLang(langCode); setRegeneratingSummary(true);
    try { const { data, error } = await supabase.functions.invoke("regenerate", { body: { job_id: jobId, output_type: "summary", target_language: langCode } }); if (error || data?.error) { setSummaryLang(prevLang); return; } await fetchData(); } catch { setSummaryLang(prevLang); } finally { setRegeneratingSummary(false); }
  };

  const handleCopy = async (content: string, id: string) => { await navigator.clipboard.writeText(content); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); };

  const handleTranscriptSave = async (newContent: string) => {
    if (!transcript) return;
    const { error } = await supabase.from("job_outputs").update({ content: newContent }).eq("id", transcript.id);
    if (error) { toast.error(t("jobResults.saveFailed")); throw error; }
    setOutputs((prev) => prev.map((o) => o.id === transcript.id ? { ...o, content: newContent } : o));
    setTranscriptEdited(true);
    toast.success(t("jobResults.transcriptUpdated"));
  };

  const handleAskQuestion = async () => {
    const prompt = questionPrompt.trim(); if (!prompt) return;
    setAskingQuestion(true);
    try { const { data, error } = await supabase.functions.invoke("regenerate", { body: { job_id: jobId, custom_prompt: prompt } }); if (error || data?.error) return; if (data?.output) setOutputs((prev) => [...prev, data.output as JobOutput]); else await fetchData(); setQuestionPrompt(""); } catch { return; } finally { setAskingQuestion(false); }
  };

  const transcript = outputs.find((o) => o.output_type === "transcript");
  const summary = outputs.find((o) => o.output_type === "summary");
  const speakers = transcript ? parseSpeakers(transcript.content) : [];
  const allSpeakers = [...new Set([...speakers, ...extraSpeakers])];

  // Wire up createAndAssign now that transcript is available
  createSpeakerRef.current = () => {
    if (!transcript) return null;
    const allExisting = [...parseSpeakers(transcript.content), ...extraSpeakers];
    const usedLetters = new Set(allExisting.map((s) => { const m = s.match(/^Speaker ([A-Z])$/); return m ? m[1] : null; }).filter(Boolean));
    let next = "A";
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      if (!usedLetters.has(letter)) { next = letter; break; }
    }
    const newSpeaker = `Speaker ${next}`;
    if (!allExisting.includes(newSpeaker)) {
      setExtraSpeakers((prev) => [...prev, newSpeaker]);
    }
    return newSpeaker;
  };

  // Count segments per speaker for showing suggest button
  const speakerSegmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allSpeakers.forEach((s) => { counts[s] = 0; });
    if (transcript) {
      const segs = parseSegments(transcript.content);
      segs.forEach((s) => { if (s.speaker && counts[s.speaker] !== undefined) counts[s.speaker]++; });
    }
    return counts;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript?.content, allSpeakers.join(",")]);

  // Speakers that can be deleted: any speaker (as long as there's at least one other to reassign to, or it has 0 segments)
  const deletableSpeakers = useMemo(() => {
    const set = new Set<string>();
    allSpeakers.forEach((s) => {
      const count = speakerSegmentCounts[s] ?? 0;
      if (count === 0 || allSpeakers.length > 1) set.add(s);
    });
    return set;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSpeakers.join(","), speakerSegmentCounts]);

  if (loading) return <div className="space-y-4 py-8"><div className="animate-pulse space-y-3"><div className="h-10 bg-muted rounded-xl w-full" /><div className="h-64 bg-muted rounded-xl w-full" /></div></div>;
  if (!transcript && !summary) return <div className="text-center text-muted-foreground py-8 text-sm">{t("jobResults.noOutputs")}</div>;

  const getQuestionEntries = () => outputs.filter((o) => o.output_type === "custom" || o.output_type === "question");

  const questionEntries = getQuestionEntries();
  const persistedJobTitle = meta?.title?.trim() || null;
  const originalBaseName = meta?.file_name?.replace(/\.[^.]+$/, "").trim() || null;
  const liveTitle = currentTitle?.trim() || null;
  const hasDistinctLiveTitle = Boolean(liveTitle && liveTitle !== originalBaseName);
  const effectiveJobTitle = hasDistinctLiveTitle ? liveTitle : persistedJobTitle;
  const generatedTitle = !persistedJobTitle && hasDistinctLiveTitle ? liveTitle : null;

  const canonicalData = transcript ? buildCanonicalPayload({
    jobTitle: effectiveJobTitle, generatedTitle, originalFileName: meta?.file_name ?? null,
    createdAt: meta?.recorded_at ?? meta?.created_at ?? null, durationSeconds: meta?.duration_seconds ?? null,
    languageCode: meta?.language_detected ?? null, speakerNames, transcript: transcript.content,
    summary: summary?.content ?? null, questionEntries: questionEntries.map((q) => ({ id: q.id, prompt: q.custom_prompt, content: q.content })), excludedQAIds,
  }) : null;

  return (
    <div className="space-y-4 animate-page-enter">
      <Tabs defaultValue="transcript" className="w-full">
        <TabsList className="w-full justify-start rounded-xl bg-muted/50 p-1 h-auto gap-1 flex-wrap">
          <TabsTrigger value="transcript" className="rounded-lg gap-1.5 px-3 sm:px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"><FileText className="w-3.5 h-3.5" />{t("jobResults.transcript")}</TabsTrigger>
          <TabsTrigger value="summary" className="rounded-lg gap-1.5 px-3 sm:px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"><Sparkles className="w-3.5 h-3.5" />{t("jobResults.summary")}</TabsTrigger>
          <TabsTrigger value="questions" className="rounded-lg gap-1.5 px-3 sm:px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"><HelpCircle className="w-3.5 h-3.5" />{t("jobResults.questions")}</TabsTrigger>
        </TabsList>

        <TabsContent value="transcript" className="mt-4">
          <Card className="rounded-xl border-border/50 shadow-sm">
            <CardContent className="p-0">
              {transcript && (
                <div className="flex flex-col sm:flex-row items-center justify-end gap-2 p-3 border-b border-border/50">
                  <div className="flex items-center gap-2 min-w-0 flex-1 hidden sm:flex"><SpeakerChips speakers={allSpeakers} speakerNames={speakerNames} speakerSegmentCounts={speakerSegmentCounts} deletableSpeakers={deletableSpeakers} onRename={handleRenameSpeaker} onReset={handleResetSpeakerNames} onAddSpeaker={handleAddSpeaker} onDeleteSpeaker={handleDeleteSpeaker} onSuggestSpeaker={handleSuggestSpeaker} suggestingForSpeaker={suggestingForSpeaker} enableDrag /></div>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <Button variant="ghost" size="sm" className="rounded-lg gap-1.5 text-xs h-8" onClick={() => handleCopy(applySpeakerNames(transcript.content, speakerNames), transcript.id)}>
                      {copiedId === transcript.id ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}{copiedId === transcript.id ? t("common.copied") : t("common.copy")}
                    </Button>
                    <ShareButton jobId={jobId} disabled={!transcript} />
                    <ExportButton data={canonicalData} disabled={!transcript} />
                  </div>
                </div>
              )}
              <div className="px-4 py-3 border-b border-border/50 sm:hidden"><SpeakerChips speakers={allSpeakers} speakerNames={speakerNames} speakerSegmentCounts={speakerSegmentCounts} deletableSpeakers={deletableSpeakers} onRename={handleRenameSpeaker} onReset={handleResetSpeakerNames} onAddSpeaker={handleAddSpeaker} onDeleteSpeaker={handleDeleteSpeaker} onSuggestSpeaker={handleSuggestSpeaker} suggestingForSpeaker={suggestingForSpeaker} /></div>
              {/* Zero-segment speaker hint */}
              {(() => {
                const zeroSegSpeakers = allSpeakers.filter((s) => (speakerSegmentCounts[s] ?? 0) === 0);
                if (zeroSegSpeakers.length === 0) return null;
                const names = zeroSegSpeakers.map((s) => speakerNames[s] || s);
                return (
                  <div className="px-4 py-2.5 border-b border-border/50 bg-muted/30">
                    <p className="text-xs text-muted-foreground">
                      {t("speakerSuggestions.assignHint", { speaker: names.join(", ") })}
                    </p>
                  </div>
                );
              })()}
              {transcript ? (
                <TranscriptEditor
                  content={transcript.content}
                  speakerNames={speakerNames}
                  allSpeakers={allSpeakers}
                  onSave={handleTranscriptSave}
                  transcriptEdited={transcriptEdited}
                  suggestions={suggestions}
                  suggestingTarget={suggestionTarget}
                  onAcceptSuggestions={handleAcceptSuggestions}
                  onDismissSuggestions={handleDismissSuggestions}
                  onEditedIdsChange={(ids) => { editedIdsRef.current = ids; }}
                  onCreateSpeaker={() => createSpeakerRef.current()}
                />
              ) : (
                <div className="p-5 sm:p-6"><p className="text-sm text-muted-foreground">{t("jobResults.noTranscript")}</p></div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="mt-4">
          <Card className="rounded-xl border-border/50 shadow-sm">
            <CardContent className="p-0">
              <div className="flex flex-col gap-2 p-3 border-b border-border/50">
                <div className="flex items-center justify-end gap-1.5">
                  {summary && (
                    <Button variant="ghost" size="sm" className="rounded-lg gap-1.5 text-xs h-8" onClick={() => handleCopy(applySpeakerNames(summary.content, speakerNames), summary.id)}>
                      {copiedId === summary.id ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}{copiedId === summary.id ? t("common.copied") : t("common.copy")}
                    </Button>
                  )}
                  <ShareButton jobId={jobId} disabled={!transcript} />
                  <ExportButton data={canonicalData} disabled={!transcript} />
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  <label htmlFor="summary-lang" className="text-xs text-muted-foreground font-medium whitespace-nowrap">{t("jobResults.summaryLanguage")}</label>
                  <Select value={summaryLang} onValueChange={handleSummaryLanguageChange} disabled={regeneratingSummary}>
                    <SelectTrigger id="summary-lang" className="h-7 w-[140px] text-xs rounded-lg border-border/60" aria-label={t("jobResults.summaryLanguage")}><SelectValue /></SelectTrigger>
                    <SelectContent>{LANGUAGES.filter((l) => l.code !== "auto").map((l) => <SelectItem key={l.code} value={l.code} className="text-xs">{l.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {regeneratingSummary && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                </div>
              </div>
              <div className="p-5 sm:p-6">
                {regeneratingSummary ? <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />{t("jobResults.regeneratingSummary")}</div>
                  : summary ? <StructuredSummary content={applySpeakerNames(summary.content, speakerNames)} />
                  : <p className="text-sm text-muted-foreground">{t("jobResults.noSummary")}</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions" className="mt-4">
          <Card className="rounded-xl border-border/50 shadow-sm">
            <CardContent className="p-0">
              <div className="flex items-center justify-end gap-2 p-3 border-b border-border/50">
                <div className="flex items-center gap-1.5">
                  {questionEntries.length > 0 && (
                    <Button variant="ghost" size="sm" className="rounded-lg gap-1.5 text-xs h-8" onClick={() => { const included = questionEntries.filter((q) => !excludedQAIds.has(q.id)); const text = included.map((q) => `Q: ${q.custom_prompt ?? "—"}\nA: ${applySpeakerNames(q.content, speakerNames)}`).join("\n\n"); handleCopy(text, "qa-all"); }}>
                      {copiedId === "qa-all" ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}{copiedId === "qa-all" ? t("common.copied") : t("common.copyAll")}
                    </Button>
                  )}
                  <ShareButton jobId={jobId} disabled={!transcript} />
                  <ExportButton data={canonicalData} disabled={!transcript} />
                </div>
              </div>

              <div className="p-4 sm:p-5 border-b border-border/50">
                <label htmlFor="question-input" className="text-sm font-medium mb-1.5 block">{t("jobResults.askQuestion")}</label>
                <p className="text-xs text-muted-foreground mb-3">{t("jobResults.askQuestionDesc")}</p>
                <div className="relative">
                  <Textarea id="question-input" placeholder={t("jobResults.askPlaceholder")} value={questionPrompt} onChange={(e) => setQuestionPrompt(e.target.value)} className="rounded-xl text-sm min-h-[80px] resize-none pr-16" disabled={askingQuestion} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAskQuestion(); } }} />
                  <Button onClick={handleAskQuestion} disabled={askingQuestion || !questionPrompt.trim()} size="sm" className="absolute bottom-2.5 right-2.5 rounded-xl gap-1.5 px-3 h-8">
                    {askingQuestion ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-3.5 h-3.5" />{t("common.ask")}</>}
                  </Button>
                </div>
              </div>

              <div role="log" aria-live="polite" aria-label="Saved questions and answers">
                {questionEntries.length === 0 ? (
                  <div className="p-6 sm:p-8 text-center">
                    <HelpCircle className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">{t("jobResults.noQuestionsDesc")}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {[...questionEntries].reverse().map((entry) => {
                      const isExcluded = excludedQAIds.has(entry.id);
                      const checkboxId = `qa-include-${entry.id}`;
                      return (
                        <div key={entry.id} className={`p-4 sm:p-5 transition-opacity ${isExcluded ? "opacity-50" : ""}`}>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/50">
                              <div className="flex items-center gap-2">
                                <Checkbox id={checkboxId} checked={!isExcluded} onCheckedChange={(checked) => { setExcludedQAIds((prev) => { const next = new Set(prev); if (checked) next.delete(entry.id); else next.add(entry.id); return next; }); }} aria-label={`Include "${entry.custom_prompt ?? "this answer"}" in export`} />
                                <label htmlFor={checkboxId} className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap select-none">{t("jobResults.includeInExport")}</label>
                              </div>
                              <Button variant="ghost" size="sm" className="rounded-lg gap-1.5 text-xs h-7" onClick={() => handleCopy(applySpeakerNames(entry.content, speakerNames), entry.id)}>
                                {copiedId === entry.id ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}{copiedId === entry.id ? t("common.copied") : t("common.copy")}
                              </Button>
                            </div>
                            <div>
                              {entry.custom_prompt && <div className="flex items-start gap-2 mb-2"><span className="text-xs font-semibold text-primary/70 mt-0.5 shrink-0">Q</span><p className="text-sm font-medium">{entry.custom_prompt}</p></div>}
                              <div className="pl-5"><SectionBody body={applySpeakerNames(entry.content, speakerNames)} /></div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div role="note" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
        <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground mb-1">{t("jobResults.aiDisclaimer")}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{t("jobResults.aiDisclaimerDesc")}</p>
        </div>
      </div>
    </div>
  );
}
