

## Revised plan — visual lift, no bloat

The structural plan from the previous round stands (9 homepage sections, 8 pricing sections, same files, same components). What changes here is the **visual direction**: stronger first impression, richer card hierarchy, sharper rhythm — built entirely from existing design tokens (Inter UI / Source Serif 4 reading / `hsl(250 75% 55%)` primary / glass-with-restraint).

I am also **simplifying two sections** so the lift comes from presentation, not sprawl.

### Section simplifications (so visual ≠ bloat)

- **Homepage section 9 (Final CTA bar)** → **removed**. The pricing-teaser block (section 7) already carries a CTA; a second CTA strip 200px later is noise. Page ends on the Mini FAQ, which doubles as a final reassurance + has its own "See all answers" link.
- **Homepage section 2 (Stats strip)** → **merged into the hero** as 3 inline trust chips beneath the CTAs. Removes a flat utility band, makes the hero do more work.

Net: homepage drops from 9 → 7 sections, each more impactful.

Pricing keeps all 8 sections — they each earn their place.

---

### 1) Revised visual direction — Homepage

**Hero (the big lift)**
- Layout: centred, but on `≥lg` an off-axis decorative element on the right — a single soft radial-gradient orb in `primary/15`, blurred, behind the hero (one element, no animation). Adds depth without a hero illustration.
- Eyebrow chip: replace the current pill with a **serif eyebrow** in Source Serif 4 italic (`text-caption`, `text-primary/80`, no background, no border) — tiny but immediately distinctive vs every other SaaS hero.
- Headline: `text-display`, **two-line forced break** on desktop, with the highlight word ("audio" or "answers") wrapped in a `<span>` that gets a subtle `bg-primary/10` rounded-md inline highlight (1-2px padding). Editorial, not neon.
- Subline: Source Serif 4, `text-body`, max-width `60ch`, centred. The serif on the subline is the single strongest "this is not a generic SaaS" signal.
- CTAs: primary stays solid `h-12`; secondary becomes a **ghost link with arrow** (no border) — reduces visual weight, makes the primary CTA dominate. Both buttons get `shadow-sm` lift on hover.
- Trust chips (the absorbed stats strip): 3 chips directly under the CTAs, `text-caption`, icon + text, each in a `bg-muted/40 border-border/60 rounded-full px-3 py-1.5` glass-light treatment. Honest content: "Speakers labelled" · "Auto-detect language" · "Audio deleted after processing".

**HomeOutcomeGrid (section 3) — the "wow" moment**
- 3 cards, NOT equal: a **2-1-1 weighted grid on `≥lg`** — Transcript card spans 2 columns and 2 rows (the hero card), Summary and Q&A stack on the right. This asymmetry alone reads as "designed", not "templated".
- Each card: `rounded-2xl` (one step rounder than default), `border-border/60`, `bg-card`, `shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all`. Subtle, premium, not animated-feeling.
- Icon treatment: NOT the standard `bg-primary/10` square. Use a **larger circular gradient badge** `bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10`, `w-12 h-12`. Distinctive across the page.
- Title: `text-h3` Inter; description: `text-body` Source Serif 4 (the serif appears here too — strong recurring identity); bullets: 2 only, `text-secondary` with a small `text-primary` checkmark icon.
- The Transcript hero card additionally renders a tiny *visual sample* — a 4-line monospaced-not-monospace mock (`font-serif text-caption text-muted-foreground`) like `"00:14  Sarah — We need to ship before Q2."` × 3. No real data, just a typographic flourish that shows the product. This is the "memorable moment".

**HomeBeyondGrid (section 4) — rhythm contrast**
- Intentionally **denser, flatter** than section 3. 4 tiles in `lg:grid-cols-4`, smaller padding (`p-5`), no shadows, just `border-border/60 bg-card hover:border-primary/30`. Icons in plain `text-primary` (no badge). The visual contrast with the lush section 3 is what creates rhythm.

