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
// 4. Report
// ──────────────────────────────────────────────────────────────────────

const problems = [...missing.map((t) => `Missing token in docs: ${t}`), ...valueDrift, ...missingFamilies];

if (problems.length > 0) {
  console.error("✗ Design-tokens drift detected — docs/ARCHITECTURE.md is out of sync:\n");
  for (const p of problems) console.error(`  • ${p}`);
  console.error(
    "\nUpdate docs/ARCHITECTURE.md (§4.1 color tokens / §4.2 typography) to match the current source, or revert the source change.",
  );
  process.exit(1);
}

console.log(
  `✓ Design-tokens in sync — ${allTokenNames.size} color tokens and ${families.size} font families verified against docs/ARCHITECTURE.md`,
);
