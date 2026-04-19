

# Homepage redesign — implementation-ready plan

## 1) Diagnosis of the current homepage

**Hero (weakest area)**
- Centred, vertically tall, no product visible. First fold is all words — feels like a lead-gen page, not a product.
- Headline uses an inline `bg-primary/10` highlight pill that reads as a tag, breaking the typographic line.
- The serif italic eyebrow + 3 trust chips + 2 CTAs + a flat full-width gradient overlay + a single blurred orb compete in the same vertical column. No product anchor.
- `text-display` (36px) is small for a hero; the responsive bumps to `3.25rem`/`4rem` only at sm/lg, so tablet feels tame.
- The two CTAs sit in a row but the secondary "See pricing" is plain text with two arrows — visually weak, no clear pricing signal.

**Outcome grid (HomeOutcomeGrid)**
- 2-1-1 asymmetric layout exists structurally but the hero card's "sample flourish" is three muted serif lines on a flat `bg-muted/30` block — looks like a placeholder, not a product. No chrome (no header, no controls), no speaker color, no UI signal.
- Summary and Q&A cards are pure text + bullets — visually identical to each other, no preview, no proof.
- Cards all share the same `bg-card`, same border, same gradient badge — section reads as three identical pieces, not three different product surfaces.

**Beyond the transcript**
- Sits on `bg-muted/30 border-y` — correct rhythm intent, but the four tiles inside are flat, undersized, no hover state beyond border-color, no visual differentiation between "Edit", "Search", "Share", "Export". Feels like a footer, not a value section.

**How it works**
- Three-step typographic timeline is fine but lonely — no contrast with the grey band above it. Step numbers in `text-primary/40` italic disappear on light mode, and the dashed connector at `top-7` is a thin grey line that visually does nothing.

**Privacy & trust**
- Generic "icon + text" list inside a faint gradient card. Headline `text-h1` is only 24px — too small for a section that's meant to reassure.

**Pricing teaser**
- Centred card, `border-2 border-primary/20`, no actual price comparison or value framing. Just "From £4.99 — pay once". Looks like an afterthought box. The serif italic price is the only visual move.

**Mini FAQ**
- Two-column editorial layout is restrained but the right column is a grey accordion with no visual presence. Closes the page with a whisper.

**Cross-cutting issues**
- Every card is `rounded-2xl border-border/60 bg-card` with the same gradient badge → motif fatigue, not motif identity.
- No real product UI is shown anywhere on the page. This is the core failure.
- Section padding is uniform (`py-16 sm:py-24`) → no rhythm.
- Color is monochromatic primary-only. Accent token (teal `170 55% 42%`) is loaded in the design system but unused on the homepage.
- No mockup, no chrome, no realistic timestamps, no UI screenshot, no product proof.

## 2) New visual direction

**Core move: show the product, not adjectives.**

- Replace decorative flourishes with **realistic, in-DOM product mocks** built from existing tokens (no images, no screenshots — actual component-grade mockups using Tailwind). This is what makes the page premium and product-led.
- Introduce **two visual registers** that alternate down the page:
  1. *"Studio" register* — dark/light premium product surfaces with chrome (window header, tabs, controls). Used for the hero mock and the outcome showcase.
  2. *"Editorial" register* — calm, type-led, generous whitespace. Used for How it works, Privacy, FAQ.
- Use the **accent teal** (`hsl(170 55% 42%)`) sparingly as a *second* product color — primarily for "saved/done" states inside the product mocks (a small dot, a check, an "Answered" pill). This breaks the monochromatic primary-only fatigue without adding noise.
- One distinctive **typographic motif** kept and amplified: serif italic for *eyebrows + numerals + speaker names inside mocks*. Removed elsewhere.
- Replace the inline highlight pill in the hero headline with a **serif italic word in primary** — editorial, not "tag-like".
- Replace the soft orb with a **layered ambient field**: one large primary radial + one small accent radial, both very low opacity, positioned to frame the product mock — purposeful, not decorative.

Result: the page becomes *visibly a product*, not a description of one.

## 3) Revised homepage structure

Keep 7 sections, redesign 5, tighten 2.

