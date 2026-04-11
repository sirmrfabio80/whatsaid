import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

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

    const body = await req.json();
    const { job_id, custom_prompt, output_type, target_language } = body;

    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine what we're regenerating
    const regenerateType = output_type === "summary" ? "summary" : "custom";

    if (regenerateType === "custom" && (!custom_prompt || !custom_prompt.trim())) {
      return new Response(JSON.stringify({ error: "custom_prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify job exists and is completed
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, status, regeneration_count, language_detected")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.status !== "completed") {
      return new Response(JSON.stringify({ error: "Job is not completed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read the transcript
    const { data: transcriptRow, error: txError } = await supabase
      .from("job_outputs")
      .select("content")
      .eq("job_id", job_id)
      .eq("output_type", "transcript")
      .single();

    if (txError || !transcriptRow?.content) {
      throw new Error(`Transcript not found for job ${job_id}`);
    }

    const transcript = transcriptRow.content;

    let systemPrompt: string;
    let userPrompt: string;

    if (regenerateType === "summary") {
      // Determine language for summary
      const lang = target_language || job.language_detected || null;
      const langInstruction = lang && lang !== "en"
        ? `\n\nIMPORTANT: Produce the entire summary, key points, and key actions in ${lang}. Do not translate to English.`
        : "";

      systemPrompt = `You are a professional meeting and audio analysis assistant. You produce clear, well-structured summaries designed to be easy to scan and share with others, including family members who may not have been present.

Your output MUST use the following markdown structure with exactly these section headings:

## Overview
A concise 2-3 paragraph summary of what was discussed, who was involved, and the overall outcome or status.

## Key Points
A bullet list of the most important facts, findings, or information shared during the conversation. Keep each point to 1-2 sentences.

## Decisions & Next Steps
A bullet list of any decisions made, action items agreed, follow-up appointments, or next steps. Include who is responsible and any dates or deadlines mentioned.

## Terms to Know
A bullet list of specialised, technical, or medical terms used in the conversation, each with a brief plain-language explanation. Only include this section if there are terms that a non-specialist might find unclear. If all language is straightforward, omit this section entirely.

Rules:
- Use plain text with markdown formatting only (## for headings, - for bullets).
- Be factual and precise. Do not invent information not present in the transcript.
- Keep bullet points concise and scannable.
- Write in a professional but accessible tone.${langInstruction}`;

      userPrompt = `Analyse the following transcript and produce a structured summary:\n\n${transcript}`;

      // Delete existing summary
      await supabase
        .from("job_outputs")
        .delete()
        .eq("job_id", job_id)
        .eq("output_type", "summary");

      console.log(`[regenerate] Regenerating summary for job ${job_id} in language: ${lang || "default"}`);
    } else {
      // Custom prompt / question
      systemPrompt = `You are a professional analysis assistant. The user has provided a transcript and a custom instruction. Apply the instruction to the transcript and produce a clear, well-structured response. Be factual and precise. Do not invent information not present in the transcript.`;

      userPrompt = `Instruction: ${custom_prompt}\n\nTranscript:\n${transcript}`;

      // Delete existing custom output
      await supabase
        .from("job_outputs")
        .delete()
        .eq("job_id", job_id)
        .eq("output_type", "custom");

      console.log(`[regenerate] Processing job ${job_id}, prompt: "${custom_prompt.slice(0, 80)}..."`);
    }

    const res = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (res.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI gateway error [${res.status}]: ${t}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    // Insert the output
    await supabase.from("job_outputs").insert({
      job_id,
      output_type: regenerateType,
      content,
      custom_prompt: regenerateType === "custom" ? custom_prompt : null,
    });

    // Increment regeneration count
    await supabase
      .from("jobs")
      .update({ regeneration_count: (job.regeneration_count ?? 0) + 1 })
      .eq("id", job_id);

    console.log(`[regenerate] ${regenerateType} output regenerated for job ${job_id}`);

    return new Response(
      JSON.stringify({ success: true, job_id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`[regenerate] Error:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
