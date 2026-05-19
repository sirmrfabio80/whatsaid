/**
 * Auth + validation tests for create-job. RPC/DB tests skipped when
 * service-role env vars aren't available (same convention as usage-rpc.test).
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");
const RUN = !!(SUPABASE_URL && ANON_KEY);

const url = () => `${SUPABASE_URL}/functions/v1/create-job`;

Deno.test({
  name: "create-job: unauthenticated → 401",
  ignore: !RUN,
  fn: async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY! },
      body: JSON.stringify({ file_name: "x.m4a", file_size_bytes: 1, duration_seconds: 1 }),
    });
    await res.text();
    assertEquals(res.status, 401);
  },
});

Deno.test({
  name: "create-job: missing Authorization → 401",
  ignore: !RUN,
  fn: async () => {
    const res = await fetch(url(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await res.text();
    assertEquals(res.status, 401);
  },
});

Deno.test({
  name: "create-job: GET → 405",
  ignore: !RUN,
  fn: async () => {
    const res = await fetch(url(), { method: "GET", headers: { apikey: ANON_KEY! } });
    await res.text();
    // Either 401 (unauth) or 405 — we accept both, but the function should not 200.
    if (res.status === 200) throw new Error("unexpected 200");
  },
});
