## Goal

Tighten the existing UK-only gate so that an unknown IP country is treated as "not allowed" at every entry point — signup, login, and OAuth — for all non-admin users. Admin bypass and the Paddle billing-country backstop stay as-is.

## How it is now (relaxed / Option A)

- `geo-check` returns `allowed = is_admin || profile_country === 'GB' || ip_country === 'GB'`. If `ip_country` is null and `profile_country === 'GB'`, the user passes.
- `validate-signup-country` requires `ip_country === 'GB' && declared === 'GB'`, so signup is already strict — no change there.
- Existing GB users travelling on networks that strip geo headers are let through on the strength of `profiles.country = 'GB'`.

## What changes (strict / Option B)

Single source of truth: `allowed = is_admin || (ip_country === 'GB' && (profile_country === null || profile_country === 'GB'))`.

That means:
- Unknown `ip_country` ⇒ blocked (unless admin).
- Known non-GB `ip_country` ⇒ blocked even if `profile_country = 'GB'`.
- Known GB `ip_country` + GB or null profile ⇒ allowed (and backfill stays).
- Admins always pass.

## Edits

1. **`supabase/functions/geo-check/index.ts`** — replace the `allowed` calculation with the strict formula above. Keep IP resolution chain (`cf-ipcountry` → `x-vercel-ip-country` → `ipapi.co` with 5s timeout). Keep the admin RPC check. Keep the backfill of `profiles.country` to `'GB'` only when `ip_country === 'GB'` and profile is null. Add a `reason` field in the response (`'admin' | 'gb_ip' | 'no_ip' | 'non_gb_ip' | 'profile_mismatch'`) to help debugging without leaking detail to the client.

2. **`supabase/functions/_shared/region.ts`** (if it holds the shared predicate) — mirror the same strict rule so any caller using the helper stays consistent.

3. **`src/hooks/use-region-check.ts`** — no logic change; it already trusts `allowed` from the edge function. Confirm the session cache key still invalidates on auth state change so a travelling user gets re-evaluated.

4. **`src/contexts/AuthContext.tsx`** — no logic change required; the existing gate already calls `geo-check` and signs out on `!allowed`. Verify `useRedeemInvites` remains gated behind `regionBlocked === false`.

5. **`src/pages/Login.tsx`** — no logic change; OAuth button stays disabled on `!allowed`. Confirm the pre-click re-check still runs before `signInWithOAuth`.

6. **`supabase/functions/paddle-webhook/index.ts`** — unchanged. Billing-country guard stays as the legal backstop.

7. **Copy** — update `RegionBlockedNotice` body to mention that users on VPNs or networks that hide location may also see this message and should contact support.

## Regression / QA checklist

Run all 10 original scenarios plus three new strict-mode cases:

- 11. UK user on a network with no geo headers and `ipapi.co` returning unknown → **blocked** (was allowed under A). RegionBlockedNotice shown; signed out if mid-session.
- 12. GB-profile user travelling on a French IP → **blocked** (was allowed under A).
- 13. Admin on a network with no geo headers → **allowed** (admin bypass).

For each scenario, verify: no `auth.users` row leakage on blocked signup, no credit redemption on blocked login, Paddle overlay still locked to GB, and `console.warn` (not `log`) on the rejection path.

## Technical notes

- The change is concentrated in one boolean expression in `geo-check`. Everything downstream already honours `allowed`.
- No DB migration. No new tables, columns, or RLS.
- No new dependencies.
- Risk: travelling GB users and privacy-proxy users will be locked out. The notice copy must point them to support so we can manually unblock or extend the policy if needed.

## Out of scope

- Allow-listing specific IP ranges or adding a manual override table.
- Changing admin bypass behaviour.
- Touching transcription, AI, or billing flows beyond the webhook guard already in place.
