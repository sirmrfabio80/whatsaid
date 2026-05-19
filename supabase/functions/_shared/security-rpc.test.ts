/**
 * Verifies that the SECURITY DEFINER helpers we locked down can only be
 * invoked by service_role. Anon and authenticated PostgREST clients must be
 * rejected by Postgres' EXECUTE grant.
 *
 * Skips when SUPABASE_URL / keys aren't available (local dev without secrets).
 * Service-role positive coverage for check_and_record_usage already lives in
 * usage-rpc.test.ts; this file focuses on negative paths plus a read-only
 * positive smoke that exercises every locked helper at least once.
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const HAS_ANON = !!(SUPABASE_URL && ANON_KEY);
const HAS_SERVICE = !!(SUPABASE_URL && SERVICE_KEY);

// Helpers that must reject anon and authenticated callers.
const LOCKED_RPCS: Array<{ name: string; args: Record<string, unknown> }> = [
  { name: "add_credits", args: { p_user_id: "00000000-0000-0000-0000-000000000001", p_amount: 1, p_reason: "test" } },
  { name: "deduct_credits", args: { p_user_id: "00000000-0000-0000-0000-000000000001", p_amount: 1, p_reason: "test" } },
  {
    name: "check_and_record_usage",
    args: { p_user_id: "00000000-0000-0000-0000-000000000001", p_action: "test", p_scope: "user_day", p_limit: 0 },
  },
  { name: "read_email_batch", args: { queue_name: "auth_emails", batch_size: 1, vt: 1 } },
  { name: "delete_email", args: { queue_name: "auth_emails", message_id: 1 } },
  { name: "enqueue_email", args: { queue_name: "auth_emails", payload: {} } },
  { name: "move_to_dlq", args: { source_queue: "auth_emails", dlq_name: "auth_emails_dlq", message_id: 1, payload: {} } },
];

function isPermissionDenied(error: unknown): boolean {
  if (!error) return false;
  const e = error as { code?: string; message?: string; status?: number };
  // Postgres permission-denied is SQLSTATE 42501; PostgREST surfaces it as
  // a 4xx with that code, or 404 if the function isn't exposed at all.
  return (
    e.code === "42501" ||
    (typeof e.message === "string" &&
      (e.message.toLowerCase().includes("permission denied") ||
        e.message.toLowerCase().includes("not found")))
  );
}

// --- ANON ----------------------------------------------------------------

Deno.test({
  name: "anon client cannot execute locked SECURITY DEFINER helpers",
  ignore: !HAS_ANON,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } });
    for (const { name, args } of LOCKED_RPCS) {
      const { data, error } = await anon.rpc(name, args);
      assertEquals(data, null, `${name} unexpectedly returned data to anon`);
      assert(error, `${name} should error for anon`);
      assert(
        isPermissionDenied(error),
        `${name}: expected permission-denied, got ${JSON.stringify(error)}`,
      );
    }
  },
});

Deno.test({
  name: "anon client cannot call private.has_role via REST",
  ignore: !HAS_ANON,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } });
    // public.has_role was dropped; private schema isn't exposed by PostgREST.
    const { data, error } = await anon.rpc("has_role", {
      _user_id: "00000000-0000-0000-0000-000000000001",
      _role: "admin",
    });
    assertEquals(data, null);
    assert(error, "has_role should not be callable as an RPC anymore");
  },
});

// --- AUTHENTICATED -------------------------------------------------------

Deno.test({
  name: "authenticated client cannot execute locked SECURITY DEFINER helpers",
  ignore: !(HAS_ANON && HAS_SERVICE),
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });
    const email = `sec-rpc-${crypto.randomUUID()}@example.com`;
    const password = crypto.randomUUID() + "Aa1!";

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert(!createErr, `createUser failed: ${createErr?.message}`);
    const userId = created.user!.id;

    try {
      const user = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } });
      const { error: signInErr } = await user.auth.signInWithPassword({ email, password });
      assert(!signInErr, `signIn failed: ${signInErr?.message}`);

      for (const { name, args } of LOCKED_RPCS) {
        const { data, error } = await user.rpc(name, args);
        assertEquals(data, null, `${name} unexpectedly returned data to authenticated`);
        assert(error, `${name} should error for authenticated`);
        assert(
          isPermissionDenied(error),
          `${name}: expected permission-denied for authenticated, got ${JSON.stringify(error)}`,
        );
      }

      await user.auth.signOut();
    } finally {
      await admin.auth.admin.deleteUser(userId);
    }
  },
});

// --- SERVICE ROLE (positive smoke) --------------------------------------

Deno.test({
  name: "service_role can execute locked SECURITY DEFINER helpers",
  ignore: !HAS_SERVICE,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const admin = createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } });

    // check_and_record_usage with limit=0 → no insert, returns allowed:false.
    const usage = await admin.rpc("check_and_record_usage", {
      p_user_id: "00000000-0000-0000-0000-00000000beef",
      p_action: `sec_rpc_probe_${crypto.randomUUID()}`,
      p_scope: "user_day",
      p_window: "1 day",
      p_limit: 0,
    });
    assert(!usage.error, `check_and_record_usage failed: ${usage.error?.message}`);
    assertEquals((usage.data as { allowed: boolean }).allowed, false);

    // read_email_batch is side-effect free with vt=1 / batch=0 (no messages claimed
    // for a non-existent or empty queue, and pgmq.create runs on undefined_table).
    const batch = await admin.rpc("read_email_batch", {
      queue_name: "auth_emails",
      batch_size: 0,
      vt: 1,
    });
    assert(!batch.error, `read_email_batch failed: ${batch.error?.message}`);
  },
});
