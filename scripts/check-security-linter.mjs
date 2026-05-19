#!/usr/bin/env node
/**
 * Fails CI if the Supabase database linter reports any SECURITY DEFINER
 * warnings (lints 0028 and 0029, plus any future *_security_definer_* lints).
 *
 * Required environment variables:
 *   SUPABASE_ACCESS_TOKEN  Personal access token with project read access
 *   SUPABASE_PROJECT_REF   Project ref (e.g. "gidjkdtmagxuzhlntlbt")
 *
 * Exits non-zero on:
 *   - missing env vars
 *   - failed API call
 *   - one or more matching findings
 */

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;

if (!TOKEN || !REF) {
  console.error(
    "[security-linter] Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF",
  );
  process.exit(2);
}

const url = `https://api.supabase.com/v1/projects/${REF}/database/lint?type=security`;

const res = await fetch(url, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});

if (!res.ok) {
  console.error(
    `[security-linter] API call failed: ${res.status} ${res.statusText}`,
  );
  console.error(await res.text());
  process.exit(2);
}

const lints = await res.json();

// Match the SECURITY DEFINER family: 0028_anon_security_definer_function_executable,
// 0029_authenticated_security_definer_function_executable, and anything else
// containing "security_definer".
const offenders = lints.filter((l) =>
  typeof l?.name === "string" && l.name.toLowerCase().includes("security_definer"),
);

if (offenders.length === 0) {
  console.log("[security-linter] OK — no SECURITY DEFINER warnings.");
  process.exit(0);
}

console.error(
  `[security-linter] FAIL — ${offenders.length} SECURITY DEFINER warning(s):`,
);
for (const o of offenders) {
  const detail =
    o.detail ||
    o.description ||
    o.metadata?.name ||
    JSON.stringify(o.metadata ?? {});
  console.error(`  • [${o.name}] ${detail}`);
}
process.exit(1);
