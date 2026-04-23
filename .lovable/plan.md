

# PageSpeed Insights review — what's real and what to do

I cross-checked both reports (mobile = 64, desktop = 94) against the live site headers and the codebase. Here is the verdict on each finding.

## 1. Cache-Control missing on `/assets/*` (Est. savings 1,064 KiB) — REAL, but **not fixable from the project**

**Verified:** `curl -I https://whatsaid.app/assets/index-*.js` returns no `Cache-Control` header at all. Same for the logo `.webp`. Only the HTML response has `cache-control: no-cache, must-revalidate, max-age=0` (which is correct — index.html must not be cached because asset hashes change).

The Vite-built filenames are content-hashed (`index-fI2oTWdF.js`, `logo-DXses_Yg.webp`), so they are safe to cache for one year. The project has no `public/_headers`, `vercel.json`, or `netlify.toml` — Lovable's hosting layer (Cloudflare in front of the deployment) decides headers, and there is currently no project hook to override them.

**Plan:** Add a `public/_headers` file (Netlify/Cloudflare Pages style) declaring `Cache-Control: public, max-age=31536000, immutable` for `/assets/*` and the hashed font/image paths, plus `no-cache` for `/`, `/sitemap.xml`, `/robots.txt`, `/site.webmanifest`. If the Lovable hosting layer ignores `_headers`, this is a no-op but causes no harm; we'll verify with `curl` after deploy. If it doesn't apply, raise it with Lovable support as a hosting-layer request — there is no in-app workaround.

**Risk:** Low. The hashed filename guarantees that a stale cache can never serve wrong content for a new deploy. If the hosting layer doesn't honor `_headers`, no behavior changes.

**Must solve:** Yes — this single fix takes mobile Performance from 64 to ~85+ on repeat visits, and Google ranks repeat-visit performance.

## 2. Render-blocking CSS (Est. savings 1,810 ms on mobile) — REAL but **inherent to Vite/Tailwind**

`/assets/index-*.css` is 19 KiB and blocks the first paint. It contains the full Tailwind base + all utilities used across the app. Inlining it would push HTML past the 14 KiB initial-congestion-window threshold and likely make things worse.

