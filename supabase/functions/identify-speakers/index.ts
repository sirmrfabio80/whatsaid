import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";

// ---- Stopwords ----
const STOPWORDS = new Set([
  // Italian
  "qui", "bene", "pronto", "presente", "sicuro", "contento", "contenta",
  "felice", "stanco", "stanca", "certo", "certa", "solo", "sola",
  "ancora", "anche", "molto", "poco", "tutto", "niente", "sempre",
  "accordo", "vero", "vera", "bravo", "brava", "disponibile",
  // English
  "here", "fine", "ready", "good", "well", "sorry", "sure", "happy",
  "tired", "done", "busy", "back", "home", "glad", "okay", "great",
  "available", "alone", "late", "early", "right", "wrong", "certain",
  // French
  "bien", "ici", "content", "contente", "fatigué", "fatiguée",
  "occupé", "occupée", "seul", "seule", "encore", "aussi", "tout",
  "rien", "toujours", "disponible", "accord", "sûr", "sûre",
  "désolé", "désolée", "prêt", "prête",
  // Spanish
  "aquí", "listo", "lista", "contento", "contenta", "ocupado", "ocupada",
  "cansado", "cansada", "seguro", "segura",
  // German
  "hier", "gut", "bereit", "müde", "beschäftigt", "sicher", "fertig",
  // Portuguese
  "aqui", "pronto", "pronta", "cansado", "cansada", "ocupado", "ocupada",
]);

// ---- Role/profession words — never valid as person names ----
const ROLE_WORDS = new Set([
  // Italian
  "terapista", "occupazionale", "dottore", "dottoressa", "dott",
  "infermiere", "infermiera", "assistente", "coordinatore", "coordinatrice",
  "responsabile", "direttore", "direttrice", "paziente", "collega",
  "fisioterapista", "logopedista", "psicologo", "psicologa",
  "educatore", "educatrice", "operatore", "operatrice", "medico",
  "primario", "chirurgo", "farmacista", "ostetrica", "ostetrico",
  "tecnico", "tecnica", "professore", "professoressa",
  // English
  "doctor", "nurse", "therapist", "manager", "director", "assistant",
  "coordinator", "patient", "colleague", "supervisor", "consultant",
  "specialist", "technician", "professor", "teacher", "counselor",
  "practitioner", "surgeon", "pharmacist", "midwife",
  // French
  "docteur", "infirmier", "infirmière", "thérapeute", "directeur",
  "directrice", "assistante", "coordinateur", "coordinatrice",
  "médecin", "chirurgien", "pharmacien", "pharmacienne", "professeur",
  "conseiller", "conseillère", "spécialiste", "technicien", "technicienne",
  // Spanish
  "enfermero", "enfermera", "terapeuta", "coordinador", "coordinadora",
  "directora", "asistente", "especialista", "cirujano", "cirujana",
  // German
  "arzt", "ärztin", "krankenschwester", "therapeut", "therapeutin",
  "direktor", "direktorin", "assistentin", "assistent", "krankenpfleger",
  // Portuguese
  "doutor", "doutora", "enfermeiro", "enfermeira", "terapeuta",
  "diretor", "diretora", "assistente",
]);

interface TranscriptLine {
  speaker: string | null;
  text: string;
}

type PatternStrength = "compound" | "strong" | "medium" | "broad";

interface Candidate {
  name: string;
  evidence: string[];
  role?: string;
  capitalised: boolean;
  compound: boolean;
  patternStrength: PatternStrength;
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
  _validation?: ValidationStatus;
  _needsAI?: boolean;
}

// ---- Helpers ----

function isValidName(token: string): boolean {
  if (token.length < 2) return false;
  if (STOPWORDS.has(token.toLowerCase())) return false;
  if (ROLE_WORDS.has(token.toLowerCase())) return false;
  if (/^\d+$/.test(token)) return false;
  return true;
}

function isCapitalised(token: string): boolean {
  // Latin + Cyrillic uppercase detection
  return /^[A-ZÀ-ÖØ-ÞĀ-ŽА-ЯЁ]/.test(token);
}

