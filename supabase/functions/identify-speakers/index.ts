import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash"; // upgraded from flash-lite

// ---- Stopwords ----
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

// ---- Role/profession words — never valid as person names ----
const ROLE_WORDS = new Set([
  "terapista", "occupazionale", "dottore", "dottoressa", "dott",
  "infermiere", "infermiera", "assistente", "coordinatore", "coordinatrice",
  "responsabile", "direttore", "direttrice", "paziente", "collega",
  "fisioterapista", "logopedista", "psicologo", "psicologa",
  "educatore", "educatrice", "operatore", "operatrice", "medico",
  "primario", "chirurgo", "farmacista", "ostetrica", "ostetrico",
  "tecnico", "tecnica", "professore", "professoressa",
  "doctor", "nurse", "therapist", "manager", "director", "assistant",
  "coordinator", "patient", "colleague", "supervisor", "consultant",
  "specialist", "technician", "professor", "teacher", "counselor",
  "practitioner", "surgeon", "pharmacist", "midwife",
  "docteur", "infirmier", "infirmière", "thérapeute", "directeur",
  "directrice", "assistante", "coordinateur", "coordinatrice",
  "médecin", "chirurgien", "pharmacien", "pharmacienne", "professeur",
  "conseiller", "conseillère", "spécialiste", "technicien", "technicienne",
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
  compound: boolean; // true when extracted from a compound name+role pattern
}

type ValidationStatus = "clean" | "suspicious" | "rejected";

interface ValidationResult {
  status: ValidationStatus;
  reason?: string;
}

interface Identification {
  speaker_label: string;
  inferred_name: string;
  confidence: number;
  evidence: string[];
  role?: string;
  status: "applied" | "suggested";
  source: "deterministic" | "ai";
  _validation?: ValidationStatus; // internal, not persisted
  _needsAI?: boolean; // internal escalation flag
}

// ---- Helpers ----

function isValidName(token: string): boolean {
  if (token.length < 2) return false;
  if (STOPWORDS.has(token.toLowerCase())) return false;
  if (/^\d+$/.test(token)) return false;
  return true;
}

function isCapitalised(token: string): boolean {
  return /^[A-ZÀ-ÖØ-Þ]/.test(token);
}

function cleanName(raw: string): string {
  return raw.replace(/[,.:;!?'"]+$/, "").trim();
}

// ---- Semantic validation ----

function validateCandidate(candidate: Candidate): ValidationResult {
  const nameLower = candidate.name.toLowerCase();

  if (STOPWORDS.has(nameLower)) {
    return { status: "rejected", reason: "stopword" };
  }
  if (candidate.name.length < 2) {
    return { status: "rejected", reason: "too_short" };
  }
  if (ROLE_WORDS.has(nameLower)) {
    return { status: "suspicious", reason: "role_word" };
  }
  if (candidate.name.length > 15 || candidate.name.includes(" ")) {
    return { status: "suspicious", reason: "too_long_or_multiword" };
  }
  return { status: "clean" };
}

// ---- Compound extraction patterns (checked first, most specific) ----

function extractCompoundPatterns(text: string): Candidate | null {
  const t = text.trim();

  // Italian: "sono X, sono il/la [role]" — captures name + role
  let m = t.match(/\bsono\s+(\S+),?\s+sono\s+(?:il|la)\s+(.+)/i);
  if (m) {
    const n = cleanName(m[1]);
    const role = cleanName(m[2]);
    if (isValidName(n)) {
      return { name: n, evidence: [t], role, capitalised: isCapitalised(n), compound: true };
    }
  }

  // Italian: "io sono, sono X" — handles comma + repetition
  m = t.match(/\bio\s+sono[,\s]+sono\s+(\S+)/i);
  if (m) {
    const n = cleanName(m[1]);
    if (isValidName(n)) {
      return { name: n, evidence: [t], capitalised: isCapitalised(n), compound: false };
    }
  }

  // Italian: "sono il/la [role words] X" — role-first, name at end (capitalised or not)
  m = t.match(/\bsono\s+(?:il|la)\s+(.+?)\s+([A-ZÀ-Öa-zà-ö][a-zà-ö]+)\s*[,.]?\s*$/i);
  if (m) {
    const rolePart = cleanName(m[1]);
    const namePart = cleanName(m[2]);
    // Only accept if the last word looks like a name (not a role word)
    if (isValidName(namePart) && !ROLE_WORDS.has(namePart.toLowerCase())) {
      return { name: namePart, evidence: [t], role: rolePart, capitalised: isCapitalised(namePart), compound: true };
    }
  }

  // English: "I'm X, the [role]" or "I am X, the [role]"
  m = t.match(/\bI(?:'m|\s+am)\s+(\S+),?\s+the\s+(.+)/i);
  if (m) {
    const n = cleanName(m[1]);
    const role = cleanName(m[2]);
    if (isValidName(n)) {
      return { name: n, evidence: [t], role, capitalised: isCapitalised(n), compound: true };
    }
  }

  return null;
}

// ---- Simple self-identification patterns ----

function extractSelfIdentification(text: string): Candidate | null {
  const t = text.trim();

  // Try compound patterns first
  const compound = extractCompoundPatterns(t);
  if (compound) return compound;

  // Italian: "mi chiamo X"
  let m = t.match(/\bmi\s+chiamo\s+(\S+)/i);
  if (m) { const n = cleanName(m[1]); if (isValidName(n)) return { name: n, evidence: [t], capitalised: isCapitalised(n), compound: false }; }

  // Italian: "io sono X" (simple, no repetition)
  m = t.match(/\bio\s+sono\s+(\S+)/i);
  if (m) { const n = cleanName(m[1]); if (isValidName(n)) return { name: n, evidence: [t], capitalised: isCapitalised(n), compound: false }; }

  // Italian: "sono il/la [role] X" — old pattern, improved
  m = t.match(/\bsono\s+(?:il|la)\s+(dott(?:or(?:essa)?|\.?)\s+\S+|terapist[ao]\s+(?:occupazionale\s+)?\S+|infermier[aeo]\s+\S+)/i);
  if (m) {
    const parts = m[1].trim().split(/\s+/);
    const namePart = cleanName(parts[parts.length - 1]);
    const rolePart = parts.slice(0, -1).join(" ");
    if (isValidName(namePart) && !ROLE_WORDS.has(namePart.toLowerCase())) {
      return { name: namePart, evidence: [t], role: rolePart, capitalised: isCapitalised(namePart), compound: true };
    }
  }

  // English: "my name is X"
  m = t.match(/\bmy\s+name\s+is\s+(\S+)/i);
  if (m) { const n = cleanName(m[1]); if (isValidName(n)) return { name: n, evidence: [t], capitalised: isCapitalised(n), compound: false }; }

  // English: "I am X"
  m = t.match(/\bI\s+am\s+(\S+)/i);
  if (m) { const n = cleanName(m[1]); if (isValidName(n)) return { name: n, evidence: [t], capitalised: isCapitalised(n), compound: false }; }

  // English: "I'm X"
  m = t.match(/\bI[''\u2019]\s*m\s+(\S+)/i);
  if (m) { const n = cleanName(m[1]); if (isValidName(n)) return { name: n, evidence: [t], capitalised: isCapitalised(n), compound: false }; }

  // English: "this is X" (start of utterance)
  m = t.match(/^this\s+is\s+(\S+)/i);
  if (m) { const n = cleanName(m[1]); if (isValidName(n)) return { name: n, evidence: [t], capitalised: isCapitalised(n), compound: false }; }

  // English: "X speaking"
  m = t.match(/(\S+)\s+speaking\s*[.!]?\s*$/i);
  if (m) { const n = cleanName(m[1]); if (isValidName(n)) return { name: n, evidence: [t], capitalised: isCapitalised(n), compound: false }; }

  // French: "je m'appelle X"
  m = t.match(/\bje\s+m[''\u2019]appelle\s+(\S+)/i);
  if (m) { const n = cleanName(m[1]); if (isValidName(n)) return { name: n, evidence: [t], capitalised: isCapitalised(n), compound: false }; }

  // French: "je suis X"
  m = t.match(/\bje\s+suis\s+(\S+)/i);
  if (m) { const n = cleanName(m[1]); if (isValidName(n)) return { name: n, evidence: [t], capitalised: isCapitalised(n), compound: false }; }

  return null;
}

// ---- Deterministic extraction with semantic validation ----

function runDeterministicExtraction(
  lines: TranscriptLine[],
  existingSpeakerNames: Record<string, string>
): Identification[] {
  const speakerCandidates = new Map<string, Candidate[]>();

  for (const line of lines) {
    if (!line.speaker) continue;
    if (existingSpeakerNames[line.speaker]) continue;

    const candidate = extractSelfIdentification(line.text);
    if (!candidate) continue;

    const existing = speakerCandidates.get(line.speaker) ?? [];
    existing.push(candidate);
    speakerCandidates.set(line.speaker, existing);
  }

  // Cross-speaker name conflict detection
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

    const hasMultipleNames = nameGroups.size > 1;

    // Pick best candidate group
    const sorted = [...nameGroups.entries()].sort((a, b) => b[1].length - a[1].length);
    const [, topGroup] = sorted[0];
    const bestCandidate = topGroup.find((c) => c.capitalised) ?? topGroup[0];
    const displayName = bestCandidate.name.charAt(0).toUpperCase() + bestCandidate.name.slice(1);
    const allEvidence = [...new Set(
      (hasMultipleNames ? candidates : topGroup).flatMap((c) => c.evidence)
    )].slice(0, 3);
    const role = topGroup.find((c) => c.role)?.role ?? candidates.find((c) => c.role)?.role;

    // Semantic validation
    const validation = validateCandidate(bestCandidate);

    if (validation.status === "rejected") {
      continue; // Drop completely
    }

    // Cross-speaker conflict
    const conflictingSpeakers = nameToSpeakers.get(bestCandidate.name.toLowerCase()) ?? [];
    const hasCrossSpeakerConflict = conflictingSpeakers.length > 1;

    // Confidence scoring
    let confidence: number;
    if (bestCandidate.compound) {
      confidence = 0.92;
    } else if (bestCandidate.capitalised) {
      confidence = 0.90;
    } else {
      confidence = 0.80; // lowercased — valid but lower confidence
    }

    if (topGroup.length > 1) confidence = Math.min(confidence + 0.03, 0.95);
    if (hasCrossSpeakerConflict) confidence = Math.min(confidence, 0.50);
    if (hasMultipleNames) confidence = Math.min(confidence, 0.50);
    if (validation.status === "suspicious") confidence = Math.min(confidence, 0.60);

    // Determine escalation need
    let needsAI = false;
    if (validation.status === "suspicious") needsAI = true;
    if (hasMultipleNames) needsAI = true;
    if (hasCrossSpeakerConflict) needsAI = true;
    if (confidence < 0.80) needsAI = true;
    if (!bestCandidate.capitalised) needsAI = true; // lowercased → eligible for AI review

    // Auto-apply only when ALL conditions met
    const canAutoApply =
      validation.status === "clean" &&
      !hasMultipleNames &&
      !hasCrossSpeakerConflict &&
      bestCandidate.capitalised &&
      confidence >= 0.85 &&
      !ROLE_WORDS.has(bestCandidate.name.toLowerCase());

    results.push({
      speaker_label: speaker,
      inferred_name: displayName,
      confidence,
      evidence: allEvidence,
      role,
      status: canAutoApply ? "applied" : "suggested",
      source: "deterministic",
      _validation: validation.status,
      _needsAI: needsAI,
    });
  }

  return results;
}

// ---- AI disambiguation (selective escalation) ----

async function runAIReview(
  escalatedResults: Identification[],
  lines: TranscriptLine[],
  apiKey: string
): Promise<Identification[]> {
  if (escalatedResults.length === 0) return [];

  const speakerLabels = new Set(escalatedResults.map((r) => r.speaker_label));
  const relevantLines = lines
    .filter((l) => l.speaker && speakerLabels.has(l.speaker))
    .slice(0, 100)
    .map((l) => `${l.speaker}: ${l.text}`)
    .join("\n");

  const candidateDescription = escalatedResults
    .map((r) => `${r.speaker_label} → candidate: "${r.inferred_name}" (confidence: ${r.confidence}, role: "${r.role ?? "unknown"}", evidence: ${r.evidence.join(" | ")})`)
    .join("\n");

  const systemPrompt = `You are identifying speaker names from a transcript.

Given transcript segments and candidate extractions, determine the correct person name for each speaker label.

Rules:
- Extract the PERSON'S NAME (e.g. "Camilla"), never a profession/role word
- Put roles/titles in the "role" field (e.g. "terapista occupazionale")
- Handle messy speech: commas, repetitions, false starts, filler words
- Example: "sono Camilla, sono la terapista occupazionale" → name: "Camilla", role: "terapista occupazionale"
- "io sono, sono Marco" → name: "Marco"
- If no clear name is identifiable, set confidence below 0.5
- Capitalise person names properly even if the transcript has them lowercase
- Return a JSON array: [{"speaker_label": "...", "inferred_name": "...", "confidence": 0.0-1.0, "role": "..."}]`;

  const userPrompt = `Candidate extractions (may be incorrect):\n${candidateDescription}\n\nRelevant transcript segments:\n${relevantLines}`;

  try {
    const res = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      console.error("[identify-speakers] AI review failed:", res.status);
      return escalatedResults; // fallback to deterministic
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content ?? "";

    let parsed: unknown;
    try {
      const cleaned = rawContent.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[identify-speakers] Failed to parse AI response");
      return escalatedResults;
    }

    if (!Array.isArray(parsed)) return escalatedResults;

    const aiMap = new Map<string, { inferred_name: string; confidence: number; role?: string }>();
    for (const item of parsed) {
      if (item?.speaker_label && item?.inferred_name && typeof item?.confidence === "number") {
        // Validate AI output too — reject role words as names
        if (ROLE_WORDS.has(item.inferred_name.toLowerCase())) {
          console.warn(`[identify-speakers] AI returned role word as name: "${item.inferred_name}", skipping`);
          continue;
        }
        aiMap.set(item.speaker_label, {
          inferred_name: item.inferred_name,
          confidence: Math.min(item.confidence, 0.95),
          role: item.role,
        });
      }
    }

    return escalatedResults.map((r) => {
      const ai = aiMap.get(r.speaker_label);
      if (!ai) return r;
      return {
        ...r,
        inferred_name: ai.inferred_name,
        confidence: ai.confidence,
        role: ai.role ?? r.role,
        status: ai.confidence >= 0.85 ? "applied" as const : "suggested" as const,
        source: "ai" as const,
        _needsAI: false,
      };
    });
  } catch (e) {
    console.error("[identify-speakers] AI review error:", e);
    return escalatedResults;
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

    // Execution guard
    if (!force) {
      const { data: existing } = await supabase
        .from("job_outputs")
        .select("id, metadata")
        .eq("job_id", job_id)
        .eq("output_type", "speaker_identifications")
        .maybeSingle();

      if (existing) {
        console.log(`[identify-speakers] Cached results for job ${job_id}`);
        return new Response(
          JSON.stringify({ cached: true, data: existing.metadata }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const speakerNames: Record<string, string> = existing_speaker_names ?? {};
    const lines = transcript_lines as TranscriptLine[];

    // Step 1: Deterministic extraction + semantic validation
    const deterministicResults = runDeterministicExtraction(lines, speakerNames);
    console.log(`[identify-speakers] Deterministic: ${deterministicResults.length} candidates for job ${job_id}`);

    // Step 2: Selective AI escalation
    const needsAI = deterministicResults.filter((r) => r._needsAI);
    const clean = deterministicResults.filter((r) => !r._needsAI);

    let finalResults: Identification[];
    if (needsAI.length > 0 && LOVABLE_API_KEY) {
      console.log(`[identify-speakers] Escalating ${needsAI.length} candidates to AI for job ${job_id}`);
      const aiResults = await runAIReview(needsAI, lines, LOVABLE_API_KEY);
      finalResults = [...clean, ...aiResults];
    } else {
      finalResults = deterministicResults;
    }

    // Filter out low confidence
    finalResults = finalResults.filter((r) => r.confidence >= 0.5);

    // Strip internal fields before persisting
    const cleanResults = finalResults.map(({ _validation, _needsAI, ...rest }) => rest);

    const outputData = {
      suggestions: cleanResults,
      banner_dismissed: false,
      processed_at: new Date().toISOString(),
    };

    // Persist
    if (force) {
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

    // Auto-apply high-confidence names
    const applied = cleanResults.filter((r) => r.status === "applied");
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
      `[identify-speakers] job=${job_id} total=${cleanResults.length} applied=${applied.length} suggested=${cleanResults.length - applied.length} ai_reviewed=${needsAI.length}`
    );

    return new Response(
      JSON.stringify({ cached: false, data: outputData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[identify-speakers] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
