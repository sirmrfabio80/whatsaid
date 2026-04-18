import type { Localized } from "./pickLocale";

export type TroubleshootingItem = {
  id: string;
  caps: string[];
  problem: Localized;
  fix: Localized;
};

export const troubleshooting: TroubleshootingItem[] = [
  {
    id: "upload-rejected",
    caps: ["CAP-001"],
    problem: {
      en: "My upload was rejected.",
      it: "Il mio caricamento è stato rifiutato.",
      fr: "Mon téléversement a été refusé.",
    },
    fix: {
      en: "Check that the file is .m4a, .mp3, or .wav, no larger than 100 MB, and no longer than 60 minutes. If your recording is longer, trim it first.",
      it: "Verifica che il file sia .m4a, .mp3 o .wav, non superiore a 100 MB e non più lungo di 60 minuti. Se la registrazione è più lunga, accorciala prima.",
      fr: "Vérifiez que le fichier est .m4a, .mp3 ou .wav, ne dépasse pas 100 Mo et ne dure pas plus de 60 minutes. Si l'enregistrement est plus long, raccourcissez-le d'abord.",
    },
  },
  {
    id: "wrong-language",
    caps: ["CAP-002"],
    problem: {
      en: "The wrong language was detected.",
      it: "È stata rilevata la lingua sbagliata.",
      fr: "La mauvaise langue a été détectée.",
    },
    fix: {
      en: "Override the detected language manually in the language selector on the Convert page before submitting. The override applies to that single job.",
      it: "Sovrascrivi manualmente la lingua rilevata nel selettore della lingua nella pagina Converti prima di inviare. La sovrascrittura si applica solo a quel lavoro.",
      fr: "Remplacez manuellement la langue détectée dans le sélecteur de langue sur la page Convertir avant l'envoi. Le remplacement ne s'applique qu'à ce travail.",
    },
  },
  {
    id: "speakers-mislabelled",
    caps: ["CAP-004", "CAP-005"],
    problem: {
      en: "Speakers are merged or mislabelled.",
      it: "I relatori sono uniti o etichettati in modo errato.",
      fr: "Les intervenants sont fusionnés ou mal étiquetés.",
    },
    fix: {
      en: "Click any speaker label to rename it. You can also accept AI-suggested names when the transcript provides enough context. Quality depends on audio clarity and channel separation — a clearer recording will give better speaker splits.",
      it: "Clicca su qualsiasi etichetta del relatore per rinominarla. Puoi anche accettare i nomi suggeriti dall'AI quando la trascrizione fornisce contesto sufficiente. La qualità dipende dalla chiarezza dell'audio e dalla separazione dei canali — una registrazione più chiara darà una migliore separazione dei relatori.",
      fr: "Cliquez sur n'importe quelle étiquette d'intervenant pour la renommer. Vous pouvez également accepter les noms suggérés par l'IA lorsque la transcription fournit suffisamment de contexte. La qualité dépend de la clarté audio et de la séparation des canaux — un enregistrement plus clair donnera une meilleure séparation des intervenants.",
    },
  },
  {
    id: "summary-outdated",
    caps: ["CAP-007"],
    problem: {
      en: "The summary doesn't reflect my edits.",
      it: "Il riassunto non riflette le mie modifiche.",
      fr: "Le résumé ne reflète pas mes modifications.",
    },
    fix: {
      en: "On the Summary tab, use Regenerate summary to refresh it from the edited transcript. There is a per-job regeneration limit.",
      it: "Nella scheda Riassunto, usa Rigenera riassunto per aggiornarlo dalla trascrizione modificata. Esiste un limite di rigenerazione per lavoro.",
      fr: "Dans l'onglet Résumé, utilisez Régénérer le résumé pour l'actualiser à partir de la transcription modifiée. Une limite de régénération par travail s'applique.",
    },
  },
  {
    id: "qa-unhelpful",
    caps: ["CAP-008"],
    problem: {
      en: "If a question returns an unhelpful answer.",
      it: "Se una domanda restituisce una risposta poco utile.",
      fr: "Si une question renvoie une réponse peu utile.",
    },
    fix: {
      en: "Try rephrasing the question or shortening it. Edit the saved question and re-run, or ask a more specific follow-up.",
      it: "Prova a riformulare la domanda o ad accorciarla. Modifica la domanda salvata e rilanciala, oppure poni un follow-up più specifico.",
      fr: "Essayez de reformuler la question ou de la raccourcir. Modifiez la question enregistrée et relancez-la, ou posez une question complémentaire plus précise.",
    },
  },
  {
    id: "pdf-not-appearing",
    caps: ["CAP-019"],
    problem: {
      en: "I requested a PDF but I don't see it.",
      it: "Ho richiesto un PDF ma non lo vedo.",
      fr: "J'ai demandé un PDF mais je ne le vois pas.",
    },
    fix: {
      en: "PDFs are prepared in the background. Open the notification bell at the top of the app — your PDF appears there with a download link as soon as it's ready.",
      it: "I PDF vengono preparati in background. Apri la campanella delle notifiche in alto nell'app — il tuo PDF appare lì con un link di download non appena è pronto.",
      fr: "Les PDF sont préparés en arrière-plan. Ouvrez la cloche de notification en haut de l'application — votre PDF y apparaît avec un lien de téléchargement dès qu'il est prêt.",
    },
  },
  {
    id: "share-link-broken",
    caps: ["CAP-020"],
    problem: {
      en: "My share link doesn't work.",
      it: "Il mio link di condivisione non funziona.",
      fr: "Mon lien de partage ne fonctionne pas.",
    },
    fix: {
      en: "Share links expire after 2 days and can be claimed only once. If the link is past its expiry or already claimed, send a new one from the job's Share button.",
      it: "I link di condivisione scadono dopo 2 giorni e possono essere riscattati una sola volta. Se il link è scaduto o già riscattato, inviane uno nuovo dal pulsante Condividi del lavoro.",
      fr: "Les liens de partage expirent après 2 jours et ne peuvent être utilisés qu'une seule fois. Si le lien est expiré ou déjà utilisé, envoyez-en un nouveau depuis le bouton Partager du travail.",
    },
  },
  {
    id: "cant-sign-in",
    caps: ["CAP-026"],
    problem: {
      en: "I can't sign in.",
      it: "Non riesco ad accedere.",
      fr: "Je n'arrive pas à me connecter.",
    },
    fix: {
      en: "From the login page, choose Forgot password to receive a time-limited reset link. If you originally signed in with Google, use Continue with Google instead.",
      it: "Nella pagina di accesso, scegli Password dimenticata per ricevere un link di reimpostazione a tempo limitato. Se hai effettuato l'accesso originariamente con Google, usa invece Continua con Google.",
      fr: "Sur la page de connexion, choisissez Mot de passe oublié pour recevoir un lien de réinitialisation à durée limitée. Si vous vous êtes connecté à l'origine avec Google, utilisez plutôt Continuer avec Google.",
    },
  },
  {
    id: "out-of-credits",
    caps: ["CAP-031", "CAP-032"],
    problem: {
      en: "I'm out of credits.",
      it: "Ho esaurito i crediti.",
      fr: "Je n'ai plus de crédits.",
    },
    fix: {
      en: "Top up from the Pricing page. Packs are 1, 5, or 20 credits and can be paid in GBP, USD, or EUR.",
      it: "Ricarica dalla pagina Prezzi. I pacchetti sono da 1, 5 o 20 crediti e possono essere pagati in GBP, USD o EUR.",
      fr: "Rechargez depuis la page Tarifs. Les packs sont de 1, 5 ou 20 crédits et peuvent être payés en GBP, USD ou EUR.",
    },
  },
  {
    id: "no-recording-date",
    caps: ["CAP-016"],
    problem: {
      en: "No recording date is shown for my job.",
      it: "Per il mio lavoro non viene mostrata alcuna data di registrazione.",
      fr: "Aucune date d'enregistrement n'est affichée pour mon travail.",
    },
    fix: {
      en: "WhatSaid extracts the recording date only when the audio file contains it (for example iOS Voice Memos). If it's missing, WhatSaid falls back to the file's last-modified date or omits the field.",
      it: "WhatSaid estrae la data di registrazione solo quando il file audio la contiene (ad esempio i Memo Vocali di iOS). Se manca, WhatSaid utilizza la data di ultima modifica del file o omette il campo.",
      fr: "WhatSaid extrait la date d'enregistrement uniquement lorsque le fichier audio la contient (par exemple les Mémos vocaux iOS). Si elle est absente, WhatSaid utilise la date de dernière modification du fichier ou omet le champ.",
    },
  },
];
