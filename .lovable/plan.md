
## Goal
Tags (AI-generated and manually created) must always display in the user's UI language (`profiles.ui_language`), in every place they appear — including the History page Tags filter.

## Root cause
The frontend pipeline (`useTranslatedTags` → `translate-tags` edge function) already exists and is wired into both `History.tsx` and `JobDetailTags.tsx`. It works correctly **as long as the stored tag name is English**, because `translate-tags` is hardcoded to assume English source. Two leaks break this:

1. **AI-generated tags occasionally stored in non-English** — DB shows 4 Italian AI tags (e.g. "mobilità e automomia", "flessibilità oraria") slipped through despite the English-only system prompt. When the UI is in English, these stay Italian; when the UI is in Italian, the translator is asked to translate Italian-as-if-English → Italian and produces nonsense or no-op.
2. **Manual tags stored in whatever language the user typed** — if an Italian user types "Riunione", an English user later sees "Riunione".

## Plan

### 1. Make the tag-translation edge function language-agnostic
Rewrite the `translate-tags` system prompt so the model:
- Auto-detects each tag's source language.
- Translates into the requested `target_lang`.
- Returns the tag unchanged if it's a proper noun, brand, acronym, or already in the target language.

This single change makes both AI and manual tags display correctly regardless of the language they were stored in.

### 2. Tighten AI tag generation to enforce English canonical form
Update `TAGS_SYSTEM_PROMPT` in `_shared/prompts.ts` to add an explicit, unambiguous instruction:
> "Tags MUST be in English, even if the transcript is in another language. Translate concepts to English. Never output non-English words."

Redeploy `post-process` (which calls `auto-tag`).

### 3. Fix the cache key + lookup in `useTranslatedTags`
Currently `displayMap.get(tag.name)` returns the translation keyed by the *original stored* name. That stays correct after change #1, but to be safer against duplicates and identity, key the cache by `${lang}:${name}` consistently (already done in `tag-translation.ts`). No frontend code change needed beyond verifying behavior.

### 4. Backfill the 4 stray Italian AI tags
One-off data fix: rewrite the 4 known Italian AI tags to their English canonical form so they merge cleanly with existing English tags (avoids duplicates like "informazioni mediche" vs "medical information"):

```
mobilità e automomia       → mobility and autonomy
flessibilità oraria        → schedule flexibility
richiesta disponibilità    → availability request
disponibilità posto        → spot availability
informazioni mediche       → medical information
```

(Done as an `INSERT`-tool data update; if any English equivalent already exists for a user, re-point that user's `job_tags` to the existing tag and delete the Italian duplicate.)

### 5. Verify History filter coverage
`HistoryFilters.tsx` already renders `tag.displayName ?? tag.name` in dropdown, suggestions, and selected chips — so once #1 + #2 land, the filter will show translated names automatically. No component change needed.

## Files touched
- `supabase/functions/translate-tags/index.ts` — language-agnostic prompt
- `supabase/functions/_shared/prompts.ts` — stricter "English only" rule for AI tags
- Data migration via insert tool — backfill 5 Italian tag rows
- Redeploy: `translate-tags`, `post-process`

## Out of scope (per guardrails)
- No changes to tag CRUD UX, tag colors, tag source field.
- No schema change (no new "canonical_name" column) — keeping the change minimal and low-risk.
- No changes to record data or unrelated filters.
