import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AudioUploader from "@/components/AudioUploader";
import DirectRecorder from "@/components/DirectRecorder";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mic, Upload as UploadIcon } from "lucide-react";
import JobResults from "@/components/JobResults";

import LanguageSelector from "@/components/LanguageSelector";
import LanguageGate from "@/components/LanguageGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { creditsForDuration, formatDuration } from "@/lib/pricing";
import { enhanceAudioForTranscriptionAuto, type AudioEnhanceMetadata, type EnhanceProgressStage } from "@/lib/audio-enhance";
import { sanitizeStorageFilename } from "@/lib/sanitize-filename";
import { parseTemplateConfig, DEFAULT_TEMPLATE_CONFIG, type TranscribeTemplateConfig } from "@/lib/transcribe-template";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowRight, FileAudio, Clock, CheckCircle2, AlertCircle, FileText, Info, CreditCard
} from "lucide-react";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import { Link } from "react-router-dom";
import type { AudioCreationDateResult } from "@/lib/audio-creation-date";
import type { AudioChannelAnalysis } from "@/lib/audio-channels";
import { requestNotificationPermission, isBrowserNotificationsEnabled } from "@/lib/browser-notifications";
import { resumableUpload } from "@/lib/storage-resumable-upload";
import { useJobHeartbeat } from "@/hooks/use-job-heartbeat";
import { usePageMeta } from "@/hooks/use-page-meta";
import { JsonLd } from "@/components/seo/JsonLd";
import { getLanguageLabel } from "@/lib/languages";

const CONVERT_BREADCRUMB_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://whatsaid.app/" },
    { "@type": "ListItem", position: 2, name: "Transcribe Audio", item: "https://whatsaid.app/convert" },
  ],
};

type ProcessingStep = "preparing" | "enhancing" | "uploading" | "detecting" | "transcribing" | "summarising" | "completed" | "failed";

// Imperative gate used between upload and transcription. Resolves with the
// final language the user wants to use (either the detected one, or their
// override). Null when no gate is active.
interface LanguageGateState {
  detected: string | null; // null while still detecting
  resolve: (chosenLanguage: string) => void;
}
type EnhanceSubstage = EnhanceProgressStage | null;

