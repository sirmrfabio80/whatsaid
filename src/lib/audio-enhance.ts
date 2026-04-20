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
 * Encode an AudioBuffer to an MP3 Blob using lamejs (main-thread fallback).
 *
 * Streams the encoder over small windows so we never allocate a full-length
 * Int16Array. Memory profile matches the worker implementation:
 * O(ENCODE_CHUNK) scratch + accumulated MP3 output (~2.4 MB/min stereo).
 */
async function encodeMp3(buffer: AudioBuffer): Promise<Blob> {
  // Dynamic import keeps lamejs out of the initial bundle.
  const lamejs = await import("@breezystack/lamejs");
  const Mp3Encoder = lamejs.Mp3Encoder;

  const numChannels = buffer.numberOfChannels === 1 ? 1 : 2;
  const sampleRate = buffer.sampleRate;
  const encoder = new Mp3Encoder(numChannels, sampleRate, MP3_BITRATE_KBPS);

  const length = buffer.length;
  const lCh = buffer.getChannelData(0);
  const rCh = numChannels === 2 ? buffer.getChannelData(1) : null;

  const FRAME = 1152;
  const FRAMES_PER_CHUNK = 4;
  const ENCODE_CHUNK = FRAME * FRAMES_PER_CHUNK; // 4608 samples

  const leftScratch = new Int16Array(ENCODE_CHUNK);
  const rightScratch = rCh ? new Int16Array(ENCODE_CHUNK) : null;

  const chunks: Uint8Array[] = [];

  for (let off = 0; off < length; off += ENCODE_CHUNK) {
    const end = Math.min(off + ENCODE_CHUNK, length);
    const n = end - off;

    for (let i = 0; i < n; i++) {
      leftScratch[i] = floatToInt16(lCh[off + i]);
    }
    const lView = leftScratch.subarray(0, n);
    let rView: Int16Array | null = null;
    if (rightScratch && rCh) {
      for (let i = 0; i < n; i++) {
        rightScratch[i] = floatToInt16(rCh[off + i]);
      }
      rView = rightScratch.subarray(0, n);
    }

    const mp3buf = rView
      ? encoder.encodeBuffer(lView, rView)
      : encoder.encodeBuffer(lView);
    // lamejs reuses an internal output buffer between calls — copy out
    // before the next call invalidates the view.
    if (mp3buf.length > 0) chunks.push(new Uint8Array(mp3buf));
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(new Uint8Array(tail));

  return new Blob(chunks as unknown as BlobPart[], { type: "audio/mpeg" });
}

/**
 * Run the heavy enhancement pipeline (measure → gain → soft-clip → mp3)
 * inside a Web Worker so the main thread stays responsive on long files.
 *
 * Returns null if the worker could not be constructed (e.g. very old browser),
 * letting the caller fall back to the synchronous main-thread path.
 */
function runEnhanceInWorker(
  channels: Float32Array[],
  sampleRate: number,
  options: AudioEnhanceOptions,
): Promise<{
  mp3Blob: Blob;
  measured: AudioEnhanceMeasured;
  normalisationApplied: boolean;
  softClipped: boolean;
  reason: "applied" | "noise_gated" | "below_normalise_threshold";
}> | null {
  let worker: Worker;
  try {
    worker = new Worker(new URL("./audio-enhance.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch (err) {
    console.warn("Audio enhance worker unavailable, falling back to main thread:", err);
    return null;
  }

  return new Promise((resolve, reject) => {
    // Collect MP3 chunks as the worker streams them. Each chunk's underlying
    // ArrayBuffer was transferred (zero-copy) from the worker, so this list
    // is the only live reference to the encoded bytes — worker heap stays flat.
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    let settled = false;

    const cleanup = () => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg) return;
      if (msg.type === "chunk") {
        chunks.push(msg.bytes as Uint8Array);
        receivedBytes += (msg.bytes as Uint8Array).byteLength;
        return;
      }
      if (msg.type === "done") {
        if (settled) return;
        settled = true;
        cleanup();
        if (msg.totalBytes != null && receivedBytes !== msg.totalBytes) {
          console.warn(
            `[audio-enhance] streamed byte count mismatch: received ${receivedBytes}, expected ${msg.totalBytes}`,
          );
        }
        // Assemble streamed chunks into the final Blob. We do this on the main
        // thread (vs. inside the worker) so the worker never holds the full
        // encoded MP3 in memory.
        const mp3Blob = new Blob(chunks as unknown as BlobPart[], { type: "audio/mpeg" });
        resolve({
          mp3Blob,
          measured: msg.measured,
          normalisationApplied: msg.normalisationApplied,
          softClipped: msg.softClipped,
          reason: msg.reason,
        });
        return;
      }
      if (msg.type === "error") {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(msg.message || "enhance worker failed"));
      }
    };
    worker.onerror = (event) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(event.message || "enhance worker errored"));
    };

    // Transfer the channel buffers (zero-copy) into the worker.
    const transferables = channels.map((c) => c.buffer);
    worker.postMessage(
      { type: "enhance", channels, sampleRate, options },
      transferables,
    );
  });
}

/**
 * Main-thread fallback for the heavy pipeline. Used when the worker can't be
 * constructed. Mirrors the worker logic exactly.
 */
