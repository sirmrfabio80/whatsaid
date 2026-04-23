/**
 * Supported languages for manual override and translation targets.
 *
 * NOTE: This map is mirrored in `supabase/functions/_shared/languages.ts`
 * because edge functions cannot import from `src/`. If you add or remove
 * a language here, update that file too. The test in
 * `src/test/languages.test.ts` will fail if the keys drift.
 */
export const LANGUAGES = [
  { code: "auto", label: "Auto-detect", englishName: "Auto" },
  { code: "en", label: "English", englishName: "English" },
  { code: "es", label: "Spanish", englishName: "Spanish" },
  { code: "fr", label: "French", englishName: "French" },
  { code: "de", label: "German", englishName: "German" },
  { code: "it", label: "Italian", englishName: "Italian" },
  { code: "pt", label: "Portuguese", englishName: "Portuguese" },
  { code: "nl", label: "Dutch", englishName: "Dutch" },
  { code: "ja", label: "Japanese", englishName: "Japanese" },
  { code: "ko", label: "Korean", englishName: "Korean" },
  { code: "zh", label: "Chinese", englishName: "Chinese" },
  { code: "ar", label: "Arabic", englishName: "Arabic" },
  { code: "hi", label: "Hindi", englishName: "Hindi" },
  { code: "ru", label: "Russian", englishName: "Russian" },
  { code: "tr", label: "Turkish", englishName: "Turkish" },
  { code: "pl", label: "Polish", englishName: "Polish" },
  { code: "sv", label: "Swedish", englishName: "Swedish" },
  { code: "da", label: "Danish", englishName: "Danish" },
  { code: "fi", label: "Finnish", englishName: "Finnish" },
  { code: "no", label: "Norwegian", englishName: "Norwegian" },
  { code: "uk", label: "Ukrainian", englishName: "Ukrainian" },
  { code: "cs", label: "Czech", englishName: "Czech" },
  { code: "ro", label: "Romanian", englishName: "Romanian" },
  { code: "hu", label: "Hungarian", englishName: "Hungarian" },
  { code: "el", label: "Greek", englishName: "Greek" },
  { code: "he", label: "Hebrew", englishName: "Hebrew" },
  { code: "th", label: "Thai", englishName: "Thai" },
  { code: "vi", label: "Vietnamese", englishName: "Vietnamese" },
  { code: "id", label: "Indonesian", englishName: "Indonesian" },
  { code: "ms", label: "Malay", englishName: "Malay" },
] as const;

export function getLanguageLabel(code: string | null): string {
  if (!code) return "Unknown";
  const lang = LANGUAGES.find((l) => l.code === code);
  return lang?.label ?? code;
}

/**
 * Returns the English name for a language code (e.g. "it" -> "Italian"),
 * or null if the code is unknown or `"auto"`.
 *
 * Used by the regenerate edge function to build unambiguous translation
 * prompts. Never pass raw ISO codes to LLMs — they hallucinate scripts.
 */
export function getLanguageEnglishName(code: string | null | undefined): string | null {
  if (!code || code === "auto") return null;
  const lang = LANGUAGES.find((l) => l.code === code);
  return lang?.englishName ?? null;
}
