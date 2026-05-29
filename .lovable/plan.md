# Fix: "Record now" → create-job 400 (duration_seconds must be a positive number)

## Root cause

In `src/pages/Convert.tsx`, `handleRecordingReady` calls `setDuration(dur)` and immediately invokes `handleConvert({ file, duration: dur, fileCreationDate })` in the same tick. `handleConvert` already resolves overrides into local variables:

- `effDuration = overrides?.duration ?? duration`
- `effFileCreationDate = overrides?.fileCreationDate !== undefined ? overrides.fileCreationDate : fileCreationDate`

…but the `createJobBody` object (around line 384) still reads the **raw React state** for four fields. On a fresh recording the state hasn't flushed yet, so `duration` is `0` and `fileCreationDate` is `null` — the server rejects with `duration_seconds must be a positive number`. Uploads work because the user clicks Convert later, after state has settled.

## Change (single file: `src/pages/Convert.tsx`)

Inside the `createJobBody` object only, swap stale state reads for the already-resolved variables:

| Line | Before | After |
|------|--------|-------|
| 387 | `duration_seconds: Math.round(duration)` | `duration_seconds: Math.round(effDuration)` |
| 393 | `metadata_apple_creationdate: fileCreationDate?.allSources.apple_metadata ?? null` | `metadata_apple_creationdate: effFileCreationDate?.allSources.apple_metadata ?? null` |
| 394 | `metadata_mvhd_creation: fileCreationDate?.allSources.mvhd_creation ?? null` | `metadata_mvhd_creation: effFileCreationDate?.allSources.mvhd_creation ?? null` |
| 396 | `metadata_location_iso6709: fileCreationDate?.locationISO6709 ?? null` | `metadata_location_iso6709: effFileCreationDate?.locationISO6709 ?? null` |

No other lines change. Payload shape, headers, and idempotency handling are untouched.

## Out of scope (guardrails)

- No changes to `use-audio-recorder.ts`, the `create-job` edge function, auth, billing, or RLS.
- No new dependencies, no token changes.

## Verification

1. Record a short clip via "Record now" → Stop → transcription auto-starts; create-job returns 2xx; `jobs.duration_seconds` equals the recorded length.
2. Upload an `.m4a`/`.mp3`/`.wav` and Convert — still works, metadata fields populated as before.
