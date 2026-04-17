import { ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TranscribeTemplateConfig,
  DefaultStrategy,
} from "@/lib/transcribe-template";

interface Props {
  value: TranscribeTemplateConfig;
  onChange: (next: TranscribeTemplateConfig) => void;
  disabled?: boolean;
}

/**
 * Form editor for a TranscribeTemplateConfig. Pure controlled component:
 * it never persists anything — the parent decides when/how to save.
 */
export default function TemplateEditor({ value, onChange, disabled }: Props) {
  const set = <K extends keyof TranscribeTemplateConfig>(
    key: K,
    v: TranscribeTemplateConfig[K],
  ) => onChange({ ...value, [key]: v });

  const onNumber =
    (key: keyof TranscribeTemplateConfig) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      const n = Number(e.target.value);
      if (Number.isFinite(n)) set(key, n as never);
    };

  return (
    <div className="space-y-8">
      <Section title="Endpoint">
        <Field label="Base URL" hint="AssemblyAI API region endpoint.">
          <Input
            value={value.base_url}
            onChange={(e) => set("base_url", e.target.value)}
            disabled={disabled}
          />
        </Field>
      </Section>

      <Section title="Model">
        <Field
          label="Speech models"
          hint="Comma-separated list, in order of preference (e.g. universal-3-pro)."
        >
          <Input
            value={value.speech_models.join(", ")}
            onChange={(e) =>
              set(
                "speech_models",
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            disabled={disabled}
          />
        </Field>
      </Section>

      <Section title="Core parameters">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Temperature" hint="0 = deterministic.">
            <Input
              type="number"
              step="0.1"
              value={value.temperature}
              onChange={onNumber("temperature")}
              disabled={disabled}
            />
          </Field>
          <Field
            label="Speech threshold"
            hint="Min. speech ratio required to accept the transcription."
          >
            <Input
              type="number"
              step="0.01"
              value={value.speech_threshold}
              onChange={onNumber("speech_threshold")}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>

      <Section title="Diarization & channels">
        <div className="grid sm:grid-cols-2 gap-4">
          <ToggleField
            label="Speaker labels (mono diarization)"
            hint="Diarize a single mixed channel."
            checked={value.speaker_labels}
            onChange={(v) => set("speaker_labels", v)}
            disabled={disabled}
          />
          <ToggleField
            label="Multichannel routing"
            hint="Use when speakers are isolated on separate channels."
            checked={value.multichannel}
            onChange={(v) => set("multichannel", v)}
            disabled={disabled}
          />
        </div>
      </Section>

      <Section title="Language">
        <div className="grid sm:grid-cols-2 gap-4">
          <ToggleField
            label="Language auto-detection"
            hint="When no language is selected on the job."
            checked={value.language_detection}
            onChange={(v) => set("language_detection", v)}
            disabled={disabled}
          />
          <Field
            label="Language confidence threshold"
            hint="Reject detection below this confidence."
          >
            <Input
              type="number"
              step="0.05"
              value={value.language_confidence_threshold}
              onChange={onNumber("language_confidence_threshold")}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>

      <Section title="Prompting">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Default strategy">
            <Select
              value={value.default_strategy}
              onValueChange={(v) =>
                set("default_strategy", v as DefaultStrategy)
              }
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recovery">Recovery</SelectItem>
                <SelectItem value="review">Review</SelectItem>
                <SelectItem value="keyterms">Keyterms</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <ToggleField
            label="Apply prompt on diarization route"
            hint="Off by default — prompts collapse Speaker B in mono diarization."
            checked={value.apply_prompt_on_diarization}
            onChange={(v) => set("apply_prompt_on_diarization", v)}
            disabled={disabled}
          />
        </div>
        <Field label="Recovery prompt">
          <Textarea
            value={value.recovery_prompt}
            onChange={(e) => set("recovery_prompt", e.target.value)}
            rows={5}
            disabled={disabled}
          />
        </Field>
        <Field label="Review prompt">
          <Textarea
            value={value.review_prompt}
            onChange={(e) => set("review_prompt", e.target.value)}
            rows={6}
            disabled={disabled}
          />
        </Field>
        <ToggleField
          label="Disfluencies"
          hint="Forces universal-2 fallback — usually leave off."
          checked={value.disfluencies}
          onChange={(v) => set("disfluencies", v)}
          disabled={disabled}
        />
      </Section>

      <Section title="Polling">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Poll interval (ms)">
            <Input
              type="number"
              step="500"
              value={value.poll_interval_ms}
              onChange={onNumber("poll_interval_ms")}
              disabled={disabled}
            />
          </Field>
          <Field label="Max poll attempts">
            <Input
              type="number"
              step="1"
              value={value.max_polls}
              onChange={onNumber("max_polls")}
              disabled={disabled}
            />
          </Field>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-3">
      <div className="space-y-1">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}
