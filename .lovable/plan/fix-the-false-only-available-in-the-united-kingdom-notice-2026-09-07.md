# Fix the false "only available in the United Kingdom" notice

## What's happening

The notice is not about your account — you are right that you never signed in. Before the login form loads, the app asks the backend "which country is this visitor in?". I called that check just now and it answered: country unknown.

The reason: the location check reads a country header that the hosting platform in front of our backend does not actually set, so it is always empty. The check is written to fail closed — unknown means blocked — so **every visitor**, in the UK or not, sees the region notice on the home, login, signup and pricing pages.

Confirmed by a live call to the check: `{"country": null, "allowed": false, "reason": "unknown"}`.

## The fix

1. **Resolve the visitor's country properly.** Keep reading the platform header when present, and when it is missing fall back to a free IP-to-country lookup (server-side only, IP never stored, result cached briefly). If both are unavailable, treat the location as simply unknown rather than "outside the UK".

2. **Stop the notice appearing when the location is genuinely unknown.** Public pages (home, login, signup, pricing) show the notice only when we positively know the visitor is outside the UK. Unknown location shows nothing.

3. **Keep the real gates strict.** Sign-up, sign-in and checkout continue to enforce UK-only server-side, as today, so nothing gets weaker: an unknown location still cannot complete signup or payment; it just no longer shouts at legitimate UK visitors browsing the site.

4. **Verify.** Re-run the check and load the login page to confirm the notice is gone for a UK connection, and confirm a simulated non-UK connection still sees it.

## Technical notes

- `supabase/functions/_shared/region.ts`: extend `detectIpCountry` into an async resolver — headers first (`cf-ipcountry`, `x-vercel-ip-country`, `x-nf-geo`), then a fallback lookup keyed on the forwarded IP; return `null` only when both fail.
- `supabase/functions/geo-check/index.ts`: keep admin bypass; return `{ allowed: true, reason: "unknown" }` semantics separated from `region_blocked` so the client can distinguish "unknown" from "known non-GB".
- `src/hooks/use-geo-check.ts` / `Login.tsx`, `Signup.tsx`, `Index.tsx`, `Pricing.tsx`: render `RegionBlockedNotice` only for `reason === "region_blocked"` / `ip_not_gb` / `declared_not_gb`, never for `unknown`.
- `validate-signup-country` and `check-login-region` keep failing closed on unknown (no change to their strictness).
