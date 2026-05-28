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
  uploader_warranty_confirmed?: unknown;
  audio_channels?: unknown;
  recorded_at?: unknown;
  recorded_at_source?: unknown;
  metadata_apple_creationdate?: unknown;
  metadata_mvhd_creation?: unknown;
  metadata_file_lastmodified?: unknown;
  metadata_location_iso6709?: unknown;
  idempotency_key?: unknown;
}

const TOS_UPLOADER_CONSENT_TYPE = "tos_uploader_warranty";

const LANG_RE = /^[a-z]{2,3}(-[A-Z]{2})?$|^auto$/;
// Idempotency keys are opaque client-generated strings (we recommend UUIDs).
// Accept up to 128 chars of url-safe characters; reject anything else.
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;


async function hashIp(ip: string): Promise<string> {
  const secret = Deno.env.get("CONSENT_IP_SALT_SECRET") ?? "missing-salt";
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${day}|${ip}`),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}


function bad(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
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

    // Idempotency: clients pass either an X-Idempotency-Key header or
    // body.idempotency_key. If a previous request from this user used the
    // same key we return the prior job instead of inserting a duplicate.
    const headerKey = req.headers.get("x-idempotency-key");
    const bodyKey = typeof body.idempotency_key === "string" ? body.idempotency_key : null;
    const idempotencyKey = (headerKey ?? bodyKey ?? "").trim() || null;
    if (idempotencyKey && !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
      return bad("idempotency_key must be 8-128 url-safe characters");
    }

    if (idempotencyKey) {
      const supabaseLookup = createServiceClient();
      const { data: existing, error: lookupErr } = await supabaseLookup
        .from("jobs")
        .select("id, credits_charged")
        .eq("user_id", userId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (lookupErr) {
        console.error("[create-job] idempotency lookup failed", lookupErr);
        return bad("Idempotency lookup failed", 500);
      }
      if (existing) {
        return new Response(
          JSON.stringify({
            job_id: existing.id,
            credits_charged: existing.credits_charged,
            idempotent_replay: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

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

    // Server-resolved uploader warranty. The user accepts this once at signup
    // (and again on any future ToS bump). create-job pins the latest consent
    // event of this type to jobs.upload_consent_id for audit. If no row
    // exists yet, signal the client to re-accept Terms.
    let { data: consentRow, error: consentErr } = await supabase
      .from("consent_events")
      .select("id")
      .eq("user_id", userId)
      .eq("consent_type", TOS_UPLOADER_CONSENT_TYPE)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (consentErr) {
      console.error("[create-job] consent lookup failed", consentErr);
      return bad("Could not verify acceptance", 500);
    }
    if (!consentRow) {
      if (body.uploader_warranty_confirmed !== true) {
        return new Response(
          JSON.stringify({ error: "attestation_required" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const now = new Date().toISOString();
      const { data: versionRow, error: versionErr } = await supabase
        .from("consent_versions")
        .select("version")
        .eq("consent_type", TOS_UPLOADER_CONSENT_TYPE)
        .lte("effective_from", now)
        .or(`effective_to.is.null,effective_to.gt.${now}`)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (versionErr) {
        console.error("[create-job] consent version lookup failed", versionErr);
        return bad("Could not verify acceptance", 500);
      }
      if (!versionRow) return bad("No effective uploader warranty version", 409);

      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("cf-connecting-ip") ||
        "unknown";
      const { data: insertedConsent, error: insertConsentErr } = await supabase
        .from("consent_events")
        .insert({
          user_id: userId,
          consent_type: TOS_UPLOADER_CONSENT_TYPE,
          version: versionRow.version,
          ip_hash: await hashIp(ip),
          user_agent: (req.headers.get("user-agent") ?? "").slice(0, 255) || null,
          metadata: { source: "create-job" },
        })
        .select("id")
        .single();
      if (insertConsentErr || !insertedConsent) {
        console.error("[create-job] consent insert failed", insertConsentErr);
        return bad("Could not record acceptance", 500);
      }
      consentRow = insertedConsent;
    }
    const consentId = consentRow.id;


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
        upload_consent_id: consentId,
        idempotency_key: idempotencyKey,
      })
      .select("id, credits_charged")
      .single();

    if (insertErr || !row) {
      // Race: a concurrent request with the same idempotency_key won the
      // unique index. Look up and return the winner instead of erroring.
      // Postgres unique_violation = 23505.
      if (idempotencyKey && (insertErr as { code?: string } | null)?.code === "23505") {
        const { data: winner } = await supabase
          .from("jobs")
          .select("id, credits_charged")
          .eq("user_id", userId)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (winner) {
          return new Response(
            JSON.stringify({
              job_id: winner.id,
              credits_charged: winner.credits_charged,
              idempotent_replay: true,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
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
