## UK-only restriction — implementation plan

Given your decision not to pay for an IP geolocation service and to lean on Paddle billing country as the strongest legal guard, the architecture shifts slightly from the brief: **declared country at signup + immutable `profiles.country` + Paddle GB billing country** become the authoritative legal gates. IP is a best-effort *additional* signal (free request headers only — never a paid API) used to raise the bar on signup, but never the sole gate.

### Layered enforcement summary

```text
                         ┌─────────────────────────────────────────┐
Layer 1  Signup      →   declared = GB  AND  IP-header ≠ non-GB    │  edge fn: validate-signup-country
Layer 2  Login       →   admin  OR  profiles.country = GB           │  edge fn: check-login-region
Layer 3  Checkout    →   Paddle customer.address.countryCode='GB'   │  paddle-checkout.ts
Layer 4  Webhook     →   reject if customer.address.country_code≠GB │  paddle-webhook (no credits granted)
Layer 5  DB trigger  →   profiles.country immutable once set        │  BEFORE UPDATE trigger
```

Layer 3 + 4 are the legal backstop: even if a non-GB user slips past signup, **no credits can ever be granted**, so no transcription can ever occur. That is the core compliance guarantee.

---

### 1. Migration

Single migration, idempotent:

- `ALTER TABLE public.profiles ADD COLUMN country TEXT` with check `country ~ '^[A-Z]{2}$'`.
- Index `profiles(country)` for admin queries.
- BEFORE UPDATE trigger `lock_profile_country()`:
  - Service-role bypass (mirrors existing `lock_jobs_billing_columns` pattern).
  - If `OLD.country IS NOT NULL AND NEW.country IS DISTINCT FROM OLD.country` → `RAISE EXCEPTION 'profiles.country is immutable'`.
- Update `handle_new_user()` to read `NEW.raw_user_meta_data->>'country'` and insert into `profiles.country` (NULL if absent — keeps existing OAuth path working until backfilled on first login).

No grants change (column inherits existing profile policies).

### 2. Edge functions

Two new functions, both in `supabase/config.toml` with `verify_jwt = false` (we validate JWT in code where present).

**`geo-check`** — best-effort IP country lookup, no external API.
- Request: `GET` (no body). Optional `Authorization: Bearer <jwt>`.
- Resolution chain, first hit wins, fail-closed:
  1. `cf-ipcountry` header
  2. `x-vercel-ip-country` header
  3. `x-nf-geo` (Netlify, parsed JSON) — defensive, free
  4. None → return `{ country: null, allowed: false, reason: 'unknown' }`
- If JWT present and valid and user has `admin` role via `has_role` → `allowed: true, adminBypass: true`.
- Response: `{ country: string|null, allowed: boolean, adminBypass?: boolean, reason?: string }`.
- 5s hard timeout, CORS open, never throws to the client.

**`validate-signup-country`** — server-side signup gate.
- Request: `POST { declaredCountry: string }`.
- Reads the same IP headers as `geo-check`.
- Rules:
  - `declaredCountry !== 'GB'` → `{ allowed: false, reason: 'declared_not_gb' }`.
  - IP header present AND value `!== 'GB'` → `{ allowed: false, reason: 'ip_not_gb' }`.
  - IP header absent → allow (declared+billing will still catch). This is the practical concession to having no paid IP service.
  - Otherwise → `{ allowed: true, country: 'GB' }`.
- Response also returns `country: 'GB'` to be stored in `raw_user_meta_data.country` so `handle_new_user` picks it up.

**`check-login-region`** — post-login gate.
- Request: `POST` with Bearer JWT (required, validate via `getClaims`).
- Logic: load user's `profiles.country` and `has_role(uid, 'admin')`.
  - admin → allow.
  - `profiles.country = 'GB'` → allow.
  - `profiles.country IS NULL` → call IP header chain. If `'GB'` → backfill `profiles.country='GB'` via service-role client and allow. Else → deny + set `profiles.country` to detected ISO-2 (or `'XX'` sentinel if unknown) so future logins are fast.
  - `profiles.country != 'GB'` → deny.
- Response: `{ allowed: boolean, reason?: 'region_blocked'|'unknown' }`.

All three use `corsHeaders` from `npm:@supabase/supabase-js@2/cors`. No external HTTP calls anywhere.

### 3. Frontend changes

**`src/lib/countries.ts`** — full ISO-3166-1 alpha-2 list with English names for the `<Select>`. Plain data, no logic.

**`src/components/RegionBlockedNotice.tsx`** — thin wrapper around existing `Alert`/`AlertTitle`/`AlertDescription` from `src/components/ui/alert.tsx`. Variant `destructive`. Body: short message + mailto support link. No new primitive.

