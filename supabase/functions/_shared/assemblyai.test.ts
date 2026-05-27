// deno test supabase/functions/_shared/assemblyai.test.ts
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ASSEMBLYAI_EU_BASE_URL,
  AssemblyAIRegionViolation,
  assertAssemblyAIUrl,
} from "./assemblyai.ts";

Deno.test("ASSEMBLYAI_EU_BASE_URL is the EU host", () => {
  assertEquals(ASSEMBLYAI_EU_BASE_URL, "https://api.eu.assemblyai.com/v2");
});

Deno.test("assertAssemblyAIUrl accepts EU base URL and sub-paths", () => {
  assertAssemblyAIUrl(ASSEMBLYAI_EU_BASE_URL);
  assertAssemblyAIUrl(`${ASSEMBLYAI_EU_BASE_URL}/transcript`);
  assertAssemblyAIUrl(`${ASSEMBLYAI_EU_BASE_URL}/transcript/abc-123`);
});

Deno.test("assertAssemblyAIUrl rejects US endpoint", () => {
  assertThrows(
    () => assertAssemblyAIUrl("https://api.assemblyai.com/v2/transcript"),
    AssemblyAIRegionViolation,
    "EU-only",
  );
});

Deno.test("assertAssemblyAIUrl rejects unrelated hosts", () => {
  assertThrows(
    () => assertAssemblyAIUrl("https://evil.example.com/v2/transcript"),
    AssemblyAIRegionViolation,
  );
});

Deno.test("assertAssemblyAIUrl rejects non-HTTPS", () => {
  assertThrows(
    () => assertAssemblyAIUrl("http://api.eu.assemblyai.com/v2/transcript"),
    AssemblyAIRegionViolation,
    "non-HTTPS",
  );
});

Deno.test("assertAssemblyAIUrl rejects invalid URL strings", () => {
  assertThrows(
    () => assertAssemblyAIUrl("not a url"),
    AssemblyAIRegionViolation,
    "invalid URL",
  );
});
