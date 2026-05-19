/**
 * create-job — server-authoritative job creation.
 *
 * Replaces direct client INSERT into public.jobs. The client sends only
 * descriptive metadata; the server:
 *   1. requires a valid JWT,
 *   2. validates input strictly (file size, duration, channels, etc.),
 *   3. recomputes credits_charged from duration via the SHARED pricing module,
 *   4. inserts the row as service role with status='uploading'.
 *
 * Combined with the BEFORE UPDATE trigger that locks billing columns
 * (user_id, credits_charged, duration_seconds, file_size_bytes, file_name,
 * guest_token), this closes the "client picks how many credits to charge"
 * vector. process-job remains the only path that deducts credits, and the
 * row it reads is now trusted server-derived.
 */
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, requireAuth } from "../_shared/supabase.ts";
import {
  MAX_DURATION,
  MAX_FILE_SIZE,
  creditsForDuration,
} from "../_shared/pricing.ts";

interface CreateJobBody {
  file_name?: unknown;
  file_size_bytes?: unknown;
  duration_seconds?: unknown;
  language_selected?: unknown;
  audio_channels?: unknown;
  recorded_at?: unknown;
  recorded_at_source?: unknown;
  metadata_apple_creationdate?: unknown;
  metadata_mvhd_creation?: unknown;
  metadata_file_lastmodified?: unknown;
  metadata_location_iso6709?: unknown;
}

const LANG_RE = /^[a-z]{2,3}(-[A-Z]{2})?$|^auto$/;

function bad(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return bad("Method not allowed", 405);

  try {
    const auth = await requireAuth(req.headers.get("Authorization"));
    if (!auth.ok) return auth.response;
    const { userId } = auth;

    let body: CreateJobBody;
    try {
      body = await req.json();
    } catch {
      return bad("Invalid JSON body");
    }

    const fileName = typeof body.file_name === "string" ? body.file_name.trim() : "";
    if (!fileName || fileName.length > 512) {
      return bad("file_name is required (max 512 chars)");
    }

    const fileSize = Number(body.file_size_bytes);
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return bad("file_size_bytes must be a positive number");
    }
    if (fileSize > MAX_FILE_SIZE) {
      return bad(`file exceeds ${MAX_FILE_SIZE} bytes`);
    }

    const duration = Number(body.duration_seconds);
    if (!Number.isFinite(duration) || duration <= 0) {
      return bad("duration_seconds must be a positive number");
    }
    if (duration > MAX_DURATION) {
      return bad(`duration exceeds ${MAX_DURATION} seconds`);
    }

    const language = typeof body.language_selected === "string"
      ? body.language_selected
      : "auto";
    if (!LANG_RE.test(language)) {
      return bad("language_selected has invalid format");
    }

    let channels: number | null = null;
    if (body.audio_channels !== undefined && body.audio_channels !== null) {
      const c = Number(body.audio_channels);
      if (!Number.isInteger(c) || c < 1 || c > 8) {
        return bad("audio_channels must be 1-8");
      }
      channels = c;
    }

    const recordedAt = typeof body.recorded_at === "string" ? body.recorded_at : null;
    if (recordedAt && Number.isNaN(Date.parse(recordedAt))) {
      return bad("recorded_at must be ISO date");
    }

    const credits = creditsForDuration(Math.round(duration));

    const supabase = createServiceClient();
    const { data: row, error: insertErr } = await supabase
      .from("jobs")
      .insert({
        user_id: userId,
        file_name: fileName,
        file_size_bytes: Math.round(fileSize),
        duration_seconds: Math.round(duration),
        language_selected: language,
        credits_charged: credits,
        status: "uploading",
        processing_stage: "preparing",
        audio_channels: channels,
        recorded_at: recordedAt,
        recorded_at_source: typeof body.recorded_at_source === "string"
          ? body.recorded_at_source
          : null,
        metadata_apple_creationdate: typeof body.metadata_apple_creationdate === "string"
          ? body.metadata_apple_creationdate
          : null,
        metadata_mvhd_creation: typeof body.metadata_mvhd_creation === "string"
          ? body.metadata_mvhd_creation
          : null,
        metadata_file_lastmodified: typeof body.metadata_file_lastmodified === "string"
          ? body.metadata_file_lastmodified
          : null,
        metadata_location_iso6709: typeof body.metadata_location_iso6709 === "string"
          ? body.metadata_location_iso6709
          : null,
      })
      .select("id, credits_charged")
      .single();

    if (insertErr || !row) {
      console.error("[create-job] insert failed:", insertErr);
      return bad(insertErr?.message ?? "Could not create job", 500);
    }

    return new Response(
      JSON.stringify({ job_id: row.id, credits_charged: row.credits_charged }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[create-job] error:", err);
    return bad(err instanceof Error ? err.message : "Unknown error", 500);
  }
});
