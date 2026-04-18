import type { SupabaseClient } from "./supabase.ts";
import { AI_GATEWAY_URL } from "./ai-gateway.ts";
import { TAGS_SYSTEM_PROMPT, buildTagsUserPrompt } from "./prompts.ts";

const MODEL = "google/gemini-2.5-flash-lite";
const MIN_TRANSCRIPT_LENGTH = 100;
const MAX_TAGS = 6;

interface AutoTagResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  generated: number;
  reused: number;
  created: number;
  assigned: number;
}

function normalizeTagName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function validateAndCleanTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const normalized = normalizeTagName(trimmed);
    if (normalized.length < 2 || normalized.length > 100) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(trimmed);
    if (result.length >= MAX_TAGS) break;
  }

  return result;
}

export async function autoTag(
  supabase: SupabaseClient,
  jobId: string,
  apiKey: string
): Promise<AutoTagResult> {
  const empty: AutoTagResult = { success: true, skipped: true, reason: "", generated: 0, reused: 0, created: 0, assigned: 0 };

  // 1. Fetch job and confirm owner
  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("user_id")
    .eq("id", jobId)
    .single();

  if (jobErr || !job) {
    return { ...empty, success: false, reason: `Job not found: ${jobErr?.message}` };
  }

  const userId = job.user_id;
  if (!userId) {
    return { ...empty, reason: "No user_id on job (guest job), skipping tags" };
  }

  // 2. Fetch transcript
  const { data: txRow } = await supabase
    .from("job_outputs")
    .select("content")
    .eq("job_id", jobId)
    .eq("output_type", "transcript")
    .single();

  const transcript = txRow?.content ?? "";
  if (transcript.length < MIN_TRANSCRIPT_LENGTH) {
    return { ...empty, reason: `Transcript too short (${transcript.length} chars), skipping tags` };
  }

  // 3. Call AI for tag suggestions
  const systemPrompt = TAGS_SYSTEM_PROMPT;
  const userPrompt = buildTagsUserPrompt(transcript.slice(0, 12000));

  const res = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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

  if (!res.ok) {
    const t = await res.text();
    return { ...empty, success: false, skipped: false, reason: `AI error [${res.status}]: ${t.slice(0, 200)}` };
  }

  const data = await res.json();
  const rawContent = data.choices?.[0]?.message?.content ?? "";

  // 4. Parse and validate AI output
  let parsed: unknown;
  try {
    // Strip markdown code fences if present
    const cleaned = rawContent.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return { ...empty, success: false, skipped: false, reason: `Failed to parse AI response as JSON` };
  }

  const candidateTags = validateAndCleanTags(parsed);
  if (candidateTags.length === 0) {
    return { ...empty, reason: "AI returned no valid tags after validation" };
  }

  const generated = candidateTags.length;

  // 5. Normalize candidates
  const candidates = candidateTags.map((name) => ({
    display: name,
    normalized: normalizeTagName(name),
  }));

  const normalizedNames = candidates.map((c) => c.normalized);

  // 6. Look up existing user tags by normalized_name
  const { data: existingTags } = await supabase
    .from("tags")
    .select("id, normalized_name")
    .eq("user_id", userId)
    .in("normalized_name", normalizedNames);

  const existingMap = new Map<string, string>();
  for (const t of existingTags ?? []) {
    existingMap.set(t.normalized_name, t.id);
  }

  const reused = existingMap.size;

  // 7. Insert missing tags (trigger handles normalized_name)
  const newTags = candidates.filter((c) => !existingMap.has(c.normalized));
  let created = 0;

  if (newTags.length > 0) {
    const rows = newTags.map((c) => ({
      user_id: userId,
      name: c.display,
      normalized_name: c.normalized,
      source: "ai",
    }));

    // Use individual inserts with ON CONFLICT handling via upsert
    for (const row of rows) {
      const { error } = await supabase
        .from("tags")
        .upsert(row, { onConflict: "user_id,normalized_name", ignoreDuplicates: true });
      if (!error) created++;
    }
  }

  // 8. Fetch all tag IDs for these normalized names
  const { data: allTags } = await supabase
    .from("tags")
    .select("id, normalized_name")
    .eq("user_id", userId)
    .in("normalized_name", normalizedNames);

  const tagIds = (allTags ?? []).map((t) => t.id);

  // 9. Insert job_tags assignments
  let assigned = 0;
  for (const tagId of tagIds) {
    const { error } = await supabase
      .from("job_tags")
      .upsert({ job_id: jobId, tag_id: tagId }, { onConflict: "job_id,tag_id", ignoreDuplicates: true });
    if (!error) assigned++;
  }

  // 10. Inline non-English detection — flag suspect AI tags for admin review
  try {
    const suspects = candidates.filter((c) => !looksEnglish(c.display));
    if (suspects.length > 0) {
      // Resolve tag IDs for the suspects
      const suspectNorms = suspects.map((s) => s.normalized);
      const { data: suspectRows } = await supabase
        .from("tags")
        .select("id, name, normalized_name")
        .eq("user_id", userId)
        .in("normalized_name", suspectNorms);

      for (const row of suspectRows ?? []) {
        const detected = guessLang(row.name);
        // Use upsert keyed on tag_id where status='open' (partial unique index handles dedupe)
        const { error: flagErr } = await supabase
          .from("tag_quality_flags")
          .insert({
            tag_id: row.id,
            tag_name: row.name,
            detected_lang: detected,
            status: "open",
          });
        if (flagErr && !flagErr.message?.includes("duplicate")) {
          console.warn(`[auto-tag] flag insert failed for tag ${row.id}:`, flagErr.message);
        }
      }
      if ((suspectRows ?? []).length > 0) {
        console.log(`[auto-tag] flagged ${suspectRows!.length} non-English AI tag(s) for job=${jobId}`);
      }
    }
  } catch (e) {
    console.warn("[auto-tag] quality-flag pass failed:", e);
  }

  console.log(
    `[auto-tag] job=${jobId} user=${userId} generated=${generated} reused=${reused} created=${created} assigned=${assigned}`
  );

  return { success: true, skipped: false, generated, reused, created, assigned };
}