**`src/hooks/use-region-check.ts`** — calls `geo-check` on mount, returns `{ loading, allowed, country }`. Used by Login to optionally show a soft warning (does NOT block — the real gate is post-login).

**`src/pages/Signup.tsx`**
- Add required `<Select>` for country, defaulting to GB, placed directly above the password field.
- On submit, call `validate-signup-country` BEFORE `supabase.auth.signUp`. If denied → render `<RegionBlockedNotice />` and abort.
- On the Google OAuth button click handler: call `validate-signup-country` first. If denied, show notice and **return early — do not call `lovable.auth.signInWithOAuth`** (critical: gate runs before the redirect leaves the SPA).
- On successful validation, pass `options: { data: { country: 'GB' } }` to `signUp` so `handle_new_user` stores it.
- For OAuth signups we cannot inject metadata pre-redirect; `country` will be NULL after first OAuth signup and the post-login `check-login-region` backfills it via the IP header path. If IP isn't GB, the user is blocked and signed out.

**`src/pages/Login.tsx`**
- No declared-country input.
- Show `<RegionBlockedNotice />` when `?blocked=region` is in the URL.
- Google OAuth button: no pre-gate needed (post-login check handles it), but keep the same pattern for consistency — call `geo-check` first; if it returns `allowed:false` AND we have no session yet, show a soft warning but still allow attempt (admin override path).

**`src/contexts/AuthContext.tsx`**
- Add `regionBlocked: boolean` and `regionChecking: boolean` to context value.
- In the `onAuthStateChange` handler, when a new `user` appears, set `regionChecking=true` and call `check-login-region`.
- If `allowed=false`: set `regionBlocked=true`, call `supabase.auth.signOut()`, then `navigate('/login?blocked=region')`. **Do this before any other effect can observe `user`.**
- Gate `useRedeemInvites`: change the existing call site from `useRedeemInvites(user)` to `useRedeemInvites(regionBlocked || regionChecking ? null : user)` (or whatever the hook signature is — adjust to skip when not allowed). This guarantees no invite/credit side-effects for blocked users.

### 4. Paddle changes

**`src/lib/paddle-checkout.ts`** — when calling `Paddle.Checkout.open`, add to the items/customer payload:
```ts
customer: { address: { countryCode: 'GB' } }
```
This locks Paddle's checkout UI to GB billing only — the user cannot select another country. (Note: Paddle v2 uses `customer.address.countryCode`, not a top-level `customerCountry`.)

**`supabase/functions/paddle-webhook/index.ts`** — after signature verification, before `add_credits`:
```ts
const billingCountry = event.data?.customer?.address?.country_code
  ?? event.data?.billing_details?.address?.country_code;
if (billingCountry !== 'GB') {
  // log to email_send_log or a new audit table, do NOT credit
  return new Response(JSON.stringify({ ignored: 'non_gb_billing' }), { status: 200, headers: corsHeaders });
}
```
Return 200 so Paddle does not retry. Admins are **not** exempt at this layer.

### 5. Manual QA checklist (run before publish)

1. New user, UK IP (CF header `GB`), declared GB → signup succeeds, `profiles.country='GB'`.
2. New user, UK IP, declared FR → blocked with "declared_not_gb" notice; no auth.users row created.
3. New user, US IP, declared GB → blocked with "ip_not_gb"; no auth.users row.
4. New user, IP header missing, declared GB → signup succeeds (concession); blocked at Paddle checkout.
5. Existing user with `profiles.country=NULL`, UK IP → login succeeds, country backfilled to `'GB'`.
6. Existing user with `profiles.country=NULL`, non-UK IP → blocked, signed out, redirected to `/login?blocked=region`, country stored as detected code so future attempts are fast.
7. Existing non-GB user (already backfilled) → blocked immediately on login, no `useRedeemInvites` call fires.
8. Admin account from non-UK IP → login allowed (admin bypass), purchase still blocked at Paddle.
9. GB-resident user travelling abroad (US IP, `profiles.country='GB'`) → login allowed.
10. Paddle checkout: country selector locked to GB; webhook with simulated FR billing country → no credits granted, transaction logged.

### Open question for you to decide before build

The brief says signup requires **both** IP=GB AND declared=GB. Without a paid IP service, ~30–40% of UK users will hit no IP header on Vite/Lovable infra. Two options:
- **A (recommended, matches your "billing is the real gate" stance):** if IP header is absent, allow signup; rely on Paddle GB billing for the legal compliance.
- **B (strict):** if IP header is absent, block signup with "we couldn't verify your region, please contact support". Cleaner legally, locks out some real UK users.

I've drafted the plan for option **A**. Tell me if you want **B** and I'll tighten `validate-signup-country` accordingly before we start building.