import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { AI_GATEWAY_URL } from "../_shared/ai-gateway.ts";

const MODEL = "google/gemini-2.5-flash-lite";

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Limit batch size
    const batch = tags.slice(0, 50);

    const systemPrompt = `You are a translator. Translate the given English tags/labels into ${target_lang}. Return ONLY a JSON object mapping each English tag to its translation. Keep translations short (1-4 words). If a tag is a proper noun or technical term that doesn't translate, keep it as-is.`;

    const userPrompt = `Translate these English tags to ${target_lang}:\n${JSON.stringify(batch)}`;

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

    let parsed: Record<string, string>;
    try {
      const cleaned = rawContent.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: return identity
      const identity: Record<string, string> = {};
      for (const t of batch) identity[t] = t;
      parsed = identity;
    }

    return new Response(JSON.stringify({ translations: parsed }), {
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
