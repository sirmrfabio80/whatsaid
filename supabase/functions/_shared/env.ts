/**
 * Environment variable validation helpers for edge functions.
 *
 * Use these at the top of each function's request handler to fail fast with
 * a clear, descriptive error if any required secret is missing — instead of
 * crashing later with a confusing `ReferenceError` or `undefined is not a string`.
 *
 * Two helpers:
 *
 * 1. `requireEnv(name)` — single-var fetch. Throws if missing. Use when you
 *    only need one specific var.
 *
 * 2. `requireEnvs(names)` — batch fetch. Returns a typed record of all values
 *    keyed by name. Aggregates ALL missing names into a single error so ops
 *    only has to fix the config once. Use at the top of `Deno.serve` handlers.
 *
 * Both helpers read at call time (not module load), so functions can still
 * boot for unrelated routes (e.g. CORS preflight) even if a secret is missing.
 *
 * Example:
 *
 * ```ts
 * import { requireEnvs } from "../_shared/env.ts";
 *
 * Deno.serve(async (req) => {
 *   if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
 *
 *   try {
 *     const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ASSEMBLYAI_API_KEY } =
 *       requireEnvs(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ASSEMBLYAI_API_KEY"]);
 *     // ... use vars
 *   } catch (err) {
 *     return new Response(JSON.stringify({ error: (err as Error).message }), {
 *       status: 500,
 *       headers: { ...corsHeaders, "Content-Type": "application/json" },
 *     });
 *   }
 * });
 * ```
 */

/**
 * Read a single required env var. Throws if missing or empty.
 */
export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Read multiple required env vars. Throws a single error listing ALL
 * missing names so ops can fix everything in one pass.
 *
 * Returns a record keyed by the input names — TypeScript narrows the keys
 * to the literal union of `Names`, so destructuring is fully type-safe.
 */
export function requireEnvs<Names extends readonly string[]>(
  names: Names,
): { [K in Names[number]]: string } {
  const out = {} as { [K in Names[number]]: string };
  const missing: string[] = [];

  for (const name of names) {
    const value = Deno.env.get(name);
    if (!value) {
      missing.push(name);
    } else {
      (out as Record<string, string>)[name] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
    );
  }

  return out;
}
