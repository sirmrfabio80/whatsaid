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
import { cn } from "@/lib/utils";

interface Props {
  value: TranscribeTemplateConfig;
  onChange: (next: TranscribeTemplateConfig) => void;
  disabled?: boolean;
}

type DisabledInfo = { disabled: boolean; reason?: string };
type DisabledMap = {
  us_base_url: DisabledInfo;
  apply_prompt_on_diarization: DisabledInfo;
  recovery_prompt: DisabledInfo;
  review_prompt: DisabledInfo;
  apply_to_mono: DisabledInfo;
  apply_to_stereo: DisabledInfo;
  audio_normalise: DisabledInfo;
  audio_normalise_mode: DisabledInfo;
  audio_target_peak_dbfs: DisabledInfo;
  audio_target_rms_dbfs: DisabledInfo;
  audio_max_gain_db_mono: DisabledInfo;
  audio_max_gain_db_stereo: DisabledInfo;
  audio_noise_floor_dbfs: DisabledInfo;
  audio_soft_clip_threshold: DisabledInfo;
};

const MASTER_OFF_REASON =
  "Audio enhancement is OFF — enable the master switch above to configure.";
const NORMALISE_OFF_REASON = "Active only when normalisation is ON.";

function computeDisabled(value: TranscribeTemplateConfig): DisabledMap {
  const masterOff = !value.audio_enhancement_enabled;
  const normaliseOff = !value.audio_normalise;
  const monoOff = !value.audio_enhancement_apply_to_mono;
  const stereoOff = !value.audio_enhancement_apply_to_stereo;

  // Mono/stereo gain caps: most-specific-wins (mono/stereo-off reason beats normalise reason).
  const monoGainDisabled = masterOff || normaliseOff || monoOff;
  const monoGainReason = masterOff
    ? MASTER_OFF_REASON
    : monoOff
      ? "Apply-to-mono is OFF — this gain cap has no effect."
      : normaliseOff
        ? NORMALISE_OFF_REASON
        : undefined;

  const stereoGainDisabled = masterOff || normaliseOff || stereoOff;
  const stereoGainReason = masterOff
    ? MASTER_OFF_REASON
    : stereoOff
      ? "Apply-to-stereo is OFF — this gain cap has no effect."
      : normaliseOff
        ? NORMALISE_OFF_REASON
        : undefined;

  const promptlessStrategy =
    value.default_strategy === "keyterms" || value.default_strategy === "none";

  return {
    us_base_url: {
      disabled: !value.geo_routing_enabled,
      reason: !value.geo_routing_enabled
        ? "Geo-routing is OFF — all requests use the default base URL."
        : undefined,
    },
    apply_prompt_on_diarization: {
      disabled: promptlessStrategy,
      reason: promptlessStrategy
        ? "No prose prompt configured — diarization-route policy has no effect."
        : undefined,
    },
    recovery_prompt: {
      disabled: value.default_strategy !== "recovery",
      reason:
        value.default_strategy !== "recovery"
          ? "Active only when Default strategy is Recovery."
          : undefined,
    },
    review_prompt: {
      disabled: value.default_strategy !== "review",
      reason:
        value.default_strategy !== "review"
          ? "Active only when Default strategy is Review."
          : undefined,
    },
    apply_to_mono: {
      disabled: masterOff,
      reason: masterOff ? MASTER_OFF_REASON : undefined,
    },
    apply_to_stereo: {
      disabled: masterOff,
      reason: masterOff ? MASTER_OFF_REASON : undefined,
    },
    audio_normalise: {
      disabled: masterOff,
      reason: masterOff ? MASTER_OFF_REASON : undefined,
    },
    audio_normalise_mode: {
      disabled: masterOff || normaliseOff,
      reason: masterOff
        ? MASTER_OFF_REASON
        : normaliseOff
          ? NORMALISE_OFF_REASON
          : undefined,
    },
    audio_target_peak_dbfs: {
      disabled: masterOff || normaliseOff,
      reason: masterOff
        ? MASTER_OFF_REASON
        : normaliseOff
          ? NORMALISE_OFF_REASON
          : undefined,
    },
    audio_target_rms_dbfs: {
      disabled: masterOff || normaliseOff || value.audio_normalise_mode !== "rms",
      reason: masterOff
        ? MASTER_OFF_REASON
        : normaliseOff
          ? NORMALISE_OFF_REASON
          : value.audio_normalise_mode !== "rms"
            ? "Active only when normalisation mode is RMS."
            : undefined,
    },
    audio_max_gain_db_mono: {
      disabled: monoGainDisabled,
      reason: monoGainReason,
    },
    audio_max_gain_db_stereo: {
      disabled: stereoGainDisabled,
      reason: stereoGainReason,
    },
    audio_noise_floor_dbfs: {
      disabled: masterOff,
      reason: masterOff ? MASTER_OFF_REASON : undefined,
    },
    audio_soft_clip_threshold: {
      disabled: masterOff,
      reason: masterOff ? MASTER_OFF_REASON : undefined,
    },
  };
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

  const d = computeDisabled(value);

  return (
    <div className="space-y-8">
      <Section title="Region routing">
        <ToggleField
          label="Enable geo-routing"
          hint="When ON, requests detected as coming from the US are sent to the US base URL; everyone else uses the default base URL. When OFF, all requests use the default base URL."
          checked={value.geo_routing_enabled}
          onChange={(v) => set("geo_routing_enabled", v)}
          disabled={disabled}
        />
        <Field
          label="Default base URL (non-US)"
          hint="Used for all requests when geo-routing is OFF, and for non-US requests when ON."
        >
          <Input
            value={value.base_url}
            onChange={(e) => set("base_url", e.target.value)}
            disabled={disabled}
          />
        </Field>
        <Field
          label="US base URL"
          hint="Used for US-detected requests when geo-routing is ON."
          disabledReason={d.us_base_url.reason}
          isDisabled={d.us_base_url.disabled}
        >
          <Input
            value={value.us_base_url}
            onChange={(e) => set("us_base_url", e.target.value)}
            disabled={disabled || d.us_base_url.disabled}
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
            disabled={disabled || d.apply_prompt_on_diarization.disabled}
            disabledReason={d.apply_prompt_on_diarization.reason}
          />
        </div>
        <EffectiveBehaviourBlock
          strategy={value.default_strategy}
          applyOnDiarization={value.apply_prompt_on_diarization}
        />
        <Field
          label="Recovery prompt"
          isDisabled={d.recovery_prompt.disabled}
          disabledReason={d.recovery_prompt.reason}
        >
          <Textarea
            value={value.recovery_prompt}
            onChange={(e) => set("recovery_prompt", e.target.value)}
            rows={5}
            disabled={disabled || d.recovery_prompt.disabled}
          />
        </Field>
        <Field
          label="Review prompt"
          isDisabled={d.review_prompt.disabled}
          disabledReason={d.review_prompt.reason}
        >
          <Textarea
            value={value.review_prompt}
            onChange={(e) => set("review_prompt", e.target.value)}
            rows={6}
            disabled={disabled || d.review_prompt.disabled}
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

      <Section title="Audio enhancement">
        <p className="text-xs text-muted-foreground -mt-2">
          Runs in the browser before upload. Decodes the audio with the Web Audio API,
          applies a soft-clip safety limiter, and (optionally) peak-normalises with a
          capped gain. Mono uploads are skipped by default because client-side
          normalisation can collapse AssemblyAI's diarizer on quiet single-mic audio.
        </p>
        <ToggleField
          label="Audio enhancement enabled"
          hint="Master switch. When OFF, audio is uploaded untouched regardless of channel layout."
          checked={value.audio_enhancement_enabled}
          onChange={(v) => set("audio_enhancement_enabled", v)}
          disabled={disabled}
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <ToggleField
            label="Apply to mono"
            hint="Off by default — risks collapsing diarization on quiet single-mic audio."
            checked={value.audio_enhancement_apply_to_mono}
            onChange={(v) => set("audio_enhancement_apply_to_mono", v)}
            disabled={disabled || d.apply_to_mono.disabled}
            disabledReason={d.apply_to_mono.reason}
          />
          <ToggleField
            label="Apply to stereo"
            hint="Recommended — stereo recordings benefit from the volume lift."
            checked={value.audio_enhancement_apply_to_stereo}
            onChange={(v) => set("audio_enhancement_apply_to_stereo", v)}
            disabled={disabled || d.apply_to_stereo.disabled}
            disabledReason={d.apply_to_stereo.reason}
          />
        </div>
        <ToggleField
          label="Run normalisation (peak boost)"
          hint="When OFF, only the soft-clip safety limiter runs — no volume change."
          checked={value.audio_normalise}
          onChange={(v) => set("audio_normalise", v)}
          disabled={disabled || d.audio_normalise.disabled}
          disabledReason={d.audio_normalise.reason}
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            label="Target peak (dBFS)"
            hint="Normalise pushes the loudest sample up to this level. -1 dBFS is a safe ceiling."
            isDisabled={d.audio_target_peak_dbfs.disabled}
            disabledReason={d.audio_target_peak_dbfs.reason}
          >
            <Input
              type="number"
              step="0.5"
              value={value.audio_target_peak_dbfs}
              onChange={onNumber("audio_target_peak_dbfs")}
              disabled={disabled || d.audio_target_peak_dbfs.disabled}
            />
          </Field>
          <Field
            label="Noise floor (dBFS)"
            hint="Below this RMS the file is considered near-silent and the enhancer skips processing."
            isDisabled={d.audio_noise_floor_dbfs.disabled}
            disabledReason={d.audio_noise_floor_dbfs.reason}
          >
            <Input
              type="number"
              step="1"
              value={value.audio_noise_floor_dbfs}
              onChange={onNumber("audio_noise_floor_dbfs")}
              disabled={disabled || d.audio_noise_floor_dbfs.disabled}
            />
          </Field>
          <Field
            label="Max gain — mono (dB)"
            hint="Cap on the volume boost applied to mono uploads."
            isDisabled={d.audio_max_gain_db_mono.disabled}
            disabledReason={d.audio_max_gain_db_mono.reason}
          >
            <Input
              type="number"
              step="1"
              min={0}
              max={36}
              value={value.audio_max_gain_db_mono}
              onChange={onNumber("audio_max_gain_db_mono")}
              disabled={disabled || d.audio_max_gain_db_mono.disabled}
            />
          </Field>
          <Field
            label="Max gain — stereo (dB)"
            hint="Cap on the volume boost applied to stereo uploads."
            isDisabled={d.audio_max_gain_db_stereo.disabled}
            disabledReason={d.audio_max_gain_db_stereo.reason}
          >
            <Input
              type="number"
              step="1"
              min={0}
              max={36}
              value={value.audio_max_gain_db_stereo}
              onChange={onNumber("audio_max_gain_db_stereo")}
              disabled={disabled || d.audio_max_gain_db_stereo.disabled}
            />
          </Field>
          <Field
            label="Soft-clip threshold"
            hint="Linear, 0.5–1.0. Samples above this are tanh-shaped to prevent harsh clipping."
            isDisabled={d.audio_soft_clip_threshold.disabled}
            disabledReason={d.audio_soft_clip_threshold.reason}
          >
            <Input
              type="number"
              step="0.05"
              min={0.5}
              max={1.0}
              value={value.audio_soft_clip_threshold}
              onChange={onNumber("audio_soft_clip_threshold")}
              disabled={disabled || d.audio_soft_clip_threshold.disabled}
            />
          </Field>
        </div>
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
  isDisabled,
  disabledReason,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  isDisabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <div className={cn("space-y-1.5", isDisabled && "opacity-80")}>
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {isDisabled && disabledReason && (
        <p className="text-xs italic text-muted-foreground/80">{disabledReason}</p>
      )}
    </div>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  onChange,
  disabled,
  disabledReason,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 rounded-lg border border-border/60 p-3",
        disabled && "bg-muted/20",
      )}
    >
      <div className={cn("space-y-1", disabled && "opacity-80")}>
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        {disabled && disabledReason && (
          <p className="text-xs italic text-muted-foreground/80">
            {disabledReason}
          </p>
        )}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

