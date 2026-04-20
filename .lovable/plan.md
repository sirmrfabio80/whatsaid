

## Revised plan — long-file conversion fix (aligned with current repo)

### Repo facts confirmed

- `src/lib/audio-enhance.worker.ts` and `src/lib/audio-enhance-streaming.ts` **do not exist**. Only `src/lib/audio-enhance.ts` exists, and it runs `file.arrayBuffer()` + `decodeAudioData()` + lamejs encode entirely on the main thread.
- `AudioChannelAnalysis` only exposes `detectedChannelCount` and `decodedChannelCount`. When decoding succeeds, `detectedChannelCount` is overwritten with the decoded value — header-derived count is lost.
- `analyzeAudioChannels()` always calls `decodeAudioBuffer(file)` (full `file.arrayBuffer()` + `decodeAudioData`) regardless of file size. M4A header detection itself also reads the full file (`detectChannelCountFromHeaders` → `await file.arrayBuffer()` for the mp4 branch).
- `extractAudioCreationDate()` reads the full file via `readBlobAsArrayBuffer(file)`.
- `Convert.handleConvert` does an **additional** decode probe (`probeBuf / probeCtx / decodeAudioData`) on lines 232–236 — redundant with `channelAnalysis`.
- Job poller (lines 87–125) only reacts to `processing | completed | failed`. Status `uploading` is currently a dead state for the UI.
- `job_status` enum is `pending | uploading | processing | completed | failed` — no `preparing`. Adding it requires a DB migration.
- `watchdog-stale-jobs` keys on `status = 'processing'` AND `updated_at < now() - 20 min`. `transcribe`'s AssemblyAI poll loop (lines 296–343) sleeps + fetches but never touches `jobs.updated_at`, so a long valid job goes silent for 20+ min and trips the watchdog.
- Enhancement progress callback is stage-only: `"decoding" | "processing" | "encoding"`. No percentages today.

### Implementation order

#### 1. Remove the redundant decode probe in `Convert.handleConvert`
File: `src/pages/Convert.tsx` (lines 229–239).

- Delete the `probeBuf / probeCtx / decodeAudioData` block.
- Derive `inputChannels` from `channelAnalysis` already in state: `inputChannels = (channelAnalysis?.decodedChannelCount ?? channelAnalysis?.detectedChannelCount ?? 2) === 1 ? 1 : 2`.
- If both are null, default to `2` and log a warning. Do **not** decode here.

#### 2. Extend `AudioChannelAnalysis` to preserve header-derived count
File: `src/lib/audio-channels.ts`.

- Add `headerChannelCount: number | null` to `AudioChannelAnalysis`.
- Stop overwriting `detectedChannelCount` with the decoded count. Keep both header and decoded values explicit.
- Update consumers (`Convert.tsx` `txConfig.channel_analysis`, `audio_channels` insert) to prefer `decodedChannelCount ?? headerChannelCount`.

#### 3. Size/duration-gate full-file analysis in the uploader path
Files: `src/lib/audio-channels.ts`, `src/lib/audio-creation-date.ts`, `src/components/AudioUploader.tsx`.

- **`analyzeAudioChannels(file, durationSeconds?)`** — accept duration. Define `DECODE_MAX_BYTES = 25 * 1024 * 1024` and `DECODE_MAX_SECONDS = 600`. When either threshold is exceeded, **skip** the `decodeAudioBuffer` correlation pass entirely. Return header-only result with `routeHint: "diarization"`, `reason: "skipped_large_file_for_correlation"`. Stereo without isolation evidence routes to diarization (current safe default).
- **`detectM4aChannels` / `detectChannelCountFromHeaders`** — switch the M4A branch from `await file.arrayBuffer()` to incremental `file.slice` reads: read first 256 KB; if `moov` not found, read last 1 MB (handles non-fast-start mp4); cap any further reads at 4 MB total. Never read the full 40 MB+ file just to count channels.
- **`audio-creation-date.ts`** — same incremental head/tail strategy in `extractAudioCreationDate`. 256 KB head, then 1 MB tail; bail otherwise. This is the single biggest pre-insert cost today for the 41-min file.
- **`AudioUploader.tsx`** — pass `dur` into `analyzeAudioChannels(file, dur)`. Keep the parallel `Promise.all` shape but no path should perform a full-file read.

#### 4. Route long M4A/MP4 through a streaming worker; keep in-memory as fallback
Files: new `src/lib/audio-enhance.worker.ts`, new `src/lib/audio-enhance-streaming.ts`, edit `src/lib/audio-enhance.ts`.

These files do not exist today, so this step is genuinely new work (not "wire up an existing worker").

