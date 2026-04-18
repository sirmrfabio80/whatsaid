#!/usr/bin/env node
/**
 * Verify that every "Source files" path referenced in
 * docs/product/capabilities.md still exists on disk.
 *
 * Exits 0 when every path is present, 1 otherwise.
 *
 * Usage:
 *   node scripts/check-capabilities-sources.mjs
 *   node scripts/check-capabilities-sources.mjs --doc=path/to/file.md
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const docArg = process.argv.find((a) => a.startsWith("--doc="));
const docPath = docArg
  ? resolve(repoRoot, docArg.slice("--doc=".length))
  : resolve(repoRoot, "docs/product/capabilities.md");

if (!existsSync(docPath)) {
  console.error(`✗ Capabilities doc not found at ${docPath}`);
  process.exit(1);
}

const text = readFileSync(docPath, "utf8");
const lines = text.split(/\r?\n/);

/**
 * A "candidate" looks like a real repo path. We keep only entries that:
 *  - contain a "/" (avoid bare words like "table"),
 *  - look like a file path (slash + at least one char), or
 *  - are explicit table names (e.g. `transcribe_settings_templates` table)
 *    which we skip.
 *
 * We strip optional leading "./" and any trailing punctuation that may have
 * leaked from the markdown (commas, periods, semicolons).
 */
function looksLikePath(value) {
  if (!value.includes("/")) return false;
  // Skip URLs and protocol-ish strings.
  if (/^[a-z]+:\/\//i.test(value)) return false;
  // Skip glob-only entries (we'd have to expand them; not worth the dep).
  if (value.includes("*")) return false;
  return true;
}

function expandBraces(value) {
  // Expand a single {a,b,c} group, e.g. src/i18n/locales/{en,fr,it}.json
  const m = value.match(/^([^{]*)\{([^}]+)\}(.*)$/);
  if (!m) return [value];
  const [, pre, group, post] = m;
  return group
    .split(",")
    .map((part) => `${pre}${part.trim()}${post}`)
    .flatMap(expandBraces);
}

const sourceLineRegex = /\*\*Source files:\*\*\s*(.+?)\s*$/i;
const backtickRegex = /`([^`]+)`/g;

/** @type {Array<{ line: number; raw: string; resolved: string; exists: boolean }>} */
const results = [];

lines.forEach((line, idx) => {
  const m = sourceLineRegex.exec(line);
  if (!m) return;

  const tail = m[1];
  let bm;
  while ((bm = backtickRegex.exec(tail)) !== null) {
    const raw = bm[1].trim();
    if (!looksLikePath(raw)) continue;

    const cleaned = raw.replace(/^\.\//, "").replace(/[.,;]+$/, "");

    for (const candidate of expandBraces(cleaned)) {
      const resolved = resolve(repoRoot, candidate);
      let exists = false;
      try {
        exists = existsSync(resolved) && !!statSync(resolved);
      } catch {
        exists = false;
      }
      results.push({ line: idx + 1, raw: candidate, resolved, exists });
    }
  }
});

if (results.length === 0) {
  console.error(
    `✗ No "Source files" entries found in ${docPath} — has the format changed?`,
  );
  process.exit(1);
}

const missing = results.filter((r) => !r.exists);

if (missing.length === 0) {
  console.log(
    `✓ All ${results.length} source-file paths in ${docPath.replace(repoRoot + "/", "")} exist.`,
  );
  process.exit(0);
}

console.error(
  `✗ ${missing.length} of ${results.length} source-file paths referenced in ${docPath.replace(
    repoRoot + "/",
    "",
  )} are missing:\n`,
);
for (const m of missing) {
  console.error(`  • L${m.line}: ${m.raw}`);
}
console.error(
  "\nFix the path in docs/product/capabilities.md (or restore the file), then re-run.",
);
process.exit(1);
