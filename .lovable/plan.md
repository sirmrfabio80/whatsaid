

# Fix wrong-language translated transcripts (and stop serving cached garbage)

## Expected vs current behaviour

**Expected:** Selecting "Italian" returns Italian text for both transcript and summary, every time. If the AI ever returns the wrong language, the system rejects it, surfaces a clear error, and never caches it. Re-selecting Italian retries from scratch.

**Current (confirmed in DB for job `52591d3a-…`):**
- Summary variant: Italian ✅
- Transcript variant: **Bengali** ❌, cached under `language='it'`, `source_hash=59eef457e80bf4d2`
- Re-selecting Italian returns the Bengali cache forever — the `(job_output_id, language)` key plus matching `source_hash` short-circuits regeneration in `handleTranslateAll` (lines 84–100).

**Root cause** (`supabase/functions/regenerate/index.ts:103`):
```ts
`Translate the following content to ${targetLang}.` // → "...to it."
```
The model receives the bare ISO code "it". For short content (the summary) Gemini guesses Italian; for the longer transcript with Speaker labels, it picked Bengali. This is reproducible on any language code.

There is **no validation** between AI output and the `upsert` into `job_output_variants` (line 117), and **no validation on cache read** (line 86), so the bad result is sticky.

## Phased plan

### Phase 1 — Shared language metadata

Extend `src/lib/languages.ts` with an English name field used by both frontend and edge code:

```ts
export const LANGUAGES = [
  { code: "auto", label: "Auto-detect", englishName: "Auto" },
  { code: "en", label: "English", englishName: "English" },
  { code: "it", label: "Italian", englishName: "Italian" },
  // ...all 30 entries
] as const;

export function getLanguageEnglishName(code: string): string | null { … }
```

Frontend `label` (i18n display) stays unchanged; only a new `englishName` field is added. Backwards compatible.

Create a small mirror in edge land at `supabase/functions/_shared/languages.ts` (edge functions cannot import from `src/`). It exports the same `code → englishName` map plus a `LANGUAGE_SCRIPTS` map (see Phase 3). A short comment in both files points to each other so future additions stay in sync. A unit test in `src/test/languages.test.ts` asserts the two maps have identical key sets — drift becomes a test failure.

### Phase 2 — Translation prompt fix

In `handleTranslateAll`, replace the single hard-coded prompt with a per-call build that resolves the code first:

```ts
const targetName = getLanguageEnglishName(targetLang); // e.g. "Italian"
if (!targetName || targetLang === "auto") {
  throw Object.assign(new Error("Unsupported target language"), { statusCode: 400 });
}

const systemPrompt =
  `You are a professional translator. Translate the following content into ${targetName} (ISO 639-1 code: ${targetLang}). ` +
  `The output language MUST be ${targetName} — never any other language under any circumstances. ` +
  `Preserve ALL formatting EXACTLY: markdown structure, headings, bullets, bold/italic, line breaks, ` +
  `speaker labels (e.g. "Speaker A:"), timestamps (e.g. "[00:01:23]"), and section structure. ` +
  `Do NOT add, remove, summarise, interpret, or comment on the content. ` +
  `Output ONLY the translated text — no preface, no notes, no language tag.`;
```

Whitelist the code against the shared map before any AI call so we never send unknown codes to the model.

### Phase 3 — Two-stage validation before caching

Add `supabase/functions/_shared/language-validation.ts`:

**Stage A — Script-family sanity check.** A `LANGUAGE_SCRIPTS` map classifies each supported code into one of:
`latin`, `cyrillic`, `arabic`, `hebrew`, `devanagari`, `greek`, `cjk`, `japanese`, `korean`, `thai`.

Strip out non-letter ballast that is intentionally untranslated (timestamps `\[\d{2}:\d{2}:\d{2}\]`, "Speaker A:" labels, code spans `` ` … ` ``, URLs, numbers, markdown punctuation). On the **letters-only** remainder, count Unicode-range hits per script and require:
- ≥ 70 % of letters in the expected script for the target language, AND
- ≤ 5 % of letters in any **wrong non-Latin** script (catches the Bengali case: Bengali block U+0980–U+09FF must be ~0 % when target is Italian).

Sample size guard: if letters-only length < 40 chars (e.g. a tiny custom output), skip Stage A — too noisy.

**Stage B — Lightweight target-language verification.** Stage A alone passes Spanish-when-Italian-was-asked. To catch that, score the letters-only text against a small per-language stop-word/character-frequency fingerprint:
- For Latin-script targets: a 30–50 word stop-word list per language (e.g. Italian `il, la, di, che, è, sono, non, per, con…`) — count matches per 1k tokens. Require the target language to be the top-scoring match by a margin of ≥ 1.3× over runner-up, OR ≥ 5 distinct stop-words present.
- For non-Latin targets: Stage A's script check is already strong enough; Stage B is a no-op.

