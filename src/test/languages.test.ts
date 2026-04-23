import { describe, it, expect } from "vitest";
import { LANGUAGES } from "@/lib/languages";

// Mirror of the edge map. Keep in sync with
// supabase/functions/_shared/languages.ts.
// We can't import from supabase/functions in the Vitest project, so we
// hard-code the expected key set and assert it matches the frontend.
const EDGE_LANGUAGE_CODES = new Set([
  "auto", "en", "es", "fr", "de", "it", "pt", "nl", "ja", "ko", "zh", "ar", "hi", "ru", "tr",
  "pl", "sv", "da", "fi", "no", "uk", "cs", "ro", "hu", "el", "he", "th", "vi", "id", "ms",
]);

describe("languages map sync", () => {
  it("frontend LANGUAGES code set matches edge LANGUAGE_ENGLISH_NAMES", () => {
    const frontendCodes = new Set(LANGUAGES.map((l) => l.code));
    expect(frontendCodes).toEqual(EDGE_LANGUAGE_CODES);
  });

  it("every entry has an englishName", () => {
    for (const lang of LANGUAGES) {
      expect(lang.englishName, `missing englishName for ${lang.code}`).toBeTruthy();
    }
  });
});
