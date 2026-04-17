/**
 * Client-side audio preprocessing using Web Audio API.
 *
 * Two-stage chain:
 *   1. Noise gate — skip near-silent recordings
 *   2. Normalisation (peak OR rms target) with capped gain
 *   3. Soft-clip limiter (tanh at ±threshold) — runs AFTER gain so it
 *      actually catches boosted peaks. This is the safety net that lets
 *      RMS-mode push files past the digital ceiling without harsh clipping.
 */

export type NormaliseMode = "peak" | "rms";

export interface AudioEnhanceOptions {
  /** Run the normalisation stage. When false, only the soft-clip safety limiter runs. */
  normalise: boolean;
  /** "peak" = lift loudest sample to target_peak_dbfs (legacy). "rms" = lift average loudness to target_rms_dbfs (recommended for already-hot files). */
  normalise_mode: NormaliseMode;
  /** Target peak level in dBFS (used when normalise_mode = "peak"; also the soft-clip ceiling reference). */
  target_peak_dbfs: number;
  /** Target RMS level in dBFS (used when normalise_mode = "rms"). e.g. -3 for very loud broadcast-style speech. */
  target_rms_dbfs: number;
  /** Max gain (dB) for mono uploads. */
  max_gain_db_mono: number;
  /** Max gain (dB) for stereo uploads. */
  max_gain_db_stereo: number;
  /** Below this RMS (dBFS), the enhancer skips (noise gate). */
  noise_floor_dbfs: number;
  /** Soft-clip threshold (linear, 0.5–1.0). Lower = more aggressive limiting. */
  soft_clip_threshold: number;
}

export const DEFAULT_AUDIO_ENHANCE_OPTIONS: AudioEnhanceOptions = {
  normalise: true,
  normalise_mode: "rms",
  target_peak_dbfs: -1,
  target_rms_dbfs: -1,
  max_gain_db_mono: 20,
  max_gain_db_stereo: 18,
  noise_floor_dbfs: -50,
  soft_clip_threshold: 0.8,
};

export interface AudioEnhanceMeasured {
  input_rms_dbfs: number;
  input_peak_dbfs: number;
  applied_gain_db: number;
  /** Post-gain, pre-clip RMS. */
  output_rms_dbfs: number;
  /** Post-clip peak. */
  output_peak_dbfs: number;
  /** % of samples touched by the soft-clip limiter (0–100). */
  soft_clip_samples_pct: number;
  /** Which normalisation mode was used. */
  normalise_mode: NormaliseMode;
}

export interface AudioEnhanceMetadata {
  /** True when enhancer modified samples (normalisation gain >0 or soft-clip kicked in). */
  applied: boolean;
  /** Why we landed at the final state. */
  reason: "applied" | "noise_gated" | "below_normalise_threshold" | "failed";
  input_channels: 1 | 2;
  duration_ms: number;
  measured: AudioEnhanceMeasured | null;
}

export interface AudioEnhanceResult {
  file: File;
  metadata: AudioEnhanceMetadata;
}

/** Compute RMS level of an AudioBuffer across all channels. */
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

/** Compute peak (max abs sample) across all channels. */
function computePeak(buffer: AudioBuffer): number {
  let maxSample = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxSample) maxSample = abs;
    }
  }
  return maxSample;
}

function linearToDbfs(linear: number): number {
  if (linear <= 0) return -Infinity;
  return 20 * Math.log10(linear);
}

function dbfsToLinear(dbfs: number): number {
  return Math.pow(10, dbfs / 20);
}

/** Encode an AudioBuffer to a WAV Blob (PCM 16-bit). */
function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitsPerSample = 16;

  const length = buffer.length * numChannels;
  const samples = new Int16Array(length);

  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < buffer.length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      samples[i * numChannels + ch] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
  }

  const dataSize = samples.length * (bitsPerSample / 8);
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const output = new Int16Array(arrayBuffer, headerSize);
  output.set(samples);

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

/**
 * Normalise + soft-clip an audio file for transcription.
 * Returns a new WAV File and structured metadata.
 */
