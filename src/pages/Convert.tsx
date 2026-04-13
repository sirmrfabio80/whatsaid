import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import AudioUploader from "@/components/AudioUploader";
import JobResults from "@/components/JobResults";
import LanguageSelector from "@/components/LanguageSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { creditsForDuration, formatDuration } from "@/lib/pricing";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowRight, FileAudio, Clock, Loader2, CheckCircle2, AlertCircle, FileText, Info
} from "lucide-react";
import { Link } from "react-router-dom";
import type { AudioCreationDateResult } from "@/lib/audio-creation-date";

type ProcessingStep = "uploading" | "transcribing" | "summarising" | "completed" | "failed";

export default function Convert() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [fileCreationDate, setFileCreationDate] = useState<AudioCreationDateResult | null>(null);
  const [audioChannels, setAudioChannels] = useState<number | null>(null);
  const [language, setLanguage] = useState("auto");
  const [customPrompt, setCustomPrompt] = useState("");
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<ProcessingStep | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [consentChecked, setConsentChecked] = useState(false);
  const credits = creditsForDuration(duration);

  const STEP_LABELS: Record<ProcessingStep, string> = {
    uploading: t("convert.stepUploading"),
    transcribing: t("convert.stepTranscribing"),
    summarising: t("convert.stepSummarising"),
    completed: t("convert.stepCompleted"),
    failed: t("convert.stepFailed"),
  };

  const handleFileSelected = useCallback((f: File, dur: number, creationDate: AudioCreationDateResult | null, channels: number | null) => {
    setFile(f);
    setDuration(dur);
    setFileCreationDate(creationDate);
    setAudioChannels(channels);
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

  const handleConvert = async () => {
    if (!file || !user) return;

    setProcessing(true);
    setStep("uploading");
    setErrorMessage(null);

    try {
      const newJobId = crypto.randomUUID();
      const filePath = `${user.id}/${newJobId}/${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("temp-audio")
        .upload(filePath, file, { upsert: false });

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
          audio_channels: audioChannels,
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
    setAudioChannels(null);
    setLanguage("auto");
    setCustomPrompt("");
    setProcessing(false);
    setStep(null);
    setErrorMessage(null);
    setJobId(null);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      <div className="container mx-auto px-4 py-10 sm:py-14">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight mb-2">{t("convert.title")}</h1>
            <p className="text-muted-foreground">{t("convert.subtitle")}</p>
          </div>

          {processing || step === "failed" ? (
            <Card className="rounded-xl border-border/50 bg-card shadow-sm mb-6">
              <CardContent className="p-8 sm:p-12">
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className="w-full max-w-sm space-y-4">
                    {(["uploading", "transcribing", "summarising", "completed"] as ProcessingStep[]).map((s) => {
                      const isCurrent = step === s;
                      const isPast = step !== "failed" && (
                        ["uploading", "transcribing", "summarising", "completed"].indexOf(step!) >
                        ["uploading", "transcribing", "summarising", "completed"].indexOf(s)
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
                            <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                          ) : isPast ? (
                            <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                          ) : step === "failed" && isCurrent ? (
                            <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-current shrink-0" />
                          )}
                          <span className={`text-sm font-medium ${isCurrent ? "text-foreground" : ""}`}>
                            {STEP_LABELS[s]}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {step === "failed" && errorMessage && (
                    <div className="flex items-start gap-2 p-4 rounded-xl bg-destructive/10 text-destructive text-sm max-w-sm">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {file && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
            <Card className="rounded-xl border-border/50 bg-card shadow-sm mb-6">
              <CardContent className="p-6 sm:p-8">
                <AudioUploader onFileSelected={handleFileSelected} />

                {file && duration > 0 && (
                  <div className="mt-6 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                      <FileAudio className="w-5 h-5 text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{formatDuration(duration)} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      <Button variant="ghost" size="sm" className="rounded-xl text-xs" onClick={handleReset}>
                        {t("common.change")}
                      </Button>
                    </div>

                    <div className="space-y-4">
                      <LanguageSelector value={language} onChange={setLanguage} />

                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="custom-prompt">
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
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          {t("convert.duration")}
                        </div>
                        <span className="text-sm font-medium">{formatDuration(duration)}</span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="recording-consent"
                        checked={consentChecked}
                        onCheckedChange={(c) => setConsentChecked(c === true)}
                        className="mt-0.5"
                      />
                      <label htmlFor="recording-consent" className="text-sm text-muted-foreground leading-snug cursor-pointer">
                        {t("convert.consentLabel")}
                      </label>
                    </div>

                    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {t("convert.thirdPartyNotice")}{" "}
                      <Link to="/terms" className="text-primary hover:underline" target="_blank">{t("convert.terms")}</Link>{" "}{t("convert.and")}{" "}
                      <Link to="/privacy" className="text-primary hover:underline" target="_blank">{t("convert.privacyPolicy")}</Link>.
                    </p>

                    {user ? (
                      <Button
                        className="w-full h-12 text-base font-medium rounded-xl"
                        size="lg"
                        onClick={handleConvert}
                        disabled={processing || !consentChecked}
                      >
                        {t("convert.convertNow")}<ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    ) : (
                      <div className="text-center space-y-3">
                        <p className="text-sm text-muted-foreground">
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
