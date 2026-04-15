import { assertEquals, assertNotEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  extractSelfIdentification,
  validateCandidate,
  matchesNonNamePattern,
  ROLE_WORDS,
  STOPWORDS,
} from "./index.ts";
import type { Candidate } from "./index.ts";

// Helper to extract and check name
function extractName(text: string): string | null {
  const c = extractSelfIdentification(text);
  return c ? c.name : null;
}

function extractResult(text: string) {
  return extractSelfIdentification(text);
}

// ===== POSITIVE CASES — name correctly extracted =====

Deno.test("IT: 'mi chiamo Marco' → Marco (strong)", () => {
  const r = extractResult("mi chiamo Marco");
  assertEquals(r?.name, "Marco");
  assertEquals(r?.patternStrength, "strong");
});

Deno.test("IT: 'io sono, sono Camilla' → Camilla (compound)", () => {
  const r = extractResult("io sono, sono Camilla");
  assertEquals(r?.name, "Camilla");
  assertEquals(r?.patternStrength, "compound");
});

Deno.test("IT: 'piacere, Giulia' → Giulia (medium)", () => {
  const r = extractResult("piacere, Giulia");
  assertEquals(r?.name, "Giulia");
  assertEquals(r?.patternStrength, "medium");
});

Deno.test("IT: 'sono la terapista occupazionale Camilla' → Camilla + role (compound)", () => {
  const r = extractResult("sono la terapista occupazionale Camilla");
  assertEquals(r?.name, "Camilla");
  assertEquals(r?.patternStrength, "compound");
  assertNotEquals(r?.role, undefined);
});

Deno.test("IT: 'sono Camilla, sono la terapista occupazionale' → Camilla + role (compound)", () => {
  const r = extractResult("sono Camilla, sono la terapista occupazionale");
  assertEquals(r?.name, "Camilla");
  assertEquals(r?.role, "terapista occupazionale");
  assertEquals(r?.patternStrength, "compound");
});

Deno.test("IT: 'mi presento, sono Luca' → Luca (medium)", () => {
  const r = extractResult("mi presento, sono Luca");
  assertEquals(r?.name, "Luca");
  assertEquals(r?.patternStrength, "medium");
});

Deno.test("IT: 'qui è Giovanni' → Giovanni (medium)", () => {
  const r = extractResult("qui è Giovanni");
  assertEquals(r?.name, "Giovanni");
  assertEquals(r?.patternStrength, "medium");
});

Deno.test("IT: 'sono il dottor Rossi' → Rossi + role (compound)", () => {
  const r = extractResult("sono il dottor Rossi");
  assertEquals(r?.name, "Rossi");
  assertNotEquals(r?.role, undefined);
});

Deno.test("EN: 'my name is John' → John (strong)", () => {
  const r = extractResult("my name is John");
  assertEquals(r?.name, "John");
  assertEquals(r?.patternStrength, "strong");
});

Deno.test("EN: 'hello, this is Sarah' → Sarah (medium)", () => {
  const r = extractResult("hello, this is Sarah");
  assertEquals(r?.name, "Sarah");
  assertEquals(r?.patternStrength, "medium");
});

Deno.test("EN: 'I'm Dr Smith' → Smith + role Dr (compound)", () => {
  const r = extractResult("I'm Dr Smith");
  assertEquals(r?.name, "Smith");
  assertEquals(r?.role, "Dr");
  assertEquals(r?.patternStrength, "compound");
});

Deno.test("EN: 'Sarah speaking' → Sarah (medium)", () => {
  const r = extractResult("Sarah speaking");
  assertEquals(r?.name, "Sarah");
  assertEquals(r?.patternStrength, "medium");
});

Deno.test("EN: 'I'm nurse Johnson' → Johnson + role (compound)", () => {
  const r = extractResult("I'm nurse Johnson");
  assertEquals(r?.name, "Johnson");
  assertEquals(r?.role, "nurse");
});

Deno.test("FR: 'je m'appelle Sophie' → Sophie (strong)", () => {
  const r = extractResult("je m'appelle Sophie");
  assertEquals(r?.name, "Sophie");
  assertEquals(r?.patternStrength, "strong");
});

