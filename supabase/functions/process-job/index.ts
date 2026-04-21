import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, requireAuth } from "../_shared/supabase.ts";
import { requireEnvs } from "../_shared/env.ts";
import { markJobFailed } from "../_shared/job-failure.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey } =
      requireEnvs(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const);
    const supabase = createServiceClient();

    // SECURITY: require an authenticated caller. process-job deducts credits
    // and triggers expensive transcription, so we must verify the JWT in code
    // (verify_jwt = false is the edge-function default) and confirm the
    // caller owns the target job before proceeding.
    const auth = await requireAuth(req.headers.get("Authorization"));
    if (!auth.ok) return auth.response;
    const callerId = auth.userId;

    const { job_id, custom_prompt, keyterms_prompt, guest_token } = await req.json();
    if (!job_id || typeof job_id !== "string" || !UUID_RE.test(job_id)) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 0. Fetch job to get user_id, guest_token, and credits_charged
    const { data: jobRow, error: jobFetchError } = await supabase
      .from("jobs")
      .select("user_id, credits_charged, guest_token")
      .eq("id", job_id)
      .maybeSingle();

    if (jobFetchError || !jobRow) {
      throw new Error("Job not found");
    }

    // SECURITY: ownership check. Authenticated callers must own the job.
    // Guest jobs (user_id IS NULL) require a matching guest_token.
    if (jobRow.user_id) {
      if (jobRow.user_id !== callerId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      if (!guest_token || guest_token !== jobRow.guest_token) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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

    // Run the long-running pipeline (transcribe + post-process) in the
    // background so we don't hit the 150s edge function idle timeout for
    // longer audio. The client polls the job row for status updates.
    const runPipeline = async () => {
      try {
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
      } catch (pipelineError) {
        console.error(`[process-job] Pipeline error for job ${job_id}:`, pipelineError);
        try {
          await markJobFailed(createServiceClient(), job_id, pipelineError);
        } catch (markErr) {
          console.error(`[process-job] Failed to mark job as failed:`, markErr);
        }
      }
    };

    // @ts-ignore — EdgeRuntime is provided by the Supabase edge runtime
    if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
      // @ts-ignore
      EdgeRuntime.waitUntil(runPipeline());
    } else {
      // Fallback: fire-and-forget (e.g. in local Deno tests).
      runPipeline();
    }

    // Return immediately — client polls the job row for progress.
    return new Response(
      JSON.stringify({ success: true, job_id, status: "processing" }),
      {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error(`[process-job] Error:`, error);

    // Mark job as failed (only synchronous setup errors reach here).
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

