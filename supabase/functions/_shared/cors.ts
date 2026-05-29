/**
 * Canonical CORS headers for WhatSaid edge functions.
 *
 * Allow-Origin is `*` (functions are called from the SPA + shared/guest links).
 * Allow-Headers is the superset of headers the Supabase JS client and our
 * frontend actually send today, including the `x-supabase-client-*` runtime
 * markers introduced by recent SDK versions.
 *
 * Functions that need to accept an extra custom header (e.g. `x-share-token`)
 * should compose using `withExtraAllowedHeaders()` instead of redefining the
 * headers locally.
 */

const ALLOWED_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-idempotency-key",
  "x-supabase-client-platform",
  "x-supabase-client-platform-version",
  "x-supabase-client-runtime",
  "x-supabase-client-runtime-version",
];

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": ALLOWED_HEADERS.join(", "),
};

/**
 * Returns the standard `corsHeaders` augmented with extra allowed request
 * headers. Use for endpoints that accept custom headers (e.g. webhook
 * signatures, share tokens).
 */
export function withExtraAllowedHeaders(
  ...extra: string[]
): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": [...ALLOWED_HEADERS, ...extra].join(", "),
  };
}

/**
 * Standard JSON response helper that always includes CORS headers.
 *
 *   return jsonResponse({ ok: true });
 *   return jsonResponse({ error: "bad input" }, 400);
 *   return jsonResponse({ ok: true }, 200, customCorsHeaders);
 */
export function jsonResponse(
  body: unknown,
  status: number = 200,
  headers: Record<string, string> = corsHeaders,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

/**
 * Returns a CORS preflight response if the request is an OPTIONS request,
 * otherwise `null`. Lets call sites collapse the boilerplate to:
 *
 *   const preflight = handleCorsPreflight(req);
 *   if (preflight) return preflight;
 */
export function handleCorsPreflight(
  req: Request,
  headers: Record<string, string> = corsHeaders,
): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response("ok", { headers });
}
