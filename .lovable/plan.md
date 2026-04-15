

## Refine Settings Account Email Flow

### Overview
Merge the two save actions into one, remove the auth email input from the form, detect whether the user has native email/password auth, and conditionally trigger `auth.updateUser({ email })` when appropriate.

### Changes to `src/pages/Settings.tsx`

**Remove state variables** (lines 41-43): `contactEmailSaved`, `contactEmailError`, `contactEmailLoading`, `profileSaved`, `profileError`

**Add helper**: Derive `hasEmailAuth` from `user.identities` — check if any identity has `provider === 'email'`. This is more robust than checking `app_metadata.provider` alone since a user could have both Google and email/password identities.

```typescript
const hasEmailAuth = user.identities?.some(i => i.provider === 'email') ?? false;
```

**Replace `updateProfile` mutation + `saveContactEmail`** with a single `saveChanges` mutation:
- Validate email with `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` — toast error if invalid, return early
- Call `supabase.from("profiles").update({ display_name, email })` — toast error if fails, stop
- If `hasEmailAuth` and email changed from `user.email`, also call `supabase.auth.updateUser({ email })`
  - On auth success: `toast.info(t("settings.emailConfirmRequired"))`
  - On auth failure: `toast.warning(t("settings.authEmailChangeFailed"))`
- If no auth email change needed: `toast.success(t("common.saved"))`
- Invalidate profile query

**Simplify the Account card UI** (lines 148-186):
- Remove the auth email `<Label>` + disabled `<Input>` + `<Info>` description block (lines 167-174)
- Remove the "Save email" button (line 179-181)
- Remove inline success/error spans (lines 164-165, 182-183)
- Keep one "Save changes" button calling the unified mutation
- After the save button, conditionally show a subtle sign-in email note when auth email differs from profile email:
  ```tsx
  {authEmail && contactEmail && authEmail.toLowerCase() !== contactEmail.toLowerCase() && (
    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
      <Lock className="w-3 h-3" />
      {t("settings.signedInAs", { email: authEmail })}
    </p>
  )}
  ```

**Remove unused imports**: `Mail`, `Check`, `AlertCircle`, `Info` (if no longer used elsewhere in this file — `Check` and `AlertCircle` are still used in password setup section, so keep those)

### Locale changes

**Add** to all three locale files:
- `settings.signedInAs`: "Signed in as {{email}}" / "Connesso come {{email}}" / "Connecté en tant que {{email}}"
- `settings.emailConfirmRequired`: "Check your inbox to confirm the sign-in email change." / Italian / French
- `settings.authEmailChangeFailed`: "Email updated, but sign-in email change failed. Try again later." / Italian / French

**Remove** from all three:
- `settings.saveEmail`
- `settings.savingEmail`
- `settings.contactEmailSaved`

### Files
- `src/pages/Settings.tsx`
- `src/i18n/locales/en.json`
- `src/i18n/locales/it.json`
- `src/i18n/locales/fr.json`

### Not touched
Edge functions, claim/share flows, Profile.tsx, security card, preferences card, danger zone.

