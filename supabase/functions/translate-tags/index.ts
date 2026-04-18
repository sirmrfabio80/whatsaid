import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { AI_GATEWAY_URL } from "../_shared/ai-gateway.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const MODEL = "google/gemini-2.5-flash-lite";

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tags, target_lang } = await req.json();

    if (!Array.isArray(tags) || tags.length === 0 || typeof target_lang !== "string") {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // No translation needed for English
    if (target_lang === "en") {
      const identity: Record<string, string> = {};
      for (const t of tags) identity[t] = t;
      return new Response(JSON.stringify({ translations: identity }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limit batch size
    const batch = (tags as string[]).slice(0, 50);

    // Build name → normalized map (preserve original strings as response keys)
    const normByOriginal = new Map<string, string>();
    for (const t of batch) normByOriginal.set(t, normalize(t));
    const uniqueNorms = [...new Set(normByOriginal.values())];

    const supabase = createServiceClient();

    // 1. Cache lookup
    const { data: cached } = await supabase
      .from("tag_translations")
      .select("normalized_name, translated_name")
      .in("normalized_name", uniqueNorms)
      .eq("target_lang", target_lang);

    const cacheMap = new Map<string, string>();
    for (const row of cached ?? []) {
      cacheMap.set(row.normalized_name, row.translated_name);
    }

    // 2. Determine cache misses (by normalized name)
    const missingNorms = uniqueNorms.filter((n) => !cacheMap.has(n));

    // Pick one representative original string per missing normalized name
    const missingOriginals: string[] = [];
    const seenNorm = new Set<string>();
    for (const t of batch) {
      const n = normByOriginal.get(t)!;
      if (missingNorms.includes(n) && !seenNorm.has(n)) {
        seenNorm.add(n);
        missingOriginals.push(t);
      }
    }

    let aiTranslations: Record<string, string> = {};

    if (missingOriginals.length > 0) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        throw new Error("LOVABLE_API_KEY is not configured");
      }

      const systemPrompt = `You are a multilingual tag translator.

You will receive a JSON array of short tags/labels. Each tag may be in ANY language (English, Italian, French, Spanish, German, etc.). Your job is to translate every tag into ${target_lang}.

Rules:
- Auto-detect the source language of each tag independently.
- Translate the meaning into ${target_lang}, keeping it short (1-4 words) and lowercase when the source is lowercase.
- If a tag is already in ${target_lang}, return it unchanged.
- If a tag is a proper noun, brand name, acronym, or technical term with no natural translation, return it unchanged.
- Preserve the original tag string EXACTLY as the JSON key. Only the value changes.

Return ONLY a JSON object mapping each original tag (exact string) to its ${target_lang} translation. No commentary, no code fences.`;

      const userPrompt = `Translate these tags to ${target_lang}:\n${JSON.stringify(missingOriginals)}`;

      const res = await fetch(AI_GATEWAY_URL, {
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
          return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (res.status === 402) {
          return new Response(JSON.stringify({ error: "Payment required." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await res.text();
        console.error("AI gateway error:", res.status, t);
        return new Response(JSON.stringify({ error: "Translation failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      const rawContent = data.choices?.[0]?.message?.content ?? "";
      try {
        const cleaned = rawContent.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
        aiTranslations = JSON.parse(cleaned);
      } catch {
        aiTranslations = {};
      }

      // 3. Persist to cache (upsert, ignore conflicts)
      const rowsToInsert: Array<{ normalized_name: string; target_lang: string; translated_name: string }> = [];
      for (const original of missingOriginals) {
        const translated = aiTranslations[original];
        if (typeof translated !== "string" || !translated.trim()) continue;
        rowsToInsert.push({
          normalized_name: normalize(original),
          target_lang,
          translated_name: translated,
        });
      }
      if (rowsToInsert.length > 0) {
        const { error: insertErr } = await supabase
          .from("tag_translations")
          .upsert(rowsToInsert, { onConflict: "normalized_name,target_lang", ignoreDuplicates: true });
        if (insertErr) {
          console.warn("tag_translations upsert failed:", insertErr.message);
        }
        // Update local cacheMap so we use them in response
        for (const r of rowsToInsert) cacheMap.set(r.normalized_name, r.translated_name);
      }
    }

    // 4. Build response keyed by original tag strings
    const result: Record<string, string> = {};
    for (const original of batch) {
      const n = normByOriginal.get(original)!;
      result[original] = cacheMap.get(n) ?? aiTranslations[original] ?? original;
    }

    return new Response(JSON.stringify({ translations: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("translate-tags error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
