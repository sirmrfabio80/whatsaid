// detect-language: fast pre-flight language detection on a short prefix of
// the uploaded audio, so the user can confirm or override the detected
// language BEFORE the full (expensive) transcription runs.
//
// Strategy:
//   - Use AssemblyAI's "nano" speech model with language_detection=true.
//   - Limit decoded audio to the first ~30s via `audio_end_at`. The client
//     can pass `extend_preview=true` on a retry to widen this window so
//     very short recordings get a second, longer look.
//   - Poll quickly (1.5s) up to ~25s.
//   - Always responds 200 with a structured `status` of
//     "success" | "skipped" | "failed" so the client never gets stuck.
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, requireAuth } from "../_shared/supabase.ts";

const POLL_MS = 1500;
const MAX_POLLS = 17; // ~25s upstream poll budget — keep under client timeout
const DEFAULT_PREVIEW_MS = 30_000;
const EXTENDED_PREVIEW_MS = 90_000;

type DetectStatus = "success" | "skipped" | "failed";

interface DetectResponse {
  status: DetectStatus;
  language: string | null;
  reason?: string;
  fallback?: boolean;
  preview_ms: number;
  cached?: boolean;
}

function jsonResponse(payload: DetectResponse, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createServiceClient();
  let jobId = "";
  let previewMs = DEFAULT_PREVIEW_MS;

  try {
    const ASSEMBLYAI_API_KEY = Deno.env.get("ASSEMBLYAI_API_KEY");
    if (!ASSEMBLYAI_API_KEY) throw new Error("ASSEMBLYAI_API_KEY is not configured");

    const auth = await requireAuth(req.headers.get("Authorization"));
    if (!auth.ok) return auth.response;
    const callerId = auth.userId;

    const body = await req.json().catch(() => ({}));
    jobId = typeof body?.job_id === "string" ? body.job_id : "";
    const extendPreview = body?.extend_preview === true;
    previewMs = extendPreview ? EXTENDED_PREVIEW_MS : DEFAULT_PREVIEW_MS;

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

    // Idempotency: if we already have a preview, return it immediately —
    // unless this is an explicit extended-preview retry, in which case we
    // re-run with the wider window.
    if (job.language_detected_preview && !extendPreview) {
      return jsonResponse({
        status: "success",
        language: job.language_detected_preview,
        cached: true,
        preview_ms: previewMs,
      });
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from("temp-audio")
      .createSignedUrl(job.temp_file_path, 3600);
    if (signErr || !signed?.signedUrl) throw new Error("Could not sign audio URL");

    const baseUrl = "https://api.eu.assemblyai.com/v2";

    const submitRes = await fetch(`${baseUrl}/transcript`, {
      method: "POST",
      headers: {
        Authorization: ASSEMBLYAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: signed.signedUrl,
        speech_models: ["universal-2"],
        language_detection: true,
        language_confidence_threshold: 0.5,
        audio_end_at: previewMs,
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
    let detectedConfidence: number | null = null;
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
        const conf = data.language_confidence;
        detectedConfidence = typeof conf === "number" ? conf : null;
        break;
      }
      if (data.status === "error") {
        throw new Error(`detect error: ${data.error ?? "unknown"}`);
      }
    }

    // Best-effort delete the throwaway transcript.
    fetch(`${baseUrl}/transcript/${transcriptId}`, {
      method: "DELETE",
      headers: { Authorization: ASSEMBLYAI_API_KEY },
    }).catch(() => {});

    const CONFIDENCE_THRESHOLD = 0.5;
    const lowConfidence =
      detected !== null &&
      detectedConfidence !== null &&
      detectedConfidence < CONFIDENCE_THRESHOLD;

    if (!detected || lowConfidence) {
      const reason = lowConfidence
        ? `low_confidence (lang=${detected}, conf=${detectedConfidence?.toFixed(2)})`
        : `no_language_detected (status=${lastStatus}, preview_ms=${previewMs})`;
      const reasonCode = lowConfidence ? "low_confidence" : "inconclusive";

      await supabase
        .from("jobs")
        .update({
          language_preview_error: reason,
          language_detection_diagnostics: {
            type: lowConfidence ? "low_confidence" : "inconclusive",
            preview_ms: previewMs,
            upstream_status: lastStatus,
            language_guess: detected,
            language_confidence: detectedConfidence,
            timestamp: new Date().toISOString(),
          },
        })
        .eq("id", jobId);

      return jsonResponse({
        status: "skipped",
        language: null,
        reason: reasonCode,
        fallback: true,
        preview_ms: previewMs,
      });
    }

    await supabase
      .from("jobs")
      .update({
        language_detected_preview: detected,
        language_preview_error: null,
        language_detection_diagnostics: {
          type: "success",
          preview_ms: previewMs,
          language_confidence: detectedConfidence,
          timestamp: new Date().toISOString(),
        },
      })
      .eq("id", jobId);

    return jsonResponse({
      status: "success",
      language: detected,
      preview_ms: previewMs,
    });
  } catch (err) {
    console.error("[detect-language] error:", err);
    const msg = err instanceof Error ? err.message : "unknown";
    if (jobId) {
      try {
        await supabase
          .from("jobs")
          .update({
            language_preview_error: msg.slice(0, 500),
            language_detection_diagnostics: {
              type: "runtime",
              message: msg.slice(0, 500),
              preview_ms: previewMs,
              timestamp: new Date().toISOString(),
            },
          })
          .eq("id", jobId);
      } catch { /* ignore */ }
    }
    // Soft failure: 200 with status=failed + fallback=true so the client
    // can continue straight to the full transcription without blocking.
    return jsonResponse({
      status: "failed",
      language: null,
      reason: msg.slice(0, 200),
      fallback: true,
      preview_ms: previewMs,
    });
  }
});
