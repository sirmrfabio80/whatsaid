import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
    },
  });

// Lazy-load non-English locales only when needed.
const loadLocale = async (lng: string) => {
  if (lng.startsWith("it") && !i18n.hasResourceBundle("it", "translation")) {
    const mod = await import("./locales/it.json");
    i18n.addResourceBundle("it", "translation", mod.default, true, true);
    if (i18n.language.startsWith("it")) await i18n.changeLanguage(i18n.language);
  } else if (lng.startsWith("fr") && !i18n.hasResourceBundle("fr", "translation")) {
    const mod = await import("./locales/fr.json");
    i18n.addResourceBundle("fr", "translation", mod.default, true, true);
    if (i18n.language.startsWith("fr")) await i18n.changeLanguage(i18n.language);
  }
};

// Keep <html lang> in sync with the active i18n locale (WCAG 2.2 SC 3.1.1).
const syncHtmlLang = (lng: string) => {
  if (typeof document === "undefined") return;
  const short = (lng || "en").split("-")[0];
  if (document.documentElement.lang !== short) {
    document.documentElement.lang = short;
  }
};

// Initial load for the detected language.
void loadLocale(i18n.language || "en");
syncHtmlLang(i18n.language || "en");
// Load on subsequent language changes.
i18n.on("languageChanged", (lng) => {
  void loadLocale(lng);
  syncHtmlLang(lng);
});

export default i18n;
