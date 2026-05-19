/**
 * Live-DB tests for check_and_record_usage RPC.
 * Skipped when service-role env vars aren't available.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const RUN = !!(SUPABASE_URL && SERVICE_KEY);

const client = RUN
  ? createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { persistSession: false } })
  : null;

const TEST_USER = "00000000-0000-0000-0000-00000000beef";
const TEST_USER_2 = "00000000-0000-0000-0000-00000000cafe";

async function purge(action: string) {
  if (!client) return;
  await client.from("usage_events").delete().eq("action", action);
}

Deno.test({
  name: "RPC allows up to limit then blocks",
  ignore: !RUN,
  fn: async () => {
    const action = `test_limit_${crypto.randomUUID()}`;
    await purge(action);
    for (let i = 1; i <= 3; i++) {
      const { data } = await client!.rpc("check_and_record_usage", {
        p_user_id: TEST_USER,
        p_action: action,
        p_scope: "user_day",
        p_window: "1 day",
        p_limit: 3,
      });
      assertEquals((data as { allowed: boolean }).allowed, true);
    }
    const { data: blocked } = await client!.rpc("check_and_record_usage", {
      p_user_id: TEST_USER,
      p_action: action,
      p_scope: "user_day",
      p_window: "1 day",
      p_limit: 3,
    });
    assertEquals((blocked as { allowed: boolean }).allowed, false);
    await purge(action);
  },
});

Deno.test({
  name: "RPC isolates per-job scope",
  ignore: !RUN,
  fn: async () => {
    const action = `test_jobscope_${crypto.randomUUID()}`;
    const job1 = crypto.randomUUID();
    const job2 = crypto.randomUUID();
    await purge(action);
    const r1 = await client!.rpc("check_and_record_usage", {
      p_user_id: TEST_USER,
      p_action: action,
      p_scope: "job_lifetime",
      p_job_id: job1,
      p_limit: 1,
    });
    assertEquals((r1.data as { allowed: boolean }).allowed, true);
    const r2 = await client!.rpc("check_and_record_usage", {
      p_user_id: TEST_USER,
      p_action: action,
      p_scope: "job_lifetime",
      p_job_id: job1,
      p_limit: 1,
    });
    assertEquals((r2.data as { allowed: boolean }).allowed, false);
    // Different job → independent budget
    const r3 = await client!.rpc("check_and_record_usage", {
      p_user_id: TEST_USER,
      p_action: action,
      p_scope: "job_lifetime",
      p_job_id: job2,
      p_limit: 1,
    });
    assertEquals((r3.data as { allowed: boolean }).allowed, true);
    await purge(action);
  },
});

Deno.test({
  name: "RPC isolates per-user scope",
  ignore: !RUN,
  fn: async () => {
    const action = `test_userscope_${crypto.randomUUID()}`;
    await purge(action);
    const a = await client!.rpc("check_and_record_usage", {
      p_user_id: TEST_USER,
      p_action: action,
      p_scope: "user_day",
      p_window: "1 day",
      p_limit: 1,
    });
    assertEquals((a.data as { allowed: boolean }).allowed, true);
    const b = await client!.rpc("check_and_record_usage", {
      p_user_id: TEST_USER_2,
      p_action: action,
      p_scope: "user_day",
      p_window: "1 day",
      p_limit: 1,
    });
    assertEquals((b.data as { allowed: boolean }).allowed, true);
    await purge(action);
  },
});