```text
1. Hero — split layout: left = headline/CTA/proof; right = "WhatSaid Studio" product mock (the anchor)
2. Outcome showcase — tabbed product surface (Transcript / Summary / Q&A) inside one premium card
3. Beyond the transcript — bento grid (4 tiles, 2 sizes) replacing the flat 4-column row
4. How it works — horizontal flow with annotated screenshots-in-code (still typographic, but with mini chrome)
5. Privacy & trust — full-bleed band (dark surface in light mode, lighter in dark mode) for register contrast
6. Pricing teaser — value comparison card (3 mini price chips, not one centred price)
7. Mini FAQ — editorial, with a closing primary CTA inline to end the page on conversion
```

What changes vs today:
- Hero **gains a product mock** (biggest single change).
- Outcome grid becomes **one tabbed card with three live-looking surfaces** instead of three side-by-side text cards.
- Beyond tiles become a **bento** (one wide tile + three smaller) for hierarchy.
- Privacy becomes a **full-bleed contrast band** to break the page's flat rhythm.
- Pricing teaser **shows the three packs as inline chips** (£4.99 · £14.99 · £39.99) so it functions as preview, not just a CTA.
- Mini FAQ closes with a **right-side primary CTA** so the page ends on action.

## 4) Hero redesign plan

**Layout (≥lg): asymmetric 2-column split**
- Left column (5/12): eyebrow → headline → subline → CTA pair → trust chips. Left-aligned, not centred.
- Right column (7/12): the **WhatSaid Studio mock** — a large `rounded-2xl` card styled as a product window (subtle window chrome bar with three dots, a tiny breadcrumb "interview-q3.m4a · 32:14", and a `Transcript | Summary | Questions` tab strip). Below the chrome, 5–6 lines of styled transcript with colored speaker dots, italic-serif speaker names, tabular timestamps, and one line gently highlighted (selection state) with a small floating chip "Ask about this" attached. Bottom-right: a tiny accent-teal "Saved" pill with a check.
- Background: two layered radial gradients — primary 15% top-right, accent 8% bottom-left — both behind everything, `pointer-events-none`. The mock floats with a tinted `shadow-2xl shadow-primary/10`.

**Layout (<lg)**: single column. Hero text first, then mock below at full width with reduced internal padding. Mock keeps full chrome on mobile (it *is* the proof).

