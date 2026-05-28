/**
 * Localised copy for the cookie notice and `/cookies` page.
 *
 * Co-located here (rather than in `i18n/locales/*.json`) to keep this
 * phase scoped to one PR — the strings are policy-grade and benefit from
 * sitting next to the inventory they describe.
 */
import type { LocalizedString } from "@/lib/cookie-inventory";

type Lang = "en" | "it" | "fr";

export function pick(s: LocalizedString, lang: string | undefined): string {
  const code = (lang ?? "en").slice(0, 2).toLowerCase() as Lang;
  return s[code] ?? s.en;
}

export const NOTICE_STRINGS = {
  body: {
    en: "WhatSaid only uses storage that's strictly necessary to keep you signed in, remember your language, and keep the app working. We don't use analytics, advertising, or tracking cookies.",
    it: "WhatSaid utilizza solo lo storage strettamente necessario per mantenerti connesso, ricordare la tua lingua e far funzionare l'app. Non usiamo cookie di analisi, pubblicità o tracciamento.",
    fr: "WhatSaid n'utilise que le stockage strictement nécessaire pour vous garder connecté, mémoriser votre langue et faire fonctionner l'application. Nous n'utilisons aucun cookie d'analyse, de publicité ou de suivi.",
  } satisfies LocalizedString,
  title: {
    en: "Cookies & local storage",
    it: "Cookie e archiviazione locale",
    fr: "Cookies et stockage local",
  } satisfies LocalizedString,
  ack: {
    en: "Got it",
    it: "Ho capito",
    fr: "J'ai compris",
  } satisfies LocalizedString,
  details: {
    en: "Cookie details",
    it: "Dettagli sui cookie",
    fr: "Détails des cookies",
  } satisfies LocalizedString,
  ariaRegion: {
    en: "Cookie information",
    it: "Informazioni sui cookie",
    fr: "Informations sur les cookies",
  } satisfies LocalizedString,
};

