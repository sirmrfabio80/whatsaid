
## Goal
Implement non-English AI tag detection + persistent tag translation cache, with the admin review surface labeled **"Others"** (instead of "Tag Quality").

## Plan

### 1. Database (migration)
Create two new tables:

- **`tag_translations`** — global cache, keyed by `(normalized_name, target_lang)`
  - `id uuid pk`, `normalized_name text`, `target_lang text`, `translated_name text`, `created_at timestamptz`
  - Unique index on `(normalized_name, target_lang)`
  - RLS: read for `authenticated`, write only for service role (edge functions)

- **`tag_quality_flags`** — log of AI tags that fail the English-only check
  - `id uuid pk`, `tag_id uuid fk tags(id) on delete cascade`, `tag_name text`, `detected_lang text`, `status text default 'open'` (`open` | `resolved` | `dismissed`), `created_at timestamptz`, `resolved_at timestamptz`
  - Unique index on `tag_id` (one open flag per tag)
  - RLS: only admins (`has_role(auth.uid(), 'admin')`) can select/update

- **Trigger on `tags`**: when `normalized_name` changes, delete matching rows in `tag_translations` to invalidate cache.

### 2. `translate-tags` edge function
- Before calling AI gateway, look up each `(normalized_name, target_lang)` in `tag_translations`.
- Only send the cache-miss subset to the AI.
- Insert returned translations into `tag_translations` (upsert on conflict do nothing).
- Same response shape — no frontend change needed.

### 3. `auto-tag.ts` (inline detection)
- After AI returns tags, run a lightweight English-only classifier (regex/charset heuristic + fallback to a tiny AI gateway call only if ambiguous) on each tag.
- For any tag classified as non-English, insert a row into `tag_quality_flags` (status `open`).
- Tags still get stored normally — flagging is non-blocking.

### 4. Admin UI — new "Others" tab
- **`src/components/admin/OthersTab.tsx`** (new): lists open `tag_quality_flags` joined with `tags`, with actions:
  - **Rename** (inline input → updates `tags.name` + `normalized_name`, resolves flag)
  - **Delete** (removes tag + cascades flag)
  - **Dismiss** (sets flag `status = 'dismissed'`)
- **`src/pages/Admin.tsx`**: add third tab `<TabsTrigger value="others">Others</TabsTrigger>` with `<OthersTab />`.

### 5. i18n
Add minimal strings under `admin.others.*` in `en.json`, `fr.json`, `it.json` (tab label, column headers, action buttons, empty state).

### 6. Deploy
Redeploy `translate-tags`, `post-process` (which calls `auto-tag`).

## Files touched
- Migration: `tag_translations`, `tag_quality_flags`, invalidation trigger, RLS policies
- `supabase/functions/translate-tags/index.ts` — cache read/write
- `supabase/functions/_shared/auto-tag.ts` — inline detection + flag insert
- `src/components/admin/OthersTab.tsx` — new
- `src/pages/Admin.tsx` — add "Others" tab
- `src/i18n/locales/{en,fr,it}.json` — admin.others.* strings

## Out of scope
- Per-user cache (using global)
- TTL expiration (manual purge only via tag rename trigger)
- Bulk re-translation jobs