**Content hierarchy**
- Eyebrow: serif italic, `text-caption text-primary` (full opacity) — kept.
- Headline: `text-display lg:text-[4.25rem]` — slightly larger than current top size. Drop the `<br>`. Replace `<span class="bg-primary/10 px-2 py-0.5">said</span>` with `<span class="font-serif italic text-primary">said</span>` — same word, editorial treatment.
- Subline: serif `text-body lg:text-lg`, `max-w-[52ch]`, left-aligned on lg.
- CTAs: primary stays solid `h-12`. Secondary becomes a **proper outline button** `variant="outline"` (not a plain link) — same height, same weight as primary. "See pricing" → "See pricing — from £4.99". Concrete number = stronger CTA.
- Trust chips: keep 3, but move them **under the hero subline** above the CTAs (not below — they support, they don't conclude), and make them lighter — no border, just `text-caption text-muted-foreground` with small icons. Less chrome, more flow.

**Visual product proof**
- The Studio mock is the proof. It must contain (all hardcoded, no data):
  - Window chrome row (3 dots + filename + duration).
  - Tab strip with "Transcript" active (primary underline), "Summary" and "Questions" inactive.
  - 5 transcript lines: speaker dot (alternating primary / accent / muted) + serif italic speaker name + tabular timestamp + body text. One line subtly background-highlighted with a small "Ask about this" floating chip.
  - Tiny status row at bottom: accent-teal dot + "Saved · 3 speakers · 32:14". 
- Everything is text + Tailwind. No image asset. Renders crisply at every resolution. Theme-aware automatically.

## 5) Product-section redesign plan

**Outcome section — from "3 cards" to "1 product, 3 surfaces"**

Replace `HomeOutcomeGrid` with a single large `rounded-2xl` premium card that contains:
- A header strip: eyebrow + h2 left-aligned, plus a **3-button segmented control** on the right: `Transcript · Summary · Questions`.
- Below the strip, a single content panel that swaps based on the active tab. **No real state — purely visual** (the segmented control is rendered but the panel shows all three side-by-side on desktop in a clever way: three vertical "panes" like a real multi-pane editor; on mobile we use a real `<Tabs>` from shadcn so only one shows at a time).
- Each pane uses a **distinct visual treatment** so the section stops feeling samey:
  - **Transcript pane**: chrome with speaker chips at top (3 colored dots + names), then 4 lines with timestamps + speaker names + transcript body. One line in "edit mode" (border-primary outline + caret). Caption beneath: "Edit any line — summary refreshes."
  - **Summary pane**: structured layout — small "KEY POINTS" micro-label, 3 bullets with primary checks; small "ACTIONS" micro-label, 2 bullets with accent-teal arrows; tiny "Updated just now" timestamp at bottom. Looks like an actual summary card.
  - **Q&A pane**: a question bubble (right-aligned, primary tint) "What did Sarah commit to?" followed by an answer block with the answer text in serif and a small "Cited from 00:14, 00:31" footer chip. Below, a faint "+ Add another transcript" affordance to hint at multi-transcript Q&A.

Section eyebrow → "What one upload gives you". Title → "One file. Three usable outputs."

**Beyond the transcript — from flat row to bento**

Replace the 4 equal tiles with a **bento grid**:
- Big tile (spans 2 cols on lg): **Edit & rename** — features a tiny inline mock: a speaker chip being renamed (input with caret), and below it a faded "Summary updated" badge in accent teal. This concretely shows the "edit causes summary refresh" loop.
- Three smaller tiles below it / beside it:
  - **Search & tags** — small mock: a search input with `interview` typed, three tag chips below (`product · q3 · roadmap`).
  - **Share & claim** — small mock: an email recipient avatar + `→` + a tiny "Claimed" check.
  - **Export anywhere** — small mock: four format chips (`TXT · JSON · DOCX · PDF`) with PDF showing a tiny "ready" dot.

Layout (lg): grid `grid-cols-3 grid-rows-2`, big tile spans `col-span-2 row-span-2`, others stack on the right. Mobile: single column, big tile first.

Background: keep the section on `bg-muted/30 border-y` for register contrast. Cards become `bg-card` (lighter than the band) — the contrast pop fixes the current "everything looks the same" problem.

## 6) Lower-page conversion redesign

**How it works**
- Keep three steps but redesign each step as a small "card-let": serif italic large numeral on the left (`text-5xl font-serif italic text-primary/30`), title + body on the right. Three card-lets in a horizontal flex with the dashed line connecting them through the centre at the numeral height. On mobile: vertical stack with the dashed line on the left going through the numerals.
- Replace the small icon circle with an inline lucide icon next to the title (smaller, more refined). Less visual noise, more typographic confidence.

**Privacy & trust — full-bleed contrast band**
- Move out of `container` and use a full-width section with `bg-foreground text-background` (inverted) on light mode, and `bg-muted/40` on dark mode. **This is the page's biggest contrast moment** and breaks the relentlessly light rhythm.
- Inside: a centred max-w-5xl block with eyebrow ("Built private by default"), large `text-h1` title, serif body, and the three bullets as inline pills `border border-background/20` in horizontal flex (not a vertical list). Reads as a confident statement, not a checklist.

**Pricing teaser**
- Replace the single-price card with a **horizontal value strip**:
  - Eyebrow: "Pay once. No subscription."
  - Headline: "Three packs. Pick what fits." (`text-h1`)
  - Below: three inline mini price cards in a single flex row — `1 credit · £4.99`, `5 credits · £14.99 (save 40%)`, `20 credits · £39.99 (save 60%)`. The middle one has `border-2 border-primary` + `shadow-primary/10`. Each is a small `rounded-xl` chip-card, not a full pricing card (that's pricing page's job).
  - Below: single primary CTA "See full pricing" + "How credits work" outline button.
- This actually previews the three packs and removes the "should I bother clicking?" hesitation.

**Mini FAQ**
- Keep the editorial 2-column layout. Left column gets a stronger ending: after the "See all answers →" link, add a primary `Button` "Try it free with one credit" → routes to `/signup` (or `/convert` if logged in). The page ends on action, not on a quiet link.
- Tighten the accordion: increase padding, add a small primary `+` indicator that rotates on open (already in shadcn primitive — just verify styling).

## 7) UX/UI implementation plan — files

**Modify**
- `src/pages/Index.tsx` — full restructure: split hero, replace outcome grid render with new component, replace beyond grid render, redesign how-it-works inline, change privacy section to full-bleed, replace pricing teaser markup, pass a `closingCta` prop to MiniFAQ.

**Replace internals (same file paths, new content)**
- `src/components/home/HomeOutcomeGrid.tsx` — rewrite as a single premium card with three product-mock panes (desktop side-by-side via internal subcomponents, mobile via shadcn `Tabs`).
- `src/components/home/HomeBeyondGrid.tsx` — rewrite as bento with one big tile + three small tiles, each containing a tiny inline mock.
- `src/components/home/HomeMiniFAQ.tsx` — add optional `closingCta` (primary button) in the left column.

**New components (kept page-local under `src/components/home/`)**
- `src/components/home/HeroProductMock.tsx` — the Studio mock used in the hero. Self-contained, no props needed, no data.
- `src/components/home/mocks/TranscriptMock.tsx`, `SummaryMock.tsx`, `QAMock.tsx` — three small presentational subcomponents used by the outcome card. Each renders pure Tailwind, no logic, all strings hardcoded (no i18n needed — they're labelled UI mocks not real product copy; the *names* "Sarah", "Marco" and short transcript snippets stay as visual filler, just like today).
- `src/components/home/PricingTeaserStrip.tsx` — the new horizontal three-chip pricing teaser.

**i18n**
- Add ~10 new keys (eyebrow + title rewordings + new CTA labels). Edit ~6 existing keys (hero CTA, pricing teaser headline/sub, outcome title). Keep all unchanged keys intact. EN written first, IT/FR translated in same edit using existing tone.
- Mock UI strings (speaker names, sample transcript lines, "Saved", tab labels, "Ask about this") stay **inline in the mock components** — they are visual furniture, not user-facing copy, and translating them would only complicate maintenance. (Same approach as the existing flourish in `HomeOutcomeGrid` today.)

**Untouched**
- Routing, AuthContext, design tokens, Tailwind config, Pricing page, all edge functions, all non-home pages, all existing UI primitives.

**Blast radius**: 1 page + 3 existing components rewritten + 5 new page-local components + i18n. Zero shared-component or logic changes.

## 8) Phased implementation

**Phase 1 — i18n foundation (smallest, ship first)**
- Edit `src/i18n/locales/{en,it,fr}.json`: add new keys, rewrite hero CTA secondary, rewrite pricing teaser to talk about "three packs", rewrite outcome title.
- Why first: copy is reversible and unblocks all other phases.
- Risk: none.
- Test: `/` renders without missing-key warnings in console for EN/IT/FR.

**Phase 2 — Hero split + product mock**
- Create `HeroProductMock.tsx`. Restructure hero in `Index.tsx` to two-column on `lg`, single-column on `<lg`. Replace inline highlight pill with serif italic span. Make secondary CTA a proper outline button with concrete pricing text. Layered ambient gradients.
- Why second: the hero is the highest-impact change; landing it in isolation makes the rest of the page easier to judge.
- Risk: layout overflow on tablet (768–1023). Mock must not horizontally scroll — verify at 768/834.
- Test: visual check at 360 / 768 / 1024 / 1440 in light + dark, EN/IT/FR. Verify CTAs route correctly. Verify focus-visible rings on outline button.

**Phase 3 — Outcome showcase rewrite**
- Rewrite `HomeOutcomeGrid.tsx` to single tabbed product card with 3 mock subcomponents. Desktop = 3-pane side-by-side; mobile = shadcn Tabs.
- Risk: the segmented control on desktop is decorative (not functional) — must not look interactive in a misleading way; render it without hover/click states on `lg` and as a real `Tabs` on `<lg`. Implement as a single component with a media-query-driven branch using the existing `useIsMobile` hook (`src/hooks/use-mobile.tsx`).
- Test: tab through with keyboard on mobile; verify the desktop segmented control has `aria-hidden="true"` since it's purely visual on lg.

**Phase 4 — Beyond bento + How-it-works refinement + Privacy band**
- Rewrite `HomeBeyondGrid.tsx` with bento layout and inline mini-mocks. Refine the how-it-works section in `Index.tsx` (numerals + connector). Move privacy to full-bleed inverted band.
- Risk: the inverted band must respect dark mode (use `bg-foreground text-background` which auto-inverts). Verify contrast both modes.
- Test: contrast check on inverted band; bento collapses cleanly on mobile (big tile first).

**Phase 5 — Pricing teaser strip + MiniFAQ closing CTA**
- Create `PricingTeaserStrip.tsx`. Add `closingCta` to `HomeMiniFAQ.tsx`.
- Risk: the three price chips might wrap awkwardly on tablet — verify at 768/834. Use `flex-wrap` with consistent min-widths.
- Test: chips render on one row at lg, wrap to 2 rows at sm without breaking, all CTAs route correctly.

**Phase 6 — QA pass**
- Keyboard-only nav full page, screen-reader landmark check, dark mode pass, 360px mobile pass, contrast spot-check on the inverted privacy band and the accent-teal pills inside mocks. Verify no horizontal scroll at any width. Verify reveal animations don't hide content for users with `prefers-reduced-motion` (existing hook doesn't gate on this — leave as-is, opacity transition is mild).

## 9) Final implementation-ready recommendation

**Final homepage section structure (`src/pages/Index.tsx`)**
```text
1. Hero
   left: serif eyebrow → display headline (with serif-italic "said") → serif subline → 3 trust chips → CTA pair (solid + outline w/ price)
   right (lg only): HeroProductMock — Studio window with chrome + transcript surface + saved pill
   bg: layered primary + accent radial gradients (lg only)
2. Outcome showcase (HomeOutcomeGrid rewritten)
   single premium card, segmented control header, 3 product-mock panes (Transcript / Summary / Q&A)
3. Beyond the transcript (HomeBeyondGrid rewritten)
   bento: 1 big tile (Edit & rename, with rename mock) + 3 small tiles (Search, Share, Export, each w/ tiny mock)
   on bg-muted/30 band for register contrast
4. How it works
   3 horizontal card-lets, large serif italic numerals, dashed connector
5. Privacy & trust
   full-bleed inverted band (bg-foreground text-background light / bg-muted/40 dark)
   inline pill bullets, not vertical list
6. Pricing teaser (PricingTeaserStrip new)
   3 inline price chips (£4.99 · £14.99 most-popular · £39.99) + 2 CTAs
7. Mini FAQ (HomeMiniFAQ updated)
   2-column editorial + closing primary CTA "Try it with one credit"
```

**Exact files to change/create**
- Modify: `src/pages/Index.tsx`, `src/i18n/locales/{en,it,fr}.json`, `src/components/home/HomeOutcomeGrid.tsx`, `src/components/home/HomeBeyondGrid.tsx`, `src/components/home/HomeMiniFAQ.tsx`.
- Create: `src/components/home/HeroProductMock.tsx`, `src/components/home/PricingTeaserStrip.tsx`, `src/components/home/mocks/TranscriptMock.tsx`, `src/components/home/mocks/SummaryMock.tsx`, `src/components/home/mocks/QAMock.tsx`.
- Untouched: every other file.

**Exact visual priorities**
1. Real product mocks in hero + outcome section — this single change carries 70% of the redesign.
2. Two-register rhythm — Studio cards (lush, mock-bearing) alternated with Editorial sections (typographic, calm).
3. Sparing accent teal as a *product state color* inside mocks (Saved, Updated, Cited).
4. Full-bleed inverted privacy band as the page's strongest contrast moment.
5. Concrete numbers on CTAs and pricing teaser ("from £4.99", three pack chips).

**Areas where the homepage becomes more visually exciting**
- Hero: split layout + product mock + layered ambient gradients.
- Outcome: tabbed multi-pane product surface (not three text cards).
- Beyond: bento with inline mini-mocks (not a flat 4-up).
- Privacy: inverted full-bleed band.
- Pricing teaser: three real packs visible inline.

**Risks to avoid**
- Do NOT make the segmented control on desktop appear interactive (mark `aria-hidden`, render functional `Tabs` only on mobile via existing `useIsMobile`).
- Do NOT add image assets — every mock is hand-built with Tailwind to stay theme-aware and crisp.
- Do NOT introduce a third color — only existing primary + existing accent + existing neutrals.
- Do NOT translate mock UI strings (speaker names, sample transcript lines) — they are visual furniture.
- Do NOT touch any logic, route, or business-truth claim. All public claims stay grounded in `capabilities.md` (auto-detect language, async processing, audio deleted after processing, three outputs per upload, multi-transcript Q&A, share & claim, TXT/JSON/DOCX sync + PDF async).
- Do NOT add new motion — reuse existing `useScrollReveal` only.

