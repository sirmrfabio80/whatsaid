/**
 * Drift guard for the cookie/storage inventory.
 *
 * Greps the repo for `localStorage.setItem(...)`, `sessionStorage.setItem(...)`
 * and `document.cookie =` writes and fails if any key is not registered in
 * `STORAGE_INVENTORY`. Prevents silently introducing untracked storage.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { STORAGE_INVENTORY } from "@/lib/cookie-inventory";

const ROOT = join(__dirname, "..");
const ALLOWED_EXT = new Set([".ts", ".tsx"]);

// Files allowed to use raw storage APIs without declaring keys here:
// - the inventory itself (declares keys)
// - the supabase client (sets sb-* tokens, declared via prefix)
// - the i18n setup (i18nextLng is declared)
// - tests / setup
const FILE_ALLOWLIST = new Set<string>([
  "lib/cookie-inventory.ts",
  "lib/consent.ts", // setItem of ws.consent_v1 is declared
  "integrations/supabase/client.ts",
  "i18n/index.ts",
  "test/setup.ts",
  "test/cookie-inventory.test.ts",
  "components/settings/DataRightsCard.tsx", // bulk removeItem, no setItem
]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (ALLOWED_EXT.has("." + name.split(".").pop())) acc.push(full);
  }
  return acc;
}

const SET_RE = /(?:window\.)?(?:local|session)Storage\.setItem\s*\(\s*["'`]([^"'`]+)["'`]/g;

function isKeyDeclared(key: string): boolean {
  return STORAGE_INVENTORY.some((e) =>
    e.match === "exact" ? e.key === key : key.startsWith(e.key),
  );
}

describe("cookie/storage inventory", () => {
  it("every web storage key used in code is registered", () => {
    const offenders: { file: string; key: string }[] = [];
    const files = walk(ROOT);
    for (const f of files) {
      const rel = relative(ROOT, f);
      if (FILE_ALLOWLIST.has(rel)) continue;
      const src = readFileSync(f, "utf8");
      let m: RegExpExecArray | null;
      SET_RE.lastIndex = 0;
      while ((m = SET_RE.exec(src)) !== null) {
        const key = m[1];
        if (!isKeyDeclared(key)) offenders.push({ file: rel, key });
      }
    }
    expect(
      offenders,
      `Undeclared storage keys — add them to src/lib/cookie-inventory.ts:\n${offenders
        .map((o) => `  - ${o.key}  (${o.file})`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("no analytics or marketing entries today (would require consent UI)", () => {
    const trackers = STORAGE_INVENTORY.filter(
      (e) => e.category === "analytics" || e.category === "marketing",
    );
    expect(
      trackers,
      "If you add an analytics/marketing entry, upgrade CookieNotice into a real consent dialog first.",
    ).toEqual([]);
  });

  it("every entry has all three localised purpose strings", () => {
    for (const e of STORAGE_INVENTORY) {
      expect(e.purpose.en, e.key).toBeTruthy();
      expect(e.purpose.it, e.key).toBeTruthy();
      expect(e.purpose.fr, e.key).toBeTruthy();
      expect(e.retention.en, e.key).toBeTruthy();
      expect(e.retention.it, e.key).toBeTruthy();
      expect(e.retention.fr, e.key).toBeTruthy();
    }
  });
});
