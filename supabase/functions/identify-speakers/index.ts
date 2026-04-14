import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash-lite";

// ---- Stopwords (duplicated from client for edge function isolation) ----
const STOPWORDS = new Set([
  "qui", "bene", "pronto", "presente", "sicuro", "contento", "contenta",
  "felice", "stanco", "stanca", "certo", "certa", "solo", "sola",
  "ancora", "anche", "molto", "poco", "tutto", "niente", "sempre",
  "accordo", "vero", "vera", "bravo", "brava", "disponibile",
  "here", "fine", "ready", "good", "well", "sorry", "sure", "happy",
  "tired", "done", "busy", "back", "home", "glad", "okay", "great",
  "available", "alone", "late", "early", "right", "wrong", "certain",
  "bien", "ici", "content", "contente", "fatigué", "fatiguée",
  "occupé", "occupée", "seul", "seule", "encore", "aussi", "tout",
  "rien", "toujours", "disponible", "accord", "sûr", "sûre",
  "désolé", "désolée", "prêt", "prête",
]);

interface TranscriptLine {
  speaker: string | null;
  text: string;
}

interface Candidate {
  name: string;
  evidence: string[];
  role?: string;
  capitalised: boolean;
}

interface Identification {
  speaker_label: string;
  inferred_name: string;
  confidence: number;
  evidence: string[];
  role?: string;
  status: "applied" | "suggested";
  source: "deterministic" | "ai";
}

// ---- Deterministic extraction patterns ----

function isValidName(token: string): boolean {
  if (token.length < 2) return false;
  if (STOPWORDS.has(token.toLowerCase())) return false;
  if (/^\d+$/.test(token)) return false;
  return true;
}

function isCapitalised(token: string): boolean {
  return /^[A-ZÀ-ÖØ-Þ]/.test(token);
}

