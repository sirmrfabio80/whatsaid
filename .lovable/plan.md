

# Plan: Admin Invite Feature for WhatSaid

## Summary

Add an owner-only invite panel to the Settings page. The platform owner (Fabio) can invite users by email and gift them a credit package. Invitations are fulfilled via a `pending_invites` table with atomic, one-time-only redemption after the invited user authenticates.

---

## Architecture

```text
Settings page (admin-only card)
  ├─ Email input
  ├─ Package selector: One-time (1 credit) / 5-pack / 20-pack
  ├─ "Send invite email" → edge function → Supabase auth.admin.inviteUserByEmail
  └─ "Generate magic link" → edge function → returns URL to copy

invite-user edge function (service role)
  ├─ Validates caller is admin (has_role check)
  ├─ Creates pending_invites row
  ├─ If user already exists: adds credits immediately via add_credits RPC
  └─ If new user: leaves pending_invites unclaimed for later redemption

Redemption (client-side, after login/signup)
  └─ Settings/Profile/Convert page checks pending_invites by email
      → calls redeem-invite edge function → atomically marks claimed + adds credits
```

---

## Database changes

### 1. `pending_invites` table (migration)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| email | text NOT NULL | invited user's email |
| credits | integer NOT NULL | number of credits to grant |
| package_id | text NOT NULL | 'one-time', '5-pack', '20-pack' |
| invited_by | uuid NOT NULL | admin user_id |
| claimed | boolean NOT NULL DEFAULT false | |
| claimed_at | timestamptz | null until claimed |
| created_at | timestamptz DEFAULT now() | |

RLS:
- Service role: full access
- Admin SELECT: `has_role(auth.uid(), 'admin')`
- Authenticated SELECT on own email: `auth.jwt()->>'email' = email` (for redemption check)

### 2. Assign admin role to Fabio

A one-time data INSERT into `user_roles` using the insert tool (not a migration). Fabio's user ID will be needed — can be looked up by email from profiles table.

---

## Edge functions

### `invite-user/index.ts` (new)

- Accepts: `{ email, packageId, method: 'email' | 'magic-link' }`
- Validates JWT, checks `has_role(caller, 'admin')` via service-role client
- Maps packageId to credits: one-time=1, 5-pack=5, 20-pack=20
- Inserts into `pending_invites`
- Checks if user already exists (lookup by email in auth.admin)
  - If exists: immediately call `add_credits` RPC and mark invite as claimed
  - If not exists and method='email': `auth.admin.inviteUserByEmail(email)`
  - If not exists and method='magic-link': `auth.admin.generateLink({ type: 'magiclink', email })` and return URL
- Returns success + optional magic link URL

### `redeem-invite/index.ts` (new)

- Called by client after user authenticates
- Validates JWT (gets user email from token)
- Finds unclaimed `pending_invites` rows for that email
- Atomically: calls `add_credits` for each, sets `claimed=true, claimed_at=now()`
- Uses a SELECT ... FOR UPDATE or single UPDATE ... RETURNING to prevent double-claim
- Returns total credits granted

---

## Client changes

### `src/pages/Settings.tsx`

- Add admin role check: `supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' })`
- If admin: render "Invite Users" card with:
  - Email input
  - Package selector (dropdown with 3 options from PRICING_PRODUCTS labels)
  - "Send invite email" button
  - "Generate magic link" button → shows copyable URL on success
  - Recent invites list (query `pending_invites` table)
  - Success/error feedback

### Invite redemption hook

- A small `useRedeemInvites` hook that runs once after login
- Calls `redeem-invite` edge function
- Shows a toast if credits were granted ("You received X credits!")
- Placed in AuthContext or a layout-level component so it fires on any authenticated page load
- Runs only once per session (guard with a ref or sessionStorage flag)

### Translation files

- Add `settings.admin.*` keys in en.json, fr.json, it.json for invite UI labels

---

## Security

- Admin check is server-side in both edge functions (not just client-side)
- `has_role` is SECURITY DEFINER — no RLS recursion
- `pending_invites` locked to service_role + admin SELECT + authenticated user can only see own email rows
- Credit grants go through existing `add_credits` RPC (atomic)
- Redemption uses UPDATE with WHERE `claimed = false` to prevent double-claim
- No modification to `handle_new_user()` trigger — zero risk to signup flow

## Files changed

| File | Change |
|---|---|
| `src/pages/Settings.tsx` | Add admin invite card |
| `supabase/functions/invite-user/index.ts` | New edge function |
| `supabase/functions/redeem-invite/index.ts` | New edge function |
| `src/hooks/use-redeem-invites.ts` | New hook for post-login redemption |
| `src/contexts/AuthContext.tsx` | Wire redemption hook |
| `src/i18n/locales/en.json` | Admin invite translations |
| `src/i18n/locales/fr.json` | Admin invite translations |
| `src/i18n/locales/it.json` | Admin invite translations |
| Migration | `pending_invites` table |
| Insert | Admin role for Fabio |

## Not modified

- `handle_new_user()` — untouched
- `pricing.ts`, `paddle-pricing.ts` — untouched
- `Profile.tsx` — untouched (date fix is separate)
- No other pages or components

