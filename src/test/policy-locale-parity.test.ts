import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en.json";
import it from "@/i18n/locales/it.json";
import fr from "@/i18n/locales/fr.json";

type Dict = Record<string, unknown>;

function collectKeys(obj: Dict, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...collectKeys(v as Dict, key));
    } else {
      out.push(key);
    }
  }
  return out.sort();
}

describe("Policy locale parity (Phase 7)", () => {
  for (const ns of ["privacy", "terms"] as const) {
    it(`it.${ns} has the same key shape as en.${ns}`, () => {
      const a = collectKeys((en as Dict)[ns] as Dict);
      const b = collectKeys((it as Dict)[ns] as Dict);
      expect(b).toEqual(a);
    });

    it(`fr.${ns} has the same key shape as en.${ns}`, () => {
      const a = collectKeys((en as Dict)[ns] as Dict);
      const b = collectKeys((fr as Dict)[ns] as Dict);
      expect(b).toEqual(a);
    });
  }

  it("UK-only solicitor markers are present in en.privacy", () => {
    const blob = JSON.stringify((en as Dict).privacy);
    for (const marker of [
      "UK GDPR",
      "Data Protection Act 2018",
      "ICO",
      "Article 6(1)(b)",
      "Article 14",
      "AssemblyAI",
      "Paddle",
      "United Kingdom",
    ]) {
      expect(blob).toContain(marker);
    }
  });

  it("Reg. 37 and CRA 2015 carve-outs are present in en.terms", () => {
    const blob = JSON.stringify((en as Dict).terms);
    for (const marker of [
      "Consumer Contracts Regulations 2013",
      "Regulation 37",
      "Consumer Rights Act 2015",
      "England and Wales",
      "Paddle.com Market Limited",
    ]) {
      expect(blob).toContain(marker);
    }
  });
});
