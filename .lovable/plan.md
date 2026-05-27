# Pin AssemblyAI to EU-only

## Goal
Make `https://api.eu.assemblyai.com/v2` the **only** AssemblyAI endpoint the codebase can ever reach. Remove geo-routing entirely (no toggle, no US fallback, no admin override, no migration path back to US). Fix the `cleanup-assemblyai` US-base-URL bug. Leave the regional auth guard, transcription business logic, and audio-deletion sequence untouched.

## Confirmed search results

**1. Every place in the repo that touches an AssemblyAI host:**
| File | Current value |
|---|---|
| `supabase/functions/transcribe/index.ts:22` | `FALLBACK_BASE_URL = "https://api.eu.assemblyai.com/v2"` |
| `supabase/functions/transcribe/index.ts:49` | `us_base_url: "https://api.assemblyai.com/v2"` |
| `supabase/functions/cleanup-assemblyai/index.ts:4` | `ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2"` ← **bug** |
| `supabase/functions/detect-language/index.ts:100` | `baseUrl = "https://api.eu.assemblyai.com/v2"` ← already EU |
| `src/lib/transcribe-template.ts:76, 78` | `base_url` (EU) and `us_base_url` (US) defaults |
| `supabase/migrations/20260417163903_*.sql:63` | seeded template with `"base_url": "https://api.eu.assemblyai.com/v2"` (historical seed — leave the file alone; new migration overwrites live data) |

No other file references `api.assemblyai.com` or `api.eu.assemblyai.com`. The regional auth guard (`_shared/region.ts`, `geo-check`, `check-login-region`, `validate-signup-country`) is independent and out of scope.

**2. Code paths in `transcribe/index.ts` where transcript persists but audio (storage + AssemblyAI) is NOT deleted:**

Success-path ordering (lines 749–826):
1. UPDATE `jobs` with `assemblyai_transcript_id`, `assemblyai_delete_status='pending'`.
2. INSERT `job_outputs` transcript row.
3. `fetch DELETE /transcript/{id}` (try/catch — failures recorded as `assemblyai_delete_status='failed'`, **never re-thrown**).
4. `supabase.storage.from('temp-audio').remove([temp_file_path])` — failures only logged, never re-thrown.
5. UPDATE `jobs.audio_deleted_at = now()` (runs unconditionally).

