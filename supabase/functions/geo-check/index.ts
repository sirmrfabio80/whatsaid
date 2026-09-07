import { corsHeaders, jsonResponse, handleCorsPreflight } from "../_shared/cors.ts";
import { resolveRequestCountry, isAllowedCountry, ALLOWED_COUNTRY, logAdminBypass } from "../_shared/region.ts";
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
            const country = await resolveRequestCountry(req);
            // Audit only when bypass actually mattered (non-GB / unknown).
            logAdminBypass(req, user.id, "geo-check", country).catch(() => {});
            return jsonResponse({
              country,
              allowed: true,
              adminBypass: true,
            });
          }
        }
      } catch {
        // fall through to IP-only check
      }
    }

    const country = await resolveRequestCountry(req);
    if (!country) {
      // Location genuinely unknown: do NOT show visitors a region block.
      // Signup / login / checkout still fail closed server-side.
      return jsonResponse({ country: null, allowed: true, reason: "unknown" });
    }
    return jsonResponse({
      country,
      allowed: isAllowedCountry(country),
      reason: isAllowedCountry(country) ? undefined : "region_blocked",
      expected: ALLOWED_COUNTRY,
    });
  } catch (err) {
    console.error("[geo-check] error", err);
    return jsonResponse({ country: null, allowed: true, reason: "unknown" }, 200);
  }
});
