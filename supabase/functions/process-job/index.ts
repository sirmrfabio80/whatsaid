import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { job_id, custom_prompt } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Update job status to processing
    await supabase
      .from("jobs")
      .update({ status: "processing" })
      .eq("id", job_id);

    console.log(`[process-job] Starting pipeline for job ${job_id}`);

    // 2. Call transcribe
    console.log(`[process-job] Step 1: Transcribing...`);
    const transcribeRes = await fetch(`${supabaseUrl}/functions/v1/transcribe`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ job_id }),
    });

    if (!transcribeRes.ok) {
      const errBody = await transcribeRes.text();
      throw new Error(`Transcription failed: ${errBody}`);
    }

    const transcribeResult = await transcribeRes.json();
    if (!transcribeResult.success) {
      throw new Error(`Transcription failed: ${transcribeResult.error || "Unknown error"}`);
    }

    console.log(`[process-job] Transcription complete. Language: ${transcribeResult.language_detected}`);

    // 3. Call post-process
    console.log(`[process-job] Step 2: Post-processing...`);
    const postProcessRes = await fetch(`${supabaseUrl}/functions/v1/post-process`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ job_id, custom_prompt: custom_prompt || null }),
    });

    if (!postProcessRes.ok) {
      const errBody = await postProcessRes.text();
      throw new Error(`Post-processing failed: ${errBody}`);
    }

    const postProcessResult = await postProcessRes.json();
    if (!postProcessResult.success) {
      throw new Error(`Post-processing failed: ${postProcessResult.error || "Unknown error"}`);
    }

    console.log(`[process-job] Pipeline complete for job ${job_id}`);

    return new Response(
      JSON.stringify({ success: true, job_id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error(`[process-job] Error:`, error);

    // Mark job as failed
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const body = await req.clone().json().catch(() => ({}));
      if (body.job_id) {
        await supabase
          .from("jobs")
          .update({
            status: "failed",
            error_message: error instanceof Error ? error.message : "Unknown error",
          })
          .eq("id", body.job_id);
      }
    } catch {
      // ignore
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
