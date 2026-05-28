/**
 * Localised copy for the uploader lawful-basis attestation dialog
 * (UK GDPR Art. 6 + Art. 14). Co-located with `consent_versions.version`
 * so audits can pair user-facing text with the row that was recorded.
 *
 * If you change anything here that alters the meaning, bump
 * UPLOAD_ATTESTATION_VERSION and seed a new row in `consent_versions`.
 */
export const UPLOAD_ATTESTATION_VERSION = "1.0.0";

export type Locale = "en" | "it" | "fr";

export type LawfulBasis =
  | "own_voice"
  | "consent"
  | "contract"
  | "legitimate_interest"
  | "legal_obligation"
  | "other";

export const LAWFUL_BASES: readonly LawfulBasis[] = [
  "own_voice",
  "consent",
  "contract",
  "legitimate_interest",
  "legal_obligation",
  "other",
] as const;

interface Strings {
  title: string;
  intro: string;
  basisLabel: string;
  basisOptions: Record<LawfulBasis, string>;
  acknowledgeLawful: string;
  acknowledgeArt14: string;
  contextLabel: string;
  contextHelper: string;
  privacyLink: string;
  cancel: string;
  confirm: string;
  pickBasisError: string;
}

const EN: Strings = {
  title: "Confirm you have the right to upload this audio",
  intro:
    "WhatSaid transcribes whatever you upload. UK data-protection law makes you the controller of any other voices in the recording. Before we process this file, please confirm your lawful basis and acknowledge your duty to inform others.",
  basisLabel: "Lawful basis for this upload",
  basisOptions: {
    own_voice: "It is only my own voice",
    consent: "The speakers have given consent",
    contract: "It is necessary for a contract",
    legitimate_interest: "Legitimate interest (and I have done a balancing test)",
    legal_obligation: "Legal obligation or public task",
    other: "Other lawful ground",
  },
  acknowledgeLawful:
    "I confirm I have a lawful basis under UK GDPR Article 6 to upload this audio for transcription.",
  acknowledgeArt14:
    "Where the recording contains identifiable people other than me, I will inform them their voice is being transcribed, unless an Article 14(5) exemption applies.",
  contextLabel: "Context (optional)",
  contextHelper:
    "A short note for your own records — not shown publicly (max 280 chars).",
  privacyLink: "Read about your responsibilities",
  cancel: "Cancel",
  confirm: "Confirm and continue",
  pickBasisError: "Please pick a lawful basis to continue.",
};

const IT: Strings = {
  title: "Conferma di avere il diritto di caricare questo audio",
  intro:
    "WhatSaid trascrive ciò che carichi. La normativa britannica sulla protezione dei dati ti rende titolare del trattamento delle altre voci nella registrazione. Prima di elaborare il file, conferma la tua base giuridica e l'obbligo di informare gli altri.",
  basisLabel: "Base giuridica per questo caricamento",
  basisOptions: {
    own_voice: "È solo la mia voce",
    consent: "Gli interlocutori hanno dato il consenso",
    contract: "È necessario per un contratto",
    legitimate_interest: "Legittimo interesse (con bilanciamento eseguito)",
    legal_obligation: "Obbligo legale o compito di interesse pubblico",
    other: "Altra base giuridica",
  },
  acknowledgeLawful:
    "Confermo di avere una base giuridica ai sensi dell'art. 6 del GDPR del Regno Unito per caricare questo audio per la trascrizione.",
  acknowledgeArt14:
    "Quando la registrazione contiene persone identificabili diverse da me, le informerò che la loro voce viene trascritta, salvo eccezioni ai sensi dell'art. 14(5).",
  contextLabel: "Contesto (facoltativo)",
  contextHelper:
    "Una breve nota per i tuoi archivi — non mostrata pubblicamente (max 280 caratteri).",
  privacyLink: "Leggi le tue responsabilità",
  cancel: "Annulla",
  confirm: "Conferma e continua",
  pickBasisError: "Seleziona una base giuridica per continuare.",
};

const FR: Strings = {
  title: "Confirmez que vous avez le droit de téléverser cet enregistrement",
  intro:
    "WhatSaid transcrit ce que vous téléversez. Le droit britannique de la protection des données fait de vous le responsable du traitement des autres voix présentes dans l'enregistrement. Avant de traiter ce fichier, confirmez votre base légale et votre obligation d'informer les autres.",
  basisLabel: "Base légale pour ce téléversement",
  basisOptions: {
    own_voice: "Il s'agit uniquement de ma propre voix",
    consent: "Les interlocuteurs ont donné leur consentement",
    contract: "C'est nécessaire à l'exécution d'un contrat",
    legitimate_interest: "Intérêt légitime (test de mise en balance effectué)",
    legal_obligation: "Obligation légale ou mission d'intérêt public",
    other: "Autre base légale",
  },
  acknowledgeLawful:
    "Je confirme disposer d'une base légale au sens de l'article 6 du UK GDPR pour téléverser cet audio à des fins de transcription.",
  acknowledgeArt14:
    "Lorsque l'enregistrement contient des personnes identifiables autres que moi, je les informerai que leur voix est transcrite, sauf si une exemption au titre de l'article 14(5) s'applique.",
  contextLabel: "Contexte (facultatif)",
  contextHelper:
    "Une courte note pour vos archives — non affichée publiquement (max 280 caractères).",
  privacyLink: "Vos responsabilités",
  cancel: "Annuler",
  confirm: "Confirmer et continuer",
  pickBasisError: "Veuillez sélectionner une base légale pour continuer.",
};

const TABLE: Record<Locale, Strings> = { en: EN, it: IT, fr: FR };

export function getUploadAttestationStrings(locale: string | undefined): Strings {
  const key = (locale ?? "en").slice(0, 2).toLowerCase() as Locale;
  return TABLE[key] ?? EN;
}

export const UPLOAD_ATTESTATION_STRINGS_BY_LOCALE = TABLE;
