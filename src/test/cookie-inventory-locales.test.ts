/**
 * PECR / cookie-inventory locale parity guard.
 *
 * Every entry in STORAGE_INVENTORY must declare `purpose` and `retention`
 * in all three supported UI languages (en, it, fr). Missing or empty
 * translations would surface as broken strings on the public /cookies
 * page — that page is the user-facing PECR transparency notice.
 */
import { describe, it, expect } from "vitest";
import { STORAGE_INVENTORY } from "@/lib/cookie-inventory";

const LOCALES = ["en", "it", "fr"] as const;

describe("cookie inventory locale parity (PECR)", () => {
  for (const entry of STORAGE_INVENTORY) {
    for (const loc of LOCALES) {
      it(`${entry.key} has non-empty purpose.${loc}`, () => {
        const v = entry.purpose[loc];
        expect(typeof v).toBe("string");
        expect(v.trim().length).toBeGreaterThan(0);
      });
      it(`${entry.key} has non-empty retention.${loc}`, () => {
        const v = entry.retention[loc];
        expect(typeof v).toBe("string");
        expect(v.trim().length).toBeGreaterThan(0);
      });
    }
  }
});
