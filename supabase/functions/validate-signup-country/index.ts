import { corsHeaders, jsonResponse, handleCorsPreflight } from "../_shared/cors.ts";
import { detectIpCountry, ALLOWED_COUNTRY } from "../_shared/region.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: { declaredCountry?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ allowed: false, reason: "invalid_body" }, 400);
  }

  const declared = typeof body.declaredCountry === "string"
    ? body.declaredCountry.toUpperCase()
    : "";

  if (!/^[A-Z]{2}$/.test(declared)) {
    return jsonResponse({ allowed: false, reason: "declared_invalid" }, 400);
  }
  if (declared !== ALLOWED_COUNTRY) {
    return jsonResponse({ allowed: false, reason: "declared_not_gb" });
  }

  const ipCountry = detectIpCountry(req);
  if (ipCountry && ipCountry !== ALLOWED_COUNTRY) {
    return jsonResponse({
      allowed: false,
      reason: "ip_not_gb",
      ipCountry,
    });
  }

  // declared = GB and IP is either GB or unknown → allow
  return jsonResponse({
    allowed: true,
    country: ALLOWED_COUNTRY,
    ipCountry,
  });
});
