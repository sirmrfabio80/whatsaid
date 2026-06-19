/**
 * Pure helper that detects whether a URL represents a Supabase password
 * recovery callback. Extracted so it can be unit-tested without a browser.
 *
 * Supabase has three callback shapes in the wild:
 *   - Implicit:  https://app/reset-password#access_token=...&type=recovery
 *   - Explicit:  https://app/reset-password?type=recovery
 *   - PKCE:      https://app/reset-password?code=<otp>
 */
export interface RecoveryDetection {
  hasRecoveryHash: boolean;
  hasRecoveryQuery: boolean;
  pkceCode: string | null;
  isRecovery: boolean;
}

export function detectRecoveryFromUrl(href: string): RecoveryDetection {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { hasRecoveryHash: false, hasRecoveryQuery: false, pkceCode: null, isRecovery: false };
  }

  const hash = url.hash || "";
  const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const params = url.searchParams;

  const hasRecoveryHash =
    hash.includes("type=recovery") || hashParams.has("access_token");
  const hasRecoveryQuery =
    params.get("type") === "recovery" || params.has("code");
  const pkceCode = params.get("code");

  return {
    hasRecoveryHash,
    hasRecoveryQuery,
    pkceCode,
    isRecovery: hasRecoveryHash || hasRecoveryQuery,
  };
}
