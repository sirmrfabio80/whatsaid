

# Revised Implementation Roadmap

## Reclassifications and Removals

**F4 (shared summary prompt)**: Reclassified as **code cleanliness / maintainability**. The prompt is ~800 chars — negligible token cost. The value is preventing drift between `post-process` and `regenerate`.

**F21 (truncate transcript to 50K chars)**: **Removed from roadmap**. No evidence of actual transcript sizes exceeding model context. Truncation risks silently dropping content from long meetings, degrading summary quality with no user-visible signal. Defer unless real-world data shows a problem.

---

## Batch 1: Scope unbounded `job_tags` query

**Problem**: `use-history-filters.ts` line 45-48 fetches ALL `job_tags` rows visible via RLS with no filter. As users accumulate transcripts, this grows unboundedly.

**Fix**: Filter `job_tags` to only the job IDs already loaded on the history page by passing the loaded job IDs into the hook, or by joining through the user's jobs. Simplest approach: after jobs are fetched, pass their IDs to a scoped `.in("job_id", jobIds)` query.

**Files touched**:
- `src/hooks/use-history-filters.ts` — add `jobIds` parameter, scope query
- `src/pages/History.tsx` — pass loaded job IDs to the hook

**Regression risk**: Low. Only changes the query scope; tag filtering behaviour is identical for loaded jobs.

**Rollback**: Revert the two files. No schema or backend changes.

---

## Batch 2: Merge/remove extra short-summary AI call

**Problem**: `post-process/index.ts` lines 145-148 make a separate AI call just to generate a 1-2 sentence short summary. This is a full AI round-trip (model `gemini-3-flash-preview`) for ~200 chars of output that can be extracted programmatically.

**Fix**: After generating the full summary (step 2), extract the first paragraph of the "Overview" section using a simple regex/string split. Trim to 200 chars. Remove the dedicated short-summary AI call entirely. Same approach for `regenerate/index.ts` when regenerating summaries — extract short summary from the new summary content.

**Files touched**:
- `supabase/functions/post-process/index.ts` — remove lines 144-148, add ~5 lines of string extraction after summary generation
- `supabase/functions/regenerate/index.ts` — add short summary extraction when regenerating summaries (update `short_summary` on jobs table from the regenerated summary)

**Regression risk**: Low-medium. The extracted short summary may differ slightly in style from the AI-generated one. Clamped to 200 chars same as before. No schema changes.

**Rollback**: Re-add the AI call lines. No data migration needed — `short_summary` column is unchanged.

---

## Batch 3: Downgrade summary model where safe

**Problem**: Both `post-process` and `regenerate` use `google/gemini-3-flash-preview` for all AI calls including summary generation. Summary is a structured extraction task — does not need frontier reasoning.

**Fix**: In `post-process/index.ts`, change the model used for the summary call to `google/gemini-2.5-flash`. Keep `gemini-3-flash-preview` for custom prompt outputs (which may require stronger reasoning). In `regenerate/index.ts`, use `gemini-2.5-flash` for summary regeneration, keep `gemini-3-flash-preview` for custom prompt regeneration.

Implementation: Replace the single `MODEL` constant with two constants (`MODEL_SUMMARY` and `MODEL_CUSTOM`), and pass the appropriate one to `callAI`.

**Files touched**:
- `supabase/functions/post-process/index.ts` — add `MODEL_SUMMARY`, use it for summary call
- `supabase/functions/regenerate/index.ts` — add `MODEL_SUMMARY`, use it for summary regeneration; keep existing model for custom prompts

**Regression risk**: Low. `gemini-2.5-flash` is a production-grade model. Summary quality should be comparable for structured extraction. Custom prompts (where quality sensitivity is higher) remain on the current model.

**Rollback**: Change model constants back to `gemini-3-flash-preview`.

---

## Batch 4: Remove dead code and duplicate toaster

**Problem**: Three independent cleanup items confirmed by audit:

1. **Duplicate Toaster**: `App.tsx` renders both `<Toaster />` (shadcn) and `<Sonner />`. Confirmed: `useToast` is only imported within `ui/toaster.tsx` and `ui/use-toast.ts` themselves — zero application code uses it. All toast calls use `sonner`.

2. **Dead `listUsers`**: `invite-user/index.ts` line 85-88 calls `auth.admin.listUsers` but the result (`existingUsers`) is never referenced anywhere in the function.

3. **Empty lines in `regenerate`**: Lines 124-126 are blank lines (leftover from removed code).

**Fix**:
- Remove `<Toaster />` import and usage from `App.tsx`
- Optionally remove `src/components/ui/toaster.tsx`, `src/components/ui/use-toast.ts`, `src/hooks/use-toast.ts` (all unused)
- Remove lines 85-88 from `invite-user/index.ts`
- Remove blank lines 124-126 from `regenerate/index.ts`

**Files touched**:
- `src/App.tsx` — remove `Toaster` import and `<Toaster />`
- `src/components/ui/toaster.tsx` — delete file
- `src/components/ui/use-toast.ts` — delete file
- `src/hooks/use-toast.ts` — delete file
- `src/components/ui/toast.tsx` — delete file (only consumed by toaster.tsx)
- `supabase/functions/invite-user/index.ts` — remove 4 lines
- `supabase/functions/regenerate/index.ts` — remove 3 blank lines

**Regression risk**: Very low. All removals are confirmed dead code. Sonner remains the sole toast system.

**Rollback**: Re-add the deleted files and imports. No data or schema impact.

