import { createServiceClient, type SupabaseClient } from "../_shared/supabase.ts";
import { markJobFailed } from "../_shared/job-failure.ts";

// ----------------------------------------------------------------------------
// stripInlineLanguageTags: remove inline annotations like "(Italian)",
// "[English]", "(in French)", "(en español)", "[Português]", etc. that some
// AssemblyAI/STT outputs occasionally insert. Cover all UI-supported and
// commonly detected languages plus their native names.
// ----------------------------------------------------------------------------
const LANGUAGE_TAG_RE = /\s*[\(\[](?:in\s+|en\s+|im\s+|na\s+|au\s+|on\s+)?(?:italian|italiano|english|inglese|french|français|francese|spanish|español|spagnolo|german|deutsch|tedesco|portuguese|português|portoghese|dutch|nederlands|olandese|polish|polski|polacco|romanian|română|rumeno|czech|čeština|ceco|russian|русский|russo|chinese|中文|cinese|japanese|日本語|giapponese|korean|한국어|coreano|arabic|العربية|arabo|turkish|türkçe|turco|hindi|हिन्दी|swedish|svenska|svedese|norwegian|norsk|norvegese|danish|dansk|danese|finnish|suomi|finlandese|greek|ελληνικά|greco|hebrew|עברית|ebraico|hungarian|magyar|ungherese|ukrainian|українська|ucraino|catalan|català|catalano|galician|galego|galiziano|indonesian|bahasa|indonesiano|malay|melayu|thai|ไทย|tailandese|vietnamese|tiếng\s+việt|vietnamita)[\)\]]\s*/giu;

function stripInlineLanguageTags(text: string): { text: string; stripped: boolean } {
  if (!text) return { text, stripped: false };
  const cleaned = text.replace(LANGUAGE_TAG_RE, " ").replace(/\s{2,}/g, " ").trim();
  return { text: cleaned, stripped: cleaned !== text };
}
import { sanitizeErrorForClient } from "../_shared/sanitize-error.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { ASSEMBLYAI_EU_BASE_URL, assemblyAIFetch } from "../_shared/assemblyai.ts";

// Hardcoded fallbacks if no active template row exists. These mirror the
// "Default" template seeded in the database.
const FALLBACK_POLL_INTERVAL_MS = 5000;
const FALLBACK_MAX_POLLS = 120;

interface ActiveTemplateConfig {
  speech_models: string[];
  temperature: number;
  speech_threshold: number;
  speaker_labels: boolean;
  multichannel: boolean;
  language_detection: boolean;
  language_confidence_threshold: number;
  default_strategy: string;
  recovery_prompt: string;
  review_prompt: string;
  disfluencies: boolean;
  apply_prompt_on_diarization: boolean;
  poll_interval_ms: number;
  max_polls: number;
}

const FALLBACK_CONFIG: ActiveTemplateConfig = {
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
  poll_interval_ms: FALLBACK_POLL_INTERVAL_MS,
  max_polls: FALLBACK_MAX_POLLS,
};

/**
 * Coerce raw JSON config from the active template row into a complete,
 * typed ActiveTemplateConfig. Missing/invalid fields fall back to the
 * hardcoded defaults. Never throws.
 */
function parseActiveConfig(raw: unknown): ActiveTemplateConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const f = FALLBACK_CONFIG;
  const asBool = (v: unknown, fb: boolean): boolean => typeof v === "boolean" ? v : fb;
  const asNum = (v: unknown, fb: number): number => typeof v === "number" && Number.isFinite(v) ? v : fb;
  const speech_models = Array.isArray(r.speech_models)
    ? (r.speech_models.filter((x) => typeof x === "string") as string[])
    : f.speech_models;
  const default_strategy = (() => {
    const s = r.default_strategy;
    return s === "recovery" || s === "review" || s === "keyterms" || s === "none"
      ? (s as string)
      : f.default_strategy;
  })();
  const asString = (v: unknown, fb: string): string => typeof v === "string" ? v : fb;
  return {
    speech_models: speech_models.length > 0 ? speech_models : f.speech_models,
    temperature: asNum(r.temperature, f.temperature),
    speech_threshold: asNum(r.speech_threshold, f.speech_threshold),
    speaker_labels: asBool(r.speaker_labels, f.speaker_labels),
    multichannel: asBool(r.multichannel, f.multichannel),
    language_detection: asBool(r.language_detection, f.language_detection),
    language_confidence_threshold: asNum(r.language_confidence_threshold, f.language_confidence_threshold),
    default_strategy,
    recovery_prompt: asString(r.recovery_prompt, f.recovery_prompt),
    review_prompt: asString(r.review_prompt, f.review_prompt),
    disfluencies: asBool(r.disfluencies, f.disfluencies),
    apply_prompt_on_diarization: asBool(r.apply_prompt_on_diarization, f.apply_prompt_on_diarization),
    poll_interval_ms: asNum(r.poll_interval_ms, f.poll_interval_ms),
    max_polls: asNum(r.max_polls, f.max_polls),
  };
}

