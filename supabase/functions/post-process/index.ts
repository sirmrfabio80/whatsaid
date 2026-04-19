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

// Core post-processing pipeline. Two AI calls (summary + optional custom
// output) plus auto-tagging — can exceed the 150s edge function idle
// timeout, so this MUST run in EdgeRuntime.waitUntil.
async function runPostProcessPipeline(
  job_id: string,
  custom_prompt: string | null,
): Promise<void> {
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabase = createServiceClient();


    // 1. Read the transcript
    const { data: transcriptRow, error: txError } = await supabase
      .from("job_outputs")
      .select("content")
      .eq("job_id", job_id)
      .eq("output_type", "transcript")
      .single();

    if (txError || !transcriptRow?.content) {
      throw new Error(`Transcript not found for job ${job_id}: ${txError?.message}`);
    }

    const transcript = transcriptRow.content;
    console.log(`[post-process] Processing job ${job_id}, transcript length: ${transcript.length}`);

    // Read job to get detected language
    const { data: jobRow } = await supabase
      .from("jobs")
      .select("language_detected")
      .eq("id", job_id)
      .single();

    const detectedLang = jobRow?.language_detected || null;

    // Build language instruction — ALWAYS specify output language
    const langLabel = detectedLang || "en";

    // Mark stage: summarising
    await supabase
      .from("jobs")
      .update({ processing_stage: "summarising" } as never)
      .eq("id", job_id);

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
      .update({
        status: "completed",
        summary_language: langLabel,
        short_summary: shortSummary,
        processing_stage: "tagging",
      } as never)
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
  } catch (error) {
    console.error(`[post-process] Pipeline error for job ${job_id}:`, error);
    try {
      await markJobFailed(createServiceClient(), job_id, error, { notify: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const job_id = typeof body?.job_id === "string" ? body.job_id : "";
  const custom_prompt = typeof body?.custom_prompt === "string" ? body.custom_prompt : null;

  if (!job_id) {
    return new Response(JSON.stringify({ error: "job_id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Long-running AI work — must run in background to avoid the 150s
  // edge function idle timeout for callers.
  // @ts-ignore — EdgeRuntime is provided by the Supabase edge runtime
  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
    // @ts-ignore
    EdgeRuntime.waitUntil(runPostProcessPipeline(job_id, custom_prompt));
  } else {
    runPostProcessPipeline(job_id, custom_prompt);
  }

  return new Response(
    JSON.stringify({ success: true, job_id, status: "processing" }),
    { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
