import type { Localized } from "./pickLocale";

export type FeatureItem = {
  id: string;
  caps: string[];
  icon: "fileText" | "users" | "sparkles" | "messageSquareText" | "tags" | "languages" | "download" | "share2" | "history" | "user" | "settings" | "creditCard" | "shield" | "clock" | "calendar" | "edit3";
  title: Localized;
  body: Localized;
  href?: string;
};

export type FeatureGroup = {
  id: string;
  title: Localized;
  items: FeatureItem[];
};

export const features: FeatureGroup[] = [
  {
    id: "transcripts",
    title: { en: "Transcripts", it: "Trascrizioni", fr: "Transcriptions" },
    items: [
      {
        id: "transcript-timestamps",
        caps: ["CAP-003"],
        icon: "fileText",
        title: { en: "Full transcript with timestamps", it: "Trascrizione completa con timestamp", fr: "Transcription complète avec horodatages" },
        body: {
          en: "Every transcript is segmented and timestamped so you can navigate to any moment of the recording.",
          it: "Ogni trascrizione è segmentata e con timestamp per navigare a qualsiasi momento della registrazione.",
          fr: "Chaque transcription est segmentée et horodatée pour naviguer à tout moment de l'enregistrement.",
        },
      },
      {
        id: "speakers",
        caps: ["CAP-004", "CAP-005"],
        icon: "users",
        title: { en: "Speaker labels & renaming", it: "Etichette dei relatori e rinomina", fr: "Étiquettes d'intervenants et renommage" },
        body: {
          en: "Multi-voice recordings are split by speaker. Rename any label, or accept AI-suggested names when the transcript provides enough cues. Accuracy depends on audio quality and channel separation.",
          it: "Le registrazioni con più voci vengono divise per relatore. Rinomina qualsiasi etichetta o accetta i nomi suggeriti dall'AI quando la trascrizione fornisce indizi sufficienti. La precisione dipende dalla qualità dell'audio e dalla separazione dei canali.",
          fr: "Les enregistrements à plusieurs voix sont séparés par intervenant. Renommez n'importe quelle étiquette, ou acceptez les noms suggérés par l'IA lorsque la transcription fournit suffisamment d'indices. La précision dépend de la qualité audio et de la séparation des canaux.",
        },
      },
      {
        id: "inline-edit",
        caps: ["CAP-011"],
        icon: "edit3",
        title: { en: "Inline editing", it: "Modifica in linea", fr: "Édition en ligne" },
        body: {
          en: "Fix words and lines directly in the transcript. Edits are saved to the job.",
          it: "Correggi parole e righe direttamente nella trascrizione. Le modifiche vengono salvate nel lavoro.",
          fr: "Corrigez mots et lignes directement dans la transcription. Les modifications sont enregistrées dans le travail.",
        },
      },
      {
        id: "word-count",
        caps: ["CAP-017"],
        icon: "clock",
        title: { en: "Word count & reading time", it: "Conteggio parole e tempo di lettura", fr: "Nombre de mots et temps de lecture" },
        body: {
          en: "Each transcript shows a word count and an estimated reading time at the top.",
          it: "Ogni trascrizione mostra in alto un conteggio delle parole e un tempo di lettura stimato.",
          fr: "Chaque transcription affiche en haut un nombre de mots et un temps de lecture estimé.",
        },
      },
    ],
  },
  {
    id: "summary",
    title: { en: "Summary", it: "Riassunto", fr: "Résumé" },
    items: [
      {
        id: "structured-summary",
        caps: ["CAP-006"],
        icon: "sparkles",
        title: { en: "Structured summary", it: "Riassunto strutturato", fr: "Résumé structuré" },
        body: {
          en: "A summary with key points and key actions, generated automatically from the transcript.",
          it: "Un riassunto con punti chiave e azioni chiave, generato automaticamente dalla trascrizione.",
          fr: "Un résumé avec points clés et actions clés, généré automatiquement à partir de la transcription.",
        },
      },
      {
        id: "summary-regen",
        caps: ["CAP-007"],
        icon: "sparkles",
        title: { en: "Regenerate after edits", it: "Rigenera dopo le modifiche", fr: "Régénération après modifications" },
        body: {
          en: "After editing the transcript, regenerate the summary so it reflects your changes. There is a per-job regeneration limit.",
          it: "Dopo aver modificato la trascrizione, rigenera il riassunto in modo che rifletta le tue modifiche. Esiste un limite di rigenerazione per lavoro.",
          fr: "Après avoir modifié la transcription, régénérez le résumé pour refléter vos changements. Une limite de régénération par travail s'applique.",
        },
      },
    ],
  },
  {
    id: "questions",
    title: { en: "Questions", it: "Domande", fr: "Questions" },
    items: [
      {
        id: "qa",
        caps: ["CAP-008", "CAP-010"],
        icon: "messageSquareText",
        title: { en: "Ask & save questions", it: "Fai e salva domande", fr: "Posez et enregistrez des questions" },
        body: {
          en: "Ask anything answerable from the transcript and the answers are saved with the job. Edit a saved prompt to re-ask, or delete it.",
          it: "Fai qualsiasi domanda rispondibile dalla trascrizione e le risposte vengono salvate con il lavoro. Modifica una richiesta salvata per richiedere o eliminala.",
          fr: "Posez toute question à laquelle la transcription peut répondre ; les réponses sont enregistrées avec le travail. Modifiez une question enregistrée pour la reposer, ou supprimez-la.",
        },
      },
      {
        id: "qa-multi",
        caps: ["CAP-009"],
        icon: "messageSquareText",
        title: { en: "Ground answers across transcripts", it: "Basa le risposte su più trascrizioni", fr: "Ancrer les réponses sur plusieurs transcriptions" },
        body: {
          en: "Optionally include up to 5 of your own completed transcripts as supporting context. The current transcript stays the primary source.",
          it: "Facoltativamente includi fino a 5 delle tue trascrizioni completate come contesto di supporto. La trascrizione corrente rimane la fonte principale.",
          fr: "Vous pouvez éventuellement inclure jusqu'à 5 de vos transcriptions terminées comme contexte de support. La transcription actuelle reste la source principale.",
        },
      },
    ],
  },
  {
    id: "organise",
    title: { en: "Organise & languages", it: "Organizza e lingue", fr: "Organisation et langues" },
    items: [
      {
        id: "tags",
        caps: ["CAP-012"],
        icon: "tags",
        title: { en: "Auto-tags & manual tags", it: "Tag automatici e manuali", fr: "Tags automatiques et manuels" },
        body: {
          en: "Topical tags are generated from each transcript. Add or remove tags manually from the job page.",
          it: "I tag tematici vengono generati da ogni trascrizione. Aggiungi o rimuovi tag manualmente dalla pagina del lavoro.",
          fr: "Des tags thématiques sont générés à partir de chaque transcription. Ajoutez ou retirez des tags manuellement depuis la page du travail.",
        },
      },
      {
        id: "title-rename",
        caps: ["CAP-015"],
        icon: "edit3",
        title: { en: "Auto title & rename", it: "Titolo automatico e rinomina", fr: "Titre automatique et renommage" },
        body: {
          en: "Each job gets a short descriptive title generated from the transcript. Click the title on the job page to rename it.",
          it: "Ogni lavoro riceve un breve titolo descrittivo generato dalla trascrizione. Clicca sul titolo nella pagina del lavoro per rinominarlo.",
          fr: "Chaque travail reçoit un court titre descriptif généré à partir de la transcription. Cliquez sur le titre dans la page du travail pour le renommer.",
        },
      },
      {
        id: "summary-translation",
        caps: ["CAP-014"],
        icon: "languages",
        title: { en: "Summary in another language", it: "Riassunto in un'altra lingua", fr: "Résumé dans une autre langue" },
        body: {
          en: "Generate the summary in another language from the job page. Translations are cached per output and language.",
          it: "Genera il riassunto in un'altra lingua dalla pagina del lavoro. Le traduzioni vengono memorizzate nella cache per output e lingua.",
          fr: "Générez le résumé dans une autre langue depuis la page du travail. Les traductions sont mises en cache par sortie et par langue.",
        },
      },
      {
        id: "metadata",
        caps: ["CAP-016"],
        icon: "calendar",
        title: { en: "Recording date when available", it: "Data di registrazione quando disponibile", fr: "Date d'enregistrement si disponible" },
        body: {
          en: "When the audio file carries embedded metadata (for example iOS Voice Memos), the original recording date is surfaced on the job page. If it isn't there, WhatSaid falls back to the file's last-modified date or omits the field.",
          it: "Quando il file audio contiene metadati incorporati (ad esempio i Memo Vocali di iOS), la data di registrazione originale viene mostrata nella pagina del lavoro. Se non è presente, WhatSaid utilizza la data di ultima modifica del file o omette il campo.",
          fr: "Lorsque le fichier audio contient des métadonnées intégrées (par exemple Mémos vocaux iOS), la date d'enregistrement originale est affichée sur la page du travail. Si elle est absente, WhatSaid utilise la date de dernière modification du fichier ou omet le champ.",
        },
      },
    ],
  },
  {
    id: "export-share",
    title: { en: "Export & share", it: "Esporta e condividi", fr: "Exporter et partager" },
    items: [
      {
        id: "exports-sync",
        caps: ["CAP-018"],
        icon: "download",
        title: { en: "Download as TXT, JSON or DOC", it: "Scarica come TXT, JSON o DOC", fr: "Téléchargez en TXT, JSON ou DOC" },
        body: {
          en: "Export the transcript and outputs straight away from the Export menu on the job page.",
          it: "Esporta la trascrizione e gli output direttamente dal menu Esporta nella pagina del lavoro.",
          fr: "Exportez la transcription et les résultats directement depuis le menu Exporter de la page du travail.",
        },
      },
      {
        id: "exports-pdf",
        caps: ["CAP-019"],
        icon: "download",
        title: { en: "PDF (prepared in the background)", it: "PDF (preparato in background)", fr: "PDF (préparé en arrière-plan)" },
        body: {
          en: "Request a PDF from the Export menu. It's generated in the background — watch the notification bell at the top of the app for the download link.",
          it: "Richiedi un PDF dal menu Esporta. Viene generato in background — controlla la campanella delle notifiche in alto nell'app per il link di download.",
          fr: "Demandez un PDF depuis le menu Exporter. Il est généré en arrière-plan — surveillez la cloche de notification en haut de l'application pour le lien de téléchargement.",
        },
      },
      {
        id: "share-link",
        caps: ["CAP-020"],
        icon: "share2",
        title: { en: "Share by email (2-day link)", it: "Condividi via email (link di 2 giorni)", fr: "Partager par e-mail (lien de 2 jours)" },
        body: {
          en: "Send the transcript to a recipient by email. The link expires after 2 days and can be claimed once. The recipient signs in to copy it into their own account.",
          it: "Invia la trascrizione a un destinatario via email. Il link scade dopo 2 giorni e può essere riscattato una sola volta. Il destinatario accede per copiarla nel proprio account.",
          fr: "Envoyez la transcription à un destinataire par e-mail. Le lien expire après 2 jours et ne peut être utilisé qu'une seule fois. Le destinataire se connecte pour la copier dans son propre compte.",
        },
      },
      {
        id: "shared-pdf",
        caps: ["CAP-021"],
        icon: "share2",
        title: { en: "Shared PDF download", it: "Download PDF condiviso", fr: "Téléchargement PDF partagé" },
        body: {
          en: "Recipients can also download a one-off PDF of a shared transcript without creating an account.",
          it: "I destinatari possono anche scaricare un PDF una tantum di una trascrizione condivisa senza creare un account.",
          fr: "Les destinataires peuvent également télécharger un PDF ponctuel d'une transcription partagée sans créer de compte.",
        },
      },
    ],
  },
  {
    id: "history",
    title: { en: "History", it: "Cronologia", fr: "Historique" },
    items: [
      {
        id: "history-search",
        caps: ["CAP-023"],
        icon: "history",
        title: { en: "Search & filter by tag", it: "Cerca e filtra per tag", fr: "Rechercher et filtrer par tag" },
        body: {
          en: "All your past jobs are listed in History. Search by title and filter by tag to find anything quickly.",
          it: "Tutti i tuoi lavori passati sono elencati nella Cronologia. Cerca per titolo e filtra per tag per trovare qualsiasi cosa rapidamente.",
          fr: "Tous vos travaux passés sont listés dans l'Historique. Recherchez par titre et filtrez par tag pour retrouver rapidement ce que vous voulez.",
        },
        href: "/history",
      },
    ],
  },
  {
    id: "account",
    title: { en: "Account", it: "Account", fr: "Compte" },
    items: [
      {
        id: "auth",
        caps: ["CAP-024", "CAP-026"],
        icon: "user",
        title: { en: "Sign in with email or Google", it: "Accedi con email o Google", fr: "Connectez-vous avec e-mail ou Google" },
        body: {
          en: "Create an account with email and password or continue with Google. If you forget your password, request a reset link from the login page.",
          it: "Crea un account con email e password o continua con Google. Se dimentichi la password, richiedi un link di reimpostazione dalla pagina di accesso.",
          fr: "Créez un compte avec e-mail et mot de passe ou continuez avec Google. Si vous oubliez votre mot de passe, demandez un lien de réinitialisation depuis la page de connexion.",
        },
      },
      {
        id: "profile",
        caps: ["CAP-027"],
        icon: "user",
        title: { en: "Profile (avatar, name, stats)", it: "Profilo (avatar, nome, statistiche)", fr: "Profil (avatar, nom, statistiques)" },
        body: {
          en: "Manage your avatar and display name, and see your account stats.",
          it: "Gestisci il tuo avatar e il nome visualizzato e visualizza le statistiche dell'account.",
          fr: "Gérez votre avatar et votre nom d'affichage, et consultez les statistiques de votre compte.",
        },
        href: "/profile",
      },
      {
        id: "settings",
        caps: ["CAP-028"],
        icon: "settings",
        title: { en: "Settings", it: "Impostazioni", fr: "Paramètres" },
        body: {
          en: "Update your display name, contact email, and interface language. Email changes go through a verification step.",
          it: "Aggiorna il tuo nome visualizzato, l'email di contatto e la lingua dell'interfaccia. Le modifiche all'email passano attraverso una fase di verifica.",
          fr: "Mettez à jour votre nom d'affichage, votre e-mail de contact et la langue de l'interface. Les modifications d'e-mail passent par une étape de vérification.",
        },
        href: "/settings",
      },
      {
        id: "languages",
        caps: ["CAP-029"],
        icon: "languages",
        title: { en: "Interface in EN / IT / FR", it: "Interfaccia in EN / IT / FR", fr: "Interface en EN / IT / FR" },
        body: {
          en: "Switch the app interface language from the navbar or from Settings.",
          it: "Cambia la lingua dell'interfaccia dell'app dalla barra di navigazione o dalle Impostazioni.",
          fr: "Changez la langue de l'interface de l'application depuis la barre de navigation ou depuis les Paramètres.",
        },
      },
      {
        id: "billing",
        caps: ["CAP-031", "CAP-032"],
        icon: "creditCard",
        title: { en: "Credits & top-ups", it: "Crediti e ricariche", fr: "Crédits et recharges" },
        body: {
          en: "Buy credit packs of 1, 5, or 20 from the Pricing page. Pay in GBP, USD, or EUR. Transcription costs 1 credit per file up to 120 minutes; longer files cost 1 extra credit per additional 120-minute block.",
          it: "Acquista pacchetti di crediti da 1, 5 o 20 dalla pagina Prezzi. Paga in GBP, USD o EUR. La trascrizione costa 1 credito per file fino a 120 minuti; i file più lunghi costano 1 credito aggiuntivo per ogni blocco di 120 minuti in più.",
          fr: "Achetez des packs de crédits de 1, 5 ou 20 depuis la page Tarifs. Payez en GBP, USD ou EUR. La transcription coûte 1 crédit par fichier jusqu'à 120 minutes ; les fichiers plus longs coûtent 1 crédit supplémentaire par tranche additionnelle de 120 minutes.",
        },
        href: "/pricing",
      },
      {
        id: "delete-account",
        caps: ["CAP-030"],
        icon: "shield",
        title: { en: "Delete your account", it: "Elimina il tuo account", fr: "Supprimer votre compte" },
        body: {
          en: "Permanently delete your account and associated data from Settings → Danger zone. This cannot be undone.",
          it: "Elimina definitivamente il tuo account e i dati associati da Impostazioni → Zona di pericolo. Questa azione non può essere annullata.",
          fr: "Supprimez définitivement votre compte et les données associées depuis Paramètres → Zone dangereuse. Cette action est irréversible.",
        },
      },
    ],
  },
];
