import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { markJobFailed } from "../_shared/job-failure.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();

    const { job_id, custom_prompt, keyterms_prompt } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 0. Fetch job to get user_id and credits_charged
    const { data: jobRow, error: jobFetchError } = await supabase
      .from("jobs")
      .select("user_id, credits_charged")
      .eq("id", job_id)
      .maybeSingle();

    if (jobFetchError || !jobRow) {
      throw new Error("Job not found");
    }

    // 1. Check if user is admin (unlimited credits)
    let userIsAdmin = false;
    if (jobRow.user_id) {
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", jobRow.user_id)
        .eq("role", "admin")
        .maybeSingle();
      userIsAdmin = !!adminRole;
    }

    // 2. Deduct credits BEFORE processing — skip for admins, reject if insufficient
    if (jobRow.user_id && jobRow.credits_charged > 0 && !userIsAdmin) {
      const { data: deducted } = await supabase.rpc("deduct_credits", {
        p_user_id: jobRow.user_id,
        p_amount: jobRow.credits_charged,
        p_reason: `Transcription job`,
        p_job_id: job_id,
      });

      if (!deducted) {
        await supabase
          .from("jobs")
          .update({ status: "failed", error_message: "Insufficient credits" })
          .eq("id", job_id);

        return new Response(
          JSON.stringify({ error: "Insufficient credits" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 2b. If keyterms_prompt provided, save to transcription_config for the transcribe function
    if (keyterms_prompt) {
      // Validate: keyterms_prompt and custom_prompt are mutually exclusive for AssemblyAI
      await supabase
        .from("jobs")
        .update({
          transcription_config: { keyterms_prompt },
        })
        .eq("id", job_id);
    }

    // 3. Update job status to processing
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
      const body = await req.clone().json().catch(() => ({}));
      await markJobFailed(createServiceClient(), body.job_id, error);
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
