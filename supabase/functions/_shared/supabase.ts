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
