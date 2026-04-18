import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/supabase.ts";
import { AI_GATEWAY_URL } from "../_shared/ai-gateway.ts";

const MODEL = "google/gemini-2.5-flash";

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

interface FixResult {
  tag_id: string;
  detected_lang: string;
  english_name: string;
}

serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const auth = await requireAdmin(req.headers.get("Authorization"));
    if (!auth.ok) return auth.response;
    const { adminClient } = auth;

    const body = await req.json().catch(() => ({}));
    const flagIds: string[] | undefined = Array.isArray(body?.flag_ids) ? body.flag_ids : undefined;

    // Load open flags
    let q = adminClient
      .from("tag_quality_flags")
      .select("id, tag_id, tag_name, detected_lang")
      .eq("status", "open");
    if (flagIds && flagIds.length > 0) q = q.in("id", flagIds);
    const { data: flags, error: flagsErr } = await q.limit(200);
    if (flagsErr) {
      return jsonResponse({ error: flagsErr.message }, 500);
    }
    if (!flags || flags.length === 0) {
      return jsonResponse({ fixed: 0, errors: [] });
    }

    // Build payload for AI
    const tagsForAi = flags.map((f) => ({ tag_id: f.tag_id, name: f.tag_name }));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return jsonResponse({ error: "LOVABLE_API_KEY missing" }, 500);

    const systemPrompt = `You normalize multilingual short tags/labels.
For each input tag, return:
- tag_id: the input tag_id, unchanged
- detected_lang: ISO 639-1 lowercase code of the source language ("en" if already English)
- english_name: the canonical English form of the tag, lowercase, 1-4 words. If already English, return as-is. If a proper noun/brand/acronym with no translation, return it unchanged but still set detected_lang correctly.`;

    const userPrompt = `Process these tags:\n${JSON.stringify(tagsForAi)}`;

    const aiRes = await fetch(AI_GATEWAY_URL, {
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
        tools: [
          {
            type: "function",
            function: {
              name: "return_normalized_tags",
              description: "Return the normalized tag results.",
              parameters: {
                type: "object",
                properties: {
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        tag_id: { type: "string" },
                        detected_lang: { type: "string" },
                        english_name: { type: "string" },
                      },
                      required: ["tag_id", "detected_lang", "english_name"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["results"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_normalized_tags" } },
      }),
    });

    if (aiRes.status === 429) return jsonResponse({ error: "Rate limited" }, 429);
    if (aiRes.status === 402) return jsonResponse({ error: "Payment required" }, 402);
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, t);
      return jsonResponse({ error: "AI gateway error" }, 500);
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let results: FixResult[] = [];
    try {
      const args = JSON.parse(toolCall?.function?.arguments ?? "{}");
      results = Array.isArray(args.results) ? args.results : [];
    } catch (e) {
      console.error("Failed to parse AI tool args:", e);
      return jsonResponse({ error: "AI returned malformed output" }, 500);
    }

    const resultByTagId = new Map<string, FixResult>();
    for (const r of results) {
      if (r?.tag_id && r?.english_name && r?.detected_lang) {
        resultByTagId.set(r.tag_id, r);
      }
    }

    const errors: Array<{ flag_id: string; message: string }> = [];
    let fixed = 0;

    for (const flag of flags) {
      const r = resultByTagId.get(flag.tag_id);
      if (!r) {
        errors.push({ flag_id: flag.id, message: "AI did not return result for this tag" });
        continue;
      }

      try {
        const englishName = r.english_name.trim();
        const englishNorm = normalize(englishName);
        const detectedLang = r.detected_lang.trim().toLowerCase();
        const originalName = flag.tag_name;
        const originalNorm = normalize(originalName);

        // Fetch the tag to get user_id and current state
        const { data: tagRow, error: tagFetchErr } = await adminClient
          .from("tags")
          .select("id, user_id, name, normalized_name")
          .eq("id", flag.tag_id)
          .maybeSingle();

        if (tagFetchErr || !tagRow) {
          errors.push({ flag_id: flag.id, message: tagFetchErr?.message ?? "Tag not found" });
          continue;
        }

        // Check for collision: existing tag for same user with the new normalized name
        const { data: existing } = await adminClient
          .from("tags")
          .select("id")
          .eq("user_id", tagRow.user_id)
          .eq("normalized_name", englishNorm)
          .neq("id", tagRow.id)
          .maybeSingle();

        if (existing) {
          // Repoint job_tags to surviving tag, then delete the duplicate
          const { error: repointErr } = await adminClient
            .from("job_tags")
            .update({ tag_id: existing.id })
            .eq("tag_id", tagRow.id);
          if (repointErr) {
            errors.push({ flag_id: flag.id, message: `Repoint failed: ${repointErr.message}` });
            continue;
          }
          const { error: delErr } = await adminClient.from("tags").delete().eq("id", tagRow.id);
          if (delErr) {
            errors.push({ flag_id: flag.id, message: `Delete duplicate failed: ${delErr.message}` });
            continue;
          }
        } else {
          // Rename tag (trigger renormalizes + invalidates old translation cache for original normalized_name)
          const { error: updErr } = await adminClient
            .from("tags")
            .update({ name: englishName, source: "ai" })
            .eq("id", tagRow.id);
          if (updErr) {
            errors.push({ flag_id: flag.id, message: `Rename failed: ${updErr.message}` });
            continue;
          }
        }

        // Seed translation in detected source language (if non-English and differs from canonical)
        if (detectedLang && detectedLang !== "en" && originalNorm !== englishNorm) {
          const { error: transErr } = await adminClient
            .from("tag_translations")
            .upsert(
              {
                normalized_name: englishNorm,
                target_lang: detectedLang,
                translated_name: originalName,
              },
              { onConflict: "normalized_name,target_lang", ignoreDuplicates: false },
            );
          if (transErr) {
            console.warn("Seed translation failed:", transErr.message);
          }
        }

        // Resolve flag
        const { error: flagErr } = await adminClient
          .from("tag_quality_flags")
          .update({ status: "resolved", resolved_at: new Date().toISOString() })
          .eq("id", flag.id);
        if (flagErr) {
          errors.push({ flag_id: flag.id, message: `Flag update failed: ${flagErr.message}` });
          continue;
        }

        fixed++;
      } catch (e) {
        errors.push({
          flag_id: flag.id,
          message: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    return jsonResponse({ fixed, errors });
  } catch (e) {
    console.error("fix-flagged-tags error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
