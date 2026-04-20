# Plan: Streaming chunked audio decode (remove duration cap)

## Goal

Replace the single `decodeAudioData` call — which materialises the entire Float32 PCM in memory (~21 MB/min stereo) — with a streaming `WebCodecs.AudioDecoder` pipeline fed by per-container demuxers. Worker memory becomes constant regardless of file length, so the client-side enhancement duration cap (currently 25 min stereo / 50 min mono) can be removed for capable browsers.

## Architecture

```
File ──► Container demuxer ──► EncodedAudioChunk* ──► AudioDecoder ──► AudioData (PCM slice)
                                                                          │
                                                            ┌─────────────┴─────────────┐
                                                            ▼                           ▼
                                                       PASS 1: measure            PASS 2: gain → soft-clip → MP3 encode
                                                       (sumSq, max|x|)            (streamed chunks back to main thread)
```

**Two passes** over the source file:
- **Pass 1** computes input RMS + peak across every decoded sample. Each `AudioData` frame is read into a small scratch buffer, statistics updated, frame closed. No PCM retained.
- **Pass 2** re-runs demuxer + decoder, applies the computed gain in place per slice, runs the soft-clip limiter, feeds Int16 frames into `lamejs.Mp3Encoder`, posts ~64 KB MP3 chunks back to the main thread (existing streaming protocol from prior step).

## Browser support

WebCodecs `AudioDecoder` availability:
- Chrome / Edge ≥ 94
- Safari ≥ 16.4 (incl. iOS 16.4 webviews)
- Firefox ≥ 130 (Sept 2024)

Routing:
1. Feature-detect `typeof AudioDecoder !== "undefined"` AND `await AudioDecoder.isConfigSupported({ codec })` for the file's codec.
2. Supported → streaming path, **no duration cap**.
3. Unsupported OR demux fails → fall back to today's `decodeAudioData` path **with the existing duration cap**, plus a new `webcodecs_unsupported` skip-reason in the tooltip.

## Stages

### Stage 1 — Foundation + M4A
- Add `mp4box` dependency.
- `src/lib/audio-demux/types.ts` — shared interfaces.
- `src/lib/audio-demux/mp4-demuxer.ts` — wraps mp4box.js; extracts codec, sampleRate, numberOfChannels, decoder description (esds/AAC config); yields `EncodedAudioChunk`s.
- `src/lib/audio-demux/index.ts` — `createDemuxer(file)` dispatcher.
- `src/lib/audio-enhance.worker.ts` — add `streamingEnhance(file, opts)` that runs Pass 1 → Pass 2 → posts the same `chunk` + `done` messages as today.
- `src/lib/audio-enhance.ts` — feature-detect; route eligible files via streaming worker call instead of pre-decoded `Float32Array[]`.
- `Convert.tsx` — when streaming-eligible, skip the `withinDurationCap` check; otherwise keep current cap and surface the new skip reason.

### Stage 2 — MP3 + WAV demuxers
- `src/lib/audio-demux/mp3-demuxer.ts` — MPEG frame-sync scanner; one `EncodedAudioChunk` per frame; codec `"mp3"`.
- `src/lib/audio-demux/wav-demuxer.ts` — RIFF parser; for uncompressed PCM/IEEE-float, slice the `data` chunk into pass-through `EncodedAudioChunk`s with codec derived from `fmt` (`pcm-s16`, `pcm-f32`, etc.).
- Update dispatcher to route by extension/MIME.

### Stage 3 — Polish
- Real per-pass progress events from worker → real % on the "Enhancing audio" step.
- Telemetry: log `webcodecs_streaming_used`, `pass1_ms`, `pass2_ms` into `transcription_config.audio_enhancement`.
- Update `docs/ARCHITECTURE.md`.

## Behaviour preserved

- `enhanceAudioForTranscription` API unchanged.
- Worker's `chunk` + `done` message protocol unchanged.
- `AudioEnhanceMetadata.measured` shape unchanged.
- Soft-clip + normalisation logic identical to today, just applied in slices.
- `runEnhanceOnMainThread` legacy path remains as the ultimate fallback.

## Risks & mitigations

- **HE-AAC / SBR**: AAC+/v2 files report one sample rate in the codec config but the decoder doubles it. Honour `decoder.output`'s reported `sampleRate`, not the config's.
- **Decoder backpressure**: pause demuxer when `decoder.decodeQueueSize > 8` to keep memory bounded.
- **Pass 1 / Pass 2 drift**: re-create demuxer + decoder fresh for pass 2; deterministic for a given file + codec config.
- **Late codec rejection** (Safari rejecting a specific AAC profile after `isConfigSupported` passed): worker rejects with `unsupported_codec`, main thread retries via the legacy `decodeAudioData` path.
- **mp4box bundle size** ~150 KB; loaded lazily inside the worker so it doesn't impact initial page weight.

## Open questions before Stage 1

1. **Bundle size**: mp4box.js is ~150 KB minified. Loaded only inside the worker, only when enhancement runs, only on browsers with WebCodecs. Acceptable?
2. **Skip-reason copy** for `webcodecs_unsupported`. Suggest:
   *"Streaming decode isn't supported in this browser, so we used a faster path with a length limit. Try Chrome, Edge, or Safari 16.4+ for unlimited length."*
3. **Telemetry**: OK to expand `transcription_config.audio_enhancement` with `webcodecs_streaming_used`, `pass1_ms`, `pass2_ms` (Stage 3), or prefer a separate event log?