Deno.test("FR: 'bonjour, je suis Marie' → Marie (medium)", () => {
  const r = extractResult("bonjour, je suis Marie");
  assertEquals(r?.name, "Marie");
  assertEquals(r?.patternStrength, "medium");
});

Deno.test("FR: 'moi c'est Pierre' → Pierre (medium)", () => {
  const r = extractResult("moi c'est Pierre");
  assertEquals(r?.name, "Pierre");
  assertEquals(r?.patternStrength, "medium");
});

Deno.test("FR: 'je suis le docteur Martin' → Martin + role (compound)", () => {
  const r = extractResult("je suis le docteur Martin");
  assertEquals(r?.name, "Martin");
  assertEquals(r?.role, "docteur");
});

Deno.test("ES: 'me llamo Carlos' → Carlos (strong)", () => {
  const r = extractResult("me llamo Carlos");
  assertEquals(r?.name, "Carlos");
  assertEquals(r?.patternStrength, "strong");
});

Deno.test("ES: 'hola, soy Ana' → Ana (medium)", () => {
  const r = extractResult("hola, soy Ana");
  assertEquals(r?.name, "Ana");
  assertEquals(r?.patternStrength, "medium");
});

Deno.test("ES: 'mi nombre es Elena' → Elena (strong)", () => {
  const r = extractResult("mi nombre es Elena");
  assertEquals(r?.name, "Elena");
  assertEquals(r?.patternStrength, "strong");
});

Deno.test("DE: 'mein Name ist Anna' → Anna (strong)", () => {
  const r = extractResult("mein Name ist Anna");
  assertEquals(r?.name, "Anna");
  assertEquals(r?.patternStrength, "strong");
});

Deno.test("DE: 'hier spricht Thomas' → Thomas (medium)", () => {
  const r = extractResult("hier spricht Thomas");
  assertEquals(r?.name, "Thomas");
  assertEquals(r?.patternStrength, "medium");
});

Deno.test("PT: 'me chamo João' → João (strong)", () => {
  const r = extractResult("me chamo João");
  assertEquals(r?.name, "João");
  assertEquals(r?.patternStrength, "strong");
});

Deno.test("PT: 'meu nome é Maria' → Maria (strong)", () => {
  const r = extractResult("meu nome é Maria");
  assertEquals(r?.name, "Maria");
  assertEquals(r?.patternStrength, "strong");
});

Deno.test("NL: 'mijn naam is Pieter' → Pieter (strong)", () => {
  const r = extractResult("mijn naam is Pieter");
  assertEquals(r?.name, "Pieter");
  assertEquals(r?.patternStrength, "strong");
});

Deno.test("TR: 'adım Elif' → Elif (strong)", () => {
  const r = extractResult("adım Elif");
  assertEquals(r?.name, "Elif");
  assertEquals(r?.patternStrength, "strong");
});

Deno.test("PL: 'mam na imię Kasia' → Kasia (strong)", () => {
  const r = extractResult("mam na imię Kasia");
  assertEquals(r?.name, "Kasia");
  assertEquals(r?.patternStrength, "strong");
});

Deno.test("RO: 'mă numesc Andrei' → Andrei (strong)", () => {
  const r = extractResult("mă numesc Andrei");
  assertEquals(r?.name, "Andrei");
  assertEquals(r?.patternStrength, "strong");
});

Deno.test("CS: 'jmenuji se Pavel' → Pavel (strong)", () => {
  const r = extractResult("jmenuji se Pavel");
  assertEquals(r?.name, "Pavel");
  assertEquals(r?.patternStrength, "strong");
});

// ===== NEGATIVE CASES — must NOT extract a name =====

Deno.test("NEG IT: 'sono la terapista occupazionale' → no name (role only)", () => {
  const r = extractResult("sono la terapista occupazionale");
  if (r) {
    assertNotEquals(r.name.toLowerCase(), "occupazionale");
    assertNotEquals(r.name.toLowerCase(), "terapista");
  }
});

Deno.test("NEG EN: 'I'm the manager' → no name", () => {
  const r = extractResult("I'm the manager");
  if (r) {
    assertNotEquals(r.name.toLowerCase(), "manager");
  }
});

