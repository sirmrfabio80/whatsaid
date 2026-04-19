#!/usr/bin/env node
/**
 * Design-tokens drift guard.
 *
 * Fails (exit 1) when:
 *   1. A color CSS custom property defined in src/index.css `:root` (light)
 *      or `.dark` is NOT documented in docs/ARCHITECTURE.md, or its HSL
 *      value in the doc differs from the source.
 *   2. A font family listed first in `tailwind.config.ts → fontFamily.*`
 *      (the actual loaded/preferred family for sans/serif/mono) is NOT
 *      mentioned in docs/ARCHITECTURE.md.
 *
 * Scope: only color-like tokens (HSL triplets like "220 15% 88%") are
 * checked. Non-color tokens (e.g. --radius) are ignored.
 *
 * The doc check is intentionally lenient — it only requires the token name
 * + its current HSL value to appear *somewhere* in the doc (typically the
 * tokens table in §4.1). This catches the common drift cases (rename,
 * value change, new token added) without forcing a specific format.
 *
 * Usage:
 *   node scripts/check-design-tokens-drift.mjs
 *
 * Wire into CI via `npm run docs:check:tokens` (see package.json).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const cssPath = resolve(repoRoot, "src/index.css");
const tailwindPath = resolve(repoRoot, "tailwind.config.ts");
const docPath = resolve(repoRoot, "docs/ARCHITECTURE.md");

for (const [label, p] of [
  ["index.css", cssPath],
  ["tailwind.config.ts", tailwindPath],
  ["docs/ARCHITECTURE.md", docPath],
]) {
  if (!existsSync(p)) {
    console.error(`✗ ${label} not found at ${p}`);
    process.exit(1);
  }
}

const css = readFileSync(cssPath, "utf8");
const tw = readFileSync(tailwindPath, "utf8");
const doc = readFileSync(docPath, "utf8");

// ──────────────────────────────────────────────────────────────────────
// 1. Extract color tokens from :root and .dark blocks in index.css
// ──────────────────────────────────────────────────────────────────────

/**
 * Returns the body of the first `selector { ... }` block in the source.
 * Assumes single-level braces inside the block (true for our token blocks).
 */
function extractBlock(source, selector) {
  // Match `selector` followed by optional whitespace then `{ ... }`.
  // Use a non-greedy capture and rely on the fact that token blocks
  // contain no nested `{}`.
  const re = new RegExp(`${selector}\\s*\\{([^}]*)\\}`, "m");
  const m = source.match(re);
  return m ? m[1] : null;
}

// Match `--token-name: <value>;` where value is an HSL triplet
// like `220 15% 88%` or `0 0% 100%` (with optional leading/trailing space).
const TOKEN_RE = /--([a-z0-9-]+):\s*([0-9]+(?:\.[0-9]+)?\s+[0-9.]+%\s+[0-9.]+%)\s*;/gi;

function parseTokens(blockBody) {
  if (!blockBody) return new Map();
  const out = new Map();
  for (const m of blockBody.matchAll(TOKEN_RE)) {
    out.set(m[1], m[2].replace(/\s+/g, " ").trim());
  }
  return out;
}

const rootBody = extractBlock(css, ":root");
const darkBody = extractBlock(css, "\\.dark");

if (!rootBody || !darkBody) {
  console.error("✗ Could not locate `:root` or `.dark` blocks in src/index.css");
  process.exit(1);
}

const lightTokens = parseTokens(rootBody);
const darkTokens = parseTokens(darkBody);

// Tokens to check = union of both (a token only in light is still drift-worthy).
const allTokenNames = new Set([...lightTokens.keys(), ...darkTokens.keys()]);

// ──────────────────────────────────────────────────────────────────────
// 2. Verify each color token is documented in ARCHITECTURE.md
// ──────────────────────────────────────────────────────────────────────

const missing = [];
const valueDrift = [];

// The doc summarises certain token families instead of listing each one:
//   • Every `--x-foreground` is implied by its `--x` row ("paired foreground
//     variants follow each").
//   • `--sidebar-*` is treated as a reserved mirror set — only required to
//     be acknowledged once.
// We honour those conventions to avoid forcing noisy doc updates, while
// still failing on truly new / renamed / value-changed primary tokens.
const sidebarMentioned = /--sidebar-\*/.test(doc) || doc.includes("sidebar");

function isExempt(name) {
  if (name.endsWith("-foreground")) {
    const base = name.slice(0, -"-foreground".length);
    // Exempt only if the paired base token is documented.
    if (allTokenNames.has(base) && doc.includes(`--${base}`)) return true;
  }
  if (name.startsWith("sidebar-") && sidebarMentioned) return true;
  return false;
}

for (const name of allTokenNames) {
  if (isExempt(name)) continue;
  const tokenRef = `--${name}`;
  if (!doc.includes(tokenRef)) {
    missing.push(tokenRef);
    continue;
  }
  // Verify each value (light + dark) is present somewhere in the doc.
  const light = lightTokens.get(name);
  const dark = darkTokens.get(name);
  if (light && !doc.includes(`\`${light}\``)) {
    valueDrift.push(`${tokenRef} (light) → expected \`${light}\` in docs`);
  }
  if (dark && !doc.includes(`\`${dark}\``)) {
    valueDrift.push(`${tokenRef} (dark)  → expected \`${dark}\` in docs`);
  }
}

// ──────────────────────────────────────────────────────────────────────
// 3. Extract preferred font families from tailwind.config.ts
// ──────────────────────────────────────────────────────────────────────

/**
 * Pull the first quoted string from each `fontFamily.<key>` array.
 * That first entry is the loaded/preferred family — what users actually see.
 */
