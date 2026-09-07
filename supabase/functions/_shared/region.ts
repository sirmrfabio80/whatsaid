/**
 * UK-only region helpers.
 *
 * - `ALLOWED_COUNTRY` is the single ISO-3166-1 alpha-2 code we accept.
 * - `detectIpCountry(req)` reads best-effort, free request headers set by
 *   common edge platforms (Cloudflare, Vercel, Netlify). We do NOT call any
 *   paid geolocation API. Returns null when no header is present.
 * - `logAdminBypass()` records each time an admin signs in from outside GB
 *   so we have an auditable trail. Failures are swallowed — logging must
 *   never block the admin.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

/** In-memory, short-lived IP→country cache (per isolate). */
const ipCountryCache = new Map<string, { code: string | null; at: number }>();
const IP_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Best-effort IP→country lookup used only when no platform geo header is
 * present (the Supabase edge runtime does not set one). Free endpoint, no
 * API key, no persistence of the IP — only the resulting country code is
 * cached in memory for a few minutes.
 */
async function lookupCountryByIp(ip: string): Promise<string | null> {
  const cached = ipCountryCache.get(ip);
  if (cached && Date.now() - cached.at < IP_CACHE_TTL_MS) return cached.code;

  let code: string | null = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country/`, {
      signal: ctrl.signal,
      headers: { "User-Agent": "whatsaid-region-check" },
    });
    clearTimeout(timer);
    if (res.ok) {
      const text = (await res.text()).trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(text)) code = text;
    }
  } catch {
    // network/timeout — treat as unknown
  }

  ipCountryCache.set(ip, { code, at: Date.now() });
  return code;
}

/**
 * Authoritative country resolution: platform header first, then a free
 * IP lookup fallback. Returns null only when both are unavailable.
 */
export async function resolveRequestCountry(req: Request): Promise<string | null> {
  const header = detectIpCountry(req);
  if (header) return header;
  const ip = detectIp(req);
  if (!ip || isPrivateIp(ip)) return null;
  return await lookupCountryByIp(ip);
}

function isPrivateIp(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}

export function isAllowedCountry(code: string | null | undefined): boolean {
  return !!code && code.toUpperCase() === ALLOWED_COUNTRY;
}


function detectIp(req: Request): string | null {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("cf-connecting-ip") || h.get("x-real-ip") || null;
}

async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Fire-and-forget audit insert. Only call this when the admin bypass
 * branch actually fired (i.e. user_id resolved to an admin AND the
 * detected country is non-GB or unknown — i.e. they wouldn't have been
 * allowed without their role).
 */
export async function logAdminBypass(
  req: Request,
  userId: string,
  functionName: string,
  detectedCountry: string | null,
): Promise<void> {
  try {
    // Only audit cases where the bypass actually mattered — admins
    // connecting from GB don't need to clutter the log.
    if (detectedCountry && isAllowedCountry(detectedCountry)) return;

    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;

    const salt = Deno.env.get("CONSENT_IP_SALT_SECRET") || "";
    const ip = detectIp(req);
    const ipHash = ip && salt ? await hashIp(ip, salt) : null;
    const ua = (req.headers.get("user-agent") || "").slice(0, 255) || null;

    const admin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await admin.from("admin_region_bypass_log").insert({
      user_id: userId,
      function_name: functionName,
      detected_country: detectedCountry,
      ip_hash: ipHash,
      user_agent: ua,
    });
  } catch (err) {
    console.error("[logAdminBypass] failed", err);
  }
}
