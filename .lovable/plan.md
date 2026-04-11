

# WhatSaid Design, UI & UX Review + Implementation Plan

## A. Deep Audit Findings

### Critical Issues

1. **Calendar selected-day styling is broken.** The `day_selected` uses `bg-primary` which is a medium-saturation purple. In the popover context on dark mode especially, the selected state lacks sufficient contrast and feels ambiguous. The `day_today` style (`bg-accent`) can clash with selected when today is selected. No ring or outline distinguishes selection from hover.

2. **No systematic focus-visible styling.** Most interactive elements rely on the browser default or a thin ring that gets lost. Speaker chips, badge-buttons in JobDetail, the date picker trigger button, and several ghost buttons lack deliberate focus states.

3. **Inconsistent border-radius.** The design system defines `--radius: 0.75rem` but components mix `rounded-xl` (1rem), `rounded-lg` (0.75rem), `rounded-md`, `rounded-full` (badges), and `rounded-2xl` (dropzone icon). There is no rule for when to use which.

4. **Glass effects used without clear rules.** `glass-navbar`, `glass-dropzone`, `glass-badge` each define their own opacity/blur values. The badge glass in Profile and Navbar uses translucent backgrounds that reduce text contrast in certain contexts.

5. **Weak interactive states across the board.** Ghost buttons have a subtle hover but no pressed/active state. Tab triggers lack an active-tab indicator beyond a faint shadow. Badges used for status (History page) rely solely on colour, which is an accessibility issue.

6. **Typography hierarchy is inconsistent.** Page headings range from `text-2xl` to `text-3xl` to `text-xl` with no clear rule. Sub-headings inside cards use `text-base font-semibold` in some places and `text-sm font-semibold` in others.

7. **Colour system issues:**
   - `--primary` (purple 245/58/50) and `--accent` (teal 170/55/42) are both used for icons, creating visual noise. Accent is barely used in practice, making it feel random when it appears.
   - `--success`, `--warning` defined but only used in History status badges. No info-level colour exists.
   - Dark mode primary is lighter (`245 65% 62%`) which is correct, but the foreground pairing is pure white, reducing the premium feel.

8. **Mobile density problems.** The History page cards pack too much metadata (duration, language, date, model) into a single row on mobile. The JobDetail metadata badges wrap awkwardly.

9. **Empty and loading states are minimal.** Loading is plain text ("Loading results..."). Empty states use a muted icon + text but no illustration or warmth. For a premium product handling sensitive contexts, these moments matter.

10. **AI disclaimer styling is weak.** The warning at the bottom of JobResults uses `AlertTriangle` but blends into the page. For medical/legal contexts, this needs to be unmissable without being alarming.

### Moderate Issues

- Login page still shows `Mic` icon instead of brand mark
- No skeleton loading states anywhere
- Textarea in Questions tab has an absolute-positioned button that clips on small screens
- Export dropdown repeats identical menu items across all three tabs (DRY violation)
- Checkbox styling (consent, Q&A include) has no custom checked colour
- Badge component defaults to `rounded-full` but most usage overrides to `rounded-lg`
- Footer is minimal and inconsistent with the premium feel
- Profile page stat cards have no hover state
- Settings page card headings use `text-base` while other pages use `text-lg`

---

## B. Refined Design Direction

### Palette Refinement

```text
Primary:    hsl(245 58% 50%) → hsl(245 50% 48%)  [slightly desaturated, more corporate]
Accent:     Keep teal but restrict to success/positive indicators only
Surfaces:   Reduce from 3 glass variants to 1 reusable glass utility
State:      Add explicit --info colour (blue, ~210 60% 50%)
```

**Rule: Primary is for interactive elements and brand marks only. Accent (teal) is for positive states (success, completed). Never use both in the same visual cluster.**

### Typography Scale

```text
Page title:     text-2xl sm:text-3xl font-bold (font-heading)
Section title:  text-lg font-semibold (font-heading)
Card heading:   text-base font-semibold (font-heading)
Body:           text-sm leading-relaxed (font-body)
Caption:        text-xs text-muted-foreground
```

### Spacing

- Page padding: `py-10 sm:py-14` (reduce from `py-12 sm:py-16`)
- Card padding: `p-5 sm:p-6` (standardise)
- Section gaps: `space-y-6` between cards

### Border Radius Rules

```text
Page-level cards, dialogs:   rounded-xl (1rem)
Buttons, inputs, triggers:   rounded-lg (0.75rem)
Badges, chips, small pills:  rounded-lg (0.75rem), NOT rounded-full
Icon containers:             rounded-xl (1rem)
Never use rounded-2xl except for the dropzone icon container.
```

### Glass Rules

- **Navbar only.** Remove glass from badges and dropzone.
- Dropzone: use `bg-muted/50 border-dashed border-border` instead of glass.
- Credit badge in navbar: use `bg-muted` with solid border instead of glass.

### Dark Mode Rules

- All surfaces must have at least 4.5:1 contrast for text
- Primary interactive elements: use the lighter primary (`hsl(245 65% 62%)`) but pair with `hsl(0 0% 100%)` only for buttons, not for subtle text
- Card borders: `hsl(225 15% 18%)` not transparent
- Glass navbar: keep but increase background opacity to 0.75