This is intentionally cheap (no extra AI calls) and conservative. False-positive risk is tuned away by:
- ignoring timestamps/speaker labels/URLs/code,
- skipping Stage A on very short outputs,
- requiring a margin (not absolute) on Stage B.

**Wiring in `handleTranslateAll`:**
- After `callAI` returns and **before** the upsert, run `validateTranslation(translated, targetLang)`. On failure: skip the upsert, throw `Object.assign(new Error("translation_validation_failed"), { statusCode: 422 })`. The existing client toast (`translationFailed`) fires; UI state is untouched because we never wrote.
- On the cache-read path (lines 84–89): for each candidate fresh variant, also run `validateTranslation(v.content, targetLang)`. If it fails, drop it from `freshMap` so the loop re-translates, and `delete` the bad row in the same pass. This is the long-term self-healing piece — no schema migration required.

### Phase 4 — One-off cleanup for job `52591d3a-…`

Not a migration. A single safe maintenance statement, scoped tightly:

```sql
-- Delete only the Bengali transcript variant. The Italian summary is correct
-- and is preserved.
DELETE FROM public.job_output_variants v
USING public.job_outputs jo
WHERE v.job_output_id = jo.id
  AND jo.job_id = '52591d3a-0494-4119-91d0-71b60ca99af1'
  AND v.language = 'it'
  AND jo.output_type = 'transcript';
```

I will run this once via the read/write SQL path (with the user's confirmation) **after** Phases 1–3 are deployed, so the next click on Italian re-translates with the new prompt + validation.

### Phase 5 — Observability

Add concise logs (no transcript content), all under the existing `[regenerate]` prefix:

```
[regenerate] translate target=it (Italian) job=… outputs=N
[regenerate] cache-read output=… status=hit|stale|invalid-script|invalid-fingerprint
[regenerate] cache-evict output=… reason=invalid-<stage>
[regenerate] validate output=… stage=A|B result=pass|fail script=<detected>
[regenerate] translate output=… outcome=stored|rejected reason=<…>
```

No content, no PII. Just IDs, codes, stage names, outcomes.

## Files changed

- `src/lib/languages.ts` — add `englishName` field on each entry + `getLanguageEnglishName()`.
- `src/test/languages.test.ts` — **new**, asserts edge map is in sync with frontend.
- `supabase/functions/_shared/languages.ts` — **new**, edge mirror of code → englishName + script classifier.
- `supabase/functions/_shared/language-validation.ts` — **new**, `validateTranslation(text, code)` with two-stage logic and tests-friendly pure helpers.
- `supabase/functions/regenerate/index.ts` — only `handleTranslateAll`: resolve language name, build new prompt, validate AI output before upsert, validate cached variants on read, evict invalid, add logs.

Nothing else touched: summary regen, custom regen, summary_from_edit, exports, share, UI logic — all untouched.

## Validation strategy summary

| Check | Catches | Cost |
|---|---|---|
| Stage A — script ratio (≥70 % expected, ≤5 % wrong non-Latin) | Bengali-when-Italian, Arabic-when-French, Cyrillic-when-Spanish | regex + counters |
| Stage B — stop-word fingerprint (Latin targets only) | Spanish-when-Italian, French-when-Portuguese | one pass over tokens |
| Pre-cache validation | Stops bad upserts | 1× per translation |
| On-read validation | Self-heals existing cache | 1× per cached read |

Conservative thresholds + ignoring timestamps/speaker labels/URLs keep false positives near zero on real translations. Worst case: a legitimate translation is rejected, user sees `translationFailed`, retries, gets a fresh attempt. No data corruption possible.

## Risks & rollback

- **False-positive validation rejects a good translation.** Mitigated by short-output exemption and margin-based Stage B. Failure mode is "user retries", not "data lost". If it ever fires too often in production, raise the Stage A threshold from 70 %→60 % via one-line change.
- **Edge/frontend map drift.** Mitigated by the `languages.test.ts` set-equality assertion.
- **On-read cache eviction deletes a row another request was about to use.** The eviction is idempotent (`delete … where id = …`) and the same request re-translates and re-upserts. No correctness risk.
- **Rollback.** Single edge function + 3 small new shared files. Reverting `regenerate/index.ts` to its current logic restores prior behaviour instantly. Cache-read validation can be feature-flagged off via a `VALIDATE_CACHED_TRANSLATIONS` constant if we ever need to disable it without redeploying everything.

