/** Types and utilities for AI speaker name identification */

export interface SpeakerIdentification {
  speaker_label: string;
  inferred_name: string;
  confidence: number;
  evidence: string[];
  role?: string;
  status: "applied" | "suggested" | "accepted" | "rejected";
  source: "deterministic" | "ai";
}

export interface SpeakerIdentificationData {
  suggestions: SpeakerIdentification[];
  banner_dismissed: boolean;
  processed_at: string;
}

/** Stopwords that should never be treated as names (case-insensitive) */
export const STOPWORDS = new Set([
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
]);

/** Role/profession words that should never be used as person names */
export const ROLE_WORDS = new Set([
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
  "directrice", "assistant", "assistante", "coordinateur", "coordinatrice",
  "médecin", "chirurgien", "pharmacien", "pharmacienne", "professeur",
  "conseiller", "conseillère", "spécialiste", "technicien", "technicienne",
]);
