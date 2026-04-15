import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the user from JWT
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // 1. Get all job IDs for this user
    const { data: jobs } = await admin.from("jobs").select("id").eq("user_id", userId);
    const jobIds = (jobs ?? []).map((j: { id: string }) => j.id);

    if (jobIds.length > 0) {
      // 2. Get all job_output IDs
      const { data: outputs } = await admin.from("job_outputs").select("id").in("job_id", jobIds);
      const outputIds = (outputs ?? []).map((o: { id: string }) => o.id);

      // 3. Delete job_output_variants
      if (outputIds.length > 0) {
        await admin.from("job_output_variants").delete().in("job_output_id", outputIds);
      }

      // 4. Delete job_outputs
      await admin.from("job_outputs").delete().in("job_id", jobIds);

      // 5. Delete job_tags
      await admin.from("job_tags").delete().in("job_id", jobIds);

      // 6. Delete jobs
      await admin.from("jobs").delete().eq("user_id", userId);
    }

    // 7. Delete tags
    await admin.from("tags").delete().eq("user_id", userId);

    // 8. Delete transcript_shares
    await admin.from("transcript_shares").delete().eq("shared_by", userId);

    // 9. Delete credit_transactions
    await admin.from("credit_transactions").delete().eq("user_id", userId);

    // 10. Delete credit_balances
    await admin.from("credit_balances").delete().eq("user_id", userId);

    // 11. Delete notifications
    await admin.from("notifications").delete().eq("user_id", userId);

    // 12. Delete async_jobs
    await admin.from("async_jobs").delete().eq("user_id", userId);

    // 13. Delete user_roles
    await admin.from("user_roles").delete().eq("user_id", userId);

    // 14. Delete pending_invites by this user
    await admin.from("pending_invites").delete().eq("invited_by", userId);

    // 15. Delete profiles
    await admin.from("profiles").delete().eq("user_id", userId);

    // 16. Clean up storage buckets
    for (const bucket of ["avatars", "shared-pdfs", "exports"]) {
      try {
        const { data: files } = await admin.storage.from(bucket).list(userId);
        if (files && files.length > 0) {
          const paths = files.map((f: { name: string }) => `${userId}/${f.name}`);
          await admin.storage.from(bucket).remove(paths);
        }
      } catch {
        // bucket may not have files for this user
      }
    }

    // 17. Delete auth user last
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
