/**
 * eval-transcribe — Internal-only test matrix runner
 *
 * Runs the same audio file through multiple AssemblyAI configurations
 * and produces a compact comparison report focused on the 34–38s window.
 *
 * NOT a product feature. Delete after evaluation.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AAI_BASE = "https://api.eu.assemblyai.com/v2";

// ── Config matrix — 4 targeted configs from investigation plan ──────
interface MatrixConfig {
  id: number;
  label: string;
  language_code?: string;
  speaker_options?: { min_speakers_expected: number; max_speakers_expected: number };
  prompt?: string;
  disfluencies?: boolean;
  keyterms_prompt?: string[];
  useRawAudio?: boolean;
  // Production-match overrides
  speech_models?: string[];
  temperature?: number;
}

const CONFIGS: MatrixConfig[] = [
  {
    id: 1,
    label: "baseline-A: raw M4A, U3P, auto lang, temp=0, no prompt",
    useRawAudio: true,
  },
  {
    id: 2,
    label: "baseline-B: raw M4A, U3P, lang=it, temp=0, no prompt",
    language_code: "it",
    useRawAudio: true,
  },
  {
    id: 3,
    label: "enhanced-control: enhanced WAV, U3P, auto lang, temp=0, no prompt",
  },
  {
    id: 4,
    label: "current-whatsaid: enhanced WAV, U3P+U2 fallback, temp=0.1, recovery prompt, disfluencies",
    speech_models: ["universal-3-pro", "universal-2"],
    temperature: 0.1,
    prompt:
      "Required: Preserve the original language(s) and script as spoken, including code-switching and mixed-language phrases.\n\n" +
      "Always: Transcribe speech with your best guess based on context in all possible scenarios where speech is present in the audio.",
    disfluencies: true,
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

async function getSignedUrl(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    throw new Error(`Failed to get signed URL for ${bucket}/${path}: ${error?.message}`);
  }
  return data.signedUrl;
}

async function submitTranscription(
  audioUrl: string,
  config: MatrixConfig,
  apiKey: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    audio_url: audioUrl,
    speaker_labels: true,
    speech_threshold: 0.05,
    speech_models: config.speech_models || ["universal-3-pro"],
    temperature: config.temperature ?? 0,
  };

  if (config.language_code) {
    body.language_code = config.language_code;
  } else {
    body.language_detection = true;
    body.language_confidence_threshold = 0.4;
  }

  if (config.speaker_options) {
    body.speaker_options = config.speaker_options;
  }

  if (config.prompt) {
    body.prompt = config.prompt;
  }

  if (config.disfluencies) {
    body.disfluencies = true;
  }

  if (config.keyterms_prompt) {
    body.keyterms_prompt = config.keyterms_prompt;
  }

  const res = await fetch(`${AAI_BASE}/transcript`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AssemblyAI submit failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.id as string;
}

async function pollTranscription(
  transcriptId: string,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const maxAttempts = 120;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const res = await fetch(`${AAI_BASE}/transcript/${transcriptId}`, {
      headers: { Authorization: apiKey },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Poll failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    if (data.status === "completed") return data;
    if (data.status === "error") {
      throw new Error(`Transcription failed: ${data.error}`);
    }
  }
  throw new Error("Timed out waiting for transcription");
}

async function deleteTranscript(transcriptId: string, apiKey: string) {
  try {
    const res = await fetch(`${AAI_BASE}/transcript/${transcriptId}`, {
      method: "DELETE",
      headers: { Authorization: apiKey },
    });
    await res.text();
  } catch {
    // best-effort cleanup
  }
}

interface WindowWord {
  text: string;
  start: number;
  end: number;
  confidence: number;
  speaker: string | null;
}

interface WindowUtterance {
  text: string;
  start: number;
  end: number;
  speaker: string;
}

interface ConfigResult {
  config_id: number;
  config_label: string;
  language_detected: string | null;
  speech_model_used: string | null;
  overall_confidence: number | null;
  window_utterances: WindowUtterance[];
  window_words: WindowWord[];
  window_text: string;
  contains_dalla_romania: boolean;
  contains_vagomania: boolean;
  speaker_split_in_window: boolean;
  unique_speakers_in_window: number;
  suspicious_span_avg_confidence: number | null;
  request_params: Record<string, unknown>;
  error?: string;
}

function extractWindow(
  data: Record<string, unknown>,
  config: MatrixConfig,
  requestParams: Record<string, unknown>,
): ConfigResult {
  const WINDOW_START = 30000;
  const WINDOW_END = 42000;

  const utterances = (data.utterances as Array<Record<string, unknown>>) || [];
  const words = (data.words as Array<Record<string, unknown>>) || [];

  const windowUtterances: WindowUtterance[] = utterances
    .filter(
      (u) =>
        (u.start as number) < WINDOW_END && (u.end as number) > WINDOW_START,
    )
    .map((u) => ({
      text: u.text as string,
      start: u.start as number,
      end: u.end as number,
      speaker: u.speaker as string,
    }));

  const windowWords: WindowWord[] = words
    .filter(
      (w) =>
        (w.start as number) >= WINDOW_START &&
        (w.end as number) <= WINDOW_END,
    )
    .map((w) => ({
      text: w.text as string,
      start: w.start as number,
      end: w.end as number,
      confidence: w.confidence as number,
      speaker: (w.speaker as string) || null,
    }));

  const windowText = windowUtterances.map((u) => `[${u.speaker}] ${u.text}`).join(" | ");
  const fullWindowText = windowText.toLowerCase();

  const containsDallaRomania =
    fullWindowText.includes("dalla romania") ||
    fullWindowText.includes("dalla romania,");
  const containsVagomania = fullWindowText.includes("vagomania");

  const splitCheckWords = windowWords.filter(
    (w) => w.start >= 34000 && w.end <= 39000,
  );
  const speakersInSplitWindow = new Set(
    splitCheckWords.map((w) => w.speaker).filter(Boolean),
  );
  const speakerSplitInWindow = speakersInSplitWindow.size > 1;

  const allSpeakers = new Set(
    windowWords.map((w) => w.speaker).filter(Boolean),
  );

  const suspiciousWords = windowWords.filter(
    (w) => w.start >= 35000 && w.end <= 38500,
  );
  const suspiciousAvg =
    suspiciousWords.length > 0
      ? suspiciousWords.reduce((s, w) => s + w.confidence, 0) /
        suspiciousWords.length
      : null;

  return {
    config_id: config.id,
    config_label: config.label,
    language_detected: (data.language_code as string) || null,
    speech_model_used: (data.speech_model_used as string) || null,
    overall_confidence: (data.confidence as number) || null,
    window_utterances: windowUtterances,
    window_words: windowWords,
    window_text: windowText,
    contains_dalla_romania: containsDallaRomania,
    contains_vagomania: containsVagomania,
    speaker_split_in_window: speakerSplitInWindow,
    unique_speakers_in_window: allSpeakers.size,
    suspicious_span_avg_confidence: suspiciousAvg
      ? Math.round(suspiciousAvg * 1000) / 1000
      : null,
    request_params: requestParams,
  };
}

// ── Main handler ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!authHeader.includes(serviceKey)) {
      return new Response(
        JSON.stringify({ error: "Requires service role key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const storagePath: string = body.storage_path;
    const storagePathRaw: string | null = body.storage_path_raw || null;
    const configIds: number[] = body.configs || [1, 2, 3, 4];

    if (!storagePath) {
      return new Response(
        JSON.stringify({ error: "storage_path is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey,
    );

    const apiKey = Deno.env.get("ASSEMBLYAI_API_KEY")!;

    const audioUrl = await getSignedUrl(supabase, "temp-audio", storagePath);
    const rawAudioUrl = storagePathRaw
      ? await getSignedUrl(supabase, "temp-audio", storagePathRaw)
      : null;

    const selectedConfigs = CONFIGS.filter((c) => configIds.includes(c.id));
    const results: ConfigResult[] = [];

    for (const config of selectedConfigs) {
      console.log(`[eval] Starting config #${config.id}: ${config.label}`);
      const startTime = Date.now();

      try {
        let url = audioUrl;
        if (config.useRawAudio) {
          if (!rawAudioUrl) {
            results.push({
              config_id: config.id,
              config_label: config.label,
              language_detected: null,
              speech_model_used: null,
              overall_confidence: null,
              window_utterances: [],
              window_words: [],
              window_text: "",
              contains_dalla_romania: false,
              contains_vagomania: false,
              speaker_split_in_window: false,
              unique_speakers_in_window: 0,
              suspicious_span_avg_confidence: null,
              request_params: {},
              error: "No storage_path_raw provided for raw audio config",
            });
            continue;
          }
          url = rawAudioUrl;
        }

        // Build the exact request params for audit trail
        const requestParams: Record<string, unknown> = {
          speech_models: config.speech_models || ["universal-3-pro"],
          temperature: config.temperature ?? 0,
          speaker_labels: true,
          speech_threshold: 0.05,
          language_code: config.language_code || null,
          language_detection: !config.language_code,
          prompt: config.prompt || null,
          disfluencies: config.disfluencies || false,
          speaker_options: config.speaker_options || null,
          audio_source: config.useRawAudio ? "raw" : "enhanced",
        };

        const transcriptId = await submitTranscription(url, config, apiKey);
        console.log(`[eval] Config #${config.id} submitted: ${transcriptId}`);

        const data = await pollTranscription(transcriptId, apiKey);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`[eval] Config #${config.id} completed in ${elapsed}s, model: ${(data.speech_model_used as string) || "unknown"}`);

        const result = extractWindow(data, config, requestParams);
        results.push(result);

        await deleteTranscript(transcriptId, apiKey);
      } catch (err) {
        console.error(`[eval] Config #${config.id} failed:`, err);
        results.push({
          config_id: config.id,
          config_label: config.label,
          language_detected: null,
          speech_model_used: null,
          overall_confidence: null,
          window_utterances: [],
          window_words: [],
          window_text: "",
          contains_dalla_romania: false,
          contains_vagomania: false,
          speaker_split_in_window: false,
          unique_speakers_in_window: 0,
          suspicious_span_avg_confidence: null,
          request_params: {},
          error: (err as Error).message,
        });
      }
    }

    // Build summary
    const successful = results.filter((r) => !r.error);
    const report = {
      ground_truth: "direttamente dalla Romania",
      target_window_ms: [34000, 38000],
      context_window_ms: [30000, 42000],
      configs_run: configIds,
      results,
      summary: {
        phrase_correct_configs: successful
          .filter((r) => r.contains_dalla_romania)
          .map((r) => ({ id: r.config_id, label: r.config_label })),
        phrase_incorrect_configs: successful
          .filter((r) => !r.contains_dalla_romania)
          .map((r) => ({ id: r.config_id, label: r.config_label, text: r.window_text })),
        split_correct_configs: successful
          .filter((r) => !r.speaker_split_in_window)
          .map((r) => ({ id: r.config_id, label: r.config_label })),
        models_used: successful.map((r) => ({
          id: r.config_id,
          model: r.speech_model_used,
        })),
        confidence_comparison: successful.map((r) => ({
          id: r.config_id,
          label: r.config_label,
          suspicious_span_avg: r.suspicious_span_avg_confidence,
          overall: r.overall_confidence,
        })),
      },
    };

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[eval] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
