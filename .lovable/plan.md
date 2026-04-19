

## Revised typography plan — 2 families, distinctive & restrained

### 1) The 2-family decision (final)

**Family A — UI sans: Inter (variable, wght 100–900).**
Already loaded; switch to the single variable file. Used for **everything that is not long-form reading**: nav, buttons, tabs, badges, labels, inputs, page/section/card titles, helper text, captions, micro chips, **and timestamps** (via `font-variant-numeric: tabular-nums` — Inter has full tnum support, so no mono family is needed).

**Family B — Reading serif: Source Serif 4 (variable, opsz 8–60, wght 200–900).**
Loaded specifically because it gives WhatSaid the *distinctive, slightly elegant, editorial* identity the user asked for. The optical-size axis means it stays clean and crisp at 16–17px on screen (most serifs don't). Calm, intelligent, premium — Apple/Stripe-Press class — without being decorative. Free (OFL), Google-Fonts hosted.

**Drop entirely:**
- **Space Grotesk** — its display character fights "calm/editorial".
- **JetBrains Mono** — not loaded; system mono stack only (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`) for the rare inline `<code>`. Premium on Apple, fine elsewhere, zero network cost.

**Confirmation: only 2 web fonts are loaded — Inter + Source Serif 4. No third loaded family.** Mono = system fallback only.

Why this combo is *distinctive* rather than generic SaaS:
- Almost every SaaS uses Inter alone or Inter + a geometric display sans. Pairing Inter with **Source Serif 4** (rare in web apps, common in editorial products like the FT app, Stripe Press, Substack reader) is what gives WhatSaid an immediately recognisable, slightly elegant identity — without exotic risk, since both are battle-tested variable fonts.

---

### 2) Reading-surface decision: transcript vs summary vs Q&A

I evaluated all three options under the new "distinctive + restrained + 2 families" constraint:

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| (a) Sans transcript, serif summary + Q&A | Marks "AI-written" content vs verbatim speech | Mixes families *inside the same job page* → inconsistent, breaks calm/cohesive rule | ❌ |
| (b) Serif on all three reading surfaces | One unified "reading mode"; clearest content-vs-chrome split; most distinctive premium feel; transcript IS the product so it deserves the elevated treatment | Slightly stronger personality on transcript — must hold ≥16px to look right | ✅ **Chosen** |
| (c) Sans everywhere with stronger scale | Lowest risk | Indistinguishable from every other SaaS app — defeats the entire "distinctive" goal | ❌ |

**Final: Option (b)** — Source Serif 4 on transcript body, summary body (+ summary section headings), Q&A answer body. Inter everywhere else. One memorable rule for the user and the codebase: **"Serif = the words. Sans = the app."**

---

### 3) Type scale (tokenised)

Mobile → desktop. Defined in `tailwind.config.ts`.

| Role | Family | Size (mb→dt) | LH | Wt |
|---|---|---|---|---|
| Display (homepage hero) | Sans | 36 → 56 | 1.05 | 600, -0.02em |
| Page title (h1) | Sans | 24 → 30 | 1.2 | 600, -0.015em |
| Section title (h2) | Sans | 18 → 20 | 1.3 | 600, -0.01em |
| Card title (h3) | Sans | 16 → 17 | 1.35 | 600 |
| **Transcript body** | **Serif** | **16 → 17** | **1.75** | 400 |
| **Summary body** | **Serif** | **16 → 17** | **1.7** | 400 |
| **Summary section heading** | **Serif** | 17 → 18 | 1.3 | 600 |
| **Q&A answer body** | **Serif** | 16 → 17 | 1.7 | 400 |
| Primary body (marketing/help) | Sans | 15 → 16 | 1.6 | 400 |
| Secondary body / helper | Sans | 13 → 14 | 1.5 | 400 |
| Caption | Sans | 12 | 1.4 | 500 |
| Micro (chips, "USED SOURCES", "Q") | Sans uppercase | 11 | 1.3 | 600, +0.04em |
| Button / button-sm | Sans | 14 / 13 | 1 | 500 |
| Form input | Sans | **16 mobile**, 14 desktop | 1.4 | 400 (preserves `text-base md:text-sm` no-iOS-zoom rule) |
| Badge / pill / tab | Sans | 12–14 | 1 | 500 |
| Timestamp | Sans + `tabular-nums` | 12 | 1.4 | 400 |

---

### 4) Implementation plan (low-risk, role-first)

**Files to modify (priority order):**

1. **`index.html`** — replace existing font links with two `<link>` tags: Inter (variable) + Source Serif 4 (variable, with `opsz` axis). Keep `preconnect`. Remove all Space Grotesk lines. No JetBrains Mono.

2. **`tailwind.config.ts`** — `fontFamily`: `sans` → Inter stack, `serif` → Source Serif 4 stack, `mono` → system mono fallback only (kept so any rare existing `font-mono` class still renders). **Remove** `heading` and `body` keys. `fontSize`: add tokens `display`, `h1`, `h2`, `h3`, `reading`, `body`, `secondary`, `caption`, `micro`, `button`, `button-sm` as `[size, {lineHeight, letterSpacing, fontWeight}]` tuples.

3. **`src/index.css`** — `body` uses Inter; add `font-feature-settings: "ss01", "cv11"` for Inter polish; add `.tabular` utility for `font-variant-numeric: tabular-nums`. `h1–h6` lose the forced family (so they inherit sans by default; reading components opt into serif explicitly). Add `size-adjust` `@font-face` overrides for the serif fallback (Georgia) to minimise CLS.

4. **`src/components/StructuredSummary.tsx`** — body `<p>`/`<li>` → `font-serif text-reading leading-[1.7]`; `<h3>` → `font-serif text-[17px] sm:text-[18px] font-semibold`. Scoped change.

5. **`src/components/TranscriptEditor.tsx`** — segment text `<p>` (~line 935) → `font-serif text-reading leading-[1.75]`; timestamp spans → `text-caption tabular-nums` (Inter, no font swap). Edit-mode textarea stays sans (it's an input, not reading). Scoped change.

6. **`src/components/JobResults.tsx`** — Q&A answer (`SectionBody`) wrapper → serif via class; "Q" label and "USED SOURCES" chip → `text-micro uppercase tracking-wide`. Question textarea keeps `text-base md:text-sm`. Scoped change.

7. **Targeted role-first cleanup (NOT a blind global codemod):**
   - In **navbar / footer / help / pricing / settings** components only, remove leftover `font-heading` / `font-body` classes (Inter is the inherited default — these classes simply disappear).
   - For ad-hoc sizes `text-[10px]` and `text-[11px]`: audit each occurrence by role; replace with `text-micro` only where the element is a chip/label/caption. **Do not touch dense table cells, admin tooling, or input adornments** without per-call review. Expected: ~30 of ~44 occurrences updated; rest left intact.

8. **`src/lib/export-pdf.ts`** — untouched this round (PDF embeds its own fonts; separate QA loop).

**Regression checks:**
- `npm run test` (existing Vitest suites are content-based — should pass).
- Manual desktop QA at 1280: `/`, `/help`, `/pricing`, `/job/<id>` (all 3 tabs), `/history`, `/settings`, `/profile`, `/login`, `/admin`.
- Manual mobile QA at 390×844: same set; verify (a) inputs don't trigger iOS zoom, (b) transcript line length comfortable, (c) tab triggers don't wrap, (d) chips don't clip.
- Network: exactly 2 font requests (Inter + Source Serif 4), both woff2, both 200.
- Console: no missing-font warnings.
- Visual focus: `StructuredSummary`, `TranscriptEditor` segments, Q&A answer card, navbar credit badge alignment (tnum), Help FAQ accordion (stays sans — short Q&A, not long-form).

**Risks & mitigations:**
- FOUT during serif swap → `font-display: swap` (Google default) + `size-adjust` on Georgia fallback.
- Timestamps lose mono personality → counter: `tabular-nums` keeps digit alignment, identity slightly softer but more cohesive.
- Tab-trigger wrapping at 360px on the new metric → explicitly QA'd at that width.
- Accessibility: every reading surface ≥16px; colour contrast unchanged.

**Final summary:**
- **2 loaded families only**: **Inter** (UI) + **Source Serif 4** (reading). No mono family loaded.
- **Reading rule**: serif on transcript + summary + Q&A answer; sans everywhere else.
- **Distinctive**: the Inter + Source Serif 4 pairing gives WhatSaid an editorial identity that no generic SaaS app shares, while staying calm, restrained, and battle-tested.

