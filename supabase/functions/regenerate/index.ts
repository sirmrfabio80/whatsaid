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

async function computeSourceHash(content: string): Promise<string> {
  const encoded = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

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

  // Compute source hash from the transcript content
  const transcriptOutput = outputs.find((o: { output_type: string }) => o.output_type === "transcript");
  if (!transcriptOutput) throw new Error("Transcript not found for this job");
  const sourceHash = await computeSourceHash(transcriptOutput.content);

  // Filter to translatable types
  const translatable = outputs.filter(
    (o: { output_type: string }) => o.output_type === "transcript" || o.output_type === "summary" || o.output_type === "custom" || o.output_type === "question"
  );

  // Check which variants already exist for this language
  const outputIds = translatable.map((o: { id: string }) => o.id);
  const { data: existingVariants } = await supabase
    .from("job_output_variants")
    .select("job_output_id, content, source_hash")
    .in("job_output_id", outputIds)
    .eq("language", targetLang);

  // Build map of fresh variants only (source_hash matches current transcript hash)
  const freshMap = new Map<string, string>();
  for (const v of (existingVariants ?? [])) {
    if (v.source_hash === sourceHash) {
      freshMap.set(v.job_output_id, v.content);
    }
  }

  // If all variants exist and are fresh, just return them
  if (freshMap.size === translatable.length) {
    const result: Record<string, string> = {};
    for (const o of translatable) result[o.id] = freshMap.get(o.id) ?? o.content;

    // Persist active language
    await supabase.from("jobs").update({ output_language: targetLang }).eq("id", jobId);

    return result;
  }

  // Translate missing or stale outputs
  const systemPrompt = `You are a professional translator. Translate the following content to ${targetLang}. Preserve ALL formatting exactly: markdown structure, speaker labels (e.g. "Speaker A:"), timestamps, section headings, bullet points, bold text. Do NOT add, remove, summarize, or interpret any content. Output ONLY the translated text.`;

  const result: Record<string, string> = {};

  for (const output of translatable) {
    if (freshMap.has(output.id)) {
      result[output.id] = freshMap.get(output.id)!;
      continue;
    }

    console.log(`[regenerate] Translating ${output.output_type} (${output.id}) to ${targetLang} [stale or missing]`);
    const translated = await callAI(apiKey, MODEL_TRANSLATE, systemPrompt, output.content);

    // Upsert variant with source_hash
    await supabase.from("job_output_variants").upsert(
      { job_output_id: output.id, language: targetLang, content: translated, source_hash: sourceHash },
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

// ─── summary_from_edit handler ───────────────────────────────────────────────

async function handleSummaryFromEdit(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  jobId: string,
) {
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, status, language_detected, summary_needs_regen, summary_regen_count")
    .eq("id", jobId)
    .single();

  if (jobError || !job) throw Object.assign(new Error("Job not found"), { statusCode: 404 });
  if (job.status !== "completed") throw Object.assign(new Error("Job is not completed"), { statusCode: 400 });
  if (!job.summary_needs_regen) throw Object.assign(new Error("Summary is already up to date"), { statusCode: 400 });
  if ((job.summary_regen_count ?? 0) >= 3) throw Object.assign(new Error("Summary regeneration limit reached (3 of 3 used)"), { statusCode: 403 });

  // Read current transcript
  const { data: txRow, error: txError } = await supabase
    .from("job_outputs")
    .select("content")
    .eq("job_id", jobId)
    .eq("output_type", "transcript")
    .single();

  if (txError || !txRow?.content) throw new Error(`Transcript not found for job ${jobId}`);
  const transcript = txRow.content;

  const lang = job.language_detected || "en";
  const langInstruction = `\n\nCRITICAL LANGUAGE REQUIREMENT: You MUST write the ENTIRE output in ${lang}. Every heading, every bullet point, every sentence must be in ${lang}. Do NOT use English unless ${lang} IS English. This is mandatory and non-negotiable.`;

  const systemPrompt = `You are a professional meeting and audio analysis assistant. You produce clear, well-structured summaries designed to be easy to scan and share.

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

  const userPrompt = `Analyse the following transcript and produce a structured summary:\n\n${transcript}`;

  // Delete old summary
  await supabase.from("job_outputs").delete().eq("job_id", jobId).eq("output_type", "summary");

  console.log(`[regenerate] Regenerating summary from edited transcript for job ${jobId}`);
  const content = await callAI(apiKey, MODEL_SUMMARY, systemPrompt, userPrompt);

  const { data: insertedOutput, error: insertError } = await supabase
    .from("job_outputs")
    .insert({ job_id: jobId, output_type: "summary", content })
    .select("id, output_type, content, custom_prompt")
    .single();

  if (insertError || !insertedOutput) throw new Error(insertError?.message || "Failed to save regenerated summary");

  // Atomically clear flag and increment counter
  await supabase.from("jobs").update({
    summary_needs_regen: false,
    summary_regen_count: (job.summary_regen_count ?? 0) + 1,
    short_summary: extractShortSummary(content),
  }).eq("id", jobId);

  console.log(`[regenerate] summary_from_edit complete for job ${jobId}, count=${(job.summary_regen_count ?? 0) + 1}/3`);
  return insertedOutput;
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
    .select("id, status, regeneration_count, language_detected, question_generation_count")
    .eq("id", jobId)
    .single();

  if (jobError || !job) throw Object.assign(new Error("Job not found"), { statusCode: 404 });
  if (job.status !== "completed") throw Object.assign(new Error("Job is not completed"), { statusCode: 400 });

  // ── Question generation limit (custom outputs only) ──
  if (outputType === "custom") {
    // Atomic increment with guard
    const { data: limitRow, error: limitErr } = await supabase
      .from("jobs")
      .update({ question_generation_count: (job.question_generation_count ?? 0) + 1 })
      .eq("id", jobId)
      .lt("question_generation_count", 10)
      .select("question_generation_count")
      .maybeSingle();

    if (limitErr || !limitRow) {
      throw Object.assign(new Error("question_limit_reached"), { statusCode: 403 });
    }
  }

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

  let content: string;
  try {
    content = await callAI(apiKey, model, systemPrompt, userPrompt);
  } catch (aiError) {
    // Rollback question counter on AI failure
    if (outputType === "custom") {
      await supabase
        .from("jobs")
        .update({ question_generation_count: Math.max(0, (job.question_generation_count ?? 0)) })
        .eq("id", jobId);
    }
    throw aiError;
  }

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

    // ── summary_from_edit ──
    if (output_type === "summary_from_edit") {
      const insertedOutput = await handleSummaryFromEdit(supabase, LOVABLE_API_KEY, job_id);
      console.log(`[regenerate] summary_from_edit output regenerated for job ${job_id}`);
      return new Response(
        JSON.stringify({ success: true, job_id, output: insertedOutput }),
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
