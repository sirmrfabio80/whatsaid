import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/supabase.ts";
import { requireEnv } from "../_shared/env.ts";
import { classifyTagLanguages } from "../_shared/auto-tag.ts";

/**
 * Admin scan: LLM-classify every AI tag and insert tag_quality_flags
 * for ones detected as non-English. Skips tags that already have an open flag.
 * Idempotent — safe to re-run.
 */
serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const auth = await requireAdmin(req.headers.get("Authorization"));
    if (!auth.ok) return auth.response;
    const { adminClient } = auth;

    const LOVABLE_API_KEY = requireEnv("LOVABLE_API_KEY");
    // Fetch all AI tags
    const { data: tags, error: tagsErr } = await adminClient
      .from("tags")
      .select("id, name")
      .eq("source", "ai")
      .limit(2000);

    if (tagsErr) return jsonResponse({ error: tagsErr.message }, 500);
    if (!tags || tags.length === 0) {
      return jsonResponse({ scanned: 0, flagged: 0, skipped: 0 });
    }

    // Skip tags that already have an open flag
    const { data: openFlags } = await adminClient
      .from("tag_quality_flags")
      .select("tag_id")
      .eq("status", "open");
    const alreadyFlagged = new Set((openFlags ?? []).map((f) => f.tag_id));

    const toScan = tags.filter((t) => !alreadyFlagged.has(t.id));
    if (toScan.length === 0) {
      return jsonResponse({ scanned: 0, flagged: 0, skipped: tags.length });
    }

    // Batch into chunks of 50 to keep LLM calls reasonable
    const CHUNK = 50;
    let flagged = 0;

    for (let i = 0; i < toScan.length; i += CHUNK) {
      const batch = toScan.slice(i, i + CHUNK);
      const langMap = await classifyTagLanguages(
        batch.map((t) => t.name),
        LOVABLE_API_KEY,
      );

      for (const t of batch) {
        const lang = langMap.get(t.name);
        if (!lang || lang === "en" || lang === "unknown") continue;

        const { error: insErr } = await adminClient
          .from("tag_quality_flags")
          .insert({
            tag_id: t.id,
            tag_name: t.name,
            detected_lang: lang,
            status: "open",
          });

        if (insErr && !insErr.message?.toLowerCase().includes("duplicate")) {
          console.warn(`[scan-non-english-tags] insert failed for tag ${t.id}:`, insErr.message);
          continue;
        }
        flagged++;
      }
    }

    return jsonResponse({
      scanned: toScan.length,
      flagged,
      skipped: tags.length - toScan.length,
    });
  } catch (e) {
    console.error("scan-non-english-tags error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