**How it works (section 5)**
- Strip the existing icon-circle treatment. Replace with a **horizontal numbered timeline on `≥md`**: three step blocks connected by a thin `border-t border-dashed border-border` line. Step number in serif italic (`text-h2 font-serif italic text-primary/40`) — large, decorative, restrained. Title `text-h3`, body `text-secondary`.

**Privacy & trust (section 6)**
- Single full-width card, `bg-gradient-to-br from-muted/40 via-card to-muted/30 border border-border/60 rounded-2xl p-8 sm:p-12`. Two-column on `≥md`: left = `text-h2` headline + serif body; right = 3 short bullets with shield/globe/trash icons. Calm, "footer of trust".

**Pricing teaser (section 7)**
- Wide single card, `border-2 border-primary/20 bg-primary/5 rounded-2xl`, centred content. Headline `text-h1` with the price inline `<span class="font-serif italic">£4.99</span>` — serif italic on the number is the conversion-moment flourish. Sub-line + single CTA. No second tile, no comparison here — that's what /pricing is for.

**Mini FAQ (section 8, now last)**
- Two-column grid on `≥md`: left = `text-h2` "Common questions" + a small "See all answers →" link; right = the 4-item Accordion. Card-less, just spacing — gives the page a calm, editorial finish.

**Section rhythm (top → bottom)**
`hero (lush)` → `outcome grid (lush, asymmetric)` → `beyond grid (dense, flat)` → `how it works (airy, typographic)` → `privacy card (gradient, calm)` → `pricing teaser (focused, primary-tinted)` → `mini FAQ (editorial, calm)`. Alternating energy levels keep the page interesting without ever shouting.

---

### 2) Revised visual direction — Pricing

Hero stays simpler than the homepage (per request) but visibly more premium than today.

**Hero**
- Same off-axis primary orb as homepage, but smaller and lower-opacity (`primary/8`).
- Eyebrow: serif italic `text-caption text-primary/80` — **"Pay once. No subscription."** (this *is* the differentiator; it deserves the eyebrow slot).
- Headline `text-h1`, subline serif `text-body` — same family discipline as homepage.
- Two CTAs: primary "Get started" + ghost "How credits work" (anchor scroll to the credit-duration table). The anchor CTA is a small but smart conversion move.

**Tightened value tiles (section 2)**
- 3 cards, equal width, each with the same gradient icon badge from the homepage outcome grid (recurring visual motif = brand identity). `rounded-2xl`, `border-border/60`, `hover:border-primary/30 hover:shadow-md`. Each card body: `text-h3` title + serif `text-body` description (one sentence, no bullets — restrained).

**CreditDurationTable (section 3) — the conversion-critical moment**
- A single elegant horizontal card, NOT a `<table>` element. On `≥sm`: 4 columns separated by thin vertical dividers (`divide-x divide-border/60`), each cell shows duration on top (`text-h2 font-serif`) and credits below (`text-caption uppercase tracking-wide text-muted-foreground`). Reads like a luxury menu. On mobile: stacked rows with the same typography.
- Card chrome: `bg-gradient-to-br from-card via-card to-muted/20 border border-border/60 rounded-2xl p-6 sm:p-8`. Headline above: `text-h2` + one-line serif sub.

**Pricing cards (section 4) — sharper emphasis**
- Keep the existing 3-card grid. Visual upgrades:
  - The 5-pack ("Most popular") card gets: `border-2 border-primary` (currently `border-primary`), a slight `scale-[1.02]` on `≥md`, and a `shadow-xl shadow-primary/10` (tinted shadow — premium moment). The "Most popular" badge stays.
  - All cards: `rounded-2xl`, prices in `text-display font-semibold` with the **currency symbol in serif italic at 70% size** (`<span class="font-serif italic text-3xl">£</span>14.99`) — distinctive numeric treatment that ties to the homepage hero.
  - PerCreditValue line: `text-caption text-primary` directly under the price, format `"£3.00 / credit · save 40%"` for 5-pack, `"£2.00 / credit · save 60%"` for 20-pack. Single line, computed.
  - Microcopy strip directly above the cards: thin row `text-caption text-muted-foreground` with three inline items separated by `·` — "Pay once" · "No subscription" · "Results stay saved". One restrained line, no card.