function cleanName(raw: string): string {
  return raw.replace(/[,.:;!?'"]+$/, "").trim();
}

function mk(name: string, text: string, strength: PatternStrength, role?: string): Candidate | null {
  const n = cleanName(name);
  if (!isValidName(n)) return null;
  return {
    name: n,
    evidence: [text],
    role: role ? cleanName(role) : undefined,
    capitalised: isCapitalised(n),
    compound: strength === "compound",
    patternStrength: strength,
  };
}

// ---- Semantic validation ----

function validateCandidate(candidate: Candidate): ValidationResult {
  const nameLower = candidate.name.toLowerCase();
  if (STOPWORDS.has(nameLower)) return { status: "rejected", reason: "stopword" };
  if (candidate.name.length < 2) return { status: "rejected", reason: "too_short" };
  if (ROLE_WORDS.has(nameLower)) return { status: "suspicious", reason: "role_word" };
  if (candidate.name.length > 15 || candidate.name.includes(" ")) return { status: "suspicious", reason: "too_long_or_multiword" };
  return { status: "clean" };
}

// ---- Compound extraction patterns (checked first, most specific) ----

function extractCompoundPatterns(t: string): Candidate | null {
  let m: RegExpMatchArray | null;

  // Italian: "sono X, sono il/la [role]"
  m = t.match(/\bsono\s+(\S+),?\s+sono\s+(?:il|la)\s+(.+)/i);
  if (m) { const c = mk(m[1], t, "compound", m[2]); if (c) return c; }

  // Italian: "io sono, sono X" — comma + repetition
  m = t.match(/\bio\s+sono[,\s]+sono\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "compound"); if (c) return c; }

  // Italian: "sono il/la [role words] X" — role-first, name at end
  m = t.match(/\bsono\s+(?:il|la)\s+(.+?)\s+([A-ZÀ-Öa-zà-ö][a-zà-ö]+)\s*[,.]?\s*$/i);
  if (m) {
    const rolePart = cleanName(m[1]);
    const namePart = cleanName(m[2]);
    if (isValidName(namePart)) return { name: namePart, evidence: [t], role: rolePart, capitalised: isCapitalised(namePart), compound: true, patternStrength: "compound" };
  }

  // Italian: "sono l'[role] X" — elided article
  m = t.match(/\bsono\s+l[''\u2019](\S+)\s+(\S+)/i);
  if (m) {
    const possibleRole = cleanName(m[1]);
    const possibleName = cleanName(m[2]);
    if (ROLE_WORDS.has(possibleRole.toLowerCase()) && isValidName(possibleName)) {
      return { name: possibleName, evidence: [t], role: possibleRole, capitalised: isCapitalised(possibleName), compound: true, patternStrength: "compound" };
    }
  }

  // Italian: "sono X della/del ..." — name + org context
  m = t.match(/\bsono\s+(\S+)\s+del(?:la|l[''\u2019])?\s+/i);
  if (m) { const c = mk(m[1], t, "compound"); if (c) return c; }

  // Italian: "sono il/la [known role pattern] X"
  m = t.match(/\bsono\s+(?:il|la)\s+(dott(?:or(?:essa)?|\.?)\s+\S+|terapist[ao]\s+(?:occupazionale\s+)?\S+|infermier[aeo]\s+\S+)/i);
  if (m) {
    const parts = m[1].trim().split(/\s+/);
    const namePart = cleanName(parts[parts.length - 1]);
    const rolePart = parts.slice(0, -1).join(" ");
    if (isValidName(namePart)) return { name: namePart, evidence: [t], role: rolePart, capitalised: isCapitalised(namePart), compound: true, patternStrength: "compound" };
  }

  // English: "I'm X, the [role]" or "I am X, the [role]"
  m = t.match(/\bI(?:[''\u2019]\s*m|\s+am)\s+(\S+),?\s+the\s+(.+)/i);
  if (m) { const c = mk(m[1], t, "compound", m[2]); if (c) return c; }

  // English: "this is Dr/Doctor X"
  m = t.match(/\bthis\s+is\s+(?:Dr\.?|Doctor)\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "compound", "Dr"); if (c) return c; }

  // English: "I'm Dr/Doctor X"
  m = t.match(/\bI(?:[''\u2019]\s*m|\s+am)\s+(?:Dr\.?|Doctor)\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "compound", "Dr"); if (c) return c; }

  // English: "I'm nurse/therapist X" — role-word + name
  m = t.match(/\bI(?:[''\u2019]\s*m|\s+am)\s+(\S+)\s+(\S+)/i);
  if (m) {
    const first = cleanName(m[1]);
    const second = cleanName(m[2]);
    if (ROLE_WORDS.has(first.toLowerCase()) && isValidName(second)) {
      return { name: second, evidence: [t], role: first, capitalised: isCapitalised(second), compound: true, patternStrength: "compound" };
    }
  }

  // French: "je suis le/la [role] X"
  m = t.match(/\bje\s+suis\s+(?:le|la)\s+(.+?)\s+([A-ZÀ-Öa-zà-ö]\S+)\s*$/i);
  if (m) {
    const rolePart = cleanName(m[1]);
    const namePart = cleanName(m[2]);
    if (isValidName(namePart)) return { name: namePart, evidence: [t], role: rolePart, capitalised: isCapitalised(namePart), compound: true, patternStrength: "compound" };
  }

  // French: "je suis X, le/la [role]"
  m = t.match(/\bje\s+suis\s+(\S+)[,\s]+(?:le|la)\s+(.+)/i);
  if (m) { const c = mk(m[1], t, "compound", m[2]); if (c) return c; }

  // Spanish: "soy el/la [role] X"
  m = t.match(/\bsoy\s+(?:el|la)\s+(.+?)\s+([A-ZÀ-Öa-zà-ö]\S+)\s*$/i);
  if (m) {
    const rolePart = cleanName(m[1]);
    const namePart = cleanName(m[2]);
    if (isValidName(namePart)) return { name: namePart, evidence: [t], role: rolePart, capitalised: isCapitalised(namePart), compound: true, patternStrength: "compound" };
  }

  return null;
}

