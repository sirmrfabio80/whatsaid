

# Translated Content Variants — Final Revised Plan

## 1. Current `job_outputs` storage shape

Each output is a separate row in `job_outputs`:

| `output_type` | `custom_prompt` | Notes |
|---|---|---|
| `transcript` | NULL | One per job. Editable. |
| `summary` | NULL | One per job. |
| `custom` | The user's question | Zero or more per job. Each Q&A is its own row. |

## 2. Data model changes

### New table: `job_output_variants`

```sql
CREATE TABLE public.job_output_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_output_id UUID NOT NULL REFERENCES public.job_outputs(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_output_id, language)
);
```

RLS: authenticated users can SELECT via join through `job_outputs → jobs` checking `user_id`. Service role has full access.

### New column on `jobs`

```sql
ALTER TABLE public.jobs ADD COLUMN output_language TEXT;
```

## 3. API contract: `regenerate` edge function

```json
{
  "job_id": "...",
  "output_type": "translate_all",
  "target_language": "fr"
}
```

Processing: read all `job_outputs` for the job → translate each via AI → upsert into `job_output_variants` on `(job_output_id, language)` → update `jobs.output_language` → return translated content keyed by `job_output_id`.

## 4. Legacy summary-language handling

- Original language = `jobs.language_detected`.
- Old jobs with `summary_language !== language_detected`: the current `job_outputs.content` for summary is already translated. It stays untouched as the baseline.
- If user switches back to `language_detected`, we regenerate the summary in the original language and store it as a variant keyed to `language_detected`.
- New jobs: `job_outputs.content` always holds original-language content. Translations go into variants only.

## 5. Export path verification

- **Client-side exports** (PDF, TXT, JSON): all consume content passed from `JobResults` through `buildCanonicalPayload()`. No changes needed — active variant content flows through automatically.
- **`share-transcript` edge function**: reads directly from `job_outputs`. Must be updated to check `jobs.output_language` and read from `job_output_variants` when the active language differs from original.

## 6. `claim-transcript-share` — explicit phase 1 behaviour

**Phase 1 decision: copy only original outputs.**

When a recipient claims a shared transcript, the `claim-transcript-share` function will copy only `job_outputs` rows (original content). It will NOT copy any `job_output_variants` rows.

The recipient's new job will have `output_language = NULL` (defaulting to original language). If the recipient wants translations, they generate their own variants via the Output language selector.

**Rationale**: variants are cheap to regenerate on demand, and copying them adds complexity around ownership and staleness. This keeps the claim flow simple.

**Follow-up item**: In a future prompt, evaluate whether to copy the sender's active-language variants into the claimed job so the recipient sees the same language the sender shared. This is tracked as a separate task.

## 7. Frontend changes (`JobResults.tsx`)

- After fetching job data, if `outputLang !== originalLang`, fetch `job_output_variants` for all outputs in that language.
- State: `variants: Record<string, string>` mapping `job_output_id` → translated content.
- Rendering: display variant content when available, otherwise original.
- Transcript editor: read-only when viewing a translation.
- `handleOutputLanguageChange`: check for cached variants → fetch from DB → if missing, call `regenerate` with `translate_all` → persist `output_language`.

## 8. Files affected

| File | Change |
|---|---|
| Migration SQL | Create `job_output_variants` table + `output_language` column |
| `supabase/functions/regenerate/index.ts` | Add `translate_all` code path |
| `src/components/JobResults.tsx` | Fetch/cache variants, swap content, read-only transcript, persist `output_language` |
| `supabase/functions/share-transcript/index.ts` | Read variants when `output_language` differs from original |

## 9. Regression risks

| Risk | Mitigation |
|---|---|
| Transcript editing locked during translation | Clear visual indicator; switching to original re-enables editing |
| Legacy jobs with pre-translated summaries | Baseline untouched; original regenerated on demand as variant |
| Share email sends wrong language | Updated to respect `output_language` |
| Variant staleness after transcript edit | Out of scope — no invalidation yet |
| Claimed jobs missing variants | Explicit: phase 1 copies originals only |

## 10. Rollout order

1. Run migration (table + column)
2. Deploy updated `regenerate` function
3. Update `JobResults` client code
4. Update `share-transcript` to respect active language
5. Existing jobs unaffected until user switches language

