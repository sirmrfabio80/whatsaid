

# Implement Speech-Oriented Audio Enhancement Chain

## File to change

`src/lib/audio-enhance.ts` — single file, no other changes.

## Implementation

Replace the current processing logic with this chain:

### 1. Add `computeRMS` helper

```typescript
function computeRMS(buffer: AudioBuffer): number {
  let sumSq = 0;
  let count = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      sumSq += data[i] * data[i];
      count++;
    }
  }
  return Math.sqrt(sumSq / count);
}
```

### 2. Noise gate — skip enhancement for near-silent audio

Before building the offline graph, check RMS. If below -50 dBFS (~0.00316), skip enhancement entirely — just WAV-encode the original decoded buffer and return.

### 3. Revised compressor settings

| Param | Value | Why |
|-------|-------|-----|
| threshold | -30 dB | Catch more dynamic range |
| ratio | 4:1 | Gentle, avoids pumping |
| knee | 12 dB | Transparent transition |
| attack | 5 ms | Preserves consonants |
| release | 150 ms | Tracks syllables naturally |

### 4. Conservative make-up gain

`GainNode` at +6 dB (factor 2.0) in the offline graph after compressor. This is fixed and conservative — the final normalisation stage handles any remaining shortfall, but with a cap.

### 5. Post-render soft-clip limiter

In-place on rendered buffer. Any sample exceeding ±0.95 is soft-clipped via `tanh`:

```typescript
if (Math.abs(data[i]) > 0.95) {
  data[i] = 0.95 * Math.tanh(data[i] / 0.95);
}
```

### 6. Capped peak normalisation (safeguard only)

Target: -1 dBFS (0.891). **Hard cap: maximum +9 dB gain** (factor ~2.82).

```typescript
const TARGET_PEAK = 0.891;
const MAX_NORM_GAIN = 2.818; // ~+9 dB cap
let maxSample = 0;
// ... find peak across all channels ...
if (maxSample > 0 && maxSample < TARGET_PEAK) {
  const gain = Math.min(TARGET_PEAK / maxSample, MAX_NORM_GAIN);
  // ... apply gain in-place ...
}
```

If the file needs more than +9 dB of normalisation after compression + make-up gain, it stays quieter rather than amplifying noise.

### Signal flow

```text
decode → noise gate check
           ↓ (pass)
source → compressor (4:1, -30dB) → gain (+6dB) → destination
           ↓ (render)
soft-clip limiter (tanh at ±0.95)
           ↓
peak normalize (target 0.891, capped at +9dB)
           ↓
encodeWav → File
```

## What stays unchanged

- `encodeWav` function — untouched
- Function signature of `enhanceAudioForTranscription` — identical
- File output format — WAV, same as before
- No UI, API, or edge function changes

## Regression risk

**Low.** Same function signature, same output format. Only internal processing logic changes. The noise gate adds safety for edge-case silent files. The gain cap prevents runaway amplification.