export const COOKIES_PAGE_STRINGS = {
  metaTitle: {
    en: "Cookies & local storage — WhatSaid",
    it: "Cookie e archiviazione locale — WhatSaid",
    fr: "Cookies et stockage local — WhatSaid",
  } satisfies LocalizedString,
  metaDescription: {
    en: "What WhatSaid stores in your browser and why. We use no analytics, advertising, or session-replay cookies.",
    it: "Cosa archivia WhatSaid nel tuo browser e perché. Non utilizziamo cookie di analisi, pubblicità o session replay.",
    fr: "Ce que WhatSaid stocke dans votre navigateur et pourquoi. Nous n'utilisons aucun cookie d'analyse, de publicité ou de relecture de session.",
  } satisfies LocalizedString,
  heading: {
    en: "Cookies & local storage",
    it: "Cookie e archiviazione locale",
    fr: "Cookies et stockage local",
  } satisfies LocalizedString,
  intro: {
    en: "WhatSaid stores a small amount of information in your browser to keep you signed in and remember your preferences. We do not use analytics, advertising, or session-replay tools, and we do not share these values with third parties.",
    it: "WhatSaid memorizza una piccola quantità di informazioni nel tuo browser per mantenerti connesso e ricordare le tue preferenze. Non utilizziamo strumenti di analisi, pubblicità o session replay e non condividiamo questi valori con terze parti.",
    fr: "WhatSaid enregistre une petite quantité d'informations dans votre navigateur pour vous garder connecté et mémoriser vos préférences. Nous n'utilisons aucun outil d'analyse, de publicité ou de relecture de session, et nous ne partageons pas ces valeurs avec des tiers.",
  } satisfies LocalizedString,
  legalBasis: {
    en: "Strictly necessary items are exempt from prior consent under regulation 6(4) of the Privacy and Electronic Communications Regulations (PECR). Functional items below are first-party only and are treated as strictly necessary for the features you use. The day we ever add analytics or marketing tools, you'll see a true consent dialog before any of them load.",
    it: "Gli elementi strettamente necessari sono esenti dal consenso preventivo ai sensi del regolamento 6(4) del PECR. Gli elementi funzionali qui sotto sono solo di prima parte e sono trattati come strettamente necessari per le funzionalità che usi. Il giorno in cui aggiungeremo strumenti di analisi o marketing, vedrai una vera finestra di consenso prima del loro caricamento.",
    fr: "Les éléments strictement nécessaires sont exemptés de consentement préalable en vertu du règlement 6(4) du PECR. Les éléments fonctionnels ci-dessous sont uniquement de première partie et sont traités comme strictement nécessaires aux fonctionnalités utilisées. Le jour où nous ajouterons des outils d'analyse ou de marketing, vous verrez une véritable boîte de dialogue de consentement avant leur chargement.",
  } satisfies LocalizedString,
  clearTitle: {
    en: "How to clear",
    it: "Come cancellare",
    fr: "Comment effacer",
  } satisfies LocalizedString,
  clearBody: {
    en: "You can clear any of these at any time through your browser's privacy settings. Signed-in users can also use the \"Clear local app data\" button in Settings → Your data to wipe the functional values without ending their session.",
    it: "Puoi cancellarle in qualsiasi momento dalle impostazioni privacy del browser. Gli utenti autenticati possono anche usare il pulsante \"Cancella dati locali dell'app\" in Impostazioni → I tuoi dati per eliminare i valori funzionali senza terminare la sessione.",
    fr: "Vous pouvez les effacer à tout moment via les paramètres de confidentialité de votre navigateur. Les utilisateurs connectés peuvent aussi utiliser le bouton \"Effacer les données locales de l'application\" dans Paramètres → Vos données.",
  } satisfies LocalizedString,
  thirdPartyTitle: {
    en: "Third parties",
    it: "Terze parti",
    fr: "Tiers",
  } satisfies LocalizedString,
  thirdPartyBody: {
    en: "When you purchase credits, the Paddle checkout opens in their hosted overlay. Any cookies set there are controlled by Paddle and governed by their own cookie banner inside the overlay.",
    it: "Quando acquisti crediti, il checkout di Paddle si apre nel loro overlay ospitato. Eventuali cookie impostati lì sono controllati da Paddle e regolati dal loro banner cookie all'interno dell'overlay.",
    fr: "Lorsque vous achetez des crédits, le paiement Paddle s'ouvre dans leur surcouche hébergée. Les cookies définis à cet endroit sont contrôlés par Paddle et régis par leur propre bandeau cookies à l'intérieur de la surcouche.",
  } satisfies LocalizedString,
  categoryStrictlyNecessary: {
    en: "Strictly necessary",
    it: "Strettamente necessari",
    fr: "Strictement nécessaires",
  } satisfies LocalizedString,
  categoryFunctional: {
    en: "Functional",
    it: "Funzionali",
    fr: "Fonctionnels",
  } satisfies LocalizedString,
  categoryAnalytics: {
    en: "Analytics — not in use",
    it: "Analisi — non in uso",
    fr: "Analyse — non utilisé",
  } satisfies LocalizedString,
  categoryMarketing: {
    en: "Marketing — not in use",
    it: "Marketing — non in uso",
    fr: "Marketing — non utilisé",
  } satisfies LocalizedString,
  colKey: { en: "Key", it: "Chiave", fr: "Clé" } satisfies LocalizedString,
  colStorage: { en: "Storage", it: "Archiviazione", fr: "Stockage" } satisfies LocalizedString,
  colProvider: { en: "Provider", it: "Fornitore", fr: "Fournisseur" } satisfies LocalizedString,
  colPurpose: { en: "Purpose", it: "Scopo", fr: "Finalité" } satisfies LocalizedString,
  colRetention: { en: "Retention", it: "Conservazione", fr: "Conservation" } satisfies LocalizedString,
  emptyCategory: {
    en: "We don't currently set anything in this category.",
    it: "Attualmente non impostiamo nulla in questa categoria.",
    fr: "Nous ne définissons actuellement rien dans cette catégorie.",
  } satisfies LocalizedString,
  backLink: {
    en: "Back to home",
    it: "Torna alla home",
    fr: "Retour à l'accueil",
  } satisfies LocalizedString,
  cookiesFooterLink: {
    en: "Cookies",
    it: "Cookie",
    fr: "Cookies",
  } satisfies LocalizedString,
};

export const SETTINGS_CLEAR_LOCAL = {
  title: {
    en: "Clear local app data",
    it: "Cancella dati locali dell'app",
    fr: "Effacer les données locales de l'application",
  } satisfies LocalizedString,
  body: {
    en: "Removes optional UI preferences and caches saved by this browser. Keeps you signed in.",
    it: "Rimuove le preferenze opzionali e le cache dell'interfaccia salvate in questo browser. Resti connesso.",
    fr: "Supprime les préférences et caches d'interface enregistrés par ce navigateur. Vous restez connecté.",
  } satisfies LocalizedString,
  button: {
    en: "Clear local data",
    it: "Cancella dati locali",
    fr: "Effacer les données locales",
  } satisfies LocalizedString,
  toastSuccess: {
    en: "Local app data cleared.",
    it: "Dati locali dell'app cancellati.",
    fr: "Données locales effacées.",
  } satisfies LocalizedString,
};
