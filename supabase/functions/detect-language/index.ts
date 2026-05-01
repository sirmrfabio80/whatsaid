// detect-language: fast pre-flight language detection on a short prefix of
// the uploaded audio, so the user can confirm or override the detected
// language BEFORE the full (expensive) transcription runs.
//
// Strategy:
//   - Use AssemblyAI's "nano" speech model with language_detection=true.
//   - Limit decoded audio to the first ~30s via `audio_end_at`.
//   - Poll quickly (1.5s) up to ~30s.
//
// This function does NOT delete the audio (the main `transcribe` function
// still owns audio lifecycle). It writes the detected ISO code to
// `jobs.language_detected_preview`. Errors are logged to
// `jobs.language_preview_error` and the client is allowed to continue.
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, requireAuth } from "../_shared/supabase.ts";

const POLL_MS = 1500;
const MAX_POLLS = 25; // ~37s budget

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createServiceClient();
  let jobId = "";

  try {
    const ASSEMBLYAI_API_KEY = Deno.env.get("ASSEMBLYAI_API_KEY");
    if (!ASSEMBLYAI_API_KEY) throw new Error("ASSEMBLYAI_API_KEY is not configured");

    const auth = await requireAuth(req.headers.get("Authorization"));
    if (!auth.ok) return auth.response;
    const callerId = auth.userId;

    const body = await req.json().catch(() => ({}));
    jobId = typeof body?.job_id === "string" ? body.job_id : "";
    if (!jobId) {
      return new Response(JSON.stringify({ error: "job_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id,user_id,temp_file_path,language_detected_preview")
      .eq("id", jobId)
      .maybeSingle();

    if (jobErr || !job) throw new Error("Job not found");
    if (job.user_id && job.user_id !== callerId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!job.temp_file_path) throw new Error("Job has no audio yet");

    // Idempotency: if we already have a preview, return it immediately.
    if (job.language_detected_preview) {
      return new Response(
        JSON.stringify({ success: true, language: job.language_detected_preview, cached: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from("temp-audio")
      .createSignedUrl(job.temp_file_path, 3600);
    if (signErr || !signed?.signedUrl) throw new Error("Could not sign audio URL");

    // EU base URL is fine for a tiny detection-only pass; full transcribe
    // still does its own geo routing.
    const baseUrl = "https://api.eu.assemblyai.com/v2";

    const submitRes = await fetch(`${baseUrl}/transcript`, {
      method: "POST",
      headers: {
        Authorization: ASSEMBLYAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: signed.signedUrl,
        speech_model: "nano",
        language_detection: true,
        // Only decode the first 30 seconds — language detection converges fast
        // and we save provider cost + latency.
        audio_end_at: 30_000,
        // Disable everything we don't need.
        punctuate: false,
        format_text: false,
        disfluencies: false,
      }),
    });

    if (!submitRes.ok) {
      const t = await submitRes.text();
      throw new Error(`detect submit failed [${submitRes.status}]: ${t}`);
    }
    const submitData = await submitRes.json();
    const transcriptId = String(submitData.id ?? "");
    if (!transcriptId) throw new Error("No transcript id from detection");

    let detected: string | null = null;
    let lastStatus = "queued";

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const pollRes = await fetch(`${baseUrl}/transcript/${transcriptId}`, {
        headers: { Authorization: ASSEMBLYAI_API_KEY },
      });
      if (!pollRes.ok) {
        const t = await pollRes.text();
        throw new Error(`detect poll failed [${pollRes.status}]: ${t}`);
      }
      const data = await pollRes.json();
      lastStatus = String(data.status ?? "");
      if (data.status === "completed") {
        detected = (data.language_code as string) ?? null;
        break;
      }
      if (data.status === "error") {
        throw new Error(`detect error: ${data.error ?? "unknown"}`);
      }
    }

    // Best-effort delete the throwaway transcript (don't fail the request).
    fetch(`${baseUrl}/transcript/${transcriptId}`, {
      method: "DELETE",
      headers: { Authorization: ASSEMBLYAI_API_KEY },
    }).catch(() => {});

    if (!detected) {
      // Timed out or no language returned — write a soft error and let the
      // client move on. The full transcribe call will still attempt detection.
      await supabase
        .from("jobs")
        .update({
          language_preview_error: `no_language_detected (status=${lastStatus})`,
        })
        .eq("id", jobId);

      return new Response(
        JSON.stringify({ success: false, language: null, reason: "no_language" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabase
      .from("jobs")
      .update({
        language_detected_preview: detected,
        language_preview_error: null,
      })
      .eq("id", jobId);

    return new Response(
      JSON.stringify({ success: true, language: detected }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[detect-language] error:", err);
    const msg = err instanceof Error ? err.message : "unknown";
    if (jobId) {
      try {
        await supabase
          .from("jobs")
          .update({ language_preview_error: msg.slice(0, 500) })
          .eq("id", jobId);
      } catch { /* ignore */ }
    }
    // Soft failure: respond 200 with success=false so the client can continue
    // straight to the full transcription without blocking the user.
    return new Response(
      JSON.stringify({ success: false, language: null, error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