function runEnhanceOnMainThread(
  audioBuffer: AudioBuffer,
  options: AudioEnhanceOptions,
): Promise<{
  mp3Blob: Blob;
  measured: AudioEnhanceMeasured;
  normalisationApplied: boolean;
  softClipped: boolean;
  reason: "applied" | "noise_gated" | "below_normalise_threshold";
}> {
  return (async () => {
    const opts = options;
    const NOISE_FLOOR = dbfsToLinear(opts.noise_floor_dbfs);
    const inputRms = computeRMS(audioBuffer);
    const inputPeak = computePeak(audioBuffer);
    const inputRmsDbfs = linearToDbfs(inputRms);
    const inputPeakDbfs = linearToDbfs(inputPeak);
    const inputChannels: 1 | 2 = audioBuffer.numberOfChannels === 1 ? 1 : 2;

    if (inputRms < NOISE_FLOOR) {
      const mp3Blob = await encodeMp3(audioBuffer);
      return {
        mp3Blob,
        measured: {
          input_rms_dbfs: inputRmsDbfs,
          input_peak_dbfs: inputPeakDbfs,
          applied_gain_db: 0,
          output_rms_dbfs: inputRmsDbfs,
          output_peak_dbfs: inputPeakDbfs,
          soft_clip_samples_pct: 0,
          normalise_mode: opts.normalise_mode,
        },
        normalisationApplied: false,
        softClipped: false,
        reason: "noise_gated" as const,
      };
    }

    const maxGainDb = inputChannels === 1 ? opts.max_gain_db_mono : opts.max_gain_db_stereo;
    const MAX_NORM_GAIN = dbfsToLinear(maxGainDb);
    let gain = 1.0;
    let normalisationApplied = false;
    if (opts.normalise) {
      let desiredGain = 1.0;
      if (opts.normalise_mode === "rms" && inputRms > 0) {
        desiredGain = dbfsToLinear(opts.target_rms_dbfs) / inputRms;
      } else if (opts.normalise_mode === "peak" && inputPeak > 0) {
        desiredGain = dbfsToLinear(opts.target_peak_dbfs) / inputPeak;
      }
      gain = Math.max(1.0, Math.min(desiredGain, MAX_NORM_GAIN));
      normalisationApplied = gain > 1.0;
      if (normalisationApplied) {
        for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
          const data = audioBuffer.getChannelData(ch);
          for (let i = 0; i < data.length; i++) data[i] *= gain;
        }
      }
    }
    const appliedGainDb = linearToDbfs(gain);
    const postGainRms = computeRMS(audioBuffer);
    const outputRmsDbfs = linearToDbfs(postGainRms);

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
    const outputPeak = computePeak(audioBuffer);
    const outputPeakDbfs = linearToDbfs(outputPeak);

    const mp3Blob = await encodeMp3(audioBuffer);
    const sampleModified = softClipped || normalisationApplied;

    return {
      mp3Blob,
      measured: {
        input_rms_dbfs: inputRmsDbfs,
        input_peak_dbfs: inputPeakDbfs,
        applied_gain_db: appliedGainDb,
        output_rms_dbfs: outputRmsDbfs,
        output_peak_dbfs: outputPeakDbfs,
        soft_clip_samples_pct: softClipSamplesPct,
        normalise_mode: opts.normalise_mode,
      },
      normalisationApplied,
      softClipped,
      reason: sampleModified ? "applied" as const : "below_normalise_threshold" as const,
    };
  })();
}

/**
 * Normalise + soft-clip an audio file for transcription.
 * Returns a new MP3 File and structured metadata.
 *
 * Decoding happens on the main thread (decodeAudioData isn't reliably
 * available in workers). Everything else — measurement, gain pass,
 * soft-clip, and MP3 encoding — runs in a Web Worker so long files
 * don't freeze the UI.
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

  const safeBase = sanitizeStorageFilename(file.name.replace(/\.[^.]+$/, "")).replace(/\.mp3$/i, "");
  const enhancedFileName = `${safeBase}_normalised.mp3`;
  const inputChannels: 1 | 2 = audioBuffer.numberOfChannels === 1 ? 1 : 2;

  onProgress?.("processing");

  // Try the worker path first. If it can't be constructed (very old browser
  // or strict CSP), fall back to the synchronous main-thread implementation
  // so we never silently drop the feature.
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    // Copy out so we own the buffers — transferring the AudioBuffer's
    // internal channel data isn't supported and would lose the AudioBuffer.
    channelData.push(new Float32Array(audioBuffer.getChannelData(ch)));
  }

  let mp3Blob: Blob;
  let measured: AudioEnhanceMeasured;
  let normalisationApplied: boolean;
  let softClipped: boolean;
  let reason: "applied" | "noise_gated" | "below_normalise_threshold";

  const workerPromise = runEnhanceInWorker(channelData, audioBuffer.sampleRate, opts);

  if (workerPromise) {
    onProgress?.("encoding");
    try {
      const r = await workerPromise;
      mp3Blob = new Blob([r.mp3], { type: "audio/mpeg" });
      measured = r.measured;
      normalisationApplied = r.normalisationApplied;
      softClipped = r.softClipped;
      reason = r.reason;
    } catch (workerErr) {
      console.warn("Audio enhance worker failed, retrying on main thread:", workerErr);
      const r = await runEnhanceOnMainThread(audioBuffer, opts);
      mp3Blob = r.mp3Blob;
      measured = r.measured;
      normalisationApplied = r.normalisationApplied;
      softClipped = r.softClipped;
      reason = r.reason;
    }
  } else {
    const r = await runEnhanceOnMainThread(audioBuffer, opts);
    mp3Blob = r.mp3Blob;
    measured = r.measured;
    normalisationApplied = r.normalisationApplied;
    softClipped = r.softClipped;
    reason = r.reason;
  }

  const sampleModified = softClipped || normalisationApplied;
  const isNoiseGated = reason === "noise_gated";

  return {
    file: new File([mp3Blob], enhancedFileName, { type: "audio/mpeg" }),
    metadata: {
      applied: !isNoiseGated && sampleModified,
      reason,
      input_channels: inputChannels,
      duration_ms: Math.round(performance.now() - t0),
      measured,
    },
  };
}

