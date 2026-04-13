import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

export interface TranscriptionConfig {
  strategy?: string;
  speakers_expected?: number;
  keyterms?: string[];
  /** @deprecated Legacy field kept for backward compatibility */
  profile?: string;
}

interface TranscriptionSettingsProps {
  value: TranscriptionConfig;
  onChange: (config: TranscriptionConfig) => void;
  disabled?: boolean;
}

const STRATEGIES = [
  { value: "balanced", labelKey: "transcriptionSettings.strategyBalanced", descKey: "transcriptionSettings.strategyBalancedDesc" },
  { value: "recovery", labelKey: "transcriptionSettings.strategyRecovery", descKey: "transcriptionSettings.strategyRecoveryDesc" },
  { value: "review", labelKey: "transcriptionSettings.strategyReview", descKey: "transcriptionSettings.strategyReviewDesc" },
  { value: "keyterms", labelKey: "transcriptionSettings.strategyKeyterms", descKey: "transcriptionSettings.strategyKeytermsDesc" },
] as const;

const SPEAKER_OPTIONS = [
  { value: "auto", labelKey: "transcriptionSettings.speakersAuto" },
  { value: "2", labelKey: "transcriptionSettings.speakers2" },
  { value: "3", labelKey: "transcriptionSettings.speakers3" },
  { value: "4", labelKey: "transcriptionSettings.speakers4" },
] as const;

export default function TranscriptionSettings({ value, onChange, disabled }: TranscriptionSettingsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const currentStrategy = value.strategy || "balanced";
  const currentSpeakers = value.speakers_expected?.toString() || "auto";
  const currentKeyterms = value.keyterms?.join(", ") || "";

  const handleStrategyChange = (strategy: string) => {
    const next: TranscriptionConfig = { ...value };
    if (strategy === "balanced") {
      delete next.strategy;
    } else {
      next.strategy = strategy;
    }
    // Clear keyterms when switching away from keyterms mode
    if (strategy !== "keyterms") {
      delete next.keyterms;
    }
    onChange(next);
  };

  const handleSpeakersChange = (speakers: string) => {
    const next: TranscriptionConfig = { ...value };
    if (speakers === "auto") {
      delete next.speakers_expected;
    } else {
      next.speakers_expected = parseInt(speakers, 10);
    }
    onChange(next);
  };

  const handleKeytermsChange = (text: string) => {
    const next: TranscriptionConfig = { ...value };
    const terms = text.split(",").map(s => s.trim()).filter(Boolean);
    if (terms.length > 0) {
      next.keyterms = terms;
    } else {
      delete next.keyterms;
    }
    onChange(next);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-1"
        disabled={disabled}
      >
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
        />
        <span className="font-medium">{t("transcriptionSettings.title")}</span>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
        {/* Strategy selector */}
        <div className="space-y-2">
          <Label htmlFor="transcription-strategy" className="text-sm">
            {t("transcriptionSettings.strategyLabel")}
          </Label>
          <Select value={currentStrategy} onValueChange={handleStrategyChange} disabled={disabled}>
            <SelectTrigger id="transcription-strategy" className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STRATEGIES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {t(s.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t(STRATEGIES.find(s => s.value === currentStrategy)?.descKey || "transcriptionSettings.strategyBalancedDesc")}
          </p>
        </div>

        {/* Keyterms input — only for keyterms strategy */}
        {currentStrategy === "keyterms" && (
          <div className="space-y-2">
            <Label htmlFor="keyterms-input" className="text-sm">
              {t("transcriptionSettings.keytermsLabel")}
            </Label>
            <Textarea
              id="keyterms-input"
              value={currentKeyterms}
              onChange={(e) => handleKeytermsChange(e.target.value)}
              placeholder={t("transcriptionSettings.keytermsPlaceholder")}
              className="rounded-xl min-h-[80px] text-sm"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              {t("transcriptionSettings.keytermsHelp")}
            </p>
          </div>
        )}

        {/* Speaker count */}
        <div className="space-y-2">
          <Label htmlFor="speaker-count" className="text-sm">
            {t("transcriptionSettings.speakersLabel")}
          </Label>
          <Select value={currentSpeakers} onValueChange={handleSpeakersChange} disabled={disabled}>
            <SelectTrigger id="speaker-count" className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPEAKER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t("transcriptionSettings.speakersHelp")}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
