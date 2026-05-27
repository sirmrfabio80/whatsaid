/**
 * Auth-gate smoke test for prune-retention.
 *
 * The function refuses everything that is not service_role or a verified
 * admin. We can't safely run the full sweep against the live DB from a test,
 * but we can prove the gate by invoking with an anon JWT and asserting 403.
 *
 * Skips when local creds aren't available.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const FN_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/prune-retention` : null;

Deno.test({
  name: "anon caller is rejected with 403",
  ignore: !FN_URL || !ANON_KEY,
  async fn() {
    const res = await fetch(FN_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ dry_run: true }),
    });
    await res.text(); // drain
    assertEquals(res.status, 403);
  },
});

Deno.test({
  name: "no auth header is rejected with 403",
  ignore: !FN_URL,
  async fn() {
    const res = await fetch(FN_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dry_run: true }),
    });
    await res.text();
    assertEquals(res.status, 403);
  },
});

Deno.test({
  name: "service_role dry-run returns a plan and mutates nothing",
  ignore: !FN_URL || !SERVICE_KEY,
  async fn() {
    const res = await fetch(FN_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ dry_run: true, batch_size: 10 }),
    });
    const json = await res.json();
    assertEquals(res.status, 200);
    assertEquals(json.dry_run, true);
    assertEquals(json.caller, "service");
    // Every report is a dry run; processed must be zero across the board.
    for (const r of json.reports ?? []) {
      assertEquals(r.dry_run, true);
      assertEquals(r.processed, 0);
    }
  },
});
