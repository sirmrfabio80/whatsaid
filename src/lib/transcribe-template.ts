/**
 * Strongly typed AssemblyAI transcription template config.
 *
 * The shape of `config` for `transcribe_settings_templates` rows.
 * Validated on read (loadTemplateConfig) and on write (Admin UI save).
 *
 * Keep this in lockstep with the seeded "Default" template and with
 * `supabase/functions/transcribe/index.ts` (which uses the same fields
 * with safe fallbacks).
 */

export type DefaultStrategy = "recovery" | "review" | "keyterms" | "none";

export interface TranscribeTemplateConfig {
  /** AssemblyAI API base URL (EU vs US region, etc.). */
  base_url: string;
  /** Ordered list of AssemblyAI speech models, e.g. ["universal-3-pro"]. */
  speech_models: string[];
  /** Sampling temperature (0 = deterministic). */
  temperature: number;
  /** Minimum speech presence required for a successful transcription. */
  speech_threshold: number;
  /** Enable speaker diarization on mono-mixed audio (single channel). */
  speaker_labels: boolean;
  /** Enable multichannel routing when audio has isolated speakers per channel. */
  multichannel: boolean;
  /** Enable AssemblyAI's automatic language detection when no language is selected. */
  language_detection: boolean;
  /** Required confidence for language detection to be accepted. */
  language_confidence_threshold: number;
  /** Default prompting strategy applied to jobs that don't override it. */
  default_strategy: DefaultStrategy;
  /** Prompt text for the "recovery" strategy. */
  recovery_prompt: string;
  /** Prompt text for the "review" strategy. */
  review_prompt: string;
  /** Pass `disfluencies: true` to AssemblyAI (forces universal-2 fallback). */
  disfluencies: boolean;
  /** When true, prompts are also applied on the diarization route (off by default — they collapse Speaker B). */
  apply_prompt_on_diarization: boolean;
  /** Polling interval (ms) when waiting for AssemblyAI completion. */
  poll_interval_ms: number;
  /** Maximum polling attempts before timing out. */
  max_polls: number;
}

export const DEFAULT_TEMPLATE_CONFIG: TranscribeTemplateConfig = {
  base_url: "https://api.eu.assemblyai.com/v2",
  speech_models: ["universal-3-pro"],
  temperature: 0,
  speech_threshold: 0.05,
  speaker_labels: true,
  multichannel: true,
  language_detection: true,
  language_confidence_threshold: 0.4,
  default_strategy: "recovery",
  recovery_prompt: [
    "Required: Preserve the original language(s) and script as spoken, including code-switching and mixed-language phrases.",
    "",
    "Always: Transcribe speech with your best guess based on context in all possible scenarios where speech is present in the audio.",
  ].join("\n"),
  review_prompt: [
    "Preserve the original language(s) and script as spoken, including code-switching and mixed-language phrases.",
    "",
    "Always: Transcribe speech exactly as heard. If uncertain or audio is unclear, mark as [unclear].",
    "After the first output, review the transcript again.",
    "Pay close attention to hallucinations, misspellings, or errors, and revise them like a computer performing spell and grammar checks.",
    "Ensure words and phrases make grammatical sense in sentences.",
  ].join("\n"),
  disfluencies: false,
  apply_prompt_on_diarization: false,
  poll_interval_ms: 5000,
  max_polls: 120,
};

/**
 * Coerce arbitrary input into a complete, valid TranscribeTemplateConfig.
 * Missing/invalid fields fall back to DEFAULT_TEMPLATE_CONFIG. Never throws.
 */
export function parseTemplateConfig(raw: unknown): TranscribeTemplateConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_TEMPLATE_CONFIG;

  const asString = (v: unknown, fallback: string): string =>
    typeof v === "string" ? v : fallback;
  const asBool = (v: unknown, fallback: boolean): boolean =>
    typeof v === "boolean" ? v : fallback;
  const asNum = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;

  const speech_models = Array.isArray(r.speech_models)
    ? r.speech_models.filter((x) => typeof x === "string") as string[]
    : d.speech_models;

  const default_strategy = (() => {
    const s = r.default_strategy;
    return s === "recovery" || s === "review" || s === "keyterms" || s === "none"
      ? s
      : d.default_strategy;
  })();

  return {
    base_url: asString(r.base_url, d.base_url),
    speech_models: speech_models.length > 0 ? speech_models : d.speech_models,
    temperature: asNum(r.temperature, d.temperature),
    speech_threshold: asNum(r.speech_threshold, d.speech_threshold),
    speaker_labels: asBool(r.speaker_labels, d.speaker_labels),
    multichannel: asBool(r.multichannel, d.multichannel),
    language_detection: asBool(r.language_detection, d.language_detection),
    language_confidence_threshold: asNum(
      r.language_confidence_threshold,
      d.language_confidence_threshold,
    ),
    default_strategy,
    recovery_prompt: asString(r.recovery_prompt, d.recovery_prompt),
    review_prompt: asString(r.review_prompt, d.review_prompt),
    disfluencies: asBool(r.disfluencies, d.disfluencies),
    apply_prompt_on_diarization: asBool(
      r.apply_prompt_on_diarization,
      d.apply_prompt_on_diarization,
    ),
    poll_interval_ms: asNum(r.poll_interval_ms, d.poll_interval_ms),
    max_polls: asNum(r.max_polls, d.max_polls),
  };
}

