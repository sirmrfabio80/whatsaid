/**
 * dsr-rectification-request — UK GDPR Art. 16 (right to rectification) intake.
 *
 * The user can self-edit non-sensitive profile fields (display name, voice,
 * language, etc.) directly from Settings. This endpoint is the audited path
 * for fields they cannot edit themselves and which need human review:
 *
 *   - `email`   — account-takeover risk; needs verification before applying
 *   - `country` — geo-immutable (UK-only enforcement); needs admin override
 *
 * Anything else is rejected. We deliberately do NOT auto-apply: the function's
 * only job is to write a tracked, timed `dsr_requests` row and notify the
 * admin. The admin applies the change via `public.admin_apply_rectification`.
 */
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, requireAuth } from "../_shared/supabase.ts";
import { ADMIN_NOTIFY_EMAIL } from "../_shared/constants.ts";

const ALLOWED_FIELDS = new Set(["email", "country"]);
const MIN_REASON = 10;
const MAX_REASON = 2000;
const MAX_VALUE = 320; // Generous upper bound covering RFC 5321 email length.

function notifyAdmin(
  payload: {
    requestId: string;
    userEmail: string | null;
    userId: string;
    field: string;
    requestedValue: string;
    reason: string;
  },
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return Promise.resolve();
  return fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify({
      templateName: "admin-dsr-rectification",
      recipientEmail: ADMIN_NOTIFY_EMAIL,
      idempotencyKey: `dsr-rect-${payload.requestId}`,
      templateData: {
        requestId: payload.requestId,
        userEmail: payload.userEmail,
        userId: payload.userId,
        field: payload.field,
        requestedValue: payload.requestedValue,
        reason: payload.reason,
        submittedAt: new Date().toISOString(),
      },
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        console.error(
          "[dsr-rectification-request] admin email non-ok",
          res.status,
          await res.text(),
        );
      }
    })
    .catch((err) =>
      console.error("[dsr-rectification-request] admin email failed", err)
    );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const auth = await requireAuth(req.headers.get("Authorization"));
    if (!auth.ok) return auth.response;
    const { userId, email } = auth;

    let body: { field?: unknown; requested_value?: unknown; reason?: unknown };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const field = typeof body.field === "string" ? body.field.trim() : "";
    const value = typeof body.requested_value === "string" ? body.requested_value.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!ALLOWED_FIELDS.has(field)) {
      return new Response(
        JSON.stringify({ error: "Field not eligible for rectification request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!value || value.length > MAX_VALUE) {
      return new Response(JSON.stringify({ error: "Requested value invalid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (field === "country" && !/^[A-Za-z]{2}$/.test(value)) {
      return new Response(JSON.stringify({ error: "Country must be ISO-2" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (field === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      return new Response(JSON.stringify({ error: "Email format invalid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (reason.length < MIN_REASON || reason.length > MAX_REASON) {
      return new Response(
        JSON.stringify({ error: `Reason must be ${MIN_REASON}-${MAX_REASON} chars` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createServiceClient();

    // Prevent duplicate pending requests for the same field — keeps the admin
    // queue clean and stops accidental double-submits.
    const { data: existing } = await admin
      .from("dsr_requests")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "rectification")
      .eq("field", field)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      return new Response(
        JSON.stringify({
          error: "You already have a pending request for this field",
          request_id: existing.id,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: inserted, error: insErr } = await admin
      .from("dsr_requests")
      .insert({
        user_id: userId,
        kind: "rectification",
        status: "pending",
        requested_via: "self_service",
        field,
        requested_value: value,
        reason,
      })
      .select("id, created_at")
      .single();
    if (insErr || !inserted) {
      console.error("[dsr-rectification-request] insert failed", insErr);
      return new Response(JSON.stringify({ error: "Could not record request" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fire-and-forget admin notification.
    notifyAdmin({
      requestId: inserted.id,
      userEmail: email,
      userId,
      field,
      requestedValue: value,
      reason,
    });

    return new Response(
      JSON.stringify({
        request_id: inserted.id,
        sla_days: 30,
        created_at: inserted.created_at,
      }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[dsr-rectification-request] unhandled", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