/** Strip trailing punctuation from captured name tokens */
function cleanName(raw: string): string {
  return raw.replace(/[,.:;!?'"]+$/, "").trim();
}

/** Extract candidate names from a single utterance using strict self-identification patterns */
function extractSelfIdentification(text: string): Candidate | null {
  const t = text.trim();

  // Italian patterns (case-insensitive)
  // "mi chiamo X"
  let m = t.match(/\bmi\s+chiamo\s+(\S+)/i);
  if (m && isValidName(m[1])) {
    return { name: m[1], evidence: [t], capitalised: isCapitalised(m[1]) };
  }

  // "io sono X" — with stopword filter
  m = t.match(/\bio\s+sono\s+(\S+)/i);
  if (m && isValidName(m[1])) {
    return { name: m[1], evidence: [t], capitalised: isCapitalised(m[1]) };
  }

  // "sono il/la dottore/dottoressa/dottor X" or "sono il/la terapista [occupazionale] X" etc.
  m = t.match(/\bsono\s+(?:il|la)\s+(dott(?:or(?:essa)?|\.?)\s+\S+|terapist[ao]\s+(?:occupazionale\s+)?\S+|infermier[aeo]\s+\S+)/i);
  if (m) {
    const parts = m[1].trim().split(/\s+/);
    const namePart = parts[parts.length - 1];
    const rolePart = parts.slice(0, -1).join(" ");
    if (isValidName(namePart)) {
      return { name: namePart, evidence: [t], role: rolePart, capitalised: isCapitalised(namePart) };
    }
  }

  // English patterns
  // "my name is X"
  m = t.match(/\bmy\s+name\s+is\s+(\S+)/i);
  if (m && isValidName(m[1])) {
    return { name: m[1], evidence: [t], capitalised: isCapitalised(m[1]) };
  }

  // "I am X" — with stopword filter
  m = t.match(/\bI\s+am\s+(\S+)/i);
  if (m && isValidName(m[1])) {
    return { name: m[1], evidence: [t], capitalised: isCapitalised(m[1]) };
  }

  // "I'm X"
  m = t.match(/\bI['']m\s+(\S+)/i);
  if (m && isValidName(m[1])) {
    return { name: m[1], evidence: [t], capitalised: isCapitalised(m[1]) };
  }

  // "this is X" at start of utterance
  m = t.match(/^this\s+is\s+(\S+)/i);
  if (m && isValidName(m[1])) {
    return { name: m[1], evidence: [t], capitalised: isCapitalised(m[1]) };
  }

  // "X speaking" at end
  m = t.match(/(\S+)\s+speaking\s*[.!]?\s*$/i);
  if (m && isValidName(m[1])) {
    return { name: m[1], evidence: [t], capitalised: isCapitalised(m[1]) };
  }

  // French patterns
  // "je m'appelle X"
  m = t.match(/\bje\s+m['']appelle\s+(\S+)/i);
  if (m && isValidName(m[1])) {
    return { name: m[1], evidence: [t], capitalised: isCapitalised(m[1]) };
  }

  // "je suis X" — with stopword filter
  m = t.match(/\bje\s+suis\s+(\S+)/i);
  if (m && isValidName(m[1])) {
    return { name: m[1], evidence: [t], capitalised: isCapitalised(m[1]) };
  }

  return null;
}

function runDeterministicExtraction(
  lines: TranscriptLine[],
  existingSpeakerNames: Record<string, string>
): Identification[] {
  // Group candidates by speaker
  const speakerCandidates = new Map<string, Candidate[]>();

  for (const line of lines) {
    if (!line.speaker) continue;
    // Skip speakers already manually renamed
    if (existingSpeakerNames[line.speaker]) continue;

    const candidate = extractSelfIdentification(line.text);
    if (!candidate) continue;

    const existing = speakerCandidates.get(line.speaker) ?? [];
    existing.push(candidate);
    speakerCandidates.set(line.speaker, existing);
  }

  // Check for cross-speaker name conflicts
  const nameToSpeakers = new Map<string, string[]>();
  for (const [speaker, candidates] of speakerCandidates) {
    const names = [...new Set(candidates.map((c) => c.name.toLowerCase()))];
    for (const name of names) {
      const speakers = nameToSpeakers.get(name) ?? [];
      speakers.push(speaker);
      nameToSpeakers.set(name, speakers);
    }
  }

  const results: Identification[] = [];

  for (const [speaker, candidates] of speakerCandidates) {
    // Group by lowercase name
    const nameGroups = new Map<string, Candidate[]>();
    for (const c of candidates) {
      const key = c.name.toLowerCase();
      const group = nameGroups.get(key) ?? [];
      group.push(c);
      nameGroups.set(key, group);
    }

    if (nameGroups.size === 1) {
      // Single consistent name
      const [, group] = [...nameGroups.entries()][0];
      const bestCandidate = group.find((c) => c.capitalised) ?? group[0];
      // Use capitalised version if available
      const displayName = bestCandidate.name.charAt(0).toUpperCase() + bestCandidate.name.slice(1);
      const allEvidence = [...new Set(group.flatMap((c) => c.evidence))].slice(0, 3);
      const role = group.find((c) => c.role)?.role;

      // Check cross-speaker conflict
      const conflictingSpeakers = nameToSpeakers.get(bestCandidate.name.toLowerCase()) ?? [];
      const hasConflict = conflictingSpeakers.length > 1;

      let confidence = 0.90;
      if (bestCandidate.capitalised) confidence += 0.05;
      if (group.length > 1) confidence = Math.min(confidence + 0.03, 0.95);
      if (hasConflict) confidence = Math.min(confidence, 0.5);

      results.push({
        speaker_label: speaker,
        inferred_name: displayName,
        confidence,
        evidence: allEvidence,
        role,
        status: hasConflict ? "suggested" : confidence >= 0.85 ? "applied" : "suggested",
        source: "deterministic",
      });
    } else {
      // Multiple conflicting names for same speaker — ambiguous
      const allNames = [...nameGroups.keys()];
      const allEvidence = candidates.flatMap((c) => c.evidence).slice(0, 3);
      // Pick the most frequent
      const sorted = [...nameGroups.entries()].sort((a, b) => b[1].length - a[1].length);
      const [, topGroup] = sorted[0];
      const bestCandidate = topGroup.find((c) => c.capitalised) ?? topGroup[0];
      const displayName = bestCandidate.name.charAt(0).toUpperCase() + bestCandidate.name.slice(1);

      results.push({
        speaker_label: speaker,
        inferred_name: displayName,
        confidence: 0.5,
        evidence: allEvidence,
        role: topGroup.find((c) => c.role)?.role,
        status: "suggested",
        source: "deterministic",
      });
    }
  }

  return results;
}

// ---- AI disambiguation ----

async function runAIDisambiguation(
  ambiguousResults: Identification[],
  lines: TranscriptLine[],
  apiKey: string
): Promise<Identification[]> {
  if (ambiguousResults.length === 0) return [];

  // Only send relevant segments
  const speakerLabels = new Set(ambiguousResults.map((r) => r.speaker_label));
  const relevantLines = lines
    .filter((l) => l.speaker && speakerLabels.has(l.speaker))
    .slice(0, 100) // Limit to avoid token limits
    .map((l) => `${l.speaker}: ${l.text}`)
    .join("\n");

  const ambiguityDescription = ambiguousResults
    .map((r) => `${r.speaker_label} → candidate: "${r.inferred_name}" (confidence: ${r.confidence}, evidence: ${r.evidence.join(" | ")})`)
    .join("\n");

  const systemPrompt = `You are a speaker name identification assistant. Given transcript segments and ambiguous name candidates, resolve the ambiguity.

Rules:
- Only use evidence from the transcript itself
- Prefer first-person self-identification over third-party references
- Clean up role/name combinations (e.g. "terapista occupazionale Camilla" → name: "Camilla", role: "terapista occupazionale")
- If truly ambiguous, keep confidence low
- Return a JSON array of objects with: speaker_label, inferred_name, confidence (0-1), role (optional)`;

  const userPrompt = `Ambiguous candidates:\n${ambiguityDescription}\n\nRelevant transcript:\n${relevantLines}`;

  try {
    const res = await fetch(AI_GATEWAY, {
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
      console.error("AI disambiguation failed:", res.status);
      return ambiguousResults; // Return deterministic results as fallback
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content ?? "";

    let parsed: unknown;
    try {
      const cleaned = rawContent.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI disambiguation response");
      return ambiguousResults;
    }

    if (!Array.isArray(parsed)) return ambiguousResults;

    // Merge AI results back
    const aiMap = new Map<string, { inferred_name: string; confidence: number; role?: string }>();
    for (const item of parsed) {
      if (item?.speaker_label && item?.inferred_name && typeof item?.confidence === "number") {
        aiMap.set(item.speaker_label, {
          inferred_name: item.inferred_name,
          confidence: Math.min(item.confidence, 0.95),
          role: item.role,
        });
      }
    }

    return ambiguousResults.map((r) => {
      const ai = aiMap.get(r.speaker_label);
      if (!ai) return r;
      return {
        ...r,
        inferred_name: ai.inferred_name,
        confidence: ai.confidence,
        role: ai.role ?? r.role,
        status: ai.confidence >= 0.85 ? "applied" as const : "suggested" as const,
        source: "ai" as const,
      };
    });
  } catch (e) {
    console.error("AI disambiguation error:", e);
    return ambiguousResults;
  }
}

// ---- Main handler ----

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_id, transcript_lines, existing_speaker_names, force } = await req.json();

    if (!job_id || !Array.isArray(transcript_lines)) {
      return new Response(
        JSON.stringify({ error: "Missing job_id or transcript_lines" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Execution guard: check for existing results unless force=true
    if (!force) {
      const { data: existing } = await supabase
        .from("job_outputs")
        .select("id, metadata")
        .eq("job_id", job_id)
        .eq("output_type", "speaker_identifications")
        .maybeSingle();

      if (existing) {
        console.log(`[identify-speakers] Existing results found for job ${job_id}, returning cached`);
        return new Response(
          JSON.stringify({ cached: true, data: existing.metadata }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const speakerNames: Record<string, string> = existing_speaker_names ?? {};
    const lines = transcript_lines as TranscriptLine[];

    // Step 1: Deterministic extraction
    const deterministicResults = runDeterministicExtraction(lines, speakerNames);
    console.log(`[identify-speakers] Deterministic: ${deterministicResults.length} candidates for job ${job_id}`);

    // Step 2: AI disambiguation for ambiguous results only
    const ambiguous = deterministicResults.filter(
      (r) => r.confidence <= 0.7 || r.status === "suggested"
    );

    let finalResults = deterministicResults;
    if (ambiguous.length > 0 && LOVABLE_API_KEY) {
      const aiResults = await runAIDisambiguation(ambiguous, lines, LOVABLE_API_KEY);
      // Merge: replace ambiguous with AI results
      const aiMap = new Map(aiResults.map((r) => [r.speaker_label, r]));
      finalResults = deterministicResults.map((r) => aiMap.get(r.speaker_label) ?? r);
    }

    // Filter out low confidence
    finalResults = finalResults.filter((r) => r.confidence >= 0.5);

    const outputData = {
      suggestions: finalResults,
      banner_dismissed: false,
      processed_at: new Date().toISOString(),
    };

    // Persist to job_outputs via service role
    if (force) {
      // Delete existing and re-insert
      await supabase
        .from("job_outputs")
        .delete()
        .eq("job_id", job_id)
        .eq("output_type", "speaker_identifications");
    }

    await supabase
      .from("job_outputs")
      .insert({
        job_id,
        output_type: "speaker_identifications",
        content: "",
        metadata: outputData,
      });

    // Auto-apply high-confidence names to jobs.speaker_names
    const applied = finalResults.filter((r) => r.status === "applied");
    if (applied.length > 0) {
      const updatedNames = { ...speakerNames };
      for (const r of applied) {
        if (!updatedNames[r.speaker_label]) {
          updatedNames[r.speaker_label] = r.inferred_name;
        }
      }
      await supabase
        .from("jobs")
        .update({ speaker_names: updatedNames })
        .eq("id", job_id);
    }

    console.log(
      `[identify-speakers] job=${job_id} total=${finalResults.length} applied=${applied.length} suggested=${finalResults.length - applied.length}`
    );

    return new Response(
      JSON.stringify({ cached: false, data: outputData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("identify-speakers error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
