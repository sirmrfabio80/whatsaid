import { corsHeaders, jsonResponse, handleCorsPreflight } from "../_shared/cors.ts";
import { createServiceClient, requireAuth } from "../_shared/supabase.ts";
import { detectIpCountry, ALLOWED_COUNTRY, isAllowedCountry, logAdminBypass } from "../_shared/region.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const auth = await requireAuth(req.headers.get("Authorization"));
  if (!auth.ok) return auth.response;
  const { userId } = auth;

  const admin = createServiceClient();

  // Admin bypass
  const { data: role } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (role) {
    const country = detectIpCountry(req);
    logAdminBypass(req, userId, "check-login-region", country).catch(() => {});
    return jsonResponse({ allowed: true, adminBypass: true });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("country")
    .eq("user_id", userId)
    .maybeSingle();

  const stored = profile?.country ?? null;
  const ipCountry = detectIpCountry(req);

  // Strict rule (Option B): non-admins must (a) have GB or unknown profile
  // country, AND (b) be connecting from a GB IP right now. Unknown IP fails
  // closed. Travelling GB users and privacy-proxy users are intentionally
  // blocked — the only exception is admin bypass above.
  if (stored && stored !== ALLOWED_COUNTRY) {
    return jsonResponse({ allowed: false, reason: "region_blocked", country: stored });
  }

  if (!ipCountry) {
    return jsonResponse({ allowed: false, reason: "unknown", country: stored });
  }

  if (!isAllowedCountry(ipCountry)) {
    if (!stored) {
      await admin.from("profiles").update({ country: ipCountry }).eq("user_id", userId);
    }
    return jsonResponse({ allowed: false, reason: "region_blocked", country: ipCountry });
  }

  // IP is GB. Backfill profile.country if it was null.
  if (!stored) {
    await admin.from("profiles").update({ country: ALLOWED_COUNTRY }).eq("user_id", userId);
    return jsonResponse({ allowed: true, country: ALLOWED_COUNTRY, backfilled: true });
  }

  return jsonResponse({ allowed: true, country: ALLOWED_COUNTRY });
});
