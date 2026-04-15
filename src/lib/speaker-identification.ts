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
  // Italian — adjectives, adverbs, pronouns, conjunctions, prepositions, past participles
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
  "buono", "buona", "cattivo", "cattiva", "grande", "piccolo", "piccola",
  "nuovo", "nuova", "vecchio", "vecchia", "lungo", "lunga", "corto", "corta",
  "alto", "alta", "basso", "bassa", "forte", "debole", "pieno", "piena",
  "vuoto", "vuota", "chiaro", "chiara", "scuro", "scura",
  "difficile", "facile", "possibile", "impossibile", "necessario", "necessaria",
  "importante", "normale", "diverso", "diversa", "uguale", "simile",
  // English
  "here", "fine", "ready", "good", "well", "sorry", "sure", "happy",
  "tired", "done", "busy", "back", "home", "glad", "okay", "great",
  "available", "alone", "late", "early", "right", "wrong", "certain",
  "the", "this", "that", "these", "those", "what", "which", "who",
  "where", "when", "how", "why", "some", "any", "all", "each", "every",
  "both", "few", "many", "much", "more", "most", "other", "another",
  "yes", "yeah", "yep", "no", "not", "never", "already", "always",
  "actually", "basically", "currently", "exactly", "finally", "honestly",
  "absolutely", "definitely", "probably", "certainly", "obviously",
  "concerned", "interested", "excited", "worried", "confused", "surprised",
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
  "diretor", "diretora",
]);
