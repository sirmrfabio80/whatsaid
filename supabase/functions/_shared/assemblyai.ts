/**
 * Single source of truth for the AssemblyAI base URL.
 *
 * WhatSaid is a UK-only deployment. AssemblyAI requests MUST go to the EU
 * datacenter. This constant is the only AssemblyAI host string allowed in
 * the repository — every edge function that talks to AssemblyAI imports it
 * from here. There is no override, no env-var fallback, no US endpoint.
 */
export const ASSEMBLYAI_EU_BASE_URL = "https://api.eu.assemblyai.com/v2";

/**
 * Hostnames that are permitted for AssemblyAI traffic. Only the EU
 * datacenter is allowed; api.assemblyai.com (US) and any other region
 * are explicitly rejected.
 */
const ALLOWED_ASSEMBLYAI_HOST = "api.eu.assemblyai.com";

export class AssemblyAIRegionViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssemblyAIRegionViolation";
  }
}

/**
 * Runtime guard: throws a clear, admin-facing error if the supplied URL
 * is not on the EU AssemblyAI host. This protects against accidental
 * regressions (a hardcoded US URL, an env override, a misconfigured
 * template) routing UK user audio outside the EU.
 *
 * Call this immediately before every AssemblyAI fetch, or — preferred —
 * use `assemblyAIFetch` which calls it for you.
 */
export function assertAssemblyAIUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AssemblyAIRegionViolation(
      `[ADMIN] AssemblyAI region guard: invalid URL "${url}". ` +
        `All AssemblyAI calls must use ${ASSEMBLYAI_EU_BASE_URL}.`,
    );
  }

  if (parsed.protocol !== "https:") {
    throw new AssemblyAIRegionViolation(
      `[ADMIN] AssemblyAI region guard: non-HTTPS protocol "${parsed.protocol}" ` +
        `for ${url}. All AssemblyAI calls must use ${ASSEMBLYAI_EU_BASE_URL}.`,
    );
  }

  if (parsed.host !== ALLOWED_ASSEMBLYAI_HOST) {
    throw new AssemblyAIRegionViolation(
      `[ADMIN] AssemblyAI region guard: blocked request to "${parsed.host}". ` +
        `WhatSaid is EU-only — only ${ALLOWED_ASSEMBLYAI_HOST} is permitted. ` +
        `Fix the caller to use ASSEMBLYAI_EU_BASE_URL (${ASSEMBLYAI_EU_BASE_URL}).`,
    );
  }
}

/**
 * Boot-time assertion: confirms the shared constant itself has not been
 * tampered with. Import this module from any AssemblyAI-using edge
 * function and the check runs once at cold start.
 */
assertAssemblyAIUrl(ASSEMBLYAI_EU_BASE_URL);

/**
 * Wrapper around `fetch` that enforces the EU host on every AssemblyAI
 * request. Use this in place of `fetch(...)` for all AssemblyAI calls.
 */
export async function assemblyAIFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();
  assertAssemblyAIUrl(url);
  return await fetch(url, init);
}
