import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export interface TranscriptionConfig {
  strategy?: string;
  speakers_expected?: number;
  keyterms?: string[];
  enhanceAudio?: boolean;
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
    <div className="space-y-4">
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

      {/* Audio enhancement toggle */}
      {(currentStrategy === "recovery" || value.profile === "phone_call") && (
        <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-muted/50">
          <div className="space-y-0.5">
            <Label htmlFor="enhance-audio" className="text-sm font-medium cursor-pointer">
              {t("transcriptionSettings.enhanceLabel")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("transcriptionSettings.enhanceHelp")}
            </p>
          </div>
          <Switch
            id="enhance-audio"
            checked={value.enhanceAudio ?? false}
            onCheckedChange={(checked) => onChange({ ...value, enhanceAudio: checked || undefined })}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
