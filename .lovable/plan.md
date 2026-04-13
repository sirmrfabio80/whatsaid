

# Improve AssemblyAI Transcription Quality for Italian Conversational Audio

## Current Weaknesses Identified

### 1. Request configuration issues
- **Single model fallback**: Only `["universal-3-pro"]` is sent. Adding `"universal-2"` as fallback gives AssemblyAI a second model to cross-reference, which is the documented best practice for keyterms prompting and generally improves accuracy.
- **No temperature control**: Defaults to AssemblyAI's default (likely ~0.5). Lower temperature (0.1) produces more deterministic, conservative output — fewer hallucinated words, better for medical/domain terminology.
- **No tuning knobs exposed**: No way to pass `keyterms_prompt` for domain vocabulary (e.g. "Moncrivello", "sondino nasogastrico", "PEC", "RSA", "lungodegenza").

### 2. Response handling issues — the bigger problem
- **Utterances are flattened and discarded**: The raw AssemblyAI response (which contains `utterances` with `start`, `end`, `confidence`, `speaker`, and a `words` array per utterance) is never stored. Only a rendered plain-text string is kept in `job_outputs.content`.
- **No timestamps in rendered transcript**: The current format is `Speaker A: text\n\nSpeaker B: text`. Timestamps (`start`/`end`) from utterances are thrown away, making it impossible to audit timing or improve the UI later.
- **No raw response preservation**: If AssemblyAI returns good data but our rendering damages it, we can't tell — the raw JSON is gone.
- **No words-level data**: Word-level timestamps and confidence scores (useful for highlighting low-confidence words) are discarded.

### 3. Language handling
- Language handling is actually correct: manual selection passes `language_code`, auto passes `language_detection: true`. No change needed here beyond confirming the mapping.

### 4. No evaluation capability
- No way to compare two runs of the same audio with different configs. No config logging per job.

## Implementation Plan

### Phase 1: Database schema additions (low risk)

**What**: Add columns to store raw data and transcription config.

**Migration SQL**:
```sql
ALTER TABLE public.job_outputs ADD COLUMN IF NOT EXISTS raw_response jsonb;
ALTER TABLE public.job_outputs ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS transcription_config jsonb;
```

- `raw_response`: Full AssemblyAI JSON response (on the `transcript` output_type row)
- `metadata`: Extracted structured data — utterances array, words array, confidence
- `transcription_config`: The exact payload sent to AssemblyAI for this job (enables A/B comparison)

**Files**: New migration only.
**Regression risk**: None — additive columns, all nullable, no existing code reads them.
**Test**: Verify existing jobs load correctly. New columns default to null.

### Phase 2: Improve AssemblyAI request payload (low risk)

**What**: Update the transcript submission payload in `supabase/functions/transcribe/index.ts`.

**Changes**:
```typescript
const transcriptPayload = {
  audio_url: signedUrlData.signedUrl,
  speech_models: ["universal-3-pro", "universal-2"],  // add fallback
  speaker_labels: true,
  temperature: 0.1,                                    // add determinism
  // language handling stays as-is (already correct)
};

// Optional: read tuning from job row if present
if (job.transcription_config?.keyterms_prompt) {
  transcriptPayload.keyterms_prompt = job.transcription_config.keyterms_prompt;
}
```

**Files**: `supabase/functions/transcribe/index.ts`
**Regression risk**: Low — same API, better parameters. `temperature: 0.1` and `universal-2` fallback are both documented and safe.
**Test**: Run same Italian audio file, compare output quality.

### Phase 3: Store raw response and structured metadata (medium risk)

**What**: After transcription completes, store the full response and extracted metadata alongside the rendered text.

**Changes in `transcribe/index.ts`**:
- Save `raw_response` = full AssemblyAI JSON (minus audio_url for security)
- Save `metadata` = `{ utterances, words_count, confidence, audio_duration, language_code }`
- Save `transcription_config` on the `jobs` row = the exact payload sent
- Continue building `content` as rendered plain text (backward compatible)

