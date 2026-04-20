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

import { sanitizeStorageFilename } from "./sanitize-filename";

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
  target_rms_dbfs: 0,
  max_gain_db_mono: 22,
  max_gain_db_stereo: 20,
  noise_floor_dbfs: -50,
  soft_clip_threshold: 0.78,
};

/** MP3 bitrate (kbps) used when re-encoding the enhanced audio. Above the 256 kbps minimum requested. */
export const MP3_BITRATE_KBPS = 320;

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

/** Convert a Float32 sample (-1..1) to Int16 PCM. */
function floatToInt16(sample: number): number {
  const s = Math.max(-1, Math.min(1, sample));
  return s < 0 ? s * 0x8000 : s * 0x7fff;
}

/**
 * Encode an AudioBuffer to an MP3 Blob using lamejs.
 * Bitrate is fixed at MP3_BITRATE_KBPS (320 kbps) — well above the 256 kbps floor
 * we want to keep, and effectively transparent for speech.
 */
async function encodeMp3(buffer: AudioBuffer): Promise<Blob> {
  // Dynamic import keeps lamejs out of the initial bundle.
  const lamejs = await import("@breezystack/lamejs");
  const Mp3Encoder = lamejs.Mp3Encoder;

  const numChannels = buffer.numberOfChannels === 1 ? 1 : 2;
  const sampleRate = buffer.sampleRate;
  const encoder = new Mp3Encoder(numChannels, sampleRate, MP3_BITRATE_KBPS);

  const left = new Int16Array(buffer.length);
  const right = numChannels === 2 ? new Int16Array(buffer.length) : null;

  const lCh = buffer.getChannelData(0);
  const rCh = numChannels === 2 ? buffer.getChannelData(1) : null;
  for (let i = 0; i < buffer.length; i++) {
    left[i] = floatToInt16(lCh[i]);
    if (right && rCh) right[i] = floatToInt16(rCh[i]);
  }

  const BLOCK = 1152; // MP3 frame size
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < buffer.length; i += BLOCK) {
    const lChunk = left.subarray(i, i + BLOCK);
    const rChunk = right ? right.subarray(i, i + BLOCK) : null;
    const mp3buf = rChunk
      ? encoder.encodeBuffer(lChunk, rChunk)
      : encoder.encodeBuffer(lChunk);
    if (mp3buf.length > 0) chunks.push(mp3buf);
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(tail);

  // Cast to BlobPart[] — lamejs returns Uint8Array<ArrayBufferLike> which TS narrows oddly.
  return new Blob(chunks as unknown as BlobPart[], { type: "audio/mpeg" });
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

  // Sanitize so the produced File's name is always safe for Supabase Storage keys
  // (curly quotes, accents, emoji, etc. otherwise trigger "Invalid key" errors).
  const safeBase = sanitizeStorageFilename(file.name.replace(/\.[^.]+$/, "")).replace(/\.mp3$/i, "");
  const enhancedFileName = `${safeBase}_normalised.mp3`;
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
    const mp3Blob = await encodeMp3(audioBuffer);
    return {
      file: new File([mp3Blob], enhancedFileName, { type: "audio/mpeg" }),
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
  const mp3Blob = await encodeMp3(audioBuffer);

  const sampleModified = softClipped || normalisationApplied;

  return {
    file: new File([mp3Blob], enhancedFileName, { type: "audio/mpeg" }),
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
