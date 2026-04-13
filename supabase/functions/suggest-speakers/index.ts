import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash-lite";
const MAX_FULL_CHARS = 15_000;
const ANCHOR_CHARS = 2_000;
const TEXT_PREVIEW_CHARS = 50;
const MIN_CONFIDENCE = 0.5;

interface TranscriptLine {
  id: string;
  speaker: string | null;
  text: string;
}

interface Suggestion {
  id: string;
  confidence: number;
}

function buildTranscriptPayload(
  lines: TranscriptLine[],
  excludedIds: Set<string>
): { formatted: string; truncated: boolean } {
  const eligible = lines.filter((l) => !excludedIds.has(l.id));

  // Full representation
  const full = eligible
    .map((l) => `[${l.id}] ${l.speaker ?? "?"}: ${l.text}`)
    .join("\n");

  if (full.length <= MAX_FULL_CHARS) {
    return { formatted: full, truncated: false };
  }

  // Truncated: anchors + metadata
  const firstLines: string[] = [];
  const lastLines: string[] = [];
  let firstLen = 0;
  let lastLen = 0;

  for (const l of eligible) {
    const line = `[${l.id}] ${l.speaker ?? "?"}: ${l.text}`;
    if (firstLen + line.length <= ANCHOR_CHARS) {
      firstLines.push(line);
      firstLen += line.length;
    } else break;
  }

  for (let i = eligible.length - 1; i >= 0; i--) {
    const l = eligible[i];
    const line = `[${l.id}] ${l.speaker ?? "?"}: ${l.text}`;
    if (lastLen + line.length <= ANCHOR_CHARS) {
      lastLines.unshift(line);
      lastLen += line.length;
    } else break;
  }

  // Middle lines: metadata only
  const firstIds = new Set(firstLines.map((_, i) => eligible[i].id));
  const lastIds = new Set(lastLines.map((l) => l.match(/^\[([^\]]+)\]/)?.[1]));
  const middleMeta = eligible
    .filter((l) => !firstIds.has(l.id) && !lastIds.has(l.id))
    .map(
      (l) =>
        `[${l.id}] ${l.speaker ?? "?"}: ${l.text.slice(0, TEXT_PREVIEW_CHARS)}${l.text.length > TEXT_PREVIEW_CHARS ? "…" : ""}`
    )
    .join("\n");

  const formatted = [
    "=== START ===",
    firstLines.join("\n"),
    "=== MIDDLE (summaries) ===",
    middleMeta,
    "=== END ===",
    lastLines.join("\n"),
  ].join("\n\n");

  return { formatted, truncated: true };
}

function validateSuggestions(
  raw: unknown,
  validIds: Set<string>
): Suggestion[] {
  if (!Array.isArray(raw)) return [];

  const result: Suggestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = (item as Record<string, unknown>).id;
    const confidence = (item as Record<string, unknown>).confidence;
    if (typeof id !== "string" || typeof confidence !== "number") continue;
    if (!validIds.has(id)) continue;
    if (confidence < MIN_CONFIDENCE) continue;
    result.push({ id, confidence: Math.round(confidence * 100) / 100 });
  }

  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      transcript_lines,
      target_speaker,
      existing_speakers,
      excluded_ids,
    } = await req.json();

    if (
      !Array.isArray(transcript_lines) ||
      !target_speaker ||
      !Array.isArray(existing_speakers)
    ) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI gateway not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const excludedSet = new Set<string>(excluded_ids ?? []);
    const validIds = new Set<string>(
      (transcript_lines as TranscriptLine[])
        .filter((l) => !excludedSet.has(l.id))
        .map((l) => l.id)
    );

    const { formatted, truncated } = buildTranscriptPayload(
      transcript_lines as TranscriptLine[],
      excludedSet
    );

    const systemPrompt = `You are a transcript speaker-attribution assistant.

You are given a transcript with speaker labels and segment IDs. A new speaker "${target_speaker}" has been added but has no segments assigned yet.

Your task: identify which existing segments most likely belong to "${target_speaker}" based on conversational patterns, turn-taking, topic continuity, and context.

Existing speakers: ${existing_speakers.join(", ")}

Rules:
- Return ONLY a JSON array of objects with "id" (segment ID) and "confidence" (0.0 to 1.0)
- Only include segments you are reasonably confident belong to "${target_speaker}" (confidence >= 0.5)
- Do NOT modify any text — only suggest ownership changes
- Do NOT assign segments that clearly belong to their current speaker
- Look for patterns: if the transcript has Speaker A only but clearly contains two distinct voices/perspectives, suggest which segments belong to the new speaker
- If you cannot identify any segments for the new speaker, return an empty array []
${truncated ? "\n- Note: The middle section shows only previews. Use the full start/end context and speaker patterns to make inferences." : ""}`;

    const userPrompt = `Analyze this transcript and suggest which segments belong to "${target_speaker}":\n\n${formatted}`;

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

    if (!res.ok) {
      if (res.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (res.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await res.text();
      console.error("AI gateway error:", res.status, t.slice(0, 300));
      return new Response(
        JSON.stringify({ error: "AI suggestion failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content ?? "";

    let parsed: unknown;
    try {
      const cleaned = rawContent
        .replace(/```(?:json)?\s*/g, "")
        .replace(/```/g, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", rawContent.slice(0, 500));
      return new Response(
        JSON.stringify({ suggestions: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const suggestions = validateSuggestions(parsed, validIds);

    console.log(
      `[suggest-speakers] target=${target_speaker} lines=${transcript_lines.length} excluded=${excludedSet.size} suggestions=${suggestions.length} truncated=${truncated}`
    );

    return new Response(
      JSON.stringify({ suggestions }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("suggest-speakers error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