- `src/lib/audio-enhance.worker.ts` — module worker that owns the RMS/peak/gain/soft-clip loops and the lamejs encode. Decode strategy: try `decodeAudioData` in the worker via `OfflineAudioContext`; if unsupported in worker scope, fall back to a single bounded decode on the main thread and `Transferable`-pass channel `Float32Array`s into the worker. Emits stage messages `"decoding" | "processing" | "encoding"` and a final `{ blob, metadata }`.
- `src/lib/audio-enhance-streaming.ts` — thin wrapper that spawns the worker (`new Worker(new URL("./audio-enhance.worker.ts", import.meta.url), { type: "module" })`), forwards stage callbacks, wraps the call in a 6-minute timeout, and rejects on worker error.
- `src/lib/audio-enhance.ts` — keep the existing implementation as the in-memory fallback. Add `enhanceAudioForTranscriptionAuto(file, onProgress, options)` that:
  - Uses the streaming worker for M4A/MP4 files where `file.size > 10 MB`.
  - Uses the legacy in-memory path for small files and for WAV/MP3.
  - On worker timeout/error, falls through to the legacy path; if that also fails, returns `{ file, metadata: { reason: "failed", ... } }` (caller uploads the original file unchanged).
- `Convert.tsx` calls `enhanceAudioForTranscriptionAuto` instead of `enhanceAudioForTranscription`.

#### 5. Insert the `jobs` row earlier — no enum migration
File: `src/pages/Convert.tsx`.

Reuse the existing enum (no DB change). Insert immediately after `setProcessing(true)` with:

- `status: "uploading"`
- `processing_stage: "preparing"`

Then update `processing_stage` ("enhancing" → "uploading") via `update()` calls during the local pipeline. After the storage upload succeeds, update `status: "processing"` and `processing_stage: "queued"` before invoking `process-job`. On any thrown error, mark the row `failed` with `error_message` so the watchdog and Admin pages stay consistent.

#### 6. Update Convert-page poller to reflect early phases
File: `src/pages/Convert.tsx` (lines 87–125).

- Trigger the poller as soon as `jobId` is set — move `setJobId(newJobId)` to right after the early insert (currently after upload completes).
- Extend the polling `select` to include `processing_stage`.
- Map early states:
  - `status === "uploading"` → reflect `processing_stage` (`"preparing" | "enhancing" | "uploading"`) into the existing `setStep`.
  - Add `"preparing"` to the `ProcessingStep` union and to `STEP_LABELS` + i18n (`convert.stepPreparing`).
  - `status === "processing"` → existing transcribing/summarising logic stays.

#### 7. Backend: stop the watchdog from killing legitimate long jobs
Files: `supabase/functions/transcribe/index.ts`, `supabase/functions/watchdog-stale-jobs/index.ts`.

Do both:

- **Heartbeat in `transcribe`**: inside the AssemblyAI poll loop (around line 296–343), every N polls (e.g. every 30 s of wall time, ≈ every 6 polls at the default 5 s interval) issue `update jobs set updated_at = now() where id = :job_id`. This keeps the watchdog query honest while no other column changes for many minutes.
- **Short-term cushion in `watchdog-stale-jobs`**: bump `STALE_MINUTES` from `20` → `30` (line 18). One-line change, ships immediately.

#### 8. Honest stage-level progress (no percentages)
Files: `src/pages/Convert.tsx`, i18n locales.

- Wire the existing `"decoding" | "processing" | "encoding"` callbacks (now coming from the streaming wrapper) into UI substages of "Enhancing audio" — e.g. "Decoding audio…", "Processing samples…", "Encoding MP3…".
- Add a 90 s soft toast: "Long file — preparing audio in your browser. Keep this tab open."
- **Do not** invent percentages. Extending the worker protocol to emit `%` is deferred as a follow-up.

### Out of scope

- No `job_status` enum migration. Reuse `pending | uploading | processing | completed | failed` and use the existing free-text `processing_stage` for substages.
- No change to AssemblyAI submit/payload logic or `post-process`.
- No change to output schemas.

### Files touched

- `src/pages/Convert.tsx` — remove redundant probe; insert job early; widen poller; switch to `enhanceAudioForTranscriptionAuto`; new `processing_stage` updates.
- `src/components/AudioUploader.tsx` — pass `dur` into channel analysis.
- `src/lib/audio-channels.ts` — add `headerChannelCount`; stop overwriting `detectedChannelCount`; size/duration-gate decode; incremental M4A header reads.
- `src/lib/audio-creation-date.ts` — incremental head+tail reads instead of full-file `arrayBuffer()`.
- `src/lib/audio-enhance.ts` — add `enhanceAudioForTranscriptionAuto` wrapper; keep current impl as fallback.
- `src/lib/audio-enhance.worker.ts` — **new**.
- `src/lib/audio-enhance-streaming.ts` — **new**.
- `supabase/functions/watchdog-stale-jobs/index.ts` — `STALE_MINUTES` → `30`.
- `supabase/functions/transcribe/index.ts` — periodic `updated_at` heartbeat in the AssemblyAI poll loop.
- i18n locales (`en.json`, `fr.json`, `it.json`) — add `convert.stepPreparing` and substage labels.

### Validation

- 41-min M4A: job row appears in DB within ~2 s of clicking Convert; UI shows `Preparing → Enhancing (decoding/processing/encoding) → Uploading → Transcribing → Summarising → Completed`; tab does not freeze; watchdog does not kill it.
- 3-min M4A: legacy in-memory path still used; no regression in timing.
- Stereo WAV: header path returns channels; no decode for large files; conversion succeeds.
- Force the worker to throw: caller falls back to legacy enhancement, then to original file; job still completes.
- AssemblyAI poll lasting 25 min: `updated_at` heartbeat keeps watchdog quiet; job completes.

