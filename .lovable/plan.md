
## Goal
Add an optional "Additional transcripts" knowledge source to the Questions tab on `/job/:id`. When enabled, the user picks other transcripts they own (Tags-style chip+search input) and the AI answer is grounded in **current transcript (PRIMARY) + selected transcripts (SUPPORTING)**. When the toggle is off or no extras are picked, behavior is **byte-identical** to today.

## Verified facts (from code read)
- Questions UI lives in `src/components/JobResults.tsx` `<TabsContent value="questions">`. Submit handler `handleAskQuestion` calls `supabase.functions.invoke("regenerate", { body: { job_id, custom_prompt } })`.
- `supabase/functions/regenerate/index.ts` → `handleSummaryOrCustom` reads only the current job's transcript and builds the prompt via `buildCustomUserPrompt(custom_prompt, transcript)` from `_shared/prompts.ts`.
- `jobs` RLS: `SELECT WHERE auth.uid() = user_id`. Edge function uses service role → must re-validate ownership server-side.
- Tags interaction style is in `src/components/JobDetailTags.tsx` (chip + Input + suggestion dropdown, X-button removal).

## Plan

### 1. New isolated picker component
**File**: `src/components/QuestionExtraSourcesPicker.tsx` (new)
- Props: `{ currentJobId, value: Array<{id,title}>, onChange, max?: number }`.
- Internal state: search query (debounced 300ms), search results, dropdown open.
- Visual pattern mirrors `JobDetailTags.tsx`: `Badge` chips with `X` removal button; `Input` with floating result list.
- Search query against `jobs` (RLS scopes to caller):
  ```ts
  supabase.from("jobs")
    .select("id, title, file_name")
    .eq("status", "completed")
    .neq("id", currentJobId)
    .or(`title.ilike.%${q}%,file_name.ilike.%${q}%`)
    .order("created_at", { ascending: false })
    .limit(8)
  ```
- Filters out already-selected IDs client-side.
- Display: `title || file_name` fallback (matches existing convention).
- Hard cap: max 5.
- All i18n strings via `useTranslation`.

### 2. JobResults.tsx — minimal additions
- Add local state: `useExtraSources: boolean`, `extraSources: Array<{id,title}>`.
- Above the existing question composer in the Questions tab, render:
  - A `Switch` + label `t("jobResults.extraSources.toggleLabel")`.
  - When ON, render `<QuestionExtraSourcesPicker currentJobId={jobId} value={extraSources} onChange={setExtraSources} max={5} />`.
- Modify `handleAskQuestion` to pass `extra_job_ids` only when toggle is ON **and** `extraSources.length > 0`. Otherwise omit the field entirely (preserves byte-identical request body).
- No other changes in this file.

### 3. Edge function — additive, custom-path only
**File**: `supabase/functions/regenerate/index.ts`
- Extend body schema with optional `extra_job_ids?: string[]` (Zod `.array(z.string().uuid()).max(5).optional()`).
- In `handleSummaryOrCustom`, only when `outputType === "custom"` AND `extra_job_ids?.length > 0`:
  1. Resolve caller's `user_id` via `auth.getUser` using the request's Authorization JWT (anon client).
  2. Re-validate primary `job_id` ownership: `SELECT user_id FROM jobs WHERE id = :job_id`. Must equal caller.
  3. Validate extras: `SELECT id FROM jobs WHERE id = ANY(extra_job_ids) AND user_id = caller AND status = 'completed'`. Drop unauthorized/invalid IDs silently.
  4. Fetch transcripts for surviving IDs from `job_outputs WHERE output_type='transcript'`.
  5. Cap at total ~200k combined chars; drop extras from the end if exceeded (log warn).
  6. Call new `buildCustomUserPromptMulti(custom_prompt, primaryTranscript, extras)`.
- If extras list ends up empty after validation/caps, fall through to the **exact existing** `buildCustomUserPrompt` path (no behavior change).
- Summary path and translation path: untouched.

### 4. Prompt helper — additive
**File**: `supabase/functions/_shared/prompts.ts`
- Add `buildCustomUserPromptMulti(instruction, primary, extras: Array<{title, content}>)`:
  ```
  Instruction: <instruction>

  PRIMARY TRANSCRIPT (use as the main source of truth):
  <primary>

  ADDITIONAL TRANSCRIPT — "<title>" (supporting context only; defer to PRIMARY on conflicts unless the instruction asks to compare):
  <content>
  ...
  ```
- Append a one-line note to `CUSTOM_OUTPUT_SYSTEM_PROMPT` clarifying multi-transcript handling. Keep `buildCustomUserPrompt` exported and unchanged for the no-extras fallback.

### 5. i18n
Add `jobResults.extraSources.*` to en/fr/it: `toggleLabel`, `searchPlaceholder`, `noResults`, `removeAriaLabel`, `limitReached` (`{{max}}`).

## Files touched
- `src/components/QuestionExtraSourcesPicker.tsx` (new, isolated)
- `src/components/JobResults.tsx` (minimal: toggle, state, picker mount, payload field)
- `supabase/functions/regenerate/index.ts` (custom path only)
- `supabase/functions/_shared/prompts.ts` (additive helper + small system-prompt note)
- `src/i18n/locales/{en,fr,it}.json`

## Risks & edge cases
| Risk | Mitigation |
|---|---|
| Service role bypasses RLS | Re-validate primary + every extra against caller JWT before reading transcripts. |
| Context-window blow-up | Hard cap 5 extras + ~200k combined chars; drop from end if exceeded. |
| Picking an unfinished transcript | `status='completed'` filter on both client query and server validation. |
| Backward compatibility | `extra_job_ids` optional; absent → identical existing path. |
| Saved Q&A rendering / edit-reask | Untouched — extras are not persisted, only used for that single call. |
| Translation cache (`job_output_variants`) | Unchanged — extras only feed the prompt; no variants written. |
| Question counter | Unchanged — same `question_generation_count` semantics. |
| Title fallback when missing | Display `title || file_name` (matches existing UI convention). |
| Duplicate chips | Enforced via `Set<id>` on add and result-list filter. |

## Out of scope
- Persisting selected extras alongside saved Q&A.
- Shared/other-user transcripts.
- Searching transcript content (only title + file_name).
- Any changes to summary, translation, exports, edit/re-ask flows, or Tags component.
