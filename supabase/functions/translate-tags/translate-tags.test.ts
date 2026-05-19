/**
 * Regression guard: translate-tags must reject unauthenticated callers.
 * Phase 2 spend guardrail — closes prior anonymous access to the AI gateway.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const FUNCTION_URL = Deno.env.get("SUPABASE_URL")
  ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/translate-tags`
  : null;

const body = JSON.stringify({
  tags: [{ id: "1", name: "meeting" }],
  target_lang: "it",
});

Deno.test({
  name: "translate-tags rejects requests without Authorization header",
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
  name: "translate-tags rejects requests with bogus bearer token",
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
