import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

    console.log(`[transcribe] Starting transcription for job ${job_id}, file: ${job.file_name}`);

    // 3. Submit to AssemblyAI
    const transcriptPayload: Record<string, unknown> = {
      audio_url: signedUrlData.signedUrl,
      speaker_labels: true,
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

    console.log(`[transcribe] Transcription completed for job ${job_id}`);

    // 5. Build transcript text with speaker labels
    const utterances = (transcript.utterances as Array<{ speaker: string; text: string }>) ?? [];
    let transcriptText: string;

    if (utterances.length > 0) {
      transcriptText = utterances
        .map((u) => `Speaker ${u.speaker}: ${u.text}`)
        .join("\n\n");
    } else {
      transcriptText = (transcript.text as string) ?? "";
    }

    const detectedLanguage = (transcript.language_code as string) ?? null;
    const audioDuration = Math.round((transcript.audio_duration as number) ?? 0);

    // 6. Update job with metadata
    await supabase
      .from("jobs")
      .update({
        language_detected: detectedLanguage,
        duration_seconds: audioDuration,
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
        speaker_count: utterances.length > 0
          ? new Set(utterances.map((u) => u.speaker)).size
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
            error_message: error instanceof Error ? error.message : "Unknown error",
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
