/**
 * Single source of truth for every cookie / localStorage / sessionStorage
 * key set by WhatSaid in the user's browser.
 *
 * Update this file whenever you add a new persisted key. The unit test in
 * `src/test/cookie-inventory.test.ts` greps the repo for setters and fails
 * CI if a key is used but missing here.
 *
 * Categories follow ICO guidance (PECR reg. 6):
 *   - strictly_necessary: exempt from consent (auth session, security,
 *     dismissal flags for the cookie notice itself, language preference
 *     for serving the page the user asked for).
 *   - functional: first-party UX preferences (toggles, caches, hints).
 *     Currently treated as exempt — they don't track and don't leave the
 *     browser. Promoted to `requiresConsent` only if we ever start
 *     sharing them with third parties.
 *   - analytics / marketing: would require prior opt-in consent. None set
 *     today — but the consent infrastructure (`src/lib/consent.ts`) is
 *     wired so adding one flips the cookie notice into a true consent
 *     dialog automatically.
 */

export type StorageMedium =
  | "cookie"
  | "localStorage"
  | "sessionStorage";

export type StorageCategory =
  | "strictly_necessary"
  | "functional"
  | "analytics"
  | "marketing";

export interface LocalizedString {
  en: string;
  it: string;
  fr: string;
}

export interface StorageEntry {
  key: string;
  /** Match a real key by exact string OR prefix (when keys are dynamic). */
  match: "exact" | "prefix";
  storage: StorageMedium;
  category: StorageCategory;
  purpose: LocalizedString;
  provider: string;
  retention: LocalizedString;
  /** Where the key is set (file paths, relative to repo root). */
  setBy: string[];
}

const SUPABASE_AUTH: StorageEntry = {
  key: "sb-",
  match: "prefix",
  storage: "localStorage",
  category: "strictly_necessary",
  provider: "WhatSaid (via Lovable Cloud)",
  purpose: {
    en: "Keeps you signed in between visits. Stores the session token issued by our authentication system.",
    it: "Ti mantiene connesso tra una visita e l'altra. Memorizza il token di sessione rilasciato dal sistema di autenticazione.",
    fr: "Vous garde connecté entre les visites. Stocke le jeton de session émis par notre système d'authentification.",
  },
  retention: {
    en: "Until you sign out or the session expires.",
    it: "Finché non esci o la sessione scade.",
    fr: "Jusqu'à votre déconnexion ou l'expiration de la session.",
  },
  setBy: ["src/integrations/supabase/client.ts"],
};

