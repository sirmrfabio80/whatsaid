/**
 * Regression guard: suggest-speakers must reject unauthenticated callers.
 * Phase 1 spend guardrail — previously this function accepted anonymous
 * requests, leaving an open path to the AI gateway.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const FUNCTION_URL = Deno.env.get("SUPABASE_URL")
  ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/suggest-speakers`
  : null;

Deno.test({
  name: "suggest-speakers rejects requests without Authorization header",
  ignore: !FUNCTION_URL,
  fn: async () => {
    const res = await fetch(FUNCTION_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript_lines: [],
        target_speaker: "A",
        existing_speakers: [],
      }),
    });
    await res.body?.cancel();
    assertEquals(res.status, 401);
  },
});

Deno.test({
  name: "suggest-speakers rejects requests with bogus bearer token",
  ignore: !FUNCTION_URL,
  fn: async () => {
    const res = await fetch(FUNCTION_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer not-a-real-jwt",
      },
      body: JSON.stringify({
        transcript_lines: [],
        target_speaker: "A",
        existing_speakers: [],
      }),
    });
    await res.body?.cancel();
    assertEquals(res.status, 401);
  },
});
