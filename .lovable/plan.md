

# WhatSaid -- Product Structure and UI/UX Direction

## A. Information Architecture

```text
WhatSaid
├── / (Homepage)                    -- Guest & logged-in
│   ├── Hero + Upload CTA
│   ├── Capabilities
│   ├── How it works
│   ├── Pricing overview
│   └── Footer
├── /convert (Conversion page)      -- Guest & logged-in
│   ├── Upload + validate
│   ├── Language selector
│   ├── Custom prompt input
│   ├── Payment / credit deduction
│   ├── Processing state
│   └── Results + downloads
├── /login                          -- Guest only
├── /signup                         -- Guest only
├── /profile                        -- Logged-in only
│   ├── Display name, email
│   ├── Credit balance + buy link
│   └── Quick stats (jobs, last job)
├── /settings                       -- Logged-in only
│   ├── Change password
│   ├── Default language preference
│   └── Delete account
├── /history                        -- Logged-in only
└── /credits                        -- Logged-in only
```

Key change from current: the upload flow should live on a dedicated `/convert` page, not on the homepage hero. The homepage should sell; the convert page should do.

## B. Navigation Structure

**Header (all pages):**
- Logo (left)
- Nav links: Convert, Pricing (anchor to homepage section)
- Right side:
  - Guest: "Sign in" (ghost) + "Get started" (primary)
  - Logged in: Credit badge, avatar dropdown (Profile, Settings, History, Sign out)

**Mobile:** Hamburger with same items. Credit badge always visible in header for logged-in users.

**Footer:** Minimal -- links to Pricing, Privacy, Terms. No heavy footer for MVP.

## C. Homepage Section Order

1. **Hero** -- Headline + subheadline + primary CTA. No upload widget here.
2. **Social proof strip** -- Optional placeholder: "Trusted by X teams" or "99 languages supported" stat bar. Even without real logos, a stat strip (e.g., "99 languages / Speaker labels / Audio deleted after use") adds weight.
3. **How it works** -- 3-step visual: Upload → Process → Download. Anchors the product in simplicity.
4. **Capabilities grid** -- 6 cards (existing content is good). Keep current icons/copy.
5. **Pricing snapshot** -- Guest one-off prices + credit pack summary. CTA to /convert and /signup.
6. **Trust/privacy strip** -- "Audio deleted immediately. No storage. No retention." Single-line reassurance.
7. **Footer**

**Reasoning:** Hero sells the outcome ("know what was said"). How-it-works reduces uncertainty. Capabilities build desire. Pricing removes the last objection. Trust closes.

## D. CTA Labels

| Location | Label | Reasoning |
|---|---|---|
| Hero primary | **"Convert your audio"** | Action-oriented, product-specific, avoids jargon like "transcribe" |
| Hero secondary | "See pricing" | Scrolls to pricing section |
| Nav (guest) | "Sign in" / **"Get started"** | Standard, clear |
| Nav (logged-in) | **"Convert"** | Single word, always accessible |
| Convert page button (guest) | "Pay $X.XX and convert" | Price transparency before action |
| Convert page button (account) | "Use X credits and convert" | Credit transparency |
| Pricing section | "Start converting" → /convert | Reinforces the action |
| Credit pack | "Buy X credits" | Direct |

Avoid: "Transcribe now" (jargon), "Get transcript" (too literal), "Upload" (describes a step, not the outcome).

## E. Liquid Glass Design System for Corporate Use

**Philosophy:** Liquid Glass is about depth through translucency, not decoration. For a corporate product, use it as a material system -- surfaces have consistent physical properties -- not as eye candy.

**Where glass works well:**
- Navbar (sticky, blurred backdrop over content)
- Upload drop zone (frosted surface, invites interaction)
- Stat/credit badges (subtle translucent chip)
- Modal/dialog overlays

**Where NOT to use glass:**
- Body text areas (readability is paramount)
- Form inputs (must look solid and editable)
- Primary action buttons (must feel solid and clickable)
- Data tables / history list items (clarity over style)
- Pricing cards (need to feel stable and trustworthy)

**Glass CSS recipe (refined from current `.glass`):**
```text
Light mode:
  background: white/70 (rgba with 0.7 opacity)
  backdrop-filter: blur(20px) saturate(1.3)
  border: 1px solid black/5
  box-shadow: 0 1px 3px black/4, inset 0 1px 0 white/60

Dark mode:
  background: slate-900/60
  backdrop-filter: blur(20px) saturate(1.2)
  border: 1px solid white/8
  box-shadow: 0 1px 3px black/20, inset 0 1px 0 white/5
```

## F. Colour Palette

### Light Mode
| Token | Value | Use |
|---|---|---|
| Background | `hsl(220 20% 97%)` | Page bg (keep current) |
| Surface | `white` | Cards, panels |
| Glass surface | `white/70` | Navbar, upload zone |
| Primary | `hsl(245 58% 50%)` | Buttons, links, accents -- slightly deeper than current for better contrast |
| Primary hover | `hsl(245 58% 44%)` | |
| Accent | `hsl(170 55% 42%)` | Success states, secondary highlights |
| Text primary | `hsl(220 25% 10%)` | Keep |
| Text secondary | `hsl(220 10% 45%)` | Keep |
| Border | `hsl(220 15% 90%)` | Keep |
| Glass border | `black/5` | Subtle for glass surfaces |

