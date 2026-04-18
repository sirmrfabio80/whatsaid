/**
 * Picks the localized string for the active UI language.
 * Falls back to EN only as a defensive measure when a key is genuinely missing —
 * not as a launch strategy. All long-form Help content ships in EN/IT/FR together.
 */
export type Locale = "en" | "it" | "fr";
export type Localized = { en: string; it?: string; fr?: string };

export function pickLocale(field: Localized | string, language: string | undefined): string {
  if (typeof field === "string") return field;
  const lang = (language ?? "en").slice(0, 2).toLowerCase() as Locale;
  return field[lang] ?? field.en;
}
