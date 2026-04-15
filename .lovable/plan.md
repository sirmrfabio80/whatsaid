

# Fix Summary Section Body Alignment on Mobile

## Problem
The `pl-6` left padding on the section body content (line 208) pushes text too far right on mobile. The body text should align with the icon above (not the heading text).

## Fix
**File**: `src/components/StructuredSummary.tsx`, line 208

Change `pl-6` to `sm:pl-6 pl-0` so that on mobile the body text aligns flush with the icon, while on desktop the indentation is preserved.

The icon+heading row uses `gap-2` (0.5rem) and the icon is `w-4` (1rem), so `pl-6` (1.5rem) aligns body text with the heading text on desktop. On mobile, removing the padding lets body text start at the same left edge as the icon.

## Scope
- One line change in `src/components/StructuredSummary.tsx`
- Mobile only — desktop layout unchanged

