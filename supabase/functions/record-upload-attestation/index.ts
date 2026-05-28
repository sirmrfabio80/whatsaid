/**
 * record-upload-attestation
 *
 * Per-upload UK GDPR Art. 6 + Art. 14 attestation. The client calls this
 * immediately before `create-job`; the returned `consent_id` is then passed
 * to `create-job`, which verifies and pins it onto `jobs.upload_consent_id`.
 *
 * - Authenticated callers only.
 * - Validates the version matches an effective row in `consent_versions`
 *   for `consent_type = 'upload_lawful_basis'`.
 * - Stores the chosen lawful basis + optional context note in metadata so
 *   audits can reproduce what the user declared.
 */
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, requireAuth } from "../_shared/supabase.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const ALLOWED_BASES = new Set([
  "own_voice",
  "consent",
  "contract",
  "legitimate_interest",
  "legal_obligation",
  "other",
]);

interface Body {
  version?: unknown;
  basis?: unknown;
  contextNote?: unknown;
  acknowledgements?: { lawfulBasis?: unknown; art14Notice?: unknown };
}

function bad(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: jsonHeaders,
  });
}

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
  if (req.method !== "POST") return bad("Method not allowed", 405);

  const auth = await requireAuth(req.headers.get("Authorization"));
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }

  const version = typeof body.version === "string" ? body.version : "";
  if (!version || version.length > 32) return bad("version required");

  const basis = typeof body.basis === "string" ? body.basis : "";
  if (!ALLOWED_BASES.has(basis)) return bad("Invalid lawful basis");

  const acks = body.acknowledgements ?? {};
  if (acks.lawfulBasis !== true || acks.art14Notice !== true) {
    return bad("Both acknowledgements are required");
  }

  let contextNote: string | null = null;
  if (typeof body.contextNote === "string" && body.contextNote.trim().length > 0) {
    contextNote = body.contextNote.trim().slice(0, 280);
  }

  const admin = createServiceClient();

  // Verify the version is currently effective for upload_lawful_basis.
  const { data: versionRow, error: vErr } = await admin
    .from("consent_versions")
    .select("version, consent_type, effective_from, effective_to")
    .eq("consent_type", "upload_lawful_basis")
    .eq("version", version)
    .maybeSingle();

  if (vErr) {
    console.error("[record-upload-attestation] version lookup failed", vErr);
    return bad("Lookup failed", 500);
  }
  const now = Date.now();
  if (
    !versionRow ||
    (versionRow.effective_from && new Date(versionRow.effective_from).getTime() > now) ||
    (versionRow.effective_to && new Date(versionRow.effective_to).getTime() < now)
  ) {
    return bad("Stale or unknown consent version", 409);
  }

  const ipHeader =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "";
  const ipHash = ipHeader ? await hashIp(ipHeader) : null;
  const userAgent = req.headers.get("user-agent") ?? null;

  const { data: inserted, error: insertErr } = await admin
    .from("consent_events")
    .insert({
      user_id: userId,
      consent_type: "upload_lawful_basis",
      version,
      ip_hash: ipHash,
      user_agent: userAgent,
      metadata: { basis, contextNote },
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error("[record-upload-attestation] insert failed", insertErr);
    return bad(insertErr?.message ?? "Could not record attestation", 500);
  }

  return new Response(JSON.stringify({ consent_id: inserted.id }), {
    status: 200,
    headers: jsonHeaders,
  });
});
