import { autoTag } from "../_shared/auto-tag.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { callAiGateway } from "../_shared/ai-gateway.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { markJobFailed } from "../_shared/job-failure.ts";
import {
  buildSummarySystemPrompt,
  buildSummaryUserPrompt,
  buildCustomUserPrompt,
  CUSTOM_OUTPUT_SYSTEM_PROMPT,
} from "../_shared/prompts.ts";

const MODEL_SUMMARY = "google/gemini-2.5-flash";
const MODEL_CUSTOM = "google/gemini-3-flash-preview";

function extractShortSummary(summaryContent: string): string {
  // Try to extract the first paragraph after "## Overview"
  const overviewMatch = summaryContent.match(/##\s*Overview\s*\n+([\s\S]*?)(?=\n##|\n*$)/i);
  const text = overviewMatch?.[1]?.trim() || summaryContent.split("\n").filter(l => l.trim()).slice(0, 2).join(" ");
  // Strip markdown formatting
  const plain = text.replace(/[*#_`>\-]/g, "").replace(/\s+/g, " ").trim();
  return plain.slice(0, 200);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabase = createServiceClient();

    const { job_id, custom_prompt } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Read the transcript
    const { data: transcriptRow, error: txError } = await supabase
      .from("job_outputs")
      .select("content")
      .eq("job_id", job_id)
      .eq("output_type", "transcript")
      .single();

    if (txError || transcriptRow == null) {
      throw new Error(`Transcript not found for job ${job_id}: ${txError?.message}`);
    }

    const transcript = transcriptRow.content ?? "";
    console.log(`[post-process] Processing job ${job_id}, transcript length: ${transcript.length}`);

    // 1b. Handle empty transcript (silence / non-speech audio) gracefully.
    // Mark the job as completed with a clear message and refund the credit.
    if (transcript.trim().length === 0) {
      console.log(`[post-process] Empty transcript for job ${job_id} — treating as no-speech result.`);

      const noSpeechMessage = "No speech detected in audio.";

      // Insert a placeholder summary so the UI has something to render.
      await supabase.from("job_outputs").insert({
        job_id,
        output_type: "summary",
        content: `## Overview\n\n${noSpeechMessage}\n\nThe recording appeared to contain only background noise or silence. Try a clearer recording, or one closer to the speaker.`,
      });

      // Fetch job for credit refund + notification.
      const { data: jobInfo } = await supabase
        .from("jobs")
        .select("user_id, title, file_name, credits_charged")
        .eq("id", job_id)
        .single();

      // Refund the credits that process-job deducted (skip admins / 0-credit jobs).
      if (jobInfo?.user_id && (jobInfo.credits_charged ?? 0) > 0) {
        const { data: adminRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", jobInfo.user_id)
          .eq("role", "admin")
          .maybeSingle();

        if (!adminRole) {
          try {
            await supabase.rpc("add_credits", {
              p_user_id: jobInfo.user_id,
              p_amount: jobInfo.credits_charged,
              p_reason: `Refund: no speech detected`,
            });
            console.log(`[post-process] Refunded ${jobInfo.credits_charged} credit(s) for job ${job_id}`);
          } catch (refundErr) {
            console.error(`[post-process] Refund failed for job ${job_id}:`, refundErr);
          }
        }
      }

      await supabase
        .from("jobs")
        .update({
          status: "completed",
          short_summary: noSpeechMessage,
          summary_language: "en",
        })
        .eq("id", job_id);

      if (jobInfo?.user_id) {
        const notifTitle = jobInfo.title || jobInfo.file_name || "Transcript";
        await supabase.from("notifications").insert({
          user_id: jobInfo.user_id,
          type: "transcript_ready",
          title: notifTitle,
          description: noSpeechMessage,
          status: "info",
          resource_type: "job",
          resource_id: job_id,
        });
      }

      return new Response(
        JSON.stringify({ success: true, job_id, no_speech: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }



    // Read job to get detected language
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("language_detected")
      .eq("id", job_id)
      .single();

    const detectedLang = jobRow?.language_detected || null;

    // Build language instruction — ALWAYS specify output language
    const langLabel = detectedLang || "en";

    // 2. Generate summary with structured sections
    const summaryContent = await callAiGateway({
      apiKey: LOVABLE_API_KEY,
      model: MODEL_SUMMARY,
      system: buildSummarySystemPrompt(langLabel),
      user: buildSummaryUserPrompt(transcript),
    });
    console.log(`[post-process] Summary generated for job ${job_id}`);

    // 3. Insert summary output
    await supabase.from("job_outputs").insert({
      job_id,
      output_type: "summary",
      content: summaryContent,
    });

    // 4. Generate custom prompt output (if provided)
    if (custom_prompt && custom_prompt.trim()) {
      const customContent = await callAiGateway({
        apiKey: LOVABLE_API_KEY,
        model: MODEL_CUSTOM,
        system: CUSTOM_OUTPUT_SYSTEM_PROMPT,
        user: buildCustomUserPrompt(custom_prompt, transcript),
      });
      console.log(`[post-process] Custom output generated for job ${job_id}`);

      await supabase.from("job_outputs").insert({
        job_id,
        output_type: "custom",
        content: customContent,
        custom_prompt: custom_prompt,
      });
    }

    // 5. Extract short summary from the generated summary (no extra AI call)
    const shortSummary = extractShortSummary(summaryContent);
    console.log(`[post-process] Short summary extracted for job ${job_id}`);

    // 6. Mark job as completed and record summary language + short summary
    await supabase
      .from("jobs")
      .update({ status: "completed", summary_language: langLabel, short_summary: shortSummary })
      .eq("id", job_id);

    // 6b. Fetch job to get user_id and title for notification
    const { data: jobForNotif } = await supabase
      .from("jobs")
      .select("user_id, title, file_name")
      .eq("id", job_id)
      .single();

    if (jobForNotif?.user_id) {
      const notifTitle = jobForNotif.title || jobForNotif.file_name || "Transcript";
      await supabase.from("notifications").insert({
        user_id: jobForNotif.user_id,
        type: "transcript_ready",
        title: notifTitle,
        description: shortSummary || null,
        status: "success",
        resource_type: "job",
        resource_id: job_id,
      });
    }

    // 7. Auto-tag transcript (non-blocking)
    try {
      const tagResult = await autoTag(supabase, job_id, LOVABLE_API_KEY);
      if (tagResult.skipped) {
        console.log(`[post-process] Tagging skipped for job ${job_id}: ${tagResult.reason}`);
      } else if (!tagResult.success) {
        console.error(`[post-process] Tagging failed for job ${job_id}: ${tagResult.reason}`);
      } else {
        console.log(`[post-process] Tagging complete for job ${job_id}`);
      }
    } catch (tagError) {
      console.error(`[post-process] Tagging error for job ${job_id}:`, tagError);
    }

    console.log(`[post-process] Job ${job_id} completed`);

    return new Response(
      JSON.stringify({ success: true, job_id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error(`[post-process] Error:`, error);

    // Try to mark job as failed and insert failure notification
    try {
      const body = await req.clone().json().catch(() => ({}));
      await markJobFailed(createServiceClient(), body.job_id, error, { notify: true });
    } catch {
      // ignore cleanup errors
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
