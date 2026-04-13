import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sanitizeErrorForClient } from "../_shared/sanitize-error.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

/** Format milliseconds as [HH:MM:SS] */
function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `[${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}]`;
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

    const { job_id } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch job row
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

    // 2. Create a signed URL for the audio file
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("temp-audio")
      .createSignedUrl(job.temp_file_path, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error(`Could not create signed URL: ${signedUrlError?.message}`);
    }

    const fileExt = (job.file_name ?? "").split(".").pop()?.toLowerCase() ?? "unknown";
    console.log(`[transcribe] Starting transcription for job ${job_id}, file: ${job.file_name}`);

    // 3. Build AssemblyAI payload with optimised settings
    const isMultichannel = false; // Kept dormant — diarization-first is the safe default

    // Read optional tuning config from job row (set by process-job if provided)
    const tuningConfig = (job.transcription_config as Record<string, unknown>) ?? {};

    const transcriptPayload: Record<string, unknown> = {
      audio_url: signedUrlData.signedUrl,
      speech_models: ["universal-3-pro", "universal-2"],
      temperature: 0.1,
      ...(isMultichannel
        ? { multichannel: true }
        : { speaker_labels: true }),
    };

    // Language handling: manual selection → explicit, otherwise auto-detect
    if (job.language_selected && job.language_selected !== "auto") {
      transcriptPayload.language_code = job.language_selected;
    } else {
      transcriptPayload.language_detection = true;
    }

    // Optional tuning: keyterms_prompt (mutually exclusive with custom_prompt/prompt)
    if (tuningConfig.keyterms_prompt && typeof tuningConfig.keyterms_prompt === "string") {
      transcriptPayload.keyterms_prompt = tuningConfig.keyterms_prompt;
      // Never send both prompt and keyterms_prompt
    }

    // Structured routing log
    console.log(JSON.stringify({
      event: "transcription_routing",
      job_id,
      file_name: job.file_name,
      file_ext: fileExt,
      file_size_bytes: job.file_size_bytes ?? null,
      audio_channels: job.audio_channels ?? null,
      route: isMultichannel ? "multichannel" : "diarization",
      speech_models: transcriptPayload.speech_models,
      temperature: transcriptPayload.temperature,
      has_keyterms: !!transcriptPayload.keyterms_prompt,
    }));

    // 4. Save transcription config to jobs table for evaluation
    await supabase
      .from("jobs")
      .update({
        transcription_config: {
          speech_models: transcriptPayload.speech_models,
          temperature: transcriptPayload.temperature,
          speaker_labels: transcriptPayload.speaker_labels ?? false,
          multichannel: transcriptPayload.multichannel ?? false,
          language_code: transcriptPayload.language_code ?? null,
          language_detection: transcriptPayload.language_detection ?? false,
          keyterms_prompt: transcriptPayload.keyterms_prompt ?? null,
        },
      })
      .eq("id", job_id);

    // 5. Submit to AssemblyAI
    const submitRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
      method: "POST",
      headers: {
        Authorization: ASSEMBLYAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(transcriptPayload),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      throw new Error(`AssemblyAI submit failed [${submitRes.status}]: ${errText}`);
    }

    const submitData = await submitRes.json();
    const transcriptId = submitData.id;
    console.log(`[transcribe] AssemblyAI transcript ID: ${transcriptId}`);

    // 6. Poll for completion
    let transcript: Record<string, unknown> | null = null;
    const maxPolls = 120; // 10 minutes max (5s * 120)

    for (let i = 0; i < maxPolls; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const pollRes = await fetch(`${ASSEMBLYAI_BASE}/transcript/${transcriptId}`, {
        headers: { Authorization: ASSEMBLYAI_API_KEY },
      });

      if (!pollRes.ok) {
        const errText = await pollRes.text();
        throw new Error(`AssemblyAI poll failed [${pollRes.status}]: ${errText}`);
      }

      const pollData = await pollRes.json();

      if (pollData.status === "completed") {
        transcript = pollData;
        break;
      }

      if (pollData.status === "error") {
        throw new Error(`AssemblyAI error: ${pollData.error}`);
      }

      console.log(`[transcribe] Polling... status: ${pollData.status} (attempt ${i + 1})`);
    }

    if (!transcript) {
      throw new Error("Transcription timed out after 10 minutes");
    }

    // 7. Extract structured data
    const utterances = (transcript.utterances as Array<Record<string, unknown>>) ?? [];
    const uniqueSpeakers = isMultichannel
      ? new Set(utterances.map((u) => String(u.channel ?? ""))).size
      : new Set(utterances.map((u) => String(u.speaker ?? ""))).size;

    const avgConfidence = utterances.length > 0
      ? utterances.reduce((sum, u) => sum + (Number(u.confidence) || 0), 0) / utterances.length
      : null;

    // Structured completion log with evaluation signals
    console.log(JSON.stringify({
      event: "transcription_completed",
      job_id,
      route: isMultichannel ? "multichannel" : "diarization",
      audio_channels: job.audio_channels ?? null,
      utterance_count: utterances.length,
      unique_speakers_or_channels: uniqueSpeakers,
      duration_seconds: Math.round((transcript.audio_duration as number) ?? 0),
      language_detected: (transcript.language_code as string) ?? null,
      avg_confidence: avgConfidence ? Math.round(avgConfidence * 1000) / 1000 : null,
      speech_models: transcriptPayload.speech_models,
      temperature: transcriptPayload.temperature,
      has_keyterms: !!transcriptPayload.keyterms_prompt,
    }));

    // 8. Build rendered transcript text with timestamps
    let transcriptText: string;

    if (isMultichannel) {
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
      const diarUtterances = (transcript.utterances as Array<{ speaker: string; start: number; text: string }>) ?? [];
      if (diarUtterances.length > 0) {
        transcriptText = diarUtterances
          .map((u) => `${formatTimestamp(u.start)} Speaker ${u.speaker}: ${u.text}`)
          .join("\n\n");
      } else {
        transcriptText = (transcript.text as string) ?? "";
      }
    }

    const detectedLanguage = (transcript.language_code as string) ?? null;
    const audioDuration = Math.round((transcript.audio_duration as number) ?? 0);

    // 9. Sanitize raw response — remove audio_url for security
    const sanitizedResponse = { ...transcript };
    delete sanitizedResponse.audio_url;

    // 10. Update job with metadata
    await supabase
      .from("jobs")
      .update({
        language_detected: detectedLanguage,
        duration_seconds: audioDuration,
        speech_model: "universal-3-pro",
        status: "processing", // still processing (post-processing next)
      })
      .eq("id", job_id);

    // 11. Insert transcript output with raw response and structured metadata
    await supabase.from("job_outputs").insert({
      job_id,
      output_type: "transcript",
      content: transcriptText,
      raw_response: sanitizedResponse,
      metadata: {
        utterances: utterances,
        confidence: transcript.confidence ?? null,
        audio_duration: transcript.audio_duration ?? null,
        language_code: detectedLanguage,
        utterance_count: utterances.length,
        unique_speakers: uniqueSpeakers,
      },
    });

    // 12. Delete audio file from storage
    const { error: deleteError } = await supabase.storage
      .from("temp-audio")
      .remove([job.temp_file_path]);

    if (deleteError) {
      console.error(`[transcribe] Failed to delete audio: ${deleteError.message}`);
    } else {
      console.log(`[transcribe] Audio file deleted: ${job.temp_file_path}`);
    }

    // 13. Mark audio as deleted
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
        speaker_count: isMultichannel
          ? (transcript.audio_channels as number) ?? null
          : uniqueSpeakers > 0 ? uniqueSpeakers : null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error(`[transcribe] Error:`, error);

    // Try to mark job as failed
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
