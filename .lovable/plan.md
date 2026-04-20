

# Google Search Readiness Plan — WhatSaid

A focused, phased plan to make this Vite/React CSR SPA as indexable, crawlable, understandable, and monitorable by Google as possible — without unrelated UI work.

---

## 1) Current-state audit

What exists today:
- `index.html` ships a strong default `<title>`, description, OG/Twitter tags, canonical to `https://whatsaid.app`, theme-color, manifest, favicons, font preconnect.
- `usePageMeta` hook updates title/description/OG/Twitter/canonical client-side, used on `Pricing` and `Help` only.
- `public/robots.txt` allows all (explicit allow per major bot).
- Footer has site-wide internal links to `/convert`, `/pricing`, `/help`, `/privacy`, `/terms`, `/refund-policy`, `/login` (conditional).
- Semantic structure: each page has a single `<h1>` and clear `<h2>`/`<h3>`. `<footer>`, `<section>` used.
- Three OG images present (`og-image.png`, `og-pricing.png`, `og-help.png`).
- i18n implemented (en/fr/it) but no `hreflang` and no localized routes.
- React Router with `BrowserRouter`. Lovable hosting handles SPA fallback.

What is missing or risky:
- No `sitemap.xml`.
- No JSON-LD anywhere (no `Organization`, `WebSite`, `FAQPage`, `SoftwareApplication`).
- `usePageMeta` is not applied to `Index` (homepage), `Convert`, `Privacy`, `Terms`, `RefundPolicy`, `Login`, `Signup`, `NotFound` — all rely on `index.html` defaults → duplicate titles/descriptions/canonicals across all routes.
- Canonical in `index.html` is hard-coded to `https://whatsaid.app` for every URL → all unindexed routes self-canonicalize to the homepage (acceptable if not indexed, but risky once routes are indexed without overriding).
- Two live primary domains (`whatsaid.app`, `www.whatsaid.app`, plus `whatsaid.lovable.app`) — needs explicit primary + 301 strategy.
- `NotFound` page returns HTTP 200 (SPA limitation) — soft-404 risk.
- Auth/private routes (`/profile`, `/settings`, `/history`, `/job/:id`, `/admin`, `/notifications`, `/set-password`, `/reset-password`, `/claim/:token`, `/shared-pdf/:token`) are not `noindex`; they render minimal content for crawlers.
- No `hreflang` for fr/it variants (currently same URL, language switches client-side — limited SEO value).
- CSR-only: critical above-the-fold content is rendered by JS. Googlebot generally renders JS but it delays indexing and weakens ranking signals.
- No structured data for FAQ, despite a substantial bilingual FAQ on `/help`.
- No image dimensions/lazy-loading audit; `og-image.png` size unverified (recommend 1200×630).
- No analytics or Search Console verification token in `index.html`.
- `/convert` is a logged-in tool but currently public — needs a decision: indexable marketing landing OR app-only (noindex).
- `Help.tsx` uses i18n keys for `metaTitle` — verify they exist in all locales to avoid empty `<title>`.

CWV/perf risks (without measuring):
- Google Fonts via blocking `<link rel="stylesheet">` — render-blocking.
- Hero loads `HeroProductMock` eagerly (good for LCP) but no `<link rel="preload">` for hero image/asset.
- Many lazy routes (good). No route-level prefetch hints needed.

---

## 2) Recommended target architecture (CSR Vite SPA on Lovable)

