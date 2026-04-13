import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState } from "react";

export interface TranscriptionConfig {
  profile?: string;
  speakers_expected?: number;
}

interface TranscriptionSettingsProps {
  value: TranscriptionConfig;
  onChange: (config: TranscriptionConfig) => void;
  disabled?: boolean;
}

const RECORDING_TYPES = [
  { value: "auto", labelKey: "transcriptionSettings.presetAutomatic" },
  { value: "phone_call", labelKey: "transcriptionSettings.presetPhoneCall" },
  { value: "meeting", labelKey: "transcriptionSettings.presetMeeting" },
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

  const currentPreset = value.profile || "auto";
  const currentSpeakers = value.speakers_expected?.toString() || "auto";

  const handlePresetChange = (preset: string) => {
    const next: TranscriptionConfig = { ...value };
    if (preset === "auto") {
      delete next.profile;
    } else {
      next.profile = preset;
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
        <div className="space-y-2">
          <Label htmlFor="recording-type" className="text-sm">
            {t("transcriptionSettings.presetLabel")}
          </Label>
          <Select value={currentPreset} onValueChange={handlePresetChange} disabled={disabled}>
            <SelectTrigger id="recording-type" className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RECORDING_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {t(type.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t("transcriptionSettings.presetHelp")}
          </p>
        </div>

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