```typescript
await supabase.from("job_outputs").insert({
  job_id,
  output_type: "transcript",
  content: transcriptText,        // backward compatible
  raw_response: sanitizedResponse, // new: full JSON
  metadata: {                      // new: structured
    utterances: transcript.utterances,
    confidence: transcript.confidence,
    audio_duration: transcript.audio_duration,
  },
});
```

**Files**: `supabase/functions/transcribe/index.ts`
**Regression risk**: Low — adds data, doesn't change what `content` contains. Existing UI reads only `content`.
**Test**: Process a file, verify `raw_response` and `metadata` are populated in the database. Verify existing UI still works.

### Phase 4: Improve rendered transcript with timestamps (medium risk)

**What**: Change the plain-text rendering to include timestamps per utterance turn.

**Current format**:
```
Speaker A: text here

Speaker B: text here
```

**New format**:
```
[00:00:05] Speaker A: text here

[00:01:23] Speaker B: text here
```

**Files**: `supabase/functions/transcribe/index.ts`
**Regression risk**: Medium — the `content` field format changes. Need to verify:
- `TranscriptEditor` component parses `Speaker X:` prefix — must also handle `[HH:MM:SS] Speaker X:` prefix
- `parseSpeakers()` function — must handle timestamps
- `applySpeakerNames()` — must handle timestamps
- Export functions — read `content` as plain text, timestamps are additive

**Mitigation**: Check and update `parseSpeakers` and `applySpeakerNames` regex patterns to tolerate the `[HH:MM:SS]` prefix.

**Test**: Process a file, verify transcript renders correctly in the UI, verify exports include timestamps, verify speaker renaming still works.

### Phase 5: Tuning-ready backend (low risk)

**What**: Allow `keyterms_prompt` to be passed per job without UI changes yet.

**How**: 
- `process-job` already accepts `custom_prompt` from the request body
- Add support for `keyterms_prompt` in the same flow
- `process-job` writes it to `jobs.transcription_config` before calling `transcribe`
- `transcribe` reads it from the job row
- Validation: never send both `keyterms_prompt` and `custom_prompt` (AssemblyAI prompt) in the same request

**Files**: `supabase/functions/process-job/index.ts`, `supabase/functions/transcribe/index.ts`
**Regression risk**: None — new optional parameter, ignored if not provided.
**Test**: Manually invoke with `keyterms_prompt` via API, verify it appears in the AssemblyAI payload and in `transcription_config`.

### Phase 6: Evaluation logging (low risk)

**What**: Log config and quality signals per job for comparison.

**How**:
- `transcription_config` on jobs table already captures what was sent
- Enhanced completion log already exists — add config fingerprint
- For evaluation, query: same `file_name` + different `transcription_config` = comparable runs
- Add `utterance_count`, `unique_speakers`, `avg_confidence` to the completion log

**Files**: `supabase/functions/transcribe/index.ts` (logging only)
**Regression risk**: None — logging only.

## Files touched (summary)

| File | Phase | Change |
|------|-------|--------|
| New migration | 1 | Add `raw_response`, `metadata` to `job_outputs`; `transcription_config` to `jobs` |
| `supabase/functions/transcribe/index.ts` | 2,3,4,6 | Better payload, store raw response, timestamps in text, eval logging |
| `supabase/functions/process-job/index.ts` | 5 | Pass `keyterms_prompt` through |
| `src/components/TranscriptEditor.tsx` | 4 | Update `parseSegments` regex for `[HH:MM:SS]` prefix |
| `src/lib/speaker-names.ts` | 4 | Update regex to handle timestamp prefix |

## What this plan does NOT touch
- No UI changes beyond regex tolerance for timestamps
- No auth, billing, routing, export format, or page changes
- No provider migration
- No prompt or keyterms_prompt defaults — starts clean, tunable later

## Assumptions to verify before implementation
1. AssemblyAI `temperature` parameter is supported for `universal-3-pro` (confirmed via docs)
2. `keyterms_prompt` works with non-English languages (docs show language_detection + keyterms together)
3. `parseSegments` in `TranscriptEditor.tsx` — need to read the exact regex to ensure timestamp prefix compatibility