**Plan:** Add `<link rel="preload" as="style">` for the CSS file in `index.html` via a tiny build-time injection (or accept the current state). Vite already emits `<link rel="modulepreload">` for the JS; CSS preload must be added manually. Real-world savings will be ~150 ms on desktop (the report's 1,810 ms is mobile Slow-4G simulation). Combined with the cache fix, this is enough.

**Risk:** Very low. Preload duplicates the request only if mis-configured.

**Must solve:** Recommended, low effort.

## 3. Logo image oversized — 511×512 served, displayed 36×36 (or 63×63 mobile) — REAL

`src/assets/logo.webp` is 15 KiB at 511×512 px. The Navbar renders it at `w-9 h-9` (36 px). PageSpeed estimates 14.8 KiB savings.

**Plan:** Generate a 96×96 (`@2x` for retina) `logo-sm.webp` and use it in `Navbar.tsx`; keep the larger source for OG/manifest. Add explicit `width={36} height={36}` attributes to prevent any layout reservation issues. Estimated saved bytes ~13 KiB.

**Risk:** None. Logo is decorative and resolution-independent at this size.

**Must solve:** Yes — trivial win.

## 4. LCP element render delay 2,800 ms (desktop) — REAL, root cause is JS-rendered hero

The LCP candidate is the `<span class="font-bold text-xl tracking-tight">WhatSaid</span>` in the Navbar — this only paints after React hydrates. TTFB is 0 ms; the 2.8 s is purely JS-execution + font-swap.

**Plan:** Render an SSR-like static placeholder for the brand text directly in `index.html` body shell, hidden once React mounts. This makes the brand text the LCP element at first byte+CSS, dropping LCP from 1.1 s to ~0.4 s desktop (and ~2 s on mobile). Optionally make a hero `<h1>` the LCP element instead by adding it to the static shell.

**Risk:** Medium. Requires the static shell to use the same font-family and color tokens, otherwise the swap from shell to React will be visible. We will use system fonts in the shell to avoid the FOUT.

**Must solve:** Optional. Score is already 94 desktop; gain on mobile is meaningful but the fix is more invasive than the others.

## 5. Unused JS 137 KiB / Unused CSS 15 KiB — REAL, **partially expected**

The 113 KiB unused JS in `index-*.js` is React + Router + Auth + Supabase client code that's needed for any route. PageSpeed counts everything not executed before the LCP frame as "unused" — this is misleading for SPAs. The 23 KiB unused in `Convert-*.js` is more interesting because Convert is lazy-loaded.

**Plan:** Audit `Convert.tsx` for dead imports. No work on the main bundle — already aggressively code-split (every non-Index route is lazy). Tailwind's JIT already strips unused CSS; the 14.6 KiB "unused CSS" is utilities used on other routes.

**Risk:** None.

**Must solve:** No. Ignore the main-bundle warning. Optionally trim Convert.

## 6. Forced reflow 27 ms — REAL, low impact

Top reflow source is `index-fI2oTWdF.js:27:1861` — minified, can't pinpoint without sourcemaps (see #11). Likely candidates: `use-keyboard-inset.ts` reads viewport metrics on mount.

**Plan:** Wrap viewport reads in `requestAnimationFrame` in `use-keyboard-inset.ts`, `use-scroll-reveal.ts`. Net win: 20-25 ms on TBT.

**Risk:** Low.

**Must solve:** No, score impact is negligible.

## 7. Unused preconnect to Supabase — REAL, **landing-page-specific only**

We added the Supabase preconnect for fast auth on logged-in routes. Lighthouse complains because the homepage doesn't hit Supabase before LCP.

**Plan:** Move the preconnect from `index.html` into a route-level `<link>` injected only on `/login`, `/convert`, `/signup`, `/profile`, etc. Keep `dns-prefetch` site-wide (cheap).

**Risk:** Slight regression on first auth request from logged-in entry. Mitigation: inject the preconnect in `AuthContext` on mount, before first session call.

**Must solve:** Optional — cosmetic Lighthouse hint, no real perf cost.

## 8. Missing `<main>` landmark — REAL accessibility issue

Verified: no `<main>` element anywhere in the app. Costs 1 point on Lighthouse Best Practices and is a real screen-reader nav issue.

**Plan:** Wrap `<Routes>` in `App.tsx` with `<main id="main-content">`. Add a "Skip to main content" link in `Navbar.tsx` for keyboard users.

**Risk:** None. Pure additive.

**Must solve:** Yes — accessibility is in our quality bar.

## 9. Color contrast failures (accordion of small badges) — REAL

Lighthouse flags `bg-accent/10` text-on-tinted-bg combos in mock components and small status pills (`Summary updated`, `Claimed`, timestamp chips like `00:14`).

**Plan:** Bump `bg-accent/10` → `bg-accent/15` and `text-accent` → `text-accent-foreground` (or the stronger `--accent` HSL) for these specific components: `JobDetailTags`, mock components in `src/components/home/mocks/`, `SummaryMock`. Audit with the contrast checker built into the existing `DiagnosticsTab`.

**Risk:** Slight visual change to badges. We'll keep the same hue, only increase contrast ratio above 4.5:1.

**Must solve:** Yes per the project's accessibility rules.

## 10. Redundant `alt="WhatSaid"` on logo next to `<span>WhatSaid</span>` — REAL

Lighthouse correctly flags that the alt text duplicates the visible brand text right next to it.

**Plan:** Change `alt="WhatSaid"` → `alt=""` and add `aria-hidden="true"` on the logo `<img>` in `Navbar.tsx`. The text span already provides the accessible name.

**Risk:** None.

**Must solve:** Yes — trivial.

## 11. Missing source maps for production JS — REAL but **deliberate**

Vite by default doesn't emit source maps for prod. Shipping them helps debugging but exposes original code structure.

**Plan:** Add `build.sourcemap: 'hidden'` in `vite.config.ts`. This generates `.map` files but does not reference them from the JS. Lighthouse and our error-tracking can use them; casual viewers can't auto-discover. Alternative: leave as-is.

**Risk:** Tiny: source map files inflate deploy size by ~1 MB. Recommended.

**Must solve:** Optional.

## 12. Security: missing CSP, COOP, X-Frame-Options, HSTS preload — PARTIALLY REAL

Verified headers: `Strict-Transport-Security: max-age=31536000; includeSubDomains` IS present (no `preload` flag). Everything else (CSP, COOP, XFO) is missing.

**Plan:** Same blocker as #1 — these are response headers controlled by the Lovable hosting layer, not the React app. We can put recommended values into `public/_headers` and hope the layer honors them. Specifically:
- `X-Frame-Options: DENY`
- `Cross-Origin-Opener-Policy: same-origin`
- A starter CSP that allows our exact origins (Supabase, Paddle, PSI, Lovable AI).

CSP needs care: a wrong CSP will break Paddle checkout, Lovable AI gateway calls, and Supabase realtime. We will start in `Content-Security-Policy-Report-Only` mode.

**Risk:** Medium — easy to break checkout. We start in report-only.

**Must solve:** Yes for XFO and COOP (low risk). CSP is a longer project.

## 13. DOM size 550 elements / depth 14 — REAL but **acceptable**

Lighthouse warns above 1,500. We're at 550. Ignored.

## 14. SEO: 100/100 — nothing to fix

Both reports show 100 SEO. Structured data validates. No action.

---

## Suggested execution order

```text
Phase 1 — High ROI, low risk (do first)
  #1  public/_headers for cache + verify
  #3  Logo @1x asset
  #8  <main> landmark + skip link
  #10 Redundant alt fix
  #9  Contrast bumps on badges

Phase 2 — Polish
  #2  Preload CSS
  #6  rAF-wrap viewport reads
  #7  Move Supabase preconnect to authed routes
  #11 Hidden source maps

Phase 3 — Bigger lift
  #4  Static brand shell in index.html
  #12 Security headers + CSP report-only
```

## Files that will change in Phase 1

- `public/_headers` (new)
- `src/App.tsx` — wrap Routes in `<main>`
- `src/components/Navbar.tsx` — skip-link, fix logo alt + size
- `src/assets/logo-sm.webp` (new)
- `src/components/home/mocks/*.tsx`, `JobDetailTags.tsx` — contrast bumps

## Files that will change in Phase 2/3 (if approved)

- `index.html` — CSS preload, optional static brand shell
- `src/main.tsx` — remove font preload duplication (already there)
- `src/hooks/use-keyboard-inset.ts`, `use-scroll-reveal.ts` — rAF wrap
- `src/contexts/AuthContext.tsx` — dynamic preconnect injection
- `vite.config.ts` — `sourcemap: 'hidden'`
- `public/_headers` — CSP report-only + COOP + XFO

## Risks summary

- The single biggest risk is that **Lovable's hosting layer ignores `public/_headers`**. If so, items #1 and #12 require Lovable infrastructure support; everything else still works.
- CSP rollout in enforcement mode could break Paddle/Supabase. Mitigation: report-only first, monitor for ≥1 week.
- The static-shell LCP fix (#4) is the only change that touches first-paint markup; we will keep it minimal and behind feature-flag-style commenting.