async function loadActiveConfig(supabase: SupabaseClient): Promise<ActiveTemplateConfig> {
  try {
    const { data, error } = await supabase
      .from("transcribe_settings_templates")
      .select("config, name")
      .eq("is_active", true)
      .maybeSingle();
    if (error || !data) {
      console.log(JSON.stringify({ event: "active_template_missing", error: error?.message ?? null }));
      return FALLBACK_CONFIG;
    }
    const cfg = parseActiveConfig((data as { config: unknown }).config);
    console.log(JSON.stringify({ event: "active_template_loaded", name: (data as { name: string }).name }));
    return cfg;
  } catch (e) {
    console.log(JSON.stringify({ event: "active_template_load_error", error: String(e) }));
    return FALLBACK_CONFIG;
  }
}

/** Format milliseconds as [HH:MM:SS] */
function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `[${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}]`;
}

function countDistinctNonEmpty(values: Array<unknown>): number {
  return new Set(
    values
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
  ).size;
}

interface DiarUtterance {
  speaker: string;
  start: number;
  end: number;
  text: string;
  confidence: number;
  words?: Array<{ start: number; end: number; text: string; confidence: number; speaker: string }>;
}

/**
 * Merge spurious speaker flips in mono diarization output.
 *
 * Heuristic: if a speaker change occurs and the next utterance looks like a
 * mid-sentence continuation (short gap, starts lowercase or with a common
 * continuation token, very few words), absorb it into the previous speaker's
 * turn. This fixes AssemblyAI's occasional false diarization splits inside a
 * single speaker's sentence in mono audio.
 */
