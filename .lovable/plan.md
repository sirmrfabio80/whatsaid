
Root cause identified:

- The share flow itself is wired correctly:
  - `share-transcript-record/index.ts` creates the share and emails `/claim/:token`
  - `src/pages/ClaimShare.tsx` validates, then auto-POSTs to `claim-transcript-share`
  - `claim-transcript-share/index.ts` authorizes by comparing `auth user.email` with `transcript_shares.recipient_email`
- The 403 is caused by an email source-of-truth mismatch:
  - this share token is addressed to `sirfabio@icloud.com`
  - the recipient profile row also says `sirfabio@icloud.com`
  - but the authenticated account email is still different
- The bug comes from `src/pages/Settings.tsx`, which updates `profiles.email` immediately after `auth.updateUser({ email })`, even though the auth system may still require confirmation and has not actually switched the login email yet.

Plan

1. Fix the email source of truth
- Treat the authenticated account email as the only authoritative email for security-sensitive checks.
- Remove the optimistic `profiles.email` write from `src/pages/Settings.tsx`.
- Keep the claim/download backend checks strict; do not weaken them to trust profile email.

2. Repair the confusing account state
- Add a small database repair step to sync existing `profiles.email` values back to the real auth email for current users.
- This fixes accounts that currently look like one email in the UI while authenticating as another.

3. Tighten account UI behavior
- Update the settings flow so email-change UX reflects reality:
  - request change through auth
  - show confirmation/pending messaging
  - do not present the new email as active until auth actually reports it
- Ensure account displays prefer the real authenticated email when relevant.

4. Improve share-link error surfacing
- Update `src/pages/ClaimShare.tsx` to reliably surface the backend’s 403 message instead of leaving this as a vague failed request in the console.
- Apply the same pattern to `src/pages/SharedPdfDownload.tsx`, since it uses the same recipient-email authorization rule.

Files to touch
- `src/pages/Settings.tsx`
- `src/pages/ClaimShare.tsx`
- `src/pages/SharedPdfDownload.tsx`
- small DB migration for existing profile-email repair

Technical details
- I will not change the claim authorization rule to trust `profiles.email`, because that would let users spoof access by editing their profile email.
- The secure fix is consistency: auth email stays authoritative, profile email must mirror it instead of leading it.
- This is a small, targeted fix and does not require unrelated refactors.

Verification
- A share sent to the recipient’s real authenticated email can be claimed successfully.
- A pending/unconfirmed email change no longer makes the UI look fully switched.
- The current mismatch case produces a clear on-screen message instead of an opaque 403.
- No regression to share creation, transcript duplication, or shared PDF access.