- **Canonical domain:** `https://whatsaid.app` (apex). 301 `www.whatsaid.app` → apex; keep `whatsaid.lovable.app` as `noindex` or set canonical to apex.
- **Indexable routes:** `/`, `/pricing`, `/help`, `/convert` (as marketing landing), `/privacy`, `/terms`, `/refund-policy`.
- **Noindex routes:** `/login`, `/signup`, `/reset-password`, `/set-password`, `/profile`, `/settings`, `/history`, `/job/:id`, `/admin`, `/notifications`, `/claim/:token`, `/shared-pdf/:token`, `/*` (NotFound).
- **Per-route metadata:** every page calls `usePageMeta` with explicit `title`, `description`, `canonical`, `ogImage`, plus a new `noindex` flag for private routes.
- **robots.txt:** allow all crawl, disallow nothing public, reference sitemap. Do not block JS/CSS. Optionally `Disallow: /admin` (defense in depth).
- **sitemap.xml:** static file in `public/`, listing only the 7 indexable URLs with `<lastmod>`. Regenerated via a small script at build.
- **Structured data:**
  - Site-wide in `index.html`: `Organization` + `WebSite` (with `SearchAction` only if site search exists — skip otherwise).
  - `/`: `SoftwareApplication` (free tier + paid credits).
  - `/pricing`: `Product` with `Offer`s for each credit pack — only if accurate and stable.
  - `/help`: `FAQPage` generated from the existing bilingual FAQ source.
  - `/privacy`, `/terms`, `/refund-policy`: `WebPage`.
- **Crawler-friendly content:** keep current SSR-less setup but inline a static `<noscript>` fallback in `index.html` describing the product (one paragraph + CTAs). Avoid prerendering unless Lovable adds first-class support — adds build complexity for limited gain since Googlebot renders JS.
- **i18n:** keep client-side language switcher; do not introduce localized routes or hreflang in this phase (out of scope and adds significant routing/work). Document as future work.
- **404 handling:** keep SPA `NotFound` with `<meta name="robots" content="noindex">`; cannot return real 404 status on Lovable static hosting — accept and mitigate via noindex.

---

## 3) Phased implementation plan

### Phase 1 — Crawlability and domain hygiene
- **Objective:** Single canonical domain; nothing accidentally blocked.
- **Files:** none in code (DNS/Lovable settings + Search Console). `public/robots.txt` reviewed.
- **Dependencies:** Owner access to Lovable domain settings + Google Search Console.
- **Risks:** wrong primary breaks existing inbound links → mitigate with 301s.
- **Verify:** `curl -I https://www.whatsaid.app` → 301 to apex; `curl https://whatsaid.app/robots.txt` returns 200.
- **DoD:** apex serves the app, www 301s to apex, `whatsaid.lovable.app` is not indexed.

### Phase 2 — Route-level metadata and canonicals
- **Objective:** Unique `<title>`, description, canonical, OG per public route; `noindex` on private routes.
- **Files:** `src/hooks/use-page-meta.ts` (extend with `noindex` + `robots` meta), `src/pages/Index.tsx`, `Convert.tsx`, `Privacy.tsx`, `Terms.tsx`, `RefundPolicy.tsx`, `Login.tsx`, `Signup.tsx`, `Profile.tsx`, `Settings.tsx`, `History.tsx`, `JobDetail.tsx`, `Admin.tsx`, `Notifications.tsx`, `SetPassword.tsx`, `ResetPassword.tsx`, `ClaimShare.tsx`, `SharedPdfDownload.tsx`, `NotFound.tsx`. Update `index.html` to remove the hardcoded `<link rel="canonical">` (let the hook own it).
- **Risks:** stale canonical between unmount/remount transitions — keep current restore-on-unmount but ensure each new page sets its own before the old defaults flash (already the case via React effect ordering).
- **Verify:** view-source on each route → unique tags; private routes contain `<meta name="robots" content="noindex,follow">`.
- **DoD:** every route has correct title/description/canonical/robots.

### Phase 3 — sitemap + robots + internal linking
- **Objective:** Discoverability via sitemap, hardened robots, footer/cross-links audit.
- **Files:** `public/sitemap.xml` (new, static), `public/robots.txt` (add `Sitemap:` line, optional `Disallow: /admin`), `src/components/Footer.tsx` (ensure links to `/help` from homepage and pricing — already present), add a "Help" link from `/convert` if missing.
- **Risks:** stale sitemap if routes change → small `scripts/generate-sitemap.mjs` invoked in `package.json` build script.
- **Verify:** `https://whatsaid.app/sitemap.xml` validates; `robots.txt` references it.
- **DoD:** sitemap live, referenced in robots, internal link graph covers all indexable routes within 1 click of homepage.

