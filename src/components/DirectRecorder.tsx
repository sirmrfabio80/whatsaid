import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mic, Pause, Play, Square, X, AlertCircle, Loader2, FileAudio, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { formatDuration } from "@/lib/pricing";

interface DirectRecorderProps {
  onRecordingReady: (file: File, durationSeconds: number) => void;
  disabled?: boolean;
}

export default function DirectRecorder({ onRecordingReady, disabled }: DirectRecorderProps) {
  const { t } = useTranslation();
  const recorder = useAudioRecorder();
  const [confirmCancel, setConfirmCancel] = useState(false);

  const elapsedSec = Math.floor(recorder.elapsedMs / 1000);
  const isActive =
    recorder.status === "recording" ||
    recorder.status === "paused" ||
    recorder.status === "interrupted";

  const handleStop = useCallback(async () => {
    const result = await recorder.stop();
    if (result) {
      onRecordingReady(result.file, result.durationSeconds);
      // Return to idle so the recorder UI resets — Convert.tsx now owns the file
      recorder.reset();
    }
  }, [onRecordingReady, recorder]);

  const handleCancelClick = useCallback(() => {
    if (recorder.elapsedMs > 0 || recorder.status !== "idle") {
      setConfirmCancel(true);
    } else {
      void recorder.cancel();
    }
  }, [recorder]);

  const confirmCancelYes = useCallback(async () => {
    setConfirmCancel(false);
    await recorder.cancel();
  }, [recorder]);

  // ── Unsupported ──────────────────────────────────────────────────────────
  if (recorder.status === "unsupported") {
    return (
      <div className="rounded-xl border border-border bg-muted/40 p-5 text-center">
        <AlertCircle className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
        <p className="text-body-sm text-foreground font-medium">
          {t("recorder.unsupportedTitle")}
        </p>
        <p className="text-caption text-muted-foreground mt-1">
          {t("recorder.unsupportedDesc")}
        </p>
      </div>
    );
  }

  // ── Idle ─────────────────────────────────────────────────────────────────
  if (recorder.status === "idle") {
    return (
      <div className="rounded-xl bg-muted/50 border-2 border-dashed border-border p-8 sm:p-10 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Mic className="w-8 h-8 text-primary" />
          </div>
          <div>
            <p className="text-h3">{t("recorder.readyTitle")}</p>
            <p className="text-muted-foreground text-body-sm mt-1">{t("recorder.readyDesc")}</p>
          </div>
          <Button
            size="lg"
            className="rounded-xl h-12 px-6 mt-2"
            onClick={() => void recorder.start()}
            disabled={disabled}
          >
            <Mic className="w-4 h-4 mr-2" />
            {t("recorder.startButton")}
          </Button>
        </div>
        <p className="text-caption text-muted-foreground mt-4 flex items-start gap-1.5 justify-center">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {t("recorder.wakeLockHint")}
        </p>
      </div>
    );
  }

  // ── Requesting ──────────────────────────────────────────────────────────
  if (recorder.status === "requesting") {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto mb-3" />
        <p className="text-body font-medium">{t("recorder.requestingTitle")}</p>
        <p className="text-body-sm text-muted-foreground mt-1">{t("recorder.requestingDesc")}</p>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────
  if (recorder.status === "error") {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center">
        <AlertCircle className="w-5 h-5 text-destructive mx-auto mb-2" />
        <p className="text-body-sm font-medium text-destructive">
          {recorder.errorCode === "permission_denied"
            ? t("recorder.errorPermissionTitle")
            : recorder.errorCode === "no_mic"
              ? t("recorder.errorNoMicTitle")
              : t("recorder.errorGenericTitle")}
        </p>
        {recorder.errorMessage && (
          <p className="text-caption text-destructive/80 mt-1">{recorder.errorMessage}</p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg mt-4"
          onClick={() => void recorder.cancel()}
        >
          {t("common.tryAgain")}
        </Button>
      </div>
    );
  }

  // ── Processing ──────────────────────────────────────────────────────────
  if (recorder.status === "processing") {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto mb-3" />
        <p className="text-body font-medium">{t("recorder.processingTitle")}</p>
        <p className="text-body-sm text-muted-foreground mt-1">{t("recorder.processingDesc")}</p>
      </div>
    );
  }

  // ── Ready (briefly visible before parent takes over) ────────────────────
  if (recorder.status === "ready") {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-center">
        <FileAudio className="w-5 h-5 text-primary mx-auto mb-2" />
        <p className="text-body-sm font-medium">{t("recorder.readyHandoff")}</p>
      </div>
    );
  }

  // ── Recording / Paused / Interrupted ────────────────────────────────────
  const isPaused = recorder.status === "paused" || recorder.status === "interrupted";
  const interrupted = recorder.status === "interrupted";

  // Level meter: 14 segments
  const segments = 14;
  const lit = Math.min(segments, Math.round(recorder.levelRms * segments * 2.2));

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-col items-center gap-5">
          {/* Status pill */}
          <div className="flex items-center gap-2">
            <span
              className={`relative inline-flex w-2 h-2 rounded-full ${
                interrupted
                  ? "bg-warning"
                  : isPaused
                    ? "bg-muted-foreground"
                    : "bg-destructive"
              }`}
              aria-hidden="true"
            >
              {!isPaused && (
                <span className="motion-safe:animate-ping absolute inset-0 rounded-full bg-destructive opacity-75 motion-reduce:hidden" />
              )}
            </span>
            <span className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
              {interrupted
                ? t("recorder.statusInterrupted")
                : isPaused
                  ? t("recorder.statusPaused")
                  : t("recorder.statusRecording")}
            </span>
          </div>

          {/* Elapsed */}
          <div
            className="font-mono text-4xl sm:text-5xl tabular-nums"
            aria-live="polite"
            aria-atomic="true"
          >
            {formatDuration(elapsedSec)}
          </div>

          {/* Level meter */}
          <div
            className="flex items-end gap-1 h-8 w-full max-w-xs justify-center"
            aria-hidden="true"
          >
            {Array.from({ length: segments }).map((_, i) => {
              const active = !isPaused && i < lit;
              const height = 30 + (i / segments) * 50;
              return (
                <span
                  key={i}
                  className={`w-1.5 rounded-full transition-colors ${
                    active ? "bg-primary" : "bg-muted"
                  }`}
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </div>

          {/* Interrupted hint */}
          {interrupted && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-body-sm w-full">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
              <span>{recorder.errorMessage ?? t("recorder.interruptedHint")}</span>
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-center gap-2 w-full">
            {isPaused ? (
              <Button
                size="lg"
                className="rounded-xl h-12 min-w-[7rem]"
                onClick={() => recorder.resume()}
              >
                <Play className="w-4 h-4 mr-2" />
                {t("recorder.resume")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="lg"
                className="rounded-xl h-12 min-w-[7rem]"
                onClick={() => recorder.pause()}
              >
                <Pause className="w-4 h-4 mr-2" />
                {t("recorder.pause")}
              </Button>
            )}
            <Button
              size="lg"
              variant="default"
              className="rounded-xl h-12 min-w-[7rem]"
              onClick={() => void handleStop()}
            >
              <Square className="w-4 h-4 mr-2" />
              {t("recorder.stop")}
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="rounded-xl h-12 min-w-[7rem]"
              onClick={handleCancelClick}
            >
              <X className="w-4 h-4 mr-2" />
              {t("recorder.cancel")}
            </Button>
          </div>

          <p className="text-caption text-muted-foreground text-center flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {t("recorder.wakeLockHint")}
          </p>
        </div>
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("recorder.discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("recorder.discardDesc", { time: formatDuration(elapsedSec) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("recorder.discardKeep")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmCancelYes()}>
              {t("recorder.discardConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
