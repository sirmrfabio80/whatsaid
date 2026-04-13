

# Fix Mobile Transcript Layout and Polish UX

## Problem
The current layout places the speaker badge and text side-by-side (`flex items-start`). On mobile (420px), the badge ("Speaker A" with dot and padding) consumes ~100px of horizontal space on every single line, leaving insufficient room for transcript text. This looks cramped and amateurish.

## Solution
Stack the speaker badge **above** the text on mobile; keep it inline on desktop. Additional polish to make it feel like a production app.

## Changes

### 1. `src/components/TranscriptEditor.tsx`

**Read-mode blocks (line ~378-450):**
- Change from `flex items-start gap-0` to a **stacked layout**: badge on top, text below, with the color left-border spanning the full block height.
- Remove the side-by-side badge column entirely. The speaker pill sits inside the block as the first element, compact and inline.
- Badge gets smaller top padding, text flows naturally below it — full width on all viewports.

**SpeakerBadge component (line ~494-571):**
- Remove `shrink-0` column behavior. Badge renders as a small inline pill at the top of the block.
- Reduce vertical padding from `py-2` to `py-1` for tighter feel.

**Edit-mode blocks (line ~322-371):**
- Already stacked (badge above textarea) — no change needed, just verify consistency.

### 2. Visual polish touches
- Slightly tighter `space-y` between blocks (currently `space-y-1`, keep or adjust to `space-y-0.5`)
- Ensure left border is consistent 3px with rounded block corners
- Badge text stays `text-[11px]`, but padding trimmed for compactness

## Files touched
- `src/components/TranscriptEditor.tsx` — layout restructure for read-mode blocks and badge component

## What does NOT change
- No backend, schema, edge function, export, share, routing, or tag changes
- Speaker popover reassignment logic unchanged
- AI suggestion highlights unchanged
- Edit-mode text editing flow unchanged

## Risk
Low — purely CSS/layout change within a single component. Badge popover anchor position may need `side="bottom"` confirmation after layout change.

