

# URGENT Fixes: Questions deletion + Transcript mobile layout

## Issue 1: New question deletes all previous answers

**Root cause**: In `supabase/functions/regenerate/index.ts` (lines 124-129), when asking a custom question, the code deletes ALL existing `output_type = "custom"` rows before inserting the new one:

```sql
DELETE FROM job_outputs WHERE job_id = ? AND output_type = 'custom'
```

This wipes every previous Q&A answer.

**Fix**: Remove the delete statement (lines 125-129) from the custom/question branch. The insert at line 170 already creates a new row — that's correct behavior for accumulating Q&A entries. The delete should only remain for the summary branch (where replacing is intentional).

Also change `output_type` from `"custom"` to `"question"` on the insert (line 173) so new questions use the dedicated type and don't conflict with any legacy custom outputs. Update line 35 accordingly: `const regenerateType = output_type === "summary" ? "summary" : "question";`

**File**: `supabase/functions/regenerate/index.ts`

---

## Issue 2: Transcript tab mobile layout

**Current layout** (390px): The `ActionsBar` component uses a single horizontal flex row with SpeakerChips on the left and Copy/Export on the right. With 2+ speakers, the chips compete for space with the buttons, creating a cramped layout.

**Fix**: Restructure the Transcript tab header area to stack vertically on mobile:

1. **Top row**: Copy and Export buttons aligned to the right (compact, no left content)
2. **Below**: SpeakerChips rendered as a separate full-width section with `flex-wrap`, so chips flow naturally across the full width and wrap to additional rows as needed

**Changes in `src/components/JobResults.tsx`** (lines 422-453):
- Remove the `leftContent` prop usage for the Transcript ActionsBar — render it without SpeakerChips
- Add a separate SpeakerChips section below the ActionsBar, inside a `div` with `px-4 py-3 border-b border-border/50` styling
- SpeakerChips already uses `flex-wrap` in its container, so it will naturally handle 4+ speakers across the full width

**No changes needed to `SpeakerChips.tsx`** — it already has `flex items-center gap-2 flex-wrap`.

---

## Summary of file changes

| File | Change |
|------|--------|
| `supabase/functions/regenerate/index.ts` | Remove delete-all-custom block (lines 125-129), change output_type to `"question"` |
| `src/components/JobResults.tsx` | Separate SpeakerChips from ActionsBar into its own full-width row below |

