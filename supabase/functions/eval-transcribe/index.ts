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

// ── Strategy prompts (match production transcribe function) ──────────
const RECOVERY_PROMPT =
  "This audio may contain overlapping speech, background noise, or quiet speakers. " +
  "Transcribe every audible word as accurately as possible, even if faint or unclear. " +
  "If you detect more than one language being spoken, transcribe each segment in its original language.";

const REVIEW_PROMPT =
  "This is a review pass. Fix any grammar, punctuation, or obvious word errors " +
  "while preserving the original meaning and speaker intent. " +
  "If you detect more than one language being spoken, keep each segment in its original language.";

// ── Config matrix ────────────────────────────────────────────────────
interface MatrixConfig {
  id: number;
  label: string;
  language_code?: string;
  speaker_options?: { min_speakers_expected: number; max_speakers_expected: number };
  prompt?: string;
  disfluencies?: boolean;
  keyterms_prompt?: string[];
  useRawAudio?: boolean;
}

const CONFIGS: MatrixConfig[] = [
  { id: 1, label: "balanced, auto, no speaker hint" },
  {
    id: 2,
    label: "balanced, auto, speakers {2,2}",
    speaker_options: { min_speakers_expected: 2, max_speakers_expected: 2 },
  },
  {
    id: 3,
    label: "balanced, it, speakers {2,2}",
    language_code: "it",
    speaker_options: { min_speakers_expected: 2, max_speakers_expected: 2 },
  },
  {
    id: 4,
    label: "recovery, auto, speakers {2,2}",
    prompt: RECOVERY_PROMPT,
    disfluencies: true,
    speaker_options: { min_speakers_expected: 2, max_speakers_expected: 2 },
  },
  {
    id: 5,
    label: "review, auto, speakers {2,2}",
    prompt: REVIEW_PROMPT,
    speaker_options: { min_speakers_expected: 2, max_speakers_expected: 2 },
  },
  {
    id: 6,
    label: "keyterms [Romania], auto, speakers {2,2}",
    keyterms_prompt: ["Romania"],
    speaker_options: { min_speakers_expected: 2, max_speakers_expected: 2 },
  },
  {
    id: 7,
    label: "balanced, it, speakers {2,2} (enhanced audio)",
    language_code: "it",
    speaker_options: { min_speakers_expected: 2, max_speakers_expected: 2 },
  },
  {
    id: 8,
    label: "balanced, it, speakers {2,2} (raw audio)",
    language_code: "it",
    speaker_options: { min_speakers_expected: 2, max_speakers_expected: 2 },
    useRawAudio: true,
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
    speech_models: ["universal-3-pro", "universal-2"],
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
    await res.text(); // consume
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
  error?: string;
}

function extractWindow(
  data: Record<string, unknown>,
  config: MatrixConfig,
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

  // Check for the target phrases
  const containsDallaRomania =
    fullWindowText.includes("dalla romania") ||
    fullWindowText.includes("dalla romania,");
  const containsVagomania = fullWindowText.includes("vagomania");

  // Check speaker split: are there multiple speakers in a tight window around 36s?
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

  // Compute avg confidence for suspicious words (around "vagomania" / "dalla Romania" area)
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
  };
}

// ── Main handler ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: require service role key
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
    const configIds: number[] = body.configs || [1, 2, 3, 4, 5, 6, 7, 8];

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

    // Get signed URLs
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
        // Choose audio URL
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
              error: "No storage_path_raw provided for raw audio config",
            });
            continue;
          }
          url = rawAudioUrl;
        }

        const transcriptId = await submitTranscription(url, config, apiKey);
        console.log(`[eval] Config #${config.id} submitted: ${transcriptId}`);

        const data = await pollTranscription(transcriptId, apiKey);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`[eval] Config #${config.id} completed in ${elapsed}s`);

        const result = extractWindow(data, config);
        results.push(result);

        // Cleanup
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
          error: (err as Error).message,
        });
      }
    }

    // Build summary
    const successful = results.filter((r) => !r.error);
    const bestPhrase = successful.find((r) => r.contains_dalla_romania)?.config_id || null;
    const bestSplit = successful.find((r) => !r.speaker_split_in_window)?.config_id || null;
    const bestConfidence = successful.length > 0
      ? successful.reduce((best, r) =>
          (r.suspicious_span_avg_confidence || 0) >
          (best.suspicious_span_avg_confidence || 0)
            ? r
            : best
        ).config_id
      : null;

    const report = {
      ground_truth: "dalla Romania",
      target_window_ms: [34000, 38000],
      context_window_ms: [30000, 42000],
      configs_run: configIds,
      results,
      summary: {
        best_for_phrase: bestPhrase,
        best_for_speaker_split: bestSplit,
        best_overall_confidence: bestConfidence,
        phrase_correct_configs: successful
          .filter((r) => r.contains_dalla_romania)
          .map((r) => r.config_id),
        split_correct_configs: successful
          .filter((r) => !r.speaker_split_in_window)
          .map((r) => r.config_id),
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
