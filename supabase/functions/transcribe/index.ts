import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sanitizeErrorForClient } from "../_shared/sanitize-error.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASSEMBLYAI_BASE = "https://api.eu.assemblyai.com/v2";

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
): Promise<{ transcript: Record<string, unknown>; transcriptId: string }> {
  const submitRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
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

  const maxPolls = 120;

  for (let i = 0; i < maxPolls; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const pollRes = await fetch(`${ASSEMBLYAI_BASE}/transcript/${transcriptId}`, {
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

    console.log(`[transcribe] Polling... status: ${pollData.status} (attempt ${i + 1})`);
  }

  throw new Error("Transcription timed out after 10 minutes");
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
    const strategy = (tuningConfig.strategy as string) ?? "recovery";
    const requestedAudioChannels = typeof job.audio_channels === "number" && job.audio_channels > 1
      ? job.audio_channels
      : null;
    const channelAnalysis = tuningConfig.channel_analysis && typeof tuningConfig.channel_analysis === "object"
      ? tuningConfig.channel_analysis as Record<string, unknown>
      : null;
    const channelRouteHint = channelAnalysis?.route_hint === "multichannel" ? "multichannel" : "diarization";

    // Only use multichannel when we have positive evidence that speakers are
    // actually isolated on separate channels. Channel count alone is not enough.
    const route: "multichannel" | "diarization" = requestedAudioChannels && channelRouteHint === "multichannel"
      ? "multichannel"
      : "diarization";

    const CODE_SWITCH_INSTRUCTION = "Preserve the original language(s) and script as spoken, including code-switching and mixed-language phrases.";

    const STRATEGY_PROMPTS: Record<string, string> = {
      recovery: [
        `Required: ${CODE_SWITCH_INSTRUCTION}`,
        "",
        "Always: Transcribe speech with your best guess based on context in all possible scenarios where speech is present in the audio.",
      ].join("\n"),
      review: [
        CODE_SWITCH_INSTRUCTION,
        "",
        "Always: Transcribe speech exactly as heard. If uncertain or audio is unclear, mark as [unclear].",
        "After the first output, review the transcript again.",
        "Pay close attention to hallucinations, misspellings, or errors, and revise them like a computer performing spell and grammar checks.",
        "Ensure words and phrases make grammatical sense in sentences.",
      ].join("\n"),
    };

    const buildTranscriptPayload = (): Record<string, unknown> => {
      // When disfluencies are requested, AssemblyAI requires universal-2 to be
      // declared alongside universal-3-pro (universal-3-pro alone rejects it).
      const wantsDisfluencies = strategy === "recovery";
      const speechModels = wantsDisfluencies
        ? ["universal-3-pro", "universal-2"]
        : ["universal-3-pro"];

      const payload: Record<string, unknown> = {
        audio_url: signedUrlData.signedUrl,
        speech_models: speechModels,
        temperature: 0,
        speech_threshold: 0.05,
        ...(route === "multichannel"
          ? { multichannel: true }
          : { speaker_labels: true }),
      };

      if (job.language_selected && job.language_selected !== "auto") {
        payload.language_code = job.language_selected;
      } else {
        payload.language_detection = true;
        payload.language_confidence_threshold = 0.4;
      }

      if (strategy === "keyterms") {
        const keyterms = tuningConfig.keyterms;
        if (Array.isArray(keyterms) && keyterms.length > 0) {
          payload.keyterms_prompt = keyterms;
        }
      } else if (strategy in STRATEGY_PROMPTS) {
        payload.prompt = STRATEGY_PROMPTS[strategy];
      }

      if (strategy === "recovery") {
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
        } else {
          // Default for mono recordings: bias AssemblyAI toward a single speaker.
          // Same-mic conversational mono audio frequently confuses diarization
          // and produces spurious Speaker B turns. Setting min=1 lets the model
          // collapse ambiguous turns; max=2 keeps the door open for clearly
          // separated voices but discourages over-splitting. The post-process
          // mergeFalseSpeakerFlips heuristic provides an additional safety net.
          payload.speaker_options = {
            min_speakers_expected: 1,
            max_speakers_expected: 2,
          };
        }
      }

      return payload;
    };

    const transcriptPayload = buildTranscriptPayload();

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
      speaker_options: transcriptPayload.speaker_options ?? null,
      disfluencies: transcriptPayload.disfluencies ?? false,
      profile: tuningConfig.profile ?? null,
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
        },
      })
      .eq("id", job_id);

    const { transcript, transcriptId } = await submitAndPollTranscript(
      ASSEMBLYAI_API_KEY,
      transcriptPayload,
      job_id,
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
      speaker_options: transcriptPayload.speaker_options ?? null,
      disfluencies: transcriptPayload.disfluencies ?? false,
      has_keyterms: !!transcriptPayload.keyterms_prompt,
      profile: tuningConfig.profile ?? null,
    }));

    let transcriptText: string;

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
        const diarUtterances = mergeFalseSpeakerFlips(rawDiarUtterances);
        transcriptText = diarUtterances
          .map((u) => `${formatTimestamp(u.start)} Speaker ${u.speaker}: ${u.text}`)
          .join("\n\n");
      } else {
        transcriptText = (transcript.text as string) ?? "";
      }
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
      const deleteRes = await fetch(`${ASSEMBLYAI_BASE}/transcript/${transcriptId}`, {
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
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { job_id } = await req.clone().json().catch(() => ({ job_id: null }));
      if (job_id) {
        await supabase
          .from("jobs")
           .update({
            status: "failed",
            error_message: sanitizeErrorForClient(error),
          })
          .eq("id", job_id);
      }
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