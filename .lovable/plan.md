

# Plan: Fix Share Emails — Sender Identity, Canonical URL, and Auth Redirect

## Summary

Fix three issues: (1) emails using stale auth email instead of profile email/display name, (2) claim link using wrong domain causing 404, (3) Login/Signup not honoring `?redirect=` param so claim flow breaks after auth.

## Changes

### 1. Update `share-transcript` edge function
- Fetch sender profile (`display_name`, `email`) from `profiles` table using `user.id`
- Use display name first in email copy: "Shared by **Fabio Petito** via WhatSaid" (with email as secondary/fallback)
- Fallback order: `profiles.display_name` → `profiles.email` → `user.email` → `"someone"`
- Change `SITE_URL` from `'https://whatsaid.app'` to `'https://whatsaid.lovable.app'` (canonical production URL, single constant)
- Update subject line to use display name instead of raw email

### 2. Update `share-transcript-record` edge function
- Same sender profile fetch and display name priority
- Change `SITE_URL` from `'https://whatsaid.lovable.app'` — already correct, but ensure consistency
- Update email body: "**Fabio Petito** shared a transcript with you" instead of raw email
- Update subject line: "Fabio Petito shared a transcript with you: Title"
- Update plain text fallback similarly

### 3. Create shared constant file `supabase/functions/_shared/constants.ts`
- Export `SITE_NAME = 'WhatSaid'` and `SITE_URL = 'https://whatsaid.lovable.app'`
- Export `SENDER_DOMAIN = 'notify.whatsaid.app'` and `FROM_DOMAIN = 'whatsaid.app'`
- Both share functions import from this single source of truth — no more drift

### 4. Update `Login.tsx` — honor `?redirect=` param
- Read `redirect` from `searchParams`
- After successful password login: `navigate(redirect || redirectAfterAuth)`
- For Google OAuth: pass `redirect_uri` that preserves the redirect param (use `window.location.origin + (redirect || '/')`)

### 5. Update `Signup.tsx` — honor `?redirect=` param
- Read `redirect` from `searchParams`
- Set `emailRedirectTo` to include the redirect path so email confirmation returns to `/claim/:token`
- On success screen "Go to Sign In" button: preserve redirect param in link to `/login`

### 6. Redeploy edge functions
- Deploy `share-transcript`, `share-transcript-record`, `claim-transcript-share`

## Files modified
- `supabase/functions/_shared/constants.ts` (new)
- `supabase/functions/share-transcript/index.ts`
- `supabase/functions/share-transcript-record/index.ts`
- `src/pages/Login.tsx`
- `src/pages/Signup.tsx`

## Not modified
- `ClaimShare.tsx` — already correctly passes redirect params
- `claim-transcript-share/index.ts` — already fetches sender profile for validation page
- Database schema — no changes needed

