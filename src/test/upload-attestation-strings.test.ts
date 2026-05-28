import { describe, expect, it } from "vitest";
import {
  LAWFUL_BASES,
  UPLOAD_ATTESTATION_STRINGS_BY_LOCALE,
  UPLOAD_ATTESTATION_VERSION,
  getUploadAttestationStrings,
} from "@/lib/upload-attestation-strings";

describe("upload-attestation strings", () => {
  it("pins the consent version so audit rows can be reproduced", () => {
    expect(UPLOAD_ATTESTATION_VERSION).toBe("1.0.0");
  });

  it("provides EN/IT/FR copy with the same shape", () => {
    const locales = ["en", "it", "fr"] as const;
    for (const l of locales) {
      const s = UPLOAD_ATTESTATION_STRINGS_BY_LOCALE[l];
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.intro.length).toBeGreaterThan(0);
      expect(s.acknowledgeLawful.length).toBeGreaterThan(0);
      expect(s.acknowledgeArt14.length).toBeGreaterThan(0);
      expect(s.confirm.length).toBeGreaterThan(0);
      expect(s.cancel.length).toBeGreaterThan(0);
      for (const b of LAWFUL_BASES) {
        expect(s.basisOptions[b], `${l}.${b}`).toBeTruthy();
      }
    }
  });

  it("each locale mentions Article 14 in its acknowledgement clause", () => {
    expect(UPLOAD_ATTESTATION_STRINGS_BY_LOCALE.en.acknowledgeArt14).toMatch(/Article 14/);
    expect(UPLOAD_ATTESTATION_STRINGS_BY_LOCALE.it.acknowledgeArt14).toMatch(/art\. 14/);
    expect(UPLOAD_ATTESTATION_STRINGS_BY_LOCALE.fr.acknowledgeArt14).toMatch(/article 14/i);
  });

  it("falls back to English for unknown locales", () => {
    expect(getUploadAttestationStrings("zz").title).toBe(
      UPLOAD_ATTESTATION_STRINGS_BY_LOCALE.en.title,
    );
    expect(getUploadAttestationStrings(undefined).title).toBe(
      UPLOAD_ATTESTATION_STRINGS_BY_LOCALE.en.title,
    );
  });
});
