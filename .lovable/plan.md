

# Fix Google Search favicon visibility

Two real defects, both small and isolated. Plan addresses each, plus the post-deploy verification step.

## Problems confirmed against the codebase

1. **`public/favicon-512.png` is 511×512**, not square. Confirmed by reading the PNG IHDR header. Google's favicon guidelines require a square image; the manifest declares `"sizes": "512x512"` but the file is one pixel narrower. This alone can cause Google to skip the icon when picking a favicon for Search.
2. **All favicon URLs use `?v=2`** in both `index.html` (lines 13–21) and `public/site.webmanifest` (every `src`). Google explicitly recommends a stable, unchanging favicon URL so its crawler can cache it long-term. The `?v=2` suffix worked once to bust browser caches but now actively works against favicon discovery in Search.

The other PNGs (32, 96, 192, apple-touch-icon 180) are all correctly square — no need to regenerate them. Only `favicon-512.png` needs a real fix.

## Fix

### 1. Regenerate `favicon-512.png` as a true 512×512 square

Re-render from the existing 511×512 source using ImageMagick's `magick` (already on the sandbox via `nix run nixpkgs#imagemagick`). Approach:
- Pad the 511×512 source by 1px on the right with the manifest `background_color` (`#ffffff`) so the visual artwork is unchanged and the file becomes exactly 512×512.
- This is safer than resizing, which would slightly distort the logo and could shift edges by a sub-pixel.
- Verify post-write that the IHDR reports `512x512`.

We will not touch the other PNGs. They are already square and look correct in browser tabs.

### 2. Strip `?v=2` from all favicon and manifest URLs

In `index.html` (lines 13–21), remove `?v=2` from:
- `/favicon.ico`
- `/favicon-32.png`
- `/favicon-96.png`
- `/favicon-192.png`
- `/favicon-512.png`
- `/apple-touch-icon.png`
- `/safari-pinned-tab.svg`
- `/site.webmanifest`

In `public/site.webmanifest`, remove `?v=2` from all five icon `src` entries.

This makes every URL stable. Browsers may briefly show the old cached favicon until they re-fetch — acceptable trade-off, and the `_headers` file added in the previous round already declares `Cache-Control: no-cache` for HTML so the new `<link>` tags take effect on the next visit anyway.

### 3. Verification (after deploy)

- `python3` IHDR check on the deployed `/favicon-512.png` to confirm 512×512.
- `curl -I` on each favicon URL to confirm `200 OK` and stable headers.
- Visit `https://www.google.com/s2/favicons?domain=whatsaid.app&sz=128` to inspect what Google's favicon service returns.
- User action (cannot be automated): in Google Search Console, request indexing for `/`. Search-result favicon refresh can take days — that part is Google-side latency, not a code defect.

## Files that will change

- `public/favicon-512.png` — regenerated as true 512×512.
- `public/site.webmanifest` — five `src` URLs lose `?v=2`.
- `index.html` — eight `href` attributes lose `?v=2` on lines 13–21.

## Risks

- **Regenerated PNG looks marginally different.** Mitigated by padding (not resizing); the visible artwork is byte-identical, just with one extra column of background pixels on the right edge.
- **Browser cache thrash from removing `?v=2`.** Negligible — favicons are tiny, and any stale cache will be replaced on next visit. No functional impact.
- **Google may still take 1–4 weeks to refresh the Search-result favicon.** This is expected and outside our control; the plan does not promise an instant fix in Search results, only that the site becomes fully compliant with Google's favicon rules.