---

## C. UI State Rules

### Selected State (Universal)

- **Background:** `bg-primary` with `text-primary-foreground`
- **Must include** a 2px ring or visible border change as secondary indicator
- **Calendar selected day:** `bg-primary text-white ring-2 ring-primary/30`
- **Tabs active:** `bg-background shadow-sm border border-border/60` (current is close but needs the border)

### Hover State

- Buttons: `brightness-110` or `bg-primary/90` for filled; `bg-muted` for ghost
- Cards: `border-primary/20 shadow-md` transition
- Links: `text-primary` with underline on hover

### Focus-Visible State

- All interactive elements: `ring-2 ring-ring ring-offset-2 ring-offset-background`
- No exceptions. Every clickable element must show this.

### Disabled State

- `opacity-50 cursor-not-allowed pointer-events-none`
- Never reduce opacity below 0.5

### Active/Pressed State

- Filled buttons: `scale-[0.98] brightness-95`
- Ghost buttons: `bg-muted/80`

### Calendar/Date-Picker Rules

- Selected: solid `bg-primary text-white`, never ambiguous
- Today (not selected): `font-bold text-primary` with a dot indicator, NOT a background fill
- Range/outside days: `opacity-40`
- Hover: `bg-primary/10`

### Badge/Chip Rules

- Status badges: always include an icon AND colour (never colour alone)
- Speaker chips: `bg-muted border border-border` with edit affordance on hover
- Metadata badges: `variant="outline"` with icon, consistent `rounded-lg`

### Card/Surface Layering

```text
L0: Page background (--background)
L1: Cards (--card) with border-border
L2: Nested surfaces inside cards (bg-muted/50) — e.g. file info bar, confirm section
L3: Popovers/dropdowns (--popover) with shadow-lg
```

---

## D. Prioritised Implementation Roadmap

### Phase 1: Design Tokens & CSS Foundation (highest impact, no component changes)

1. **Refine CSS custom properties** in `src/index.css`:
   - Adjust primary saturation
   - Add `--info` colour token
   - Improve dark mode surface contrast
   - Fix `day_today` vs `day_selected` conflict in calendar

2. **Fix calendar component** (`src/components/ui/calendar.tsx`):
   - Rewrite `day_selected` to use high-contrast solid primary with ring
   - Change `day_today` to text-only indicator (no background fill)
   - Add `pointer-events-auto` to className
   - Add proper hover state for days

3. **Standardise glass utilities** in `src/index.css`:
   - Remove `glass-badge` and `glass-dropzone` classes
   - Increase navbar glass opacity

4. **Add global active/pressed state** via Tailwind plugin or base layer styles

### Phase 2: Component System Fixes

5. **Badge component** — change default from `rounded-full` to `rounded-lg`

6. **Tabs component** — add `border border-border/60` to active state, ensure focus-visible ring

7. **Button focus/active states** — add `active:scale-[0.98]` and verify `focus-visible:ring-2` on all variants

8. **Checkbox** — ensure checked state uses primary colour visibly

9. **Select/Input** — verify consistent `rounded-lg h-11` sizing, add focus ring

10. **Skeleton loading component** — create a reusable skeleton for cards and text blocks

### Phase 3: Page-Level Improvements

11. **Navbar** — replace glass-badge credit indicator with solid `bg-muted` badge; fix Login page Mic icon to match brand

12. **JobDetail page** — fix metadata badge wrapping on mobile; standardise heading sizes; improve date picker trigger styling

13. **JobResults** — standardise action bar styling across tabs (DRY); improve Q&A empty state; strengthen AI disclaimer with a more intentional warning card

14. **History page** — improve mobile card density; add skeleton loading; improve empty state warmth

15. **Convert page** — replace glass-dropzone with solid muted surface; improve processing stepper visual clarity

16. **Profile page** — add hover states to stat cards; fix typography hierarchy

17. **Settings page** — align card heading sizes; improve danger zone visual weight

18. **Login page** — update branding icon; improve form spacing

19. **Footer** — add more substance (link groups, trust indicators)

### Phase 4: Polish & Accessibility Sweep

20. **Full keyboard navigation audit** — test every interactive element with Tab key
21. **Contrast audit** — verify 4.5:1 on every text/background pair in both themes
22. **Screen reader audit** — verify aria-labels, roles, and live regions
23. **Touch target audit** — ensure 44x44px minimum on all mobile tap targets

---

## E. Risks & Things to Avoid

1. **Do not change business logic.** All changes are CSS, component styling, and layout only.
2. **Do not change the colour system drastically.** Refine the existing purple/teal, don't replace it.
3. **Do not add new animations or transitions beyond what exists.** Keep the calm, professional feel.
4. **Do not over-engineer the glass effect removal.** Simply replace with solid alternatives.
5. **Do not change component APIs.** All fixes are internal styling, not prop changes.
6. **Do not touch edge functions, database queries, or auth logic.**
7. **Test dark mode and light mode after every phase** before moving to the next.
8. **Do not use decorative illustrations** — the product handles serious contexts. Keep empty states text-based but warmer in tone.
9. **Calendar fix is Phase 1 priority** — it is the most visible broken state and sets the standard for all other state fixes.

