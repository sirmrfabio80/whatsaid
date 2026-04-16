

User wants:
1. Do NOT show the strategy/advanced-options picker in the UI.
2. Permanently enable the "recover every fragment" (recovery) strategy on the backend for every job.
3. Bring back client-side audio optimisation: normalise + boost volume, but do NOT re-apply dynamic-range compression.

Let me confirm the backend wiring. From earlier exploration: `supabase/functions/transcribe/index.ts` reads `transcription_config.strategy === "recovery"` and applies the recovery prompt + `disfluencies: true`. So permanent backend enablement = either (a) default `strategy = "recovery"` when none is set in transcribe/index.ts, or (b) always set `transcription_config.strategy = "recovery"` in process-job before calling transcribe. Option (a) is cleaner — single source of truth in the transcribe function, no extra writes.

For audio enhancement: `src/lib/audio-enhance.ts` currently has compressor + makeup gain + soft-clip + capped peak normalise. User wants: keep normalise + volume boost, REMOVE compression. So strip stages 1 (DynamicsCompressor) and 2 (makeup gain that compensates for compression). Keep peak normalisation. Volume boost = the capped peak normalise to -1 dBFS, optionally lift the gain cap so quiet recordings get more headroom recovery.

Re-enable invocation: Convert.tsx must call `enhanceAudioForTranscription` on the file before upload, unconditionally (since UI toggle is hidden). Show a small progress indicator during enhancement.

UI: do NOT mount TranscriptionSettings. Leave Convert.tsx without the advanced options panel.

Files to change:
1. `supabase/functions/transcribe/index.ts` — make `recovery` the default when no strategy is set (so recovery prompt + disfluencies always apply).
2. `src/lib/audio-enhance.ts` — remove compressor + makeup-gain stages; keep soft-clip safety + peak normalise; keep WAV encoder.
3. `src/pages/Convert.tsx` — call `enhanceAudioForTranscription` on the selected file before upload, with a small "Optimising audio…" status; do NOT mount the settings picker.

Out of scope: TranscriptionSettings.tsx stays in the codebase (still used by nothing on Convert) — harmless. No DB migration. No new defaults beyond what's described.

Keep concise.

---

# Plan — hide picker, force recovery on backend, bring back normalise-only audio boost

## What changes

### 1. Backend: permanently enable "recover every fragment"
- File: `supabase/functions/transcribe/index.ts`
- Change: when a job has no explicit `transcription_config.strategy`, treat it as `"recovery"`. The existing recovery branch already injects the recovery prompt and sets `disfluencies: true` — we just make it the default instead of `"balanced"`.
- Result: every transcription run, including this Fatebenefratelli rerun, gets the recovery behaviour automatically. No UI surface needed.

### 2. UI: keep the advanced options picker hidden
- File: `src/pages/Convert.tsx`
- Do NOT mount `<TranscriptionSettings>`. Leave `transcriptionConfig` empty so the backend default (recovery) takes over. The component file stays in the repo unused — no deletion needed.

### 3. Client audio optimisation: normalise + boost, no compression
- File: `src/lib/audio-enhance.ts`
- Remove: `DynamicsCompressor` stage and the `+6 dB` make-up gain that exists only to compensate for compression.
- Keep: WAV decode, peak-normalisation to -1 dBFS with a sensible max-gain cap (so very quiet recordings get a meaningful volume lift without runaway noise amplification), soft-clip safety, WAV encode.
- Net effect: louder, cleanly normalised audio, but the original dynamics of speech are preserved — no pumping, no over-processed sound.

### 4. Wire the optimiser back into the upload flow
- File: `src/pages/Convert.tsx`
- Before uploading the file to storage, run it through `enhanceAudioForTranscription`. Show a brief "Optimising audio…" status under the existing upload progress so the user sees what's happening. Always on, no toggle.

## Out of scope
- No DB migrations.
- No changes to `process-job`, no changes to credit logic.
- No new i18n keys beyond reusing the existing "Optimising audio…" / equivalent string already in locales (or one tiny new key if missing).
- The hidden `TranscriptionSettings` component file is left untouched.

## After implementation — how to verify
Re-upload `Fatebenefratelli-7.m4a` via the Convert page. Confirm:
1. No advanced-options panel is visible.
2. A short "Optimising audio…" step runs before upload.
3. The resulting job's transcribe log shows `strategy=recovery`, `disfluencies=true`, recovery prompt present.
4. Compare the transcript and PEOPLE-SPEAKING separation against the previous balanced run.

