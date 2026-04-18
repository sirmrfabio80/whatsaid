
## Goal
Avoid redundant AI calls in `translate-tags` by reusing translations already cached in `tag_translations` for the same `(normalized_name, target_lang)` — across all users, since the cache is global by design.

## Current state (verified)
Looking at `supabase/functions/translate-tags/index.ts`, the cache lookup **already exists**:
1. Normalizes incoming tag names.
2. Queries `tag_translations` for matching `(normalized_name, target_lang)` rows.
3. Sends only cache misses to the AI gateway.
4. Upserts new AI results back into the cache.

So global cross-user reuse is already working. What's **missing** to fully honor the request:

### Gap 1 — Frontend re-asks the edge function on every session
`src/lib/tag-translation.ts` has only an in-memory cache (lost on reload). Every page refresh re-invokes `translate-tags`, which then hits the DB cache (cheap, no AI). That's fine but adds a network round-trip per page.

### Gap 2 — Translation only happens on-demand (correct, keep as-is)
`useTranslatedTags` is only called by components that render tags in the user's UI language. English users skip the function entirely (early return in both client and server). This already matches the requirement "translated only when necessary."

### Gap 3 — No pre-warm / batch reuse signal
Multiple components on the same page may each invoke `translate-tags` with overlapping tag sets, missing the chance to dedupe at the React Query layer.

## Plan

### 1. Add a persistent client-side cache (localStorage)
Update `src/lib/tag-translation.ts`:
- Read cache from `localStorage` key `tagTranslations:v1` on module load into the existing in-memory `Map`.
- After fetching, persist new entries back to `localStorage` (debounced write, capped at ~2000 entries with LRU eviction).
- Bump cache version key when normalization rules change.

Result: returning users skip the network call entirely for previously-seen tags.

### 2. Confirm DB cache is the source of truth (no code change needed)
The `translate-tags` edge function already:
- Looks up `tag_translations` by `(normalized_name, target_lang)`.
- Only sends cache misses to AI.
- Upserts results.
The `invalidate_tag_translation_cache` trigger keeps it consistent on tag renames.

### 3. Dedupe React Query keys across components
Update `src/hooks/use-translated-tags.ts`:
- Sort tag list before using as query key so `["a","b"]` and `["b","a"]` share one cache entry.
- Set `staleTime: Infinity` (translations are stable until tag rename, which we can't observe client-side anyway — accept eventual consistency on next reload).
- Set `gcTime` to 24h.

### 4. (Optional, no code) Audit confirmation
Add a one-line console log in dev mode when a cache hit occurs vs miss, gated by `import.meta.env.DEV`, so we can verify zero AI calls on reload.

## Files touched
- `src/lib/tag-translation.ts` — add localStorage persistence + LRU
- `src/hooks/use-translated-tags.ts` — sorted query key, longer staleTime/gcTime

## Out of scope
- No edge function changes (DB cache already optimal).
- No schema changes.
- No background pre-warming of translations for languages users haven't selected (would waste credits — opposite of the request).
- No invalidation push from server to client on tag rename (rare event; accepted staleness until next reload).
