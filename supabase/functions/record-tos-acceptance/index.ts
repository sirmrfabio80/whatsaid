/**
 * record-tos-acceptance
 *
 * Records the user's acceptance of the current `tos_uploader_warranty`
 * version. Called once at signup, and again opportunistically at sign-in if
 * the user has not yet accepted the currently-effective version (e.g. after
 * a ToS bump). Idempotent per (user_id, version) — a duplicate call returns
 * the existing consent_event.
 *
 * The body recorded by `consent_versions.text_*` is the controller/processor
 * UK GDPR Art. 6 + Art. 14(5) warranty that replaced the per-upload modal.
 */
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth, createServiceClient } from "../_shared/supabase.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const CONSENT_TYPE = "tos_uploader_warranty";

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const auth = await requireAuth(req.headers.get("Authorization"));
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  const admin = createServiceClient();
  const now = Date.now();

  // Resolve the currently effective ToS uploader-warranty version.
  const { data: versions, error: vErr } = await admin
    .from("consent_versions")
    .select("version, effective_from, effective_to")
    .eq("consent_type", CONSENT_TYPE)
    .order("effective_from", { ascending: false });

  if (vErr) {
    console.error("[record-tos-acceptance] version lookup failed", vErr);
    return new Response(JSON.stringify({ error: "Lookup failed" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const effective = (versions ?? []).find((v) => {
    const from = v.effective_from ? new Date(v.effective_from).getTime() : 0;
    const to = v.effective_to ? new Date(v.effective_to).getTime() : Infinity;
    return from <= now && now <= to;
  });

  if (!effective) {
    return new Response(
      JSON.stringify({ error: "No effective ToS uploader-warranty version" }),
      { status: 409, headers: jsonHeaders },
    );
  }

  // Idempotent: if a row already exists for (user_id, version), return it.
  const { data: existing, error: exErr } = await admin
    .from("consent_events")
    .select("id")
    .eq("user_id", userId)
    .eq("consent_type", CONSENT_TYPE)
    .eq("version", effective.version)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (exErr) {
    console.error("[record-tos-acceptance] existence check failed", exErr);
    return new Response(JSON.stringify({ error: "Lookup failed" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  if (existing) {
    return new Response(
      JSON.stringify({
        consent_id: existing.id,
        version: effective.version,
        created: false,
      }),
      { status: 200, headers: jsonHeaders },
    );
  }

  const ipHeader =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "";
  const ipHash = ipHeader ? await hashIp(ipHeader) : null;
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 255) || null;

  const { data: inserted, error: insErr } = await admin
    .from("consent_events")
    .insert({
      user_id: userId,
      consent_type: CONSENT_TYPE,
      version: effective.version,
      ip_hash: ipHash,
      user_agent: userAgent,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    console.error("[record-tos-acceptance] insert failed", insErr);
    return new Response(JSON.stringify({ error: "Insert failed" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  return new Response(
    JSON.stringify({
      consent_id: inserted.id,
      version: effective.version,
      created: true,
    }),
    { status: 200, headers: jsonHeaders },
  );
});
