import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Check, FileText, Sparkles, HelpCircle, Send, AlertTriangle, Globe, RefreshCw, Pencil, Trash2, X, Play, Pause as PauseIcon, MessageSquare, Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useSpeechSynthesis, speechManager } from "@/hooks/use-speech-synthesis";
import { transcriptToSpeech, summaryToSpeech, latestAnswerToSpeech } from "@/lib/speech-text";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import ShareButton from "@/components/ShareButton";
import { LANGUAGES } from "@/lib/languages";
import { applySpeakerNames } from "@/lib/speaker-names";
import { buildCanonicalPayload } from "@/lib/export-payload";
import ExportButton from "@/components/ExportButton";
import SpeakerChips from "@/components/SpeakerChips";
import SpeakerIdentificationBanner from "@/components/SpeakerIdentificationBanner";
import StructuredSummary, { SectionBody } from "@/components/StructuredSummary";
import TranscriptEditor from "@/components/TranscriptEditor";
import { parseSegments, getUniqueSpeakersFromContent, type SpeakerSuggestion } from "@/lib/transcript";
import type { JobMeta } from "@/types/job";
import ParticipantsPanel from "@/components/ParticipantsPanel";
import { toast } from "sonner";
import type { SpeakerIdentification, SpeakerIdentificationData } from "@/lib/speaker-identification";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import QuestionExtraSourcesPicker, { type ExtraSource } from "@/components/QuestionExtraSourcesPicker";

interface ExtraSourceMeta { id: string; title: string; }
interface JobOutputMetadata { extra_sources?: ExtraSourceMeta[]; [key: string]: unknown; }
interface JobOutput { id: string; output_type: string; content: string; custom_prompt: string | null; metadata?: JobOutputMetadata | null; }

interface JobResultsProps { jobId: string; currentTitle?: string | null; onMetaLoaded?: (meta: JobMeta) => void; }

interface ListenButtonProps {
  ownerId: string;
  /** Lazily compute the text to speak — only called on click. */
  getText: () => string;
  lang?: string;
  className?: string;
}

function ListenButton({ ownerId, getText, lang, className }: ListenButtonProps) {
  const { t } = useTranslation();
  const { isSupported, state, isActiveOwner, play, pause, resume } = useSpeechSynthesis();
  const active = isActiveOwner(ownerId);
  const isPlaying = active && state === "playing";
  const isPaused = active && state === "paused";

  const handleClick = () => {
    if (!isSupported) {
      toast.info(t("jobResults.listen.unsupported"));
      return;
    }
    if (isPlaying) {
      pause();
      return;
    }
    if (isPaused) {
      resume();
      return;
    }
    const text = getText();
    if (!text) return;
    play(ownerId, text, lang);
  };

  // Determine disabled + label for main button (only meaningful when idle).
  let disabled = false;
  let mainLabel = t("jobResults.listen.play");
  let MainIcon: typeof Play = Play;
  let ariaLabel: string | undefined;

  if (!isSupported) {
    disabled = true;
    ariaLabel = t("jobResults.listen.unsupported");
  } else if (isPlaying) {
    mainLabel = t("jobResults.listen.pause");
    MainIcon = PauseIcon;
  } else if (isPaused) {
    mainLabel = t("jobResults.listen.resume");
    MainIcon = Play;
  } else {
    // Idle for this owner — check whether there is text available.
    const text = getText();
    if (!text) {
      disabled = true;
      ariaLabel = t("jobResults.listen.empty");
    }
  }

  return (
    <div className={`inline-flex items-center ${className ?? ""}`}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleClick}
        disabled={disabled}
        aria-label={ariaLabel}
        title={ariaLabel}
        className="rounded-full gap-1.5 text-xs h-9 min-w-[44px] min-h-[44px] sm:h-8 sm:min-h-0 sm:min-w-0 px-2.5"
      >
        <MainIcon className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{mainLabel}</span>
      </Button>
    </div>
  );
}

