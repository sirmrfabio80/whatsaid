/**
 * Regression guard: regenerate must reject unauthenticated callers.
 * Phase 2 spend guardrail — closes prior anonymous access to the AI gateway.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const FUNCTION_URL = Deno.env.get("SUPABASE_URL")
  ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/regenerate`
  : null;

const body = JSON.stringify({
  job_id: "00000000-0000-0000-0000-000000000000",
  output_type: "summary",
});

Deno.test({
  name: "regenerate rejects requests without Authorization header",
  ignore: !FUNCTION_URL,
  fn: async () => {
    const res = await fetch(FUNCTION_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    await res.body?.cancel();
    assertEquals(res.status, 401);
  },
});

Deno.test({
  name: "regenerate rejects requests with bogus bearer token",
  ignore: !FUNCTION_URL,
  fn: async () => {
    const res = await fetch(FUNCTION_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer not-a-real-jwt",
      },
      body,
    });
    await res.body?.cancel();
    assertEquals(res.status, 401);
  },
});