Deno.test("NEG FR: 'je suis disponible' → no name (stopword)", () => {
  const r = extractResult("je suis disponible");
  assertEquals(r, null);
});

Deno.test("NEG IT: 'sono contento' → no name (stopword)", () => {
  const r = extractResult("sono contento");
  assertEquals(r, null);
});

Deno.test("NEG EN: 'I am fine' → no name (stopword)", () => {
  const r = extractResult("I am fine");
  assertEquals(r, null);
});

Deno.test("NEG ES: 'soy el director' → no name (role only)", () => {
  const r = extractResult("soy el director");
  if (r) {
    assertNotEquals(r.name.toLowerCase(), "director");
  }
});

// ===== CRITICAL: Italian false positive cases that MUST be rejected =====

Deno.test("NEG IT: 'sono strutturati' → no name (past participle)", () => {
  const r = extractResult("sono strutturati");
  assertEquals(r, null);
});

Deno.test("NEG IT: 'sono Strutturati' → no name (capitalised past participle)", () => {
  const r = extractResult("sono Strutturati");
  assertEquals(r, null);
});

Deno.test("NEG IT: 'sono che...' → no name", () => {
  const r = extractResult("sono che non capisco");
  assertEquals(r, null);
});

Deno.test("NEG IT: 'Sono interessata' → no name (past participle)", () => {
  const r = extractResult("Sono interessata");
  assertEquals(r, null);
});

Deno.test("NEG IT: 'sono organizzati' → no name (past participle)", () => {
  const r = extractResult("sono organizzati");
  assertEquals(r, null);
});

Deno.test("NEG IT: 'io sono contenta' → no name (stopword)", () => {
  const r = extractResult("io sono contenta");
  assertEquals(r, null);
});

Deno.test("NEG EN: 'I am happy to be here' → no name", () => {
  const r = extractResult("I am happy to be here");
  assertEquals(r, null);
});

Deno.test("NEG EN: 'I'm tired' → no name (stopword)", () => {
  const r = extractResult("I'm tired");
  assertEquals(r, null);
});

Deno.test("NEG FR: 'je suis fatigué' → no name (stopword)", () => {
  const r = extractResult("je suis fatigué");
  assertEquals(r, null);
});

Deno.test("NEG DE: 'ich bin müde' → no name (stopword)", () => {
  const r = extractResult("ich bin müde");
  assertEquals(r, null);
});

Deno.test("NEG ES: 'soy seguro' → no name (stopword)", () => {
  const r = extractResult("soy seguro");
  assertEquals(r, null);
});

Deno.test("NEG IT: 'sono il dottore' → no name (role word only)", () => {
  const r = extractResult("sono il dottore");
  if (r) {
    assertNotEquals(r.name.toLowerCase(), "dottore");
  }
});

// ===== BROAD PATTERNS REMOVED — these should now return null =====

Deno.test("REMOVED BROAD: 'sono Marco' → null (broad removed, no intro phrase)", () => {
  // Without an explicit introduction pattern, bare "sono X" should not match
  const r = extractResult("sono Marco");
  assertEquals(r, null);
});

Deno.test("REMOVED BROAD: 'I am David' → null (broad removed)", () => {
  const r = extractResult("I am David");
  assertEquals(r, null);
});

Deno.test("REMOVED BROAD: 'je suis Marie' → null (broad removed, use 'bonjour, je suis' or 'je m'appelle')", () => {
  const r = extractResult("je suis Marie");
  assertEquals(r, null);
});

Deno.test("REMOVED BROAD: 'ich bin Thomas' → null (broad removed)", () => {
  const r = extractResult("ich bin Thomas");
  assertEquals(r, null);
});

Deno.test("REMOVED BROAD: 'soy Carlos' → null (broad removed, use 'hola, soy' or 'me llamo')", () => {
  const r = extractResult("soy Carlos");
  assertEquals(r, null);
});

// ===== MORPHOLOGICAL PATTERN TESTS =====

Deno.test("MORPH: Italian past participle -ato is rejected", () => {
  assertEquals(matchesNonNamePattern("strutturato"), true);
  assertEquals(matchesNonNamePattern("organizzato"), true);
  assertEquals(matchesNonNamePattern("interessato"), true);
});