export async function enhanceAudioForTranscription(
  file: File,
  onProgress?: (stage: "decoding" | "processing" | "encoding") => void,
  options?: Partial<AudioEnhanceOptions>,
): Promise<AudioEnhanceResult> {
  const opts: AudioEnhanceOptions = { ...DEFAULT_AUDIO_ENHANCE_OPTIONS, ...(options ?? {}) };
  const t0 = performance.now();

  onProgress?.("decoding");

  const arrayBuffer = await file.arrayBuffer();

  const tempCtx = new AudioContext();
  const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
  await tempCtx.close();

  const baseName = file.name.replace(/\.[^.]+$/, "");
  const enhancedFileName = `${baseName}_normalised.wav`;
  const inputChannels: 1 | 2 = audioBuffer.numberOfChannels === 1 ? 1 : 2;

  // --- Measure input ---
  const NOISE_FLOOR = dbfsToLinear(opts.noise_floor_dbfs);
  const inputRms = computeRMS(audioBuffer);
  const inputPeak = computePeak(audioBuffer);
  const inputRmsDbfs = linearToDbfs(inputRms);
  const inputPeakDbfs = linearToDbfs(inputPeak);

  // --- Noise gate ---
  if (inputRms < NOISE_FLOOR) {
    onProgress?.("encoding");
    const wavBlob = encodeWav(audioBuffer);
    return {
      file: new File([wavBlob], enhancedFileName, { type: "audio/wav" }),
      metadata: {
        applied: false,
        reason: "noise_gated",
        input_channels: inputChannels,
        duration_ms: Math.round(performance.now() - t0),
        measured: {
          input_rms_dbfs: inputRmsDbfs,
          input_peak_dbfs: inputPeakDbfs,
          applied_gain_db: 0,
          output_rms_dbfs: inputRmsDbfs,
          output_peak_dbfs: inputPeakDbfs,
          soft_clip_samples_pct: 0,
          normalise_mode: opts.normalise_mode,
        },
      },
    };
  }

  onProgress?.("processing");

  // --- Stage 1: Normalisation gain (peak OR rms target) ---
  const maxGainDb = inputChannels === 1 ? opts.max_gain_db_mono : opts.max_gain_db_stereo;
  const MAX_NORM_GAIN = dbfsToLinear(maxGainDb);

  let gain = 1.0;
  let normalisationApplied = false;

  if (opts.normalise) {
    let desiredGain = 1.0;
    if (opts.normalise_mode === "rms" && inputRms > 0) {
      const targetRmsLinear = dbfsToLinear(opts.target_rms_dbfs);
      desiredGain = targetRmsLinear / inputRms;
    } else if (opts.normalise_mode === "peak" && inputPeak > 0) {
      const targetPeakLinear = dbfsToLinear(opts.target_peak_dbfs);
      desiredGain = targetPeakLinear / inputPeak;
    }
    gain = Math.max(1.0, Math.min(desiredGain, MAX_NORM_GAIN));
    normalisationApplied = gain > 1.0;

    if (normalisationApplied) {
      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const data = audioBuffer.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
          data[i] *= gain;
        }
      }
    }
  }
  const appliedGainDb = linearToDbfs(gain);

  // Measure RMS after gain (pre-clip).
  const postGainRms = computeRMS(audioBuffer);
  const outputRmsDbfs = linearToDbfs(postGainRms);

  // --- Stage 2: Soft-clip limiter (safety, runs AFTER gain) ---
  const CLIP_THRESHOLD = Math.max(0.5, Math.min(1.0, opts.soft_clip_threshold));
  let softClipSampleCount = 0;
  let totalSampleCount = 0;
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    totalSampleCount += data.length;
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > CLIP_THRESHOLD) {
        data[i] = CLIP_THRESHOLD * Math.tanh(data[i] / CLIP_THRESHOLD);
        softClipSampleCount++;
      }
    }
  }
  const softClipSamplesPct = totalSampleCount > 0
    ? (softClipSampleCount / totalSampleCount) * 100
    : 0;
  const softClipped = softClipSampleCount > 0;

  // Final peak after clipping.
  const outputPeak = computePeak(audioBuffer);
  const outputPeakDbfs = linearToDbfs(outputPeak);

  onProgress?.("encoding");
  const wavBlob = encodeWav(audioBuffer);

  const sampleModified = softClipped || normalisationApplied;

  return {
    file: new File([wavBlob], enhancedFileName, { type: "audio/wav" }),
    metadata: {
      applied: sampleModified,
      reason: sampleModified ? "applied" : "below_normalise_threshold",
      input_channels: inputChannels,
      duration_ms: Math.round(performance.now() - t0),
      measured: {
        input_rms_dbfs: inputRmsDbfs,
        input_peak_dbfs: inputPeakDbfs,
        applied_gain_db: appliedGainDb,
        output_rms_dbfs: outputRmsDbfs,
        output_peak_dbfs: outputPeakDbfs,
        soft_clip_samples_pct: softClipSamplesPct,
        normalise_mode: opts.normalise_mode,
      },
    },
  };
}
