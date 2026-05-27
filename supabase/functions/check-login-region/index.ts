import { corsHeaders, jsonResponse, handleCorsPreflight } from "../_shared/cors.ts";
import { createServiceClient, requireAuth } from "../_shared/supabase.ts";
import { detectIpCountry, ALLOWED_COUNTRY, isAllowedCountry } from "../_shared/region.ts";

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
    return jsonResponse({ allowed: true, adminBypass: true });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("country")
    .eq("user_id", userId)
    .maybeSingle();

  const stored = profile?.country ?? null;
  if (stored === ALLOWED_COUNTRY) {
    return jsonResponse({ allowed: true, country: stored });
  }
  if (stored && stored !== ALLOWED_COUNTRY) {
    return jsonResponse({ allowed: false, reason: "region_blocked", country: stored });
  }

  // stored is NULL → fall back to IP detection and backfill
  const ipCountry = detectIpCountry(req);
  if (ipCountry && isAllowedCountry(ipCountry)) {
    await admin.from("profiles").update({ country: ALLOWED_COUNTRY }).eq("user_id", userId);
    return jsonResponse({ allowed: true, country: ALLOWED_COUNTRY, backfilled: true });
  }

  // Store sentinel/detected code so future logins are fast.
  const toStore = ipCountry && /^[A-Z]{2}$/.test(ipCountry) ? ipCountry : "XX";
  // 'XX' fails the iso2 check (it doesn't — it matches /^[A-Z]{2}$/), so we can store it.
  await admin.from("profiles").update({ country: toStore }).eq("user_id", userId);

  return jsonResponse({
    allowed: false,
    reason: ipCountry ? "region_blocked" : "unknown",
    country: toStore,
  });
});
