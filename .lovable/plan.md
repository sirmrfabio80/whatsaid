

## Fix Claim Flow: Privacy & Correctness

### Summary
Remove all recipient-email disclosure from frontend and backend. Remove client-side email mismatch gating so the backend is the sole authority on claim access. Add profile email uniqueness validation. Fix SITE_URL domain.

### Changes

**1. `supabase/functions/_shared/constants.ts`**
- Change `SITE_URL` from `'https://whatsaid.lovable.app'` to `'https://whatsaid.app'`

**2. `supabase/functions/validate-profile-email/index.ts`** (new)
- Auth-required edge function accepting `{ email: string }`
- Uses service role to check if any *other* user has that email in `profiles.email` or `auth.users`
- Returns `{ available: true/false }` — never reveals who or where
- Generic CORS headers

**3. `src/pages/Settings.tsx`**
- Before updating `profiles.email`, call `validate-profile-email`
- If `available: false`, set `emailError` to `t("settings.emailUnavailable")` and block save
- No other Settings UI changes

**4. `supabase/functions/claim-transcript-share/index.ts`**
- **GET handler (line 55)**: Remove `recipientEmail` from response — return only `{ title, senderEmail, expired, alreadyClaimed }`
- **POST handler (line 122-123)**: Replace `"This transcript was shared with ${share.recipient_email}..."` with `"You don't have access to this transcript."`

**5. `supabase/functions/download-shared-pdf/index.ts`**
- **Line 92**: Replace `"This PDF was shared with ${share.recipient_email}..."` with `"You don't have access to this PDF."`

**6. `src/pages/ClaimShare.tsx`**
- Remove `"emailMismatch"` from `ClaimStatus` union
- Remove `recipientEmail` from `ShareInfo` interface
- Remove client-side mismatch check (lines 65-72) — if authenticated, always set `"ready"` and let POST decide
- Remove entire mismatch UI block (lines 190-216)
- Remove `handleSwitchAccount` and `handleCreateRecipientAccount` functions
- Remove unused imports (`LogOut`, `AlertTriangle` if no longer used)
- When POST returns non-OK, show `t("claim.noAccess")` as errorMsg

**7. Locale files (`en.json`, `it.json`, `fr.json`)**
- **Add**:
  - `claim.noAccess`: "You don't have access to this transcript. Make sure you're signed in with the correct account." / IT / FR equivalents
  - `settings.emailUnavailable`: "This email cannot be used right now." / IT / FR equivalents
- **Remove**: `mismatchTitle`, `mismatchDesc`, `mismatchSignedInAs`, `mismatchSharedWith`, `switchAccount`, `createAccountForEmail`

### Implementation order
1. Constants fix (SITE_URL)
2. New `validate-profile-email` edge function
3. Settings uniqueness check
4. Backend privacy fixes (claim-transcript-share + download-shared-pdf)
5. ClaimShare.tsx frontend cleanup
6. Locale updates
7. Deploy edge functions: `validate-profile-email`, `claim-transcript-share`, `download-shared-pdf`

### Edge cases to test
1. Google-auth user with matching `profiles.email` → auto-claims successfully
2. Auth email mismatch but profile email matches → claims successfully
3. Both emails mismatch → generic 403, no email leaked
4. Unauthenticated → sign-in prompt, no recipient shown
5. Already-claimed share → generic error
6. Expired share → generic error
7. Profile email change to in-use email → blocked with generic message

### Not touched
- `share-transcript-record`, `share-transcript` edge functions (they create shares, don't validate claims)
- Profile.tsx, security card, preferences card, danger zone
- No schema migration needed

### Note on confirmed vs pending profile email
The `profiles` table has no `email_confirmed_at` column. Profile email changes take effect immediately. With uniqueness validation added, this is acceptable for now. A confirmed-email model would be a separate follow-up if needed.