/**
 * Build the AssemblyAI request payload that the transcribe edge function
 * would send right now for a given draft config and sample job context.
 *
 * This is a pure mirror of `buildTranscriptPayload` in
 * `supabase/functions/transcribe/index.ts` — keep them in lockstep.
 *
 * The `audio_url` is intentionally a placeholder; the real edge function
 * generates a signed URL from Supabase Storage at request time.
 */
export interface PreviewSampleJob {
  /** "diarization" = mono single-channel mix; "multichannel" = isolated per-channel speakers. */
  route: "diarization" | "multichannel";
  /** "auto" triggers language_detection; otherwise sent as language_code. */
  language: "auto" | string;
  /** Optional: pin a specific speaker count on the diarization route. */
  speakers_expected?: number;
  /** Optional: which prompting strategy to apply (defaults to template's default_strategy). */
  strategy?: DefaultStrategy;
}

export const DEFAULT_PREVIEW_SAMPLE: PreviewSampleJob = {
  route: "diarization",
  language: "auto",
};

const PREVIEW_AUDIO_URL_PLACEHOLDER =
  "https://<supabase-storage>/temp-audio/<signed-url-generated-at-runtime>";

export function buildPreviewPayload(
  cfg: TranscribeTemplateConfig,
  sample: PreviewSampleJob = DEFAULT_PREVIEW_SAMPLE,
): Record<string, unknown> {
  const route = sample.route;
  const strategy: DefaultStrategy = sample.strategy ?? cfg.default_strategy;

  const STRATEGY_PROMPTS: Record<string, string> = {
    recovery: cfg.recovery_prompt,
    review: cfg.review_prompt,
  };

  const payload: Record<string, unknown> = {
    audio_url: PREVIEW_AUDIO_URL_PLACEHOLDER,
    speech_models: cfg.speech_models,
    temperature: cfg.temperature,
    speech_threshold: cfg.speech_threshold,
    ...(route === "multichannel"
      ? { multichannel: true }
      : { speaker_labels: cfg.speaker_labels }),
  };

  if (sample.language && sample.language !== "auto") {
    payload.language_code = sample.language;
  } else if (cfg.language_detection) {
    payload.language_detection = true;
    payload.language_confidence_threshold = cfg.language_confidence_threshold;
  }

  if (strategy === "recovery" || strategy === "review") {
    if (route === "multichannel" || cfg.apply_prompt_on_diarization) {
      payload.prompt = STRATEGY_PROMPTS[strategy];
    }
  }

  if (cfg.disfluencies) {
    payload.disfluencies = true;
  }

  if (route === "diarization" && typeof sample.speakers_expected === "number" && sample.speakers_expected > 0) {
    payload.speaker_options = {
      min_speakers_expected: sample.speakers_expected,
      max_speakers_expected: sample.speakers_expected,
    };
  }

  return payload;
}

/** Stable shallow equality for TranscribeTemplateConfig (used for unsaved-changes detection). */
export function configsEqual(
  a: TranscribeTemplateConfig,
  b: TranscribeTemplateConfig,
): boolean {
  if (a.speech_models.length !== b.speech_models.length) return false;
  for (let i = 0; i < a.speech_models.length; i++) {
    if (a.speech_models[i] !== b.speech_models[i]) return false;
  }
  return (
    a.base_url === b.base_url &&
    a.temperature === b.temperature &&
    a.speech_threshold === b.speech_threshold &&
    a.speaker_labels === b.speaker_labels &&
    a.multichannel === b.multichannel &&
    a.language_detection === b.language_detection &&
    a.language_confidence_threshold === b.language_confidence_threshold &&
    a.default_strategy === b.default_strategy &&
    a.recovery_prompt === b.recovery_prompt &&
    a.review_prompt === b.review_prompt &&
    a.disfluencies === b.disfluencies &&
    a.apply_prompt_on_diarization === b.apply_prompt_on_diarization &&
    a.poll_interval_ms === b.poll_interval_ms &&
    a.max_polls === b.max_polls
  );
}
