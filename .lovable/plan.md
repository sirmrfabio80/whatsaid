# Plan: Direct in-browser audio recording

## Goal

Let users record from their microphone on the WhatSaid site and feed the result into the existing transcription flow with no changes to pricing, AssemblyAI parameters, post-processing, or job result pages.

## Where it plugs into the existing flow

The current upload entry point is:

- `src/components/AudioUploader.tsx` — drag/drop + file picker. Calls `onFileSelected(file, durationSeconds, creationDate, channelAnalysis)`.
- `src/pages/Convert.tsx` — owns `handleFileSelected` and the entire downstream pipeline (job insert → enhance → resumable upload → poll → navigate to `/job/:id`).

Key insight: **everything after `handleFileSelected` already works with any `File`**. The recorder only needs to produce a valid `File` and call the same callback. No edge function, DB schema, pricing, or results code needs to change.

```text
[ AudioUploader ] ──┐
                    ├──► handleFileSelected(file, dur, creationDate, channelAnalysis) ──► existing pipeline
[ DirectRecorder ] ─┘
```

## Files to add

1. `src/hooks/use-audio-recorder.ts` — headless recorder logic (state machine, MediaRecorder, IndexedDB chunk persistence, wake lock, visibility/track-end handling, finalisation).
2. `src/components/DirectRecorder.tsx` — UI shell (states, level meter, controls, copy, beforeunload guard).
3. `src/lib/recorder-storage.ts` — small IndexedDB wrapper for chunk persistence (one object store keyed by `sessionId + chunkIndex`).
4. `src/lib/recorder-support.ts` — pure helpers: `isRecordingSupported()`, `pickBestMimeType()`, `mimeToExtension()`.

## Files to edit (minimal)

1. `src/components/AudioUploader.tsx` — add a small "or record now" affordance that toggles to `DirectRecorder`. Alternatively, keep `AudioUploader` untouched and host the toggle in `Convert.tsx` directly. **Recommendation: host the toggle in `Convert.tsx`** so `AudioUploader` stays single-purpose and the existing test surface is unchanged.
2. `src/pages/Convert.tsx` — render a tabbed entry point: "Upload file" (existing) / "Record now" (new). Both call the same `handleFileSelected`. No other changes.
3. `src/i18n/locales/{en,fr,it}.json` — add the new copy strings (recorder states, permission denied, unsupported, wake-lock warning, discard confirmation).

No changes to: `src/lib/pricing.ts`, `storage-resumable-upload.ts`, `audio-enhance*`, `Convert.tsx` pipeline body, edge functions, DB schema, job results, exports.

## Recorder hook contract

`useAudioRecorder()` returns:

```text
status:        "idle" | "requesting" | "recording" | "paused" | "interrupted"
             | "processing" | "ready" | "error" | "unsupported"
elapsedMs:    number
levelRms:     number   // 0..1, updated ~10 Hz from AnalyserNode
errorCode?:   "permission_denied" | "no_mic" | "track_ended" | "storage" | "unknown"
mimeType?:    string
start():      Promise<void>
pause():      void
resume():     void
stop():       Promise<{ file: File; durationSeconds: number }>
cancel():     Promise<void>   // discards chunks + revokes wake lock + stops tracks
```

Internals:
- `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`.
- `MediaRecorder` with `timeslice = 5000` ms.
- On each `dataavailable`, append the `Blob` to IndexedDB (`recordings` store, key = `[sessionId, chunkIndex]`). Keep nothing large in memory.
- Track `mediaRecorder.state`, the `MediaStreamTrack.onended` event, and `document.visibilitychange` to drive the "interrupted" state.
- Wake Lock: request `navigator.wakeLock.request("screen")` only after `start()` succeeds; release on stop/cancel/error and on `wakelock.onrelease`. Best-effort re-acquire on `visibilitychange → visible` if still recording.
- `stop()`: flush final chunk, read all chunks from IndexedDB in order, build one `Blob` with the chosen MIME, wrap in `File` (name `recording-YYYYMMDD-HHmmss.<ext>`, `lastModified = Date.now()`), then delete chunks from IndexedDB.
- Cleanup is centralised in a `teardown()` helper called by stop, cancel, error, and unmount.

## MIME selection

`pickBestMimeType()` tries in order:
1. `audio/mp4;codecs=mp4a.40.2` (Safari/iOS preferred — direct .m4a-compatible)
2. `audio/webm;codecs=opus` (Chrome/Android/Firefox)
3. `audio/ogg;codecs=opus` (older Firefox)
4. fallback: `""` (let browser pick)

Extensions: `mp4 → .m4a`, `webm → .webm`, `ogg → .ogg`. AssemblyAI accepts all of these, so no transcoding is needed.

## Validator change

`isValidAudioFile()` in `src/lib/pricing.ts` currently restricts to `.m4a/.mp3/.wav`. Two safe options:

- **Preferred**: bypass `AudioUploader`'s validation entirely for recordings — the recorder calls `Convert.handleFileSelected` directly, so `isValidAudioFile` is not invoked.
- Defensive: extend `ACCEPTED_AUDIO_TYPES` with `audio/webm`, `audio/ogg` and `ACCEPTED_EXTENSIONS` with `.webm`, `.ogg`. Only do this if we want recordings to also be re-droppable into the uploader.

