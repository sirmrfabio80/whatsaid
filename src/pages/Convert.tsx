import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AudioUploader from "@/components/AudioUploader";
import JobResults from "@/components/JobResults";

import LanguageSelector from "@/components/LanguageSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { creditsForDuration, formatDuration } from "@/lib/pricing";
import { enhanceAudioForTranscription, type AudioEnhanceMetadata } from "@/lib/audio-enhance";
import { sanitizeStorageFilename } from "@/lib/sanitize-filename";
import { parseTemplateConfig, DEFAULT_TEMPLATE_CONFIG, type TranscribeTemplateConfig } from "@/lib/transcribe-template";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowRight, FileAudio, Clock, CheckCircle2, AlertCircle, FileText, Info, CreditCard,
  SkipForward,
} from "lucide-react";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Link } from "react-router-dom";
import type { AudioCreationDateResult } from "@/lib/audio-creation-date";
import type { AudioChannelAnalysis } from "@/lib/audio-channels";

type ProcessingStep = "enhancing" | "uploading" | "transcribing" | "summarising" | "completed" | "failed";

export default function Convert() {
  const { user, isAdmin, refreshCredits } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const cardRef = useRef<HTMLDivElement>(null);

  // Fetch credit balance for logged-in users
  const { data: creditBalance } = useQuery({
    queryKey: ["credit-balance", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("credit_balances")
        .select("balance")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data?.balance ?? 0;
    },
    enabled: !!user,
  });

  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [fileCreationDate, setFileCreationDate] = useState<AudioCreationDateResult | null>(null);
  const [channelAnalysis, setChannelAnalysis] = useState<AudioChannelAnalysis | null>(null);
  const [language, setLanguage] = useState("auto");
  const [customPrompt, setCustomPrompt] = useState("");
  
  const [processing, setProcessing] = useState(false);
  const [processingPurchase, setProcessingPurchase] = useState(false);
  const [creditsAdded, setCreditsAdded] = useState<number | null>(null);
  const [step, setStep] = useState<ProcessingStep | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [enhanceSkippedReason, setEnhanceSkippedReason] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [consentChecked, setConsentChecked] = useState(false);
  const credits = creditsForDuration(duration);
  const hasEnoughCredits = isAdmin || (creditBalance !== undefined ? creditBalance >= credits : true);

  const STEP_LABELS: Record<ProcessingStep, string> = {
    enhancing: t("convert.stepEnhancing"),
    uploading: t("convert.stepUploading"),
    transcribing: t("convert.stepTranscribing"),
    summarising: t("convert.stepSummarising"),
    completed: t("convert.stepCompleted"),
    failed: t("convert.stepFailed"),
  };

  const handleFileSelected = useCallback((f: File, dur: number, creationDate: AudioCreationDateResult | null, analysis: AudioChannelAnalysis | null) => {
    setFile(f);
    setDuration(dur);
    setFileCreationDate(creationDate);
    setChannelAnalysis(analysis);
  }, []);

  useEffect(() => {
    if (!jobId || !processing) return;

    const poll = async () => {
      const { data: job } = await supabase
        .from("jobs")
        .select("status, error_message")
        .eq("id", jobId)
        .maybeSingle();

      if (!job) return;

      if (job.status === "processing") {
        const { count } = await supabase
          .from("job_outputs")
          .select("id", { count: "exact", head: true })
          .eq("job_id", jobId)
          .eq("output_type", "transcript");

        setStep((count ?? 0) > 0 ? "summarising" : "transcribing");
      } else if (job.status === "completed") {
        if (pollRef.current) clearInterval(pollRef.current);
        setProcessing(false);
        navigate(`/job/${jobId}`);
      } else if (job.status === "failed") {
        setStep("failed");
        setErrorMessage(job.error_message || "An unknown error occurred.");
        setProcessing(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    };

    pollRef.current = setInterval(poll, 3000);
    poll();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, processing]);

  useEffect(() => {
    if (!user || searchParams.get("purchased") !== "true") return;

    const priorBalanceParam = searchParams.get("priorBalance");
    const priorBalance = Number(priorBalanceParam ?? "NaN");
    const hasPriorBalance = Number.isFinite(priorBalance);
    let attempts = 0;
    let active = true;

    setProcessingPurchase(true);

    const finish = (updatedBalance?: number) => {
      if (!active) return;
      active = false;
      setProcessingPurchase(false);
      setSearchParams((currentParams) => {
        const next = new URLSearchParams(currentParams);
        next.delete("purchased");
        next.delete("priorBalance");
        return next;
      }, { replace: true });

      if (typeof updatedBalance === "number") {
        queryClient.setQueryData(["credit-balance", user.id], updatedBalance);
      } else {
        queryClient.invalidateQueries({ queryKey: ["credit-balance", user.id] });
      }
    };

    const poll = async () => {
      attempts += 1;

      const { data } = await supabase
        .from("credit_balances")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!active) return;

      const latestBalance = data?.balance ?? 0;

      if (!hasPriorBalance || latestBalance > priorBalance) {
        await refreshCredits();
        if (hasPriorBalance) {
          setCreditsAdded(latestBalance - priorBalance);
        }
        finish(latestBalance);
        toast.success(t("pricing.purchaseSuccess"));
        return;
      }

      if (attempts >= 10) {
        await refreshCredits();
        finish();
        toast.info(t("pricing.creditsArrivingShortly", "Credits arriving shortly — refresh if needed"));
        return;
      }

      window.setTimeout(poll, 2000);
    };

    void poll();

    return () => {
      active = false;
    };
  }, [user, searchParams, setSearchParams, queryClient, refreshCredits, t]);

  const handleConvert = async () => {
    if (!file || !user) return;

    setProcessing(true);
    // Start at "enhancing" — the first real stage. We'll switch to "uploading"
    // later if the file is ineligible for enhancement, so the visible step
    // order always flows top-down (enhancing → uploading → …) instead of
    // briefly showing "uploading" before jumping back up to "enhancing".
    setStep("enhancing");
    setErrorMessage(null);

    // Scroll to top of page with smooth animation
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, left: 0, behavior: prefersReducedMotion ? "instant" : "smooth" });

    try {
      let uploadFile = file;

      // Load the active template to get audio-enhancement policy + knobs.
      let activeCfg: TranscribeTemplateConfig = DEFAULT_TEMPLATE_CONFIG;
      try {
        const { data: tplRow } = await supabase
          .from("transcribe_settings_templates")
          .select("config")
          .eq("is_active", true)
          .maybeSingle();
        if (tplRow?.config) {
          activeCfg = parseTemplateConfig(tplRow.config);
        }
      } catch (tplErr) {
        console.warn("Could not load active template, using defaults:", tplErr);
      }

      // Detect channel count first. We only need numberOfChannels, so probe a
      // small head slice — decoding the full file here would OOM long uploads.
      let inputChannels: 1 | 2 = 2;
      try {
        const PROBE_BYTES = 2 * 1024 * 1024; // 2 MB head is enough for the codec headers
        const probeBuf = await file.slice(0, Math.min(PROBE_BYTES, file.size)).arrayBuffer();
        const probeCtx = new AudioContext();
        const decoded = await probeCtx.decodeAudioData(probeBuf);
        inputChannels = decoded.numberOfChannels === 1 ? 1 : 2;
        await probeCtx.close();
      } catch (probeError) {
        console.warn("Channel probe failed, assuming stereo:", probeError);
      }

      // Decide eligibility from the active template.
      const featureEnabled = activeCfg.audio_enhancement_enabled;
      const channelAllowed = inputChannels === 1
        ? activeCfg.audio_enhancement_apply_to_mono
        : activeCfg.audio_enhancement_apply_to_stereo;
      // Hard duration cap: client-side enhancement decodes the entire file into
      // a Float32 PCM buffer (~channels × 48000 × seconds × 4 bytes) and then
      // single-thread MP3-encodes it. Above these limits the tab OOMs / hangs
      // on most devices, leaving the user stuck on "enhancing audio". When we
      // exceed the cap we skip enhancement and upload the original instead.
      const ENHANCE_MAX_DURATION_STEREO_S = 1500; // 25 min
      const ENHANCE_MAX_DURATION_MONO_S = 3000;   // 50 min
      const durationCap = inputChannels === 1
        ? ENHANCE_MAX_DURATION_MONO_S
        : ENHANCE_MAX_DURATION_STEREO_S;
      const withinDurationCap = duration <= durationCap;
      const eligible = featureEnabled && channelAllowed && withinDurationCap;

      const settingsSnapshot = {
        normalise: activeCfg.audio_normalise,
        normalise_mode: activeCfg.audio_normalise_mode,
        target_peak_dbfs: activeCfg.audio_target_peak_dbfs,
        target_rms_dbfs: activeCfg.audio_target_rms_dbfs,
        max_gain_db_mono: activeCfg.audio_max_gain_db_mono,
        max_gain_db_stereo: activeCfg.audio_max_gain_db_stereo,
        noise_floor_dbfs: activeCfg.audio_noise_floor_dbfs,
        soft_clip_threshold: activeCfg.audio_soft_clip_threshold,
      };

      type EnhancementMeta = {
        eligible: boolean;
        attempted: boolean;
        applied: boolean;
        reason: string;
        input_channels: 1 | 2;
        duration_ms: number;
        settings_snapshot: typeof settingsSnapshot | null;
        measured: AudioEnhanceMetadata["measured"] | null;
      };

      let enhancementMeta: EnhancementMeta;

      if (!eligible) {
        const reason = !featureEnabled
          ? "feature_disabled_by_template"
          : !withinDurationCap
            ? "duration_above_client_enhance_cap"
            : inputChannels === 1
              ? "mono_disabled_by_template"
              : "stereo_disabled_by_template";
        console.info(`[convert] audio enhancement skipped — ${reason} (duration=${Math.round(duration)}s, channels=${inputChannels})`);
        setEnhanceSkippedReason(reason);
        enhancementMeta = {
          eligible: false,
          attempted: false,
          applied: false,
          reason,
          input_channels: inputChannels,
          duration_ms: 0,
          settings_snapshot: null,
          measured: null,
        };
      } else {
        setStep("enhancing");
        try {
          // Wall-clock timeout: even within the duration cap, low-memory devices
          // can stall during decode/encode. If enhancement takes too long, fall
          // back to uploading the original so the user is never stuck here.
          const ENHANCE_TIMEOUT_MS = Math.max(60_000, Math.round(duration * 1000 * 1.5));
          const enhancePromise = enhanceAudioForTranscription(file, undefined, settingsSnapshot);
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("enhance_timeout")), ENHANCE_TIMEOUT_MS);
          });
          const result = await Promise.race([enhancePromise, timeoutPromise]);
          uploadFile = result.file;
          enhancementMeta = {
            eligible: true,
            attempted: true,
            applied: result.metadata.applied,
            reason: result.metadata.reason,
            input_channels: result.metadata.input_channels,
            duration_ms: result.metadata.duration_ms,
            settings_snapshot: settingsSnapshot,
            measured: result.metadata.measured,
          };
        } catch (enhanceError) {
          console.warn("Audio enhancement failed, uploading original:", enhanceError);
          uploadFile = file;
          enhancementMeta = {
            eligible: true,
            attempted: true,
            applied: false,
            reason: enhanceError instanceof Error && enhanceError.message === "enhance_timeout" ? "timeout" : "failed",
            input_channels: inputChannels,
            duration_ms: 0,
            settings_snapshot: settingsSnapshot,
            measured: null,
          };
        }
      }

      setStep("uploading");
      const newJobId = crypto.randomUUID();
      // Defensive sanitization: covers branches that bypass enhancement (e.g. .wav)
      // and any future code path producing an upload file. Supabase Storage rejects
      // keys with non-ASCII chars (curly quotes, accents, emoji, etc.).
      const safeUploadName = sanitizeStorageFilename(uploadFile.name);
      const filePath = `${user.id}/${newJobId}/${safeUploadName}`;

      const { error: uploadError } = await supabase.storage
        .from("temp-audio")
        .upload(filePath, uploadFile, { upsert: false });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      const fileLastModifiedIso = new Date(file.lastModified).toISOString();
      const recordedAt = fileCreationDate
        ? fileCreationDate.isoString
        : fileLastModifiedIso;
      const recordedAtSource = fileCreationDate
        ? fileCreationDate.source
        : "file_last_modified";

      // Build transcription_config from UI settings (picker is hidden — only
      // channel analysis metadata is attached; backend defaults handle strategy).
      const txConfig: Record<string, unknown> = {
        audio_enhancement: enhancementMeta,
      };
      if (channelAnalysis) {
        txConfig.channel_analysis = {
          detected_channel_count: channelAnalysis.detectedChannelCount,
          decoded_channel_count: channelAnalysis.decodedChannelCount,
          route_hint: channelAnalysis.routeHint,
          reason: channelAnalysis.reason,
          correlation: channelAnalysis.correlation,
          active_window_count: channelAnalysis.activeWindowCount,
          dominant_window_ratio: channelAnalysis.dominantWindowRatio,
        };
      }
      const hasConfig = Object.keys(txConfig).length > 0;

      const { error: jobError } = await supabase
        .from("jobs")
        .insert({
          id: newJobId,
          user_id: user.id,
          file_name: file.name,
          file_size_bytes: file.size,
          duration_seconds: Math.round(duration),
          language_selected: language,
          credits_charged: credits,
          status: "uploading" as const,
          temp_file_path: filePath,
          recorded_at: recordedAt,
          recorded_at_source: recordedAtSource,
          metadata_apple_creationdate: fileCreationDate?.allSources.apple_metadata ?? null,
          metadata_mvhd_creation: fileCreationDate?.allSources.mvhd_creation ?? null,
          metadata_file_lastmodified: fileLastModifiedIso,
          metadata_location_iso6709: fileCreationDate?.locationISO6709 ?? null,
          audio_channels: channelAnalysis?.detectedChannelCount ?? null,
          transcription_config: hasConfig ? txConfig : null,
        } as any);

      if (jobError) {
        throw new Error(jobError.message || "Could not create job");
      }

      setJobId(newJobId);
      setStep("transcribing");

      const { error: fnError } = await supabase.functions.invoke("process-job", {
        body: { job_id: newJobId, custom_prompt: customPrompt || null },
      });

      if (fnError) {
        console.error("process-job invoke error:", fnError);
      }
    } catch (error) {
      console.error("Convert error:", error);
      setStep("failed");
      setErrorMessage(error instanceof Error ? error.message : "An unknown error occurred.");
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setDuration(0);
    setFileCreationDate(null);
    setChannelAnalysis(null);
    setLanguage("auto");
    setCustomPrompt("");
    setProcessing(false);
    setStep(null);
    setErrorMessage(null);
    setJobId(null);
    setEnhanceSkippedReason(null);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter-flat relative overflow-hidden">
      {/* Off-axis decorative orb (desktop only) — matches marketing pages identity */}
      <div
        aria-hidden="true"
        className="hidden lg:block absolute top-8 right-[-8rem] w-[24rem] h-[24rem] rounded-full bg-primary/10 blur-3xl pointer-events-none"
      />

      {processingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 shadow-lg">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-lg font-medium text-foreground">
              {t("pricing.processingPurchase", "Processing purchase…")}
            </p>
            <p className="text-body-sm text-muted-foreground">
              {t("pricing.processingPurchaseDesc", "Your credits will appear shortly.")}
            </p>
          </div>
        </div>
      )}
      <div className="container mx-auto px-5 sm:px-6 py-6 sm:py-10 relative">
        <div className="max-w-2xl mx-auto">
          {creditsAdded !== null && (
            <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 animate-enter">
              <div className="flex items-center gap-2 text-body-sm font-medium text-foreground">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                <span>{t("pricing.creditsAddedBanner", { count: creditsAdded })}</span>
              </div>
              <button
                onClick={() => setCreditsAdded(null)}
                className="text-muted-foreground hover:text-foreground text-caption shrink-0"
                aria-label={t("common.cancel")}
              >
                ✕
              </button>
            </div>
          )}
          <div className="text-center mb-8">
            <p className="font-serif italic text-caption text-primary mb-2">
              {t("convert.eyebrow", { defaultValue: "Upload & transcribe" })}
            </p>
            <h1 className="text-h1 sm:text-[1.875rem] mb-2">{t("convert.title")}</h1>
            <p className="font-serif text-body text-muted-foreground">{t("convert.subtitle")}</p>
          </div>

          {processing || step === "failed" ? (
            <Card ref={cardRef} className="rounded-xl border-border/50 bg-card shadow-sm mb-6 animate-enter">
              <CardContent className="p-8 sm:p-12">
                <div className="flex flex-col items-center text-center space-y-6">
                  {step !== "failed" && step !== "completed" && (
                    <div className="inline-flex items-center gap-2 rounded-full bg-warning/10 text-warning border border-warning/20 px-3 py-1 text-xs font-medium">
                      <span className="relative inline-flex w-1.5 h-1.5" aria-hidden="true">
                        <span className="motion-safe:animate-pulse-ring-slow motion-reduce:hidden absolute inset-0 rounded-full bg-warning/50" />
                        <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-warning" />
                      </span>
                      {t(`jobDetail.status.${step === "uploading" ? "uploading" : "processing"}`, {
                        defaultValue: step === "uploading" ? "Uploading" : "Processing",
                      })}
                    </div>
                  )}
                  <div className="w-full max-w-sm space-y-4">
                    {(["enhancing", "uploading", "transcribing", "summarising", "completed"] as ProcessingStep[]).map((s) => {
                      const allSteps: ProcessingStep[] = ["enhancing", "uploading", "transcribing", "summarising", "completed"];
                      const isCurrent = step === s;
                      const isPast = step !== "failed" && (
                        allSteps.indexOf(step!) > allSteps.indexOf(s)
                      );

                      return (
                        <div
                          key={s}
                          className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                            isCurrent
                              ? "bg-primary/10 text-foreground"
                              : isPast
                                ? "text-muted-foreground"
                                : "text-muted-foreground/40"
                          }`}
                        >
                          {isCurrent && step !== "failed" ? (
                            <InlineSpinner size="md" tone="primary" />
                          ) : isPast ? (
                            <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                          ) : step === "failed" && isCurrent ? (
                            <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-current shrink-0" />
                          )}
                          <span className={`text-body-sm font-medium ${isCurrent ? "text-foreground" : ""}`}>
                            {STEP_LABELS[s]}
                          </span>
                          {s === "enhancing" && isPast && enhanceSkippedReason && (
                            <TooltipProvider delayDuration={100}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="ml-auto inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                    aria-label={t("convert.enhanceSkippedTooltip", "Audio enhancement skipped")}
                                  >
                                    <SkipForward className="w-3.5 h-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-xs">
                                  <p className="text-body-xs">
                                    {enhanceSkippedReason === "duration_above_client_enhance_cap"
                                      ? t("convert.enhanceSkippedDuration", "Enhancement skipped: file exceeds safe processing length. Original audio uploaded.")
                                      : enhanceSkippedReason === "feature_disabled_by_template"
                                        ? t("convert.enhanceSkippedDisabled", "Enhancement disabled for this file type. Original audio uploaded.")
                                        : enhanceSkippedReason === "mono_disabled_by_template" || enhanceSkippedReason === "stereo_disabled_by_template"
                                          ? t("convert.enhanceSkippedChannel", "Enhancement disabled for this channel configuration. Original audio uploaded.")
                                          : t("convert.enhanceSkippedGeneric", "Audio enhancement was skipped. Original audio uploaded.")}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {step === "failed" && errorMessage && (
                    <div className="flex items-start gap-2 p-4 rounded-xl bg-destructive/10 text-destructive text-body-sm max-w-sm">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {file && (
                    <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
                      <FileAudio className="w-4 h-4" />
                      <span className="truncate max-w-[200px]">{file.name}</span>
                      <span>· {formatDuration(duration)}</span>
                    </div>
                  )}

                  {step === "failed" && (
                    <Button className="rounded-xl" onClick={handleReset}>
                      {t("common.tryAgain")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card ref={cardRef} className="rounded-xl border-border/50 bg-card shadow-sm mb-6">
              <CardContent className="p-6 sm:p-8">
                <AudioUploader onFileSelected={handleFileSelected} />

                {file && duration > 0 && (
                  <div className="mt-6 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                      <FileAudio className="w-5 h-5 text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-body-sm font-medium truncate">{file.name}</p>
                        <p className="text-caption text-muted-foreground">{formatDuration(duration)} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      <Button variant="ghost" size="sm" className="rounded-xl text-caption" onClick={handleReset}>
                        {t("common.change")}
                      </Button>
                    </div>

                    <div className="space-y-4">
                      <LanguageSelector value={language} onChange={setLanguage} />

                      <div className="space-y-2">
                        <label className="text-body-sm font-medium" htmlFor="custom-prompt">
                          {t("convert.customPromptLabel")} <span className="text-muted-foreground font-normal">{t("convert.customPromptOptional")}</span>
                        </label>
                        <Textarea
                          id="custom-prompt"
                          placeholder={t("convert.customPromptPlaceholder")}
                          value={customPrompt}
                          onChange={(e) => setCustomPrompt(e.target.value)}
                          className="rounded-xl resize-none min-h-[80px]"
                        />
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-muted/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          {t("convert.duration")}
                        </div>
                        <span className="text-body-sm font-medium">{formatDuration(duration)}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
                          <CreditCard className="w-4 h-4" />
                          {t("convert.cost")}
                        </div>
                        <div className="text-right">
                          <span className="text-body-sm font-medium">
                            {credits === 1
                              ? t("convert.costOneCredit")
                              : t("convert.costMultipleCredits", { count: credits })}
                          </span>
                          {credits > 1 && (
                            <p className="text-caption text-muted-foreground mt-0.5">
                              {t("convert.costMultipleCreditsHint", { minutes: Math.ceil(duration / 60) })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="recording-consent"
                        checked={consentChecked}
                        onCheckedChange={(c) => setConsentChecked(c === true)}
                        className="mt-0.5"
                      />
                      <label htmlFor="recording-consent" className="text-body-sm text-muted-foreground leading-snug cursor-pointer">
                        {t("convert.consentLabel")}
                      </label>
                    </div>

                    <p className="text-caption text-muted-foreground flex items-start gap-1.5">
                      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {t("convert.thirdPartyNotice")}{" "}
                      <Link to="/terms" className="text-primary hover:underline" target="_blank">{t("convert.terms")}</Link>{" "}{t("convert.and")}{" "}
                      <Link to="/privacy" className="text-primary hover:underline" target="_blank">{t("convert.privacyPolicy")}</Link>.
                    </p>

                    {user ? (
                      <>
                        {!hasEnoughCredits && file && (
                          <div className="flex items-start gap-2.5 p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                            <CreditCard className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                            <div className="space-y-1.5">
                              <p className="text-body-sm font-medium text-destructive">{t("convert.noCreditsTitle")}</p>
                              <p className="text-caption text-destructive/80">{t("convert.noCreditsDesc", { required: credits, balance: creditBalance ?? 0 })}</p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg mt-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                                onClick={() => navigate("/pricing")}
                              >
                                {t("convert.buyCredits")}
                              </Button>
                            </div>
                          </div>
                        )}
                        <Button
                          className="w-full h-12 text-base font-medium rounded-xl"
                          size="lg"
                          onClick={handleConvert}
                          disabled={processing || !consentChecked || !hasEnoughCredits}
                        >
                          {t("convert.convertNow")}<ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </>
                    ) : (
                      <div className="text-center space-y-3">
                        <p className="text-body-sm text-muted-foreground">
                          {t("convert.signInToConvert")}
                        </p>
                        <Button className="w-full rounded-xl" onClick={() => navigate("/login")}>
                          {t("common.signIn")}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
