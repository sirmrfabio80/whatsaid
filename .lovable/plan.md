

# Revised Plan: Dedicated Pricing Page

## Summary

Create a new `/pricing` page with outcome-focused messaging, Paddle-ready localized pricing architecture, and a purchase-intent signup flow. Remove all guest pricing references. Leave `src/lib/pricing.ts` shared logic untouched.

---

## Key changes from previous plan

1. **Paddle localization**: No currency-to-country mapping. The hook will call `Paddle.PricePreview()` with Paddle's own auto-detected address context as the primary path. Manual currency override will pass `currencyCode` directly to Paddle's API — not a fake country mapping. When Paddle.js is not yet loaded, fall back to base GBP prices.

2. **"Production-ready architecture"**: All references use this phrasing since Paddle.js, client-side token, and real Price IDs are not yet wired. The code will be structured so plugging in real IDs and loading Paddle.js completes the integration with no structural changes.

3. **Guest pricing removal**: `guestPriceForDuration` in `src/lib/pricing.ts` is defined but never imported anywhere else. It will be removed (along with its JSDoc comment). No other files reference it. The old `CREDIT_PACKS` constant and `creditsForDuration` remain untouched — they are used by `Credits.tsx`, `Convert.tsx`, etc. The new pricing page will define its own product list independently.

4. **Purchase-intent signup flow**: CTA buttons for unauthenticated users will route to `/signup?intent=purchase&product=<id>` (or `/login?intent=purchase&product=<id>` for existing users). The Signup/Login pages will detect the `intent` query param and show contextual copy like "Create your account to complete your purchase" instead of the generic form. After successful auth, redirect to `/credits` (or future checkout) with the product context preserved.

5. **No modification to shared pricing logic**: `CREDIT_PACKS`, `creditsForDuration`, `formatDuration`, `MAX_FILE_SIZE`, etc. all stay exactly as they are. The pricing page defines its own `PRICING_PRODUCTS` array with the new GBP base prices (£4.99, £14.99, £39.99) and Paddle Price ID placeholders.

---

## New files

### `src/lib/paddle-pricing.ts`
- `PRICING_PRODUCTS` array: 3 products (one-time, 5-pack, 20-pack) each with `{ id, paddlePriceId: string | null, basePrice: number, currency: 'GBP' }` and feature lists
- `usePaddlePricing(currencyOverride?: 'GBP' | 'USD' | 'EUR')` hook:
  - If Paddle.js is loaded and Price IDs are set: call `Paddle.PricePreview({ items })` with auto-detected locale as default, or with explicit `currencyCode` if user manually overrides
  - Returns `{ prices, loading, currency, isLocalized }` — where `isLocalized` indicates whether Paddle data was used or GBP fallback
  - If Paddle is unavailable: return base GBP prices formatted via `Intl.NumberFormat`
  - No fake FX conversion anywhere
- Typed interfaces for all structures

### `src/pages/Pricing.tsx`
Seven sections as specified in the original brief:

1. **Hero** — headline, subheadline, CTAs ("Get started" → signup with intent, "See pricing options" → anchor scroll)
2. **Value grid** — 5 outcome-focused cards (transcript, summary, questions, downloads, saved history)
3. **Pricing cards** — 3 cards consuming `usePaddlePricing`, currency toggle (GBP/USD/EUR), "Most popular" badge on 5-pack, subtle Paddle disclaimer
4. **Account/trust section** — why account is required, fast creation, persistent access
5. **How it works** — 3 steps
6. **FAQ** — 6 items in accordion
7. **Final CTA**

CTA behavior:
- Authenticated users → placeholder checkout action (ready for Paddle wiring)
- Unauthenticated users → `/signup?intent=purchase&product=one-time|5-pack|20-pack`

---

## Modified files

### `src/App.tsx`
- Add `<Route path="/pricing" element={<Pricing />} />`

### `src/components/Navbar.tsx`
- Change `/#pricing` links to `/pricing` (desktop + mobile, 2 locations)

### `src/pages/Index.tsx`
- Change `#pricing` anchor CTA to `/pricing` link
- Change footer `#pricing` link to `/pricing`

### `src/pages/Login.tsx` and `src/pages/Signup.tsx`
- Read `intent` and `product` from URL search params
- When `intent=purchase`: show contextual heading ("Create your account to complete your purchase"), and after successful auth redirect to `/credits` (or `/pricing`) with product context instead of `/`

### `src/lib/pricing.ts`
- Remove only `guestPriceForDuration` function (lines 10-16). Nothing else changes.

### Translation files (`en.json`, `it.json`, `fr.json`)
- Add `pricing.*` namespace keys for all page content

---

## Not modified

- `CREDIT_PACKS`, `creditsForDuration`, `formatDuration`, file validation — all untouched
- `Credits.tsx` — untouched (it continues using old `CREDIT_PACKS` for logged-in users)
- No database changes, no edge functions, no Paddle SDK installation
- No other pages or components

---

## Technical notes

- Currency selector is a UI-only toggle that passes `currencyCode` to the Paddle hook — it does not imply a country
- Initial render always shows base GBP (stable, no flicker), then enhances with Paddle localized data if available
- Skeleton loading states on price values only (not entire cards) during Paddle fetch
- All Paddle logic isolated in `paddle-pricing.ts` — zero leakage into other components