export default function JobResults({ jobId, currentTitle, onMetaLoaded }: JobResultsProps) {
  const { t } = useTranslation();
  const [outputs, setOutputs] = useState<JobOutput[]>([]);
  const [meta, setMeta] = useState<JobMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const { copiedId, copyWithId } = useCopyToClipboard();
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [outputLang, setOutputLang] = useState<string>("");
  const [regeneratingLang, setRegeneratingLang] = useState(false);
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [questionExpanded, setQuestionExpanded] = useState(false);
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
  const [identifyingInProgress, setIdentifyingInProgress] = useState(false);
  // Variant state: maps job_output_id → translated content
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [summaryNeedsRegen, setSummaryNeedsRegen] = useState(false);
  const [summaryRegenCount, setSummaryRegenCount] = useState(0);
  const [regeneratingSummary, setRegeneratingSummary] = useState(false);
  const [questionGenCount, setQuestionGenCount] = useState(0);
  const [editingQAId, setEditingQAId] = useState<string | null>(null);
  const [editingQAText, setEditingQAText] = useState("");
  const [editingExtraSources, setEditingExtraSources] = useState<ExtraSource[]>([]);
  const [regeneratingQAId, setRegeneratingQAId] = useState<string | null>(null);
  const [useExtraSources, setUseExtraSources] = useState(false);
  const [extraSources, setExtraSources] = useState<ExtraSource[]>([]);

  const fetchData = useCallback(async () => {
    const [{ data: outputsData }, { data: jobData }] = await Promise.all([
      supabase.from("job_outputs").select("id, output_type, content, custom_prompt, metadata").eq("job_id", jobId).order("created_at", { ascending: true }),
      supabase.from("jobs").select("language_detected, summary_language, duration_seconds, file_name, created_at, recorded_at, recorded_at_source, speech_model, speaker_names, title, metadata_location_iso6709, location_label, output_language, summary_needs_regen, summary_regen_count, question_generation_count").eq("id", jobId).maybeSingle(),
    ]);
    setOutputs((outputsData as JobOutput[]) ?? []);
    const m = jobData ? { ...jobData, speaker_names: (jobData.speaker_names as Record<string, string>) ?? {} } : null;
    setMeta(m as JobMeta | null);
    if (m) {
      setSpeakerNames((m.speaker_names as Record<string, string>) ?? {});
      const activeLang = m.output_language || m.summary_language || m.language_detected || "en";
      setOutputLang((prev) => prev || activeLang);
      setSummaryNeedsRegen((jobData as Record<string, unknown>)?.summary_needs_regen === true);
      setSummaryRegenCount(((jobData as Record<string, unknown>)?.summary_regen_count as number) ?? 0);
      setQuestionGenCount(((jobData as Record<string, unknown>)?.question_generation_count as number) ?? 0);

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

  // Page-level speech cleanup: stop any active playback when the JobResults
  // page unmounts (route change). Individual ListenButton unmounts MUST NOT
  // do this — only the page-level owner of the playback session may.
  useEffect(() => {
    return () => {
      speechManager.stop();
    };
  }, []);

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
    const allExisting = [...(transcript ? getUniqueSpeakersFromContent(transcript.content) : []), ...extraSpeakers];
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

  const handleCopy = (content: string, id: string) => copyWithId(content, id);

  const handleTranscriptSave = async (newContent: string) => {
    if (!transcript) return;
    const { error } = await supabase.from("job_outputs").update({ content: newContent }).eq("id", transcript.id);
    if (error) { toast.error(t("jobResults.saveFailed")); throw error; }
    setOutputs((prev) => prev.map((o) => o.id === transcript.id ? { ...o, content: newContent } : o));
    setTranscriptEdited(true);
    setSummaryNeedsRegen(true);

    // Mark summary as stale in the database
    await supabase.from("jobs").update({ summary_needs_regen: true }).eq("id", jobId);
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

  const questionsRemaining = 10 - questionGenCount;
  const isQuestionLimitReached = questionsRemaining <= 0;

  const handleAskQuestion = async () => {
    const prompt = questionPrompt.trim(); if (!prompt || isQuestionLimitReached) return;
    setAskingQuestion(true);
    try {
      const includeExtras = useExtraSources && extraSources.length > 0;
      const body: { job_id: string; custom_prompt: string; extra_job_ids?: string[] } = {
        job_id: jobId,
        custom_prompt: prompt,
      };
      if (includeExtras) body.extra_job_ids = extraSources.map((s) => s.id);
      const { data, error } = await supabase.functions.invoke("regenerate", { body });
      if (error || data?.error) {
        if (data?.error === "question_limit_reached") toast.error(t("jobResults.noQuestionsLeft"));
        return;
      }
      if (data?.output) setOutputs((prev) => [...prev, data.output as JobOutput]);
      else await fetchData();
      setQuestionPrompt("");
      setQuestionGenCount((c) => c + 1);
    } catch { return; } finally { setAskingQuestion(false); }
  };

  const handleDeleteQA = async (id: string) => {
    if (editingQAId === id) { setEditingQAId(null); setEditingQAText(""); setEditingExtraSources([]); }
    const prev = outputs;
    setOutputs((o) => o.filter((x) => x.id !== id));
    const { error } = await supabase.from("job_outputs").delete().eq("id", id);
    if (error) { setOutputs(prev); toast.error(t("jobResults.summaryRegenFailed")); }
  };

  const handleEditQA = async (entry: JobOutput) => {
    const newPrompt = editingQAText.trim();
    if (!newPrompt || isQuestionLimitReached) return;
    const originalPrompt = entry.custom_prompt;
    const originalContent = entry.content;
    const originalMetadata = entry.metadata ?? null;
    const extrasToSend = editingExtraSources.slice(0, 5);
    setRegeneratingQAId(entry.id);
    setEditingQAId(null);
    // Optimistically show new question text
    setOutputs((prev) => prev.map((o) => o.id === entry.id ? { ...o, custom_prompt: newPrompt } : o));
    try {
      // Delete old output
      await supabase.from("job_outputs").delete().eq("id", entry.id);
      const body: { job_id: string; custom_prompt: string; extra_job_ids?: string[] } = {
        job_id: jobId,
        custom_prompt: newPrompt,
      };
      if (extrasToSend.length > 0) body.extra_job_ids = extrasToSend.map((s) => s.id);
      const { data, error } = await supabase.functions.invoke("regenerate", { body });
      if (error || data?.error) {
        // Revert
        setOutputs((prev) => prev.map((o) => o.id === entry.id ? { ...o, custom_prompt: originalPrompt, content: originalContent, metadata: originalMetadata } : o));
        if (data?.error === "question_limit_reached") toast.error(t("jobResults.noQuestionsLeft"));
        else toast.error(t("jobResults.summaryRegenFailed"));
        // Re-insert old output (best effort)
        await supabase.from("job_outputs").insert({ id: entry.id, job_id: jobId, output_type: "custom", content: originalContent, custom_prompt: originalPrompt, metadata: originalMetadata as never });
        return;
      }
      if (data?.output) {
        setOutputs((prev) => prev.map((o) => o.id === entry.id ? (data.output as JobOutput) : o));
      } else {
        await fetchData();
      }
      setQuestionGenCount((c) => c + 1);
    } catch {
      setOutputs((prev) => prev.map((o) => o.id === entry.id ? { ...o, custom_prompt: originalPrompt, content: originalContent, metadata: originalMetadata } : o));
      toast.error(t("jobResults.summaryRegenFailed"));
    } finally {
      setRegeneratingQAId(null);
      setEditingQAText("");
      setEditingExtraSources([]);
    }
  };

  const transcript = outputs.find((o) => o.output_type === "transcript");
  const summary = outputs.find((o) => o.output_type === "summary");
  const speakers = transcript ? getUniqueSpeakersFromContent(transcript.content) : [];
  const allSpeakers = [...new Set([...speakers, ...extraSpeakers])];

  // Wire up createAndAssign now that transcript is available
  createSpeakerRef.current = () => {
    if (!transcript) return null;
    const allExisting = [...getUniqueSpeakersFromContent(transcript.content), ...extraSpeakers];
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

  // Speaker identification: reusable function
  const runSpeakerIdentification = useCallback(async () => {
    if (!transcript) return;
    const segments = parseSegments(transcript.content);
    const lines = segments
      .filter((s) => s.speaker)
      .map((s) => ({ speaker: s.speaker, text: s.text }));
    if (lines.length === 0) return;

    setIdentifyingInProgress(true);
    try {
      const { data, error } = await supabase.functions.invoke("identify-speakers", {
        body: { job_id: jobId, transcript_lines: lines, existing_speaker_names: speakerNames, language: meta?.language_detected ?? undefined },
      });
      if (error || data?.error) return;
      const result = data?.data as SpeakerIdentificationData | undefined;
      if (!result?.suggestions) return;

      setIdentifications(result.suggestions);
      setIdentificationBannerDismissed(result.banner_dismissed ?? false);

      // No auto-apply — all suggestions require user acceptance

      const { data: outputRow } = await supabase.from("job_outputs").select("id").eq("job_id", jobId).eq("output_type", "speaker_identifications").maybeSingle();
      if (outputRow) setIdentificationOutputId(outputRow.id);
    } catch (e) {
      console.error("Speaker identification error:", e);
    } finally {
      setIdentifyingInProgress(false);
    }
  }, [transcript, jobId, speakerNames]);

  // Run once after transcript loads
  useEffect(() => {
    if (!transcript || identificationRanRef.current) return;
    identificationRanRef.current = true;
    runSpeakerIdentification();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript?.id]);

  if (loading) return <LoadingState rows={1} titleWidth="w-full" rowHeight="h-64" className="py-8" />;
  if (!transcript && !summary) return <EmptyState icon={FileText} title={t("jobResults.noOutputs")} variant="plain" />;

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

  // Speech: language hint + latest visible answer for the Questions tab.
  // When viewing a translation, the displayed text is in outputLang, so speech must use outputLang
  // (not language_detected) to pick the correct voice.
  const speechLang = isViewingTranslation ? outputLang : (meta?.language_detected ?? outputLang ?? undefined);
  const latestQuestionEntry = questionEntries.length > 0 ? questionEntries[questionEntries.length - 1] : null;
  const latestAnswerContent = latestQuestionEntry
    ? applySpeakerNames(getContent(latestQuestionEntry), speakerNames)
    : "";

  const canonicalData = transcript ? buildCanonicalPayload({
    jobTitle: effectiveJobTitle, generatedTitle, originalFileName: meta?.file_name ?? null,
    createdAt: meta?.recorded_at ?? meta?.created_at ?? null, durationSeconds: meta?.duration_seconds ?? null,
    languageCode: meta?.language_detected ?? null, speakerNames, transcript: activeTranscriptContent,
    summary: activeSummaryContent, questionEntries: questionEntries.map((q) => ({ id: q.id, prompt: q.custom_prompt, content: getContent(q) })), excludedQAIds,
  }) : null;

  return (
    <div className="space-y-6 animate-page-enter-flat">
      <Tabs defaultValue="summary" className="w-full" onValueChange={() => speechManager.stop()}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <TabsList className="w-auto justify-start rounded-full bg-muted/40 p-1 h-auto gap-0.5">
            <TabsTrigger value="summary" className="rounded-full gap-1.5 px-3 sm:px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"><Sparkles className="w-3.5 h-3.5" />{t("jobResults.summary")}</TabsTrigger>
            <TabsTrigger value="transcript" className="rounded-full gap-1.5 px-3 sm:px-4 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"><FileText className="w-3.5 h-3.5" />{t("jobResults.transcript")}</TabsTrigger>
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
                <div className="hidden sm:block border-b border-border/40">
                  <div className="flex items-start gap-3 px-3 pt-2.5 pb-1">
                    <div className="flex-1 min-w-0">
                      <SpeakerChips
                        variant="primary"
                        speakers={allSpeakers}
                        speakerNames={speakerNames}
                        speakerSegmentCounts={speakerSegmentCounts}
                        deletableSpeakers={deletableSpeakers}
                        onRename={handleRenameSpeaker}
                        onAddSpeaker={handleAddSpeaker}
                        onDeleteSpeaker={handleDeleteSpeaker}
                        onSuggestSpeaker={handleSuggestSpeaker}
                        suggestingForSpeaker={suggestingForSpeaker}
                        enableDrag
                      />
                    </div>
                    <div className="flex items-center gap-2 ml-auto shrink-0">
                      <ListenButton
                        ownerId="transcript"
                        getText={() => transcriptToSpeech(activeTranscriptContent, speakerNames)}
                        lang={speechLang}
                      />
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                        <Select value={outputLang} onValueChange={handleOutputLanguageChange} disabled={regeneratingLang}>
                          <SelectTrigger id="output-lang" className="h-7 w-[140px] text-xs rounded-full border-border/60" aria-label={t("jobResults.outputLanguage")}><SelectValue /></SelectTrigger>
                          <SelectContent>{LANGUAGES.filter((l) => l.code !== "auto").map((l) => <SelectItem key={l.code} value={l.code} className="text-xs">{l.label}</SelectItem>)}</SelectContent>
                        </Select>
                        {regeneratingLang && <InlineSpinner size="xs" tone="primary" />}
                      </div>
                    </div>
                  </div>
                  <div className="px-3 py-1.5 mt-1.5 border-t border-border/30 bg-muted/20">
                    <SpeakerChips
                      variant="secondary"
                      speakers={allSpeakers}
                      speakerNames={speakerNames}
                      onRename={handleRenameSpeaker}
                      onReset={handleResetSpeakerNames}
                      onIdentifySpeakers={runSpeakerIdentification}
                      identifyingInProgress={identifyingInProgress}
                    />
                  </div>
                </div>
              )}
              <div className="px-4 py-3 border-b border-border/40 sm:hidden space-y-2">
                <SpeakerChips
                  variant="primary"
                  speakers={allSpeakers}
                  speakerNames={speakerNames}
                  speakerSegmentCounts={speakerSegmentCounts}
                  deletableSpeakers={deletableSpeakers}
                  onRename={handleRenameSpeaker}
                  onAddSpeaker={handleAddSpeaker}
                  onDeleteSpeaker={handleDeleteSpeaker}
                  onSuggestSpeaker={handleSuggestSpeaker}
                  suggestingForSpeaker={suggestingForSpeaker}
                />
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {transcript && (
                    <ListenButton
                      ownerId="transcript"
                      getText={() => transcriptToSpeech(activeTranscriptContent, speakerNames)}
                      lang={speechLang}
                    />
                  )}
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  <Select value={outputLang} onValueChange={handleOutputLanguageChange} disabled={regeneratingLang}>
                    <SelectTrigger id="output-lang-mobile" className="h-7 w-[140px] text-xs rounded-full border-border/60" aria-label={t("jobResults.outputLanguage")}><SelectValue /></SelectTrigger>
                    <SelectContent>{LANGUAGES.filter((l) => l.code !== "auto").map((l) => <SelectItem key={l.code} value={l.code} className="text-xs">{l.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {regeneratingLang && <InlineSpinner size="xs" tone="primary" />}
                </div>
                <div className="-mx-4 px-4 pt-2 mt-1 border-t border-border/30 bg-muted/20">
                  <SpeakerChips
                    variant="secondary"
                    speakers={allSpeakers}
                    speakerNames={speakerNames}
                    onRename={handleRenameSpeaker}
                    onReset={handleResetSpeakerNames}
                    onIdentifySpeakers={runSpeakerIdentification}
                    identifyingInProgress={identifyingInProgress}
                  />
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
                    onRerun={() => {
                      identificationRanRef.current = false;
                      runSpeakerIdentification();
                    }}
                    isRerunning={identifyingInProgress}
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
                <InlineSpinner layout="block" label={t("jobResults.translatingTranscript")} />
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
              {/* Header row: Participants (left) + Listen (right) */}
              {transcript && !regeneratingLang ? (
                <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-3 pb-3 border-b border-border/40">
                  <div className="flex-1 min-w-0">
                    <ParticipantsPanel
                      segments={parseSegments(activeTranscriptContent)}
                      speakerNames={speakerNames}
                      durationSeconds={meta?.duration_seconds ?? null}
                    />
                  </div>
                  <div className="shrink-0 pt-0.5">
                    <ListenButton
                      ownerId="summary"
                      getText={() => summaryToSpeech(applySpeakerNames(activeSummaryContent ?? "", speakerNames))}
                      lang={speechLang}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-end px-4 sm:px-5 pt-2 pb-1.5 border-b border-border/40">
                  <ListenButton
                    ownerId="summary"
                    getText={() => summaryToSpeech(applySpeakerNames(activeSummaryContent ?? "", speakerNames))}
                    lang={speechLang}
                  />
                </div>
              )}
              {summaryNeedsRegen && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 sm:px-5 py-3 border-b border-warning/30 bg-warning/5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                    <p className="text-xs text-foreground/80">{t("jobResults.summaryOutdated")}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {summaryRegenCount < 3 ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full gap-1.5 text-xs h-7 px-3"
                          disabled={regeneratingSummary}
                          onClick={async () => {
                            setRegeneratingSummary(true);
                            try {
                              const { data, error } = await supabase.functions.invoke("regenerate", {
                                body: { job_id: jobId, output_type: "summary_from_edit" },
                              });
                              if (error || data?.error) {
                                toast.error(data?.error || t("jobResults.summaryRegenFailed"));
                                return;
                              }
                              if (data?.output) {
                                setOutputs((prev) => prev.map((o) => o.output_type === "summary" ? data.output as JobOutput : o));
                              }
                              setSummaryNeedsRegen(false);
                              setSummaryRegenCount((c) => c + 1);
                              toast.success(t("jobResults.summaryRegenerated"));
                            } catch {
                              toast.error(t("jobResults.summaryRegenFailed"));
                            } finally {
                              setRegeneratingSummary(false);
                            }
                          }}
                        >
                          {regeneratingSummary ? <InlineSpinner size="xs" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          {regeneratingSummary ? t("jobResults.regeneratingSummary") : t("jobResults.regenerateSummary")}
                        </Button>
                        <span className="text-caption text-muted-foreground tabular-nums whitespace-nowrap">
                          {t("jobResults.summaryRegenRemaining", { remaining: 3 - summaryRegenCount })}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("jobResults.summaryRegenLimitReached")}</span>
                    )}
                  </div>
                </div>
              )}
              {/* Participants moved into header row above */}
              <div className="p-5 sm:p-6">
                <div className="mx-auto max-w-[68ch]">
                  {regeneratingLang ? <InlineSpinner layout="block" label={t("jobResults.translatingContent")} />
                    : summary ? <StructuredSummary content={applySpeakerNames(activeSummaryContent ?? "", speakerNames)} />
                    : <p className="text-sm text-muted-foreground">{t("jobResults.noSummary")}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions" className="mt-0">
          <Card className="rounded-2xl border-border/40 shadow-sm">
            <CardContent className="p-0">
              <div className="px-4 sm:px-5 pt-3 pb-4 border-b border-border/40">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label htmlFor="question-input" className="text-sm font-medium">{t("jobResults.askQuestion")}</label>
                    {questionEntries.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        <MessageSquare className="w-3 h-3" aria-hidden="true" />
                        {t("jobResults.questionsCount", { count: questionEntries.length, defaultValue: "{{count}} question" })}
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 pt-0.5">
                    <ListenButton
                      ownerId="questions"
                      getText={() => latestAnswerToSpeech(latestAnswerContent)}
                      lang={speechLang}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{t("jobResults.askQuestionDesc")}</p>
                <div className="relative w-full">
                  <Textarea id="question-input" placeholder={t("jobResults.askPlaceholder")} value={questionPrompt} onChange={(e) => setQuestionPrompt(e.target.value)} className="w-full rounded-xl text-base md:text-sm min-h-[80px] resize-none pr-16 pt-9" disabled={askingQuestion || isQuestionLimitReached} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAskQuestion(); } }} />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setQuestionExpanded(true)} disabled={askingQuestion || isQuestionLimitReached} className="absolute top-1.5 right-1.5 rounded-full h-7 w-7 p-0 text-muted-foreground hover:text-foreground" aria-label={t("jobResults.expandEditor", { defaultValue: "Expand editor" })} title={t("jobResults.expandEditor", { defaultValue: "Expand editor" })}>
                    <Maximize2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button onClick={handleAskQuestion} disabled={askingQuestion || !questionPrompt.trim() || isQuestionLimitReached} size="sm" className="absolute bottom-2.5 right-2.5 rounded-full gap-1.5 px-3 h-8">
                    {askingQuestion ? <InlineSpinner size="sm" /> : <><Send className="w-3.5 h-3.5" />{t("common.ask")}</>}
                  </Button>
                </div>
                <Dialog open={questionExpanded} onOpenChange={setQuestionExpanded}>
                  <DialogContent className="max-w-[100vw] sm:max-w-[100vw] w-screen h-[100dvh] sm:h-[100dvh] rounded-none p-0 gap-0 flex flex-col border-0">
                    <DialogHeader className="px-5 sm:px-8 pt-5 pb-3 border-b border-border/40">
                      <DialogTitle>{t("jobResults.askQuestion")}</DialogTitle>
                      <DialogDescription className="text-xs">{t("jobResults.askQuestionDesc")}</DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 min-h-0 px-5 sm:px-8 py-4">
                      <Textarea
                        autoFocus
                        placeholder={t("jobResults.askPlaceholder")}
                        value={questionPrompt}
                        onChange={(e) => setQuestionPrompt(e.target.value)}
                        disabled={askingQuestion || isQuestionLimitReached}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            handleAskQuestion();
                            setQuestionExpanded(false);
                          }
                        }}
                        className="w-full h-full resize-none rounded-xl text-base leading-relaxed"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2 px-5 sm:px-8 py-3 border-t border-border/40">
                      <Button variant="ghost" onClick={() => setQuestionExpanded(false)}>
                        {t("common.close", { defaultValue: "Close" })}
                      </Button>
                      <Button
                        onClick={() => { handleAskQuestion(); setQuestionExpanded(false); }}
                        disabled={askingQuestion || !questionPrompt.trim() || isQuestionLimitReached}
                        className="rounded-full gap-1.5"
                      >
                        {askingQuestion ? <InlineSpinner size="sm" /> : <><Send className="w-3.5 h-3.5" />{t("common.ask")}</>}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <Switch
                      checked={useExtraSources}
                      onCheckedChange={(checked) => {
                        setUseExtraSources(checked);
                        if (!checked) setExtraSources([]);
                      }}
                      aria-label={t("jobResults.extraSources.toggleLabel")}
                    />
                    <span className="text-xs text-muted-foreground">
                      {t("jobResults.extraSources.toggleLabel")}
                    </span>
                  </label>
                  {useExtraSources && (
                    <QuestionExtraSourcesPicker
                      currentJobId={jobId}
                      value={extraSources}
                      onChange={setExtraSources}
                      max={5}
                      />
                    )}
                  </div>
                <p className="text-xs text-muted-foreground text-right mt-1.5">
                  {isQuestionLimitReached
                    ? t("jobResults.noQuestionsLeft")
                    : t("jobResults.questionsLeft", { count: questionsRemaining })}
                </p>
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
                      const isRegenerating = regeneratingQAId === entry.id;
                      const isEditing = editingQAId === entry.id;
                      const isAnyGenerating = askingQuestion || !!regeneratingQAId;
                      return (
                        <div key={entry.id} className={`rounded-xl bg-muted/40 p-4 transition-opacity ${isExcluded ? "opacity-50" : ""}`}>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/30">
                              <div className="flex items-center gap-2">
                                <Checkbox id={checkboxId} checked={!isExcluded} onCheckedChange={(checked) => { setExcludedQAIds((prev) => { const next = new Set(prev); if (checked) next.delete(entry.id); else next.add(entry.id); return next; }); }} aria-label={`Include "${entry.custom_prompt ?? "this answer"}" in export`} />
                                <label htmlFor={checkboxId} className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap select-none">{t("jobResults.includeInExport")}</label>
                              </div>
                              <div className="flex items-center gap-0.5">
                                {!isQuestionLimitReached && !isEditing && (
                                  <Button variant="ghost" size="sm" className="rounded-full h-7 w-7 p-0" disabled={isAnyGenerating} onClick={() => { setEditingQAId(entry.id); setEditingQAText(entry.custom_prompt ?? ""); setEditingExtraSources((entry.metadata?.extra_sources ?? []).slice(0, 5).map((s) => ({ id: s.id, title: s.title }))); }} aria-label={t("jobResults.editQuestion")}>
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="sm" className="rounded-full h-7 w-7 p-0 text-destructive/70 hover:text-destructive" disabled={isRegenerating} onClick={() => handleDeleteQA(entry.id)} aria-label={t("jobResults.deleteQuestion")}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                                <Button variant="ghost" size="sm" className="rounded-full gap-1.5 text-xs h-7" onClick={() => handleCopy(applySpeakerNames(getContent(entry), speakerNames), entry.id)}>
                                  {copiedId === entry.id ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}{copiedId === entry.id ? t("common.copied") : t("common.copy")}
                                </Button>
                              </div>
                            </div>
                            <div>
                              {isEditing ? (
                                <div className="space-y-2 mb-2">
                                  <div className="flex items-start gap-2">
                                    <span className="text-micro uppercase text-primary/70 mt-3 shrink-0">Q</span>
                                    <div className="flex-1 flex items-center gap-1.5">
                                      <Textarea value={editingQAText} onChange={(e) => setEditingQAText(e.target.value)} className="rounded-lg text-sm min-h-[40px] resize-none flex-1" autoFocus onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEditQA(entry); } }} />
                                      <Button variant="ghost" size="sm" className="rounded-full h-7 w-7 p-0" onClick={() => handleEditQA(entry)} disabled={!editingQAText.trim()}><Check className="w-3.5 h-3.5" /></Button>
                                      <Button variant="ghost" size="sm" className="rounded-full h-7 w-7 p-0" onClick={() => { setEditingQAId(null); setEditingQAText(""); setEditingExtraSources([]); }}><X className="w-3.5 h-3.5" /></Button>
                                    </div>
                                  </div>
                                  <div className="pl-5">
                                    <QuestionExtraSourcesPicker
                                      currentJobId={jobId}
                                      value={editingExtraSources}
                                      onChange={setEditingExtraSources}
                                      max={5}
                                    />
                                  </div>
                                </div>
                              ) : (
                                entry.custom_prompt && <div className="flex items-start gap-2 mb-2"><span className="text-micro uppercase text-primary/70 mt-1 shrink-0">Q</span><p className="text-sm font-medium">{entry.custom_prompt}</p></div>
                              )}
                              {!isEditing && entry.metadata?.extra_sources && entry.metadata.extra_sources.length > 0 && (
                                <div className="pl-5 mb-2 flex flex-wrap items-center gap-1.5">
                                  <span className="text-micro uppercase text-muted-foreground/80">
                                    {t("jobResults.extraSources.usedLabel")}
                                  </span>
                                  {entry.metadata.extra_sources.map((src) => (
                                    <a
                                      key={src.id}
                                      href={`/job/${src.id}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 rounded-full bg-secondary/70 hover:bg-secondary px-2 py-0.5 text-caption text-secondary-foreground transition-colors max-w-[200px]"
                                      title={src.title}
                                    >
                                      <FileText className="w-2.5 h-2.5 shrink-0 text-muted-foreground" />
                                      <span className="truncate">{src.title}</span>
                                    </a>
                                  ))}
                                </div>
                              )}
                              <div className={`pl-5 relative ${isRegenerating ? "opacity-40" : ""}`}>
                                <SectionBody body={applySpeakerNames(getContent(entry), speakerNames)} />
                                {isRegenerating && (
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <InlineSpinner size="md" tone="primary" />
                                  </div>
                                )}
                              </div>
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
