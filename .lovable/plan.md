

# Plan: Fix Invite Credit Redemption + Invited User Password Setup (Revised)

## Summary

Fix three bugs in the invite redemption flow and add a smooth password-setup onboarding for invited users, using a persistent `needs_password_setup` flag on the `profiles` table.

---

## Bug fixes

### 1. `redeem-invite` edge function: replace broken `getClaims()` with `getUser()`

`getClaims(token)` is not a standard Supabase JS v2 method — it silently fails, returning 401. Credits are never granted.

**Fix**: Replace with `userClient.auth.getUser()` which reliably returns `user.id` and `user.email`.

### 2. `useRedeemInvites` must refresh credit balance after redemption

Currently the hook never calls `refreshCredits()`. The balance loads as 0 on initial auth, then the async redemption completes but the UI never updates.

**Fix**: Accept an `onCreditsRedeemed` callback. AuthContext passes `refreshCredits` to it.

### 3. Edge function also sets `needs_password_setup = true` on profile

When credits are successfully redeemed (meaning this is an invited user's first login), the edge function sets `profiles.needs_password_setup = true` using the admin client. This provides the persistent signal for onboarding routing.

---

## Password setup onboarding

### Persistent flag: `needs_password_setup` on `profiles`

**Migration**: Add column `needs_password_setup boolean NOT NULL DEFAULT false` to `profiles`.

This flag is:
- Set to `true` by the `redeem-invite` edge function after successful credit redemption
- Checked by the client on every auth state change (via profile query that AuthContext already does)
- Cleared to `false` after the user successfully sets a password

This survives page refreshes, app reopens, and mobile browser restarts — no reliance on URL hash or session state.

### New page: `/set-password` (`SetPassword.tsx`)

A clean, branded welcome page:
- Heading: "Welcome to WhatSaid"
- Subtext: "You're all set! Set a password so you can sign in anytime."
- Two password fields + "Set password" button
- "Skip for now" link — clearly communicates the user can continue using the app and set a password later from Settings
- On success: clears `needs_password_setup` flag, redirects to home, shows success toast
- On skip: redirects to home (flag remains true, Settings will show the prompt)

### Routing logic in `AuthContext`

After user loads and profile is fetched:
- If `profile.needs_password_setup === true` and current path is not `/set-password`, redirect to `/set-password`
- This works on fresh page loads, reopens, and across sessions — no URL hash dependency

### "Set password" in Settings

When `needs_password_setup` is true, show a prominent card in Settings: "Set your password" with the same form inline. On success, clear the flag. This ensures users who skipped the initial prompt always have a clear path.

The existing "Change password" dialog in Settings remains for users who already have a password.

---

## Files changed

| File | Change |
|---|---|
| `supabase/functions/redeem-invite/index.ts` | Fix `getClaims` → `getUser()`, set `needs_password_setup = true` on profile after redemption |
| `src/hooks/use-redeem-invites.ts` | Add `onCreditsRedeemed` callback, call it after success |
| `src/contexts/AuthContext.tsx` | Pass `refreshCredits` to hook, add redirect logic based on `needs_password_setup` from profile |
| `src/pages/SetPassword.tsx` | New — welcome + set password page |
| `src/pages/Settings.tsx` | Show "Set password" card when `needs_password_setup` is true |
| `src/App.tsx` | Add `/set-password` route |
| `src/i18n/locales/en.json` | New keys for set-password page |
| `src/i18n/locales/fr.json` | New keys |
| `src/i18n/locales/it.json` | New keys |
| Migration | Add `needs_password_setup` column to `profiles` |

## Not modified

- `invite-user/index.ts`, `AdminInviteCard.tsx`, `handle_new_user()` — untouched
- Pricing, export, transcript editing — untouched