### Phase 4 — Structured data (JSON-LD)
- **Objective:** Eligibility for rich results where honest.
- **Files:** `index.html` (site-wide `Organization` + `WebSite`), new `src/components/seo/JsonLd.tsx`, used in `Index.tsx` (`SoftwareApplication`), `Help.tsx` (`FAQPage` from `src/content/help/faq.ts`), optionally `Pricing.tsx` (`Product`/`Offer` — only if pricing is stable).
- **Risks:** misleading schema → only emit fields backed by real on-page content. Skip ratings/reviews unless they exist.
- **Verify:** Google Rich Results Test passes for each.
- **DoD:** schemas validate, FAQPage shows in Rich Results test, no warnings about misleading content.

### Phase 5 — Performance / Core Web Vitals
- **Objective:** Improve LCP, CLS, INP signals.
- **Files:** `index.html` (preload hero font subset or switch to `font-display: swap` already in use; consider dropping `Source Serif 4` weights), `vite.config.ts` (verify code-splitting), hero asset `<img>` audit (explicit `width`/`height`, `fetchpriority="high"` on LCP image, `loading="lazy"` elsewhere), remove unused `og-*.png` size bloat if any.
- **Risks:** font subsetting can break italic serif used in design → keep current families, only optimize loading strategy.
- **Verify:** PageSpeed Insights mobile + desktop on `/`, `/pricing`, `/help`. Target LCP < 2.5s, CLS < 0.1, INP < 200ms.
- **DoD:** all three pages green on lab CWV; field data tracked in Search Console after rollout.

### Phase 6 — Monitoring and Search Console handoff
- **Objective:** Continuous visibility.
- **Files:** none (manual). Optional `index.html` verification meta tag if user prefers HTML method over DNS.
- **Verify:** GSC property verified; sitemap submitted; URL Inspection clean for the 7 indexable routes.
- **DoD:** GSC reporting live; rich results enhancements appear; no coverage errors.

---

## 4) Route-by-route SEO matrix

Assumptions: routes inferred from `src/App.tsx`. All paths are public unless behind a guard component.

| Route | Purpose | Index | Title pattern | Description direction | Canonical | Schema | Notes |
|---|---|---|---|---|---|---|---|
| `/` | Brand + product landing | index | `WhatSaid — AI Audio Transcription with Speaker Labels` | Value prop, supported formats, no-subscription | `https://whatsaid.app/` | `Organization`, `WebSite`, `SoftwareApplication` | Primary LCP target |
| `/pricing` | Convert intent | index | `Pricing — WhatSaid` | Credit packs, GBP, no subscription | `/pricing` | `Product` + `Offer` (optional) | Only schema if prices stable |
| `/help` | FAQ / support | index | `Help & FAQ — WhatSaid` | How to upload/transcribe/summarise | `/help` | `FAQPage` | Build from `faq.ts` (en only to avoid mixed-lang) |
| `/convert` | Marketing + tool | index | `Transcribe Audio — WhatSaid` | Drop file, get transcript | `/convert` | `WebPage` | Confirm: indexable landing or app-only |
| `/privacy` | Trust | index | `Privacy Policy — WhatSaid` | Data handling, audio deletion | `/privacy` | `WebPage` | Thin but legitimate |
| `/terms` | Trust | index | `Terms of Service — WhatSaid` | Legal | `/terms` | `WebPage` | — |
| `/refund-policy` | Trust | index | `Refund Policy — WhatSaid` | Refund rules | `/refund-policy` | `WebPage` | — |
| `/login` | Auth | noindex,follow | `Sign in — WhatSaid` | — | `/login` | — | — |
| `/signup` | Auth | noindex,follow | `Create account — WhatSaid` | — | `/signup` | — | — |
| `/reset-password`, `/set-password` | Auth | noindex,nofollow | — | — | self | — | Token-bearing |
| `/profile`, `/settings`, `/history`, `/notifications` | App | noindex,nofollow | — | — | self | — | Auth-gated |
| `/job/:id` | Job detail | noindex,nofollow | — | — | self | — | Per-user |
| `/admin` | Admin | noindex,nofollow | — | — | self | — | Defense in depth in robots too |
| `/claim/:token`, `/shared-pdf/:token` | Token links | noindex,nofollow | — | — | self | — | Sensitive |
| `*` (NotFound) | 404 | noindex,follow | `Page not found — WhatSaid` | — | none | — | Soft-404 mitigation |

