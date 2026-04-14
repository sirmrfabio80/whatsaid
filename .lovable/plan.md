

# Audio Preprocessing for Difficult Mono Phone-Call Recordings

## Feasibility Analysis

### Backend (Edge Function) preprocessing — NOT recommended

Supabase Edge Functions run on Deno Deploy with a **512MB memory limit** and **no ffmpeg binary** available. The options are:

- **ffmpeg.wasm**: ~30MB WASM binary, high memory usage during processing, slow startup. A 10-minute m4a file decoded to PCM could consume 100-200MB. Combined with the WASM runtime overhead, this risks OOM crashes and adds 15-60 seconds of latency. Unreliable for production.
- **Pure JS DSP in Deno**: Would require manually decoding m4a (AAC) to PCM without ffmpeg — no mature Deno-native AAC decoder exists. Not feasible.
- **External microservice (e.g., Cloud Run with ffmpeg)**: Reliable but introduces a new infrastructure dependency, deployment pipeline, and cost. Disproportionate for an optional enhancement.

### Client-side preprocessing — RECOMMENDED

The browser's **Web Audio API** provides exactly what we need:

- `OfflineAudioContext` decodes any supported audio format to PCM
- `DynamicsCompressorNode` applies real-time dynamic range compression (reduces loud/quiet gap)
- The processed audio can be re-encoded to WAV and uploaded instead of the original
- No external dependencies, no backend changes, no memory constraints (runs on user's machine)
- Works on all modern browsers including Safari (iPhone Voice Memo users)

**Tradeoff**: The uploaded file will be WAV (larger than m4a), but since we delete audio after processing and AssemblyAI accepts WAV, this is acceptable. Typical size increase: a 10-minute mono m4a (~5MB) becomes ~100MB WAV. This increases upload time but is within Supabase Storage limits.

## Recommended Preprocessing Chain

Using Web Audio API's `DynamicsCompressorNode`:

```text
Input m4a → AudioContext.decodeAudioData() → OfflineAudioContext
  → DynamicsCompressorNode (threshold: -24dB, ratio: 12, knee: 10, attack: 0.003, release: 0.25)
  → destination
  → renderOffline()
  → encode to WAV blob
  → upload WAV instead of original
```

**What this does**: Compresses the dynamic range so the quiet remote voice is brought closer in volume to the loud local voice, without clipping or distortion. The compressor parameters are tuned for speech (fast attack to catch transients, moderate release to avoid pumping).

**What this does NOT do**: It does not denoise, filter, or alter frequency content. It only reduces the loudness gap between speakers.

## Expected Benefits and Limitations

**Benefits**:
- Quieter remote voice becomes louder relative to local voice
- AssemblyAI receives audio where both speakers are more equally represented
- Should improve: missed short segments, faint interjection recovery, speaker attribution
- Zero backend changes required

**Limitations**:
- Does not fix fundamental acoustic issues (echo, reverberation, noise)
- Cannot separate speakers — only reduces volume imbalance
- Increases upload file size (WAV vs compressed m4a)
- Processing happens on user's device (adds a few seconds before upload)
- Results are audio-dependent — some recordings may not benefit

## Risks

| Risk | Mitigation |
|------|-----------|
| Compression artifacts damage audio quality | Conservative parameters; original always available as fallback |
| Large WAV upload fails on slow connections | Show progress; could add optional client-side WAV→PCM encoding at lower sample rate |
| Browser compatibility edge cases | Web Audio API is well-supported; Safari, Chrome, Firefox all work |
| User confusion about the option | Keep it off by default, label clearly, hide in advanced settings |

## Implementation Plan

### Phase 1: Audio enhancement utility (new file)

Create `src/lib/audio-enhance.ts`:
- Function `enhanceAudioForTranscription(file: File): Promise<File>`
- Decodes audio via `AudioContext.decodeAudioData()`
- Applies `DynamicsCompressorNode` via `OfflineAudioContext`
- Encodes result to WAV `Blob`
- Returns new `File` object with `.wav` extension

### Phase 2: UI toggle in TranscriptionSettings

Update `src/components/TranscriptionSettings.tsx`:
- Add a `Switch` control: "Enhance audio (phone call recordings)"
- Help text: "Reduces volume differences between speakers. Recommended for phone calls recorded on speaker."
- Only visible when strategy is `recovery` or profile is `phone_call` (contextually relevant)
- Off by default
- Passes `enhanceAudio: boolean` up via `onSettingsChange`

### Phase 3: Wire into Convert page upload flow

Update `src/pages/Convert.tsx`:
- When `enhanceAudio` is true, after file selection and before upload:
  - Show "Enhancing audio..." progress state
  - Call `enhanceAudioForTranscription(file)`
  - Upload the returned WAV file instead of the original
  - Store `audio_enhanced: true` in `transcription_config` for logging

### Phase 4: Localization

Update `en.json`, `fr.json`, `it.json` with label and help text strings.

## Files Touched

| File | Change |
|------|--------|
| `src/lib/audio-enhance.ts` | **New** — Web Audio API preprocessing utility |
| `src/components/TranscriptionSettings.tsx` | Add enhance toggle |
| `src/pages/Convert.tsx` | Wire enhancement into upload flow |
| `src/i18n/locales/en.json` | Add strings |
| `src/i18n/locales/fr.json` | Add strings |
| `src/i18n/locales/it.json` | Add strings |

No backend changes. No database changes. No edge function changes.

## A/B Testing Strategy

Upload the same audio file twice:
1. With "Enhance audio" OFF → baseline transcript
2. With "Enhance audio" ON → enhanced transcript

Compare: utterance count, content length, speaker count, missed interjections. The `transcription_config.audio_enhanced` flag on the job row identifies which is which.

## Scope Guardrails

- No backend changes
- No provider changes
- No export changes
- Toggle is off by default
- Only affects the uploaded file, not the transcription pipeline
- Fully backward compatible

