

# Plan: Paddle Compliance Pages, Footer, and Trust Links

## Summary

Rewrite Privacy and Terms content to reference Paddle correctly, create a Refund Policy page, add a global Footer component visible on all pages, enhance Pricing with trust/consent notes, and keep all legal pages in English only (no mixed-language fallbacks).

## What exists now

- `/pricing`, `/privacy`, `/terms` pages exist with good structure
- Privacy references "Paddle — payment processing (merchant of record)" but inconsistently; Terms say "non-refundable" without linking a refund policy
- No `/refund-policy` page
- Footer only exists inline in `Index.tsx` — other pages have no footer
- No support email shown anywhere
- Signup already has a terms checkbox linking Terms and Privacy
- No consent line near purchase CTAs on Pricing page

## Changes

### 1. New `src/components/Footer.tsx`

Extract and enhance the footer from `Index.tsx` into a shared component. Add columns:
- **Product**: Convert, Pricing, Sign in
- **Legal**: Terms, Privacy, Refund Policy
- **Support**: support email (`support@whatsaid.app` placeholder), operator line
- Bottom bar: copyright + "Audio deleted after processing"

### 2. Add Footer globally in `App.tsx`

Render `<Footer />` after `<Routes>` so it appears on every page. Remove inline footer from `Index.tsx`.

### 3. New `/refund-policy` route and page

`src/pages/RefundPolicy.tsx` — same layout pattern as Privacy/Terms. Sections:
- Refund approach summary
- How to request a refund (contact support email)
- Refund window and criteria
- When refunds may not apply (e.g. processing already started)
- Duplicate/technical failure handling
- Statutory consumer rights preserved
- "Payments are processed securely by Paddle, our merchant of record."

### 4. Rewrite Privacy content (`en.json` keys)

Update `privacy.*` keys to:
- Replace "Stripe" with Paddle using the approved wording: "Payments are processed securely by Paddle, our merchant of record."
- Add clearer data categories, legal basis section, retention details
- Add support email for privacy requests
- Add governing jurisdiction placeholder

### 5. Rewrite Terms content (`en.json` keys)

Expand from 11 to ~14 sections:
- Add operator identity with `[OPERATOR_NAME]` placeholder
- Add digital delivery / fulfilment section
- Add refund section that links to `/refund-policy`
- Add Paddle merchant of record statement
- Add intellectual property section
- Add service availability / changes
- Add governing law (England and Wales)
- Update contact section with support email
- Use approved Paddle wording throughout

### 6. Enhance Pricing page

Add after the pricing cards disclaimer:
- Trust/support line: "Need help? Contact support@whatsaid.app" with links to Terms and Refund Policy
- Consent line near CTAs: "By purchasing, you agree to our Terms and Refund Policy." (linked, elegant, not intrusive)
- Subtle note: "Payments are processed securely by Paddle, our merchant of record."

### 7. Language handling for legal pages

Legal pages will use English-only content. The `en.json` keys will be comprehensive. For `fr.json` and `it.json`, add only the new structural keys (footer, nav labels) — legal content keys will fall back to English via i18next's `fallbackLng: "en"` which is already configured. No mixed-language pages.

## Files changed

| File | Change |
|---|---|
| `src/components/Footer.tsx` | New — shared footer with compliance links |
| `src/pages/Index.tsx` | Remove inline footer, use shared Footer |
| `src/pages/RefundPolicy.tsx` | New — refund policy page |
| `src/pages/Privacy.tsx` | Restructure sections for expanded content |
| `src/pages/Terms.tsx` | Restructure sections for expanded content |
| `src/pages/Pricing.tsx` | Add trust/support section and consent line |
| `src/App.tsx` | Add `/refund-policy` route, render Footer globally |
| `src/i18n/locales/en.json` | Rewrite privacy/terms keys, add refund/footer/support keys |
| `src/i18n/locales/fr.json` | Add footer/nav keys only (legal content falls back to EN) |
| `src/i18n/locales/it.json` | Add footer/nav keys only (legal content falls back to EN) |

## Not modified

- Payment/checkout logic, edge functions, database, auth — untouched
- Pricing card structure and Paddle integration code — untouched
- Navbar — untouched

## Placeholders to replace before Paddle submission

- `[OPERATOR_NAME]` — your legal name or business name (appears in Terms and Footer)
- `support@whatsaid.app` — confirm or replace with real support email
- Governing law jurisdiction — defaults to England and Wales