function extractPreferredFamilies(source) {
  const ffMatch = source.match(/fontFamily\s*:\s*\{([\s\S]*?)\n\s*\},/);
  if (!ffMatch) return new Map();
  const body = ffMatch[1];
  const out = new Map();
  // Each key looks like:   sans: [\n  "Inter",\n  ...\n],
  const keyRe = /(\w+)\s*:\s*\[\s*"([^"]+)"/g;
  for (const m of body.matchAll(keyRe)) {
    out.set(m[1], m[2]);
  }
  return out;
}

const families = extractPreferredFamilies(tw);
const missingFamilies = [];

for (const [key, family] of families) {
  // System-stack fonts (mono) start with `ui-` — skip; they're the OS default.
  if (family.startsWith("ui-")) continue;
  if (!doc.includes(family)) {
    missingFamilies.push(`fontFamily.${key} → "${family}" not mentioned in docs`);
  }
}

// ──────────────────────────────────────────────────────────────────────
// 3b. Extract type-scale tokens from tailwind.config.ts → fontSize
// ──────────────────────────────────────────────────────────────────────

/**
 * Parse `fontSize: { ... }` block. Each entry looks like:
 *   display: ["2.25rem", { lineHeight: "1.05", letterSpacing: "-0.02em", fontWeight: "600" }],
 *   body: ["0.9375rem", { lineHeight: "1.6", letterSpacing: "0" }],
 * We capture the token name, size, and (optional) lineHeight + fontWeight.
 * fontWeight defaults to "400" when absent (Tailwind body convention).
 */
function extractTypeScale(source) {
  const block = source.match(/fontSize\s*:\s*\{([\s\S]*?)\n\s{6}\},/);
  if (!block) return new Map();
  const body = block[1];
  const out = new Map();
  // Match:  name: ["size", { ... }],   — name may be quoted ("body-sm")
  const entryRe =
    /(?:"([\w-]+)"|([\w-]+))\s*:\s*\[\s*"([^"]+)"\s*(?:,\s*\{([^}]*)\})?\s*\]/g;
  for (const m of body.matchAll(entryRe)) {
    const name = m[1] || m[2];
    const size = m[3];
    const meta = m[4] || "";
    const lh = (meta.match(/lineHeight\s*:\s*"([^"]+)"/) || [])[1] || null;
    const fw = (meta.match(/fontWeight\s*:\s*"([^"]+)"/) || [])[1] || "400";
    out.set(name, { size, lineHeight: lh, fontWeight: fw });
  }
  return out;
}

const typeScale = extractTypeScale(tw);
const typeScaleProblems = [];

if (typeScale.size === 0) {
  typeScaleProblems.push("Could not parse fontSize block in tailwind.config.ts");
}

// Restrict the doc search to the §4.2 Typography section so a stray
// number elsewhere in the doc doesn't accidentally satisfy a check.
function extractDocSection(docText, headingRe, nextHeadingRe) {
  const startMatch = docText.match(headingRe);
  if (!startMatch) return null;
  const startIdx = startMatch.index + startMatch[0].length;
  const rest = docText.slice(startIdx);
  const endMatch = rest.match(nextHeadingRe);
  return endMatch ? rest.slice(0, endMatch.index) : rest;
}

const typographySection = extractDocSection(
  doc,
  /^### 4\.2 Typography\s*$/m,
  /^### 4\.\d/m,
);

if (typeScale.size > 0 && !typographySection) {
  typeScaleProblems.push(
    "Could not locate `### 4.2 Typography` section in docs/ARCHITECTURE.md",
  );
}

if (typographySection) {
  for (const [name, { size, lineHeight, fontWeight }] of typeScale) {
    // 1. Token name must be referenced (backtick-wrapped to avoid
    //    accidental prose matches like "body" appearing in sentences).
    if (!typographySection.includes(`\`${name}\``)) {
      typeScaleProblems.push(
        `fontSize.${name} → token name not listed in §4.2 type-scale table`,
      );
      continue;
    }
    // 2. Size value must appear somewhere in §4.2.
    if (!typographySection.includes(size)) {
      typeScaleProblems.push(
        `fontSize.${name} → size "${size}" not present in §4.2 (drift)`,
      );
    }
    // 3. lineHeight value must appear (when defined in source).
    if (lineHeight && !typographySection.includes(lineHeight)) {
      typeScaleProblems.push(
        `fontSize.${name} → lineHeight "${lineHeight}" not present in §4.2 (drift)`,
      );
    }
    // 4. fontWeight: only enforce when explicitly set in source AND
    //    not the implicit body default. Doc is allowed to summarise
    //    weight per row; we just check the value appears.
    if (fontWeight && fontWeight !== "400" && !typographySection.includes(fontWeight)) {
      typeScaleProblems.push(
        `fontSize.${name} → fontWeight "${fontWeight}" not present in §4.2 (drift)`,
      );
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// 4. Report
// ──────────────────────────────────────────────────────────────────────

const problems = [
  ...missing.map((t) => `Missing token in docs: ${t}`),
  ...valueDrift,
  ...missingFamilies,
  ...typeScaleProblems,
];

if (problems.length > 0) {
  console.error("✗ Design-tokens drift detected — docs/ARCHITECTURE.md is out of sync:\n");
  for (const p of problems) console.error(`  • ${p}`);
  console.error(
    "\nUpdate docs/ARCHITECTURE.md (§4.1 color tokens / §4.2 typography incl. type scale) to match the current source, or revert the source change.",
  );
  process.exit(1);
}

console.log(
  `✓ Design-tokens in sync — ${allTokenNames.size} color tokens, ${families.size} font families, and ${typeScale.size} type-scale tokens verified against docs/ARCHITECTURE.md`,
);
