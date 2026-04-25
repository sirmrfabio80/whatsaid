# Top-3 SEO fixes from the 2026 guide

Three small, isolated changes. No behaviour change for users; pure SEO/crawlability improvements.

## 1) Allow modern AI crawlers in `public/robots.txt`

**Current state:** the file lists Googlebot, Bingbot, Twitterbot, facebookexternalhit, and a wildcard. AI crawlers fall under `User-agent: *` and are technically allowed, but the 2026 guide recommends naming them explicitly so AI search engines (ChatGPT search, Perplexity, Claude, Google's AI Overviews) recognise the site as opted-in for content discovery.

**Change:** add explicit `User-agent` blocks for the major AI crawlers, each with `Allow: /` and `Disallow: /admin` to mirror the existing wildcard policy. Keep the `Sitemap:` line unchanged at the bottom.

Crawlers to add:
- `GPTBot` (OpenAI training)
- `OAI-SearchBot` (ChatGPT search results)
- `ChatGPT-User` (on-demand fetches from ChatGPT)
- `PerplexityBot` (Perplexity search)
- `ClaudeBot` (Anthropic Claude)
- `Google-Extended` (Google's Bard/Gemini training opt-in — required separately from Googlebot)
- `Applebot-Extended` (Apple Intelligence)
- `Bytespider` (TikTok / ByteDance) — optional; skip if you'd rather not be indexed by them
- `CCBot` (Common Crawl) — feeds many AI training sets

I'll add the first 7 by default and skip Bytespider unless you want it. The `/admin` disallow is preserved on every block so the admin panel stays out of all indexes.

**File:** `public/robots.txt` only.

---

## 2) Add `BreadcrumbList` JSON-LD to inner pages

**Current state:** `Index.tsx` ships `SoftwareApplication`, `Pricing.tsx` ships `Product`+`Offer` per pack, `Help.tsx` ships `FAQPage`. None of them publish `BreadcrumbList`, which Google uses to render breadcrumb trails under search results and to understand site hierarchy.

**Change:** add a single `BreadcrumbList` JSON-LD via the existing `JsonLd` component on these pages:

- `/pricing` → Home › Pricing
- `/help` → Home › Help
- `/convert` → Home › Transcribe Audio

Schema shape (per page):
```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://whatsaid.app/" },
    { "@type": "ListItem", "position": 2, "name": "Pricing", "item": "https://whatsaid.app/pricing" }
  ]
}
```

Each page already imports `JsonLd`, so this is a 10-line constant + one extra `<JsonLd data={…} />` per page. No new files. No visual breadcrumb UI is being added — the schema is the only deliverable here, since the guide's recommendation is search-result enhancement, not in-page navigation.

I will **not** add breadcrumbs to auth pages (`/login`, `/signup`, `/reset-password`), legal pages (`/privacy`, `/terms`, `/refund-policy`), or app-internal pages (`/profile`, `/settings`, `/history`, `/job/:id`, `/admin`) — those either don't appear in search or aren't worth the schema noise.

**Files:** `src/pages/Pricing.tsx`, `src/pages/Help.tsx`, `src/pages/Convert.tsx`.

---

## 3) Convert hidden navigation CTAs to real `<Link>` elements

**Current state:** several primary CTAs use `<Button onClick={() => navigate('/x')}>`, which renders a `<button>` with no `href`. Crawlers treat these as non-links and don't follow them, so internal PageRank doesn't flow through. Confirmed offenders:

- `src/pages/Index.tsx:119` — "View pricing" CTA → `/pricing`
- `src/pages/Profile.tsx:107` — "Buy credits" → `/pricing`
- `src/pages/Profile.tsx:137` — "Transcribe audio" → `/convert`
- `src/pages/Profile.tsx:141` — "History" → `/history`
- `src/pages/Profile.tsx:144` — "Settings" → `/settings`
- `src/pages/JobDetail.tsx:239` — "Back to history" → `/history`
- `src/pages/JobDetail.tsx:242` — "New transcription" → `/convert`

**Change:** wrap each `<Button>` in a `<Link to="…">` using `asChild` (shadcn pattern), so the rendered DOM is an `<a href="…">` styled exactly like the current button. Same look, same click behaviour, but now crawlable. Example:

```tsx
<Button asChild variant="outline" size="sm" className="rounded-lg">
  <Link to="/pricing">Buy credits</Link>
</Button>
```

I will **not** touch:
- The `useEffect`-based redirects on `Profile.tsx:21` and `JobDetail.tsx:61` (those are guards, not CTAs — must stay programmatic).
- Buttons that submit forms, open dialogs, trigger Paddle checkout, or run async logic. Those genuinely aren't navigation.

**Files:** `src/pages/Index.tsx`, `src/pages/Profile.tsx`, `src/pages/JobDetail.tsx`.

---

## Out of scope for this pass

Deferred to a later, separate prompt to keep this change tight:

- Sitemap `<lastmod>` refresh — trivial but unrelated to crawl/discovery; can ship alongside any future content change.
- H1 audit across components — requires a wider sweep; will do as a dedicated task if any issues surface.
- `www` → apex 301 verification — hosting/DNS check, not a code change.

## Risks & rollback

- **robots.txt:** purely additive. Worst case: a new crawler still ignores us. Reverting is one-file undo.
- **BreadcrumbList JSON-LD:** invisible to users; invalid schema would just be ignored by Google. I'll match the exact shape Google's Rich Results Test accepts.
- **Link conversion:** the `asChild` pattern is already used elsewhere in the codebase (e.g. `Help.tsx`, `Pricing.tsx`), so styling parity is guaranteed. No keyboard/focus regression — `<a>` is natively focusable.

Total: 4 files edited, 0 files created, 0 dependencies added.