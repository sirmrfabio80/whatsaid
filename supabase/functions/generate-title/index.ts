import { corsHeaders } from "../_shared/cors.ts";
import { callAiGateway } from "../_shared/ai-gateway.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { TITLE_SYSTEM_PROMPT } from "../_shared/prompts.ts";

const MODEL = "google/gemini-2.5-flash-lite";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabase = createServiceClient();

    const { job_id } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------------------------------------------------------------------
    // Fast-path: if a title already exists, return it without calling the AI.
    // Cheap dedup for the common "user opens the same completed job" case.
    // ---------------------------------------------------------------------
    const { data: existingJob } = await supabase
      .from("jobs")
      .select("title")
      .eq("id", job_id)
      .maybeSingle();

    if (existingJob?.title && existingJob.title.trim().length > 0) {
      return new Response(JSON.stringify({ title: existingJob.title, cached: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------------------------------------------------------------------
    // Atomic claim: write a sentinel placeholder ONLY if title is still null.
    // Concurrent invocations (e.g. same job opened in two tabs) will race on
    // this UPDATE; only the row whose precondition matched wins and proceeds
    // to call Lovable AI. The losers fall through to the "title already set"
    // branch below and return the existing/in-progress title without billing.
    //
    // NOTE: the placeholder is a non-empty marker so that subsequent fast-path
    // checks above also short-circuit. It is overwritten with the real title
    // a few seconds later by the winning invocation.
    // ---------------------------------------------------------------------
    const PLACEHOLDER = "…";
    const { data: claimed, error: claimError } = await supabase
      .from("jobs")
      .update({ title: PLACEHOLDER })
      .eq("id", job_id)
      .is("title", null)
      .select("id")
      .maybeSingle();

    if (claimError) {
      throw new Error(`Title claim failed: ${claimError.message}`);
    }

    if (!claimed) {
      // Lost the race — another invocation is already generating (or has
      // already generated) a title. Return whatever is currently stored.
      const { data: latest } = await supabase
        .from("jobs")
        .select("title")
        .eq("id", job_id)
        .maybeSingle();
      return new Response(
        JSON.stringify({ title: latest?.title ?? PLACEHOLDER, dedup: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ---------------------------------------------------------------------
    // We hold the claim — proceed with the single AI call.
    // ---------------------------------------------------------------------
    try {
      const { data: txRow, error: txError } = await supabase
        .from("job_outputs")
        .select("content")
        .eq("job_id", job_id)
        .eq("output_type", "transcript")
        .single();

      if (txError || !txRow?.content) {
        // Roll back the placeholder so a future call can retry once the
        // transcript exists.
        await supabase.from("jobs").update({ title: null }).eq("id", job_id);
        throw new Error(`Transcript not found for job ${job_id}`);
      }

      const excerpt = txRow.content.slice(0, 2000);

      const rawTitle = await callAiGateway({
        apiKey: LOVABLE_API_KEY,
        model: MODEL,
        system: TITLE_SYSTEM_PROMPT,
        user: excerpt,
      });

      const title = rawTitle.trim().replace(/^["']|["']$/g, "");

      await supabase.from("jobs").update({ title }).eq("id", job_id);

      return new Response(JSON.stringify({ title }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (innerErr) {
      // Roll back placeholder on AI failure so a future retry isn't blocked.
      await supabase.from("jobs").update({ title: null }).eq("id", job_id);
      throw innerErr;
    }
  } catch (error) {
    console.error("[generate-title] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
