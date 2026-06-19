/**
 * admin-generate-reset-link
 *
 * Admin-only edge function used by the E2E test suite (and ad-hoc support
 * tooling) to generate a password recovery link without going through the
 * email pipeline.
 *
 * - Caller must be authenticated AND have the 'admin' role
 *   (enforced by requireAdmin).
 * - Body: { email: string, redirectTo?: string }
 * - Returns: { action_link, recovery_url, email_otp?, hashed_token?, redirect_to }
 *
 * The action_link is the exact URL Supabase would otherwise embed in the
 * recovery email. Tests can navigate straight to it.
 */
import { corsHeaders, jsonResponse, handleCorsPreflight } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const auth = await requireAdmin(req.headers.get("Authorization"));
    if (!auth.ok) return auth.response;
    const { adminClient } = auth;

    let body: { email?: unknown; redirectTo?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "invalid JSON body" }, 400);
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "email is required" }, 400);
    }
    const redirectTo = typeof body.redirectTo === "string" && body.redirectTo
      ? body.redirectTo
      : undefined;

    const { data, error } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: redirectTo ? { redirectTo } : undefined,
    });

    if (error) {
      console.error("[admin-generate-reset-link] generateLink failed", {
        email,
        message: error.message,
      });
      return jsonResponse({ error: error.message }, 400);
    }

    const props = data?.properties;
    console.info("[admin-generate-reset-link] link generated", {
      email,
      hasActionLink: !!props?.action_link,
      redirectTo,
    });

    const recoveryUrl = props?.hashed_token && (props?.redirect_to ?? redirectTo)
      ? (() => {
          const url = new URL(props.redirect_to ?? redirectTo as string);
          url.searchParams.set("token_hash", props.hashed_token);
          url.searchParams.set("type", "recovery");
          return url.toString();
        })()
      : null;

    return jsonResponse({
      action_link: props?.action_link ?? null,
      recovery_url: recoveryUrl,
      hashed_token: props?.hashed_token ?? null,
      email_otp: props?.email_otp ?? null,
      redirect_to: props?.redirect_to ?? redirectTo ?? null,
    });
  } catch (err) {
    console.error("[admin-generate-reset-link] error", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
