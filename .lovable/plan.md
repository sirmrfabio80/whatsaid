
## Goal
Add an admin **"Fix"** action (per-row + "Fix all") in the Others tab that, for each flagged tag — **regardless of source language**:
1. Detects the tag's actual language (via AI gateway).
2. Rewrites `tags.name` to the **English canonical** form.
3. Pre-seeds `tag_translations` with the **original string keyed under the detected language** (so users in that language keep seeing the original label).
4. Resolves the flag.

## Why language-agnostic
The existing `tag_quality_flags.detected_lang` may be approximate or null (the inline heuristic only knows "looks non-English"). We must not assume Italian. The fix function asks the LLM to return both the **detected source language** (ISO code) and the **English canonical name** for each flagged tag in a single batched call, then seeds the cache row using whatever language the LLM detected.

## Plan

### 1. New edge function: `fix-flagged-tags` (admin-only)
- Verify caller via `has_role(auth.uid(), 'admin')`.
- Body: `{ flag_ids?: string[] }` — empty/omitted = all open flags.
- Single batched AI gateway call (tool-calling for structured output) returning per tag:
  ```
  { tag_id, detected_lang (ISO 639-1), english_name }
  ```
- For each result:
  1. `UPDATE tags SET name = english_name, source = 'ai'` (existing trigger renormalizes + invalidates stale cache rows for the old `normalized_name`).
  2. `UPSERT tag_translations (normalized_name = <new normalized english>, target_lang = detected_lang, translated_name = <original tag name>)` — only if `detected_lang !== 'en'`.
  3. `UPDATE tag_quality_flags SET status='resolved', resolved_at=now()`.
- Collision handling: if the new English name normalizes to an existing tag for the same `user_id`, repoint that user's `job_tags.tag_id` to the surviving tag and delete the duplicate.
- Returns `{ fixed: number, errors: Array<{ flag_id, message }> }`.

### 2. `OthersTab.tsx` — UI additions
- **"Fix all"** button in the card header (next to refresh), with a confirm dialog showing the count.
- Per-row **"Fix"** button alongside Rename / Dismiss / Delete.
- Spinner state on the clicked row(s); on success, toast `"Fixed N tags"` and reload.

### 3. i18n
Add to `admin.others.*` in en/fr/it: `fix`, `fixAll`, `fixing`, `fixedCount`, `fixConfirmTitle`, `fixConfirmDesc`.

### 4. Deploy
Deploy `fix-flagged-tags`. No migration needed.

## Files touched
- `supabase/functions/fix-flagged-tags/index.ts` (new)
- `src/components/admin/OthersTab.tsx`
- `src/i18n/locales/{en,fr,it}.json`

## Out of scope
- No schema changes.
- No changes to `auto-tag` or `translate-tags`.
- No bulk re-translation across other languages — only the detected source language is seeded; other languages get filled lazily by `translate-tags` as users view them.
