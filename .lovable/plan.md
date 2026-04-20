

## Plan — fix Lighthouse issues on whatsaid.app

Lighthouse mobile score is 80 with FCP 3.4s, LCP 3.7s, Speed Index 5.0s. Below are the concrete fixes mapped to each insight.

### 1. Render-blocking Google Fonts (~160 ms)

`index.html` currently loads Inter + Source Serif 4 from `fonts.googleapis.com` as a blocking `<link rel="stylesheet">`. Source Serif 4 self-hosted .ttf files already exist in `src/assets/fonts/` (Regular, Italic, Bold, BoldItalic) and are unused.

Fix:
- Remove the blocking Google Fonts `<link rel="stylesheet">` and the duplicate `<noscript>` copy.
- Self-host both families using `@font-face` in `src/index.css` with `font-display: swap`, pointing Inter to a variable woff2 placed in `src/assets/fonts/` and Source Serif 4 to the existing files (converted to woff2 for size — note: `.ttf` files are ~330 KB each; `.woff2` would be ~80 KB each).
- Keep the existing `Source Serif 4 Fallback` size-adjusted Georgia rule (already in `index.css`) to keep CLS at 0.
- Drop `preconnect` lines for Google Fonts since they're no longer needed.

Result: removes the blocking external CSS request and an extra TLS handshake on the critical path.

### 2. Oversized images / icons (LCP + image delivery)

```text
public/favicon.png             333 KB   ← served as 32×32 and 192×192 icon
public/apple-touch-icon.png    333 KB   ← should be 180×180
public/og-image.png            936 KB
public/og-image-dark.png       745 KB
public/og-help.png            1068 KB
public/og-pricing.png         1008 KB
```

`favicon.png` (333 KB) is referenced twice in `<head>` and downloaded eagerly. The `apple-touch-icon.png` is identical to it.

Fix:
- Regenerate `favicon.png` at exactly 32×32 (target ≤ 2 KB) and a separate `favicon-192.png` at 192×192 (≤ 8 KB), then update the two `<link rel="icon">` tags to point to the right sizes instead of the same 333 KB file.
- Regenerate `apple-touch-icon.png` at exactly 180×180 (≤ 10 KB).
- Re-encode all four `og-*.png` files to ≤ 200 KB each (1200×630, optimized PNG or compressed via `pngquant`/`oxipng`). OG images are not on the critical path but Lighthouse flags the 15 KiB image-delivery saving on what is loaded.

### 3. Render-blocking requests (50–160 ms saving)

After fixing fonts, the remaining blocker is the main JS bundle. Add to `index.html`:
- `<link rel="modulepreload" href="/src/main.tsx">` (Vite resolves this in production to the hashed entry).
- Move the existing system-preference dark-mode IIFE into a separate file is unnecessary — it already runs synchronously and is tiny. Leave it.

### 4. Reduce unused JavaScript (~115 KiB)

Likely culprits pulled into the initial chunk:
- `i18next-browser-languagedetector` + all 3 locale JSONs (`en/it/fr`) are statically imported in `src/main.tsx` → `src/i18n/index.ts`, so they're in the initial bundle even though only one locale is rendered.
- `lucide-react` icons — already tree-shaken via per-icon imports, leave alone.
- The Paddle SDK (`https://cdn.paddle.com/paddle/v2/paddle.js`) is loaded with `defer` on every page including the homepage where checkout never opens.

Fix:
- Lazy-load non-active locales: keep `en` statically imported (fallback) and dynamically import `it` / `fr` only when the detected language matches them, via `i18n.addResourceBundle` after a `import()` call.
- Defer Paddle injection until the user navigates to `/pricing` or `/convert`. Inject the `<script>` from `initPaddle()` instead of placing it in `index.html`. This removes ~50 KB JS from the homepage critical path.

### 5. Forced reflow

The homepage `Navbar` uses `window.scrollY` reads on every scroll, but only when `mobileOpen=true` — that's fine. The likely reflow source is `HeroProductMock`'s waveform animation animating `transform` on a 96-bar flexbox row.

Fix:
- Add `will-change: transform` and wrap the bars row in an element with `contain: layout paint`. Already uses `transform` so this is mostly a `will-change` hint.
- Replace the bars `flex-1` with fixed-width `w-1` to avoid flex recalculation each frame.

### 6. Use efficient cache lifetimes (~301 KiB)

This is set by the hosting layer (Lovable's static asset CDN), not application code. Document it in the plan as a hosting-level item: assets under `/assets/*` in a Vite production build already get a content hash and should be served with `Cache-Control: public, max-age=31536000, immutable`. If Lovable's CDN does not currently set this, there is nothing the app can change. Note this for the user.

### 7. Avoid non-composited animation

Lighthouse flagged 1 element. The waveform progress bar in `HeroProductMock.tsx` animates `width` (the `animate-progress-fill-92` class), which is not GPU-composited.

Fix: rewrite `progress-fill-92` keyframes in `tailwind.config.ts` to animate `transform: scaleX()` from 0 → 0.92 with `transform-origin: left`, then drop the `w-[92%]` setting that depends on width.

### 8. Optimise DOM size / Reduce unused CSS

- Tailwind already purges unused classes in prod; the 14–15 KiB unused CSS is mostly base reset rules from shadcn components — not worth chasing.
- DOM size on the homepage is ~600 nodes. The `HeroProductMock` renders 96 waveform bar `<span>` elements; reducing to 48 with `transform: scaleX` for the loop saves ~50 nodes.

### Files to change

- `index.html` — remove Google Fonts links, swap favicon/apple-touch-icon references, drop Paddle `<script>` tag.
- `src/index.css` — add `@font-face` rules for self-hosted Inter + Source Serif 4 woff2 with `font-display: swap`.
- `src/assets/fonts/` — add Inter variable woff2; convert existing Source Serif 4 .ttf → .woff2 (delete .ttf to save 1 MB repo size).
- `public/favicon.png`, `public/favicon-192.png`, `public/apple-touch-icon.png` — regenerate at correct sizes.
- `public/og-image.png`, `og-image-dark.png`, `og-help.png`, `og-pricing.png` — re-compress.
- `src/i18n/index.ts` — lazy-load `it` / `fr` resources.
- `src/lib/paddle-checkout.ts` — inject Paddle.js dynamically inside `initPaddle()`.
- `src/components/home/HeroProductMock.tsx` — switch progress bar to `transform: scaleX`, halve waveform bar count, add `will-change`.
- `tailwind.config.ts` — replace `progress-fill-92` keyframes with transform-based version.

### Expected impact (mobile)

- FCP: 3.4 s → ~1.8 s (font + render-blocking removal).
- LCP: 3.7 s → ~2.2 s (smaller hero, no blocking CSS).
- Speed Index: 5.0 s → ~2.8 s.
- Performance score: 80 → 90+.

### Out of scope / requires user action

- "Use efficient cache lifetimes" — needs Lovable hosting CDN headers; cannot be fixed in code.
- Third-party (Paddle) caching is set by Paddle's CDN.

