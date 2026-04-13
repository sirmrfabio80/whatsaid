import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sanitizeErrorForClient } from "../_shared/sanitize-error.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

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
      .createSignedUrl(job.temp_file_path, 3600); // 1 hour

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error(`Could not create signed URL: ${signedUrlError?.message}`);
    }

    const fileExt = (job.file_name ?? "").split(".").pop()?.toLowerCase() ?? "unknown";
    console.log(`[transcribe] Starting transcription for job ${job_id}, file: ${job.file_name}`);

    // 3. Submit to AssemblyAI
    // Route based on detected audio channels:
    // - multichannel (2+): uses AssemblyAI multichannel mode (one transcript per channel)
    // - mono (1) or unknown (null): uses speaker diarization (best-effort for same-mic audio)
    // Note: Stereo files with identical/mixed channels may produce duplicate output under multichannel mode.
    const isMultichannel = typeof job.audio_channels === "number" && job.audio_channels >= 2;

    // Structured routing log for future analysis of real uploads
    console.log(JSON.stringify({
      event: "transcription_routing",
      job_id,
      file_name: job.file_name,
      file_ext: fileExt,
      file_size_bytes: job.file_size_bytes ?? null,
      audio_channels: job.audio_channels ?? null,
      route: isMultichannel ? "multichannel" : "diarization",
      // Future: add duplicate_channel_suspect flag here once detection is implemented
    }));

    const transcriptPayload: Record<string, unknown> = {
      audio_url: signedUrlData.signedUrl,
      speech_models: ["universal-3-pro"],
      ...(isMultichannel
        ? { multichannel: true }
        : { speaker_labels: true }),
    };

    // If language is manually selected and not "auto", pass it
    if (job.language_selected && job.language_selected !== "auto") {
      transcriptPayload.language_code = job.language_selected;
    } else {
      // Use automatic language detection
      transcriptPayload.language_detection = true;
    }

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

    // 4. Poll for completion
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

    // Structured completion log for routing analysis
    const utterances = (transcript.utterances as Array<Record<string, unknown>>) ?? [];
    const uniqueSpeakers = isMultichannel
      ? new Set(utterances.map((u) => String(u.channel ?? ""))).size
      : new Set(utterances.map((u) => String(u.speaker ?? ""))).size;

    console.log(JSON.stringify({
      event: "transcription_completed",
      job_id,
      route: isMultichannel ? "multichannel" : "diarization",
      audio_channels: job.audio_channels ?? null,
      utterance_count: utterances.length,
      unique_speakers_or_channels: uniqueSpeakers,
      duration_seconds: Math.round((transcript.audio_duration as number) ?? 0),
      language_detected: (transcript.language_code as string) ?? null,
    }));

    // 5. Build transcript text
    // Normalise all labels to "Speaker A / B / C …" regardless of source,
    // so the UI never shows raw technical labels like "Channel 1".
    let transcriptText: string;

    if (isMultichannel) {
      // Multichannel mode: each utterance has a `channel` property (string, e.g. "1", "2").
      // Map channel identifiers to sequential "Speaker A", "Speaker B", …
      const mcUtterances = (transcript.utterances as Array<{ channel: string; text: string }>) ?? [];
      if (mcUtterances.length > 0) {
        const channelToSpeaker: Record<string, string> = {};
        let nextLetter = 0;
        for (const u of mcUtterances) {
          const ch = String(u.channel);
          if (!(ch in channelToSpeaker)) {
            // A=65
            channelToSpeaker[ch] = `Speaker ${String.fromCharCode(65 + nextLetter)}`;
            nextLetter++;
          }
        }
        transcriptText = mcUtterances
          .map((u) => `${channelToSpeaker[String(u.channel)]}: ${u.text}`)
          .join("\n\n");
      } else {
        transcriptText = (transcript.text as string) ?? "";
      }
    } else {
      // Speaker diarization mode: each utterance has a `speaker` label
      const utterances = (transcript.utterances as Array<{ speaker: string; text: string }>) ?? [];
      if (utterances.length > 0) {
        transcriptText = utterances
          .map((u) => `Speaker ${u.speaker}: ${u.text}`)
          .join("\n\n");
      } else {
        transcriptText = (transcript.text as string) ?? "";
      }
    }

    const detectedLanguage = (transcript.language_code as string) ?? null;
    const audioDuration = Math.round((transcript.audio_duration as number) ?? 0);

    // 6. Update job with metadata
    await supabase
      .from("jobs")
      .update({
        language_detected: detectedLanguage,
        duration_seconds: audioDuration,
        speech_model: "universal-3-pro",
        status: "processing", // still processing (post-processing next)
      })
      .eq("id", job_id);

    // 7. Insert transcript output
    await supabase.from("job_outputs").insert({
      job_id,
      output_type: "transcript",
      content: transcriptText,
    });

    // 8. Delete audio file from storage
    const { error: deleteError } = await supabase.storage
      .from("temp-audio")
      .remove([job.temp_file_path]);

    if (deleteError) {
      console.error(`[transcribe] Failed to delete audio: ${deleteError.message}`);
    } else {
      console.log(`[transcribe] Audio file deleted: ${job.temp_file_path}`);
    }

    // 9. Mark audio as deleted
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
          : ((transcript.utterances as Array<{ speaker: string }>) ?? []).length > 0
            ? new Set(((transcript.utterances as Array<{ speaker: string }>) ?? []).map((u) => u.speaker)).size
            : null,
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