/**
 * Heuristic: does this tag look like English?
 * - Only ASCII letters/spaces/hyphens/digits → almost certainly English (or untranslatable acronym)
 * - Contains diacritics (à, é, ñ, ü, ç…) → likely non-English
 * - Contains common non-English function words → non-English
 */
function looksEnglish(tag: string): boolean {
  const t = tag.trim().toLowerCase();
  if (!t) return true;

  // Diacritics → non-English
  if (/[àáâãäåèéêëìíîïòóôõöùúûüñçßœæ]/i.test(t)) return false;

  // Common Italian / French / Spanish / German function words or fragments
  const nonEnglishMarkers = [
    /\b(di|del|della|degli|delle|al|alla|dei|sul|sulla|nel|nella|con|per|dal|dalla)\b/, // it
    /\b(le|la|les|du|des|aux?|avec|pour|dans|chez|sur)\b/, // fr (some overlap with en handled below)
    /\b(el|los|las|una?|con|por|para|del?)\b/, // es
    /\b(der|die|das|den|dem|und|mit|für|nicht|aber)\b/, // de
  ];
  for (const re of nonEnglishMarkers) {
    if (re.test(t)) return false;
  }

  // Pure ASCII letters / digits / space / hyphen → assume English
  if (/^[a-z0-9 \-/&.]+$/i.test(t)) return true;

  // Anything else → suspect
  return false;
}

function guessLang(tag: string): string {
  const t = tag.toLowerCase();
  if (/[àèéìòóù]/.test(t) || /\b(di|del|della|degli|delle|alla|sulla)\b/.test(t)) return "it";
  if (/[âêëïôœç]/.test(t) || /\b(le|les|du|des|avec|pour|chez)\b/.test(t)) return "fr";
  if (/[ñ]/.test(t) || /\b(el|los|las|una|por|para)\b/.test(t)) return "es";
  if (/[äöüß]/.test(t) || /\b(der|die|das|und|mit|für)\b/.test(t)) return "de";
  return "unknown";
}
