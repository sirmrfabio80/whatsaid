

# WhatSaid UI Polish Plan

## Audit Findings

After reviewing all pages and components, here are the main issues:

1. **Button variants inconsistent.** The `outline` variant uses `hover:bg-accent hover:text-accent-foreground` (teal), which is jarring for a neutral outline button. Ghost variant has the same issue. These should hover to a subtle neutral, not the accent color.
2. **Dark mode muted-foreground too dim.** `215 15% 55%` is borderline for WCAG AA on `225 25% 6%` bg. Needs bumping to ~60%.
3. **No smooth page transitions.** Content appears instantly with no fade-in.
4. **Cards lack consistent shadow hierarchy.** Some have `shadow-md` on hover, others have none. No base shadow on any card.
5. **Dropzone not using `.glass-dropzone` class.** The AudioUploader builds its own styles instead of using the design token.
6. **Login page still links to `/signup`** which is disabled. Dead link.
7. **History page missing page shell consistency** -- different padding/max-width than other pages.
8. **Credits page cards missing `rounded-xl`** on cards.
9. **Footer is minimal but missing system consistency** -- needs subtle refinement.
10. **No focus-visible ring customization** -- default offset ring looks dated with rounded-xl components.
11. **Homepage hero gradient is barely visible.** `from-primary/5 via-primary/2` is imperceptible.
12. **`App.css` still has Vite boilerplate** -- should be cleaned up to avoid style conflicts.

## Plan

### 1. Design token refinements (`src/index.css`)
- Bump dark mode `--muted-foreground` from `215 15% 55%` to `215 15% 63%` for better contrast
- Refine `--border` in dark mode from `225 15% 15%` to `225 15% 18%` for slightly more visible card edges
- Add smooth global transition for background/foreground color changes
- Add subtle page-enter animation keyframe

### 2. Button variant fix (`src/components/ui/button.tsx`)
- Change `outline` hover from accent to `hover:bg-muted hover:text-foreground` (neutral)
- Change `ghost` hover from accent to `hover:bg-muted hover:text-foreground`
- Increase base `rounded-md` to `rounded-lg` globally for consistency with `rounded-xl` usage

### 3. Clean up `App.css`
- Remove all Vite boilerplate styles that conflict with Tailwind

### 4. Homepage refinements (`src/pages/Index.tsx`)
- Strengthen hero gradient from `primary/5` to `primary/8`
- Add staggered fade-in animation to hero elements
- Add subtle card base shadow `shadow-sm` and improve hover state consistency
- Refine stats strip icon color consistency

### 5. AudioUploader glass treatment (`src/components/AudioUploader.tsx`)
- Apply `.glass-dropzone` class to the drop zone instead of inline border styles
- Improve drag-over state with primary border + glow

### 6. Login page fix (`src/pages/Login.tsx`)
- Remove dead `/signup` link since signup is disabled
- Add subtle card shadow for depth

### 7. Convert page refinement (`src/pages/Convert.tsx`)
- Add card shadow for depth consistency
- Refine the "Change" button to look like a proper link/button with focus state

### 8. Profile, Settings, History, Credits consistency pass
- Standardize page shell: consistent `max-w-2xl` or `max-w-3xl`, consistent `py-12 sm:py-16`
- Add `rounded-xl` to Credits cards
- Remove History `text-3xl sm:text-4xl` and standardize to `text-2xl sm:text-3xl` like other pages
- Add subtle card shadows throughout

### 9. Navbar micro-refinement (`src/components/Navbar.tsx`)
- Increase logo icon border-radius to `rounded-xl` for consistency
- Improve mobile menu animation (fade-in)

### Files to modify
- `src/index.css` -- tokens, animations
- `src/App.css` -- delete boilerplate
- `src/components/ui/button.tsx` -- variant fixes
- `src/pages/Index.tsx` -- hero, cards, animations
- `src/pages/Login.tsx` -- remove dead link, shadow
- `src/pages/Convert.tsx` -- shadow, refinement
- `src/pages/Profile.tsx` -- shell consistency
- `src/pages/Settings.tsx` -- shell consistency
- `src/pages/History.tsx` -- shell consistency, heading size
- `src/pages/Credits.tsx` -- rounded-xl, shell consistency
- `src/components/AudioUploader.tsx` -- glass-dropzone class
- `src/components/Navbar.tsx` -- logo radius, mobile menu

No business logic or backend changes.

