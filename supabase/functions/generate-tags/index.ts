import { autoTag } from "../_shared/auto-tag.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { enforceQuota } from "../_shared/quota.ts";
import { createServiceClient, requireAuth } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabase = createServiceClient();

    // Authenticate caller
    const auth = await requireAuth(req.headers.get("Authorization"));
    if (!auth.ok) return auth.response;
    const { userId } = auth;
    const user = { id: userId };

    const { job_id } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify ownership
    const { data: job } = await supabase
      .from("jobs")
      .select("user_id")
      .eq("id", job_id)
      .single();

    if (!job || job.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Job not found or not owned by you" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await autoTag(supabase, job_id, LOVABLE_API_KEY);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[generate-tags] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