Deno.test("MORPH: Italian adjective -ale/-ile is rejected", () => {
  assertEquals(matchesNonNamePattern("normale"), true);
  assertEquals(matchesNonNamePattern("difficile"), true);
  assertEquals(matchesNonNamePattern("possibile"), true);
});

Deno.test("MORPH: Real names are NOT rejected by morphology", () => {
  assertEquals(matchesNonNamePattern("Marco"), false);
  assertEquals(matchesNonNamePattern("Camilla"), false);
  assertEquals(matchesNonNamePattern("Sarah"), false);
  assertEquals(matchesNonNamePattern("Giovanni"), false);
});

// ===== ROLE EXTRACTION CASES =====

Deno.test("ROLE: 'I'm Dr Smith' → name: Smith, role: Dr", () => {
  const r = extractResult("I'm Dr Smith");
  assertEquals(r?.name, "Smith");
  assertEquals(r?.role, "Dr");
});

Deno.test("ROLE: 'sono Camilla, sono la terapista occupazionale' → name: Camilla, role: terapista occupazionale", () => {
  const r = extractResult("sono Camilla, sono la terapista occupazionale");
  assertEquals(r?.name, "Camilla");
  assertEquals(r?.role, "terapista occupazionale");
});

Deno.test("ROLE: 'je suis le docteur Martin' → name: Martin, role: docteur", () => {
  const r = extractResult("je suis le docteur Martin");
  assertEquals(r?.name, "Martin");
  assertEquals(r?.role, "docteur");
});

// ===== VALIDATION TESTS =====

Deno.test("VALIDATION: role word → suspicious", () => {
  const c: Candidate = { name: "terapista", evidence: [], capitalised: false, compound: false, patternStrength: "medium" };
  const v = validateCandidate(c);
  assertEquals(v.status, "suspicious");
});

Deno.test("VALIDATION: stopword → rejected", () => {
  const c: Candidate = { name: "fine", evidence: [], capitalised: false, compound: false, patternStrength: "medium" };
  const v = validateCandidate(c);
  assertEquals(v.status, "rejected");
});

Deno.test("VALIDATION: short name (< 3 chars) → rejected", () => {
  const c: Candidate = { name: "Xu", evidence: [], capitalised: true, compound: false, patternStrength: "strong" };
  const v = validateCandidate(c);
  assertEquals(v.status, "rejected");
});

Deno.test("VALIDATION: clean name → clean", () => {
  const c: Candidate = { name: "Marco", evidence: [], capitalised: true, compound: false, patternStrength: "strong" };
  const v = validateCandidate(c);
  assertEquals(v.status, "clean");
});

Deno.test("VALIDATION: morphological non-name → rejected", () => {
  const c: Candidate = { name: "Strutturati", evidence: [], capitalised: true, compound: false, patternStrength: "medium" };
  const v = validateCandidate(c);
  assertEquals(v.status, "rejected");
});

Deno.test("VALIDATION: non-capitalised name → suspicious", () => {
  const c: Candidate = { name: "marco", evidence: [], capitalised: false, compound: false, patternStrength: "strong" };
  const v = validateCandidate(c);
  assertEquals(v.status, "suspicious");
});

// ===== ROLE_WORDS coverage =====

Deno.test("ROLE_WORDS includes expanded ES/DE/PT terms", () => {
  assertEquals(ROLE_WORDS.has("enfermero"), true);
  assertEquals(ROLE_WORDS.has("ärztin"), true);
  assertEquals(ROLE_WORDS.has("doutora"), true);
  assertEquals(ROLE_WORDS.has("terapeuta"), true);
});

// ===== STOPWORDS coverage =====

Deno.test("STOPWORDS includes Italian common words that caused false positives", () => {
  assertEquals(STOPWORDS.has("che"), true);
  assertEquals(STOPWORDS.has("strutturati"), true);
  assertEquals(STOPWORDS.has("tutti"), true);
  assertEquals(STOPWORDS.has("questo"), true);
  assertEquals(STOPWORDS.has("quello"), true);
  assertEquals(STOPWORDS.has("appena"), true);
  assertEquals(STOPWORDS.has("interessato"), true);
  assertEquals(STOPWORDS.has("organizzato"), true);
});
