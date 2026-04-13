

# Job Detail Page — Premium Redesign (Adjusted Plan)

## Adjustments Applied

1. **Desktop text size**: `text-[15px] leading-[1.7]` on both mobile and desktop — no reduction to `text-sm` anywhere
2. **Action bar mobile**: Icon + compact label by default, not icon-only
3. **Tags**: Solve with `mt-5` spacing + quieter styling first, no border separator unless proven insufficient
4. **Tabs**: All styling via className overrides in `JobResults.tsx`, no changes to shared `tabs.tsx`

## Implementation Split: 3 Prompts

### Prompt 1 — Transcript Blocks + Header (Phases 1+2)

**TranscriptEditor.tsx — read-mode segments:**
- Replace inline `borderLeft` style with Tailwind `border-l-[3px]` + CSS variable `style={{ '--seg-color': color.border } as React.CSSProperties}`
- Add `rounded-xl bg-card/40 p-3` card wrapper to each segment
- Speaker badge: `rounded-full bg-[var(--seg-bg)] px-2 py-0.5 text-xs` pill above text
- Body text: `text-[15px] leading-[1.7]` on all breakpoints
- Segment gap: `space-y-2`

**JobDetail.tsx — header:**
- Title: `text-2xl sm:text-3xl font-bold font-heading`
- Back button: icon-only on mobile, text on desktop
- "New transcription" button: `rounded-full`
- Metadata pills: `rounded-full bg-muted/40 text-muted-foreground text-xs px-2.5 py-1` — no border
- Tags: increase `mt-5` spacing, quieter weight — no separator line

### Prompt 2 — Tabs + Actions + Speaker Chips + Edit Mode (Phases 3+4)

**JobResults.tsx — tabs:**
- `TabsList` className: `rounded-full bg-muted/40 p-1`
- `TabsTrigger` className: `rounded-full`
- No modification to shared `tabs.tsx`

**JobResults.tsx — action bar:**
- Wrap Copy/Share/Export in `rounded-full bg-muted/30 border border-border/30 px-1 py-0.5 inline-flex gap-0.5`
- Mobile: icon + compact label (not icon-only)
- Move above card content, between tabs and card

**JobResults.tsx — card surface:** `rounded-2xl border-border/40`

**SpeakerChips.tsx:** chip buttons `rounded-full`

**TranscriptEditor.tsx — edit mode:**
- Segment card: `rounded-xl`, softer `border-primary/20`, remove `shadow-sm`
- Toolbar buttons: `rounded-full`

### Prompt 3 — Summary/Questions + QA (Phases 5+6)

**StructuredSummary.tsx:** `rounded-2xl` surfaces, consistent spacing
**JobResults.tsx:** Q&A section polish
**All files:** spacing rhythm audit (8px base), dark mode contrast check, 375px/390px/414px viewport QA

## Files Affected

| File | Prompts |
|---|---|
| `TranscriptEditor.tsx` | 1, 2 |
| `JobDetail.tsx` | 1 |
| `JobResults.tsx` | 2, 3 |
| `SpeakerChips.tsx` | 2 |
| `JobDetailTags.tsx` | 1 (spacing only) |
| `StructuredSummary.tsx` | 3 |

## Design System Update After Implementation
Update `mem://design/system-rules.md` to reflect: `rounded-2xl` main surfaces, `rounded-full` pills/chips, `text-[15px] leading-[1.7]` transcript body.

