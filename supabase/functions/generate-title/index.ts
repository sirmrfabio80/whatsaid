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
    const LOVABLE_API_KEY = requireEnv("LOVABLE_API_KEY");

    const supabase = createServiceClient();

    const { job_id } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read transcript
    const { data: txRow, error: txError } = await supabase
      .from("job_outputs")
      .select("content")
      .eq("job_id", job_id)
      .eq("output_type", "transcript")
      .single();

    if (txError || !txRow?.content) {
      throw new Error(`Transcript not found for job ${job_id}`);
    }

    // Use first ~2000 chars for title generation
    const excerpt = txRow.content.slice(0, 2000);

    const rawTitle = await callAiGateway({
      apiKey: LOVABLE_API_KEY,
      model: MODEL,
      system: TITLE_SYSTEM_PROMPT,
      user: excerpt,
    });

    const title = rawTitle.trim().replace(/^["']|["']$/g, "");

    // Save title
    await supabase.from("jobs").update({ title }).eq("id", job_id);

    return new Response(JSON.stringify({ title }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[generate-title] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
