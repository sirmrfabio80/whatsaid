/**
 * UK-only region helpers.
 *
 * - `ALLOWED_COUNTRY` is the single ISO-3166-1 alpha-2 code we accept.
 * - `detectIpCountry(req)` reads best-effort, free request headers set by
 *   common edge platforms (Cloudflare, Vercel, Netlify). We do NOT call any
 *   paid geolocation API. Returns null when no header is present.
 */

export const ALLOWED_COUNTRY = "GB" as const;

export function detectIpCountry(req: Request): string | null {
  const h = req.headers;
  const cf = h.get("cf-ipcountry");
  if (cf && cf !== "XX") return cf.toUpperCase();
  const vc = h.get("x-vercel-ip-country");
  if (vc) return vc.toUpperCase();
  // Netlify: x-nf-geo is a base64-encoded JSON blob with { country: { code }}
  const nf = h.get("x-nf-geo");
  if (nf) {
    try {
      const decoded = JSON.parse(atob(nf)) as { country?: { code?: string } };
      const code = decoded?.country?.code;
      if (code) return code.toUpperCase();
    } catch {
      // ignore
    }
  }
  return null;
}

export function isAllowedCountry(code: string | null | undefined): boolean {
  return !!code && code.toUpperCase() === ALLOWED_COUNTRY;
}