Findings:
- ✅ **No code path persists the transcript and then skips both deletions.** Both DELETE calls are unconditional once `INSERT job_outputs` succeeds; both are wrapped so they cannot abort the function.
- ⚠️ **Soft risks to flag (do NOT fix in this change — out of scope):**
  - If `supabase.storage.remove` fails, `audio_deleted_at` is **still** set to `now()`, masking the orphan in `temp-audio/{user_id}/{job_id}.{ext}`. There is no retry queue equivalent to `cleanup-assemblyai` for storage orphans (only `watchdog-stale-jobs` covers stuck jobs, not successful-but-orphaned audio).
  - If `INSERT job_outputs` fails, the function throws before either deletion. In this branch the transcript is **not** persisted (so the user's invariant holds), but the AssemblyAI-side transcript and the audio file are both leaked until `cleanup-assemblyai` (AssemblyAI side) and `watchdog-stale-jobs` (storage side, via `markJobFailed`) pick them up.
  - The pre-flight `detect-language` function also `fetch DELETE`s its throwaway transcript best-effort with no retry; failures there leak a short detection transcript on AssemblyAI.

These are noted for the record; the user said "verify, do not change" and "do not introduce new logic" — they will not be modified in this plan.

## Files to change (in this exact order)

### Code changes — safe to apply against the current schema (geo keys ignored, never written)

1. **NEW** `supabase/functions/_shared/assemblyai.ts`
   - Exports `export const ASSEMBLYAI_EU_BASE_URL = "https://api.eu.assemblyai.com/v2"` and nothing else.

2. **EDIT** `supabase/functions/transcribe/index.ts`
   - Import `ASSEMBLYAI_EU_BASE_URL` from `../_shared/assemblyai.ts`.
   - Replace `FALLBACK_BASE_URL` constant with the imported one.
   - Drop `geo_routing_enabled` and `us_base_url` from `ActiveTemplateConfig` interface, from `FALLBACK_CONFIG`, and from `parseActiveConfig()` (it stops reading those keys — old rows that still contain them are simply ignored).
   - Delete `detectCountry()` and `resolveBaseUrl()`.
   - In `Deno.serve`: remove the `detectedCountry` + `resolvedBaseUrl` block; pass `ASSEMBLYAI_EU_BASE_URL` directly into `submitAndPollTranscript` and into the post-success `DELETE /transcript/{id}` call.
   - Keep the `region_routing_resolved` log event for dashboard continuity, but emit `{ event: "region_routing_resolved", base_url: ASSEMBLYAI_EU_BASE_URL }` only — remove `country` and `geo_routing_enabled` fields.
   - Leave every other transcription/diarization/heartbeat/polling/error-handling line untouched.

3. **EDIT** `supabase/functions/cleanup-assemblyai/index.ts`
   - Replace the local `ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2"` constant with an import of `ASSEMBLYAI_EU_BASE_URL` from `../_shared/assemblyai.ts`. (Fixes the bug.)

4. **EDIT** `supabase/functions/detect-language/index.ts`
   - Replace the local `const baseUrl = "https://api.eu.assemblyai.com/v2"` with the imported `ASSEMBLYAI_EU_BASE_URL`. (Value unchanged; eliminates the duplicate string so the invariant is enforced by `grep`.)

5. **EDIT** `src/lib/transcribe-template.ts`
   - Remove `base_url`, `geo_routing_enabled`, `us_base_url` from `TranscribeTemplateConfig`.
   - Remove them from `DEFAULT_TEMPLATE_CONFIG`, from `parseTemplateConfig` (stop reading those keys), and from `configsEqual`.
   - Delete `resolveBaseUrl()` and the `country` field on `PreviewSampleJob`.
   - `buildPreviewPayload` is unaffected (it never uses `base_url`).

6. **EDIT** `src/components/admin/TemplateEditor.tsx`
   - Delete the entire "Region routing" `<Section>` (geo toggle + default base URL + US base URL inputs).
   - Remove `us_base_url` from `DisabledMap` and `computeDisabled()`.

7. **EDIT** `src/components/admin/RequestPreviewPanel.tsx`
   - Stop importing `resolveBaseUrl`. Replace the dynamic `resolvedBaseUrl` calculation with the imported `ASSEMBLYAI_EU_BASE_URL` constant (mirrored to a small client-side constant in `src/lib/transcribe-template.ts` so the FE doesn't import from edge code).
   - Remove the "Sample country" `<Select>`, the `sampleCountry` state, the `country` arg passed to `buildPreviewPayload`, and the "Geo-routing ON/OFF" badge. Keep the read-only endpoint display showing `${ASSEMBLYAI_EU_BASE_URL}/transcript`.

### Migration — applied last so it cannot race ahead of code that still reads the dropped keys

8. **NEW** Supabase migration:
   - Single `UPDATE public.transcribe_settings_templates SET config = (config - 'geo_routing_enabled' - 'us_base_url') || jsonb_build_object('base_url', 'https://api.eu.assemblyai.com/v2'), updated_at = now();`
   - Does **not** drop the `config` column, does **not** touch any other column, does **not** restructure the table.
   - After this runs every existing row is geo-key-free and pinned to the EU base URL. New rows written by the (already-updated) admin UI never include the dropped keys.

## Invariants enforced after this change

- `rg 'api\.assemblyai\.com|api\.eu\.assemblyai\.com'` returns exactly **two** hits: `_shared/assemblyai.ts` (the single source of truth) and the existing migration `20260417163903_*.sql` (historical seed, harmless). I'll verify this with a grep after the edits.
- No symbol named `geo_routing_enabled`, `us_base_url`, `resolveBaseUrl`, or `detectCountry` exists anywhere in `src/` or `supabase/functions/`.
- The four success-path steps (insert transcript → AssemblyAI DELETE → storage remove → set `audio_deleted_at` / `assemblyai_delete_status`) remain in place, untouched.

## Open questions before I implement

1. **Log shape continuity.** I plan to keep the `region_routing_resolved` event with `{ base_url }` only (no `country`, no `geo_routing_enabled`). If your observability dashboard requires those two fields to remain present (even as `null`/`false`), say so and I'll keep them as fixed nulls instead of removing them.
2. **Admin "Region routing" section.** I'll remove the entire `<Section title="Region routing">` block (toggle + both URL inputs). If you'd rather keep a one-line read-only "Region: EU (locked)" indicator there for admin reassurance, confirm and I'll add it.
3. **Soft risk flags.** Section 2 above lists three residual cleanup gaps (storage orphan with `audio_deleted_at` still stamped; transcript-insert failure leaking both sides; `detect-language` throwaway transcript leak). Confirm you want them **logged only in this plan** and addressed separately, not folded into this change.
