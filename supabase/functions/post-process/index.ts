import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sanitizeErrorForClient } from "../_shared/sanitize-error.ts";
import { autoTag } from "../_shared/auto-tag.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
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

async function callAI(apiKey: string, model: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (res.status === 429) {
    throw new Error("AI rate limit exceeded. Please try again later.");
  }
  if (res.status === 402) {
    throw new Error("AI credits exhausted. Please add funds.");
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway error [${res.status}]: ${t}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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
    const languageInstruction = `\n\nCRITICAL LANGUAGE REQUIREMENT: You MUST write the ENTIRE output in ${langLabel}. Every heading, every bullet point, every sentence must be in ${langLabel}. Do NOT use English unless ${langLabel} IS English. This is mandatory and non-negotiable.`;

    // 2. Generate summary with structured sections
    const summarySystemPrompt = `You are a professional meeting and audio analysis assistant. You produce clear, well-structured summaries designed to be easy to scan and share.

Your output MUST use the following markdown structure with exactly these section headings (translate the heading names into the output language):

## Overview
A concise 2-3 paragraph summary of what was discussed and the overall outcome.

## Key Points
A bullet list of the most important facts or information shared. Keep each point to 1-2 sentences.

## Decisions & Next Steps
A bullet list of decisions made, action items, follow-ups, or next steps. Include who is responsible and any dates mentioned.

## Terms to Know
A bullet list of specialised or technical terms with brief plain-language explanations. Only include this section if there are terms a non-specialist would find unclear. Omit entirely if not needed.

Rules:
- Use markdown: ## for headings, - for bullets, **bold** for emphasis.
- Be factual and precise. Do not invent information.
- Keep bullet points concise and scannable.${languageInstruction}`;

    const summaryPrompt = `Analyse the following transcript and produce a structured summary:\n\n${transcript}`;

    const summaryContent = await callAI(LOVABLE_API_KEY, summarySystemPrompt, summaryPrompt);
    console.log(`[post-process] Summary generated for job ${job_id}`);

    // 3. Insert summary output
    await supabase.from("job_outputs").insert({
      job_id,
      output_type: "summary",
      content: summaryContent,
    });

    // 4. Generate custom prompt output (if provided)
    if (custom_prompt && custom_prompt.trim()) {
      const customSystemPrompt = `You are a professional analysis assistant. The user has provided a transcript and a custom instruction. Apply the instruction to the transcript and produce a clear, well-structured response. Be factual and precise. Do not invent information not present in the transcript.`;

      const customUserPrompt = `Instruction: ${custom_prompt}\n\nTranscript:\n${transcript}`;

      const customContent = await callAI(LOVABLE_API_KEY, customSystemPrompt, customUserPrompt);
      console.log(`[post-process] Custom output generated for job ${job_id}`);

      await supabase.from("job_outputs").insert({
        job_id,
        output_type: "custom",
        content: customContent,
        custom_prompt: custom_prompt,
      });
    }

    // 5. Generate short summary for history view
    const shortSummarySystemPrompt = `You are a concise summariser. Given a transcript, produce a 1-2 sentence summary (max 200 characters) capturing the core topic and outcome. No markdown, no bullet points, just plain text.${languageInstruction}`;
    const shortSummaryPrompt = `Summarise this transcript in 1-2 sentences:\n\n${transcript.slice(0, 8000)}`;
    const shortSummary = await callAI(LOVABLE_API_KEY, shortSummarySystemPrompt, shortSummaryPrompt);
    console.log(`[post-process] Short summary generated for job ${job_id}`);

    // 6. Mark job as completed and record summary language + short summary
    await supabase
      .from("jobs")
      .update({ status: "completed", summary_language: langLabel, short_summary: shortSummary.trim().slice(0, 300) })
      .eq("id", job_id);

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

    // Try to mark job as failed
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
            error_message: sanitizeErrorForClient(error),
          })
          .eq("id", body.job_id);
      }
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
