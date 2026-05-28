// Record a per-purchase Reg. 37 consent event.
// Authenticated callers only. Inserts a row into public.consent_events using
// the service-role client (RLS is service-role-only for INSERT).

import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth, createServiceClient } from "../_shared/supabase.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

interface Body {
  consent_type?: unknown;
  version?: unknown;
  package_id?: unknown;
  idempotency_key?: unknown;
}

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 256;
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

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const { consent_type, version, package_id } = body;
  if (!isString(consent_type) || !isString(version)) {
    return new Response(
      JSON.stringify({ error: "consent_type and version required" }),
      { status: 400, headers: jsonHeaders },
    );
  }
  if (package_id !== undefined && package_id !== null && !isString(package_id)) {
    return new Response(JSON.stringify({ error: "Invalid package_id" }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const headerKey = req.headers.get("x-idempotency-key");
  const bodyKey = typeof body.idempotency_key === "string" ? body.idempotency_key : null;
  const idempotencyKey = (headerKey ?? bodyKey ?? "").trim() || null;
  if (idempotencyKey && !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
    return new Response(
      JSON.stringify({ error: "idempotency_key must be 8-128 url-safe characters" }),
      { status: 400, headers: jsonHeaders },
    );
  }

  const admin = createServiceClient();

  if (idempotencyKey) {
    const { data: existing, error: idemErr } = await admin
      .from("consent_events")
      .select("id")
      .eq("user_id", auth.userId)
      .eq("consent_type", consent_type)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (idemErr) {
      console.error("[record-consent] idempotency lookup failed", idemErr);
      return new Response(JSON.stringify({ error: "Lookup failed" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }
    if (existing) {
      return new Response(
        JSON.stringify({ ok: true, consent_id: existing.id, idempotent_replay: true }),
        { status: 200, headers: jsonHeaders },
      );
    }
  }

  // Verify the version exists, matches consent_type, and is currently effective.
  const { data: versionRow, error: vErr } = await admin
    .from("consent_versions")
    .select("version, consent_type, effective_from, effective_to")
    .eq("version", version)
    .maybeSingle();

  if (vErr) {
    console.error("[record-consent] version lookup failed", vErr);
    return new Response(JSON.stringify({ error: "Lookup failed" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
  const now = Date.now();
  if (
    !versionRow ||
    versionRow.consent_type !== consent_type ||
    (versionRow.effective_from && new Date(versionRow.effective_from).getTime() > now) ||
    (versionRow.effective_to && new Date(versionRow.effective_to).getTime() < now)
  ) {
    return new Response(
      JSON.stringify({ error: "Unknown or expired consent version" }),
      { status: 409, headers: jsonHeaders },
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
      consent_type,
      version,
      package_id: (package_id as string | undefined) ?? null,
      ip_hash: ipHash,
      user_agent: ua || null,
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    // Race-loser on the unique index — return the prior row instead of 500.
    if (idempotencyKey && (insErr as { code?: string } | null)?.code === "23505") {
      const { data: winner } = await admin
        .from("consent_events")
        .select("id")
        .eq("user_id", auth.userId)
        .eq("consent_type", consent_type)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (winner) {
        return new Response(
          JSON.stringify({ ok: true, consent_id: winner.id, idempotent_replay: true }),
          { status: 200, headers: jsonHeaders },
        );
      }
    }
    console.error("[record-consent] insert failed", insErr);
    return new Response(JSON.stringify({ error: "Insert failed" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  return new Response(
    JSON.stringify({ ok: true, consent_id: inserted.id }),
    { status: 200, headers: jsonHeaders },
  );
});

