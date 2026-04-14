

# Summary Regeneration After Transcript Edits — Revised Plan

## Schema changes

**Migration — add two columns to `jobs`:**

```sql
ALTER TABLE public.jobs
  ADD COLUMN summary_needs_regen boolean NOT NULL DEFAULT false,
  ADD COLUMN summary_regen_count integer NOT NULL DEFAULT 0;
```

| Column | Purpose |
|---|---|
| `summary_needs_regen` | Staleness flag. `true` = transcript was edited and summary is outdated. `false` = summary is current. |
| `summary_regen_count` | Counter for edit-driven summary regenerations. Enforces max 3. Never resets. |

## Logic flow

1. **User edits transcript** → `handleTranscriptSave` in `JobResults.tsx` sets `summary_needs_regen = true` on the job row (alongside the existing variant/language reset logic).

2. **User clicks "Regenerate summary"** → client calls `regenerate` edge function with `output_type: "summary_from_edit"`.

3. **Edge function** (`supabase/functions/regenerate/index.ts`):
   - Reads `summary_regen_count` and `summary_needs_regen` from the job
   - If `summary_regen_count >= 3` → 403 error
   - If `summary_needs_regen = false` → 400 error (nothing to regenerate)
   - Otherwise: regenerate summary from current transcript content, then atomically set `summary_needs_regen = false` and increment `summary_regen_count`

4. **UI in Summary tab** (`JobResults.tsx`):
   - Show outdated bar **only when `summary_needs_regen === true`**
   - Show remaining attempts: `3 - summary_regen_count`
   - Disable button + explanation when `summary_regen_count >= 3`
   - After successful regeneration, update local state: `summaryNeedsRegen = false`, increment count

## UI placement

Compact bar above summary content in the Summary tab, shown only when `summary_needs_regen` is true:

```text
┌─────────────────────────────────────────────┐
│  ⚠ Summary may be outdated after edits      │
│  [↻ Regenerate summary]     2 of 3 remaining│
└─────────────────────────────────────────────┘
```

When limit reached and `summary_needs_regen` is still true:

```text
┌─────────────────────────────────────────────┐
│  ⚠ Summary may be outdated                  │
│  Regeneration limit reached (0 remaining)   │
└─────────────────────────────────────────────┘
```

When `summary_needs_regen` is false → bar hidden entirely.

## Files to change

| File | Change |
|---|---|
| **Migration** | Add `summary_needs_regen` and `summary_regen_count` columns |
| `supabase/functions/regenerate/index.ts` | Add `summary_from_edit` handler with limit check, staleness guard, and atomic update |
| `src/components/JobResults.tsx` | Fetch both new columns; set `summary_needs_regen = true` in `handleTranscriptSave`; add regenerate bar in summary tab; call endpoint on click |
| `src/i18n/locales/en.json` | ~4 keys: outdated warning, button label, remaining count, limit reached |
| `src/i18n/locales/it.json` | Same keys in Italian |
| `src/i18n/locales/fr.json` | Same keys in French |

## Interaction with variants / output language

Unchanged from existing architecture. `handleTranscriptSave` already clears variants and resets output language. After summary regeneration, the new summary is in the original language. Subsequent language switches go through the normal translate flow with fresh `source_hash`.

## Regression risks

Minimal. `summary_regen_count` is separate from `regeneration_count` (translation). Custom Q&A is a different code path (`output_type: "custom"`). The staleness flag is purely additive and defaults to `false` for all existing jobs.

