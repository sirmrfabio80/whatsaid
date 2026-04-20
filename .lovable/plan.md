

# Fix homepage responsiveness for iPad / tablet viewports (768–1024px)

## Problem

At 834×1194 (iPad Pro 11"), the layout falls between the `md` (768px) and `lg` (1024px) breakpoints. This causes:

1. **Hero stacks vertically** with centered text + full-width mock below — wastes vertical space and pushes content far from the header.
2. **Floating chips** ("Suggest: rename Speaker 3 → Priya" and "Ask about this") use `absolute` positioning with fixed offsets (`right-4`, `-right-2`) — they overflow or clip at narrower widths.
3. **Product mock** is capped at `max-w-[640px]` which is fine, but in stacked mode the hero section is excessively tall, creating the unbalanced spacing.

## Solution

Introduce a **tablet-specific layout** by lowering the hero grid breakpoint from `lg` to `md` and scaling the mock + chips for the 768–1024px range.

### 1. Hero grid: switch split layout from `lg` → `md` (`src/pages/Index.tsx`)

- Change `grid lg:grid-cols-12` → `grid md:grid-cols-12`
- Change text column `lg:col-span-5` → `md:col-span-5`
- Change mock column `lg:col-span-7` → `md:col-span-7`
- Change text alignment `lg:text-left` → `md:text-left`, `lg:justify-start` → `md:justify-start`, `lg:mx-0` → `md:mx-0`
- Reduce hero vertical padding: `py-16 sm:py-20 lg:py-24` → `py-12 sm:py-14 md:py-16 lg:py-24` to tighten the header-to-content gap on tablets
- Scale the h1 more gradually: add `md:text-[2.75rem]` between `sm` and `lg` so the headline fits the narrower left column

### 2. Product mock: scale down for tablet (`src/components/home/HeroProductMock.tsx`)

- Reduce `max-w-[640px]` → `max-w-[520px] lg:max-w-[640px]` so the mock fits comfortably in a 7-column span at 834px
- Scale internal padding and font sizes at `md`: transcript body `p-5 sm:p-6` → `p-4 md:p-5 lg:p-6`
- **Floating "Suggest" chip**: change `absolute right-4 top-3` → `absolute right-2 top-2 md:right-3 md:top-2 lg:right-4 lg:top-3` and add `max-w-[200px] truncate` to prevent overflow; show from `sm` (already does)
- **Floating "Ask about this" chip**: change `absolute -right-2 -top-2` → `absolute -right-1 -top-1.5 md:-right-1.5 lg:-right-2 lg:-top-2` so it doesn't clip the card border on tablet

### 3. Trust chips + CTAs alignment (`src/pages/Index.tsx`)

- Update trust chips: `justify-center lg:justify-start` → `justify-center md:justify-start`
- Update CTA row: `justify-center lg:justify-start` → `justify-center md:justify-start`, `lg:items-stretch` → `md:items-stretch`

### 4. Hero subline max-width

- Change `max-w-[52ch] mx-auto lg:mx-0` → `max-w-[52ch] mx-auto md:mx-0 md:max-w-[40ch] lg:max-w-[52ch]` to prevent the paragraph from overflowing the narrower 5-column text area on tablet

## Files changed

```
src/pages/Index.tsx                    breakpoint + spacing adjustments
src/components/home/HeroProductMock.tsx   mock sizing + chip positioning
```

No new dependencies, no DB changes, no i18n changes.

