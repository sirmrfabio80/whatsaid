import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AudioUploader from "@/components/AudioUploader";
import JobResults from "@/components/JobResults";
import LanguageSelector from "@/components/LanguageSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { creditsForDuration, formatDuration } from "@/lib/pricing";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowRight, FileAudio, Clock, Loader2, CheckCircle2, AlertCircle, Mic, Sparkles, FileText
} from "lucide-react";

type ProcessingStep = "uploading" | "transcribing" | "summarising" | "completed" | "failed";

const STEP_LABELS: Record<ProcessingStep, string> = {
  uploading: "Uploading audio...",
  transcribing: "Transcribing with speaker labels...",
  summarising: "Generating summary & analysis...",
  completed: "Processing complete",
  failed: "Processing failed",
};

const STEP_ICONS: Record<ProcessingStep, typeof Loader2> = {
  uploading: Loader2,
  transcribing: Mic,
  summarising: Sparkles,
  completed: CheckCircle2,
  failed: AlertCircle,
};

export default function Convert() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [language, setLanguage] = useState("auto");
  const [customPrompt, setCustomPrompt] = useState("");
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<ProcessingStep | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const credits = creditsForDuration(duration);

  const handleFileSelected = useCallback((f: File, dur: number) => {
    setFile(f);
    setDuration(dur);
  }, []);

  // Poll job status
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
        // Check if transcript exists yet to differentiate transcribing vs summarising
        const { count } = await supabase
          .from("job_outputs")
          .select("id", { count: "exact", head: true })
          .eq("job_id", jobId)
          .eq("output_type", "transcript");

        setStep((count ?? 0) > 0 ? "summarising" : "transcribing");
      } else if (job.status === "completed") {
        setStep("completed");
        setProcessing(false);
        if (pollRef.current) clearInterval(pollRef.current);
      } else if (job.status === "failed") {
        setStep("failed");
        setErrorMessage(job.error_message || "An unknown error occurred.");
        setProcessing(false);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    };

    pollRef.current = setInterval(poll, 3000);
    poll(); // run immediately

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
      // 1. Build file path
      const newJobId = crypto.randomUUID();
      const filePath = `${user.id}/${newJobId}/${file.name}`;

      // 2. Upload audio to temp-audio bucket
      const { error: uploadError } = await supabase.storage
        .from("temp-audio")
        .upload(filePath, file, { upsert: false });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // 3. Create job row with temp_file_path already set
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
        });

      if (jobError) {
        throw new Error(jobError.message || "Could not create job");
      }

      setJobId(newJobId);

      setStep("transcribing");

      // 4. Call process-job edge function (fire and forget — we poll for status)
      const { error: fnError } = await supabase.functions.invoke("process-job", {
        body: { job_id: newJobId, custom_prompt: customPrompt || null },
      });

      if (fnError) {
        console.error("process-job invoke error:", fnError);
        // Don't throw — the edge function may still be running; polling will pick up status
      }
    } catch (error) {
      console.error("Convert error:", error);
      setStep("failed");
      setErrorMessage(error instanceof Error ? error.message : "An unknown error occurred.");
      setProcessing(false);
      toast({
        title: "Conversion failed",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    setFile(null);
    setDuration(0);
    setLanguage("auto");
    setCustomPrompt("");
    setProcessing(false);
    setStep(null);
    setErrorMessage(null);
    setJobId(null);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const isTerminal = step === "completed" || step === "failed";

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      <div className="container mx-auto px-4 py-12 sm:py-16">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight mb-2">Convert your audio</h1>
            <p className="text-muted-foreground">Upload a file to get a transcript, summary, and custom AI analysis.</p>
          </div>

          {/* Processing state */}
          {processing || isTerminal ? (
            <Card className="rounded-xl border-border/50 bg-card shadow-sm mb-6">
              <CardContent className="p-8 sm:p-12">
                <div className="flex flex-col items-center text-center space-y-6">
                  {/* Progress steps */}
                  <div className="w-full max-w-sm space-y-4">
                    {(["uploading", "transcribing", "summarising", "completed"] as ProcessingStep[]).map((s, i) => {
                      const Icon = STEP_ICONS[s];
                      const isCurrent = step === s;
                      const isPast = step !== "failed" && (
                        ["uploading", "transcribing", "summarising", "completed"].indexOf(step!) >
                        ["uploading", "transcribing", "summarising", "completed"].indexOf(s)
                      );
                      const isFailed = step === "failed" && s === (
                        // Show failure on the step that was active
                        ["uploading", "transcribing", "summarising"].find((_, idx) => idx === i) || "transcribing"
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
                          {isCurrent && !isTerminal ? (
                            <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                          ) : isPast || (isCurrent && step === "completed") ? (
                            <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                          ) : isFailed || (isCurrent && step === "failed") ? (
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

                  {/* Error message */}
                  {step === "failed" && errorMessage && (
                    <div className="flex items-start gap-2 p-4 rounded-xl bg-destructive/10 text-destructive text-sm max-w-sm">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {/* File info */}
                  {file && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileAudio className="w-4 h-4" />
                      <span className="truncate max-w-[200px]">{file.name}</span>
                      <span>· {formatDuration(duration)}</span>
                    </div>
                  )}

                  {/* Actions */}
                  {step === "completed" && jobId && (
                    <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                      <Button className="flex-1 rounded-xl" onClick={() => navigate(`/history`)}>
                        <FileText className="w-4 h-4 mr-2" />
                        View in history
                      </Button>
                      <Button variant="outline" className="flex-1 rounded-xl" onClick={handleReset}>
                        Convert another
                      </Button>
                    </div>
                  )}

                  {step === "failed" && (
                    <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                      <Button className="flex-1 rounded-xl" onClick={handleReset}>
                        Try again
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            /* Upload + configure form */
            <Card className="rounded-xl border-border/50 bg-card shadow-sm mb-6">
              <CardContent className="p-6 sm:p-8">
                <AudioUploader onFileSelected={handleFileSelected} />

                {file && duration > 0 && (
                  <div className="mt-6 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {/* File info */}
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                      <FileAudio className="w-5 h-5 text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{formatDuration(duration)} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      <Button variant="ghost" size="sm" className="rounded-xl text-xs" onClick={handleReset}>
                        Change
                      </Button>
                    </div>

                    {/* Configure */}
                    <div className="space-y-4">
                      <LanguageSelector value={language} onChange={setLanguage} />

                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="custom-prompt">
                          Custom AI prompt <span className="text-muted-foreground font-normal">(optional)</span>
                        </label>
                        <Textarea
                          id="custom-prompt"
                          placeholder="e.g. Extract all action items and who is responsible for each..."
                          value={customPrompt}
                          onChange={(e) => setCustomPrompt(e.target.value)}
                          className="rounded-xl resize-none min-h-[80px]"
                        />
                      </div>
                    </div>

                    {/* Confirm */}
                    <div className="p-4 rounded-xl bg-muted/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          Duration
                        </div>
                        <span className="text-sm font-medium">{formatDuration(duration)}</span>
                      </div>
                    </div>

                    {user ? (
                      <Button
                        className="w-full h-12 text-base font-medium rounded-xl"
                        size="lg"
                        onClick={handleConvert}
                        disabled={processing}
                      >
                        Convert now<ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    ) : (
                      <div className="text-center space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Sign in to convert your audio.
                        </p>
                        <Button className="w-full rounded-xl" onClick={() => navigate("/login")}>
                          Sign in
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
