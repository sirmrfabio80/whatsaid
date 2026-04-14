

# Variant Freshness & Invalidation — Plan

## Freshness model

**Staleness is implicit, not flagged.** There is no `stale` boolean column. A variant is treated as stale when its stored `source_hash` does not match the hash of the current source transcript content. Variants are never explicitly marked as stale in the database.

## Schema change

Add one column to `job_output_variants`:

```sql
ALTER TABLE public.job_output_variants
  ADD COLUMN source_hash TEXT NOT NULL DEFAULT '';
```

Existing rows get `''` (empty string). Since an empty string never matches any real content hash, existing variants are implicitly stale and will be regenerated on next language switch. No data loss — just one extra regeneration per legacy job.

## Hash function

SHA-256 of the transcript content, truncated to the first 16 hex characters. Computed server-side only (in the `regenerate` edge function). The client does not need to compute hashes.

## Invalidation rules

All variants (transcript, summary, Q&A) depend on the original-language transcript as their source:

| Variant type | Stale when |
|---|---|
| Transcript variant | `source_hash` does not match current transcript content hash |
| Summary variant | Same — derived from transcript |
| Q&A (`custom`) variant | Same — derived from transcript |

## Changes

### 1. Migration

Add `source_hash TEXT NOT NULL DEFAULT ''` to `job_output_variants`.

### 2. `supabase/functions/regenerate/index.ts` — `handleTranslateAll`

- Compute `source_hash` from the transcript's current `content` using `crypto.subtle.digest("SHA-256", ...)`, truncated to 16 hex chars.
- When checking existing variants (line ~69–75), also fetch `source_hash` and compare against the computed hash. Variants with mismatched hashes are treated as missing and re-translated.
- Store `source_hash` on every upserted variant row.

### 3. `src/components/JobResults.tsx` — `handleTranscriptSave`

After saving the edited transcript (line 348–355):
- Clear `variants` state.
- If `outputLang !== originalLang`, reset `outputLang` to `originalLang` and persist `output_language = null` on the job.
- Show toast: `t("jobResults.transcriptEditedResetLang")`.

This ensures the user is returned to the original language after editing. The next language switch will trigger `regenerate`, which will detect hash mismatches and re-translate.

### 4. `src/components/JobResults.tsx` — `handleOutputLanguageChange`

No changes needed. The existing flow calls `regenerate` when variants are missing. The backend hash comparison handles staleness transparently — stale variants are re-translated server-side without the client needing to know.

One adjustment: when fetching existing variants from DB (line ~304–308), also fetch `source_hash`. But since the client doesn't know the current transcript hash, it's simpler to let the backend handle this entirely. The client flow already falls through to `regenerate` when variant count is insufficient. The backend will re-translate stale variants and return fresh content.

**Simplification**: Remove the client-side DB check for existing variants (lines 303–319). Always call the `regenerate` function, which already handles caching internally (returns existing fresh variants without re-translating). This eliminates the need for the client to reason about staleness at all.

### 5. i18n

Add one key to EN, FR, IT:
- `jobResults.transcriptEditedResetLang`
  - EN: `"Transcript edited — translations will update on next language switch"`
  - FR: `"Transcription modifiée — les traductions seront mises à jour au prochain changement de langue"`
  - IT: `"Trascrizione modificata — le traduzioni verranno aggiornate al prossimo cambio di lingua"`

## Files affected

| File | Change |
|---|---|
| Migration SQL | Add `source_hash` column |
| `supabase/functions/regenerate/index.ts` | Compute hash, compare on read, store on upsert |
| `src/components/JobResults.tsx` | Clear variants + reset lang on transcript save; simplify language switch to always call `regenerate` |
| `src/i18n/locales/en.json`, `fr.json`, `it.json` | Add `transcriptEditedResetLang` |

## Regression risks

| Risk | Mitigation |
|---|---|
| Existing variants all have `source_hash = ''` | Treated as stale (empty never matches real hash), regenerated once on next switch |
| Auto-switch to original after edit may surprise user | Toast explains why |
| Removing client-side variant cache check | Backend already caches fresh variants; no extra latency for fresh variants |
| Summary/Q&A variants regenerated when only transcript changed | Correct — all outputs derive from transcript |

## Test plan

1. Open a completed job with existing translations — verify they load
2. Edit transcript while viewing original language — verify no disruption
3. Edit transcript while viewing a translation — verify auto-switch to original + toast
4. Switch to another language after editing — verify spinner, regeneration, fresh content
5. Switch again to same language without editing — verify cached variants load instantly (no re-translation)
6. Verify exports use correct content after re-translation

