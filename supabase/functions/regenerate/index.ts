import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL_SUMMARY = "google/gemini-2.5-flash";
const MODEL_CUSTOM = "google/gemini-3-flash-preview";
const MODEL_TRANSLATE = "google/gemini-2.5-flash";

function extractShortSummary(summaryContent: string): string {
  const overviewMatch = summaryContent.match(/##\s*Overview\s*\n+([\s\S]*?)(?=\n##|\n*$)/i);
  const text = overviewMatch?.[1]?.trim() || summaryContent.split("\n").filter(l => l.trim()).slice(0, 2).join(" ");
  const plain = text.replace(/[*#_`>\-]/g, "").replace(/\s+/g, " ").trim();
  return plain.slice(0, 200);
}

async function callAI(apiKey: string, model: string, system: string, user: string): Promise<string> {
  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });

  if (res.status === 429) throw Object.assign(new Error("Rate limit exceeded. Please try again later."), { statusCode: 429 });
  if (res.status === 402) throw Object.assign(new Error("AI credits exhausted. Please add funds."), { statusCode: 402 });
  if (!res.ok) { const t = await res.text(); throw new Error(`AI gateway error [${res.status}]: ${t}`); }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ─── translate_all handler ───────────────────────────────────────────────────

async function handleTranslateAll(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  jobId: string,
  targetLang: string,
) {
  // Fetch job
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, status, language_detected, regeneration_count")
    .eq("id", jobId)
    .single();

  if (jobError || !job) throw Object.assign(new Error("Job not found"), { statusCode: 404 });
  if (job.status !== "completed") throw Object.assign(new Error("Job is not completed"), { statusCode: 400 });

  // Fetch all outputs
  const { data: outputs, error: outErr } = await supabase
    .from("job_outputs")
    .select("id, output_type, content, custom_prompt")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (outErr || !outputs || outputs.length === 0) throw new Error("No outputs found for this job");

  // Filter to translatable types
  const translatable = outputs.filter(
    (o: { output_type: string }) => o.output_type === "transcript" || o.output_type === "summary" || o.output_type === "custom" || o.output_type === "question"
  );

  // Check which variants already exist for this language
  const outputIds = translatable.map((o: { id: string }) => o.id);
  const { data: existingVariants } = await supabase
    .from("job_output_variants")
    .select("job_output_id, content")
    .in("job_output_id", outputIds)
    .eq("language", targetLang);

  const existingMap = new Map((existingVariants ?? []).map((v: { job_output_id: string; content: string }) => [v.job_output_id, v.content]));

  // If all variants exist, just return them
  if (existingMap.size === translatable.length) {
    const result: Record<string, string> = {};
    for (const o of translatable) result[o.id] = existingMap.get(o.id) ?? o.content;

    // Persist active language
    await supabase.from("jobs").update({ output_language: targetLang }).eq("id", jobId);

    return result;
  }

  // Translate missing outputs
  const systemPrompt = `You are a professional translator. Translate the following content to ${targetLang}. Preserve ALL formatting exactly: markdown structure, speaker labels (e.g. "Speaker A:"), timestamps, section headings, bullet points, bold text. Do NOT add, remove, summarize, or interpret any content. Output ONLY the translated text.`;

  const result: Record<string, string> = {};

  for (const output of translatable) {
    if (existingMap.has(output.id)) {
      result[output.id] = existingMap.get(output.id)!;
      continue;
    }

    console.log(`[regenerate] Translating ${output.output_type} (${output.id}) to ${targetLang}`);
    const translated = await callAI(apiKey, MODEL_TRANSLATE, systemPrompt, output.content);

    // Upsert variant
    await supabase.from("job_output_variants").upsert(
      { job_output_id: output.id, language: targetLang, content: translated },
      { onConflict: "job_output_id,language" }
    );

    result[output.id] = translated;
  }

  // Persist active language + increment regeneration count
  await supabase.from("jobs").update({
    output_language: targetLang,
    regeneration_count: (job.regeneration_count ?? 0) + 1,
  }).eq("id", jobId);

  console.log(`[regenerate] translate_all complete for job ${jobId}, lang=${targetLang}, outputs=${translatable.length}`);
  return result;
}

// ─── summary / custom handlers (original logic) ─────────────────────────────

async function handleSummaryOrCustom(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  jobId: string,
  outputType: "summary" | "custom",
  customPrompt: string | null,
  targetLang: string | null,
) {
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, status, regeneration_count, language_detected")
    .eq("id", jobId)
    .single();

  if (jobError || !job) throw Object.assign(new Error("Job not found"), { statusCode: 404 });
  if (job.status !== "completed") throw Object.assign(new Error("Job is not completed"), { statusCode: 400 });

  // Read transcript
  const { data: txRow, error: txError } = await supabase
    .from("job_outputs")
    .select("content")
    .eq("job_id", jobId)
    .eq("output_type", "transcript")
    .single();

  if (txError || !txRow?.content) throw new Error(`Transcript not found for job ${jobId}`);
  const transcript = txRow.content;

  let systemPrompt: string;
  let userPrompt: string;

  if (outputType === "summary") {
    const lang = targetLang || job.language_detected || "en";
    const langInstruction = `\n\nCRITICAL LANGUAGE REQUIREMENT: You MUST write the ENTIRE output in ${lang}. Every heading, every bullet point, every sentence must be in ${lang}. Do NOT use English unless ${lang} IS English. This is mandatory and non-negotiable.`;

    systemPrompt = `You are a professional meeting and audio analysis assistant. You produce clear, well-structured summaries designed to be easy to scan and share.

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
- Keep bullet points concise and scannable.${langInstruction}`;

    userPrompt = `Analyse the following transcript and produce a structured summary:\n\n${transcript}`;

    await supabase.from("job_outputs").delete().eq("job_id", jobId).eq("output_type", "summary");
    console.log(`[regenerate] Regenerating summary for job ${jobId} in language: ${lang}`);
  } else {
    if (!customPrompt?.trim()) throw Object.assign(new Error("custom_prompt is required"), { statusCode: 400 });
    systemPrompt = `You are a professional analysis assistant. The user has provided a transcript and a custom instruction. Apply the instruction to the transcript and produce a clear, well-structured response. Be factual and precise. Do not invent information not present in the transcript.`;
    userPrompt = `Instruction: ${customPrompt}\n\nTranscript:\n${transcript}`;
    console.log(`[regenerate] Processing job ${jobId}, prompt: "${customPrompt.slice(0, 80)}..."`);
  }

  const model = outputType === "summary" ? MODEL_SUMMARY : MODEL_CUSTOM;
  const content = await callAI(apiKey, model, systemPrompt, userPrompt);

  const { data: insertedOutput, error: insertError } = await supabase
    .from("job_outputs")
    .insert({
      job_id: jobId,
      output_type: outputType === "summary" ? "summary" : "custom",
      content,
      custom_prompt: outputType === "custom" ? customPrompt : null,
    })
    .select("id, output_type, content, custom_prompt")
    .single();

  if (insertError || !insertedOutput) throw new Error(insertError?.message || "Failed to save regenerated output");

  const updatePayload: Record<string, unknown> = {
    regeneration_count: (job.regeneration_count ?? 0) + 1,
  };
  if (outputType === "summary") {
    const lang = targetLang || job.language_detected || "en";
    updatePayload.summary_language = lang;
    updatePayload.short_summary = extractShortSummary(content);
  }
  await supabase.from("jobs").update(updatePayload).eq("id", jobId);

  return insertedOutput;
}

// ─── Main handler ────────────────────────────────────────────────────────────

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
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── translate_all ──
    if (output_type === "translate_all") {
      if (!target_language?.trim()) {
        return new Response(JSON.stringify({ error: "target_language is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const variants = await handleTranslateAll(supabase, LOVABLE_API_KEY, job_id, target_language);
      return new Response(
        JSON.stringify({ success: true, job_id, variants }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── summary or custom ──
    const regenerateType = output_type === "summary" ? "summary" : "custom";

    if (regenerateType === "custom" && (!custom_prompt || !custom_prompt.trim())) {
      return new Response(JSON.stringify({ error: "custom_prompt is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const insertedOutput = await handleSummaryOrCustom(
      supabase, LOVABLE_API_KEY, job_id, regenerateType, custom_prompt ?? null, target_language ?? null
    );

    console.log(`[regenerate] ${regenerateType} output regenerated for job ${job_id}`);
    return new Response(
      JSON.stringify({ success: true, job_id, output: insertedOutput }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    const status = statusCode && statusCode >= 400 && statusCode < 600 ? statusCode : 500;
    console.error(`[regenerate] Error:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
