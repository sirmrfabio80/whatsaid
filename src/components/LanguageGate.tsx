import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { getLanguageLabel, LANGUAGES } from "@/lib/languages";
import { Globe, Check, Languages } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InlineSpinner } from "@/components/ui/inline-spinner";

interface LanguageGateProps {
  /** ISO language code detected from the audio prefix, or null while still detecting / unknown. */
  detected: string | null;
  /** Resolve the gate with the user's chosen language code (e.g. "en", "it"). */
  onConfirm: (language: string) => void;
  /** Auto-confirm timeout in seconds. Pass 0 to disable. */
  autoConfirmSeconds?: number;
}

/**
 * Modal-style overlay shown after upload but before transcription, when the
 * user picked "Auto-detect". Surfaces the language we detected from the first
 * ~30s of audio and lets them confirm or override once. Auto-confirms after
 * a short countdown so the flow stays hands-off when the detection is right.
 */
export default function LanguageGate({
  detected,
  onConfirm,
  autoConfirmSeconds = 8,
}: LanguageGateProps) {
  const { t } = useTranslation();
  const [override, setOverride] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(autoConfirmSeconds);
  const [paused, setPaused] = useState(false);

  // Pause auto-confirm the moment the user interacts (opens the picker /
  // changes the value). They asked us to wait — wait.
  useEffect(() => {
    if (override !== null) setPaused(true);
  }, [override]);

  // Detection is still in progress: we don't show a countdown until we
  // actually have a language to confirm.
  const detecting = detected === null;
  const chosen = override ?? detected ?? "auto";

  useEffect(() => {
    if (detecting || paused || autoConfirmSeconds <= 0) return;
    if (secondsLeft <= 0) {
      onConfirm(chosen);
      return;
    }
    const id = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [secondsLeft, detecting, paused, autoConfirmSeconds, chosen, onConfirm]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="language-gate-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-lg space-y-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 shrink-0">
            <Globe className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 id="language-gate-title" className="text-lg font-medium">
              {detecting
                ? t("languageGate.detectingTitle", "Detecting language…")
                : t("languageGate.detectedTitle", "Detected language")}
            </h2>
            <p className="text-body-sm text-muted-foreground mt-1">
              {detecting
                ? t("languageGate.detectingBody", "Quickly checking the first few seconds of your audio.")
                : t("languageGate.detectedBody", "Confirm the language or pick a different one. Transcription will start automatically.")}
            </p>
          </div>
        </div>

        {detecting ? (
          <div className="flex items-center justify-center py-6">
            <InlineSpinner size="lg" tone="primary" />
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
              <Check className="w-5 h-5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-caption text-muted-foreground">
                  {t("languageGate.weHeard", "We heard")}
                </p>
                <p className="text-base font-medium truncate">
                  {detected ? getLanguageLabel(detected) : t("languageGate.unknown", "Could not detect")}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Languages className="w-4 h-4 text-muted-foreground" />
                {t("languageGate.changeLabel", "Use a different language")}
              </label>
              <Select
                value={override ?? detected ?? "auto"}
                onValueChange={(v) => setOverride(v)}
              >
                <SelectTrigger className="w-full" onPointerDown={() => setPaused(true)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.filter((l) => l.code !== "auto").map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
              <Button
                variant="outline"
                className="rounded-xl flex-1"
                onClick={() => setPaused((p) => !p)}
                aria-pressed={paused}
              >
                {paused
                  ? t("languageGate.resume", "Resume countdown")
                  : t("languageGate.pause", "Pause")}
              </Button>
              <Button
                className="rounded-xl flex-1"
                onClick={() => onConfirm(chosen)}
              >
                {paused || autoConfirmSeconds <= 0
                  ? t("languageGate.continue", "Continue")
                  : t("languageGate.continueIn", "Continue ({{n}}s)", { n: secondsLeft })}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