---

## 5) Structured data plan

- **Organization** (in `index.html`): `name`, `url`, `logo` (absolute URL), `sameAs` (only if real social profiles exist — otherwise omit). Source: brand constants.
- **WebSite** (in `index.html`): `name`, `url`. Skip `SearchAction` (no on-site search).
- **SoftwareApplication** (`/`): `name=WhatSaid`, `applicationCategory=BusinessApplication`, `operatingSystem=Web`, `offers` with low price entry (£4.99 GBP), `description` from `home.heroSubline`. Do not invent `aggregateRating`.
- **FAQPage** (`/help`): generated from `src/content/help/faq.ts` (English only to keep one canonical URL → one language). Each Q&A becomes a `Question`/`Answer` with plain text.
- **Product/Offer** (`/pricing`, optional): one `Product` per pack with `priceCurrency=GBP`, `price`, `availability=InStock`. Skip if pricing model changes frequently.
- **WebPage** (`/privacy`, `/terms`, `/refund-policy`): `name`, `url`, `inLanguage=en`.

Do not fake: ratings, reviews, awards, logos of customers, `SearchAction`.

---

## 6) Google-side / manual checklist

Outside Lovable code:
1. Verify `https://whatsaid.app` in Google Search Console (DNS TXT preferred, or HTML meta if added in Phase 6).
2. Confirm `www` and `lovable.app` variants either redirect to apex or are not verified as primary.
3. Submit `https://whatsaid.app/sitemap.xml`.
4. URL Inspection on `/`, `/pricing`, `/help`, `/convert` → "Request indexing".
5. Monitor Page Indexing report weekly for first month.
6. Validate `FAQPage` and `SoftwareApplication` in Rich Results Test; fix any warnings.
7. Watch Core Web Vitals report (field data) and Mobile Usability.
8. Set up email alerts for coverage issues.

---

## 7) Risks and anti-patterns to avoid

- Duplicated metadata across routes (current state) — fix in Phase 2.
- Hard-coded canonical in `index.html` overriding per-route values — remove once hook owns it.
- Putting `noindex` on the homepage by mistake when adding the `noindex` flag.
- Blocking `/assets/*` or JS in robots.txt — never.
- FAQ schema with content that does not literally appear visible on the page.
- Inventing reviews/ratings.
- Treating SPA `NotFound` as a real 404 — it is not; rely on `noindex`.
- Adding hreflang without distinct localized URLs — would mislead Google.
- Changing public route paths without 301s (Lovable static hosting cannot 301; would need anchor pages or a soft client redirect — avoid path changes).
- Relying solely on JS for primary value-prop text. Keep the homepage hero copy in markup that renders without runtime data (already true).

CSR limitation flag: Lovable static hosting cannot return true HTTP status codes per route, cannot 301 between paths, and has no SSR. Mitigations: per-route `<meta robots>`, `<noscript>` fallback, accurate canonicals, sitemap. If first-party SSR/prerendering becomes critical (e.g. for a content/blog strategy), revisit with a separate plan.

---

## 8) Implementation prompts (copy-paste, in order)