// ---- Self-identification patterns by language ----

function extractSelfIdentification(text: string): Candidate | null {
  const t = text.trim();

  // Try compound patterns first (most specific)
  const compound = extractCompoundPatterns(t);
  if (compound) return compound;

  let m: RegExpMatchArray | null;

  // ===== STRONG patterns (0.90) =====

  // Italian: "mi chiamo X"
  m = t.match(/\bmi\s+chiamo\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "strong"); if (c) return c; }

  // English: "my name is X"
  m = t.match(/\bmy\s+name\s+is\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "strong"); if (c) return c; }

  // French: "je m'appelle X"
  m = t.match(/\bje\s+m[''\u2019]appelle\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "strong"); if (c) return c; }

  // Spanish: "me llamo X"
  m = t.match(/\bme\s+llamo\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "strong"); if (c) return c; }

  // Spanish: "mi nombre es X"
  m = t.match(/\bmi\s+nombre\s+es\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "strong"); if (c) return c; }

  // German: "mein Name ist X"
  m = t.match(/\bmein\s+Name\s+ist\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "strong"); if (c) return c; }

  // Portuguese: "me chamo X"
  m = t.match(/\bme\s+chamo\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "strong"); if (c) return c; }

  // Portuguese: "meu nome é X"
  m = t.match(/\bmeu\s+nome\s+é\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "strong"); if (c) return c; }

  // Dutch: "mijn naam is X"
  m = t.match(/\bmijn\s+naam\s+is\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "strong"); if (c) return c; }

  // Turkish: "adım X"
  m = t.match(/\badım\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "strong"); if (c) return c; }

  // Polish: "mam na imię X"
  m = t.match(/\bmam\s+na\s+imię\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "strong"); if (c) return c; }

  // Romanian: "mă numesc X"
  m = t.match(/\bmă\s+numesc\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "strong"); if (c) return c; }

  // Czech: "jmenuji se X"
  m = t.match(/\bjmenuji\s+se\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "strong"); if (c) return c; }

  // ===== MEDIUM patterns (0.85) =====

  // Italian: "mi presento, sono X"
  m = t.match(/\bmi\s+presento[,\s]+sono\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // Italian: "piacere, X"
  m = t.match(/\bpiacere[,\s]+(\S+)/i);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // Italian: "qui è X"
  m = t.match(/\bqui\s+è\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // Italian: "parlo io, X"
  m = t.match(/\bparlo\s+io[,\s]+(\S+)/i);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // English: "hello/hi, this is X"
  m = t.match(/\b(?:hello|hi)[,\s]+this\s+is\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // English: "X speaking"
  m = t.match(/^(\S+)\s+speaking\s*[.!]?\s*$/i);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // English: "speaking, X"
  m = t.match(/\bspeaking[,\s]+(\S+)/i);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // French: "bonjour, je suis X"
  m = t.match(/\bbonjour[,\s]+je\s+suis\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // French: "moi c'est X"
  m = t.match(/\bmoi\s+c[''\u2019]est\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // French: "X à l'appareil"
  m = t.match(/^(\S+)\s+à\s+l[''\u2019]appareil/i);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // Spanish: "hola, soy X"
  m = t.match(/\bhola[,\s]+soy\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // German: "hier ist X"
  m = t.match(/\bhier\s+ist\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // German: "hier spricht X"
  m = t.match(/\bhier\s+spricht\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // ===== BROAD patterns (0.70 → always suggested) =====

  // Italian: "io sono X"
  m = t.match(/\bio\s+sono\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "broad"); if (c) return c; }

  // English: "I am X"
  m = t.match(/\bI\s+am\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "broad"); if (c) return c; }

  // English: "I'm X"
  m = t.match(/\bI[''\u2019]\s*m\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "broad"); if (c) return c; }

  // English: "this is X" (start of utterance)
  m = t.match(/^this\s+is\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "broad"); if (c) return c; }

  // French: "je suis X"
  m = t.match(/\bje\s+suis\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "broad"); if (c) return c; }

  // Spanish: "soy X"
  m = t.match(/\bsoy\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "broad"); if (c) return c; }

  // German: "ich bin X"
  m = t.match(/\bich\s+bin\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "broad"); if (c) return c; }

  // Portuguese: "eu sou X" / "sou o/a X"
  m = t.match(/\b(?:eu\s+)?sou\s+(?:o\s+|a\s+)?(\S+)/i);
  if (m) { const c = mk(m[1], t, "broad"); if (c) return c; }

  // Dutch: "ik ben X"
  m = t.match(/\bik\s+ben\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "broad"); if (c) return c; }

  // Turkish: "ben X"
  m = t.match(/\bben\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "broad"); if (c) return c; }

  // Polish: "jestem X"
  m = t.match(/\bjestem\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "broad"); if (c) return c; }

  // Romanian: "sunt X"
  m = t.match(/\bsunt\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "broad"); if (c) return c; }

  // Czech: "jsem X"
  m = t.match(/\bjsem\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "broad"); if (c) return c; }

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
    const nameGroups = new Map<string, Candidate[]>();
    for (const c of candidates) {
      const key = c.name.toLowerCase();
      const group = nameGroups.get(key) ?? [];
      group.push(c);
      nameGroups.set(key, group);
    }

    const hasMultipleNames = nameGroups.size > 1;

    const sorted = [...nameGroups.entries()].sort((a, b) => b[1].length - a[1].length);
    const [, topGroup] = sorted[0];
    const bestCandidate = topGroup.find((c) => c.capitalised) ?? topGroup[0];
    const displayName = bestCandidate.name.charAt(0).toUpperCase() + bestCandidate.name.slice(1);
    const allEvidence = [...new Set(
      (hasMultipleNames ? candidates : topGroup).flatMap((c) => c.evidence)
    )].slice(0, 3);
    const role = topGroup.find((c) => c.role)?.role ?? candidates.find((c) => c.role)?.role;

    const validation = validateCandidate(bestCandidate);
    if (validation.status === "rejected") continue;

    const conflictingSpeakers = nameToSpeakers.get(bestCandidate.name.toLowerCase()) ?? [];
    const hasCrossSpeakerConflict = conflictingSpeakers.length > 1;

    // Confidence based on pattern strength
    let confidence: number;
    const strength = bestCandidate.patternStrength;
    switch (strength) {
      case "compound": confidence = 0.92; break;
      case "strong": confidence = 0.90; break;
      case "medium": confidence = 0.85; break;
      case "broad": confidence = 0.70; break;
    }

    // Lowercase penalty for non-broad
    if (!bestCandidate.capitalised && strength !== "broad") {
      confidence = Math.max(confidence - 0.10, 0.70);
    }

    if (topGroup.length > 1) confidence = Math.min(confidence + 0.03, 0.95);
    if (hasCrossSpeakerConflict) confidence = Math.min(confidence, 0.50);
    if (hasMultipleNames) confidence = Math.min(confidence, 0.50);
    if (validation.status === "suspicious") confidence = Math.min(confidence, 0.60);

    // Escalation flags
    let needsAI = false;
    if (validation.status === "suspicious") needsAI = true;
    if (hasMultipleNames) needsAI = true;
    if (hasCrossSpeakerConflict) needsAI = true;
    if (confidence < 0.80) needsAI = true;
    if (!bestCandidate.capitalised) needsAI = true;

    // Auto-apply: broad patterns can NEVER auto-apply
    const canAutoApply =
      strength !== "broad" &&
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
      return escalatedResults;
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

    finalResults = finalResults.filter((r) => r.confidence >= 0.5);

    const cleanResults = finalResults.map(({ _validation, _needsAI, ...rest }) => rest);

    const outputData = {
      suggestions: cleanResults,
      banner_dismissed: false,
      processed_at: new Date().toISOString(),
    };

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

// Export for testing
export { extractSelfIdentification, extractCompoundPatterns, validateCandidate, isValidName, isCapitalised, cleanName, STOPWORDS, ROLE_WORDS };
export type { Candidate, ValidationResult, PatternStrength };