**Why an account, How a credit gets used, FAQ, Final CTA**
- "Why an account": same gradient-card treatment as homepage Privacy card — recurring visual motif.
- "How a credit gets used": same horizontal numbered timeline as homepage section 5. Recurring motif #2.
- FAQ: card-less editorial layout, identical to homepage Mini FAQ. Recurring motif #3.
- Final CTA: keep, but downgrade visual weight — single sentence + single button, no card.

**Recurring visual motifs across both pages (this is what creates premium identity)**
1. Serif italic eyebrows.
2. Serif italic numbers/symbols inside otherwise-sans displays (price `£`, step numbers).
3. Gradient circular icon badges with `ring-1 ring-primary/10`.
4. `rounded-2xl` cards with `border-border/60` (one step softer than the default `rounded-lg`).
5. Gradient-tinted "trust" cards (`from-muted/40 via-card to-muted/30`).
6. Editorial card-less FAQ + headline blocks.

Six small motifs, applied consistently across both pages = a recognisable visual identity without adding weight.

---

### 3) Updated UX/UI strategy

**How the pages become more visually exciting (without noise)**
- Asymmetric grids in 1-2 high-value spots (homepage outcome grid only) — instantly reads as designed.
- Mixing Inter and Source Serif 4 *inside the same display elements* (italic serif eyebrows, italic serif numbers in sans prices). This is the cheapest, most distinctive visual move available and uses fonts already loaded.
- Tinted shadows on the primary card (`shadow-primary/10`) instead of generic grey shadows.
- Consistent `rounded-2xl` + `border-border/60` upgrade across hero cards.
- One soft primary radial-gradient orb per page hero (replaces flat gradient overlays). Single element, no animation, static positioning, `pointer-events-none aria-hidden`.
- Numbered serif italic step numbers in "How it works" — typographic decoration replacing icon-heavy treatment.

**Where stronger emphasis is appropriate**
- Hero headline + the highlight span.
- Homepage outcome grid (the asymmetric 2-1-1).
- Pricing 5-pack card (border + tinted shadow + scale).
- Credit duration table (the conversion linchpin).
- Price numerals (serif italic currency).

**Where calm simplicity must remain**
- Beyond-the-transcript grid (intentional flatness for rhythm contrast).
- All FAQ blocks (card-less editorial).
- Microcopy strips, trust chips, footer-adjacent content.
- The body text of every reading surface (serif, generous line-height, never decorated).

**Mobile (≤sm) — premium without flattening**
- Asymmetric grid collapses to single column but keeps the `rounded-2xl` + larger hero card padding (`p-6 sm:p-8`) so the first card still feels generous.
- Trust chips wrap to 2 rows, never shrink below `text-caption`.
- Credit duration table stacks vertically with the serif numerals at full size — the typography carries the premium feel even at 360px.
- Price card: 5-pack keeps `border-2 border-primary` and tinted shadow but loses the `scale-[1.02]` (would clip on mobile).
- Off-axis hero orb hides on `<lg` (`hidden lg:block`) — at small widths it would feel decorative-only.

**Desktop (≥lg) — more drama, same clarity**
- Off-axis orb appears.
- Outcome grid becomes 2-1-1 asymmetric.
- 5-pack scales 1.02× and shows tinted shadow.
- "How it works" timeline rendered horizontally with the dashed connector line.

**Accessibility (mandatory check)**
- All decorative elements (orb, dashed connector line, gradient badges, large serif step numbers) get `aria-hidden="true"`.
- Serif italic eyebrows verified at `text-caption` size for contrast on `bg-background` and `bg-card` (passes AA at `text-primary/80` on both light/dark — confirmed via existing token contrast).
- Highlight `<span>` on hero headline is purely visual; the headline reads naturally to screen readers.
- Tinted primary shadow does not affect contrast (decorative).
- Asymmetric grid order matches reading order (Transcript → Summary → Q&A) so DOM = visual = SR order.
- All new icons inside cards remain `aria-hidden`; the card title carries the meaning.
- Reduced-motion: hover translate-y and scale already inherit from existing utility patterns; no new motion added that requires `prefers-reduced-motion` handling.

