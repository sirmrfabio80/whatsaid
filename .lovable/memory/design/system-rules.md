---
name: Design system rules
description: UI state rules, colour usage, border-radius, glass, typography, surface layering
type: design
---

## Palette
- Primary: hsl(245 50% 48%) light / hsl(245 60% 64%) dark — interactive elements & brand only
- Accent (teal): success/positive indicators only. Never use alongside primary in same cluster
- Info: hsl(210 60% 50%) — informational states
- Surfaces: solid backgrounds only; no glass except navbar

## Typography Scale
- Page title: text-2xl sm:text-3xl font-bold (font-heading)
- Section title: text-lg font-semibold (font-heading)
- Card heading: text-base font-semibold (font-heading)
- Body: text-sm leading-relaxed (font-body)
- Caption: text-xs text-muted-foreground

## Border Radius
- Cards, dialogs: rounded-xl (1rem)
- Buttons, inputs, badges, chips: rounded-lg (0.75rem)
- Icon containers: rounded-xl
- Never use rounded-2xl or rounded-full for badges

## Glass
- Navbar only. All other surfaces use solid bg-muted or bg-card.

## States
- Selected: bg-primary text-primary-foreground + ring-2 ring-primary/30
- Calendar selected: solid bg-primary, today = text-primary font-bold + dot indicator
- Hover: bg-primary/10 or bg-muted for ghost
- Focus-visible: ring-2 ring-ring ring-offset-2
- Active: scale-[0.98]
- Disabled: opacity-50 pointer-events-none

## Surface Layering
- L0: --background (page)
- L1: --card with border-border (cards)
- L2: bg-muted/50 (nested surfaces inside cards)
- L3: --popover with shadow-lg (popovers/dropdowns)

## Page Spacing
- py-10 sm:py-14 for page content
- p-5 sm:p-6 for card padding
- space-y-6 between sections
