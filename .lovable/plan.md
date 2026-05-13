## Problem

For long files, the flow runs ~2.5 min of in-browser audio enhancement before calling `resumableUpload`. Inside `resumableUpload`, `supabase.auth.getSession()` returns no `access_token`, so it throws `Not authenticated — cannot upload`. The user is in fact logged in (the earlier `jobs` insert succeeded with `user.id`) — the session simply isn't being recovered reliably at that point (likely a stale/expired in-memory session after long CPU work, or storage read returning null in the iframe context).

We need the upload to use a guaranteed-fresh access token.

## Fix

Make `resumableUpload` resilient to a missing/stale session, and pass the already-known auth context from the caller as a fallback.

### 1. `src/lib/storage-resumable-upload.ts`
- Replace the single `getSession()` with a small helper that:
  1. Calls `supabase.auth.getSession()`.
  2. If `access_token` is missing, calls `supabase.auth.refreshSession()` and retries.
  3. If still missing, throws the clear `Not authenticated — cannot upload` error (same message, so existing UI copy still applies).
- Refresh the access token inside `onBeforeRequest` of the TUS upload as well, so each chunk request uses the latest token (defends against token rotation mid-upload on very long files).

### 2. `src/pages/Convert.tsx`
- Before calling `resumableUpload`, do a defensive `await supabase.auth.getSession()` and, if missing, `await supabase.auth.refreshSession()`. If both fail, surface a friendly toast (`convert.sessionExpired`) and route the user to `/login` instead of throwing the cryptic upload error.
- No change to enhancement, job-insert, or post-upload logic.

### 3. i18n (en/fr/it)
- Add `convert.sessionExpired` string: "Your session expired during processing. Please sign in again to upload."

## Out of scope
- Audio enhancement pipeline, TUS chunk size, retry policy.
- Guest flow (this code path is logged-in only).
- Backend / edge functions.

## Verification
- Re-upload the same 40-min `.m4a`. Confirm no "Not authenticated" error and the file uploads after enhancement completes.
- Sign out mid-enhancement (manual test) → expect the friendly session-expired toast and redirect, not the raw error.
