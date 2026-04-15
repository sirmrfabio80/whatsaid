
What I found

- Your sign-in account is still authenticated as `fbpetito@gmail.com`.
- The recent auth response shows:
  - `email: fbpetito@gmail.com`
  - `new_email: sirfabio@icloud.com`
  - provider = `google`
- So the app did not truly “change it back”; the primary auth email never became `sirfabio@icloud.com`. The UI let you start an email change that the Google-linked account does not actually complete the way the app currently implies.
- Security-sensitive flows are correctly using the auth/JWT email, not `profiles.email`. Changing claim/share lookup to `profiles.email` would be insecure.

Plan

1. Lock the source of truth
- Keep auth user email as the only authoritative identity for:
  - claim-share authorization
  - shared PDF access
  - invite redemption / any email-bound access checks
- Audit the remaining app code so `profiles.email` is treated as display-only metadata, not identity.

2. Fix Settings for Google-linked accounts
- Detect provider-linked users from the auth user metadata/identities.
- For Google users, remove or disable the “Change email” action.
- Replace it with clear copy explaining that the sign-in email is controlled by the Google account, so the app cannot safely switch the account identity from Settings.
- Only allow password setup / normal profile edits there.

3. Stop misleading success states
- Remove any “email updated” success path unless the live auth session actually reports the new primary email.
- If there is a pending email change value, show it only as a request state, never as the active account email.
- Make Profile and Settings consistently show the real signed-in email from auth.

4. Improve mismatch recovery on claim links
- Update the claim page so when a share was sent to a different email, it clearly shows:
  - current signed-in email
  - required recipient email
- Add recovery actions:
  - sign out and sign in with the correct account
  - create an account with the recipient email
- This removes the dead-end 403 experience.

5. Clean up the current broken UX state
- Review whether any local/profile state is still implying `sirfabio@icloud.com` is active.
- If needed, do a small data cleanup so profile email mirrors the real auth email again for consistency.
- Do not try to “fix” this by trusting profile email for authorization.

Files to update

- `src/pages/Settings.tsx`
- `src/pages/Profile.tsx`
- `src/pages/ClaimShare.tsx`
- likely small locale updates in:
  - `src/i18n/locales/en.json`
  - `src/i18n/locales/it.json`
  - `src/i18n/locales/fr.json`

Technical note

- The correct lookup column for access control is still the authenticated account email from the auth user/JWT.
- The actual bug is the product behavior around Google-linked accounts: the app offers an email-change flow that should not be presented as a real account-identity change there.

Verification

- Google-linked users no longer see a misleading email-change flow.
- Settings/Profile always show the real current auth email.
- Claim/share errors clearly explain the mismatch and offer recovery actions.
- No regression to share authorization or account security.
