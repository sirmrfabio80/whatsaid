

# Dynamic Transcription Routing — Revised Implementation Plan

## Overview

Detect audio channel count from file headers (no full decoding), store it on the job row, and route AssemblyAI transcription between multichannel and mono+diarization modes.

## Channel Count Detection Strategy

Header-based parsing only — no `decodeAudioData()`, no full file read for large files.

| Format | Method | Bytes needed |
|--------|--------|-------------|
| WAV | Read first 44 bytes. Channel count is a uint16 at byte offset 22 (little-endian). | 44 bytes |
| M4A/MP4 | Reuse existing `findBox()` from `audio-creation-date.ts`. Navigate `moov > trak > mdia > minf > stbl > stsd`, read channel count (uint16) from the audio sample entry. The full file buffer is already loaded for creation-date extraction. | Already loaded |
| MP3 | Read first 10+ bytes. Parse MPEG frame header — bits 6-7 of byte 3 encode channel mode (stereo vs mono). Skip ID3v2 tag if present. | ~4KB max |

**Fallback**: If header parsing fails for any format, default to `null` (treated as mono — current safe behaviour).

## Routing Matrix

```text
audio_channels >= 2  →  multichannel: true, omit speaker_labels
audio_channels == 1  →  speaker_labels: true (current behaviour)
audio_channels null  →  speaker_labels: true (safe default)
```

**Comments in code will document:**
- Mono same-mic multi-speaker audio remains best-effort for diarization
- Multichannel routing helps only when channels contain actually separated audio
- Stereo files with identical/mixed channels may produce duplicate output under multichannel mode

## AssemblyAI Parameter (verified from live docs)

Top-level boolean: `multichannel: true`

When enabled, the response includes `audio_channels` (number) and each utterance includes a `channel` property. `speaker_labels` should be omitted (multichannel replaces diarization).

## Files Touched

### 1. New file: `src/lib/audio-channels.ts`
- `detectChannelCount(file: File): Promise<number | null>`
- WAV header parser (44 bytes slice)
- M4A/MP4 parser using existing `findBox` pattern (shared or duplicated — small function)
- MP3 frame header parser (first 4KB slice)
- Returns `null` on failure

### 2. `src/components/AudioUploader.tsx`
- After duration detection, call `detectChannelCount(file)`
- Pass channel count through `onFileSelected` callback (new parameter)
- Interface change: `onFileSelected: (file, duration, creationDate, channels) => void`

### 3. `src/pages/Convert.tsx`
- Accept `channels` from uploader
- Store in component state
- Include `audio_channels` in the job insert payload

### 4. Database migration
- `ALTER TABLE public.jobs ADD COLUMN audio_channels integer DEFAULT NULL;`

### 5. `supabase/functions/transcribe/index.ts`
- Read `job.audio_channels` from the job row
- If `>= 2`: set `multichannel: true`, omit `speaker_labels`
- If `1` or `null`: set `speaker_labels: true` (current behaviour)
- For multichannel responses, build transcript text from per-channel utterances instead of speaker-label utterances

### 6. No UI changes
- No user-facing channel selector in v1
- No visual indication of detected channels (can add later if needed)

## Implementation Order

1. **Migration** — add `audio_channels` column. Zero risk, additive only.
2. **`audio-channels.ts`** — new utility, no existing code affected.
3. **`AudioUploader.tsx` + `Convert.tsx`** — pass and store channel count. Existing jobs with `null` continue to work.
4. **`transcribe/index.ts`** — routing logic. Only activates for jobs with `audio_channels >= 2`.

Each step is independently deployable. Steps 1-3 change nothing about transcription behaviour.

## Regression Risk

**Very low.** The only behaviour change is in step 4, and it only triggers for files detected as multichannel. All mono and unknown files follow the exact current path. Existing jobs in the database have `audio_channels = null` and are unaffected.

**Risk area**: Stereo files with identical channels (e.g. a phone call recorded to both L+R) would get multichannel mode, potentially producing duplicate text. This is an inherent limitation documented in code comments. A future user-facing override ("Separate channels: No") can address this if it becomes a real problem.

## Rollback Plan

- Remove routing logic from `transcribe/index.ts` (revert to always `speaker_labels: true`)
- Column `audio_channels` can remain — it's nullable and harmless
- Client-side detection code is inert without the backend routing

