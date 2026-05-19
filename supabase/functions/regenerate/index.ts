import { corsHeaders } from "../_shared/cors.ts";
import { AiGatewayError, callAiGateway } from "../_shared/ai-gateway.ts";
import { createServiceClient, requireAuth, type SupabaseClient } from "../_shared/supabase.ts";
import { enforceQuota } from "../_shared/quota.ts";
import {
  buildSummarySystemPrompt,
  buildSummaryUserPrompt,
  buildCustomUserPrompt,
  buildCustomUserPromptMulti,
  CUSTOM_OUTPUT_SYSTEM_PROMPT,
} from "../_shared/prompts.ts";
import { getEnglishName } from "../_shared/languages.ts";
import { validateTranslation } from "../_shared/language-validation.ts";

const MAX_EXTRA_SOURCES = 5;
const MAX_COMBINED_EXTRA_CHARS = 200_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MODEL_SUMMARY = "google/gemini-2.5-flash";
const MODEL_CUSTOM = "google/gemini-3-flash-preview";
const MODEL_TRANSLATE = "google/gemini-2.5-flash";

function extractShortSummary(summaryContent: string): string {
  const overviewMatch = summaryContent.match(/##\s*Overview\s*\n+([\s\S]*?)(?=\n##|\n*$)/i);
  const text = overviewMatch?.[1]?.trim() || summaryContent.split("\n").filter(l => l.trim()).slice(0, 2).join(" ");
  const plain = text.replace(/[*#_`>\-]/g, "").replace(/\s+/g, " ").trim();
  return plain.slice(0, 200);
}

function callAI(apiKey: string, model: string, system: string, user: string): Promise<string> {
  return callAiGateway({ apiKey, model, system, user });
}

// ─── translate_all handler ───────────────────────────────────────────────────

async function computeSourceHash(content: string): Promise<string> {
  const encoded = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

async function handleTranslateAll(
  supabase: SupabaseClient,
  apiKey: string,
  jobId: string,
  targetLang: string,
) {
  // Resolve and whitelist target language up-front.
  const targetName = getEnglishName(targetLang);
  if (!targetName) {
    throw Object.assign(new Error(`Unsupported target language: ${targetLang}`), { statusCode: 400 });
  }

  console.log(`[regenerate] translate target=${targetLang} (${targetName}) job=${jobId}`);

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
    .select("id, job_output_id, content, source_hash")
    .in("job_output_id", outputIds)
    .eq("language", targetLang);

  // Build map of fresh + valid variants. Stale rows are ignored (left for the
  // next translate call to overwrite). Fresh-but-invalid rows are evicted now
  // so the loop below regenerates them with the new prompt.
  const freshMap = new Map<string, string>();
  const evictIds: string[] = [];
  for (const v of (existingVariants ?? []) as Array<{ id: string; job_output_id: string; content: string; source_hash: string }>) {
    if (v.source_hash !== sourceHash) {
      console.log(`[regenerate] cache-read output=${v.job_output_id} status=stale`);
      continue;
    }
    const check = validateTranslation(v.content, targetLang);
    if (!check.ok) {
      console.warn(`[regenerate] cache-read output=${v.job_output_id} status=invalid-${check.stage} reason=${check.reason}`);
      evictIds.push(v.id);
      continue;
    }
    console.log(`[regenerate] cache-read output=${v.job_output_id} status=hit`);
    freshMap.set(v.job_output_id, v.content);
  }

  if (evictIds.length > 0) {
    const { error: evictErr } = await supabase
      .from("job_output_variants")
      .delete()
      .in("id", evictIds);
    if (evictErr) {
      console.warn(`[regenerate] cache-evict failed: ${evictErr.message}`);
    } else {
      console.log(`[regenerate] cache-evict count=${evictIds.length} reason=invalid`);
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
  const systemPrompt =
    `You are a professional translator. Translate the following content into ${targetName} (ISO 639-1 code: ${targetLang}). ` +
    `The output language MUST be ${targetName} — never any other language under any circumstances. ` +
    `Preserve ALL formatting EXACTLY: markdown structure, headings, bullets, bold/italic, line breaks, ` +
    `speaker labels (e.g. "Speaker A:"), timestamps (e.g. "[00:01:23]"), and section structure. ` +
    `Do NOT add, remove, summarise, interpret, or comment on the content. ` +
    `Output ONLY the translated text — no preface, no notes, no language tag.`;

  const result: Record<string, string> = {};

  for (const output of translatable) {
    if (freshMap.has(output.id)) {
      result[output.id] = freshMap.get(output.id)!;
      continue;
    }

    console.log(`[regenerate] translate output=${output.id} type=${output.output_type} target=${targetLang} status=missing-or-stale`);
    const translated = await callAI(apiKey, MODEL_TRANSLATE, systemPrompt, output.content);

    // Validate before caching. On failure, do not upsert and abort the whole
    // batch with a clear error — the client toast handles it and the user can
    // retry. Nothing partial gets cached.
    const check = validateTranslation(translated, targetLang);
    if (!check.ok) {
      console.warn(`[regenerate] translate output=${output.id} outcome=rejected stage=${check.stage} reason=${check.reason} detected=${check.detectedScript}`);
      throw Object.assign(
        new Error(`translation_validation_failed: ${check.reason ?? "unknown"}`),
        { statusCode: 422 },
      );
    }
    console.log(`[regenerate] validate output=${output.id} stage=${check.stage} result=pass`);

    // Upsert variant with source_hash
    await supabase.from("job_output_variants").upsert(
      { job_output_id: output.id, language: targetLang, content: translated, source_hash: sourceHash },
      { onConflict: "job_output_id,language" }
    );
    console.log(`[regenerate] translate output=${output.id} outcome=stored`);

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
  supabase: SupabaseClient,
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
  const systemPrompt = buildSummarySystemPrompt(lang);
  const userPrompt = buildSummaryUserPrompt(transcript);

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
  supabase: SupabaseClient,
  apiKey: string,
  jobId: string,
  outputType: "summary" | "custom",
  customPrompt: string | null,
  targetLang: string | null,
  extraSources: Array<{ id: string; title: string; content: string }> = [],
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
    systemPrompt = buildSummarySystemPrompt(lang);
    userPrompt = buildSummaryUserPrompt(transcript);

    await supabase.from("job_outputs").delete().eq("job_id", jobId).eq("output_type", "summary");
    console.log(`[regenerate] Regenerating summary for job ${jobId} in language: ${lang}`);
  } else {
    if (!customPrompt?.trim()) throw Object.assign(new Error("custom_prompt is required"), { statusCode: 400 });
    systemPrompt = CUSTOM_OUTPUT_SYSTEM_PROMPT;
    userPrompt = extraSources.length > 0
      ? buildCustomUserPromptMulti(customPrompt, transcript, extraSources)
      : buildCustomUserPrompt(customPrompt, transcript);
    console.log(`[regenerate] Processing job ${jobId}, prompt: "${customPrompt.slice(0, 80)}...", extras=${extraSources.length}`);
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

  // Persist which extra transcripts were used to ground this answer (custom path only).
  // Stored under metadata so the UI can render a chip row on saved Q&A entries.
  const insertMetadata = outputType === "custom" && extraSources.length > 0
    ? { extra_sources: extraSources.map((s) => ({ id: s.id, title: s.title })) }
    : null;

  const { data: insertedOutput, error: insertError } = await supabase
    .from("job_outputs")
    .insert({
      job_id: jobId,
      output_type: outputType === "summary" ? "summary" : "custom",
      content,
      custom_prompt: outputType === "custom" ? customPrompt : null,
      metadata: insertMetadata,
    })
    .select("id, output_type, content, custom_prompt, metadata")
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

    const supabase = createServiceClient();

    // SECURITY: require auth at the top. Previously this was only enforced
    // when extra_job_ids was supplied, leaving the AI gateway open to any
    // caller with a valid job_id (high spend risk).
    const auth = await requireAuth(req.headers.get("Authorization"));
    if (!auth.ok) return auth.response;
    const callerId = auth.userId;

    const body = await req.json();
    const { job_id, custom_prompt, output_type, target_language } = body;

    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ownership check — service-role client bypasses RLS, so verify here.
    const { data: ownerRow } = await supabase
      .from("jobs")
      .select("user_id")
      .eq("id", job_id)
      .maybeSingle();
    if (!ownerRow || ownerRow.user_id !== callerId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Quotas: cap regenerations per user/day and per job lifetime.
    const action = output_type === "translate_all"
      ? "regenerate_translate_all"
      : output_type === "summary_from_edit"
      ? "regenerate_summary_from_edit"
      : output_type === "summary"
      ? "regenerate_summary"
      : "regenerate_custom";

    const userBlocked = await enforceQuota(supabase, {
      userId: callerId,
      action,
      scope: "user_day",
      window: "1 day",
      limit: 100,
      jobId: job_id,
    });
    if (userBlocked) return userBlocked;

    const jobBlocked = await enforceQuota(supabase, {
      userId: callerId,
      action,
      scope: "job_lifetime",
      limit: 20,
      jobId: job_id,
    });
    if (jobBlocked) return jobBlocked;

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

    // ── Optional: extra transcript sources for the Questions/custom path ──
    // Validated under the caller's identity so we never reveal another user's
    // transcripts even though we use a service-role client for everything else.
    let extraSources: Array<{ title: string; content: string }> = [];
    const rawExtras = (body as { extra_job_ids?: unknown }).extra_job_ids;
    if (regenerateType === "custom" && Array.isArray(rawExtras) && rawExtras.length > 0) {
      const requested = rawExtras
        .filter((v): v is string => typeof v === "string" && UUID_RE.test(v) && v !== job_id)
        .slice(0, MAX_EXTRA_SOURCES);

      if (requested.length > 0) {
        // Auth + primary ownership already enforced at the top of the handler.

        // Validate ownership + completion for each extra. Drop unauthorized/invalid silently.
        const { data: ownedRows } = await supabase
          .from("jobs")
          .select("id, title, file_name")
          .in("id", requested)
          .eq("user_id", callerId)
          .eq("status", "completed");

        const owned = (ownedRows ?? []) as Array<{ id: string; title: string | null; file_name: string }>;
        if (owned.length > 0) {
          const { data: txRows } = await supabase
            .from("job_outputs")
            .select("job_id, content")
            .in("job_id", owned.map((o) => o.id))
            .eq("output_type", "transcript");

          const txMap = new Map<string, string>();
          for (const r of (txRows ?? []) as Array<{ job_id: string; content: string }>) {
            txMap.set(r.job_id, r.content);
          }

          // Preserve caller-specified ordering.
          const ownedById = new Map(owned.map((o) => [o.id, o]));
          let totalChars = 0;
          for (const id of requested) {
            const meta = ownedById.get(id);
            const content = txMap.get(id);
            if (!meta || !content) continue;
            if (totalChars + content.length > MAX_COMBINED_EXTRA_CHARS) {
              console.warn(`[regenerate] extra-sources char cap reached; dropping remaining ${requested.length - extraSources.length}`);
              break;
            }
            extraSources.push({ id, title: meta.title?.trim() || meta.file_name, content });
            totalChars += content.length;
          }
        }
      }
    }

    const insertedOutput = await handleSummaryOrCustom(
      supabase, LOVABLE_API_KEY, job_id, regenerateType, custom_prompt ?? null, target_language ?? null, extraSources,
    );

    console.log(`[regenerate] ${regenerateType} output regenerated for job ${job_id}`);
    return new Response(
      JSON.stringify({ success: true, job_id, output: insertedOutput }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const aiStatus = error instanceof AiGatewayError ? error.status : undefined;
    const statusCode = aiStatus ?? (error as { statusCode?: number }).statusCode;
    const status = statusCode && statusCode >= 400 && statusCode < 600 ? statusCode : 500;
    console.error(`[regenerate] Error:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
