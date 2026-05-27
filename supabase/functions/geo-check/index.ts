import { corsHeaders, jsonResponse, handleCorsPreflight } from "../_shared/cors.ts";
import { detectIpCountry, isAllowedCountry, ALLOWED_COUNTRY } from "../_shared/region.ts";
import { createUserClient, createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    // Optional JWT — if admin, allow regardless of IP
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      try {
        const userClient = createUserClient(authHeader);
        const { data: { user } } = await userClient.auth.getUser();
        if (user) {
          const admin = createServiceClient();
          const { data: role } = await admin
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("role", "admin")
            .maybeSingle();
          if (role) {
            return jsonResponse({
              country: detectIpCountry(req),
              allowed: true,
              adminBypass: true,
            });
          }
        }
      } catch {
        // fall through to IP-only check
      }
    }

    const country = detectIpCountry(req);
    if (!country) {
      return jsonResponse({ country: null, allowed: false, reason: "unknown" });
    }
    return jsonResponse({
      country,
      allowed: isAllowedCountry(country),
      reason: isAllowedCountry(country) ? undefined : "region_blocked",
      expected: ALLOWED_COUNTRY,
    });
  } catch (err) {
    console.error("[geo-check] error", err);
    return jsonResponse({ country: null, allowed: false, reason: "unknown" }, 200);
  }
});