### Dark Mode
| Token | Value | Use |
|---|---|---|
| Background | `hsl(225 25% 6%)` | Keep |
| Surface | `hsl(225 20% 9%)` | Keep |
| Glass surface | `hsl(225 20% 9%)/60` | Navbar, upload zone |
| Primary | `hsl(245 65% 62%)` | Slightly brighter for dark bg |
| Text primary | `hsl(210 20% 95%)` | Keep |
| Border | `hsl(225 15% 15%)` | Keep |
| Glass border | `white/8` | |

**Dark mode activation:** Use `prefers-color-scheme: dark` via a small script in `index.html` that adds `.dark` class to `<html>`. No toggle in MVP -- follow system preference.

## G. Typography, Spacing, and Component Guidance

**Typography:**
- Headings: Space Grotesk, weights 600-700. Keep.
- Body: Inter, weights 400-500. Keep.
- Hero h1: 3rem mobile / 4rem desktop (current sizing is good)
- Section headings: 1.75rem / font-semibold
- Body: 1rem / 1.625 line-height
- Small/captions: 0.875rem

**Spacing system:**
- Section padding: `py-16 sm:py-24` (keep current)
- Card padding: `p-5 sm:p-6`
- Content max-width: `max-w-5xl` for grids, `max-w-2xl` for forms/convert
- Component gaps: `gap-6` for grids, `space-y-4` for form stacks

**Cards:**
- Solid white/surface background (NOT glass) for content cards
- `rounded-xl` (increase from current `rounded-lg` for 2026 feel)
- `border border-border/50` with `hover:border-primary/20` transition
- Subtle shadow: `shadow-sm hover:shadow-md transition-shadow`

**Buttons:**
- Primary: solid bg-primary, `rounded-lg`, `h-11` for main CTAs, `h-10` default
- Ghost/outline: for secondary actions
- No glass effect on buttons -- they must feel tappable and solid

**Inputs:**
- Solid background (`bg-background`), clear border
- `rounded-lg`, `h-11` for comfortable touch targets
- Focus ring using primary colour

**Glass treatment (limited to):**
- `.glass-navbar` -- sticky header only
- `.glass-dropzone` -- audio upload area
- `.glass-badge` -- credit/stat chips
- No other glass surfaces

## H. Guest vs Logged-In Differences

| Element | Guest | Logged-in |
|---|---|---|
| Nav right | "Sign in" + "Get started" | Credit badge + avatar dropdown |
| Homepage hero CTA | "Convert your audio" | "Convert your audio" (same) |
| /convert flow | Upload → price shown → Stripe checkout → results via token | Upload → credits shown → confirm → results in history |
| /convert results | Accessible via guest token URL for 30 days | Accessible via /history permanently |
| /history | Not accessible (redirect to login) | Full job list |
| /profile | Not accessible | Name, email, credits, stats |
| /settings | Not accessible | Password, preferences, delete |
| /credits | Redirect to signup with "Sign up to buy credit packs" | Full credit pack purchase page |
| Pricing section (homepage) | Shows guest prices + "Save up to 50% with an account" | Shows credit balance + "Buy more credits" |

## I. Risks of Overusing Liquid Glass

1. **Readability loss.** Translucent backgrounds over busy content make text hard to read. Mitigation: only apply glass to elements over controlled/gradient backgrounds, never over user content.
2. **Performance.** `backdrop-filter: blur()` is GPU-intensive. Mitigation: limit to navbar + 1-2 elements per page. Never apply to list items or repeating elements.
3. **Inconsistency.** Mixing glass and solid surfaces randomly looks unfinished. Mitigation: glass is a "material" -- define exactly which components use it and never deviate.
4. **Dark mode contrast.** Glass on dark backgrounds can look muddy. Mitigation: use `saturate(1.2)` and a subtle inset highlight (`inset 0 1px 0 white/5`) to maintain edge definition.
5. **Mobile touch perception.** Glass can feel "un-tappable." Mitigation: never use glass on buttons or interactive controls that need to feel solid.

**Rule: if in doubt, use a solid surface.** Glass is a garnish, not the plate.

## J. Page-by-Page UX Outline

### Homepage (`/`)
```text
┌─────────────────────────────────────┐
│ [Glass Navbar]                      │
│  Logo   Convert  Pricing   [Auth]   │
├─────────────────────────────────────┤
│ HERO                                │
│  Badge: "AI transcription + speaker │
│          labels"                    │
│  H1: "Know exactly what was said"   │
│  Sub: Upload → transcribe → done    │
│  [Convert your audio]  [See pricing]│
├─────────────────────────────────────┤
│ STATS STRIP (3 cols)                │
│  99 languages | Speaker labels |    │
│  Audio deleted after use            │
├─────────────────────────────────────┤
│ HOW IT WORKS (3 steps)              │
│  1. Upload  2. We process  3. Done  │
├─────────────────────────────────────┤
│ CAPABILITIES (2x3 grid)             │
│  [6 feature cards - solid, not      │
│   glass]                            │
├─────────────────────────────────────┤
│ PRICING (3 cols)                    │
│  Guest tiers | Credit packs | CTA   │
├─────────────────────────────────────┤
│ TRUST STRIP                         │
│  "Your audio is deleted immediately │
│   after processing."                │
├─────────────────────────────────────┤
│ FOOTER                              │
└─────────────────────────────────────┘
```

