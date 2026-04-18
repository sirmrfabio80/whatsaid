/**
 * Supabase client helpers shared across edge functions.
 *
 * - `createServiceClient()` returns a service-role client that bypasses RLS.
 *   Use for trusted server-side mutations (job updates, deletes, etc).
 * - `createUserClient(authHeader)` returns an anon-key client that forwards
 *   the caller's Authorization header. Use to identify the calling user via
 *   `client.auth.getUser()` and to enforce RLS as that user.
 *
 * Both helpers read env vars at call time (not module load) so missing vars
 * surface as clear runtime errors at the call site rather than import time.
 *
 * The `@supabase/supabase-js` import version is intentionally pinned to a
 * single esm.sh URL across all callers to keep the dependency graph small.
 * If you bump it, bump it everywhere.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

/**
 * Service-role client. Bypasses RLS — use only for trusted server logic.
 */
export function createServiceClient(): SupabaseClient {
  const url = requireEnv("SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceKey);
}

/**
 * Anon-key client that forwards the caller's Authorization header so
 * `client.auth.getUser()` resolves the calling user and queries are subject
 * to that user's RLS policies.
 */
export function createUserClient(authHeader: string): SupabaseClient {
  const url = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
}

// Re-export createClient + types so callers that need a custom config
// (e.g. admin auth client, custom fetch) can still use the same pinned
// supabase-js version without adding a second import URL.
export { createClient };
export type { SupabaseClient };

/**
 * Result of a `requireAdmin` check.
 *
 * - `ok: true` — the caller is authenticated AND has the 'admin' role.
 *   Includes the resolved `userId` and a ready-to-use service-role
 *   `adminClient` (callers almost always need one immediately after).
 * - `ok: false` — auth or role check failed. Includes a fully-formed
 *   `Response` (with CORS headers) the caller can return as-is.
 */
export type RequireAdminResult =
  | { ok: true; userId: string; adminClient: SupabaseClient }
  | { ok: false; response: Response };

/**
 * Verify that the request is from an authenticated admin user.
 *
 * Performs:
 *   1. `Authorization: Bearer <jwt>` presence check
 *   2. `getClaims(token)` to resolve the calling user
 *   3. `has_role(_user_id, 'admin')` RPC to confirm role membership
 *
 * Returns a discriminated union so callers can early-return the prepared
 * 401/403 response without re-implementing CORS or status handling:
 *
 * ```ts
 * const auth = await requireAdmin(req.headers.get("Authorization"));
 * if (!auth.ok) return auth.response;
 * const { userId, adminClient } = auth;
 * ```
 */
export async function requireAdmin(
  authHeader: string | null,
): Promise<RequireAdminResult> {
  // Lazy import to avoid a circular dep if cors.ts ever imports from here.
  const { corsHeaders } = await import("./cors.ts");
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      }),
    };
  }

  const userClient = createUserClient(authHeader);
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      }),
    };
  }
  const userId = claimsData.claims.sub as string;

  const adminClient = createServiceClient();
  const { data: isAdmin } = await adminClient.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: jsonHeaders,
      }),
    };
  }

  return { ok: true, userId, adminClient };
}
