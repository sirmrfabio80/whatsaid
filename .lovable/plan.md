

# Transcript Editing UX Redesign — Implementation Plan

## Overview
Six phases implementing segment cards with split, merge, structured state, inline speaker creation, and desktop drag-and-drop. All scoped to `TranscriptEditor.tsx`, `SpeakerChips.tsx`, `JobResults.tsx`, and i18n files.

## Phase 1 — Segment Card Visuals + Unassigned State + i18n Keys

**TranscriptEditor.tsx — Read-mode segments (lines 378-452):**
- Wrap each segment in a subtle card: `border border-border/30 rounded-xl bg-card/50` with `p-3` padding
- Speaker badge always visible, not hover-gated
- For `speaker: null` segments, render an "Unassigned" dashed-border badge (`border-dashed text-muted-foreground`) that is clickable in edit mode to open the speaker popover
- Remove the hover-only pencil icon on text — replace with a subtle cursor change only

**i18n — all three locale files:**
- Add keys: `splitHere`, `mergeUp`, `mergeConfirmTitle`, `mergeKeepSpeaker`, `unassigned`, `newSpeakerInline`, `splitSuccess`, `mergeSuccess`

## Phase 2 — Structured Editing State

**TranscriptEditor.tsx — state management (lines 96-116, 161-214):**
- On entering edit mode, `parseSegments` runs once → `segments` becomes the sole working state
- `saveSegment` and `reassignSpeaker` mutate the `segments` array directly; `reconstructContent` called only on save
- Remove the `useEffect` that re-parses on `content` change while `editing === true` (line 112-116 already does this correctly)
- All new operations (split, merge) will operate on the segments array

## Phase 3 — Split at Cursor

**TranscriptEditor.tsx — active segment block (lines 322-370):**
- Add a `Scissors` icon button in the active segment toolbar (next to Save/Cancel): "Split here"
- On click: read `textareaRef.current.selectionStart`, split text at cursor position
- Create new segment with `id: seg-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, inheriting original speaker
- Splice into segments array at `activeIndex + 1`
- Auto-save via `onSave(reconstructContent(updatedSegments))`
- **Focus behavior**: after split, set `activeIndex` to the new (second) segment, place cursor at position 0 in its textarea. Use `requestAnimationFrame` to ensure the new textarea is mounted before focusing
- **Mobile scroll**: after split, `scrollIntoView({ behavior: 'smooth', block: 'nearest' })` on the new segment card
- Clear AI suggestions on split (they reference stale IDs)

## Phase 4 — Merge Adjacent Segments

**TranscriptEditor.tsx — segment toolbar:**
- Non-first segments show a "Merge up" button (icon: `Combine` or `ArrowUpToLine`) in toolbar when that segment is active
- **Same speaker**: merge silently — concatenate text with a space, remove current segment from array, auto-save
- **Different speakers**: show an inline confirmation UI (not a dialog — render it inside the segment card). Two buttons: "Keep [Speaker A]" and "Keep [Speaker B]". Selecting one merges text into the previous segment using that speaker
- After merge, focus the previous segment with cursor at the join point
- Clear AI suggestions on merge

## Phase 5 — Inline "+ New Speaker" in Popover

**SpeakerBadge popover (lines 527-571):**
- Add a separator + "+ New speaker" button at the bottom of the speaker list in the popover
- On click: call a new `onCreateAndAssign` prop that creates the next available `Speaker X` letter and immediately reassigns this segment
- Close popover after creation

**JobResults.tsx:**
- Pass a new `onCreateAndAssign` callback to `TranscriptEditor` that calls `handleAddSpeaker` logic + immediately reassigns the segment

## Phase 6 — Desktop Drag-and-Drop

**SpeakerChips.tsx — SpeakerChip component:**
- Add `draggable` attribute to the chip button, gated by CSS `@media (pointer: fine)` via a `useMediaQuery` check or `window.matchMedia`
- `onDragStart`: set `e.dataTransfer.setData("text/plain", speaker)`, add `opacity-60` class
- `onDragEnd`: remove opacity class

**TranscriptEditor.tsx — segment cards in edit mode:**
- Add `onDragOver` (preventDefault to allow drop) and `onDrop` handlers on each segment card
- On drag over: add `ring-2 ring-primary/50` highlight class
- On drag leave: remove highlight
- On drop: read speaker from `dataTransfer`, call `reassignSpeaker(segIndex, droppedSpeaker)`, flash a brief `ring-2 ring-green-500/50` success state (300ms timeout)
- Desktop only — no drag handles or touch-drag on mobile

## Files Modified

| File | Changes |
|---|---|
| `src/components/TranscriptEditor.tsx` | Card styling, unassigned badge, split/merge logic, structured state, toolbar, drop targets, focus management, "+ New speaker" in popover |
| `src/components/SpeakerChips.tsx` | `draggable` + `onDragStart`/`onDragEnd` on chips (desktop only) |
| `src/components/JobResults.tsx` | Pass `onCreateAndAssign` callback to TranscriptEditor |
| `src/i18n/locales/en.json` | New transcript editing keys |
| `src/i18n/locales/fr.json` | Same keys translated |
| `src/i18n/locales/it.json` | Same keys translated |

## Regression Risks

- **Content corruption**: mitigated by operating on structured array, serializing only on save
- **Stale AI suggestions**: cleared on any split/merge
- **Export**: unaffected — `reconstructContent` produces same `Speaker X: text\n` format
- **Drag vs text selection**: drag only on chip elements, not textarea; gated to `pointer: fine`
- **Focus after split**: `requestAnimationFrame` + `scrollIntoView` ensures stable behavior on mobile

