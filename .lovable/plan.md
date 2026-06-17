
## Goal
Let users with the `admin` role sign in and use WhatSaid from **any country**, while keeping the strict GB-only rule for everyone else. Bypass must be enforced server-side (the source of truth), be invisible to non-admins, and be auditable.

## What already works
The two region edge functions already honour an admin bypass:
- `geo-check` — if a JWT is present and the user has `admin` role, returns `allowed: true, adminBypass: true`.
- `check-login-region` — same bypass after login.

## What's broken today
1. **Login is unreachable from abroad.** On `/login`, when `useGeoCheck` (called *before* login, with no JWT) returns `allowed: false`, the email, password, Sign-in button and Google button are all `disabled={regionBlocked}`. An admin sitting in Italy literally cannot type their email — chicken-and-egg: the bypass only activates *after* authentication, but the form blocks them *before* authentication.
2. **Session cache poisoning.** `useGeoCheck` caches the pre-login "blocked" result in `sessionStorage` under `whatsaid:geo-check:v1`. After an admin logs in, the marketing pages (Index, Pricing, Privacy) keep showing the red region banner until the tab is closed.
3. **No audit trail.** Admin geo-bypasses aren't logged anywhere, so we can't tell when/where a privileged account was used outside GB — a soft compliance gap for a UK-only product.

## Plan

### 1. Make `/login` always usable (frontend)
In `src/pages/Login.tsx`:
- Stop disabling the email/password inputs, the Sign-in button, and the Google button based on `regionBlocked`.
- Keep `<RegionBlockedNotice />` visible above the form, but reword it for the login context: explain that WhatSaid is UK-only for normal users, that admins may sign in from anywhere, and that non-admin sign-ins from outside GB will be rejected immediately after authentication.
- After a failed `check-login-region` (handled in `AuthContext`), the user is already signed out and bounced back to `/login?blocked=region` — that path is unchanged.

This single change is what actually unblocks admins abroad. Everything below is hardening.

### 2. Re-check geo on auth state change (frontend)
In `src/hooks/use-geo-check.ts`:
- Add a small `bustCache()` helper that removes the `sessionStorage` key and resets the in-flight promise.
- In `AuthProvider` (`src/contexts/AuthContext.tsx`), call `bustCache()` inside the `onAuthStateChange` listener on `SIGNED_IN` and `SIGNED_OUT`, and force a re-fetch.
- Result: as soon as an admin logs in, the marketing pages re-query `geo-check` *with* the new JWT, get `allowed: true`, and the red banner disappears across the app.

### 3. Server-side audit of admin bypass (backend)
New migration creates `public.admin_region_bypass_log`:

| column | purpose |
|---|---|
| `user_id` | the admin |
| `function_name` | `geo-check` or `check-login-region` |
| `detected_country` | what the IP resolved to |
| `ip_hash` | SHA-256 of IP + `CONSENT_IP_SALT_SECRET` (no raw IP stored) |
| `user_agent` | truncated to 255 chars |
| `created_at` | timestamp |

GRANTs: `service_role` full; `authenticated` select only via an admin-scoped RLS policy that uses the existing `private.has_role(auth.uid(), 'admin')` security-definer (matches the project's user-roles pattern). No `anon` grant.

Both `geo-check` and `check-login-region` insert one row whenever the admin bypass branch fires. Insert is fire-and-forget (`.catch(console.error)`) so a logging failure never blocks the admin.

### 4. Admin UI surfacing (frontend)
Add a small read-only "Admin region bypass" panel to the existing Admin page (likely a new tab in `src/pages/Admin.tsx` next to `EdgeHealthTab`, named `AdminBypassLogTab.tsx`). Lists the last 100 bypass events with country, timestamp, and which admin — so we have visible accountability without leaving the product.

### 5. No change to non-admin enforcement
- `validate-signup-country`, `transcribe`, `assemblyai` checks, Paddle webhook, and the strict logic in `check-login-region` for non-admins all stay exactly as they are.
- `RegionBlockedNotice` keeps its current copy on Index/Pricing/Privacy — only the Login wording is softened.

## Technical notes
- Bypass remains **role-based**, never IP/header/env-based. No dev backdoors.
- The audit log uses a hashed IP (same salt pattern as `consent.ts`) so we stay GDPR-friendly and don't store raw IPs.
- Admin bypass already returns `adminBypass: true` from the edge function — the frontend doesn't need to know, but the flag is useful for the log row and for future debugging.
- Nothing in `supabase/config.toml` changes; both functions are already deployed with the right `verify_jwt` settings.

## Files touched
- `src/pages/Login.tsx` — remove `disabled={regionBlocked}` from inputs/buttons; tweak notice copy.
- `src/hooks/use-geo-check.ts` — export `bustCache`.
- `src/contexts/AuthContext.tsx` — bust + re-fetch geo on sign-in/sign-out.
- `src/i18n/locales/{en,fr,it}.json` — adjusted `regionBlocked.*` strings for the login variant.
- `supabase/functions/geo-check/index.ts` — write audit row on admin bypass.
- `supabase/functions/check-login-region/index.ts` — write audit row on admin bypass.
- `supabase/functions/_shared/region.ts` — shared `logAdminBypass()` helper.
- New migration — `admin_region_bypass_log` table + GRANTs + RLS.
- `src/pages/Admin.tsx` + new `src/components/admin/AdminBypassLogTab.tsx`.

## Out of scope
- Per-country allow-lists or "approved travel windows" for non-admins.
- Geo-IP provider changes (still relying on Cloudflare `cf-ipcountry`).
- Any change to billing, Paddle, or transcription region checks.
