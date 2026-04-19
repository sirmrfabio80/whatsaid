// Runtime FAQ source for the Help page.
// Capabilities live in docs/product/capabilities.md (single source of truth).
// docs/product/faq.md is deprecated — do NOT edit it. Edit this file instead.

import type { Localized } from "./pickLocale";

export type FaqItem = {
  id: string;
  caps: string[];
  q: Localized;
  a: Localized;
  /** Mark items most likely to deflect support contacts. */
  highlighted?: boolean;
};

export type FaqGroup = {
  id: string;
  title: Localized;
  items: FaqItem[];
};

export const faq: FaqGroup[] = [
  {
    id: "pricing-credits",
    title: { en: "Pricing & credits", it: "Prezzi e crediti", fr: "Tarifs et crédits" },
    items: [
      {
        id: "credits-cost",
        caps: ["CAP-032"],
        highlighted: true,
        q: { en: "How many credits does a transcription cost?", it: "Quanti crediti costa una trascrizione?", fr: "Combien de crédits coûte une transcription ?" },
        a: {
          en: "Credits are charged in 15-minute brackets: up to 15 min = 1 credit, up to 30 min = 2, up to 45 min = 3, up to 60 min = 4.",
          it: "I crediti vengono addebitati in fasce di 15 minuti: fino a 15 min = 1 credito, fino a 30 min = 2, fino a 45 min = 3, fino a 60 min = 4.",
          fr: "Les crédits sont facturés par tranches de 15 minutes : jusqu'à 15 min = 1 crédit, jusqu'à 30 min = 2, jusqu'à 45 min = 3, jusqu'à 60 min = 4.",
        },
      },
      {
        id: "duration-measured",
        caps: ["CAP-032"],
        q: { en: "How is duration measured?", it: "Come viene misurata la durata?", fr: "Comment la durée est-elle mesurée ?" },
        a: {
          en: "By the actual length of your audio file — the bracket is determined when you upload.",
          it: "In base alla durata effettiva del file audio — la fascia viene determinata al momento del caricamento.",
          fr: "Selon la durée réelle de votre fichier audio — le palier est déterminé au moment du téléversement.",
        },
      },
      {
        id: "currencies",
        caps: ["CAP-031"],
        q: { en: "Which currencies are supported?", it: "Quali valute sono supportate?", fr: "Quelles devises sont prises en charge ?" },
        a: {
          en: "You can pay in GBP, USD, or EUR.",
          it: "Puoi pagare in GBP, USD o EUR.",
          fr: "Vous pouvez payer en GBP, USD ou EUR.",
        },
      },
      {
        id: "top-up",
        caps: ["CAP-031"],
        q: { en: "How do I top up?", it: "Come faccio a ricaricare?", fr: "Comment recharger ?" },
        a: {
          en: "Buy credit packs of 1, 5, or 20 from the Pricing page or the in-app top-up. Purchases are one-time — there are no subscriptions.",
          it: "Acquista pacchetti da 1, 5 o 20 crediti dalla pagina Prezzi o dalla ricarica in-app. Gli acquisti sono una tantum — non ci sono abbonamenti.",
          fr: "Achetez des packs de 1, 5 ou 20 crédits depuis la page Tarifs ou la recharge dans l'application. Les achats sont ponctuels — il n'y a pas d'abonnement.",
        },
      },
      {
        id: "credits-expire",
        caps: ["CAP-031"],
        q: { en: "Do credits expire?", it: "I crediti scadono?", fr: "Les crédits expirent-ils ?" },
        a: {
          en: "Credits stay on your account; we don't auto-expire them. (For specific terms, see your purchase confirmation.)",
          it: "I crediti rimangono sul tuo account; non li facciamo scadere automaticamente. (Per i termini specifici, consulta la conferma d'acquisto.)",
          fr: "Les crédits restent sur votre compte ; nous ne les faisons pas expirer automatiquement. (Pour les conditions précises, consultez votre confirmation d'achat.)",
        },
      },
    ],
  },
  {
    id: "privacy",
    title: { en: "Privacy", it: "Privacy", fr: "Confidentialité" },
    items: [
      {
        id: "store-audio",
        caps: ["CAP-033"],
        highlighted: true,
        q: { en: "Do you store my audio?", it: "Conservate il mio audio?", fr: "Conservez-vous mon audio ?" },
        a: {
          en: "No. Your audio is deleted after processing. Only the generated text — transcript, summary, questions, tags, and metadata — is kept in your account.",
          it: "No. L'audio viene eliminato dopo l'elaborazione. Solo il testo generato — trascrizione, riassunto, domande, tag e metadati — viene conservato nel tuo account.",
          fr: "Non. Votre audio est supprimé après traitement. Seul le texte généré — transcription, résumé, questions, tags et métadonnées — est conservé dans votre compte.",
        },
      },
      {
        id: "audio-kept-for",
        caps: ["CAP-033"],
        q: { en: "How long is the audio kept?", it: "Per quanto tempo viene conservato l'audio?", fr: "Combien de temps l'audio est-il conservé ?" },
        a: {
          en: "Only as long as it takes to process the file. As soon as the job completes, the audio is deleted.",
          it: "Solo per il tempo necessario a elaborare il file. Non appena il lavoro è completato, l'audio viene eliminato.",
          fr: "Seulement le temps nécessaire au traitement du fichier. Dès que le travail est terminé, l'audio est supprimé.",
        },
      },
    ],
  },
  {
    id: "audio-uploads",
    title: { en: "Audio uploads", it: "Caricamenti audio", fr: "Téléversements audio" },
    items: [
      {
        id: "formats",
        caps: ["CAP-001"],
        q: { en: "What audio formats are supported?", it: "Quali formati audio sono supportati?", fr: "Quels formats audio sont pris en charge ?" },
        a: {
          en: "WhatSaid accepts .m4a, .mp3, and .wav files. .m4a (the default for Apple Voice Memos) is fully supported.",
          it: "WhatSaid accetta file .m4a, .mp3 e .wav. .m4a (il formato predefinito di Memo Vocali Apple) è pienamente supportato.",
          fr: "WhatSaid accepte les fichiers .m4a, .mp3 et .wav. .m4a (le format par défaut de Mémos vocaux Apple) est pleinement pris en charge.",
        },
      },
      {
        id: "max-size-length",
        caps: ["CAP-001"],
        highlighted: true,
        q: { en: "What's the maximum file size and length?", it: "Qual è la dimensione e durata massima del file?", fr: "Quelles sont la taille et la durée maximales du fichier ?" },
        a: {
          en: "Up to 100 MB per file and up to 60 minutes of audio per upload.",
          it: "Fino a 100 MB per file e fino a 60 minuti di audio per caricamento.",
          fr: "Jusqu'à 100 Mo par fichier et jusqu'à 60 minutes d'audio par téléversement.",
        },
      },
    ],
  },
  {
    id: "languages",
    title: { en: "Languages", it: "Lingue", fr: "Langues" },
    items: [
      {
        id: "transcribe-langs",
        caps: ["CAP-002"],
        q: { en: "Which languages can WhatSaid transcribe?", it: "Quali lingue può trascrivere WhatSaid?", fr: "Quelles langues WhatSaid peut-il transcrire ?" },
        a: {
          en: "WhatSaid auto-detects the spoken language during transcription. If detection picks the wrong language, you can override it manually before submitting the file.",
          it: "WhatSaid rileva automaticamente la lingua parlata durante la trascrizione. Se il rilevamento sceglie la lingua sbagliata, puoi sovrascriverla manualmente prima di inviare il file.",
          fr: "WhatSaid détecte automatiquement la langue parlée lors de la transcription. Si la détection choisit la mauvaise langue, vous pouvez la remplacer manuellement avant l'envoi du fichier.",
        },
      },
      {
        id: "force-language",
        caps: ["CAP-002"],
        q: { en: "Can I force a specific language?", it: "Posso forzare una lingua specifica?", fr: "Puis-je forcer une langue spécifique ?" },
        a: {
          en: "Yes. On the Convert page, set the language manually in the language selector before uploading. The override applies to that single job.",
          it: "Sì. Nella pagina Converti, imposta la lingua manualmente nel selettore della lingua prima di caricare. La sovrascrittura si applica solo a quel lavoro.",
          fr: "Oui. Sur la page Convertir, définissez la langue manuellement dans le sélecteur de langue avant le téléversement. Le remplacement ne s'applique qu'à ce travail.",
        },
      },
      {
        id: "ui-langs",
        caps: ["CAP-029"],
        q: { en: "Which interface languages are supported?", it: "Quali lingue dell'interfaccia sono supportate?", fr: "Quelles langues d'interface sont prises en charge ?" },
        a: {
          en: "The app interface is available in English, Italian, and French. Switch from the language switcher in the navbar or from your account settings.",
          it: "L'interfaccia dell'app è disponibile in inglese, italiano e francese. Cambia dal selettore della lingua nella barra di navigazione o dalle impostazioni dell'account.",
          fr: "L'interface de l'application est disponible en anglais, italien et français. Changez depuis le sélecteur de langue dans la barre de navigation ou depuis les paramètres de votre compte.",
        },
      },
      {
        id: "summary-translation",
        caps: ["CAP-014"],
        q: { en: "Can I get the summary in a different language?", it: "Posso avere il riassunto in un'altra lingua?", fr: "Puis-je obtenir le résumé dans une autre langue ?" },
        a: {
          en: "Yes. From the job page, you can generate and cache a translated version of the summary in another language.",
          it: "Sì. Dalla pagina del lavoro, puoi generare e memorizzare nella cache una versione tradotta del riassunto in un'altra lingua.",
          fr: "Oui. Depuis la page du travail, vous pouvez générer et mettre en cache une version traduite du résumé dans une autre langue.",
        },
      },
    ],
  },
  {
    id: "transcripts-speakers",
    title: { en: "Transcripts & speakers", it: "Trascrizioni e relatori", fr: "Transcriptions et intervenants" },
    items: [
      {
        id: "timestamps",
        caps: ["CAP-003"],
        q: { en: "Do transcripts include timestamps?", it: "Le trascrizioni includono i timestamp?", fr: "Les transcriptions incluent-elles des horodatages ?" },
        a: {
          en: "Yes. Every transcript is segmented with timestamps so you can navigate to any part of the recording.",
          it: "Sì. Ogni trascrizione è segmentata con timestamp per permetterti di navigare in qualsiasi parte della registrazione.",
          fr: "Oui. Chaque transcription est segmentée avec des horodatages pour vous permettre de naviguer dans n'importe quelle partie de l'enregistrement.",
        },
      },
      {
        id: "accuracy",
        caps: ["CAP-003"],
        q: { en: "How accurate are transcripts?", it: "Quanto sono accurate le trascrizioni?", fr: "Quelle est la précision des transcriptions ?" },
        a: {
          en: "Accuracy depends on audio quality and the language spoken. Clearly recorded speech in a supported language produces the best results. You can always edit the transcript inline to fix any mistakes.",
          it: "La precisione dipende dalla qualità dell'audio e dalla lingua parlata. Il parlato registrato chiaramente in una lingua supportata produce i migliori risultati. Puoi sempre modificare la trascrizione in linea per correggere eventuali errori.",
          fr: "La précision dépend de la qualité audio et de la langue parlée. Un discours clairement enregistré dans une langue prise en charge produit les meilleurs résultats. Vous pouvez toujours modifier la transcription en ligne pour corriger les erreurs.",
        },
      },
      {
        id: "edit-transcript",
        caps: ["CAP-011"],
        q: { en: "Can I correct mistakes in the transcript?", it: "Posso correggere gli errori nella trascrizione?", fr: "Puis-je corriger les erreurs dans la transcription ?" },
        a: {
          en: "Yes. Open any transcript and edit it directly — your changes are saved to the job.",
          it: "Sì. Apri qualsiasi trascrizione e modificala direttamente — le tue modifiche vengono salvate nel lavoro.",
          fr: "Oui. Ouvrez n'importe quelle transcription et modifiez-la directement — vos modifications sont enregistrées dans le travail.",
        },
      },
      {
        id: "speakers-identified",
        caps: ["CAP-004"],
        q: { en: "Does WhatSaid identify different speakers?", it: "WhatSaid identifica i diversi relatori?", fr: "WhatSaid identifie-t-il les différents intervenants ?" },
        a: {
          en: "Yes. When the recording has more than one voice, WhatSaid splits the transcript by speaker and assigns labels.",
          it: "Sì. Quando la registrazione ha più di una voce, WhatSaid divide la trascrizione per relatore e assegna le etichette.",
          fr: "Oui. Lorsque l'enregistrement comporte plusieurs voix, WhatSaid divise la transcription par intervenant et attribue des étiquettes.",
        },
      },
      {
        id: "rename-speakers",
        caps: ["CAP-005"],
        q: { en: "Can I rename speakers?", it: "Posso rinominare i relatori?", fr: "Puis-je renommer les intervenants ?" },
        a: {
          en: "Yes. Click any speaker label to rename it. WhatSaid will also suggest names automatically when the transcript provides enough context.",
          it: "Sì. Clicca su qualsiasi etichetta di relatore per rinominarla. WhatSaid suggerirà automaticamente nomi anche quando la trascrizione fornisce contesto sufficiente.",
          fr: "Oui. Cliquez sur n'importe quelle étiquette d'intervenant pour la renommer. WhatSaid suggérera également des noms automatiquement lorsque la transcription fournit suffisamment de contexte.",
        },
      },
      {
        id: "speaker-guess",
        caps: ["CAP-005"],
        q: { en: "How does WhatSaid guess who's speaking?", it: "Come fa WhatSaid a indovinare chi sta parlando?", fr: "Comment WhatSaid devine-t-il qui parle ?" },
        a: {
          en: "It uses the transcript itself — for example, when participants introduce themselves or address each other by name — to suggest speaker names you can accept or override.",
          it: "Usa la trascrizione stessa — ad esempio quando i partecipanti si presentano o si chiamano per nome — per suggerire i nomi dei relatori che puoi accettare o sovrascrivere.",
          fr: "Il utilise la transcription elle-même — par exemple, lorsque les participants se présentent ou s'appellent par leur nom — pour suggérer des noms d'intervenants que vous pouvez accepter ou remplacer.",
        },
      },
    ],
  },
  {
    id: "summaries",
    title: { en: "Summaries", it: "Riassunti", fr: "Résumés" },
    items: [
      {
        id: "summary-include",
        caps: ["CAP-006"],
        q: { en: "What does the summary include?", it: "Cosa include il riassunto?", fr: "Que contient le résumé ?" },
        a: {
          en: "A structured summary with key points and key actions extracted from the transcript.",
          it: "Un riassunto strutturato con punti chiave e azioni chiave estratti dalla trascrizione.",
          fr: "Un résumé structuré avec les points clés et les actions clés extraits de la transcription.",
        },
      },
      {
        id: "summary-generated",
        caps: ["CAP-006"],
        q: { en: "How is the summary generated?", it: "Come viene generato il riassunto?", fr: "Comment le résumé est-il généré ?" },
        a: {
          en: "It's produced automatically from your transcript after transcription completes. You can read it on the Summary tab of any completed job.",
          it: "Viene prodotto automaticamente dalla trascrizione al termine della trascrizione. Puoi leggerlo nella scheda Riassunto di qualsiasi lavoro completato.",
          fr: "Il est produit automatiquement à partir de votre transcription une fois la transcription terminée. Vous pouvez le lire dans l'onglet Résumé de tout travail terminé.",
        },
      },
      {
        id: "summary-after-edits",
        caps: ["CAP-007"],
        q: { en: "Does the summary update when I edit the transcript?", it: "Il riassunto si aggiorna quando modifico la trascrizione?", fr: "Le résumé se met-il à jour quand je modifie la transcription ?" },
        a: {
          en: "Yes. After editing the transcript, you can regenerate the summary so it reflects your changes (subject to a per-job regeneration limit).",
          it: "Sì. Dopo aver modificato la trascrizione, puoi rigenerare il riassunto in modo che rifletta le tue modifiche (soggetto a un limite di rigenerazione per lavoro).",
          fr: "Oui. Après avoir modifié la transcription, vous pouvez régénérer le résumé pour qu'il reflète vos modifications (sous réserve d'une limite de régénération par travail).",
        },
      },
    ],
  },
  {
    id: "questions",
    title: { en: "Questions about your transcripts", it: "Domande sulle tue trascrizioni", fr: "Questions sur vos transcriptions" },
    items: [
      {
        id: "qa-kind",
        caps: ["CAP-008"],
        q: { en: "What kind of questions can I ask?", it: "Che tipo di domande posso fare?", fr: "Quel type de questions puis-je poser ?" },
        a: {
          en: "Anything answerable from the transcript — for example, \"What were the action items?\", \"What did the client object to?\", or \"Summarise the second half.\" Open the Questions tab on any completed job to ask.",
          it: "Qualsiasi cosa rispondibile dalla trascrizione — ad esempio \"Quali erano le azioni da intraprendere?\", \"A cosa ha obiettato il cliente?\" o \"Riassumi la seconda metà.\" Apri la scheda Domande in qualsiasi lavoro completato per chiedere.",
          fr: "Toute question à laquelle la transcription peut répondre — par exemple, « Quelles étaient les actions à entreprendre ? », « À quoi le client s'est-il opposé ? » ou « Résume la seconde moitié. » Ouvrez l'onglet Questions sur tout travail terminé pour demander.",
        },
      },
      {
        id: "qa-saved",
        caps: ["CAP-008"],
        q: { en: "Are answers saved?", it: "Le risposte vengono salvate?", fr: "Les réponses sont-elles enregistrées ?" },
        a: {
          en: "Yes. Every question and answer is saved with the job, so you can revisit them later.",
          it: "Sì. Ogni domanda e risposta viene salvata con il lavoro, così puoi rivederle in seguito.",
          fr: "Oui. Chaque question et réponse est enregistrée avec le travail, vous pouvez donc les consulter plus tard.",
        },
      },
      {
        id: "qa-edit-delete",
        caps: ["CAP-010"],
        q: { en: "Can I edit or delete a saved question?", it: "Posso modificare o eliminare una domanda salvata?", fr: "Puis-je modifier ou supprimer une question enregistrée ?" },
        a: {
          en: "Yes. From the saved answer, edit the prompt and re-run it, or delete the entry entirely.",
          it: "Sì. Dalla risposta salvata, modifica la richiesta e rilanciala, oppure elimina completamente la voce.",
          fr: "Oui. Depuis la réponse enregistrée, modifiez l'invite et relancez-la, ou supprimez l'entrée entièrement.",
        },
      },
      {
        id: "qa-multi",
        caps: ["CAP-009"],
        q: { en: "Can I ask questions across several transcripts?", it: "Posso fare domande su più trascrizioni?", fr: "Puis-je poser des questions sur plusieurs transcriptions ?" },
        a: {
          en: "Yes. In the Questions tab, enable Additional transcripts and pick up to 5 other transcripts you own. Your current transcript stays the primary source; the extras provide supporting context.",
          it: "Sì. Nella scheda Domande, abilita Trascrizioni aggiuntive e seleziona fino a 5 altre trascrizioni di tua proprietà. La trascrizione corrente rimane la fonte principale; le aggiuntive forniscono contesto di supporto.",
          fr: "Oui. Dans l'onglet Questions, activez Transcriptions supplémentaires et choisissez jusqu'à 5 autres transcriptions que vous possédez. Votre transcription actuelle reste la source principale ; les supplémentaires fournissent un contexte de support.",
        },
      },
      {
        id: "qa-whose",
        caps: ["CAP-009"],
        q: { en: "Whose transcripts can I include as extras?", it: "Di chi posso includere le trascrizioni come aggiuntive?", fr: "À qui peuvent appartenir les transcriptions supplémentaires ?" },
        a: {
          en: "Only your own completed transcripts. Shared or other users' transcripts cannot be added as extra sources.",
          it: "Solo le tue trascrizioni completate. Le trascrizioni condivise o di altri utenti non possono essere aggiunte come fonti aggiuntive.",
          fr: "Uniquement vos propres transcriptions terminées. Les transcriptions partagées ou celles d'autres utilisateurs ne peuvent pas être ajoutées comme sources supplémentaires.",
        },
      },
    ],
  },
  {
    id: "exports",
    title: { en: "Exports", it: "Esportazioni", fr: "Exports" },
    items: [
      {
        id: "formats",
        caps: ["CAP-018", "CAP-019"],
        q: { en: "Which formats can I download?", it: "Quali formati posso scaricare?", fr: "Quels formats puis-je télécharger ?" },
        a: {
          en: "You can export each transcript as TXT, JSON, DOC, or PDF from the Export menu on the job page.",
          it: "Puoi esportare ogni trascrizione come TXT, JSON, DOC o PDF dal menu Esporta nella pagina del lavoro.",
          fr: "Vous pouvez exporter chaque transcription au format TXT, JSON, DOC ou PDF depuis le menu Exporter de la page du travail.",
        },
      },
      {
        id: "json-export",
        caps: ["CAP-018"],
        q: { en: "What's in the JSON export?", it: "Cosa contiene l'esportazione JSON?", fr: "Que contient l'export JSON ?" },
        a: {
          en: "A structured representation of the job — transcript with timestamps and speakers, summary, and saved questions — suitable for processing in other tools.",
          it: "Una rappresentazione strutturata del lavoro — trascrizione con timestamp e relatori, riassunto e domande salvate — adatta all'elaborazione in altri strumenti.",
          fr: "Une représentation structurée du travail — transcription avec horodatages et intervenants, résumé et questions enregistrées — adaptée au traitement dans d'autres outils.",
        },
      },
      {
        id: "pdf-time",
        caps: ["CAP-019"],
        highlighted: true,
        q: { en: "How long does the PDF take?", it: "Quanto tempo ci vuole per il PDF?", fr: "Combien de temps prend le PDF ?" },
        a: {
          en: "PDFs are generated in the background. You'll see progress in the notification bell at the top of the app.",
          it: "I PDF vengono generati in background. Vedrai i progressi nella campanella delle notifiche in alto nell'app.",
          fr: "Les PDF sont générés en arrière-plan. Vous verrez la progression dans la cloche de notification en haut de l'application.",
        },
      },
      {
        id: "pdf-where",
        caps: ["CAP-019"],
        q: { en: "Where do I find the PDF once it's ready?", it: "Dove trovo il PDF quando è pronto?", fr: "Où trouver le PDF une fois prêt ?" },
        a: {
          en: "Open the notification bell — your PDF appears as a notification with a download link as soon as it's ready.",
          it: "Apri la campanella delle notifiche — il tuo PDF appare come notifica con un link di download non appena è pronto.",
          fr: "Ouvrez la cloche de notification — votre PDF y apparaît comme notification avec un lien de téléchargement dès qu'il est prêt.",
        },
      },
    ],
  },
  {
    id: "sharing",
    title: { en: "Sharing", it: "Condivisione", fr: "Partage" },
    items: [
      {
        id: "share-expiry",
        caps: ["CAP-020"],
        highlighted: true,
        q: { en: "How long does a share link last?", it: "Quanto dura un link di condivisione?", fr: "Combien de temps dure un lien de partage ?" },
        a: {
          en: "Share links expire after 2 days and can be claimed once.",
          it: "I link di condivisione scadono dopo 2 giorni e possono essere riscattati una sola volta.",
          fr: "Les liens de partage expirent après 2 jours et ne peuvent être utilisés qu'une seule fois.",
        },
      },
      {
        id: "recipient-account",
        caps: ["CAP-020", "CAP-021"],
        q: { en: "Does the recipient need an account?", it: "Il destinatario ha bisogno di un account?", fr: "Le destinataire a-t-il besoin d'un compte ?" },
        a: {
          en: "To claim a copy of the transcript, yes — they'll be prompted to sign in or sign up. To download a one-off PDF of a shared transcript, no account is required.",
          it: "Per richiedere una copia della trascrizione, sì — verrà loro richiesto di accedere o registrarsi. Per scaricare un PDF una tantum di una trascrizione condivisa, non è richiesto alcun account.",
          fr: "Pour réclamer une copie de la transcription, oui — il leur sera demandé de se connecter ou de s'inscrire. Pour télécharger un PDF ponctuel d'une transcription partagée, aucun compte n'est nécessaire.",
        },
      },
      {
        id: "shared-pdf",
        caps: ["CAP-021"],
        q: { en: "Can someone download a PDF of a transcript I share?", it: "Qualcuno può scaricare un PDF di una trascrizione che ho condiviso?", fr: "Quelqu'un peut-il télécharger un PDF d'une transcription que je partage ?" },
        a: {
          en: "Yes. The recipient gets a download link for a PDF of the shared transcript without needing to create an account.",
          it: "Sì. Il destinatario riceve un link di download per un PDF della trascrizione condivisa senza dover creare un account.",
          fr: "Oui. Le destinataire reçoit un lien de téléchargement pour un PDF de la transcription partagée sans avoir à créer de compte.",
        },
      },
    ],
  },
  {
    id: "tags",
    title: { en: "Tags & organisation", it: "Tag e organizzazione", fr: "Tags et organisation" },
    items: [
      {
        id: "tags-generated",
        caps: ["CAP-012"],
        q: { en: "How are tags generated?", it: "Come vengono generati i tag?", fr: "Comment les tags sont-ils générés ?" },
        a: {
          en: "WhatSaid generates topical tags automatically from the transcript so you can group related jobs in your history.",
          it: "WhatSaid genera automaticamente tag tematici dalla trascrizione così puoi raggruppare lavori correlati nella cronologia.",
          fr: "WhatSaid génère automatiquement des tags thématiques à partir de la transcription pour regrouper les travaux liés dans votre historique.",
        },
      },
      {
        id: "tags-manual",
        caps: ["CAP-012"],
        q: { en: "Can I add my own tags?", it: "Posso aggiungere i miei tag?", fr: "Puis-je ajouter mes propres tags ?" },
        a: {
          en: "Yes. You can add or remove tags manually from the job page; your tags appear alongside the auto-generated ones.",
          it: "Sì. Puoi aggiungere o rimuovere tag manualmente dalla pagina del lavoro; i tuoi tag appaiono insieme a quelli generati automaticamente.",
          fr: "Oui. Vous pouvez ajouter ou retirer des tags manuellement depuis la page du travail ; vos tags apparaissent à côté de ceux générés automatiquement.",
        },
      },
    ],
  },
  {
    id: "titles-metadata",
    title: { en: "Titles & metadata", it: "Titoli e metadati", fr: "Titres et métadonnées" },
    items: [
      {
        id: "titles-from",
        caps: ["CAP-015"],
        q: { en: "Where do titles come from?", it: "Da dove provengono i titoli?", fr: "D'où viennent les titres ?" },
        a: {
          en: "WhatSaid generates a short, descriptive title from the transcript automatically.",
          it: "WhatSaid genera automaticamente un titolo breve e descrittivo dalla trascrizione.",
          fr: "WhatSaid génère automatiquement un titre court et descriptif à partir de la transcription.",
        },
      },
      {
        id: "rename-job",
        caps: ["CAP-015"],
        q: { en: "Can I rename a job?", it: "Posso rinominare un lavoro?", fr: "Puis-je renommer un travail ?" },
        a: {
          en: "Yes. Click the title on the job page to rename it.",
          it: "Sì. Clicca sul titolo nella pagina del lavoro per rinominarlo.",
          fr: "Oui. Cliquez sur le titre dans la page du travail pour le renommer.",
        },
      },
      {
        id: "recording-date",
        caps: ["CAP-016"],
        q: { en: "Where does the recording date come from?", it: "Da dove proviene la data di registrazione?", fr: "D'où vient la date d'enregistrement ?" },
        a: {
          en: "When the audio file carries embedded metadata (for example, recordings from iOS Voice Memos), WhatSaid extracts the original recording date and surfaces it on the job page.",
          it: "Quando il file audio contiene metadati incorporati (ad esempio le registrazioni dei Memo Vocali iOS), WhatSaid estrae la data di registrazione originale e la mostra nella pagina del lavoro.",
          fr: "Lorsque le fichier audio contient des métadonnées intégrées (par exemple, les enregistrements de Mémos vocaux iOS), WhatSaid extrait la date d'enregistrement originale et l'affiche sur la page du travail.",
        },
      },
      {
        id: "no-recording-date",
        caps: ["CAP-016"],
        q: { en: "Why is no recording date shown?", it: "Perché non viene mostrata alcuna data di registrazione?", fr: "Pourquoi aucune date d'enregistrement n'est-elle affichée ?" },
        a: {
          en: "Many files don't carry that metadata. When it's missing, WhatSaid falls back to the file's last-modified date or omits the field.",
          it: "Molti file non contengono quei metadati. Quando mancano, WhatSaid utilizza la data di ultima modifica del file o omette il campo.",
          fr: "De nombreux fichiers ne contiennent pas ces métadonnées. Lorsqu'elles sont absentes, WhatSaid utilise la date de dernière modification du fichier ou omet le champ.",
        },
      },
    ],
  },
  {
    id: "history",
    title: { en: "History", it: "Cronologia", fr: "Historique" },
    items: [
      {
        id: "find-history",
        caps: ["CAP-023"],
        q: { en: "Where do I find my past transcripts?", it: "Dove trovo le mie trascrizioni passate?", fr: "Où retrouver mes transcriptions passées ?" },
        a: {
          en: "Open History from the navbar. You can search and filter by tag to find any past job.",
          it: "Apri Cronologia dalla barra di navigazione. Puoi cercare e filtrare per tag per trovare qualsiasi lavoro passato.",
          fr: "Ouvrez Historique depuis la barre de navigation. Vous pouvez rechercher et filtrer par tag pour retrouver n'importe quel travail.",
        },
      },
      {
        id: "history-retention",
        caps: ["CAP-023", "CAP-033"],
        q: { en: "How long is history kept?", it: "Per quanto tempo viene conservata la cronologia?", fr: "Pendant combien de temps l'historique est-il conservé ?" },
        a: {
          en: "Your transcripts and outputs stay in your account indefinitely — only the original audio file is deleted after processing.",
          it: "Le tue trascrizioni e gli output rimangono nel tuo account a tempo indeterminato — solo il file audio originale viene eliminato dopo l'elaborazione.",
          fr: "Vos transcriptions et résultats restent dans votre compte indéfiniment — seul le fichier audio original est supprimé après traitement.",
        },
      },
    ],
  },
  {
    id: "account",
    title: { en: "Account", it: "Account", fr: "Compte" },
    items: [
      {
        id: "change-email",
        caps: ["CAP-028"],
        q: { en: "How do I change my email?", it: "Come faccio a cambiare la mia email?", fr: "Comment changer mon e-mail ?" },
        a: {
          en: "Go to Settings, update the contact email, and confirm the change from the verification email we send.",
          it: "Vai su Impostazioni, aggiorna l'email di contatto e conferma la modifica dall'email di verifica che inviamo.",
          fr: "Allez dans Paramètres, mettez à jour l'e-mail de contact et confirmez le changement depuis l'e-mail de vérification que nous envoyons.",
        },
      },
      {
        id: "change-language",
        caps: ["CAP-028", "CAP-029"],
        q: { en: "How do I change the app language?", it: "Come faccio a cambiare la lingua dell'app?", fr: "Comment changer la langue de l'application ?" },
        a: {
          en: "From Settings (or the navbar language switcher), pick English, Italian, or French. Your choice is saved to your profile.",
          it: "Da Impostazioni (o dal selettore della lingua nella barra di navigazione), scegli inglese, italiano o francese. La tua scelta viene salvata nel profilo.",
          fr: "Depuis Paramètres (ou le sélecteur de langue de la barre de navigation), choisissez anglais, italien ou français. Votre choix est enregistré dans votre profil.",
        },
      },
      {
        id: "change-avatar",
        caps: ["CAP-027"],
        q: { en: "How do I change my avatar?", it: "Come cambio il mio avatar?", fr: "Comment changer mon avatar ?" },
        a: {
          en: "Open Profile and upload a new image from the avatar editor.",
          it: "Apri Profilo e carica una nuova immagine dall'editor dell'avatar.",
          fr: "Ouvrez Profil et téléversez une nouvelle image depuis l'éditeur d'avatar.",
        },
      },
      {
        id: "listening-voice-picker",
        caps: ["CAP-028"],
        q: {
          en: "How does the Listening voice picker work, and why don't I see male/female options on every browser?",
          it: "Come funziona il selettore di voce Ascolto e perché su alcuni browser non vedo le opzioni maschile/femminile?",
          fr: "Comment fonctionne le sélecteur de voix d'Écoute, et pourquoi ne vois-je pas les options masculine/féminine sur tous les navigateurs ?",
        },
        a: {
          en: "The Listen feature on each job uses your browser's built-in text-to-speech voices — WhatSaid does not generate audio itself. In Settings → Listening you can pick a preferred voice (male or female) and a playback speed; we then match those choices against the voices your browser and operating system actually expose, in this order: exact language, same language family, locally installed voice, then a name-based gender guess. The matched voice name is shown right under the selector. Because browsers report voice metadata inconsistently — some don't tag voices by gender at all, and mobile browsers often ship only one or two voices per language — your selection may map to the same voice in both modes, or fall back to your browser's default. Your speed choice is always applied.",
          it: "La funzione Ascolta in ogni lavoro usa le voci di sintesi vocale integrate nel browser — WhatSaid non genera audio. In Impostazioni → Ascolto puoi scegliere una voce preferita (maschile o femminile) e una velocità di riproduzione; poi le confrontiamo con le voci effettivamente esposte dal browser e dal sistema operativo, in quest'ordine: lingua esatta, stessa famiglia linguistica, voce installata localmente, infine un'ipotesi di genere basata sul nome. Il nome della voce selezionata viene mostrato sotto il selettore. Poiché i browser riportano i metadati delle voci in modo incoerente — alcuni non etichettano le voci per genere e i browser mobili spesso offrono solo una o due voci per lingua — la tua scelta potrebbe ricadere sulla stessa voce in entrambe le modalità o tornare alla voce predefinita. La velocità scelta viene sempre applicata.",
          fr: "La fonction Écouter sur chaque travail utilise les voix de synthèse vocale intégrées à votre navigateur — WhatSaid ne génère pas d'audio. Dans Paramètres → Écoute, vous pouvez choisir une voix préférée (masculine ou féminine) et une vitesse de lecture ; nous comparons ensuite ces choix aux voix réellement exposées par votre navigateur et votre système d'exploitation, dans cet ordre : langue exacte, même famille linguistique, voix installée localement, puis une estimation du genre basée sur le nom. Le nom de la voix retenue s'affiche sous le sélecteur. Parce que les navigateurs publient les métadonnées des voix de façon incohérente — certains ne taguent pas les voix par genre et les navigateurs mobiles n'offrent souvent qu'une ou deux voix par langue — votre sélection peut aboutir à la même voix dans les deux modes ou retomber sur la voix par défaut. Votre choix de vitesse est toujours appliqué.",
        },
      },
      {
        id: "delete-account",
        caps: ["CAP-030"],
        q: { en: "How do I delete my account?", it: "Come faccio a eliminare il mio account?", fr: "Comment supprimer mon compte ?" },
        a: {
          en: "Go to Settings and use the account deletion option in the danger zone. This permanently removes your account and associated data — it cannot be undone.",
          it: "Vai su Impostazioni e usa l'opzione di eliminazione dell'account nella zona di pericolo. Questo rimuove definitivamente il tuo account e i dati associati — non può essere annullato.",
          fr: "Allez dans Paramètres et utilisez l'option de suppression de compte dans la zone dangereuse. Cela supprime définitivement votre compte et les données associées — c'est irréversible.",
        },
      },
    ],
  },
  {
    id: "getting-started",
    title: { en: "Getting started", it: "Per iniziare", fr: "Premiers pas" },
    items: [
      {
        id: "sign-up",
        caps: ["CAP-024"],
        q: { en: "How do I sign up?", it: "Come faccio a registrarmi?", fr: "Comment m'inscrire ?" },
        a: {
          en: "Create an account from the Sign up page using your email and a password, or continue with Google. Once you're signed in, head to Convert to upload your first audio file.",
          it: "Crea un account dalla pagina di Registrazione usando la tua email e una password, oppure continua con Google. Una volta effettuato l'accesso, vai su Converti per caricare il primo file audio.",
          fr: "Créez un compte depuis la page d'Inscription avec votre e-mail et un mot de passe, ou continuez avec Google. Une fois connecté, rendez-vous sur Convertir pour téléverser votre premier fichier audio.",
        },
      },
      {
        id: "google-signin",
        caps: ["CAP-024"],
        q: { en: "Can I use Google to sign in?", it: "Posso usare Google per accedere?", fr: "Puis-je utiliser Google pour me connecter ?" },
        a: {
          en: "Yes. Both Sign in with Google and email/password are supported on the login and signup pages.",
          it: "Sì. Sia Accedi con Google che email/password sono supportati nelle pagine di accesso e registrazione.",
          fr: "Oui. La connexion avec Google et l'e-mail/mot de passe sont tous deux pris en charge sur les pages de connexion et d'inscription.",
        },
      },
      {
        id: "forgot-password",
        caps: ["CAP-026"],
        q: { en: "I forgot my password — how do I reset it?", it: "Ho dimenticato la password — come la reimposto?", fr: "J'ai oublié mon mot de passe — comment le réinitialiser ?" },
        a: {
          en: "Go to the login page and choose Forgot password. We'll email you a time-limited link to set a new password.",
          it: "Vai alla pagina di accesso e scegli Password dimenticata. Ti invieremo via email un link a tempo limitato per impostare una nuova password.",
          fr: "Allez sur la page de connexion et choisissez Mot de passe oublié. Nous vous enverrons par e-mail un lien à durée limitée pour définir un nouveau mot de passe.",
        },
      },
    ],
  },
];