export const STORAGE_INVENTORY: StorageEntry[] = [
  SUPABASE_AUTH,
  {
    key: "i18nextLng",
    match: "exact",
    storage: "localStorage",
    category: "strictly_necessary",
    provider: "WhatSaid",
    purpose: {
      en: "Remembers your interface language so we serve the right translation on your next visit.",
      it: "Ricorda la lingua dell'interfaccia per mostrarti la traduzione corretta alla prossima visita.",
      fr: "Mémorise la langue de l'interface pour afficher la bonne traduction à votre prochaine visite.",
    },
    retention: {
      en: "Until you clear it or change language.",
      it: "Finché non la cancelli o cambi lingua.",
      fr: "Jusqu'à ce que vous l'effaciez ou changiez de langue.",
    },
    setBy: ["src/i18n/index.ts"],
  },
  {
    key: "ws.cookie_notice_ack_v1",
    match: "exact",
    storage: "localStorage",
    category: "strictly_necessary",
    provider: "WhatSaid",
    purpose: {
      en: "Records that you have dismissed the cookie notice so we don't show it again.",
      it: "Registra che hai chiuso l'avviso sui cookie per non mostrartelo più.",
      fr: "Enregistre que vous avez fermé l'avis cookies pour ne plus l'afficher.",
    },
    retention: { en: "Persistent.", it: "Persistente.", fr: "Persistant." },
    setBy: ["src/components/CookieNotice.tsx"],
  },
  {
    key: "ws.consent_v1",
    match: "exact",
    storage: "localStorage",
    category: "strictly_necessary",
    provider: "WhatSaid",
    purpose: {
      en: "Records your choices about non-essential storage categories. Currently unused because we set no non-essential storage.",
      it: "Registra le tue scelte sulle categorie di storage non essenziali. Attualmente inutilizzato perché non impostiamo storage non essenziale.",
      fr: "Enregistre vos choix concernant les catégories de stockage non essentielles. Actuellement inutilisé car nous ne définissons aucun stockage non essentiel.",
    },
    retention: { en: "Persistent.", it: "Persistente.", fr: "Persistant." },
    setBy: ["src/lib/consent.ts"],
  },
  {
    key: "whatsaid_notification_sound_enabled",
    match: "exact",
    storage: "localStorage",
    category: "functional",
    provider: "WhatSaid",
    purpose: {
      en: "Remembers whether you want a chime when a transcription completes.",
      it: "Ricorda se desideri un suono quando termina una trascrizione.",
      fr: "Mémorise si vous souhaitez un son à la fin d'une transcription.",
    },
    retention: { en: "Persistent.", it: "Persistente.", fr: "Persistant." },
    setBy: ["src/lib/notification-sound.ts"],
  },
  {
    key: "whatsaid_browser_notifications_enabled",
    match: "exact",
    storage: "localStorage",
    category: "functional",
    provider: "WhatSaid",
    purpose: {
      en: "Remembers your browser-notification opt-in for completed jobs.",
      it: "Ricorda la tua scelta sulle notifiche del browser per i lavori completati.",
      fr: "Mémorise votre choix concernant les notifications du navigateur.",
    },
    retention: { en: "Persistent.", it: "Persistente.", fr: "Persistant." },
    setBy: ["src/lib/browser-notifications.ts"],
  },
  {
    key: "whatsaid_browser_notifications_asked",
    match: "exact",
    storage: "localStorage",
    category: "functional",
    provider: "WhatSaid",
    purpose: {
      en: "Tracks whether we have already asked you for browser-notification permission, so we don't prompt twice.",
      it: "Tiene traccia se ti abbiamo già chiesto il permesso per le notifiche, per non richiederlo due volte.",
      fr: "Indique si nous vous avons déjà demandé l'autorisation pour les notifications, afin de ne pas la redemander.",
    },
    retention: { en: "Persistent.", it: "Persistente.", fr: "Persistant." },
    setBy: ["src/lib/browser-notifications.ts"],
  },
  {
    key: "whatsaid_tag_translations_v1",
    match: "exact",
    storage: "localStorage",
    category: "functional",
    provider: "WhatSaid",
    purpose: {
      en: "Local cache of tag translations to avoid re-fetching them on every visit.",
      it: "Cache locale delle traduzioni dei tag per evitare di recuperarle ad ogni visita.",
      fr: "Cache local des traductions de tags pour éviter de les recharger à chaque visite.",
    },
    retention: {
      en: "Persistent — overwritten as new translations are cached.",
      it: "Persistente — sovrascritta man mano che vengono memorizzate nuove traduzioni.",
      fr: "Persistant — écrasé au fur et à mesure des nouvelles traductions.",
    },
    setBy: ["src/lib/tag-translation.ts"],
  },
  {
    key: "tus::",
    match: "prefix",
    storage: "localStorage",
    category: "functional",
    provider: "tus-js-client",
    purpose: {
      en: "Stores the upload URL for in-progress audio uploads so a dropped connection can resume from the last chunk.",
      it: "Memorizza l'URL di upload in corso così una connessione interrotta può riprendere dall'ultimo blocco.",
      fr: "Stocke l'URL d'envoi d'un fichier audio en cours pour reprendre après une interruption.",
    },
    retention: {
      en: "Cleared automatically when the upload finishes or is cancelled.",
      it: "Cancellato automaticamente al termine o all'annullamento dell'upload.",
      fr: "Effacé automatiquement à la fin ou à l'annulation de l'envoi.",
    },
    setBy: ["src/lib/storage-resumable-upload.ts"],
  },
  {
    key: "whatsaid.share.acceptHint.v1",
    match: "exact",
    storage: "localStorage",
    category: "functional",
    provider: "WhatSaid",
    purpose: {
      en: "Hides a one-time onboarding hint on the Share button after you have seen it.",
      it: "Nasconde un suggerimento iniziale sul pulsante Condividi dopo che lo hai visto.",
      fr: "Masque un conseil unique du bouton Partager une fois que vous l'avez vu.",
    },
    retention: { en: "Persistent.", it: "Persistente.", fr: "Persistant." },
    setBy: ["src/components/ShareButton.tsx"],
  },
  {
    key: "whatsaid.share.arrowHint.v1",
    match: "exact",
    storage: "localStorage",
    category: "functional",
    provider: "WhatSaid",
    purpose: {
      en: "Hides a one-time onboarding hint on the Share button after you have seen it.",
      it: "Nasconde un suggerimento iniziale sul pulsante Condividi dopo che lo hai visto.",
      fr: "Masque un conseil unique du bouton Partager une fois que vous l'avez vu.",
    },
    retention: { en: "Persistent.", it: "Persistente.", fr: "Persistant." },
    setBy: ["src/components/ShareButton.tsx"],
  },
  {
    key: "whatsaid.helpFaqFeedback.v1",
    match: "exact",
    storage: "localStorage",
    category: "functional",
    provider: "WhatSaid",
    purpose: {
      en: "Remembers which Help-page FAQs you have already rated, so we don't ask twice.",
      it: "Ricorda quali FAQ della pagina di Aiuto hai già valutato, per non chiedertelo di nuovo.",
      fr: "Mémorise les FAQ d'aide que vous avez déjà notées, pour ne pas vous redemander.",
    },
    retention: { en: "Persistent.", it: "Persistente.", fr: "Persistant." },
    setBy: ["src/components/help/HelpFaqFeedback.tsx"],
  },
  {
    key: "whatsaid.share.pdf.",
    match: "prefix",
    storage: "sessionStorage",
    category: "functional",
    provider: "WhatSaid",
    purpose: {
      en: "Holds a short-lived reference to a prepared share PDF so you can re-open the share dialog in the same tab without regenerating it.",
      it: "Conserva un riferimento temporaneo a un PDF condiviso già preparato, per riaprirlo nella stessa scheda senza rigenerarlo.",
      fr: "Conserve une référence temporaire à un PDF de partage déjà préparé pour le rouvrir dans le même onglet.",
    },
    retention: {
      en: "Cleared when you close the browser tab.",
      it: "Cancellato alla chiusura della scheda del browser.",
      fr: "Effacé à la fermeture de l'onglet du navigateur.",
    },
    setBy: ["src/components/ShareButton.tsx"],
  },
  {
    key: "whatsaid.invitesRedeemed.",
    match: "prefix",
    storage: "sessionStorage",
    category: "functional",
    provider: "WhatSaid",
    purpose: {
      en: "Prevents the invite-redemption check from running more than once per session.",
      it: "Evita che il controllo dei riscatti di invito venga eseguito più di una volta per sessione.",
      fr: "Évite que la vérification de redemption d'invitation ne s'exécute plus d'une fois par session.",
    },
    retention: {
      en: "Cleared when you close the browser tab.",
      it: "Cancellato alla chiusura della scheda del browser.",
      fr: "Effacé à la fermeture de l'onglet du navigateur.",
    },
    setBy: ["src/hooks/use-redeem-invites.ts"],
  },
];

export function findEntry(key: string): StorageEntry | undefined {
  return STORAGE_INVENTORY.find((e) =>
    e.match === "exact" ? e.key === key : key.startsWith(e.key),
  );
}

/**
 * Returns true the day we ship anything in the analytics or marketing
 * category. The CookieNotice reads this to decide whether to render as an
 * informational banner (today) or a true consent dialog (future).
 */
export function requiresConsent(): boolean {
  return STORAGE_INVENTORY.some(
    (e) => e.category === "analytics" || e.category === "marketing",
  );
}

export const KNOWN_KEYS = STORAGE_INVENTORY.map((e) => e.key);