We will go with the preferred path (no `pricing.ts` change) since the recorder produces a `File` synthetically and feeds the same `handleFileSelected` directly.

## Duration, channels, creation date

`Convert.handleFileSelected` expects `(file, durationSeconds, creationDateOrNull, channelAnalysisOrNull)`. For a recording:
- `durationSeconds`: tracked by the hook from `start()`.
- `creationDate`: `null` — the pipeline already falls back to `file.lastModified` (`recordedAtSource = "file_last_modified"`), which is correct for a fresh recording.
- `channelAnalysis`: `null` — the pipeline already defaults to stereo with a console warning. Mic capture is mono in practice; passing `null` is safe and identical to the existing fallback. (Optional refinement later: synthesise a minimal `AudioChannelAnalysis` with `headerChannelCount = 1` so enhancement uses the mono code path.)

## UI states (mobile-first, shadcn)

```text
1. Ready          [ ● Record ]                + "Mic stays off until you tap Record."
2. Requesting     spinner                     + "Allow microphone access to start."
3. Recording      00:42  ▮▮▮▯▯ level          [ ❚❚ Pause ] [ ■ Stop ] [ ✕ Cancel ]
4. Paused/Intr.   "Recording paused — tap to continue"   [ ▶ Resume ] [ ■ Stop ] [ ✕ Cancel ]
5. Processing     spinner "Preparing your recording…"
6. Ready          file card (name, duration)  [ Transcribe → ]   [ Re-record ]
7. Error/Unsup.   friendly message + "Upload an audio file instead" link
```

Persistent banner during states 3–4: *"Keep this screen open while recording. WhatSaid will try to keep your screen awake. If your phone locks or you leave the app, recording may pause."*

Components: `Button`, `Card`, `Progress` (for level meter), `AlertDialog` (cancel confirmation), `Dialog` for the unsupported fallback. Touch targets ≥ 44px. No dense control rows.

## Safety / data loss

- `beforeunload` listener installed only while `status ∈ {recording, paused, interrupted}`.
- Cancel triggers `AlertDialog`: "Discard recording? You'll lose X:XX of audio."
- Visibility change → if `hidden` while recording, transition to `interrupted`, pause MediaRecorder, release wake lock. On `visible`, stay in `interrupted` until user taps Resume.
- Track `onended` (e.g. user revoked permission, OS muted mic) → `interrupted` with a recoverable message.
- IndexedDB write failure → stop recording, surface a clear error, keep whatever chunks already persisted so the user can still finalise.
- On unmount during recording, stop tracks + release wake lock; chunks persist in IndexedDB under the session id and are cleaned up on the next mount or on next successful finalisation.

## Edge cases

- iOS Safari requires `getUserMedia` to be invoked from a user gesture — `start()` is called from the Record button's `onClick`.
- iOS Safari sometimes only supports `audio/mp4`; `pickBestMimeType` handles that.
- iOS PWA (Home Screen) loses the mic when the app is backgrounded; we cannot prevent this — the visibility handler will move to `interrupted`.
- Android Chrome: backgrounding usually keeps the mic alive briefly; wake lock helps.
- Wake Lock API is not available on iOS Safari < 16.4 — degrade silently and rely on the warning banner.
- Very long recordings (>1 h): chunked persistence keeps memory flat. Final blob assembly happens once at `stop()`; if total size > `MAX_FILE_SIZE` (100 MB) or duration > `MAX_DURATION` (480 min), block finalisation with a clear message and offer "Save what I have so far" by trimming to the limit.
- Permission denied → `error` state with a "How to enable the mic" link; no retry loop.
- Recorder unsupported → `unsupported` state with an inline link to the file uploader.

## Manual test cases

| # | Scenario | Expected |
|---|----------|----------|
| 1 | iPhone Safari, allow mic, record 30s, stop | `.m4a` (audio/mp4) file flows through pipeline; result page opens |
| 2 | iPhone PWA, record, lock screen | Recording moves to `interrupted`; Resume works after unlock |
| 3 | Android Chrome, record 5 min, stop | webm/opus file uploads via resumable upload |
| 4 | Desktop Chrome, record, switch tabs for 30s | Stays `recording`; wake lock irrelevant on desktop |
| 5 | Deny mic permission | `error: permission_denied` with help text, no infinite spinner |
| 6 | Phone tries to lock during recording | Wake lock keeps it awake (Android); on iOS warning banner is shown |
| 7 | Background tab while recording | Transitions to `interrupted`, prompts Resume |
| 8 | Long recording (~2 h) | Memory flat; chunks in IndexedDB; finalises into one File |
| 9 | Mid-recording reload | Chunks survive in IndexedDB under `sessionId`; on next mount, offer "Recover unsaved recording?" |
| 10 | Cancel during recording | Confirm dialog → tracks stopped, wake lock released, IndexedDB cleared |
| 11 | Firefox desktop (no MediaRecorder for mp4) | Falls back to webm/opus |
| 12 | Browser without MediaRecorder | `unsupported` state with link to file uploader |

## Out of scope

- No background recording claim.
- No transcoding to mp3/wav in-browser.
- No changes to AssemblyAI request, post-processing, summary, exports, or job pages.
- No changes to credits/pricing/Paddle.
