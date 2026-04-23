/**
 * Edge-side mirror of `src/lib/languages.ts`.
 *
 * Edge functions cannot import from `src/`, so we duplicate the
 * `code -> englishName` map here. Keep both files in sync — the test
 * `src/test/languages.test.ts` will fail if the key sets drift.
 *
 * Adds `LANGUAGE_SCRIPTS`, the script-family classifier used by
 * `language-validation.ts`. `auto` is intentionally excluded (it is never
 * a valid translation target).
 */

export const LANGUAGE_ENGLISH_NAMES: Record<string, string> = {
  auto: "Auto",
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ar: "Arabic",
  hi: "Hindi",
  ru: "Russian",
  tr: "Turkish",
  pl: "Polish",
  sv: "Swedish",
  da: "Danish",
  fi: "Finnish",
  no: "Norwegian",
  uk: "Ukrainian",
  cs: "Czech",
  ro: "Romanian",
  hu: "Hungarian",
  el: "Greek",
  he: "Hebrew",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
};

export type ScriptFamily =
  | "latin"
  | "cyrillic"
  | "arabic"
  | "hebrew"
  | "devanagari"
  | "greek"
  | "cjk"
  | "japanese"
  | "korean"
  | "thai";

/**
 * Expected script for each translation target. Languages that mix scripts
 * (Japanese = kana + kanji, Korean = hangul + occasional hanja) get their
 * own family so we can validate them properly.
 */
export const LANGUAGE_SCRIPTS: Record<string, ScriptFamily> = {
  en: "latin",
  es: "latin",
  fr: "latin",
  de: "latin",
  it: "latin",
  pt: "latin",
  nl: "latin",
  tr: "latin",
  pl: "latin",
  sv: "latin",
  da: "latin",
  fi: "latin",
  no: "latin",
  cs: "latin",
  ro: "latin",
  hu: "latin",
  vi: "latin",
  id: "latin",
  ms: "latin",
  ru: "cyrillic",
  uk: "cyrillic",
  ar: "arabic",
  he: "hebrew",
  hi: "devanagari",
  el: "greek",
  zh: "cjk",
  ja: "japanese",
  ko: "korean",
  th: "thai",
};

export function getEnglishName(code: string | null | undefined): string | null {
  if (!code || code === "auto") return null;
  return LANGUAGE_ENGLISH_NAMES[code] ?? null;
}
