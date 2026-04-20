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

// Initial load for the detected language.
void loadLocale(i18n.language || "en");
// Load on subsequent language changes.
i18n.on("languageChanged", (lng) => {
  void loadLocale(lng);
});

export default i18n;
