// Body-validation tests for record-upload-attestation. We exercise the pure
// validation surface without hitting Postgres or auth — the goal is to lock
// in the contract that both acknowledgements + a known basis + a non-empty
// version string are mandatory.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const ALLOWED_BASES = new Set([
  "own_voice",
  "consent",
  "contract",
  "legitimate_interest",
  "legal_obligation",
  "other",
]);

interface Body {
  version?: unknown;
  basis?: unknown;
  contextNote?: unknown;
  acknowledgements?: { lawfulBasis?: unknown; art14Notice?: unknown };
}

function validate(body: Body): { ok: true } | { ok: false; error: string } {
  const version = typeof body.version === "string" ? body.version : "";
  if (!version || version.length > 32) return { ok: false, error: "version required" };
  const basis = typeof body.basis === "string" ? body.basis : "";
  if (!ALLOWED_BASES.has(basis)) return { ok: false, error: "Invalid lawful basis" };
  const acks = body.acknowledgements ?? {};
  if (acks.lawfulBasis !== true || acks.art14Notice !== true) {
    return { ok: false, error: "Both acknowledgements are required" };
  }
  return { ok: true };
}

Deno.test("rejects missing version", () => {
  const r = validate({ basis: "own_voice", acknowledgements: { lawfulBasis: true, art14Notice: true } });
  assertEquals(r.ok, false);
});

Deno.test("rejects unknown basis", () => {
  const r = validate({
    version: "1.0.0",
    basis: "vibes",
    acknowledgements: { lawfulBasis: true, art14Notice: true },
  });
  assertEquals(r.ok, false);
});

Deno.test("rejects missing acknowledgements", () => {
  const r = validate({
    version: "1.0.0",
    basis: "consent",
    acknowledgements: { lawfulBasis: true },
  });
  assertEquals(r.ok, false);
});

Deno.test("rejects acknowledgements that are not strictly true", () => {
  const r = validate({
    version: "1.0.0",
    basis: "consent",
    acknowledgements: { lawfulBasis: "yes", art14Notice: 1 } as never,
  });
  assertEquals(r.ok, false);
});

Deno.test("accepts a complete payload", () => {
  const r = validate({
    version: "1.0.0",
    basis: "consent",
    acknowledgements: { lawfulBasis: true, art14Notice: true },
  });
  assertEquals(r.ok, true);
});
