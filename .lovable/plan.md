# Phase 4 — Cookie & Local-Storage Notice (PECR Reg. 6 + UK GDPR Art. 7)

Finalised with your answers: no analytics planned, bottom-right toast banner, full EN/IT/FR from day one (using existing i18next detection — no extra IP work), dismiss label "Got it".

## Current state (audit)

| Category | Present? | Notes |
|---|---|---|
| First-party auth token | Yes | Supabase client persists session in `localStorage` (`sb-…-auth-token`) |
| Functional `localStorage` | Yes | i18n language (`i18nextLng`), notification sound toggle, browser-notification opt-in, tag-translation cache, tus resumable-upload URLs, ShareButton UI hints |
| Functional `sessionStorage` | Yes | `useRedeemInvites` dedupe, ShareButton PDF-cache hints |
| Third-party analytics / marketing / session-replay | **None** | No GA, Plausible, PostHog, Hotjar, Meta Pixel, etc. anywhere in `src/`, `index.html`, or `public/` |
| Third-party in iframes | Paddle checkout only | Their cookies are governed by their own banner inside their overlay |

**Legal posture:** Everything we store today qualifies as strictly necessary or first-party functional under PECR reg. 6(4), so no consent gate is required. ICO guidance still requires a clear notice + maintained inventory + a consent mechanism ready before any future analytics/marketing tooling lands. This phase delivers all three, sized to today's posture.

## Deliverables

### 1. Storage inventory (single source of truth)

`src/lib/cookie-inventory.ts` — typed `STORAGE_INVENTORY` array. Each entry: `key`, `storage` (`cookie` | `localStorage` | `sessionStorage`), `category` (`strictly_necessary` | `functional` | `analytics` | `marketing`), `purpose` (localised: `{ en, it, fr }`), `provider`, `retention`, `setBy` (source file path).

Seeded from the audit above. Test `src/test/cookie-inventory.test.ts` greps the repo for `localStorage.setItem` / `sessionStorage.setItem` / `document.cookie =` and fails CI if a key appears in code but not in the inventory — prevents silent drift.

### 2. Public `/cookies` page

`src/pages/Cookies.tsx`:
- Route added to `App.tsx` (lazy-loaded like the other policy pages).
- Renders the inventory as a readable table grouped by category, headings + purpose pulled via `pickLocale` from i18n.
- Plain-English sections (translated EN/IT/FR via `i18n/locales/*.json`):
  - Why strictly necessary items don't need consent
  - How to clear them (browser instructions + link to the "Clear local app data" Settings action)
  - Explicit statement that we use **no** analytics, advertising, or session-replay tools
  - Note on Paddle's checkout iframe and its own cookie controls
- Footer link added next to Privacy / Terms.
- `usePageMeta` for canonical + meta description.

### 3. First-visit notice banner

`src/components/CookieNotice.tsx`, mounted at App root:
- Bottom-right toast-style card on ≥640 px; bottom sheet on mobile (respects `safe-area-inset-bottom`).
- Liquid-glass surface consistent with the rest of the app (subtle translucency, refined border, ≥4.5:1 text contrast in light + dark).
- Copy is informational, not a consent request:
  - EN: "WhatSaid only uses storage that's strictly necessary to keep you signed in, remember your language, and keep the app working. We don't use analytics, advertising, or tracking cookies."
  - IT and FR equivalents added to the locale files.
- Two actions: **Got it** (primary, dismisses) and **Cookie details** (link to `/cookies`).
- Language follows i18next's existing detection (localStorage → navigator). No new IP-based language code — keeps it simple as you asked.
- Dismissal flag: `localStorage` key `ws.cookie_notice_ack_v1` (itself listed in the inventory as strictly necessary preference).
- A11y: `role="region"` + `aria-label`, focus reachable via Tab, Esc dismisses, both buttons ≥44 px touch targets, no focus trap (non-modal).
- Hidden on `/cookies`, `/privacy`, `/terms` to avoid visual stacking when the user is already reading the policy.

### 4. Consent infrastructure (dormant)

`src/lib/consent.ts`:
- `ConsentCategory` type and `getConsent()` / `setConsent(cat, granted)` reading/writing one `localStorage` row (`ws.consent_v1` = JSON `{ analytics, marketing, ts, version }`).
- `useConsent()` hook re-renders on the `storage` event so multi-tab stays consistent.
- `<ConsentGate category="analytics">` wrapper component.
- `requiresConsent()` helper that scans the inventory; the banner copy + buttons automatically switch from informational to a true consent dialog the day an `analytics`/`marketing` entry is added. **No behaviour change today** — it's a 5-line flip later, not a re-architecture.

### 5. "Clear local app data" self-service

Add a small button to the existing "Your data" card in `src/pages/Settings.tsx`:
- Clears all `localStorage` + `sessionStorage` keys whose inventory entry is `functional` (preserves `strictly_necessary` auth session — signing out is separate).
- Sonner toast confirms what was cleared.
- Useful for users exercising local Art. 17 erasure intent without losing their session.

### 6. Privacy policy update

Append a short **"Cookies and similar technologies"** section to `src/pages/Privacy.tsx` (EN/IT/FR) pointing to `/cookies`, citing PECR reg. 6 + UK GDPR Art. 6(1)(f) as bases, and confirming no third-party trackers.

### 7. Dossier update

- `docs/ARCHITECTURE.md` §Privacy: one paragraph + pointer to `cookie-inventory.ts` as the canonical list.
- `WhatSaid-Architecture-Privacy-Dossier.md` Storage section: reference the new inventory and `/cookies` page; clear the "[MISSING] cookie inventory" flag from the solicitor-ready list.

## Regression / test gate

- `cookie-inventory.test.ts` — fails on undeclared storage keys.
- Vitest snapshot of the `/cookies` table render to catch accidental copy regressions.
- Manual checklist:
  - Banner appears in a clean browser (incognito).
  - "Got it" dismissal persists across reload; Esc also dismisses.
  - Banner hidden on `/cookies`, `/privacy`, `/terms`.
  - Reachable from footer link in all three languages.
  - "Clear local app data" preserves the auth session.
  - Banner copy renders correctly in EN / IT / FR (verify i18n keys present, no fallback warnings in console).
  - Light + dark mode contrast OK; keyboard tab order reaches both buttons.
  - Mobile (≤640 px) renders as bottom sheet with safe-area inset.

## Out of scope

- Server-side consent ledger (overkill while no consent is required).
- Granular per-category toggles UI — lands the day the first analytics/marketing entry enters the inventory.
- IP-based language switching for the banner — using i18next's existing detection as you requested.