1. "Extend `usePageMeta` to support a `noindex` boolean and a `robots` string; when `noindex` is true, set `<meta name=\"robots\" content=\"noindex,follow\">` and restore default on unmount. Do not change existing call sites."
2. "Remove the hard-coded `<link rel=\"canonical\">`, `<meta property=\"og:title\">`, `<meta name=\"twitter:title\">`, `<meta property=\"og:description\">`, `<meta name=\"twitter:description\">`, `<meta property=\"og:image\">`, `<meta name=\"twitter:image\">` from `index.html` so `usePageMeta` becomes the single source of truth. Keep the default `<title>` and `<meta name=\"description\">` as fallback."
3. "Add `usePageMeta` calls to `Index.tsx`, `Convert.tsx`, `Privacy.tsx`, `Terms.tsx`, `RefundPolicy.tsx`, `NotFound.tsx` with unique title, description, and canonical per the SEO matrix. Index, Convert, Privacy, Terms, RefundPolicy are indexable; NotFound is `noindex,follow`."
4. "Add `usePageMeta` with `noindex: true` to `Login.tsx`, `Signup.tsx`, `ResetPassword.tsx`, `SetPassword.tsx`, `Profile.tsx`, `Settings.tsx`, `History.tsx`, `JobDetail.tsx`, `Admin.tsx`, `Notifications.tsx`, `ClaimShare.tsx`, `SharedPdfDownload.tsx`."
5. "Create `public/sitemap.xml` listing only `/`, `/convert`, `/pricing`, `/help`, `/privacy`, `/terms`, `/refund-policy` under `https://whatsaid.app` with today's `<lastmod>`. Update `public/robots.txt` to add `Sitemap: https://whatsaid.app/sitemap.xml` and `Disallow: /admin`."
6. "Add a `scripts/generate-sitemap.mjs` script that regenerates `public/sitemap.xml` from a static route list with current date, and wire it into the `build` script in `package.json` as a prebuild step."
7. "Create `src/components/seo/JsonLd.tsx` (renders a `<script type=\"application/ld+json\">` into `document.head` via effect) and add `Organization` + `WebSite` JSON-LD globally in `App.tsx`."
8. "Add `SoftwareApplication` JSON-LD on `Index.tsx` using the `JsonLd` component, with `offers` reflecting the £4.99 entry price in GBP. Do not include ratings."
9. "Generate `FAQPage` JSON-LD on `Help.tsx` from `src/content/help/faq.ts`, English entries only, stripping HTML to plain text."
10. "Add `<noscript>` content inside `<body>` of `index.html` with a one-paragraph product description and links to `/`, `/convert`, `/pricing`, `/help` for crawler/no-JS fallback."
11. "Performance pass: add `width`/`height` and `fetchpriority=\"high\"` to the homepage hero LCP image, `loading=\"lazy\"` to below-the-fold images, and verify the Google Fonts link uses `display=swap` (already present)."
12. "(Manual, no code) Verify Search Console for `https://whatsaid.app`, submit sitemap, request indexing for `/`, `/pricing`, `/help`, `/convert`."

---

## 9) Verification checklist

- View-source each public route → unique `<title>`, `<meta name=\"description\">`, `<link rel=\"canonical\">`, `<meta property=\"og:*\">`.
- Each private route view-source contains `<meta name=\"robots\" content=\"noindex,follow\">` (or `noindex,nofollow` for token routes).
- `https://whatsaid.app/robots.txt` returns 200, references sitemap, does not block JS/CSS/assets.
- `https://whatsaid.app/sitemap.xml` returns 200, validates at validator.w3.org or GSC sitemap tool, lists only the 7 indexable URLs.
- Google Rich Results Test passes for `/` (`SoftwareApplication`), `/help` (`FAQPage`).
- Schema.org validator: no errors for `Organization`, `WebSite`.
- PageSpeed Insights: `/`, `/pricing`, `/help` mobile + desktop — LCP < 2.5s, CLS < 0.1, INP < 200ms.
- Lighthouse SEO score ≥ 95 on `/`, `/pricing`, `/help`, `/convert`.
- Mobile-Friendly Test passes on `/`, `/pricing`, `/help`.
- Search Console: property verified, sitemap status "Success", URL Inspection shows "URL is on Google" within ~7 days for priority pages.
- `site:whatsaid.app` Google query returns only the indexable routes after ~2 weeks.
- No private route appears in Google index after 30 days.

