#!/usr/bin/env node
/**
 * Phase 4 drift-guard for the Help page FAQ.
 *
 * Fails (exit 1) when a capability in docs/product/capabilities.md that is
 *   - Public copy eligible: yes
 *   - has a non-empty "FAQ seeds" line
 * is NOT referenced by at least one entry in src/content/help/faq.ts via
 * its `caps: [...]` array.
 *
 * Also fails when the FAQ file references a capability ID that doesn't
 * exist in the capabilities doc (typo guard).
 *
 * Usage:
 *   node scripts/check-help-faq-coverage.mjs
 *   node scripts/check-help-faq-coverage.mjs --doc=path/to/capabilities.md --faq=path/to/faq.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function argPath(flag, fallback) {
  const a = process.argv.find((x) => x.startsWith(`${flag}=`));
  return a ? resolve(repoRoot, a.slice(flag.length + 1)) : resolve(repoRoot, fallback);
}

const docPath = argPath("--doc", "docs/product/capabilities.md");
const faqPath = argPath("--faq", "src/content/help/faq.ts");

for (const [label, p] of [["capabilities doc", docPath], ["FAQ file", faqPath]]) {
  if (!existsSync(p)) {
    console.error(`✗ ${label} not found at ${p}`);
    process.exit(1);
  }
}

/* ------------------------------- parse caps ------------------------------- */

const docText = readFileSync(docPath, "utf8");
const docLines = docText.split(/\r?\n/);

/**
 * Walk the doc and group lines per capability heading like `#### CAP-001 — ...`.
 * For each capability, collect its bullet fields so we can read
 *   - "Public copy eligible:"
 *   - "FAQ seeds:"
 */
const capHeadingRe = /^####\s+(CAP-[A-Z0-9-]+)\b/;
const fieldRe = /^\s*-\s+\*\*([^*]+):\*\*\s*(.*)$/;

const caps = new Map(); // id -> { publicEligible: boolean, faqSeeds: string, line: number }
let current = null;

docLines.forEach((line, idx) => {
  const h = capHeadingRe.exec(line);
  if (h) {
    current = { id: h[1], publicEligible: false, faqSeeds: "", line: idx + 1 };
    caps.set(current.id, current);
    return;
  }
  if (!current) return;
  const f = fieldRe.exec(line);
  if (!f) return;
  const key = f[1].trim().toLowerCase();
  const val = f[2].trim();
  if (key === "public copy eligible") {
    current.publicEligible = /^yes\b/i.test(val);
  } else if (key === "faq seeds") {
    current.faqSeeds = val;
  }
});

if (caps.size === 0) {
  console.error(`✗ No capability blocks (#### CAP-...) found in ${docPath}.`);
  process.exit(1);
}

/* ----------------------- determine required cap IDs ----------------------- */

function hasFaqSeeds(value) {
  if (!value) return false;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "" || trimmed === "n/a" || trimmed === "none" || trimmed === "—") return false;
  return true;
}

const required = new Set();
for (const cap of caps.values()) {
  if (cap.publicEligible && hasFaqSeeds(cap.faqSeeds)) {
    required.add(cap.id);
  }
}

/* ------------------------- parse FAQ caps references ---------------------- */

const faqText = readFileSync(faqPath, "utf8");
const capRefRe = /caps\s*:\s*\[([^\]]*)\]/g;
const idRe = /["']([^"']+)["']/g;

const referenced = new Set();
let m;
while ((m = capRefRe.exec(faqText)) !== null) {
  const inner = m[1];
  let idMatch;
  while ((idMatch = idRe.exec(inner)) !== null) {
    referenced.add(idMatch[1].trim());
  }
}

/* --------------------------------- diff ---------------------------------- */

const missing = [...required].filter((id) => !referenced.has(id)).sort();
const unknown = [...referenced].filter((id) => !caps.has(id)).sort();

const docLabel = docPath.replace(repoRoot + "/", "");
const faqLabel = faqPath.replace(repoRoot + "/", "");

if (missing.length === 0 && unknown.length === 0) {
  console.log(
    `✓ FAQ coverage OK — ${required.size} public capability(ies) with FAQ seeds, all referenced in ${faqLabel}.`,
  );
  process.exit(0);
}

if (missing.length > 0) {
  console.error(
    `✗ ${missing.length} public capability(ies) with FAQ seeds are NOT covered in ${faqLabel}:\n`,
  );
  for (const id of missing) {
    const cap = caps.get(id);
    console.error(`  • ${id} (L${cap.line}) — FAQ seeds: ${cap.faqSeeds}`);
  }
  console.error(
    `\nFix: add at least one entry in ${faqLabel} whose \`caps\` array includes the capability ID.`,
  );
}

if (unknown.length > 0) {
  console.error(
    `\n✗ ${unknown.length} capability ID(s) referenced in ${faqLabel} do not exist in ${docLabel}:\n`,
  );
  for (const id of unknown) console.error(`  • ${id}`);
  console.error(
    `\nFix: correct the typo in ${faqLabel} or add the capability block to ${docLabel}.`,
  );
}

process.exit(1);
