

# Questions Tab Enhancement Plan (Revised)

## 1. Behaviour Spec

**Ask a new question**: Works as today, but decrements remaining count. Disabled at 0.

**Edit a question**: User clicks an edit icon on a Q&A card → the question text becomes editable inline. On confirm, the card enters a "regenerating" state (spinner overlay on the answer area, question text updated). The existing answer remains visible but dimmed behind the spinner. The `regenerate` edge function is called. On success, the answer content is replaced in place. On failure, the card reverts to its original question text and answer — nothing is lost. This counts as one generation.

**Delete a Q&A card**: User clicks a delete icon → the `job_outputs` row is deleted. Does NOT restore a generation credit.

**Generation limit**: 10 per transcript. Stored as `question_generation_count` (integer, used-count) on the `jobs` table. Incremented server-side by the `regenerate` edge function when `output_type === "custom"`. Remaining = `10 - question_generation_count`.

**At limit (0 remaining)**:
- Ask input disabled with brief explanation
- Edit buttons hidden/disabled
- Include/exclude checkboxes and delete buttons remain functional

## 2. Data Model / Storage Plan

**Migration**: Add `question_generation_count integer NOT NULL DEFAULT 0` to `jobs` table.

**Server-side enforcement** in `regenerate` edge function for `output_type === "custom"`:
1. Atomic update: `UPDATE jobs SET question_generation_count = question_generation_count + 1 WHERE id = $jobId AND question_generation_count < 10 RETURNING question_generation_count`
2. Zero rows returned → 403 `{ error: "question_limit_reached" }`
3. Increment happens before AI call; if AI fails, decrement back (`SET question_generation_count = question_generation_count - 1`)

This approach prevents race conditions (atomic WHERE guard) while ensuring failed generations don't consume credits (rollback on failure).

## 3. UI/UX Plan

### Remaining-count indicator

Displayed below the Ask textarea, right-aligned, `text-xs text-muted-foreground`.

**Wording** (same on mobile and desktop):
- Normal state: **"3 questions left"** — e.g. "7 questions left", "1 question left"
- At limit: **"No questions left"**
- Singular handled naturally: "1 question left"

i18n keys:

| Key | EN | FR | IT |
|-----|----|----|-----|
| `jobResults.questionsLeft` | `"{{count}} questions left"` | `"{{count}} questions restantes"` | `"{{count}} domande rimanenti"` |
| `jobResults.questionsLeftOne` | `"{{count}} question left"` | `"{{count}} question restante"` | `"{{count}} domanda rimanente"` |
| `jobResults.noQuestionsLeft` | `"No questions left"` | `"Plus de questions disponibles"` | `"Nessuna domanda rimanente"` |

Uses i18next plural interpolation (`_one` / default plural suffix) so a single key handles singular/plural automatically.

### Q&A card actions

Add two icon buttons per card in the header row (between checkbox and copy):
- **Edit** (Pencil icon) — disabled when remaining = 0 or any generation in progress
- **Delete** (Trash2 icon) — always active; immediate delete with undo toast

### Edit-in-place flow

1. Click edit → question text becomes an editable input, pre-filled with current text. Two buttons: confirm (Check) and cancel (X).
2. On confirm → card enters "regenerating" state:
   - Question text updates immediately to the new text
   - Answer area shows a subtle spinner/skeleton overlay; existing answer text remains visible but at reduced opacity
   - All card actions (edit, delete, checkbox) disabled during regeneration
3. `regenerate` is called with the edited prompt text
4. **On success**: answer content smoothly replaces the old content; opacity returns to normal; spinner removed
5. **On failure**: question text reverts to original; answer remains unchanged; toast with error message; card returns to normal state

This ensures the user never sees a blank/missing card during regeneration.

### Mobile

Same layout. Icons use min 32px tap targets. Remaining-count text wraps naturally.

## 4. Failure and Edge Cases

| Case | Handling |
|------|----------|
| AI generation fails | Counter rolled back server-side. Card reverts to original question + answer. Error toast. |
| Double-tap / concurrent submit | `askingQuestion` state prevents concurrent asks. Per-card `regeneratingId` lock. Atomic server-side guard. |
| Edit while another generation in progress | All edit buttons disabled while any generation is active. |
| Page reload mid-generation | Counter was incremented; if AI fails, edge function rolls it back. If the response completed server-side, `fetchData` picks up the new output on reload. |
| `question_generation_count` null for existing jobs | Migration default 0. Edge function treats null as 0. |
| Delete during edit | Cancel edit state first, then delete. |

## 5. Files/Components Affected

| File | Change |
|------|--------|
| **New migration** | Add `question_generation_count` column to `jobs` |
| `supabase/functions/regenerate/index.ts` | Limit check + atomic increment for `output_type === "custom"`, rollback on failure |
| `src/components/JobResults.tsx` | Fetch `question_generation_count` in job query. Add edit/delete handlers. Regenerating card state (spinner overlay, dimmed answer). Remaining count display. Disabled states at limit. |
| `src/i18n/locales/en.json` | Keys: `questionsLeft`, `questionsLeftOne`, `noQuestionsLeft`, `deleteQuestion`, `editQuestion`, `regeneratingAnswer` |
| `src/i18n/locales/fr.json` | Same keys, French |
| `src/i18n/locales/it.json` | Same keys, Italian |

## 6. Regression Risks

| Risk | Mitigation |
|------|------------|
| Existing Q&A cards break | New buttons are additive; checkbox/copy untouched |
| Export includes deleted items | Delete removes from DB; export reads current state |
| Summary regeneration accidentally gated | Limit scoped to `output_type === "custom"` only |
| Counter desync on failure | Server-side rollback ensures accuracy |
| Old jobs missing column | Migration default 0 |

## 7. QA Plan

1. Ask a question → answer appears, remaining count decrements
2. Edit question text, confirm → card shows spinner over dimmed answer, new answer replaces old on success, count decrements
3. Edit question, simulate AI failure → original question and answer restored, count unchanged
4. Delete a card → disappears, remaining count unchanged
5. Ask 10 questions → input disabled, edit buttons disabled, delete and include/exclude still work
6. Rapid double-click Ask → only one generation fires
7. Page reload → count persists correctly
8. Mobile → all actions work, tap targets adequate
9. Export → deleted cards excluded, include/exclude works at limit
10. Verify "1 question left" singular copy

