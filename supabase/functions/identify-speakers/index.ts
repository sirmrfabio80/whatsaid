import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";

// ---- Expanded stopwords: common words that are never person names ----
const STOPWORDS = new Set([
  // Italian — adjectives, adverbs, pronouns, conjunctions, prepositions, past participles, common words
  "qui", "bene", "pronto", "presente", "sicuro", "contento", "contenta",
  "felice", "stanco", "stanca", "certo", "certa", "solo", "sola",
  "ancora", "anche", "molto", "poco", "tutto", "niente", "sempre",
  "accordo", "vero", "vera", "bravo", "brava", "disponibile",
  "che", "chi", "cosa", "come", "dove", "quando", "quanto", "quale",
  "perché", "quello", "quella", "quelli", "quelle", "questo", "questa",
  "questi", "queste", "ogni", "alcuni", "alcune", "qualche", "nessuno",
  "nessuna", "troppo", "troppa", "troppi", "troppe", "altro", "altra",
  "altri", "altre", "stesso", "stessa", "stessi", "stesse",
  "adesso", "allora", "comunque", "quindi", "perciò", "però", "oppure",
  "sia", "tra", "fra", "con", "per", "senza", "dopo", "prima", "durante",
  "dentro", "fuori", "sopra", "sotto", "verso", "circa", "oltre",
  "già", "mai", "ora", "poi", "così", "proprio", "davvero", "quasi",
  "subito", "insieme", "magari", "almeno", "appena", "appunto",
  "tutti", "tutte", "nulla", "tanto", "tanta", "tanti", "tante",
  "io", "tu", "lui", "lei", "noi", "voi", "loro", "mio", "mia",
  "tuo", "tua", "suo", "sua", "nostro", "nostra", "vostro", "vostra",
  // Italian past participles and common verb forms
  "stato", "stata", "stati", "state", "fatto", "fatta", "detto", "detta",
  "visto", "vista", "preso", "presa", "messo", "messa", "dato", "data",
  "andato", "andata", "venuto", "venuta", "tornato", "tornata",
  "arrivato", "arrivata", "rimasto", "rimasta", "uscito", "uscita",
  "entrato", "entrata", "iniziato", "iniziata", "finito", "finita",
  "capito", "capita", "sentito", "sentita", "parlato", "parlata",
  "pensato", "pensata", "chiamato", "chiamata", "trovato", "trovata",
  "lavorato", "lavorata", "cambiato", "cambiata", "provato", "provata",
  "passato", "passata", "preparato", "preparata",
  "strutturato", "strutturata", "strutturati", "strutturate",
  "organizzato", "organizzata", "organizzati", "organizzate",
  "interessato", "interessata", "interessati", "interessate",
  "preoccupato", "preoccupata", "preoccupati", "preoccupate",
  // Italian common adjectives
  "buono", "buona", "cattivo", "cattiva", "grande", "piccolo", "piccola",
  "nuovo", "nuova", "vecchio", "vecchia", "lungo", "lunga", "corto", "corta",
  "alto", "alta", "basso", "bassa", "forte", "debole", "pieno", "piena",
  "vuoto", "vuota", "chiaro", "chiara", "scuro", "scura",
  "difficile", "facile", "possibile", "impossibile", "necessario", "necessaria",
  "importante", "normale", "diverso", "diversa", "uguale", "simile",
  // Italian articles/prepositions
  "il", "lo", "la", "le", "gli", "un", "uno", "una", "del", "dello",
  "della", "dei", "degli", "delle", "nel", "nello", "nella", "nei",
  "negli", "nelle", "sul", "sullo", "sulla", "sui", "sugli", "sulle",
  "al", "allo", "alla", "ai", "agli", "alle", "dal", "dallo", "dalla",
  "dai", "dagli", "dalle",
  // Italian common verbs (infinitive/conjugated)
  "essere", "avere", "fare", "dire", "andare", "venire", "potere",
  "volere", "dovere", "sapere", "vedere", "dare", "stare", "prendere",
  "mettere", "trovare", "parlare", "sentire", "pensare", "chiamare",
  "lavorare", "giocare", "mangiare", "bere", "dormire", "leggere",
  "scrivere", "capire", "credere", "vivere", "morire", "nascere",
  // English
  "here", "fine", "ready", "good", "well", "sorry", "sure", "happy",
  "tired", "done", "busy", "back", "home", "glad", "okay", "great",
  "available", "alone", "late", "early", "right", "wrong", "certain",
  "the", "this", "that", "these", "those", "what", "which", "who",
  "where", "when", "how", "why", "some", "any", "all", "each", "every",
  "both", "few", "many", "much", "more", "most", "other", "another",
  "such", "like", "just", "still", "also", "very", "really", "quite",
  "about", "above", "after", "again", "against", "before", "between",
  "through", "during", "from", "into", "over", "under", "with", "without",
  "yes", "yeah", "yep", "no", "not", "never", "already", "always",
  "actually", "basically", "currently", "exactly", "finally", "honestly",
  "absolutely", "definitely", "probably", "certainly", "obviously",
  "concerned", "interested", "excited", "worried", "confused", "surprised",
  "pleased", "disappointed", "frustrated", "overwhelmed",
  // French
  "bien", "ici", "content", "contente", "fatigué", "fatiguée",
  "occupé", "occupée", "seul", "seule", "encore", "aussi", "tout",
  "rien", "toujours", "disponible", "accord", "sûr", "sûre",
  "désolé", "désolée", "prêt", "prête",
  "le", "la", "les", "un", "une", "des", "du", "de", "ce", "cette",
  "ces", "mon", "ma", "mes", "ton", "ta", "tes", "son", "ses",
  "notre", "nos", "votre", "vos", "leur", "leurs",
  "mais", "ou", "et", "donc", "car", "ni", "que", "qui", "quoi",
  "où", "quand", "comment", "pourquoi", "combien",
  "très", "trop", "assez", "peu", "beaucoup", "maintenant", "après",
  "avant", "pendant", "depuis", "jamais", "souvent", "parfois",
  // Spanish
  "aquí", "listo", "lista", "contento", "contenta", "ocupado", "ocupada",
  "cansado", "cansada", "seguro", "segura",
  "el", "los", "las", "un", "una", "unos", "unas", "del",
  "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas",
  "aquel", "aquella", "aquellos", "aquellas",
  "pero", "sino", "porque", "como", "donde", "cuando", "mientras",
  "también", "ahora", "después", "antes", "siempre", "nunca",
  // German
  "hier", "gut", "bereit", "müde", "beschäftigt", "sicher", "fertig",
  "der", "die", "das", "ein", "eine", "dieser", "diese", "dieses",
  "jeder", "jede", "jedes", "kein", "keine", "mein", "meine",
  "aber", "oder", "und", "denn", "weil", "wenn", "dass", "als",
  "auch", "noch", "schon", "jetzt", "immer", "nie", "sehr", "ganz",
  // Portuguese
  "aqui", "pronto", "pronta", "cansado", "cansada", "ocupado", "ocupada",
  "sim", "não", "talvez", "agora", "depois", "antes", "sempre", "nunca",
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
  "avvocato", "avvocatessa", "ingegnere", "architetto", "commercialista",
  "consulente", "analista", "ricercatore", "ricercatrice",
  // English
  "doctor", "nurse", "therapist", "manager", "director", "assistant",
  "coordinator", "patient", "colleague", "supervisor", "consultant",
  "specialist", "technician", "professor", "teacher", "counselor",
  "practitioner", "surgeon", "pharmacist", "midwife",
  "engineer", "analyst", "researcher", "developer", "designer",
  "accountant", "lawyer", "architect",
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

// ---- Morphological non-name patterns ----
// Reject words that match common Italian/Spanish/French morphological patterns
const NON_NAME_PATTERNS = [
  // Italian past participles (-ato/-uto/-ito and feminine/plural)
  /^.{3,}(ato|ata|ati|ate|uto|uta|uti|ute|ito|ita|iti|ite)$/i,
  // Italian common adjective suffixes
  /^.{3,}(ale|ile|oso|osa|osi|ose|ivo|iva|ivi|ive|abile|ibile)$/i,
  // Italian adverb suffix
  /^.{4,}mente$/i,
  // Italian gerund
  /^.{3,}(ando|endo)$/i,
  // Italian infinitives
  /^.{3,}(are|ere|ire)$/i,
];

function matchesNonNamePattern(word: string): boolean {
  return NON_NAME_PATTERNS.some((p) => p.test(word));
}

interface TranscriptLine {
  speaker: string | null;
  text: string;
}

type PatternStrength = "compound" | "strong" | "medium" | "name-only" | "role-only";

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
  status: "suggested";
  source: "deterministic" | "ai";
  _validation?: ValidationStatus;
  _needsAI?: boolean;
}

// ---- Helpers ----

// Articles / fillers across supported languages — never a person name
const ARTICLES = new Set([
  // IT
  "il", "lo", "la", "le", "gli", "un", "uno", "una", "in", "a", "l",
  // EN
  "the", "an", "a",
  // ES
  "el", "los", "las", "unos", "unas",
  // FR
  "les", "des", "du", "de", "le", "une",
  // DE
  "der", "die", "das", "ein", "eine",
  // PT
  "o", "os", "as", "um", "uma",
  // NL
  "een", "het",
]);

function isArticle(token: string): boolean {
  return ARTICLES.has(token.toLowerCase());
}

function isValidName(token: string): boolean {
  if (token.length < 3) return false;
  if (STOPWORDS.has(token.toLowerCase())) return false;
  if (ROLE_WORDS.has(token.toLowerCase())) return false;
  if (isArticle(token)) return false;
  if (/^\d+$/.test(token)) return false;
  if (matchesNonNamePattern(token)) return false;
  return true;
}

function capitalise(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function isCapitalised(token: string): boolean {
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
  if (candidate.name.length < 3) return { status: "rejected", reason: "too_short" };
  if (matchesNonNamePattern(candidate.name)) return { status: "rejected", reason: "morphological_non_name" };
  if (ROLE_WORDS.has(nameLower)) return { status: "suspicious", reason: "role_word" };
  if (candidate.name.length > 15 || candidate.name.includes(" ")) return { status: "suspicious", reason: "too_long_or_multiword" };
  if (!candidate.capitalised) return { status: "suspicious", reason: "not_capitalised" };
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

  // Italian: "sono X[,] [il/la/l'/un/una/lo/gli] [role]" — comma + article optional, case-insensitive
  m = t.match(/\bsono\s+([a-zà-öA-ZÀ-Ö][a-zà-öA-ZÀ-Ö]+)(?:\s*,)?\s*(?:il|la|l['\u2019]|un|una|lo|gli)?\s+([a-zà-öA-ZÀ-Ö]{4,})/i);
  if (m) {
    const namePart = cleanName(m[1]);
    const rolePart = cleanName(m[2]);
    if (isValidName(namePart) && ROLE_WORDS.has(rolePart.toLowerCase())) {
      return { name: namePart, evidence: [t], role: rolePart.toLowerCase(), capitalised: isCapitalised(namePart), compound: true, patternStrength: "compound" };
    }
  }

  // Italian: "sono l'[role] X" — elided article
  m = t.match(/\bsono\s+l['''\u2019](\S+)\s+(\S+)/i);
  if (m) {
    const possibleRole = cleanName(m[1]);
    const possibleName = cleanName(m[2]);
    if (ROLE_WORDS.has(possibleRole.toLowerCase()) && isValidName(possibleName)) {
      return { name: possibleName, evidence: [t], role: possibleRole, capitalised: isCapitalised(possibleName), compound: true, patternStrength: "compound" };
    }
  }

  // Italian: "sono X della/del ..." — name + org context
  m = t.match(/\bsono\s+(\S+)\s+del(?:la|l['''\u2019])?\s+/i);
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
  m = t.match(/\bI(?:['''\u2019]\s*m|\s+am)\s+(\S+),?\s+the\s+(.+)/i);
  if (m) { const c = mk(m[1], t, "compound", m[2]); if (c) return c; }

  // English: "this is Dr/Doctor X"
  m = t.match(/\bthis\s+is\s+(?:Dr\.?|Doctor)\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "compound", "Dr"); if (c) return c; }

  // English: "I'm Dr/Doctor X"
  m = t.match(/\bI(?:['''\u2019]\s*m|\s+am)\s+(?:Dr\.?|Doctor)\s+(\S+)/i);
  if (m) { const c = mk(m[1], t, "compound", "Dr"); if (c) return c; }

  // English: "I'm [role] X"
  m = t.match(/\bI(?:['''\u2019]\s*m|\s+am)\s+(\S+)\s+(\S+)/i);
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

  // French: "je suis X[,] [le/la/l'/un/une] [role]" — comma + article optional, case-insensitive
  m = t.match(/\bje\s+suis\s+([a-zà-öA-ZÀ-Ö][a-zà-öA-ZÀ-Ö]+)(?:\s*,)?\s*(?:le|la|l['\u2019]|un|une)?\s+([a-zà-öA-ZÀ-Ö]{4,})/i);
  if (m) {
    const namePart = cleanName(m[1]);
    const rolePart = cleanName(m[2]);
    if (isValidName(namePart) && ROLE_WORDS.has(rolePart.toLowerCase())) {
      return { name: namePart, evidence: [t], role: rolePart.toLowerCase(), capitalised: isCapitalised(namePart), compound: true, patternStrength: "compound" };
    }
  }

  // Spanish: "soy el/la [role] X"
  m = t.match(/\bsoy\s+(?:el|la)\s+(.+?)\s+([A-ZÀ-Öa-zà-ö]\S+)\s*$/i);
  if (m) {
    const rolePart = cleanName(m[1]);
    const namePart = cleanName(m[2]);
    if (isValidName(namePart)) return { name: namePart, evidence: [t], role: rolePart, capitalised: isCapitalised(namePart), compound: true, patternStrength: "compound" };
  }

  // Spanish: "soy X[,] [el/la/un/una] [role]" — comma + article optional, case-insensitive
  m = t.match(/\bsoy\s+([a-zà-öA-ZÀ-Ö][a-zà-öA-ZÀ-Ö]+)(?:\s*,)?\s*(?:el|la|un|una)?\s+([a-zà-öA-ZÀ-Ö]{4,})/i);
  if (m) {
    const namePart = cleanName(m[1]);
    const rolePart = cleanName(m[2]);
    if (isValidName(namePart) && ROLE_WORDS.has(rolePart.toLowerCase())) {
      return { name: namePart, evidence: [t], role: rolePart.toLowerCase(), capitalised: isCapitalised(namePart), compound: true, patternStrength: "compound" };
    }
  }

  // German: "ich bin X[,] [der/die/das/ein/eine] [role]"
  m = t.match(/\bich\s+bin\s+([a-zà-öA-ZÀ-Ö][a-zà-öA-ZÀ-Ö]+)(?:\s*,)?\s*(?:der|die|das|ein|eine)?\s+([a-zà-öA-ZÀ-Ö]{4,})/i);
  if (m) {
    const namePart = cleanName(m[1]);
    const rolePart = cleanName(m[2]);
    if (isValidName(namePart) && ROLE_WORDS.has(rolePart.toLowerCase())) {
      return { name: namePart, evidence: [t], role: rolePart.toLowerCase(), capitalised: isCapitalised(namePart), compound: true, patternStrength: "compound" };
    }
  }

  // Portuguese: "(eu) sou X[,] [o/a/um/uma] [role]"
  m = t.match(/\b(?:eu\s+)?sou\s+([a-zà-öA-ZÀ-Ö][a-zà-öA-ZÀ-Ö]+)(?:\s*,)?\s*(?:o|a|um|uma)?\s+([a-zà-öA-ZÀ-Ö]{4,})/i);
  if (m) {
    const namePart = cleanName(m[1]);
    const rolePart = cleanName(m[2]);
    if (isValidName(namePart) && ROLE_WORDS.has(rolePart.toLowerCase())) {
      return { name: namePart, evidence: [t], role: rolePart.toLowerCase(), capitalised: isCapitalised(namePart), compound: true, patternStrength: "compound" };
    }
  }

  // Dutch: "ik ben X[,] [de/het/een] [role]"
  m = t.match(/\bik\s+ben\s+([a-zà-öA-ZÀ-Ö][a-zà-öA-ZÀ-Ö]+)(?:\s*,)?\s*(?:de|het|een)?\s+([a-zà-öA-ZÀ-Ö]{4,})/i);
  if (m) {
    const namePart = cleanName(m[1]);
    const rolePart = cleanName(m[2]);
    if (isValidName(namePart) && ROLE_WORDS.has(rolePart.toLowerCase())) {
      return { name: namePart, evidence: [t], role: rolePart.toLowerCase(), capitalised: isCapitalised(namePart), compound: true, patternStrength: "compound" };
    }
  }

  return null;
}

// ---- Name-only self-id (rule B) — case-insensitive, no punctuation gate ----
// Returns name candidate; rejects stopwords, articles, role words, morphological non-names.
function extractNameOnlySelfId(t: string): Candidate | null {
  const PATTERNS: RegExp[] = [
    /\bsono\s+([a-zà-öA-ZÀ-Ö][a-zà-öA-ZÀ-Ö]{1,})\b/i,                // IT
    /\bI(?:['\u2019]m|\s+am)\s+([a-zA-Zà-öÀ-Ö][a-zA-Zà-öÀ-Ö]{1,})\b/i, // EN
    /\bsoy\s+([a-zà-öA-ZÀ-Ö][a-zà-öA-ZÀ-Ö]{1,})\b/i,                  // ES
    /\bje\s+suis\s+([a-zà-öA-ZÀ-Ö][a-zà-öA-ZÀ-Ö]{1,})\b/i,            // FR
    /\bich\s+bin\s+([a-zà-öA-ZÀ-Ö][a-zà-öA-ZÀ-Ö]{1,})\b/i,            // DE
    /\b(?:eu\s+)?sou\s+([a-zà-öA-ZÀ-Ö][a-zà-öA-ZÀ-Ö]{1,})\b/i,        // PT
    /\bik\s+ben\s+([a-zà-öA-ZÀ-Ö][a-zà-öA-ZÀ-Ö]{1,})\b/i,             // NL
  ];
  for (const re of PATTERNS) {
    const m = t.match(re);
    if (!m) continue;
    const raw = cleanName(m[1]);
    const low = raw.toLowerCase();
    // Reject articles, role words, stopwords, morphological non-names
    if (isArticle(raw)) continue;
    if (ROLE_WORDS.has(low)) continue; // → handled by rule C
    if (STOPWORDS.has(low)) continue;
    if (matchesNonNamePattern(raw)) continue;
    if (raw.length < 3) continue;
    return {
      name: raw,
      evidence: [t],
      capitalised: isCapitalised(raw),
      compound: false,
      patternStrength: "strong", // 0.90 base; lowercase penalty applies if needed
    };
  }
  return null;
}

// ---- Role-only self-id (rule C) — "sono un fisiatra", "sono il fisioterapista" ----
// Suggests the role itself as the speaker label when no name is given.
function extractRoleOnlySelfId(t: string): Candidate | null {
  const PATTERNS: RegExp[] = [
    // IT — "sono [il/la/l'/un/una/lo/gli/in/a]? [role]"
    /\bsono\s+(?:il|la|l['\u2019]|un|una|lo|gli|in|a)?\s*([a-zà-öA-ZÀ-Ö]{4,})\b/i,
    // EN — "I'm/I am [the/a/an]? [role]"
    /\bI(?:['\u2019]m|\s+am)\s+(?:the|a|an)?\s*([a-zA-Z]{4,})\b/i,
    // ES — "soy [el/la/un/una]? [role]"
    /\bsoy\s+(?:el|la|un|una)?\s*([a-zà-öA-ZÀ-Ö]{4,})\b/i,
    // FR — "je suis [le/la/l'/un/une]? [role]"
    /\bje\s+suis\s+(?:le|la|l['\u2019]|un|une)?\s*([a-zà-öA-ZÀ-Ö]{4,})\b/i,
    // DE — "ich bin [der/die/das/ein/eine]? [role]"
    /\bich\s+bin\s+(?:der|die|das|ein|eine)?\s*([a-zà-öA-ZÀ-Ö]{4,})\b/i,
    // PT — "(eu) sou [o/a/um/uma]? [role]"
    /\b(?:eu\s+)?sou\s+(?:o|a|um|uma)?\s*([a-zà-öA-ZÀ-Ö]{4,})\b/i,
    // NL — "ik ben [de/het/een]? [role]"
    /\bik\s+ben\s+(?:de|het|een)?\s*([a-zà-öA-ZÀ-Ö]{4,})\b/i,
  ];
  for (const re of PATTERNS) {
    const m = t.match(re);
    if (!m) continue;
    const raw = cleanName(m[1]);
    const low = raw.toLowerCase();
    if (!ROLE_WORDS.has(low)) continue;
    const display = capitalise(low);
    return {
      name: display,
      evidence: [t],
      role: low,
      capitalised: true, // synthetic display name is always capitalised
      compound: false,
      patternStrength: "medium", // 0.85 base; downshifted to 0.75 in scoring
    };
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
  m = t.match(/\bje\s+m['''\u2019]appelle\s+(\S+)/i);
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

  // ===== MEDIUM patterns (0.85) — require capitalised name =====

  // Italian: "mi presento, sono X"
  m = t.match(/\bmi\s+presento[,\s]+sono\s+([A-ZÀ-Ö]\S*)/);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // Italian: "piacere, X"
  m = t.match(/\bpiacere[,\s]+([A-ZÀ-Ö]\S*)/);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // Italian: "qui è X"
  m = t.match(/\bqui\s+è\s+([A-ZÀ-Ö]\S*)/);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // Italian: "parlo io, X"
  m = t.match(/\bparlo\s+io[,\s]+([A-ZÀ-Ö]\S*)/);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // English: "hello/hi, this is X"
  m = t.match(/\b(?:hello|hi)[,\s]+this\s+is\s+([A-ZÀ-Ö]\S*)/);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // English: "X speaking"
  m = t.match(/^([A-ZÀ-Ö]\S*)\s+speaking\s*[.!]?\s*$/);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // English: "speaking, X"
  m = t.match(/\bspeaking[,\s]+([A-ZÀ-Ö]\S*)/);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // French: "bonjour, je suis X"
  m = t.match(/\bbonjour[,\s]+je\s+suis\s+([A-ZÀ-Ö]\S*)/);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // French: "moi c'est X"
  m = t.match(/\bmoi\s+c['''\u2019]est\s+([A-ZÀ-Ö]\S*)/);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // French: "X à l'appareil"
  m = t.match(/^([A-ZÀ-Ö]\S*)\s+à\s+l['''\u2019]appareil/);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // Spanish: "hola, soy X"
  m = t.match(/\bhola[,\s]+soy\s+([A-ZÀ-Ö]\S*)/);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // German: "hier ist X"
  m = t.match(/\bhier\s+ist\s+([A-ZÀ-Ö]\S*)/);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // German: "hier spricht X"
  m = t.match(/\bhier\s+spricht\s+([A-ZÀ-Ö]\S*)/);
  if (m) { const c = mk(m[1], t, "medium"); if (c) return c; }

  // NO BROAD PATTERNS — removed entirely per plan

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
    const MAX_EVIDENCE_CHARS = 120;
    const allEvidence = [...new Set(
      (hasMultipleNames ? candidates : topGroup).flatMap((c) => c.evidence)
    )].slice(0, 3).map((e) => e.length > MAX_EVIDENCE_CHARS ? e.slice(0, MAX_EVIDENCE_CHARS) + "…" : e);
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
    }

    // Lowercase penalty
    if (!bestCandidate.capitalised) {
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

    // NEVER auto-apply — always suggest
    results.push({
      speaker_label: speaker,
      inferred_name: displayName,
      confidence,
      evidence: allEvidence,
      role,
      status: "suggested",
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
  apiKey: string,
  language?: string
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

  const langHint = language ? `\nTranscript language: ${language}` : "";

  const systemPrompt = `You are a SCEPTICAL speaker name verifier for transcripts.

Given transcript segments and candidate name extractions, verify whether each candidate is a real person name.
${langHint}

CRITICAL RULES:
- You must REJECT any candidate that is NOT clearly a person's proper name
- Common words, adjectives, verbs, past participles, articles, pronouns, role titles, and profession words are NEVER valid names
- If no clear person name is identifiable from the evidence, set confidence to 0.0
- Do NOT infer, guess, or fabricate names — only confirm names with explicit evidence
- A person name must appear as a self-introduction (e.g. "mi chiamo Marco", "my name is Sarah")
- "sono strutturati", "sono che", "I am happy" do NOT contain person names
- Put roles/titles in the "role" field (e.g. "terapista occupazionale"), never in "inferred_name"
- Capitalise proper names correctly
- Return a JSON array: [{"speaker_label": "...", "inferred_name": "...", "confidence": 0.0-1.0, "role": "..."}]
- When in doubt, return confidence 0.0 — it is better to miss a name than to suggest a wrong one`;

  const userPrompt = `Verify these candidate extractions (reject any that are not real person names):\n${candidateDescription}\n\nRelevant transcript segments:\n${relevantLines}`;

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
        // Post-AI blocklist check — AI cannot bypass validation
        const nameLower = item.inferred_name.toLowerCase();
        if (STOPWORDS.has(nameLower) || ROLE_WORDS.has(nameLower) || matchesNonNamePattern(item.inferred_name)) {
          console.warn(`[identify-speakers] AI returned blocked word as name: "${item.inferred_name}", skipping`);
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
        status: "suggested" as const,
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
    const { job_id, transcript_lines, existing_speaker_names, language, force } = await req.json();

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
      const aiResults = await runAIReview(needsAI, lines, LOVABLE_API_KEY, language);
      finalResults = [...clean, ...aiResults];
    } else {
      finalResults = deterministicResults;
    }

    // Confidence floor: 0.75 minimum for any suggestion
    finalResults = finalResults.filter((r) => r.confidence >= 0.75);

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

    // No auto-apply — never update speaker_names automatically

    console.log(
      `[identify-speakers] job=${job_id} total=${cleanResults.length} suggested=${cleanResults.length} ai_reviewed=${needsAI.length}`
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
export { extractSelfIdentification, extractCompoundPatterns, validateCandidate, isValidName, isCapitalised, cleanName, matchesNonNamePattern, STOPWORDS, ROLE_WORDS };
export type { Candidate, ValidationResult, PatternStrength };