---

### 4) Updated implementation-ready recommendation

**Final homepage section structure (`src/pages/Index.tsx`) — 7 sections**
```text
1. Hero               — orb + serif eyebrow + display headline w/ highlight span + serif subline + 2 CTAs + 3 trust chips
2. HomeOutcomeGrid    — asymmetric 2-1-1 (Transcript hero card + Summary + Q&A) with sample-line flourish
3. HomeBeyondGrid     — flat dense 4-tile grid (rhythm contrast)
4. How it works       — horizontal numbered timeline, serif italic step numerals
5. Privacy & trust    — gradient card, 2-column on ≥md
6. Pricing teaser     — primary-tinted card, serif italic price numeral, single CTA
7. HomeMiniFAQ        — editorial 2-column, "See all answers →" link
```

**Final pricing section structure (`src/pages/Pricing.tsx`) — 8 sections**
```text
1. Hero                   — small orb + serif eyebrow ("Pay once. No subscription.") + 2 CTAs (one anchors to §3)
2. Value tiles            — 3 outcome cards w/ gradient icon badges
3. CreditDurationTable    — elegant horizontal "menu" card, serif numerals
4. Pricing cards          — rounded-2xl, serif italic currency, tinted shadow on 5-pack, per-credit value line, microcopy strip above
5. Why an account         — gradient card (matches homepage motif)
6. How a credit gets used — horizontal numbered timeline (matches homepage motif)
7. FAQ                    — editorial card-less layout (matches homepage motif)
8. Final CTA              — one sentence + one button, no card
```

**Files modified / created — unchanged from prior plan**
- Modify: `src/pages/Index.tsx`, `src/pages/Pricing.tsx`, `src/i18n/locales/{en,it,fr}.json`.
- Create: `src/components/home/HomeOutcomeGrid.tsx`, `src/components/home/HomeBeyondGrid.tsx`, `src/components/home/HomeMiniFAQ.tsx`, `src/components/pricing/CreditDurationTable.tsx`, `src/components/pricing/PerCreditValue.tsx`.
- Untouched: every other file, all routing, AuthContext, Paddle integration, design tokens, Tailwind config, edge functions.

**Messaging priorities (unchanged, restated)**
- Lead with outcome ("walk away with a clean speaker-labelled transcript, structured summary, and answers to your own questions").
- Differentiators surfaced visually: speaker labels, multi-transcript Q&A, summary auto-refresh, share-and-claim, export.
- Honest framing for language ("Auto-detect with manual override") and processing ("Asynchronous, results saved when ready"). No 99-languages, no "minutes" promise.

**Conversion / trust improvements (final list)**
- Hero trust chips replace flat stats strip.
- Asymmetric outcome grid + sample-line flourish raises perceived product depth.
- Credit duration table immediately above pricing cards.
- Per-credit value + savings on 5-pack and 20-pack (computed from `src/lib/pricing.ts`).
- Microcopy "Pay once · No subscription · Results stay saved" above cards.
- "How credits work" anchor CTA in pricing hero (smart secondary path).
- Mini FAQ on homepage so visitors don't bounce to resolve hesitation.
- Recurring visual motifs (serif italics, gradient badges, rounded-2xl, gradient trust cards) build identity across both pages.

**Wording areas that must stay conservative (unchanged)**
- Language: "Auto-detect with manual override" only.
- Speed: "Asynchronous, results saved when ready" — no minutes claim.
- Accuracy: never quote a percentage.
- Privacy: only what CAP-033 supports.
- Sharing: if detail is shown, include "link expires in 2 days, single claim".
- Failure-refund FAQ item: include only if `supabase/functions/_shared/job-failure.ts` confirms behaviour at copy time; otherwise omit.

**Phased implementation (unchanged 4 phases)**
1. Truth corrections in i18n (smallest, ship first).
2. Homepage restructure + 3 new components + visual motifs.
3. Pricing restructure + 2 new components + visual motifs.
4. Polish & QA (keyboard, dark mode, reduced motion, mobile 360px, contrast spot-check).

