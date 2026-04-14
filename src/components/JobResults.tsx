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
import SpeakerIdentificationBanner from "@/components/SpeakerIdentificationBanner";
import StructuredSummary, { SectionBody } from "@/components/StructuredSummary";
import TranscriptEditor, { parseSegments, type SpeakerSuggestion } from "@/components/TranscriptEditor";
import { toast } from "sonner";
import type { SpeakerIdentification, SpeakerIdentificationData } from "@/lib/speaker-identification";

interface JobOutput { id: string; output_type: string; content: string; custom_prompt: string | null; }

export interface JobMeta {
  language_detected: string | null; summary_language: string | null; duration_seconds: number | null;
  file_name: string; created_at: string; recorded_at: string | null; recorded_at_source: string | null;
  speech_model: string | null; speaker_names: Record<string, string>; title: string | null;
  metadata_location_iso6709: string | null;
  location_label: string | null;
  output_language: string | null;
}

interface JobResultsProps { jobId: string; currentTitle?: string | null; onMetaLoaded?: (meta: JobMeta) => void; }

function parseSpeakers(text: string): string[] {
  const segments = parseSegments(text);
  return [...new Set(segments.map((segment) => segment.speaker).filter((speaker): speaker is string => Boolean(speaker)))];
}

export default function JobResults({ jobId, currentTitle, onMetaLoaded }: JobResultsProps) {
  const { t } = useTranslation();
  const [outputs, setOutputs] = useState<JobOutput[]>([]);
  const [meta, setMeta] = useState<JobMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [outputLang, setOutputLang] = useState<string>("");
  const [regeneratingLang, setRegeneratingLang] = useState(false);
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [askingQuestion, setAskingQuestion] = useState(false);
  const [excludedQAIds, setExcludedQAIds] = useState<Set<string>>(new Set());
  const [transcriptEdited, setTranscriptEdited] = useState(false);
  const [extraSpeakers, setExtraSpeakers] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<SpeakerSuggestion[]>([]);
  const [suggestingForSpeaker, setSuggestingForSpeaker] = useState<string | null>(null);
  const [suggestionTarget, setSuggestionTarget] = useState<string | null>(null);
  const editedIdsRef = useRef<Set<string>>(new Set());
  const [identifications, setIdentifications] = useState<SpeakerIdentification[]>([]);
  const [identificationBannerDismissed, setIdentificationBannerDismissed] = useState(false);
  const [identificationOutputId, setIdentificationOutputId] = useState<string | null>(null);
  const identificationRanRef = useRef(false);
  // Variant state: maps job_output_id → translated content
  const [variants, setVariants] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    const [{ data: outputsData }, { data: jobData }] = await Promise.all([
      supabase.from("job_outputs").select("id, output_type, content, custom_prompt").eq("job_id", jobId).order("created_at", { ascending: true }),
      supabase.from("jobs").select("language_detected, summary_language, duration_seconds, file_name, created_at, recorded_at, recorded_at_source, speech_model, speaker_names, title, metadata_location_iso6709, location_label, output_language").eq("id", jobId).maybeSingle(),
    ]);
    setOutputs((outputsData as JobOutput[]) ?? []);
    const m = jobData ? { ...jobData, speaker_names: (jobData.speaker_names as Record<string, string>) ?? {} } : null;
    setMeta(m as JobMeta | null);
    if (m) {
      setSpeakerNames((m.speaker_names as Record<string, string>) ?? {});
      const activeLang = m.output_language || m.summary_language || m.language_detected || "en";
      setOutputLang((prev) => prev || activeLang);

      // Load existing variants if active language differs from original
      const originalLang = m.language_detected || "en";
      if (activeLang !== originalLang && outputsData && outputsData.length > 0) {
        const outputIds = (outputsData as JobOutput[]).map(o => o.id);
        const { data: variantRows } = await supabase
          .from("job_output_variants")
          .select("job_output_id, content")
          .in("job_output_id", outputIds)
          .eq("language", activeLang);
        if (variantRows && variantRows.length > 0) {
          const vMap: Record<string, string> = {};
          for (const v of variantRows) vMap[v.job_output_id] = v.content;
          setVariants(vMap);
        }
      } else {
        setVariants({});
      }

      onMetaLoaded?.(m as JobMeta);
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Speaker identification: deferred to after transcript is computed (see useEffect below)

  // Identification action handlers
  const updateIdentificationOutput = async (updatedSuggestions: SpeakerIdentification[], bannerDismissed?: boolean) => {
    if (!identificationOutputId) return;
    const metadata: SpeakerIdentificationData = {
      suggestions: updatedSuggestions,
      banner_dismissed: bannerDismissed ?? identificationBannerDismissed,
      processed_at: new Date().toISOString(),
    };
    await supabase
      .from("job_outputs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ metadata: metadata as any })
      .eq("id", identificationOutputId);
  };

  const handleIdentificationAccept = async (speakerLabel: string, name: string) => {
    const updated = identifications.map((s) =>
      s.speaker_label === speakerLabel ? { ...s, status: "accepted" as const } : s
    );
    setIdentifications(updated);
    await handleRenameSpeaker(speakerLabel, name);
    await updateIdentificationOutput(updated);
  };

  const handleIdentificationReject = async (speakerLabel: string) => {
    const updated = identifications.map((s) =>
      s.speaker_label === speakerLabel ? { ...s, status: "rejected" as const } : s
    );
    setIdentifications(updated);
    await updateIdentificationOutput(updated);
  };

  const handleIdentificationUndo = async (speakerLabel: string) => {
    const updated = identifications.map((s) =>
      s.speaker_label === speakerLabel ? { ...s, status: "rejected" as const } : s
    );
    setIdentifications(updated);
    // Remove the name
    const updatedNames = { ...speakerNames };
    delete updatedNames[speakerLabel];
    setSpeakerNames(updatedNames);
    await supabase.from("jobs").update({ speaker_names: updatedNames }).eq("id", jobId);
    await updateIdentificationOutput(updated);
  };

  const handleIdentificationEdit = async (speakerLabel: string, newName: string) => {
    const updated = identifications.map((s) =>
      s.speaker_label === speakerLabel ? { ...s, status: "accepted" as const, inferred_name: newName } : s
    );
    setIdentifications(updated);
    await handleRenameSpeaker(speakerLabel, newName);
    await updateIdentificationOutput(updated);
  };

  const handleIdentificationDismiss = async () => {
    setIdentificationBannerDismissed(true);
    await updateIdentificationOutput(identifications, true);
  };

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

  const originalLang = meta?.language_detected || "en";
  const isViewingTranslation = outputLang !== originalLang && Object.keys(variants).length > 0;

  // Helper to get content for an output — uses variant if viewing translation
  const getContent = useCallback((output: JobOutput): string => {
    if (isViewingTranslation && variants[output.id]) return variants[output.id];
    return output.content;
  }, [isViewingTranslation, variants]);

  const handleOutputLanguageChange = async (langCode: string) => {
    if (langCode === outputLang) return;
    const prevLang = outputLang;
    const prevVariants = { ...variants };
    setOutputLang(langCode);

    const origLang = meta?.language_detected || "en";

    // Switching back to original language
    if (langCode === origLang) {
      setVariants({});
      await supabase.from("jobs").update({ output_language: langCode }).eq("id", jobId);
      return;
    }

    // Always call regenerate — it handles caching (returns fresh variants) and
    // staleness (re-translates when source_hash mismatches) server-side.
    setRegeneratingLang(true);
    try {
      const { data, error } = await supabase.functions.invoke("regenerate", {
        body: { job_id: jobId, output_type: "translate_all", target_language: langCode },
      });

      if (error || data?.error) {
        setOutputLang(prevLang);
        setVariants(prevVariants);
        toast.error(data?.error || t("jobResults.translationFailed"));
        return;
      }

      if (data?.variants) {
        setVariants(data.variants as Record<string, string>);
      }
    } catch {
      setOutputLang(prevLang);
      setVariants(prevVariants);
      toast.error(t("jobResults.translationFailed"));
    } finally {
      setRegeneratingLang(false);
    }
  };

  const handleCopy = async (content: string, id: string) => { await navigator.clipboard.writeText(content); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); };

  const handleTranscriptSave = async (newContent: string) => {
    if (!transcript) return;
    const { error } = await supabase.from("job_outputs").update({ content: newContent }).eq("id", transcript.id);
    if (error) { toast.error(t("jobResults.saveFailed")); throw error; }
    setOutputs((prev) => prev.map((o) => o.id === transcript.id ? { ...o, content: newContent } : o));
    setTranscriptEdited(true);

    // Clear stale variants — they no longer match the edited transcript
    setVariants({});
    const origLang = meta?.language_detected || "en";
    if (outputLang !== origLang) {
      setOutputLang(origLang);
      await supabase.from("jobs").update({ output_language: null }).eq("id", jobId);
      toast.info(t("jobResults.transcriptEditedResetLang"));
    } else {
      toast.success(t("jobResults.transcriptUpdated"));
    }
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

  // Speakers that can be deleted: only manually added (extra) speakers
  const deletableSpeakers = useMemo(() => {
    const set = new Set<string>();
    extraSpeakers.forEach((s) => set.add(s));
    return set;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraSpeakers.join(",")]);

  // Speaker identification: run once after transcript loads
  useEffect(() => {
    if (!transcript || identificationRanRef.current) return;
    identificationRanRef.current = true;

    const run = async () => {
      const segments = parseSegments(transcript.content);
      const lines = segments
        .filter((s) => s.speaker)
        .map((s) => ({ speaker: s.speaker, text: s.text }));
      if (lines.length === 0) return;

      try {
        const { data, error } = await supabase.functions.invoke("identify-speakers", {
          body: { job_id: jobId, transcript_lines: lines, existing_speaker_names: speakerNames },
        });
        if (error || data?.error) return;
        const result = data?.data as SpeakerIdentificationData | undefined;
        if (!result?.suggestions) return;

        setIdentifications(result.suggestions);
        setIdentificationBannerDismissed(result.banner_dismissed ?? false);

        // If names were auto-applied server-side, refetch
        if (!data.cached && result.suggestions.some((s: SpeakerIdentification) => s.status === "applied")) {
          const { data: jobData } = await supabase.from("jobs").select("speaker_names").eq("id", jobId).maybeSingle();
          if (jobData) setSpeakerNames((jobData.speaker_names as Record<string, string>) ?? {});
        }

        const { data: outputRow } = await supabase.from("job_outputs").select("id").eq("job_id", jobId).eq("output_type", "speaker_identifications").maybeSingle();
        if (outputRow) setIdentificationOutputId(outputRow.id);
      } catch (e) {
        console.error("Speaker identification error:", e);
      }
    };
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript?.id]);

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

  const activeTranscriptContent = transcript ? getContent(transcript) : "";
  const activeSummaryContent = summary ? getContent(summary) : null;

  const canonicalData = transcript ? buildCanonicalPayload({
    jobTitle: effectiveJobTitle, generatedTitle, originalFileName: meta?.file_name ?? null,
    createdAt: meta?.recorded_at ?? meta?.created_at ?? null, durationSeconds: meta?.duration_seconds ?? null,
    languageCode: meta?.language_detected ?? null, speakerNames, transcript: activeTranscriptContent,
    summary: activeSummaryContent, questionEntries: questionEntries.map((q) => ({ id: q.id, prompt: q.custom_prompt, content: getContent(q) })), excludedQAIds,
  }) : null;

  return (
    <div className="space-y-6 animate-page-enter">
      <Tabs defaultValue="transcript" className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <TabsList className="w-auto justify-start rounded-full bg-muted/40 p-1 h-auto gap-0.5">
            <TabsTrigger value="transcript" className="rounded-full gap-1.5 px-3 sm:px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"><FileText className="w-3.5 h-3.5" />{t("jobResults.transcript")}</TabsTrigger>
            <TabsTrigger value="summary" className="rounded-full gap-1.5 px-3 sm:px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"><Sparkles className="w-3.5 h-3.5" />{t("jobResults.summary")}</TabsTrigger>
            <TabsTrigger value="questions" className="rounded-full gap-1.5 px-3 sm:px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"><HelpCircle className="w-3.5 h-3.5" />{t("jobResults.questions")}</TabsTrigger>
          </TabsList>

          {/* Floating action bar */}
          <div className="inline-flex items-center gap-0.5 rounded-full bg-muted/30 border border-border/30 px-1.5 py-0.5 self-end sm:self-auto">
            <Button variant="ghost" size="sm" className="rounded-full gap-1.5 text-xs h-8 px-2.5" onClick={() => { if (transcript) handleCopy(applySpeakerNames(activeTranscriptContent, speakerNames), transcript.id); }}>
              {copiedId === transcript?.id ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden xs:inline">{copiedId === transcript?.id ? t("common.copied") : t("common.copy")}</span>
            </Button>
            <ShareButton jobId={jobId} disabled={!transcript} exportData={canonicalData} />
            <ExportButton data={canonicalData} disabled={!transcript} sourceJobId={jobId} />
          </div>
        </div>

        <TabsContent value="transcript" className="mt-0">
          <Card className="rounded-2xl border-border/40 shadow-sm">
            <CardContent className="p-0">
              {transcript && (
                <div className="flex items-center gap-2 p-3 border-b border-border/40 hidden sm:flex">
                  <div className="flex items-center gap-2 min-w-0 flex-1"><SpeakerChips speakers={allSpeakers} speakerNames={speakerNames} speakerSegmentCounts={speakerSegmentCounts} deletableSpeakers={deletableSpeakers} onRename={handleRenameSpeaker} onReset={handleResetSpeakerNames} onAddSpeaker={handleAddSpeaker} onDeleteSpeaker={handleDeleteSpeaker} onSuggestSpeaker={handleSuggestSpeaker} suggestingForSpeaker={suggestingForSpeaker} enableDrag /></div>
                  <div className="flex items-center gap-1.5 ml-auto shrink-0">
                    <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                    <Select value={outputLang} onValueChange={handleOutputLanguageChange} disabled={regeneratingLang}>
                      <SelectTrigger id="output-lang" className="h-7 w-[140px] text-xs rounded-full border-border/60" aria-label={t("jobResults.outputLanguage")}><SelectValue /></SelectTrigger>
                      <SelectContent>{LANGUAGES.filter((l) => l.code !== "auto").map((l) => <SelectItem key={l.code} value={l.code} className="text-xs">{l.label}</SelectItem>)}</SelectContent>
                    </Select>
                    {regeneratingLang && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                  </div>
                </div>
              )}
              <div className="px-4 py-3 border-b border-border/40 sm:hidden">
                <SpeakerChips speakers={allSpeakers} speakerNames={speakerNames} speakerSegmentCounts={speakerSegmentCounts} deletableSpeakers={deletableSpeakers} onRename={handleRenameSpeaker} onReset={handleResetSpeakerNames} onAddSpeaker={handleAddSpeaker} onDeleteSpeaker={handleDeleteSpeaker} onSuggestSpeaker={handleSuggestSpeaker} suggestingForSpeaker={suggestingForSpeaker} />
                <div className="flex items-center gap-1.5 mt-2">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  <Select value={outputLang} onValueChange={handleOutputLanguageChange} disabled={regeneratingLang}>
                    <SelectTrigger id="output-lang-mobile" className="h-7 w-[140px] text-xs rounded-full border-border/60" aria-label={t("jobResults.outputLanguage")}><SelectValue /></SelectTrigger>
                    <SelectContent>{LANGUAGES.filter((l) => l.code !== "auto").map((l) => <SelectItem key={l.code} value={l.code} className="text-xs">{l.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {regeneratingLang && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                </div>
              </div>
              {/* AI Speaker Identification Banner */}
              {!identificationBannerDismissed && identifications.filter((s) => s.status === "applied" || s.status === "suggested").length > 0 && (
                <div className="px-3 py-2 border-b border-border/40">
                  <SpeakerIdentificationBanner
                    suggestions={identifications.filter((s) => s.status === "applied" || s.status === "suggested")}
                    onAccept={handleIdentificationAccept}
                    onReject={handleIdentificationReject}
                    onUndo={handleIdentificationUndo}
                    onEdit={handleIdentificationEdit}
                    onDismiss={handleIdentificationDismiss}
                  />
                </div>
              )}
              {/* Zero-segment speaker hint */}
              {(() => {
                const zeroSegSpeakers = allSpeakers.filter((s) => (speakerSegmentCounts[s] ?? 0) === 0);
                if (zeroSegSpeakers.length === 0) return null;
                const names = zeroSegSpeakers.map((s) => speakerNames[s] || s);
                return (
                  <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30">
                    <p className="text-xs text-muted-foreground">
                      {t("speakerSuggestions.assignHint", { speaker: names.join(", ") })}
                    </p>
                  </div>
                );
              })()}
              {isViewingTranslation && !regeneratingLang && (
                <div className="px-4 py-2 border-b border-border/40 bg-primary/5">
                  <p className="text-xs text-primary font-medium">{t("jobResults.viewingTranslation")}</p>
                </div>
              )}
              {regeneratingLang ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />{t("jobResults.translatingTranscript")}</div>
              ) : transcript ? (
                <TranscriptEditor
                  content={activeTranscriptContent}
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
                  readOnly={isViewingTranslation}
                />
              ) : (
                <div className="p-5 sm:p-6"><p className="text-sm text-muted-foreground">{t("jobResults.noTranscript")}</p></div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="mt-0">
          <Card className="rounded-2xl border-border/40 shadow-sm">
            <CardContent className="p-0">
              <div className="p-5 sm:p-6">
                {regeneratingLang ? <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />{t("jobResults.translatingContent")}</div>
                  : summary ? <StructuredSummary content={applySpeakerNames(activeSummaryContent ?? "", speakerNames)} />
                  : <p className="text-sm text-muted-foreground">{t("jobResults.noSummary")}</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions" className="mt-0">
          <Card className="rounded-2xl border-border/40 shadow-sm">
            <CardContent className="p-0">
              <div className="p-4 sm:p-5 border-b border-border/40">
                <label htmlFor="question-input" className="text-sm font-medium mb-1.5 block">{t("jobResults.askQuestion")}</label>
                <p className="text-xs text-muted-foreground mb-3">{t("jobResults.askQuestionDesc")}</p>
                <div className="relative">
                  <Textarea id="question-input" placeholder={t("jobResults.askPlaceholder")} value={questionPrompt} onChange={(e) => setQuestionPrompt(e.target.value)} className="rounded-xl text-sm min-h-[80px] resize-none pr-16" disabled={askingQuestion} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAskQuestion(); } }} />
                  <Button onClick={handleAskQuestion} disabled={askingQuestion || !questionPrompt.trim()} size="sm" className="absolute bottom-2.5 right-2.5 rounded-full gap-1.5 px-3 h-8">
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
                  <div className="p-4 sm:p-5 space-y-3">
                    {[...questionEntries].reverse().map((entry) => {
                      const isExcluded = excludedQAIds.has(entry.id);
                      const checkboxId = `qa-include-${entry.id}`;
                      return (
                        <div key={entry.id} className={`rounded-xl bg-muted/40 p-4 transition-opacity ${isExcluded ? "opacity-50" : ""}`}>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/30">
                              <div className="flex items-center gap-2">
                                <Checkbox id={checkboxId} checked={!isExcluded} onCheckedChange={(checked) => { setExcludedQAIds((prev) => { const next = new Set(prev); if (checked) next.delete(entry.id); else next.add(entry.id); return next; }); }} aria-label={`Include "${entry.custom_prompt ?? "this answer"}" in export`} />
                                <label htmlFor={checkboxId} className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap select-none">{t("jobResults.includeInExport")}</label>
                              </div>
                              <Button variant="ghost" size="sm" className="rounded-full gap-1.5 text-xs h-7" onClick={() => handleCopy(applySpeakerNames(getContent(entry), speakerNames), entry.id)}>
                                {copiedId === entry.id ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}{copiedId === entry.id ? t("common.copied") : t("common.copy")}
                              </Button>
                            </div>
                            <div>
                              {entry.custom_prompt && <div className="flex items-start gap-2 mb-2"><span className="text-xs font-semibold text-primary/70 mt-0.5 shrink-0">Q</span><p className="text-sm font-medium">{entry.custom_prompt}</p></div>}
                              <div className="pl-5"><SectionBody body={applySpeakerNames(getContent(entry), speakerNames)} /></div>
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
