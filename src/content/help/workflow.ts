import type { Localized } from "./pickLocale";

export type WorkflowStep = {
  id: string;
  /** Capability ids (from docs/product/capabilities.md) this step is derived from. */
  caps: string[];
  icon: "upload" | "languages" | "fileText" | "users" | "sparkles" | "messageSquareText" | "tags" | "download" | "history";
  title: Localized;
  body: Localized;
  cta?: { href: string; label: Localized };
};

export const workflow: WorkflowStep[] = [
  {
    id: "upload",
    caps: ["CAP-001", "CAP-002"],
    icon: "upload",
    title: {
      en: "1. Upload your audio",
      it: "1. Carica il tuo audio",
      fr: "1. Téléversez votre audio",
    },
    body: {
      en: "On the Convert page, drop a .m4a, .mp3, or .wav file (up to 100 MB and 60 minutes). The spoken language is auto-detected — you can override it manually before submitting.",
      it: "Nella pagina Converti, trascina un file .m4a, .mp3 o .wav (fino a 100 MB e 60 minuti). La lingua parlata viene rilevata automaticamente — puoi sovrascriverla manualmente prima di inviare.",
      fr: "Sur la page Convertir, déposez un fichier .m4a, .mp3 ou .wav (jusqu'à 100 Mo et 60 minutes). La langue parlée est détectée automatiquement — vous pouvez la remplacer manuellement avant l'envoi.",
    },
    cta: {
      href: "/convert",
      label: { en: "Open Convert", it: "Apri Converti", fr: "Ouvrir Convertir" },
    },
  },
  {
    id: "transcript",
    caps: ["CAP-003", "CAP-004", "CAP-005", "CAP-011", "CAP-017"],
    icon: "users",
    title: {
      en: "2. Read & refine the transcript",
      it: "2. Leggi e perfeziona la trascrizione",
      fr: "2. Lisez et affinez la transcription",
    },
    body: {
      en: "Each transcript is segmented with timestamps and split by speaker. Rename speakers (we suggest names from context when possible), edit any line inline, and check word count and reading time at a glance.",
      it: "Ogni trascrizione è segmentata con timestamp e suddivisa per relatore. Rinomina i relatori (suggeriamo nomi dal contesto quando possibile), modifica qualsiasi riga in linea e controlla a colpo d'occhio il numero di parole e il tempo di lettura.",
      fr: "Chaque transcription est segmentée avec des horodatages et séparée par intervenant. Renommez les intervenants (nous suggérons des noms à partir du contexte lorsque c'est possible), modifiez n'importe quelle ligne en ligne et consultez le nombre de mots et le temps de lecture en un coup d'œil.",
    },
  },
  {
    id: "summary",
    caps: ["CAP-006", "CAP-007"],
    icon: "fileText",
    title: {
      en: "3. Read the summary",
      it: "3. Leggi il riassunto",
      fr: "3. Lisez le résumé",
    },
    body: {
      en: "Open the Summary tab for key points and key actions extracted from the transcript. If you edit the transcript afterwards, regenerate the summary so it reflects your changes (limited per job).",
      it: "Apri la scheda Riassunto per i punti chiave e le azioni chiave estratte dalla trascrizione. Se modifichi la trascrizione in seguito, rigenera il riassunto in modo che rifletta le tue modifiche (limitato per lavoro).",
      fr: "Ouvrez l'onglet Résumé pour les points clés et les actions clés extraits de la transcription. Si vous modifiez la transcription par la suite, régénérez le résumé pour qu'il reflète vos modifications (limité par travail).",
    },
  },
  {
    id: "questions",
    caps: ["CAP-008", "CAP-009", "CAP-010"],
    icon: "messageSquareText",
    title: {
      en: "4. Ask questions",
      it: "4. Fai domande",
      fr: "4. Posez des questions",
    },
    body: {
      en: "In the Questions tab, ask anything answerable from the transcript — answers are saved with the job. Optionally include up to 5 of your other completed transcripts as supporting context; the current transcript stays the primary source.",
      it: "Nella scheda Domande, chiedi qualsiasi cosa rispondibile dalla trascrizione — le risposte vengono salvate con il lavoro. Facoltativamente includi fino a 5 delle tue altre trascrizioni completate come contesto di supporto; la trascrizione corrente rimane la fonte principale.",
      fr: "Dans l'onglet Questions, posez toute question à laquelle la transcription peut répondre — les réponses sont enregistrées avec le travail. Vous pouvez éventuellement inclure jusqu'à 5 de vos autres transcriptions terminées comme contexte de support ; la transcription actuelle reste la source principale.",
    },
  },
  {
    id: "organise",
    caps: ["CAP-012", "CAP-014", "CAP-015", "CAP-016"],
    icon: "tags",
    title: {
      en: "5. Organise & translate",
      it: "5. Organizza e traduci",
      fr: "5. Organisez et traduisez",
    },
    body: {
      en: "WhatSaid auto-titles each job and adds topical tags — both can be edited. You can also generate the summary in another language, and where the audio file carries metadata, the recording date is surfaced automatically.",
      it: "WhatSaid assegna automaticamente un titolo a ogni lavoro e aggiunge tag tematici — entrambi possono essere modificati. Puoi anche generare il riassunto in un'altra lingua e, quando il file audio contiene metadati, la data di registrazione viene mostrata automaticamente.",
      fr: "WhatSaid attribue automatiquement un titre à chaque travail et ajoute des tags thématiques — les deux peuvent être modifiés. Vous pouvez également générer le résumé dans une autre langue et, lorsque le fichier audio contient des métadonnées, la date d'enregistrement est affichée automatiquement.",
    },
  },
  {
    id: "export",
    caps: ["CAP-018", "CAP-019", "CAP-020", "CAP-021"],
    icon: "download",
    title: {
      en: "6. Export & share",
      it: "6. Esporta e condividi",
      fr: "6. Exportez et partagez",
    },
    body: {
      en: "Download the transcript and outputs as TXT, JSON, or DOC instantly, or request a PDF — it's prepared in the background, watch the notification bell. Share by email with a 2-day single-claim link; recipients can also download a one-off PDF without an account.",
      it: "Scarica la trascrizione e gli output come TXT, JSON o DOC istantaneamente, oppure richiedi un PDF — viene preparato in background, guarda la campanella delle notifiche. Condividi via email con un link a singolo riscatto valido 2 giorni; i destinatari possono anche scaricare un PDF una tantum senza account.",
      fr: "Téléchargez la transcription et les résultats au format TXT, JSON ou DOC instantanément, ou demandez un PDF — il est préparé en arrière-plan, surveillez la cloche de notification. Partagez par e-mail avec un lien à usage unique valable 2 jours ; les destinataires peuvent également télécharger un PDF ponctuel sans compte.",
    },
  },
  {
    id: "history",
    caps: ["CAP-023"],
    icon: "history",
    title: {
      en: "7. Find past transcripts",
      it: "7. Trova le trascrizioni passate",
      fr: "7. Retrouvez vos transcriptions passées",
    },
    body: {
      en: "Your transcripts and outputs stay in your account — only the original audio is deleted. Use History to search and filter by tag.",
      it: "Le tue trascrizioni e gli output restano nel tuo account — viene eliminato solo l'audio originale. Usa la Cronologia per cercare e filtrare per tag.",
      fr: "Vos transcriptions et résultats restent dans votre compte — seul l'audio original est supprimé. Utilisez l'Historique pour rechercher et filtrer par tag.",
    },
    cta: {
      href: "/history",
      label: { en: "Open History", it: "Apri Cronologia", fr: "Ouvrir l'Historique" },
    },
  },
];