### Login (`/login`)
- Centered card, max-w-md
- Solid card (no glass)
- WhatSaid logo + "Sign in to WhatSaid"
- Email + password fields
- "Sign in" primary button
- "Don't have an account? Sign up" link
- Google OAuth button below (future)
- Error inline below form

### Signup (`/signup`)
- Same layout as login
- Fields: display name, email, password
- "Create account" primary button
- "Already have an account? Sign in" link
- Note below: "Get credit packs and save up to 50%"

### Profile (`/profile`) -- new page
```text
┌─────────────────────────────────────┐
│ [Navbar]                            │
├─────────────────────────────────────┤
│ PROFILE HEADER                      │
│  Avatar (initials) + Display name   │
│  Email (read-only display)          │
│  Member since date                  │
├─────────────────────────────────────┤
│ CREDIT BALANCE CARD                 │
│  [Glass badge] X credits remaining  │
│  [Buy more credits] → /credits      │
├─────────────────────────────────────┤
│ QUICK STATS (3 cols)                │
│  Total jobs | Total minutes | Last  │
│  job date                           │
├─────────────────────────────────────┤
│ RECENT JOBS (3 items preview)       │
│  [View all] → /history              │
└─────────────────────────────────────┘
```

### Settings (`/settings`) -- new page
```text
┌─────────────────────────────────────┐
│ [Navbar]                            │
├─────────────────────────────────────┤
│ SETTINGS                            │
│                                     │
│ Section: Account                    │
│  Display name [editable]            │
│  Email [read-only]                  │
│  [Save changes]                     │
│                                     │
│ Section: Preferences                │
│  Default language [dropdown]        │
│                                     │
│ Section: Security                   │
│  [Change password] (opens modal)    │
│                                     │
│ Section: Danger zone                │
│  [Delete account] (destructive,     │
│   confirmation dialog)              │
└─────────────────────────────────────┘
```

### Convert (`/convert`) -- renamed from homepage upload
```text
┌─────────────────────────────────────┐
│ [Navbar]                            │
├─────────────────────────────────────┤
│ H2: "Convert your audio"           │
│                                     │
│ STEP 1: Upload                      │
│  [Glass dropzone]                   │
│  Drag & drop or click to browse     │
│  Supported: .m4a, .mp3, .wav        │
│  Max: 60 min / 200 MB               │
│                                     │
│ STEP 2: Configure (appears after    │
│  upload, animated in)               │
│  File name + duration + size        │
│  Language: [Auto-detect ▾] override │
│  Custom prompt: [textarea]          │
│  "What would you like to extract?"  │
│                                     │
│ STEP 3: Confirm + pay               │
│  Cost summary card:                 │
│    Duration: 16:23                  │
│    Credits: 2 (or $4.99 for guest)  │
│  [Use 2 credits and convert]        │
│  or [Pay $4.99 and convert]         │
│                                     │
│ STEP 4: Processing                  │
│  Progress bar + status messages     │
│  "Transcribing..." → "Generating   │
│   summary..." → "Complete"          │
│                                     │
│ STEP 5: Results                     │
│  Tabs: Transcript | Summary | AI    │
│  Each tab has content + download    │
│  buttons (TXT, JSON)                │
│  Language detected: [badge]         │
│  "Wrong language?" → re-select +    │
│  re-transcribe (account: 1 credit)  │
└─────────────────────────────────────┘
```

---

## Implementation Order

1. **Design system foundation** -- Update CSS variables, add glass utilities, `rounded-xl`, dark mode via system preference, add `/convert`, `/profile`, `/settings` routes
2. **Homepage rebuild** -- New section order, stats strip, how-it-works, pricing section, trust strip, footer
3. **Convert page** -- Move upload flow from homepage, add custom prompt input, step-by-step UI
4. **Profile + Settings pages** -- New pages with outlined layouts
5. **Navbar update** -- Avatar dropdown for logged-in, "Convert" nav link, glass refinement

### Files to create/modify
- `src/index.css` -- Glass utilities, dark mode script, rounded-xl
- `src/pages/Index.tsx` -- Full homepage rebuild
- `src/pages/Convert.tsx` -- New dedicated conversion page
- `src/pages/Profile.tsx` -- New
- `src/pages/Settings.tsx` -- New
- `src/components/Navbar.tsx` -- Avatar dropdown, route updates
- `src/App.tsx` -- Add new routes
- `index.html` -- Dark mode system-preference script
- `tailwind.config.ts` -- Extended glass tokens if needed