function mergeFalseSpeakerFlips(utterances: DiarUtterance[]): DiarUtterance[] {
  if (utterances.length <= 1) return utterances;

  const MAX_GAP_MS = 1500;
  const MAX_CONTINUATION_WORDS = 8;

  const startsLowerOrContinuation = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const firstChar = trimmed[0];
    // Starts with lowercase letter → likely mid-sentence
    if (firstChar === firstChar.toLowerCase() && firstChar !== firstChar.toUpperCase()) return true;
    // Starts with common continuation punctuation
    if (",;".includes(firstChar)) return true;
    return false;
  };

  const wordCount = (text: string): number =>
    text.trim().split(/\s+/).filter(Boolean).length;

  const merged: DiarUtterance[] = [utterances[0]];

  for (let i = 1; i < utterances.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = utterances[i];

    const speakerChanged = curr.speaker !== prev.speaker;
    const gap = curr.start - prev.end;
    const isContinuation = startsLowerOrContinuation(curr.text);
    const isShort = wordCount(curr.text) <= MAX_CONTINUATION_WORDS;

    if (speakerChanged && gap <= MAX_GAP_MS && isContinuation && isShort) {
      // Merge: absorb into previous utterance, keep previous speaker
      console.log(JSON.stringify({
        event: "diarization_merge",
        from_speaker: curr.speaker,
        into_speaker: prev.speaker,
        gap_ms: gap,
        merged_text: curr.text.substring(0, 60),
        word_count: wordCount(curr.text),
      }));

      prev.text = prev.text.trimEnd() + " " + curr.text.trimStart();
      prev.end = curr.end;
      if (curr.confidence < prev.confidence) {
        prev.confidence = curr.confidence;
      }
      if (prev.words && curr.words) {
        // Re-tag merged words with the absorbing speaker
        const retagged = curr.words.map((w) => ({ ...w, speaker: prev.speaker }));
        prev.words = [...prev.words, ...retagged];
      }
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

async function submitAndPollTranscript(
  apiKey: string,
  payload: Record<string, unknown>,
  jobId: string,
  cfg: ActiveTemplateConfig,
  baseUrl: string,
  supabase: SupabaseClient,
): Promise<{ transcript: Record<string, unknown>; transcriptId: string }> {
  const submitRes = await assemblyAIFetch(`${baseUrl}/transcript`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    throw new Error(`AssemblyAI submit failed [${submitRes.status}]: ${errText}`);
  }

  const submitData = await submitRes.json();
  const transcriptId = String(submitData.id ?? "");

  if (!transcriptId) {
    throw new Error("AssemblyAI did not return a transcript ID");
  }

  console.log(`[transcribe] AssemblyAI transcript ID: ${transcriptId}`);

  const maxPolls = cfg.max_polls;
  const basePollIntervalMs = cfg.poll_interval_ms;
  // Heartbeat the job's updated_at every ~30 seconds of wall-clock time
  // so the watchdog (`status='processing' AND updated_at < now() - 30 min`)
  // does not falsely mark legitimate long-running transcriptions as stale.
  const HEARTBEAT_INTERVAL_MS = 30_000;
  let lastHeartbeatAt = Date.now();

  // ----------------------------------------------------------------------
  // Dynamic poll backoff
  // ----------------------------------------------------------------------
  // AssemblyAI charges per polling request *and* per audio second. Short
  // recordings finish in seconds, so we keep the configured base interval
  // (default 5s) for the first minute. After that, real-time factor drops:
  // a 30-minute file typically takes 60-90s to transcribe, a 4-hour file
  // can take 8-15 minutes. Polling every 5s for the entire window wastes
  // 100+ requests per long job.
  //
  // Cost impact (default 5s base, max 30s ceiling):
  //   - ≤60s job:   12 polls   (unchanged vs old behaviour)
  //   - 5-min job:  ~30 polls  (was 60)   → ~50% fewer
  //   - 30-min job: ~60 polls  (was 360)  → ~83% fewer
  //   - 4-hour job: ~120 polls (was 2400) → ~95% fewer
  //
  // The schedule is gentle so latency-to-completion-detection stays bounded
  // (worst-case detection lag = current interval = 30s).
  // ----------------------------------------------------------------------
  const MAX_POLL_INTERVAL_MS = 30_000;
  const computePollInterval = (elapsedMs: number): number => {
    if (elapsedMs < 60_000) return basePollIntervalMs;            // first 60s: base
    if (elapsedMs < 180_000) return Math.max(basePollIntervalMs, 10_000);  // 1-3 min: 10s
    if (elapsedMs < 600_000) return Math.max(basePollIntervalMs, 20_000);  // 3-10 min: 20s
    return MAX_POLL_INTERVAL_MS;                                  // 10+ min: 30s
  };

  const startedAt = Date.now();
  for (let i = 0; i < maxPolls; i++) {
    const elapsedMs = Date.now() - startedAt;
    const pollIntervalMs = computePollInterval(elapsedMs);
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const pollRes = await assemblyAIFetch(`${baseUrl}/transcript/${transcriptId}`, {
      headers: { Authorization: apiKey },
    });

    if (!pollRes.ok) {
      const errText = await pollRes.text();
      throw new Error(`AssemblyAI poll failed [${pollRes.status}]: ${errText}`);
    }

    const pollData = await pollRes.json();

    if (pollData.status === "completed") {
      return {
        transcript: pollData as Record<string, unknown>,
        transcriptId,
      };
    }

    if (pollData.status === "error") {
      const rawError = String(pollData.error ?? "");
      const errorLower = rawError.toLowerCase();

      console.error(JSON.stringify({ event: "assemblyai_error", job_id: jobId, raw_error: rawError }));

      const isSpeechThresholdError =
        errorLower.includes("speech_threshold") ||
        errorLower.includes("not enough speech") ||
        errorLower.includes("audio does not contain enough speech");
      if (isSpeechThresholdError) {
        throw new Error("Not enough speech detected in the audio. Please upload a recording with clearer speech.");
      }

      const isLanguageConfidenceError =
        errorLower.includes("language_confidence_threshold") ||
        errorLower.includes("language confidence") ||
        errorLower.includes("could not determine the language");
      if (isLanguageConfidenceError) {
        throw new Error("Could not reliably detect the spoken language. Please select the language manually and try again.");
      }

      throw new Error(`AssemblyAI error: ${rawError}`);
    }

    // Heartbeat: bump updated_at so the watchdog sees activity.
    if (Date.now() - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
      lastHeartbeatAt = Date.now();
      try {
        await supabase
          .from("jobs")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", jobId);
      } catch (hbErr) {
        console.warn(`[transcribe] heartbeat failed for ${jobId}:`, hbErr);
      }
    }

    console.log(`[transcribe] Polling... status: ${pollData.status} (attempt ${i + 1})`);
  }

  const elapsedMin = Math.round((Date.now() - startedAt) / 60000);
  throw new Error(`Transcription timed out after ${elapsedMin} minutes`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ASSEMBLYAI_API_KEY = Deno.env.get("ASSEMBLYAI_API_KEY");
    if (!ASSEMBLYAI_API_KEY) {
      throw new Error("ASSEMBLYAI_API_KEY is not configured");
    }

    const supabase = createServiceClient();

    // Load active provider template (with safe fallback). Per-job tuning
    // (job.transcription_config, job.language_selected, etc.) still wins
    // over these admin defaults further down.
    const cfg = await loadActiveConfig(supabase);

    // AssemblyAI is EU-only by policy. No geo-routing, no overrides.
    console.log(JSON.stringify({
      event: "region_routing_resolved",
      base_url: ASSEMBLYAI_EU_BASE_URL,
    }));
    console.log(`[transcribe] base_url=${ASSEMBLYAI_EU_BASE_URL}`);

    const requestBody = await req.json().catch(() => ({}));
    const job_id = typeof requestBody?.job_id === "string" ? requestBody.job_id : "";

    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      throw new Error(`Job not found: ${jobError?.message}`);
    }

    if (!job.temp_file_path) {
      throw new Error("Job has no temp_file_path");
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("temp-audio")
      .createSignedUrl(job.temp_file_path, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error(`Could not create signed URL: ${signedUrlError?.message}`);
    }

    const fileExt = (job.file_name ?? "").split(".").pop()?.toLowerCase() ?? "unknown";
    console.log(`[transcribe] Starting transcription for job ${job_id}, file: ${job.file_name}`);

    const tuningConfig = (job.transcription_config as Record<string, unknown>) ?? {};

    // Permanent default: "recovery" strategy is always on unless an explicit
    // alternative strategy is provided in transcription_config. This injects
    // the recovery prompt and enables `disfluencies: true` for every job.
    const strategy = (tuningConfig.strategy as string) ?? cfg.default_strategy;
    const requestedAudioChannels = typeof job.audio_channels === "number" && job.audio_channels > 1
      ? job.audio_channels
      : null;
    const channelAnalysis = tuningConfig.channel_analysis && typeof tuningConfig.channel_analysis === "object"
      ? tuningConfig.channel_analysis as Record<string, unknown>
      : null;
    const channelRouteHint = channelAnalysis?.route_hint === "multichannel" ? "multichannel" : "diarization";

    // Only use multichannel when we have positive evidence that speakers are
    // actually isolated on separate channels. Channel count alone is not enough.
    // Also requires the active template to permit each route.
    const wantMultichannel = !!(requestedAudioChannels && channelRouteHint === "multichannel");
    const route: "multichannel" | "diarization" = wantMultichannel && cfg.multichannel
      ? "multichannel"
      : "diarization";

    const STRATEGY_PROMPTS: Record<string, string> = {
      recovery: cfg.recovery_prompt,
      review: cfg.review_prompt,
    };

    const buildTranscriptPayload = (): Record<string, unknown> => {
      // Speech models come from the active template. We pin to universal-3-pro
      // by default (Fatebenefratelli matrix: universal-2 collapses 2-person
      // mono recordings into a single speaker) but admins can override.
      const speechModels = cfg.speech_models;

      const payload: Record<string, unknown> = {
        audio_url: signedUrlData.signedUrl,
        speech_models: speechModels,
        temperature: cfg.temperature,
        speech_threshold: cfg.speech_threshold,
        ...(route === "multichannel"
          ? { multichannel: true }
          : { speaker_labels: cfg.speaker_labels }),
      };

      if (job.language_selected && job.language_selected !== "auto") {
        payload.language_code = job.language_selected;
      } else if (cfg.language_detection) {
        payload.language_detection = true;
        payload.language_confidence_threshold = cfg.language_confidence_threshold;
      }

      if (strategy === "keyterms") {
        const keyterms = tuningConfig.keyterms;
        if (Array.isArray(keyterms) && keyterms.length > 0) {
          payload.keyterms_prompt = keyterms;
        }
      } else if (strategy in STRATEGY_PROMPTS) {
        // On the diarization route, prompts can collapse Speaker B back into
        // Speaker A on universal-3-pro (C3 matrix). Skip unless the active
        // template explicitly opts in via apply_prompt_on_diarization.
        if (route === "multichannel" || cfg.apply_prompt_on_diarization) {
          payload.prompt = STRATEGY_PROMPTS[strategy];
        } else {
          console.log(JSON.stringify({
            event: "diarization_prompt_skipped",
            strategy,
            reason: "C3 matrix: prompts collapse mono diarization to 1 speaker",
          }));
        }
      }

      if (cfg.disfluencies) {
        payload.disfluencies = true;
      }

      if (!payload.prompt && !payload.keyterms_prompt) {
        if (tuningConfig.keyterms_prompt && typeof tuningConfig.keyterms_prompt === "string") {
          payload.keyterms_prompt = tuningConfig.keyterms_prompt;
        }
      }

      if (route === "diarization") {
        const resolvedSpeakers = tuningConfig.speakers_expected;
        if (typeof resolvedSpeakers === "number" && resolvedSpeakers > 0) {
          payload.speaker_options = {
            min_speakers_expected: resolvedSpeakers,
            max_speakers_expected: resolvedSpeakers,
          };
        }
        // No speaker_options default — let AssemblyAI use its native diarizer
        // without artificial caps. Empirically (jobs 331aa78f, 0273ac4e) this
        // is what correctly identified the two speakers in real 2-person
        // recordings; capping max=2 plus the merge heuristic was suppressing
        // legitimate Speaker B turns.
      }

      return payload;
    };

    const transcriptPayload = buildTranscriptPayload();

    const audioEnhancement = (tuningConfig.audio_enhancement && typeof tuningConfig.audio_enhancement === "object")
      ? tuningConfig.audio_enhancement
      : null;

    console.log(JSON.stringify({
      event: "transcription_routing",
      job_id,
      file_name: job.file_name,
      file_ext: fileExt,
      file_size_bytes: job.file_size_bytes ?? null,
      audio_channels: job.audio_channels ?? null,
      requested_audio_channels: requestedAudioChannels,
      channel_analysis: channelAnalysis,
      route,
      strategy,
      has_prompt: !!transcriptPayload.prompt,
      has_keyterms: !!transcriptPayload.keyterms_prompt,
      speech_models: transcriptPayload.speech_models,
      temperature: transcriptPayload.temperature,
      speech_threshold: transcriptPayload.speech_threshold,
      language_confidence_threshold: transcriptPayload.language_confidence_threshold ?? null,
      language_code: transcriptPayload.language_code ?? null,
      language_detection: transcriptPayload.language_detection ?? false,
      language_selected_by_user: job.language_selected ?? null,
      speaker_options: transcriptPayload.speaker_options ?? null,
      disfluencies: transcriptPayload.disfluencies ?? false,
      profile: tuningConfig.profile ?? null,
      audio_enhancement: audioEnhancement,
    }));

    await supabase
      .from("jobs")
      .update({
        transcription_config: {
          strategy,
          speech_models: transcriptPayload.speech_models,
          temperature: transcriptPayload.temperature,
          speech_threshold: transcriptPayload.speech_threshold,
          speaker_labels: transcriptPayload.speaker_labels ?? false,
          multichannel: transcriptPayload.multichannel ?? false,
          language_code: transcriptPayload.language_code ?? null,
          language_detection: transcriptPayload.language_detection ?? false,
          language_confidence_threshold: transcriptPayload.language_confidence_threshold ?? null,
          prompt: transcriptPayload.prompt ?? null,
          keyterms_prompt: transcriptPayload.keyterms_prompt ?? null,
          speaker_options: transcriptPayload.speaker_options ?? null,
          disfluencies: transcriptPayload.disfluencies ?? false,
          profile: tuningConfig.profile ?? null,
          channel_analysis: channelAnalysis,
          route,
          audio_enhancement: audioEnhancement,
        },
      })
      .eq("id", job_id);

    const { transcript, transcriptId } = await submitAndPollTranscript(
      ASSEMBLYAI_API_KEY,
      transcriptPayload,
      job_id,
      cfg,
      ASSEMBLYAI_EU_BASE_URL,
      supabase,
    );

    const utterances = (transcript.utterances as Array<Record<string, unknown>>) ?? [];
    const uniqueSpeakers = route === "multichannel"
      ? countDistinctNonEmpty(utterances.map((u) => u.channel))
      : countDistinctNonEmpty(utterances.map((u) => u.speaker));

    const avgConfidence = utterances.length > 0
      ? utterances.reduce((sum, u) => sum + (Number(u.confidence) || 0), 0) / utterances.length
      : null;

    const allConfidences = utterances
      .map((u) => Number(u.confidence) || 0)
      .filter((c) => c > 0)
      .sort((a, b) => a - b);

    const confidenceMin = allConfidences.length > 0 ? allConfidences[0] : null;
    const confidenceP25 = allConfidences.length >= 4
      ? allConfidences[Math.floor(allConfidences.length * 0.25)]
      : confidenceMin;

    const totalWords = utterances.reduce((sum, u) => {
      const words = (u.words as unknown[]);
      return sum + (Array.isArray(words) ? words.length : String(u.text ?? "").split(/\s+/).filter(Boolean).length);
    }, 0);

    const wordsPerUtteranceAvg = utterances.length > 0
      ? Math.round((totalWords / utterances.length) * 10) / 10
      : null;

    console.log(JSON.stringify({
      event: "transcription_completed",
      job_id,
      route,
      audio_channels: job.audio_channels ?? null,
      utterance_count: utterances.length,
      unique_speakers_or_channels: uniqueSpeakers,
      duration_seconds: Math.round((transcript.audio_duration as number) ?? 0),
      language_detected: (transcript.language_code as string) ?? null,
      speech_model_actual: (transcript.speech_model_used as string) ?? null,
      avg_confidence: avgConfidence ? Math.round(avgConfidence * 1000) / 1000 : null,
      confidence_min: confidenceMin ? Math.round(confidenceMin * 1000) / 1000 : null,
      confidence_p25: confidenceP25 ? Math.round(confidenceP25 * 1000) / 1000 : null,
      word_count: totalWords,
      words_per_utterance_avg: wordsPerUtteranceAvg,
      speech_models_requested: transcriptPayload.speech_models,
      temperature: transcriptPayload.temperature,
      speech_threshold: transcriptPayload.speech_threshold,
      language_confidence_threshold: transcriptPayload.language_confidence_threshold ?? null,
      language_code_requested: transcriptPayload.language_code ?? null,
      language_detection_requested: transcriptPayload.language_detection ?? false,
      language_selected_by_user: job.language_selected ?? null,
      speaker_options: transcriptPayload.speaker_options ?? null,
      disfluencies: transcriptPayload.disfluencies ?? false,
      has_keyterms: !!transcriptPayload.keyterms_prompt,
      profile: tuningConfig.profile ?? null,
      audio_enhancement: audioEnhancement,
    }));

    let transcriptText: string;
    let inlineLanguageTagsStripped = 0;

    if (route === "multichannel") {
      const mcUtterances = (transcript.utterances as Array<{ channel: string; start: number; text: string }>) ?? [];
      if (mcUtterances.length > 0) {
        const channelToSpeaker: Record<string, string> = {};
        let nextLetter = 0;
        for (const u of mcUtterances) {
          const ch = String(u.channel);
          if (!(ch in channelToSpeaker)) {
            channelToSpeaker[ch] = `Speaker ${String.fromCharCode(65 + nextLetter)}`;
            nextLetter++;
          }
          // Strip inline language tags in-place so downstream consumers
          // (transcript text + identify-speakers metadata utterances) see clean text
          const cleaned = stripInlineLanguageTags(u.text ?? "");
          if (cleaned.stripped) inlineLanguageTagsStripped++;
          u.text = cleaned.text;
        }
        transcriptText = mcUtterances
          .map((u) => `${formatTimestamp(u.start)} ${channelToSpeaker[String(u.channel)]}: ${u.text}`)
          .join("\n\n");
      } else {
        transcriptText = (transcript.text as string) ?? "";
      }
    } else {
      const rawDiarUtterances = (transcript.utterances as DiarUtterance[]) ?? [];
      if (rawDiarUtterances.length > 0) {
        for (const u of rawDiarUtterances) {
          const cleaned = stripInlineLanguageTags(u.text ?? "");
          if (cleaned.stripped) inlineLanguageTagsStripped++;
          u.text = cleaned.text;
        }
        // Trust AssemblyAI's diarization output verbatim. The previous
        // mergeFalseSpeakerFlips heuristic was collapsing genuine speaker
        // turns in 2-person recordings (e.g. Fatebenefratelli) and is now
        // disabled. If a real-world false-flip case re-emerges, address it
        // with provider-side speaker_options rather than text post-processing.
        transcriptText = rawDiarUtterances
          .map((u) => `${formatTimestamp(u.start)} Speaker ${u.speaker}: ${u.text}`)
          .join("\n\n");
      } else {
        transcriptText = (transcript.text as string) ?? "";
      }
    }

    if (inlineLanguageTagsStripped > 0) {
      console.log(JSON.stringify({
        event: "inline_language_tags_stripped",
        job_id,
        utterances_modified: inlineLanguageTagsStripped,
        route,
      }));
    }

    const detectedLanguage = (transcript.language_code as string) ?? null;
    const audioDuration = Math.round((transcript.audio_duration as number) ?? 0);

    const sanitizedResponse = { ...transcript };
    delete sanitizedResponse.audio_url;

    const actualSpeechModel = (transcript.speech_model_used as string) ?? "universal-3-pro";

    const { error: updateJobErr } = await supabase
      .from("jobs")
      .update({
        language_detected: detectedLanguage,
        duration_seconds: audioDuration,
        speech_model: actualSpeechModel,
        status: "processing",
        assemblyai_transcript_id: transcriptId,
        assemblyai_delete_status: "pending",
      })
      .eq("id", job_id);

    if (updateJobErr) {
      throw new Error(`Failed to update job metadata: ${updateJobErr.message}`);
    }

    const { error: insertOutputErr } = await supabase.from("job_outputs").insert({
      job_id,
      output_type: "transcript",
      content: transcriptText,
      raw_response: sanitizedResponse,
      metadata: {
        utterances,
        confidence: transcript.confidence ?? null,
        audio_duration: transcript.audio_duration ?? null,
        language_code: detectedLanguage,
        utterance_count: utterances.length,
        unique_speakers: uniqueSpeakers,
        route,
      },
    });

    if (insertOutputErr) {
      throw new Error(`Failed to persist transcript output: ${insertOutputErr.message}`);
    }

    try {
      const deleteRes = await fetch(`${ASSEMBLYAI_EU_BASE_URL}/transcript/${transcriptId}`, {
        method: "DELETE",
        headers: { Authorization: ASSEMBLYAI_API_KEY },
      });

      if (deleteRes.ok) {
        console.log(`[transcribe] AssemblyAI transcript deleted: ${transcriptId}`);
        await supabase
          .from("jobs")
          .update({ assemblyai_delete_status: "deleted" })
          .eq("id", job_id);
      } else {
        const errText = await deleteRes.text();
        console.error(`[transcribe] AssemblyAI DELETE failed [${deleteRes.status}]: ${errText}`);
        await supabase
          .from("jobs")
          .update({ assemblyai_delete_status: "failed" })
          .eq("id", job_id);
      }
    } catch (delError) {
      console.error(`[transcribe] AssemblyAI DELETE error:`, delError);
      await supabase
        .from("jobs")
        .update({ assemblyai_delete_status: "failed" })
        .eq("id", job_id);
    }

    const { error: deleteError } = await supabase.storage
      .from("temp-audio")
      .remove([job.temp_file_path]);

    if (deleteError) {
      console.error(`[transcribe] Failed to delete audio: ${deleteError.message}`);
    } else {
      console.log(`[transcribe] Audio file deleted: ${job.temp_file_path}`);
    }

    await supabase
      .from("jobs")
      .update({ audio_deleted_at: new Date().toISOString() })
      .eq("id", job_id);

    return new Response(
      JSON.stringify({
        success: true,
        job_id,
        language_detected: detectedLanguage,
        duration_seconds: audioDuration,
        speaker_count: route === "multichannel"
          ? ((transcript.audio_channels as number) ?? (uniqueSpeakers > 0 ? uniqueSpeakers : null))
          : uniqueSpeakers > 0 ? uniqueSpeakers : null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error(`[transcribe] Error:`, error);

    try {
      const { job_id } = await req.clone().json().catch(() => ({ job_id: null }));
      await markJobFailed(createServiceClient(), job_id, error);
    } catch {
      // ignore cleanup errors
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});