// record-tos-acceptance — idempotent ToS uploader-warranty acceptance.
//
// Called by Signup (and opportunistically by AuthContext on sign-in) to
// record that the user has accepted the current `tos_uploader_warranty`
// version. Idempotent per (user_id, version): if a row already exists for
// that pair, returns it instead of inserting a duplicate.

import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth, createServiceClient } from "../_shared/supabase.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const CONSENT_TYPE = "tos_uploader_warranty";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const auth = await requireAuth(req.headers.get("Authorization"));
  if (!auth.ok) return auth.response;

  // Optional client-supplied idempotency key. The (user_id, version) check
  // below already collapses duplicates per ToS version, but the explicit key
  // also collapses retries that happen before the (user_id, version) row is
  // committed, and lets the client observe whether the call was a replay.
  let idempotencyKey: string | null = null;
  const headerKey = req.headers.get("x-idempotency-key");
  if (headerKey) {
    idempotencyKey = headerKey.trim() || null;
  } else if (req.headers.get("content-length") && req.headers.get("content-length") !== "0") {
    try {
      const body = await req.json().catch(() => null) as { idempotency_key?: unknown } | null;
      if (body && typeof body.idempotency_key === "string") {
        idempotencyKey = body.idempotency_key.trim() || null;
      }
    } catch {
      // ignore — body is optional
    }
  }
  if (idempotencyKey && !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
    return new Response(
      JSON.stringify({ error: "idempotency_key must be 8-128 url-safe characters" }),
      { status: 400, headers: jsonHeaders },
    );
  }

  const admin = createServiceClient();
  const now = new Date().toISOString();

  if (idempotencyKey) {
    const { data: replay } = await admin
      .from("consent_events")
      .select("id, version")
      .eq("user_id", auth.userId)
      .eq("consent_type", CONSENT_TYPE)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (replay) {
      return new Response(
        JSON.stringify({
          ok: true,
          consent_id: replay.id,
          version: replay.version,
          already: true,
          idempotent_replay: true,
        }),
        { status: 200, headers: jsonHeaders },
      );
    }
  }

  // Resolve the current effective version for this consent type.
  const { data: versionRow, error: vErr } = await admin
    .from("consent_versions")
    .select("version, effective_from, effective_to")
    .eq("consent_type", CONSENT_TYPE)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (vErr) {
    console.error("[record-tos-acceptance] version lookup failed", vErr);
    return new Response(JSON.stringify({ error: "Lookup failed" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
  if (!versionRow) {
    return new Response(
      JSON.stringify({ error: "No effective tos_uploader_warranty version" }),
      { status: 409, headers: jsonHeaders },
    );
  }

  // Idempotent: re-use any existing acceptance for this user + version.
  const { data: existing, error: exErr } = await admin
    .from("consent_events")
    .select("id")
    .eq("user_id", auth.userId)
    .eq("consent_type", CONSENT_TYPE)
    .eq("version", versionRow.version)
    .maybeSingle();
  if (exErr) {
    console.error("[record-tos-acceptance] existing lookup failed", exErr);
    return new Response(JSON.stringify({ error: "Lookup failed" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
  if (existing) {
    return new Response(
      JSON.stringify({ ok: true, consent_id: existing.id, version: versionRow.version, already: true }),
      { status: 200, headers: jsonHeaders },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  const ipHash = await hashIp(ip);
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 255);

  const { data: inserted, error: insErr } = await admin
    .from("consent_events")
    .insert({
      user_id: auth.userId,
      consent_type: CONSENT_TYPE,
      version: versionRow.version,
      ip_hash: ipHash,
      user_agent: ua || null,
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    if (idempotencyKey && (insErr as { code?: string } | null)?.code === "23505") {
      const { data: winner } = await admin
        .from("consent_events")
        .select("id, version")
        .eq("user_id", auth.userId)
        .eq("consent_type", CONSENT_TYPE)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (winner) {
        return new Response(
          JSON.stringify({
            ok: true,
            consent_id: winner.id,
            version: winner.version,
            already: true,
            idempotent_replay: true,
          }),
          { status: 200, headers: jsonHeaders },
        );
      }
    }
    console.error("[record-tos-acceptance] insert failed", insErr);
    return new Response(JSON.stringify({ error: "Insert failed" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  return new Response(
    JSON.stringify({ ok: true, consent_id: inserted.id, version: versionRow.version, already: false }),
    { status: 200, headers: jsonHeaders },
  );
});