function EffectiveBehaviourBlock({
  strategy,
  applyOnDiarization,
}: {
  strategy: DefaultStrategy;
  applyOnDiarization: boolean;
}) {
  const strategyLabel: Record<DefaultStrategy, string> = {
    recovery: "Recovery",
    review: "Review",
    keyterms: "Keyterms",
    none: "None",
  };

  let effective: React.ReactNode;
  if (strategy === "recovery" || strategy === "review") {
    effective = applyOnDiarization ? (
      <>Prompt sent on <strong>multichannel</strong> and <strong>diarization (mono)</strong> jobs.</>
    ) : (
      <>
        Prompt sent on <strong>multichannel</strong> jobs only.{" "}
        <strong>Skipped on diarization (mono)</strong> by template policy — strategy
        label is still recorded for audit.
      </>
    );
  } else if (strategy === "keyterms") {
    effective = (
      <>No prose prompt sent. <code className="font-mono text-[11px]">keyterms_prompt</code> array attached on all routes.</>
    );
  } else {
    effective = <>No prompt attached on any route.</>;
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
      <div className="text-xs">
        <span className="uppercase tracking-wide text-muted-foreground">Configured strategy: </span>
        <span className="font-mono">{strategyLabel[strategy]}</span>
      </div>
      <div className="text-xs">
        <span className="uppercase tracking-wide text-muted-foreground">Effective prompt behaviour: </span>
        <span>{effective}</span>
      </div>
    </div>
  );
}
