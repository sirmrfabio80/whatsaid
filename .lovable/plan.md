# Plan: Resolve the remaining Google Search favicon issue

## What the live audit shows

This does **not** currently look like a broken favicon file or broken HTML declaration.

Confirmed from the live site:

- `https://whatsaid.app/` returns `200` to `Googlebot`.
- The homepage contains Google-compatible favicon declarations in `<head>`.
- `https://whatsaid.app/favicon-96.png`, `favicon-192.png`, and `favicon-512.png` return `200` to `Googlebot-Image`.
- The favicon files decode correctly and are square.
- `favicon-96.png` is `96x96`, `favicon-192.png` is `192x192`, and `favicon-512.png` is `512x512`, which satisfies Google’s “multiple of 48px” guideline.
- Google’s public favicon cache already returns a WhatSaid-looking icon for `https://whatsaid.app`.

The two likely remaining issues are:

1. **Google organic Search has not refreshed the displayed result yet.** Google favicon cache and Google organic result rendering do not update at the same time.
2. **The domain canonical redirect is not ideal:** `https://www.whatsaid.app/` currently redirects to `https://whatsaid.app/` with `302`, not `301`. Google can follow a `302`, but a permanent `301` is clearer for canonicalization.

## Implementation / action plan

### 1. Do not keep changing favicon URLs

I will avoid changing the favicon filenames again unless we find a concrete technical failure.

Why: Google’s own guidance says favicon URLs should be stable. Repeatedly changing favicon URLs can restart or delay cache refresh.

Current favicon URLs are already stable and guideline-compliant:

```text
/favicon-96.png
/favicon-192.png
/favicon-512.png
/favicon.ico
```

### 2. Update sitemap freshness only

I will update `public/sitemap.xml` `<lastmod>` dates to the current publish date for the public pages.

This does not change favicon URLs, but it gives Google a clean recrawl signal for the homepage and key routes.

Target file:

```text
public/sitemap.xml
```

### 3. Verify there is no hidden `noindex` or crawl blocker

I will re-check the public route metadata and make sure:

- Homepage does not emit `noindex`.
- `robots.txt` allows Googlebot and Googlebot-Image to access the homepage and favicon files.
- No SPA route metadata accidentally overrides the homepage canonical URL.

Target files:

```text
public/robots.txt
src/hooks/use-page-meta.ts
src/pages/Index.tsx
```

### 4. Check whether the published page is indexed

Because favicon display depends on the page being indexed/refreshed, the next operational step is Search Console:

- Inspect `https://whatsaid.app/`.
- Confirm it is indexed.
- If it is not indexed, request indexing.
- If it is indexed but stale, request indexing again after the sitemap update is published.

This part cannot be fully fixed in code; it must be done in Google Search Console.

### 5. Fix or escalate the `www` redirect if possible

The current redirect behavior is:

```text
https://www.whatsaid.app/ -> https://whatsaid.app/ 302
```

Preferred behavior:

```text
https://www.whatsaid.app/ -> https://whatsaid.app/ 301
```

I will not add client-side redirect code because that would not help Google at the HTTP/canonical level. The correct fix is in domain/hosting settings:

- Make `https://whatsaid.app` the primary canonical domain.
- Ensure `www.whatsaid.app` permanently redirects to the apex domain.

If the hosting layer only emits `302`, this should be handled through Lovable domain support/settings rather than application code.

## Expected result

After the sitemap freshness update and a Search Console recrawl request:

- Google has a fresh crawl signal for the homepage.
- The favicon remains stable and guideline-compliant.
- Search Console should show the homepage as indexed or queued for re-indexing.
- Google organic results should eventually display the WhatSaid favicon once the organic result cache refreshes.

## What I will avoid

- I will not replace the favicon artwork.
- I will not rename favicon files again.
- I will not add duplicate or conflicting favicon declarations.
- I will not add client-side redirects for a server-level canonical issue.