export default function Convert() {
  usePageMeta({
    title: "Transcribe Audio — WhatSaid",
    description:
      "Drop a .m4a, .mp3 or .wav file and get a transcript with speaker labels, a structured summary, and custom AI answers. Pay-as-you-go credits.",
    canonical: "https://whatsaid.app/convert",
  });
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
  const [enhanceSubstage, setEnhanceSubstage] = useState<EnhanceSubstage>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadAuthFailed, setUploadAuthFailed] = useState(false);
  const [pendingRetryFile, setPendingRetryFile] = useState<File | null>(null);
  const [pendingRetryJobId, setPendingRetryJobId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const longFileToastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [consentChecked, setConsentChecked] = useState(false);
  const [languageGate, setLanguageGate] = useState<LanguageGateState | null>(null);
  // Surfaced status of the pre-flight language detection so the user always
  // knows what happened (success / skipped / failed). Null = not run yet.
  const [languageDetectStatus, setLanguageDetectStatus] = useState<
    null | { status: "success" | "skipped" | "failed"; language: string | null; reason?: string }
  >(null);
  const credits = creditsForDuration(duration);
  const hasEnoughCredits = isAdmin || (creditBalance !== undefined ? creditBalance >= credits : true);

  // Heartbeat: while we're doing local prep/enhance/upload work, bump
  // jobs.updated_at every 60s so the watchdog can't flag a live tab as stale.
  const heartbeatStage: "preparing" | "enhancing" | "uploading" | "detecting_language" | null =
    processing && (step === "enhancing" || step === "uploading" || step === "detecting")
      ? step === "uploading"
        ? "uploading"
        : step === "detecting"
          ? "detecting_language"
          : "enhancing"
      : null;
  useJobHeartbeat(jobId, heartbeatStage);

  const STEP_LABELS: Record<ProcessingStep, string> = {
    preparing: t("convert.stepEnhancing"),
    enhancing: t("convert.stepEnhancing"),
    uploading: t("convert.stepUploading"),
    detecting: t("convert.stepDetecting", "Detecting language…"),
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

  // Recorded audio takes the same path as an uploaded file, but auto-submits
  // immediately on Stop so the user doesn't have to re-confirm anything.
  // Tapping Stop is itself the consent action (they recorded it themselves).
  // creationDate=null → pipeline falls back to file.lastModified.
  // channelAnalysis=null → pipeline already defaults safely when missing.
  // The recorded audio is uploaded to the private temp-audio bucket and
  // deleted by process-job once the transcript is generated, exactly like
  // any uploaded file.
  const handleRecordingReady = useCallback((f: File, dur: number) => {
    setFile(f);
    setDuration(dur);
    setFileCreationDate(null);
    setChannelAnalysis(null);

    if (!user) {
      toast.error(t("convert.signInToConvert"));
      return;
    }
    const requiredCredits = creditsForDuration(dur);
    const balance = creditBalance ?? 0;
    if (!isAdmin && balance < requiredCredits) {
      toast.error(
        t("convert.noCreditsDesc", { required: requiredCredits, balance }),
      );
      return;
    }

    void handleConvert({
      file: f,
      duration: dur,
      fileCreationDate: null,
      channelAnalysis: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin, creditBalance, t]);

  useEffect(() => {
    if (!jobId || !processing) return;

    const poll = async () => {
      const { data: job } = await supabase
        .from("jobs")
        .select("status, error_message, processing_stage")
        .eq("id", jobId)
        .maybeSingle();

      if (!job) return;

      if (job.status === "uploading") {
        // Reflect the local processing_stage onto the visible step so the user
        // sees real progress while we run the in-browser pipeline.
        const stage = job.processing_stage;
        if (stage === "enhancing") setStep((prev) => prev === "enhancing" ? prev : "enhancing");
        else if (stage === "uploading") setStep((prev) => prev === "uploading" ? prev : "uploading");
        else if (stage === "detecting_language") setStep((prev) => prev === "detecting" ? prev : "detecting");
        else if (stage === "preparing") setStep((prev) => prev === "enhancing" ? prev : "enhancing");
      } else if (job.status === "processing") {
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

  interface ConvertOverrides {
    file?: File;
    duration?: number;
    fileCreationDate?: AudioCreationDateResult | null;
    channelAnalysis?: AudioChannelAnalysis | null;
  }

  const handleConvert = async (overrides?: ConvertOverrides) => {
    // Resolve from overrides or fall back to component state. This lets the
    // recorder auto-submit immediately on Stop without waiting for setState
    // to flush.
    const effFile = overrides?.file ?? file;
    const effDuration = overrides?.duration ?? duration;
    const effFileCreationDate =
      overrides?.fileCreationDate !== undefined ? overrides.fileCreationDate : fileCreationDate;
    const effChannelAnalysis =
      overrides?.channelAnalysis !== undefined ? overrides.channelAnalysis : channelAnalysis;
    const effCredits = creditsForDuration(effDuration);

    if (!effFile || !user) return;

    // Quietly request browser notification permission so we can alert the user
    // if they navigate away or background the tab. Skip if the user has muted
    // browser notifications in Settings. Failures are non-blocking.
    if (isBrowserNotificationsEnabled()) {
      void requestNotificationPermission();
    }

    setProcessing(true);
    setStep("enhancing");
    setEnhanceSubstage(null);
    setErrorMessage(null);
    setUploadAuthFailed(false);
    setPendingRetryFile(null);
    setPendingRetryJobId(null);

    // Scroll to top of page with smooth animation
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, left: 0, behavior: prefersReducedMotion ? "instant" : "smooth" });

    // Show a soft "long file" toast after 90s if we're still in the local pipeline.
    if (longFileToastRef.current) clearTimeout(longFileToastRef.current);
    longFileToastRef.current = setTimeout(() => {
      toast.info(t("convert.longFileToast"));
    }, 90_000);

    const newJobId = crypto.randomUUID();

    // Derive channel count from the analysis already produced by AudioUploader.
    // No redundant decode probe here — that was the main thread freeze for
    // long files. If both header and decoded values are missing, default to
    // stereo (the safer default for diarization-routed content).
    const decodedCh = effChannelAnalysis?.decodedChannelCount ?? null;
    const headerCh = effChannelAnalysis?.headerChannelCount ?? effChannelAnalysis?.detectedChannelCount ?? null;
    const resolvedCh = decodedCh ?? headerCh;
    if (resolvedCh == null) {
      console.warn("[convert] No channel count from analysis, defaulting to stereo");
    }
    const inputChannels: 1 | 2 = resolvedCh === 1 ? 1 : 2;

    const fileLastModifiedIso = new Date(effFile.lastModified).toISOString();
    const recordedAt = effFileCreationDate ? effFileCreationDate.isoString : fileLastModifiedIso;
    const recordedAtSource = effFileCreationDate ? effFileCreationDate.source : "file_last_modified";

    try {
      // ── 1. Insert the jobs row IMMEDIATELY so the row exists from second one. ──
      // We use status="uploading" + processing_stage="preparing" so the existing
      // poller (which we widened) can reflect early phases. Watchdog only acts
      // on status="processing", so this row is safe from premature stale-kill.
      const { error: insertError } = await supabase
        .from("jobs")
        .insert({
          id: newJobId,
          user_id: user.id,
          file_name: effFile.name,
          file_size_bytes: effFile.size,
          duration_seconds: Math.round(duration),
          language_selected: language,
          credits_charged: credits,
          status: "uploading" as const,
          processing_stage: "preparing",
          recorded_at: recordedAt,
          recorded_at_source: recordedAtSource,
          metadata_apple_creationdate: fileCreationDate?.allSources.apple_metadata ?? null,
          metadata_mvhd_creation: fileCreationDate?.allSources.mvhd_creation ?? null,
          metadata_file_lastmodified: fileLastModifiedIso,
          metadata_location_iso6709: fileCreationDate?.locationISO6709 ?? null,
          audio_channels: resolvedCh ?? null,
        } as any);

      if (insertError) {
        throw new Error(insertError.message || "Could not create job");
      }

      // Start polling immediately so the UI is honest from the very first second.
      setJobId(newJobId);

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

      const featureEnabled = activeCfg.audio_enhancement_enabled;
      const channelAllowed = inputChannels === 1
        ? activeCfg.audio_enhancement_apply_to_mono
        : activeCfg.audio_enhancement_apply_to_stereo;
      const eligible = featureEnabled && channelAllowed;

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
      let uploadFile = effFile;

      // ── 2. Enhance (worker for long M4A/MP4, in-memory otherwise). ──
      if (!eligible) {
        const reason = !featureEnabled
          ? "feature_disabled_by_template"
          : inputChannels === 1
            ? "mono_disabled_by_template"
            : "stereo_disabled_by_template";
        console.info(`[convert] audio enhancement skipped — ${reason}`);
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
        await supabase.from("jobs").update({ processing_stage: "enhancing" }).eq("id", newJobId);
        try {
          const result = await enhanceAudioForTranscriptionAuto(
            effFile,
            (stage) => setEnhanceSubstage(stage),
            settingsSnapshot,
          );
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
          uploadFile = effFile;
          enhancementMeta = {
            eligible: true,
            attempted: true,
            applied: false,
            reason: "failed",
            input_channels: inputChannels,
            duration_ms: 0,
            settings_snapshot: settingsSnapshot,
            measured: null,
          };
        }
        setEnhanceSubstage(null);
      }

      // ── 3. Upload to storage (resumable / chunked / heartbeat-aware). ──
      setStep("uploading");
      await supabase.from("jobs").update({ processing_stage: "uploading" }).eq("id", newJobId);

      // Defensive: long enhancement work can leave the in-memory session
      // stale. Make sure we have a usable token before TUS starts.
      {
        const { data: s } = await supabase.auth.getSession();
        if (!s.session?.access_token) {
          const { data: r } = await supabase.auth.refreshSession();
          if (!r.session?.access_token) {
            toast.error(t("convert.sessionExpired", "Your session expired during processing. Please sign in again to upload."));
            navigate("/login");
            return;
          }
        }
      }

      const safeUploadName = sanitizeStorageFilename(uploadFile.name);
      const filePath = `${user.id}/${newJobId}/${safeUploadName}`;

      let uploadMeta: {
        resumable: boolean;
        chunk_size_mb: number;
        retries: number;
        resumed_from_previous: boolean;
      };
      try {
        const result = await resumableUpload({
          bucketName: "temp-audio",
          objectName: filePath,
          file: uploadFile,
          jobId: newJobId,
          onChunkComplete: () => {
            // Each successful chunk also bumps updated_at — extra safety on
            // top of the 60s heartbeat for very large files.
            void supabase
              .from("jobs")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", newJobId);
          },
          onRetry: (attempt) => {
            if (attempt === 1) {
              toast.info(t("convert.uploadPausedRetrying", "Upload paused — retrying…"));
            }
          },
        });
        uploadMeta = {
          resumable: true,
          chunk_size_mb: result.chunkSizeMb,
          retries: result.retries,
          resumed_from_previous: result.resumedFromPrevious,
        };
      } catch (uploadError) {
        const msg = uploadError instanceof Error ? uploadError.message : String(uploadError);
        const isAuth = /not authenticated|unauthorized|401|403/i.test(msg);
        if (isAuth) {
          setUploadAuthFailed(true);
          setPendingRetryFile(uploadFile);
          setPendingRetryJobId(newJobId);
          setStep("failed");
          setProcessing(false);
          if (longFileToastRef.current) {
            clearTimeout(longFileToastRef.current);
            longFileToastRef.current = null;
          }
          return; // Don't mark job failed — let the user retry upload.
        }
        throw new Error(`Upload failed: ${msg}`);
      }

      const txConfig: Record<string, unknown> = {
        audio_enhancement: enhancementMeta,
        upload: uploadMeta,
      };
      if (channelAnalysis) {
        txConfig.channel_analysis = {
          detected_channel_count: channelAnalysis.detectedChannelCount,
          header_channel_count: channelAnalysis.headerChannelCount,
          decoded_channel_count: channelAnalysis.decodedChannelCount,
          route_hint: channelAnalysis.routeHint,
          reason: channelAnalysis.reason,
          correlation: channelAnalysis.correlation,
          active_window_count: channelAnalysis.activeWindowCount,
          dominant_window_ratio: channelAnalysis.dominantWindowRatio,
        };
      }

      // ── 4. Persist the upload + tx config on the job row. We do NOT flip
      // status to "processing" yet — the language-gate runs first so the
      // user can confirm or override the detected language before the
      // (expensive) full transcription begins.
      const { error: updateError } = await supabase
        .from("jobs")
        .update({
          processing_stage: "detecting_language",
          temp_file_path: filePath,
          transcription_config: txConfig,
        } as any)
        .eq("id", newJobId);

      if (updateError) {
        throw new Error(updateError.message || "Could not finalize job");
      }

      // Clear the long-file toast — local pipeline is done, backend takes over.
      if (longFileToastRef.current) {
        clearTimeout(longFileToastRef.current);
        longFileToastRef.current = null;
      }

      // ── 5. Language gate. Skip if the user already picked a language
      // manually — their explicit choice always wins. Also skip on failure
      // (we just fall through to the existing in-call detection in the
      // transcribe function). ──
      let finalLanguage = language;
      if (language === "auto") {
        setStep("detecting");
        setLanguageDetectStatus(null);

        // Timeout + retry. The edge function targets ~25s upstream; we cap
        // each client attempt at 35s, then retry once with extend_preview=true
        // for very short / inconclusive recordings.
        type DetectPayload = {
          status?: "success" | "skipped" | "failed";
          language?: string | null;
          reason?: string;
          fallback?: boolean;
        };

        const PER_ATTEMPT_MS = 35_000;
        const MAX_ATTEMPTS = 2;

        const callDetect = async (extendPreview: boolean): Promise<{
          payload: DetectPayload | null;
          diag: Record<string, unknown> | null;
        }> => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), PER_ATTEMPT_MS);
          try {
            const res = await supabase.functions.invoke("detect-language", {
              body: { job_id: newJobId, extend_preview: extendPreview },
            });
            clearTimeout(timer);
            if (res.error) {
              // FunctionsHttpError exposes context.status on most failures;
              // 404 → not deployed, 5xx → runtime error inside the function.
              const ctx = (res.error as { context?: { status?: number } } | null)?.context;
              const status = ctx?.status ?? null;
              const errType = status === 404 ? "deployment" : "runtime";
              return {
                payload: null,
                diag: {
                  invoke_error: {
                    type: errType,
                    status_code: status,
                    message: res.error.message ?? String(res.error),
                    extend_preview: extendPreview,
                    timestamp: new Date().toISOString(),
                  },
                },
              };
            }
            return { payload: (res.data ?? null) as DetectPayload | null, diag: null };
          } catch (err) {
            clearTimeout(timer);
            const aborted = (err as { name?: string })?.name === "AbortError";
            return {
              payload: null,
              diag: {
                invoke_error: {
                  type: aborted ? "timeout" : "network",
                  status_code: null,
                  message: err instanceof Error ? err.message : String(err),
                  extend_preview: extendPreview,
                  timestamp: new Date().toISOString(),
                },
              },
            };
          }
        };

        let detectStatus: "success" | "skipped" | "failed" = "failed";
        let detected: string | null = null;
        let detectReason: string | undefined;
        const attempts: Array<Record<string, unknown>> = [];

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          const extend = attempt > 0; // second pass widens the preview window
          const { payload, diag } = await callDetect(extend);
          attempts.push({
            attempt: attempt + 1,
            extend_preview: extend,
            ok: !!payload,
            payload_status: payload?.status ?? null,
            ...(diag ?? {}),
          });

          if (payload?.status === "success" && payload.language) {
            detectStatus = "success";
            detected = payload.language;
            detectReason = undefined;
            break;
          }
          if (payload?.status === "skipped") {
            // Inconclusive — keep going to the extended-preview retry.
            detectStatus = "skipped";
            detectReason = payload.reason ?? "inconclusive";
            if (attempt === MAX_ATTEMPTS - 1) break;
            continue;
          }
          // Failed (function-level) or invoke error — retry once, then bail.
          detectStatus = "failed";
          detectReason = payload?.reason ?? (diag ? "invoke_error" : "unknown");
          if (attempt === MAX_ATTEMPTS - 1) break;
        }

        // Persist client-side diagnostics so admins can troubleshoot 404s,
        // timeouts, or runtime errors per job.
        try {
          await supabase
            .from("jobs")
            .update({
              language_detection_diagnostics: {
                attempts,
                final_status: detectStatus,
                final_language: detected,
                reason: detectReason ?? null,
                client_recorded_at: new Date().toISOString(),
              },
            } as any)
            .eq("id", newJobId);
        } catch (diagErr) {
          console.warn("[convert] could not write detection diagnostics:", diagErr);
        }

        setLanguageDetectStatus({ status: detectStatus, language: detected, reason: detectReason });

        if (detectStatus === "success") {
          // Open the gate so the user can confirm/override.
          finalLanguage = await new Promise<string>((resolve) => {
            setLanguageGate({ detected, resolve });
          });
          setLanguageGate(null);
        } else {
          // Skipped or failed — never block the user. Fall through to the
          // transcribe function which still does its own in-call detection.
          finalLanguage = "auto";
        }
      }

      // Persist the user's final choice + mark the gate as confirmed so the
      // backend transcription uses it.
      await supabase
        .from("jobs")
        .update({
          language_selected: finalLanguage,
          language_preview_confirmed: true,
          status: "processing" as const,
          processing_stage: "queued",
        } as any)
        .eq("id", newJobId);

      setStep("transcribing");

      const { error: fnError } = await supabase.functions.invoke("process-job", {
        body: { job_id: newJobId, custom_prompt: customPrompt || null },
      });

      if (fnError) {
        console.error("process-job invoke error:", fnError);
      }
    } catch (error) {
      console.error("Convert error:", error);
      if (longFileToastRef.current) {
        clearTimeout(longFileToastRef.current);
        longFileToastRef.current = null;
      }
      // Mark the row failed so watchdog/Admin/poller all stay consistent.
      try {
        await supabase
          .from("jobs")
          .update({
            status: "failed" as const,
            error_message: error instanceof Error ? error.message : "An unknown error occurred.",
          } as any)
          .eq("id", newJobId);
      } catch (markErr) {
        console.warn("Could not mark job failed:", markErr);
      }
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
    setEnhanceSubstage(null);
    setErrorMessage(null);
    setUploadAuthFailed(false);
    setPendingRetryFile(null);
    setPendingRetryJobId(null);
    setJobId(null);
    setLanguageDetectStatus(null);
    // If a language gate was open, resolve it with auto so any in-flight
    // promise unblocks (it will be ignored by the failed pipeline anyway).
    if (languageGate) {
      try { languageGate.resolve("auto"); } catch { /* ignore */ }
      setLanguageGate(null);
    }
    if (pollRef.current) clearInterval(pollRef.current);
    if (longFileToastRef.current) {
      clearTimeout(longFileToastRef.current);
      longFileToastRef.current = null;
    }
  };

  const handleRetryUpload = async () => {
    const retryFile = pendingRetryFile;
    const retryJobId = pendingRetryJobId;
    if (!retryFile || !retryJobId || !user) return;

    setUploadAuthFailed(false);
    setErrorMessage(null);
    setStep("uploading");
    setProcessing(true);

    // Re-validate session before retrying.
    {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session?.access_token) {
        const { data: r } = await supabase.auth.refreshSession();
        if (!r.session?.access_token) {
          toast.error(t("convert.sessionExpired", "Your session expired during processing. Please sign in again to upload."));
          setUploadAuthFailed(true);
          setStep("failed");
          setProcessing(false);
          navigate("/login");
          return;
        }
      }
    }

    const safeUploadName = sanitizeStorageFilename(retryFile.name);
    const filePath = `${user.id}/${retryJobId}/${safeUploadName}`;

    let uploadMeta: {
      resumable: boolean;
      chunk_size_mb: number;
      retries: number;
      resumed_from_previous: boolean;
    };

    try {
      const result = await resumableUpload({
        bucketName: "temp-audio",
        objectName: filePath,
        file: retryFile,
        jobId: retryJobId,
        onChunkComplete: () => {
          void supabase
            .from("jobs")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", retryJobId);
        },
        onRetry: (attempt) => {
          if (attempt === 1) {
            toast.info(t("convert.uploadPausedRetrying", "Upload paused — retrying…"));
          }
        },
      });
      uploadMeta = {
        resumable: true,
        chunk_size_mb: result.chunkSizeMb,
        retries: result.retries,
        resumed_from_previous: result.resumedFromPrevious,
      };
    } catch (uploadError) {
      const msg = uploadError instanceof Error ? uploadError.message : String(uploadError);
      const isAuth = /not authenticated|unauthorized|401|403/i.test(msg);
      if (isAuth) {
        setUploadAuthFailed(true);
        setStep("failed");
        setProcessing(false);
        if (longFileToastRef.current) {
          clearTimeout(longFileToastRef.current);
          longFileToastRef.current = null;
        }
        return;
      }
      throw new Error(`Upload failed: ${msg}`);
    }

    // ── Post-upload continuation: same as handleConvert from this point. ──
    // We don't have enhancementMeta here (it's local to handleConvert), so
    // we leave the existing transcription_config untouched — the prior
    // enhancement metadata is already stored on the job row from the
    // first attempt.
    const { error: updateError } = await supabase
      .from("jobs")
      .update({
        processing_stage: "detecting_language",
        temp_file_path: filePath,
      } as any)
      .eq("id", retryJobId);

    if (updateError) {
      throw new Error(updateError.message || "Could not finalize job");
    }

    if (longFileToastRef.current) {
      clearTimeout(longFileToastRef.current);
      longFileToastRef.current = null;
    }

    let finalLanguage = language;
    if (language === "auto") {
      setStep("detecting");
      setLanguageDetectStatus(null);

      const MAX_ATTEMPTS = 2;
      const TIMEOUT_MS = 35_000;
      let detected: string | null = null;
      let detectStatus: "success" | "skipped" | "failed" = "failed";
      let detectReason: string | null = null;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let diag: string | null = null;
        let payload: Record<string, unknown> | null = null;
        try {
          const { data, error } = await supabase.functions.invoke("detect-language", {
            body: { job_id: retryJobId, extend_preview: attempt > 0 },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          payload = (data ?? {}) as Record<string, unknown>;
          if (!error && payload.language) {
            detected = String(payload.language);
            detectStatus = "success";
            break;
          }
          if (payload?.skipped) {
            detectStatus = "skipped";
            detectReason = payload.reason ? String(payload.reason) : null;
            break;
          }
          diag = payload?.diagnostic ? String(payload.diagnostic) : null;
        } catch (e) {
          clearTimeout(timeoutId);
          diag = e instanceof Error ? e.message : String(e);
        }

        detectStatus = "failed";
        detectReason = payload?.reason ?? (diag ? "invoke_error" : "unknown");
        if (attempt === MAX_ATTEMPTS - 1) break;
      }

      try {
        await supabase
          .from("jobs")
          .update({
            language_detection_diagnostics: {
              attempts: MAX_ATTEMPTS,
              final_status: detectStatus,
              final_language: detected,
              reason: detectReason ?? null,
              client_recorded_at: new Date().toISOString(),
            },
          } as any)
          .eq("id", retryJobId);
      } catch (diagErr) {
        console.warn("[convert] could not write detection diagnostics:", diagErr);
      }

      setLanguageDetectStatus({ status: detectStatus, language: detected, reason: detectReason });

      if (detectStatus === "success") {
        finalLanguage = await new Promise<string>((resolve) => {
          setLanguageGate({ detected, resolve });
        });
        setLanguageGate(null);
      } else {
        finalLanguage = "auto";
      }
    }

    await supabase
      .from("jobs")
      .update({
        language_selected: finalLanguage,
        language_preview_confirmed: true,
        status: "processing" as const,
        processing_stage: "queued",
      } as any)
      .eq("id", retryJobId);

    setStep("transcribing");

    const { error: fnError } = await supabase.functions.invoke("process-job", {
      body: { job_id: retryJobId, custom_prompt: customPrompt || null },
    });

    if (fnError) {
      console.error("process-job invoke error:", fnError);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter-flat relative overflow-hidden">
      <JsonLd data={CONVERT_BREADCRUMB_SCHEMA} />
      {languageGate && (
        <LanguageGate
          detected={languageGate.detected}
          onConfirm={(lang) => languageGate.resolve(lang)}
        />
      )}
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
                    {(["enhancing", "uploading", "detecting", "transcribing", "summarising", "completed"] as ProcessingStep[]).map((s) => {
                      const allSteps: ProcessingStep[] = ["enhancing", "uploading", "detecting", "transcribing", "summarising", "completed"];
                      const isCurrent = step === s;
                      const isPast = step !== "failed" && (
                        allSteps.indexOf(step!) > allSteps.indexOf(s)
                      );

                      return (
                        <div
                          key={s}
                          className={`flex flex-col gap-2 p-3 rounded-xl transition-all ${
                            isCurrent
                              ? "bg-primary/10 text-foreground"
                              : isPast
                                ? "text-muted-foreground"
                                : "text-muted-foreground/40"
                          }`}
                        >
                          <div className="flex items-center gap-3">
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
                          </div>
                          {s === "enhancing" && isCurrent && step !== "failed" && (
                            <div
                              aria-hidden="true"
                              className="h-0.5 w-full overflow-hidden rounded-full bg-primary/10 motion-reduce:bg-primary/30"
                            >
                              <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent animate-shimmer motion-reduce:animate-none motion-reduce:w-full motion-reduce:bg-primary/40 motion-reduce:bg-none" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {languageDetectStatus && step !== "failed" && step !== "completed" && (
                    <div
                      className={`flex items-start gap-2.5 p-3 rounded-xl text-body-sm max-w-md w-full border ${
                        languageDetectStatus.status === "success"
                          ? "bg-primary/5 border-primary/20 text-foreground"
                          : languageDetectStatus.status === "skipped"
                            ? "bg-muted/60 border-border text-foreground/80"
                            : "bg-warning/10 border-warning/30 text-foreground/90"
                      }`}
                      role="status"
                      aria-live="polite"
                    >
                      {languageDetectStatus.status === "success" ? (
                        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                      ) : languageDetectStatus.status === "skipped" ? (
                        <Info className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p>
                          {languageDetectStatus.status === "success" && languageDetectStatus.language
                            ? t("convert.langDetectSuccess", "Language detected: {{lang}}", {
                                lang: getLanguageLabel(languageDetectStatus.language),
                              })
                            : languageDetectStatus.status === "skipped"
                              ? t(
                                  "convert.langDetectSkipped",
                                  "Language detection skipped — recording was too short or unclear. We'll detect it during transcription.",
                                )
                              : t(
                                  "convert.langDetectFailed",
                                  "Language detection unavailable — continuing with auto-detect during transcription.",
                                )}
                        </p>
                        {languageDetectStatus.status !== "success" && languageDetectStatus.reason && (
                          <p className="mt-1 text-caption text-muted-foreground break-words">
                            {languageDetectStatus.reason === "low_confidence"
                              ? t(
                                  "convert.langDetectReasonLowConfidence",
                                  "Detection wasn't confident enough — pick a language manually or let auto-detect handle it during transcription.",
                                )
                              : languageDetectStatus.reason === "inconclusive"
                                ? t(
                                    "convert.langDetectReasonInconclusive",
                                    "Couldn't detect a language — recording may be too short, too quiet, or contain no speech.",
                                  )
                                : t("convert.langDetectReason", "Reason: {{reason}}", {
                                    reason: languageDetectStatus.reason,
                                  })}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {step !== "failed" && step !== "completed" && (
                    <div className="flex items-start gap-2.5 p-4 rounded-xl bg-primary/5 border border-primary/20 text-body-sm max-w-md">
                      <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                      <p className="text-foreground/90">
                        {t("convert.canLeavePage")}
                      </p>
                    </div>
                  )}

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
                {!file && (
                  <Tabs defaultValue="upload" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4 h-11">
                      <TabsTrigger value="upload" className="rounded-lg h-9">
                        <UploadIcon className="w-4 h-4 mr-2" />
                        {t("convert.tabUpload")}
                      </TabsTrigger>
                      <TabsTrigger value="record" className="rounded-lg h-9">
                        <Mic className="w-4 h-4 mr-2" />
                        {t("convert.tabRecord")}
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="upload" className="mt-0">
                      <AudioUploader onFileSelected={handleFileSelected} />
                    </TabsContent>
                    <TabsContent value="record" className="mt-0">
                      <DirectRecorder onRecordingReady={handleRecordingReady} />
                    </TabsContent>
                  </Tabs>
                )}

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
                          onClick={() => handleConvert()}
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
