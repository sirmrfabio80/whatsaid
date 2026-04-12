

# Bug-Fix Plan: 5 Regressions

## Root Cause Analysis

### 1. Share popover not centered on mobile
The `PopoverContent` uses Radix UI's positioning, which anchors relative to the trigger button. On mobile, `align="center"` centers on the **trigger element**, not the viewport. Since the Share button sits inside a flex container at the right side of each tab, the popover ends up offset. The fix is to override Radix's transform-based positioning on mobile with a CSS approach that forces viewport centering.

### 2. Share emails going to Junk
The email domain (`notify.whatsaid.app`) is verified and DNS is correct. The likely spam triggers are:
- **Reply-To missing**: No `reply_to` field, which looks suspicious to spam filters
- **Subject line starts with a person's name** — can trigger personal-spam heuristics
- **No `h:Reply-To`** header — legitimate transactional emails usually have one
- The `from` address (`noreply@whatsaid.app`) is fine, but adding a Reply-To pointing to the sender's real email improves legitimacy
- Subject lines could be more professional (e.g., "Transcript shared: {title}" rather than "{name} shared a transcript: {title}")

### 3. Claim link shows 404
The `SITE_URL` constant is `https://whatsaid.lovable.app` and the claim URL is built as `${SITE_URL}/claim/${token}`. The route `/claim/:token` exists in `App.tsx`. The published URL is also `https://whatsaid.lovable.app`. The SPA fallback should serve `index.html` for `/claim/...` paths. Let me verify — the broken example link `https://whatsaid.lovable.app/claim/87da2499...` should work if the SPA is published. The issue may be that the project needs to be re-published after the `/claim/:token` route was added. However, I should also check if the route is correctly defined — it is (`<Route path="/claim/:token" element={<ClaimShare />} />`). The real issue is likely the **Login page ignoring the `redirect` query param**: after auth, the user goes to `/` instead of back to `/claim/:token`. Let me verify Login.tsx — yes, `handleLogin` always navigates to `"/"` (line 54) and `handleGoogleLogin` also redirects to `redirectAfterAuth` which is either `/pricing` or `/` — it never reads the `redirect` search param.

### 4. Login/Signup not honoring redirect param
- **Login.tsx**: Never reads `redirect` param. `handleLogin` navigates to `/`. Google OAuth `redirect_uri` is `window.location.origin` (root).
- **Signup.tsx**: Reads `redirectParam` for `emailRedirectTo` but that's for email confirmation redirect, not for post-login navigation.

### 5. Date showing wrong value
The `getEffectiveIso` function falls back to `m.created_at` when `m.recorded_at` is null. But looking at the DB query result, `recorded_at` is `2026-04-12 10:34:24+00` (UTC, no offset) while `created_at` is `2026-04-12 21:50:07+00`. The `recorded_at` value has offset `+00` (UTC). The `parseRecordedAt` function parses the offset correctly for `Z` but the DB returns `+00` format — let me check the regex. The ISO_RE handles `([+-])(\d{2}):?(\d{2})` — for `+00` without the minutes part, it would need `+00:00` or `+0000`. The string `2026-04-12 10:34:24+00` only has `+00` (2 digits, no minutes). The regex expects `(\d{2}):?(\d{2})` — two groups of 2 digits. `+00` only has one group. So `m[9]` would be undefined → `Number(undefined)` = `NaN` → offset becomes `NaN` → display breaks. This is the bug: the regex doesn't handle the PostgreSQL short offset format `+00` (without